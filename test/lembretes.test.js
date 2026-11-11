// Lembretes da semana: janelas, mensagens, ensaio, envio único por pessoa, falha de envio e a rota do agendador.
process.env.SGC_NOW = '2026-09-21T13:00:00'; // segunda-feira; a reunião é na terça 22/09/2026, 10h (Bahia)

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { instante } from '../public/js/datas.js';
import { comEmpresa } from '../server/empresa.js';
import { painelSemana } from '../server/helpers.js';
import { escolherTransporte, lembretesDoUsuario, montarMensagem, montarNotificacao, rodarLembretes, tipoDevido, transporteEnsaio } from '../server/lembretes.js';

const SEMANA = '2026-09-22';
const em = (dataHora) => instante(dataHora); // horário da Bahia

async function banco(t) {
  const db = openDb(':memory:');
  await seed(db);
  t.after(() => db.close());
  return db;
}
const pendentesDoPainel = async (db) => (await comEmpresa(1, () => painelSemana(db, SEMANA, '2026-09-21'))).filter((c) => c.secao.na_reuniao && !c.enviada);
const transporteFalso = (extra = {}) => {
  const enviados = [];
  return { nome: 'teste', real: true, exigeEmail: false, enviados, async enviar(m) { enviados.push(m); return 1; }, ...extra };
};

test('janelas: lembrete na sexta 15h, últimas horas na segunda 12h, fechamento às 18h, nada depois da reunião', () => {
  const tipo = (dh) => tipoDevido(SEMANA, '10:00', em(dh));
  assert.equal(tipo('2026-09-18T14:59:00'), null);
  assert.equal(tipo('2026-09-18T15:00:00'), 'lembrete');
  assert.equal(tipo('2026-09-21T11:59:00'), 'lembrete');
  assert.equal(tipo('2026-09-21T12:00:00'), 'ultimas_horas');
  assert.equal(tipo('2026-09-21T17:59:00'), 'ultimas_horas');
  assert.equal(tipo('2026-09-21T18:00:00'), 'fechamento');
  assert.equal(tipo('2026-09-22T09:59:00'), 'fechamento');
  assert.equal(tipo('2026-09-22T10:00:00'), null);
});

test('janelas: uma rotina que começa tarde manda só o lembrete mais recente, nunca dois', () => {
  // Segunda 13h, sem nada enviado antes: só "últimas horas" (não também o de sexta).
  assert.equal(tipoDevido(SEMANA, '10:00', em('2026-09-21T13:00:00')), 'ultimas_horas');
});

test('mensagens: dizem a unidade, o prazo e a reunião; o resumo do fechamento lista as unidades', () => {
  const base = { pessoa: 'Ana', unidade: 'Centro X (CX)', semana: SEMANA, dia: 2, hora: '10:00', origem: 'https://agilis.exemplo' };
  const lembrete = montarMensagem({ ...base, tipo: 'lembrete' });
  assert.match(lembrete.assunto, /lembrete/i);
  assert.match(lembrete.texto, /Ana/);
  assert.match(lembrete.texto, /Centro X \(CX\)/);
  assert.match(lembrete.texto, /segunda-feira, às 18h/);
  assert.match(lembrete.texto, /terça-feira, 22\/09\/2026, às 10:00/);
  assert.match(lembrete.texto, /https:\/\/agilis\.exemplo\/#\/atualizacao/);
  assert.match(montarMensagem({ ...base, tipo: 'ultimas_horas' }).assunto, /últimas horas/i);
  const fechamento = montarMensagem({ ...base, tipo: 'fechamento', pendentes: ['Centro A (A)', 'Centro B (B)'] });
  assert.match(fechamento.assunto, /2 unidades não enviaram/);
  assert.match(fechamento.texto, /- Centro A \(A\)\n- Centro B \(B\)/);
  assert.match(montarMensagem({ ...base, tipo: 'fechamento', pendentes: ['Centro A (A)'] }).assunto, /1 unidade não enviou/);
});

test('notificação: curta, com a unidade, o prazo e a tela que abre ao tocar', () => {
  const base = { unidade: 'Centro X (CX)', dia: 2 };
  const l = montarNotificacao({ ...base, tipo: 'lembrete' });
  assert.match(l.corpo, /Centro X \(CX\)/);
  assert.match(l.corpo, /segunda-feira, às 18h/);
  assert.equal(l.url, '/#/atualizacao');
  assert.match(montarNotificacao({ ...base, tipo: 'ultimas_horas' }).titulo, /últimas horas/i);
  const f = montarNotificacao({ tipo: 'fechamento', dia: 2, pendentes: ['A (A)', 'B (B)', 'C (C)', 'D (D)', 'E (E)'] });
  assert.match(f.titulo, /5 unidades não enviaram/);
  assert.match(f.corpo, /A \(A\), B \(B\), C \(C\) e mais 2/);
  assert.equal(f.url, '/#/painel');
  assert.equal(montarNotificacao({ tipo: 'fechamento', dia: 2, pendentes: ['A (A)'] }).titulo, '1 unidade não enviou a atualização');
  for (const n of [l, f]) assert.ok(JSON.stringify(n).length < 400, 'cabe com folga no limite de uma notificação');
});

test('canal: sem configuração vale o ensaio; push exige as chaves VAPID e o banco; outros canais não existem', () => {
  assert.equal(escolherTransporte({}), transporteEnsaio);
  assert.equal(escolherTransporte({ SGC_LEMBRETES_CANAL: 'ensaio' }), transporteEnsaio);
  assert.throws(() => escolherTransporte({ SGC_LEMBRETES_CANAL: 'push' }, {}), /SGC_VAPID_PUBLIC_KEY/);
  const env = { SGC_LEMBRETES_CANAL: 'push', SGC_VAPID_PUBLIC_KEY: 'pub', SGC_VAPID_PRIVATE_KEY: 'priv', SGC_VAPID_SUBJECT: 'mailto:a@b.gov.br' };
  assert.throws(() => escolherTransporte(env), /precisa do banco/);
  const canal = escolherTransporte(env, {});
  assert.equal(canal.nome, 'push');
  assert.equal(canal.real, true);
  assert.equal(canal.exigeEmail, false);
  assert.throws(() => escolherTransporte({ SGC_LEMBRETES_CANAL: 'email' }), /não disponível/);
});

test('ensaio: lista quem receberia (chefes das unidades sem relato) e não grava nem envia nada', async (t) => {
  const db = await banco(t);
  const pendentes = await pendentesDoPainel(db);
  assert.ok(pendentes.length > 0, 'o cenário tem unidades sem relato');
  const falso = transporteFalso();
  const [r] = await rodarLembretes(db, { transporte: falso, ensaio: true, agoraInstante: em('2026-09-21T13:00:00') });
  assert.equal(r.tipo, 'ultimas_horas');
  assert.equal(r.modo, 'ensaio');
  assert.equal(r.semana, SEMANA);
  const ids = r.destinatarios.map((d) => d.usuario_id);
  const esperados = (await db.prepare("select id from usuarios where perfil in ('chefe','administrador') and ativo = 1 and secao_id in (" + pendentes.map((c) => c.secao.id).join(',') + ')').all()).map((u) => u.id);
  assert.deepEqual(ids.sort((a, b) => a - b), esperados.sort((a, b) => a - b));
  assert.equal(falso.enviados.length, 0, 'ensaio não envia');
  assert.equal((await db.prepare('select count(*) n from lembretes_enviados').get()).n, 0, 'ensaio não grava');
});

test('envio: cada pessoa recebe uma vez; a segunda rodada não repete', async (t) => {
  const db = await banco(t);
  const falso = transporteFalso();
  const agoraInstante = em('2026-09-21T13:00:00');
  const [a] = await rodarLembretes(db, { transporte: falso, agoraInstante, origem: 'https://agilis.exemplo' });
  assert.ok(a.enviados > 0);
  assert.equal(a.enviados, falso.enviados.length);
  assert.equal(a.jaEnviados, 0);
  assert.ok(falso.enviados.every((m) => /últimas horas/i.test(m.titulo) && m.url === '/#/atualizacao' && typeof m.usuario === 'number'));
  const [b] = await rodarLembretes(db, { transporte: falso, agoraInstante });
  assert.equal(b.enviados, 0);
  assert.equal(b.jaEnviados, a.enviados);
  assert.equal(falso.enviados.length, a.enviados, 'nada novo foi enviado');
  assert.equal((await db.prepare('select count(*) n from lembretes_enviados').get()).n, a.enviados);
});

test('quem já enviou a atualização não é lembrado', async (t) => {
  const db = await banco(t);
  const enviou = (await comEmpresa(1, () => painelSemana(db, SEMANA, '2026-09-21'))).filter((c) => c.enviada).map((c) => c.secao.id);
  assert.ok(enviou.length > 0);
  const [r] = await rodarLembretes(db, { transporte: transporteFalso(), ensaio: true, agoraInstante: em('2026-09-21T13:00:00') });
  const alvos = new Set((await db.prepare('select id, secao_id from usuarios').all()).filter((u) => r.destinatarios.some((d) => d.usuario_id === u.id)).map((u) => u.secao_id));
  for (const id of enviou) assert.ok(!alvos.has(id), `a seção ${id} já enviou e não deve receber lembrete`);
});

test('falha de envio: libera o registro para a próxima rodada tentar de novo', async (t) => {
  const db = await banco(t);
  const agoraInstante = em('2026-09-21T13:00:00');
  const quebrado = transporteFalso({ async enviar() { throw new Error('provedor fora do ar'); } });
  const erros = t.mock.method(console, 'error', () => {});
  const [r] = await rodarLembretes(db, { transporte: quebrado, agoraInstante });
  assert.equal(r.enviados, 0);
  assert.ok(r.falhas > 0);
  assert.ok(erros.mock.callCount() > 0, 'a falha foi registrada');
  assert.equal((await db.prepare('select count(*) n from lembretes_enviados').get()).n, 0, 'nada fica marcado como enviado');
  const bom = transporteFalso();
  const [outra] = await rodarLembretes(db, { transporte: bom, agoraInstante });
  assert.equal(outra.enviados, r.falhas);
});

test('sem aparelho: quem não ativou os avisos não fica marcado como enviado e recebe quando ativar', async (t) => {
  const db = await banco(t);
  const agoraInstante = em('2026-09-21T13:00:00');
  const sem = transporteFalso({ async enviar() { return 0; } });
  const [a] = await rodarLembretes(db, { transporte: sem, agoraInstante });
  assert.equal(a.enviados, 0);
  assert.ok(a.semAparelho > 0);
  assert.equal(a.falhas, 0);
  assert.equal((await db.prepare('select count(*) n from lembretes_enviados').get()).n, 0, 'nada marcado: a pessoa ainda pode ativar');
  const com = transporteFalso();
  const [b] = await rodarLembretes(db, { transporte: com, agoraInstante });
  assert.equal(b.enviados, a.semAparelho, 'depois de ativar, o aviso chega');
});

test('fechamento: o resumo vai só ao Diretor, com as unidades pendentes', async (t) => {
  const db = await banco(t);
  const falso = transporteFalso();
  const [r] = await rodarLembretes(db, { transporte: falso, agoraInstante: em('2026-09-21T18:30:00') });
  assert.equal(r.tipo, 'fechamento');
  assert.deepEqual(r.destinatarios.map((d) => d.perfil), ['diretor']);
  assert.equal(falso.enviados.length, 1);
  const pendentes = await pendentesDoPainel(db);
  assert.match(falso.enviados[0].titulo, new RegExp(`${pendentes.length} unidades? não enviaram?`));
  for (const c of pendentes.slice(0, 3)) assert.ok(falso.enviados[0].corpo.includes(c.secao.nome));
});

test('depois da reunião e antes do lembrete não há envio', async (t) => {
  const db = await banco(t);
  for (const quando of ['2026-09-22T10:30:00', '2026-09-17T12:00:00']) {
    const falso = transporteFalso();
    const [r] = await rodarLembretes(db, { transporte: falso, agoraInstante: em(quando) });
    assert.equal(r.tipo, null, quando);
    assert.equal(falso.enviados.length, 0, quando);
  }
});

test('rota do agendador: sem segredo não existe; segredo errado é recusado; certo roda em ensaio sem devolver e-mails', async (t) => {
  const db = await banco(t);
  const server = createApp(db, { auth: { mode: 'demo' } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((ok) => server.close(ok)));
  const base = `http://127.0.0.1:${server.address().port}/api/interno/lembretes`;
  const antes = { a: process.env.SGC_CRON_SECRET, b: process.env.CRON_SECRET };
  t.after(() => { for (const [k, v] of [['SGC_CRON_SECRET', antes.a], ['CRON_SECRET', antes.b]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

  delete process.env.SGC_CRON_SECRET; delete process.env.CRON_SECRET;
  assert.equal((await fetch(base)).status, 404, 'sem segredo configurado a rota não existe');

  process.env.SGC_CRON_SECRET = 'segredo-de-teste-123';
  assert.equal((await fetch(base)).status, 401);
  assert.equal((await fetch(base, { headers: { authorization: 'Bearer errado' } })).status, 401);

  const r = await fetch(`${base}?ensaio=1`, { headers: { authorization: 'Bearer segredo-de-teste-123' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const corpo = await r.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.empresas[0].modo, 'ensaio');
  assert.ok(corpo.empresas[0].destinatarios.length > 0);
  assert.doesNotMatch(JSON.stringify(corpo), /@/, 'a resposta não traz e-mails');
  assert.equal((await db.prepare('select count(*) n from lembretes_enviados').get()).n, 0);

  process.env.CRON_SECRET = 'outro-segredo-4567'; delete process.env.SGC_CRON_SECRET; // a Vercel envia CRON_SECRET sozinha
  assert.equal((await fetch(`${base}?ensaio=1`, { method: 'POST', headers: { authorization: 'Bearer outro-segredo-4567' } })).status, 200);
});

test('com o app aberto: a pessoa recebe o lembrete da hora uma só vez e só o dela', async (t) => {
  const db = await banco(t);
  const agoraInstante = em('2026-09-21T13:00:00');
  const [pendente] = await pendentesDoPainel(db);
  const chefe = await db.prepare("select id from usuarios where perfil = 'chefe' and secao_id = ? and empresa_id = 1").get(pendente.secao.id);
  const a = await comEmpresa(1, () => lembretesDoUsuario(db, chefe.id, { agoraInstante }));
  assert.equal(a.length, 1);
  assert.match(a[0].titulo, /últimas horas/i);
  assert.equal(a[0].url, '/#/atualizacao');
  const b = await comEmpresa(1, () => lembretesDoUsuario(db, chefe.id, { agoraInstante }));
  assert.equal(b.length, 0, 'a segunda pergunta não repete');
  assert.equal((await db.prepare('select count(*) n from lembretes_enviados').get()).n, 1, 'só o dele foi marcado');
});
