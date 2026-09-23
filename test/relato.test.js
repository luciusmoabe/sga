// Relato semanal montado a partir das ações: janelas, fuso da Bahia, privacidade, cópia congelada e envio.
process.env.SGC_NOW = '2026-09-21T10:00:00'; // segunda-feira; a reunião é na terça 22/09/2026

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { janelasDoRelato, montarRelato, segundaDe } from '../server/relato.js';

const DIRETOR = 1, ADMIN = 10, CHEFE_CPE = 3;
const SEMANA = '2026-09-22';

test('janelas: concluídas da segunda anterior à véspera; atrasadas antes de hoje; programadas de hoje ao domingo', () => {
  assert.equal(segundaDe('2026-09-22'), '2026-09-21');
  assert.equal(segundaDe('2026-09-27'), '2026-09-21', 'domingo pertence à semana que começou na segunda');
  assert.equal(segundaDe('2026-09-21'), '2026-09-21');
  // Reunião na terça 22/09, vista na segunda 21/09
  assert.deepEqual(janelasDoRelato('2026-09-22', '2026-09-21'), {
    concluidas: { de: '2026-09-14', ate: '2026-09-21' }, programadas: { de: '2026-09-21', ate: '2026-09-27' }, atrasadas: { antes: '2026-09-21' },
  });
  // Reunião na quarta 30/09, vista na quarta 23/09 (o caso do Departamento)
  assert.deepEqual(janelasDoRelato('2026-09-30', '2026-09-23'), {
    concluidas: { de: '2026-09-21', ate: '2026-09-29' }, programadas: { de: '2026-09-23', ate: '2026-10-04' }, atrasadas: { antes: '2026-09-23' },
  });
});

async function montar(t) {
  const db = openDb(':memory:');
  await seed(db);
  const server = createApp(db, { auth: { mode: 'demo' } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((ok) => server.close(ok)); await db.close(); });
  const call = async (uid, method, caminho, body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api${caminho}`, {
      method, headers: { 'x-user-id': String(uid), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  const nova = async (secao, titulo, { prazo, status = 'em_andamento', concluida = null, arquivada = 0, encerrada = 0, interna = 0 }) =>
    (await db.prepare(`insert into acoes (secao_id, titulo, status, prazo, prazo_original, prioridade, interna, encerrada, arquivada, concluida_em, criada_em, criado_por)
      values (?,?,?,?,?, 'media', ?,?,?,?, '2026-09-01T09:00:00', ?)`).run(secao, titulo, status, prazo, prazo, interna, encerrada, arquivada, concluida, CHEFE_CPE)).lastInsertRowid;
  return { db, call, nova };
}

test('o relato traz as concluídas, atrasadas e programadas nas janelas certas, no fuso da Bahia', async (t) => {
  const { call, nova } = await montar(t);
  // Concluídas (o instante é UTC; o dia que vale é o da Bahia, UTC-3)
  await nova(1, 'R-conc-inicio', { prazo: '2026-09-14', status: 'concluida', concluida: '2026-09-14T15:00:00.000Z' });
  await nova(1, 'R-conc-antes', { prazo: '2026-09-13', status: 'concluida', concluida: '2026-09-13T20:00:00.000Z' });
  await nova(1, 'R-conc-vespera-noite', { prazo: '2026-09-21', status: 'concluida', concluida: '2026-09-22T01:30:00.000Z' }); // 21/09 22h30 na Bahia
  await nova(1, 'R-conc-dia-reuniao', { prazo: '2026-09-22', status: 'concluida', concluida: '2026-09-22T03:30:00.000Z' }); // 22/09 00h30 na Bahia
  await nova(1, 'R-conc-arquivada', { prazo: '2026-09-16', status: 'concluida', concluida: '2026-09-16T15:00:00.000Z', arquivada: 1 });
  await nova(7, 'R-conc-subsecao', { prazo: '2026-09-17', status: 'concluida', concluida: '2026-09-17T15:00:00.000Z' });
  // Atrasadas e programadas
  await nova(1, 'R-atrasada', { prazo: '2026-09-15' });
  await nova(1, 'R-atrasada-vespera', { prazo: '2026-09-21' });
  await nova(1, 'R-prog-dia-reuniao', { prazo: '2026-09-22', status: 'a_fazer' });
  await nova(1, 'R-prog-domingo', { prazo: '2026-09-27' });
  await nova(1, 'R-fora-segunda', { prazo: '2026-09-28' });
  await nova(1, 'R-aberta-arquivada', { prazo: '2026-09-15', arquivada: 1 });

  const { status, data } = await call(CHEFE_CPE, 'GET', `/atualizacao?semana=${SEMANA}`);
  assert.equal(status, 200);
  const titulos = (bloco) => data.relato[bloco].map((a) => a.titulo).filter((x) => x.startsWith('R-'));
  assert.deepEqual(titulos('concluidas'), ['R-conc-inicio', 'R-conc-arquivada', 'R-conc-subsecao', 'R-conc-vespera-noite']);
  // Hoje é 21/09: só o que venceu antes de hoje é atrasado; o prazo de hoje ainda é programado.
  assert.deepEqual(titulos('atrasadas'), ['R-atrasada']);
  assert.deepEqual(titulos('programadas'), ['R-atrasada-vespera', 'R-prog-dia-reuniao', 'R-prog-domingo']);
  assert.deepEqual(data.relato.janelas.concluidas, { de: '2026-09-14', ate: '2026-09-21' });
  assert.equal(data.desatualizada, null, 'ainda não foi enviado');
  // A subseção só aparece porque o chefe do Centro enxerga a árvore inteira.
  assert.equal(data.relato.concluidas.find((a) => a.titulo === 'R-conc-subsecao').secao_sigla, 'IND');
});

test('enviar congela uma cópia sem ações internas, deriva os campos antigos e avisa quando o relato muda', async (t) => {
  const { db, call, nova } = await montar(t);
  await nova(1, 'S-publica', { prazo: '2026-09-15' });
  await nova(1, 'S-conc', { prazo: '2026-09-16', status: 'concluida', concluida: '2026-09-16T15:00:00.000Z' });
  const interna = await nova(7, 'S-interna-secreta', { prazo: '2026-09-15', interna: 1 });
  await call(CHEFE_CPE, 'POST', `/acoes/${interna}/impedimentos`, { descricao: 'Segredo interno', apoio: 'Apoio secreto', critico: true });
  const publica = (await db.prepare("select id from acoes where titulo = 'S-publica'").get()).id;
  await call(CHEFE_CPE, 'POST', `/acoes/${publica}/impedimentos`, { descricao: 'Sem verba', apoio: 'Liberar recurso' });

  const envio = await call(CHEFE_CPE, 'PUT', '/atualizacao', { semana: SEMANA, observacoes: 'Semana corrida' });
  assert.equal(envio.status, 200);
  const primeira = envio.data.versao; // a demonstração já pode ter relatos da semana
  assert.ok(primeira >= 1);
  const snap = envio.data.feito.snapshot;
  assert.equal(snap.formato, 2);
  assert.equal(snap.observacoes, 'Semana corrida');
  assert.ok(snap.atrasadas.some((a) => a.titulo === 'S-publica'));
  assert.ok(snap.concluidas.some((a) => a.titulo === 'S-conc'));
  assert.equal(snap.impedimentos.length >= 1, true);
  const texto = JSON.stringify(envio.data);
  assert.ok(!texto.includes('S-interna-secreta') && !texto.includes('Segredo interno') && !texto.includes('Apoio secreto'), 'ação interna não vaza na cópia');
  assert.ok(snap.internas.atrasadas >= 1 && snap.internas.impedimentos === 1, 'o interno vira contagem');
  // Campos antigos derivados, para as telas que ainda leem listas de texto
  assert.ok(envio.data.feito.extras.includes('S-conc'));
  assert.ok(envio.data.proximo.every((x) => typeof x === 'string'));
  assert.ok(envio.data.impedimentos.includes('S-publica: Sem verba'));
  assert.match(envio.data.apoio, /S-publica: Liberar recurso/);
  assert.equal(envio.data.critico, false, 'a marca crítica agora vem dos impedimentos das ações');

  // O Diretor lê o relato sem nada interno; o Administrador também recebe só a cópia (as internas são contagem).
  for (const uid of [DIRETOR, ADMIN]) {
    const detalhe = await call(uid, 'GET', `/secoes/1/detalhe?semana=${SEMANA}`);
    assert.equal(detalhe.status, 200);
    const bruto = JSON.stringify(detalhe.data.historico);
    assert.ok(bruto.includes('S-publica'));
    assert.ok(!bruto.includes('Segredo interno') && !bruto.includes('Apoio secreto'));
  }

  // Logo depois de enviar, nada mudou; depois de concluir a ação, o chefe é avisado.
  const logo = await call(CHEFE_CPE, 'GET', `/atualizacao?semana=${SEMANA}`);
  assert.equal(logo.data.desatualizada, false);
  await call(CHEFE_CPE, 'PATCH', `/acoes/${publica}`, { status: 'concluida' }); // sem tempo: 422, nada muda
  await call(CHEFE_CPE, 'POST', `/acoes/${publica}/tempo`, { minutos: 20 });
  await call(CHEFE_CPE, 'PATCH', `/acoes/${publica}`, { status: 'concluida' });
  const depois = await call(CHEFE_CPE, 'GET', `/atualizacao?semana=${SEMANA}`);
  assert.equal(depois.data.desatualizada, true);
  const v2 = await call(CHEFE_CPE, 'PUT', '/atualizacao', { semana: SEMANA });
  assert.equal(v2.data.versao, primeira + 1, 'reenviar cria nova versão e o histórico é mantido');
  assert.equal((await db.prepare('select count(*) n from atualizacoes where secao_id = 1 and semana = ?').get(SEMANA)).n, primeira + 1);
  assert.equal((await call(CHEFE_CPE, 'GET', `/atualizacao?semana=${SEMANA}`)).data.desatualizada, false);
});

test('o painel passa a mostrar a seção como enviada; sem nada a relatar, o envio é recusado', async (t) => {
  const { db, call } = await montar(t);
  const itens = (await call(DIRETOR, 'GET', `/painel?semana=${SEMANA}`)).data.itens;
  const pendente = itens.find((i) => !i.enviada && i.secao.id !== 1);
  assert.ok(pendente, 'a demonstração tem um Centro com atualização pendente');
  const chefe = (await db.prepare('select id from usuarios where secao_id = ? and perfil = ?').get(pendente.secao.id, 'chefe')).id;
  await call(ADMIN, 'POST', `/acoes`, { titulo: 'Item para relatar', prazo: '2026-09-25', secao_id: pendente.secao.id });
  assert.equal((await call(chefe, 'PUT', '/atualizacao', { semana: SEMANA })).status, 200);
  const depois = (await call(DIRETOR, 'GET', `/painel?semana=${SEMANA}`)).data.itens.find((i) => i.secao.id === pendente.secao.id);
  assert.equal(depois.enviada, true);

  // Seção vazia (o Administrador escolhe a seção): sem ações, só as observações valem.
  const vazia = (await db.prepare(`insert into secoes (nome, sigla, tipo, ordem, criada_em) values ('Centro Vazio', 'CVZ', 'centro', 99, '2026-09-01T09:00:00')`).run()).lastInsertRowid;
  const recusa = await call(ADMIN, 'PUT', '/atualizacao', { semana: SEMANA, secao_id: vazia });
  assert.equal(recusa.status, 400);
  assert.match(recusa.data.erro, /observações/);
  assert.equal((await call(ADMIN, 'PUT', '/atualizacao', { semana: SEMANA, secao_id: vazia, observacoes: 'Sem demandas nesta semana.' })).status, 200);
  // Sem informar a seção, o Administrador continua sendo orientado.
  assert.equal((await call(ADMIN, 'PUT', '/atualizacao', { semana: SEMANA })).status, 400);
});

test('o formato antigo (listas de texto) continua aceito', async (t) => {
  const { call } = await montar(t);
  const r = await call(CHEFE_CPE, 'PUT', '/atualizacao', { semana: SEMANA, feito: { previstos: [], extras: ['Entrega antiga'] }, proximo: ['Próximo'], impedimentos: [], apoio: '' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.feito.extras, ['Entrega antiga']);
  assert.equal(r.data.feito.snapshot, undefined);
  assert.equal((await call(CHEFE_CPE, 'GET', `/atualizacao?semana=${SEMANA}`)).data.desatualizada, null, 'sem cópia, não há como comparar');
});

test('cartões da reunião, pauta e ata trazem os impedimentos abertos sem expor os internos', async (t) => {
  const { call, nova } = await montar(t);
  const publica = await nova(1, 'V-publica', { prazo: '2026-09-30' });
  const interna = await nova(7, 'V-interna', { prazo: '2026-09-30', interna: 1 });
  await call(CHEFE_CPE, 'POST', `/acoes/${publica}/impedimentos`, { descricao: 'Contrato parado', apoio: 'Destravar na Procuradoria', critico: true });
  await call(CHEFE_CPE, 'POST', `/acoes/${publica}/impedimentos`, { descricao: 'Falta de sala' });
  await call(CHEFE_CPE, 'POST', `/acoes/${interna}/impedimentos`, { descricao: 'Segredo do time', apoio: 'Apoio interno', critico: true });

  const reuniao = (await call(DIRETOR, 'POST', '/reunioes/iniciar', {})).data.reuniao;
  const cartoes = (await call(DIRETOR, 'GET', `/reunioes/${reuniao.id}/cartoes`)).data.cartoes;
  const cpe = cartoes.find((c) => c.secao.id === 1);
  assert.deepEqual(cpe.impedimentos.map((i) => [i.acao_titulo, i.descricao, i.critico]),
    [['V-publica', 'Contrato parado', true], ['V-publica', 'Falta de sala', false]], 'críticos primeiro, sem o interno');
  assert.equal(cpe.impedimentos[0].apoio, 'Destravar na Procuradoria');
  assert.ok(cartoes.every((c) => Array.isArray(c.impedimentos)));

  const pauta = (await call(DIRETOR, 'GET', `/pauta?semana=${SEMANA}`)).data.cartoes.find((c) => c.secao.id === 1);
  assert.equal(pauta.impedimentos.length, 2);
  assert.ok(!JSON.stringify(cartoes).includes('Segredo do time') && !JSON.stringify(pauta).includes('Apoio interno'));

  // Impedimento resolvido sai do quadro
  const aberto = (await call(CHEFE_CPE, 'GET', `/acoes/${publica}`)).data.impedimentos.find((i) => i.descricao === 'Falta de sala');
  await call(CHEFE_CPE, 'POST', `/acoes/${publica}/impedimentos/${aberto.id}/resolver`, {});
  const depois = (await call(DIRETOR, 'GET', `/reunioes/${reuniao.id}/cartoes`)).data.cartoes.find((c) => c.secao.id === 1);
  assert.deepEqual(depois.impedimentos.map((i) => i.descricao), ['Contrato parado']);

  // A ata registra os críticos em aberto, só os visíveis ao Diretor
  const ata = (await call(DIRETOR, 'POST', `/reunioes/${reuniao.id}/encerrar`, {})).data.ata_texto;
  assert.match(ata, /Impedimentos críticos em aberto:/);
  assert.match(ata, /\[CPE\] "V-publica": Contrato parado \(apoio solicitado: Destravar na Procuradoria\)/);
  assert.ok(!ata.includes('Segredo do time') && !ata.includes('Falta de sala'));
});

test('a ata não cria a seção de impedimentos críticos quando não há nenhum', async (t) => {
  const { db, call } = await montar(t);
  await db.exec('delete from impedimentos');
  const reuniao = (await call(DIRETOR, 'POST', '/reunioes/iniciar', {})).data.reuniao;
  const ata = (await call(DIRETOR, 'POST', `/reunioes/${reuniao.id}/encerrar`, {})).data.ata_texto;
  assert.ok(!ata.includes('Impedimentos críticos em aberto'));
});

test('atrasada é a que venceu antes de hoje, não antes da reunião; o prazo entre hoje e a reunião é programado', async (t) => {
  const { db, nova } = await montar(t);
  await nova(1, 'T-prazo-25', { prazo: '2026-09-25', status: 'a_fazer' });
  const em = async (hoje) => {
    const rel = await montarRelato(db, 1, '2026-09-30', hoje); // reunião na quarta 30/09
    const noBloco = (bloco) => rel[bloco].some((a) => a.titulo === 'T-prazo-25');
    return { atrasada: noBloco('atrasadas'), programada: noBloco('programadas') };
  };
  assert.deepEqual(await em('2026-09-23'), { atrasada: false, programada: true }, 'ainda não venceu: aparece em "será feito"');
  assert.deepEqual(await em('2026-09-25'), { atrasada: false, programada: true }, 'no dia do prazo ainda não está atrasada');
  assert.deepEqual(await em('2026-09-26'), { atrasada: true, programada: false }, 'venceu ontem');
  assert.deepEqual(await em('2026-09-29'), { atrasada: true, programada: false }, 'ao enviar, na véspera da reunião');
});
