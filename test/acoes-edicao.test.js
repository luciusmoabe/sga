// Edição e exclusão de ações pelo autor: o chefe ou suplente, as que ele mesmo criou; o Diretor e o Diretor Adjunto,
// as que direcionaram. O Diretor Adjunto não direciona ações para a própria seção.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { definirSecaoAdministrador } from '../server/criar-administrador.js';

// Usuários e seções do banco de demonstração (server/seed.js).
const DIRETOR = 1, APOIO = 2, ANA_CPE = 3, BRUNO_COF = 4, ADMIN = 10;
const CPE = 1, COF = 2;
const PRAZO = '2026-12-31';

async function demo(t) {
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
  // Suplente do CPE: segundo chefe com a mesma seção, sem ser o titular (secoes.chefe_id).
  const SUPLENTE = (await db.prepare("insert into usuarios (nome, email, perfil, secao_id) values ('Suplente do CPE', 'sup@orgao.gov.br', 'chefe', ?)").run(CPE)).lastInsertRowid;
  const nova = async (uid, titulo, extra = {}) => (await call(uid, 'POST', '/acoes', { titulo, prazo: PRAZO, ...extra })).data.id;
  return { db, call, SUPLENTE, nova };
}

test('o chefe edita e exclui as que criou e as do suplente; o suplente, só as dele', async (t) => {
  const { db, call, SUPLENTE, nova } = await demo(t);
  const daAna = await nova(ANA_CPE, 'Da titular');
  const doSuplente = await nova(SUPLENTE, 'Do suplente');

  const r = await call(ANA_CPE, 'PATCH', `/acoes/${daAna}`, { titulo: 'Da titular, revista', detalhe: 'Novo texto', prazo: '2026-11-30' });
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.titulo, r.data.detalhe, r.data.prazo, r.data.prazo_original], ['Da titular, revista', 'Novo texto', '2026-11-30', PRAZO]);
  const det = (await call(ANA_CPE, 'GET', `/acoes/${daAna}`)).data;
  assert.ok(det.comentarios.some((c) => c.texto === 'Ação editada: título, detalhamento, prazo (de 31/12/2026 para 30/11/2026).'));
  assert.equal(det.pode_editar, true);

  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${daAna}`, { titulo: '  ' })).status, 400);
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${daAna}`, { prazo: '2026-09-01' })).status, 400, 'prazo no passado');
  const semMudanca = (await db.prepare('select count(*) n from acao_comentarios where acao_id = ?').get(daAna)).n;
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${daAna}`, { titulo: 'Da titular, revista' })).status, 200);
  assert.equal((await db.prepare('select count(*) n from acao_comentarios where acao_id = ?').get(daAna)).n, semMudanca, 'sem mudança, sem comentário');

  // O suplente não mexe na ação da titular; a titular, sim, na do suplente. Status e tempo continuam com a seção.
  const negado = await call(SUPLENTE, 'PATCH', `/acoes/${daAna}`, { titulo: 'Mudei' });
  assert.equal(negado.status, 403);
  assert.match(negado.data.erro, /Só quem criou/);
  assert.equal((await call(SUPLENTE, 'DELETE', `/acoes/${daAna}`)).status, 403);
  assert.equal((await call(SUPLENTE, 'PATCH', `/acoes/${daAna}`, { status: 'em_andamento' })).status, 200);
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${doSuplente}`, { prazo: '2026-11-01' })).status, 200);
  const doSuplenteVisto = (await call(SUPLENTE, 'GET', '/acoes')).data;
  assert.equal(doSuplenteVisto.find((a) => a.id === daAna).pode_editar, false);
  assert.equal(doSuplenteVisto.find((a) => a.id === doSuplente).pode_editar, true);
  assert.equal((await call(ANA_CPE, 'GET', '/acoes')).data.find((a) => a.id === doSuplente).pode_editar, true);

  // Outro chefe titular (de outra seção) não alcança o suplente do CPE: nem enxerga a ação.
  assert.equal((await call(BRUNO_COF, 'PATCH', `/acoes/${doSuplente}`, { titulo: 'x' })).status, 404);

  assert.equal((await call(ANA_CPE, 'DELETE', `/acoes/${doSuplente}`)).status, 200);
  assert.equal((await call(ANA_CPE, 'DELETE', `/acoes/${daAna}`)).status, 200);
});

test('ação concluída não é excluída por ninguém; o histórico de prazos guarda cada mudança', async (t) => {
  const { db, call, nova } = await demo(t);
  const propria = await nova(ANA_CPE, 'Vai concluir');
  await call(ANA_CPE, 'PATCH', `/acoes/${propria}`, { status: 'em_andamento' });
  await call(ANA_CPE, 'POST', `/acoes/${propria}/tempo`, { minutos: 15 });
  await call(ANA_CPE, 'PATCH', `/acoes/${propria}`, { status: 'concluida' });
  for (const uid of [ANA_CPE, ADMIN]) {
    const r = await call(uid, 'DELETE', `/acoes/${propria}`);
    assert.equal(r.status, 409, `perfil ${uid}`);
    assert.match(r.data.erro, /concluída não pode ser excluída/);
  }
  // O Diretor também não exclui a concluída que ele mesmo direcionou.
  const doDiretor = await nova(DIRETOR, 'Do Diretor, concluída', { secao_id: CPE });
  await call(ANA_CPE, 'PATCH', `/acoes/${doDiretor}`, { status: 'em_andamento' });
  await call(ANA_CPE, 'POST', `/acoes/${doDiretor}/tempo`, { minutos: 5 });
  await call(ANA_CPE, 'PATCH', `/acoes/${doDiretor}`, { status: 'concluida' });
  assert.equal((await call(DIRETOR, 'DELETE', `/acoes/${doDiretor}`)).status, 409);
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${propria}`, { prazo: '2027-01-10' })).status, 409, 'concluída não muda prazo');
  assert.equal((await call(ANA_CPE, 'GET', `/acoes/${propria}`)).data.pode_excluir, false);

  // Edição direta pelo autor e pedido aprovado pelo Diretor entram no mesmo histórico, em ordem.
  const demanda = await nova(DIRETOR, 'Demanda', { secao_id: CPE });
  await call(DIRETOR, 'PATCH', `/acoes/${demanda}`, { prazo: '2026-11-15' });
  await call(ANA_CPE, 'POST', `/acoes/${demanda}/pedido-prazo`, { novo_prazo: '2026-12-20', justificativa: 'Depende de outro setor' });
  const pedido = await db.prepare("select id from pedidos_prazo where acao_id = ? and status = 'pendente'").get(demanda);
  assert.equal((await call(ADMIN, 'POST', `/pedidos-prazo/${pedido.id}/decidir`, { aprovar: true })).status, 200, 'o Diretor Adjunto decide');
  const det = (await call(DIRETOR, 'GET', `/acoes/${demanda}`)).data;
  assert.deepEqual(det.prazos.map((h) => [h.prazo_anterior, h.prazo_novo, h.origem]),
    [[PRAZO, '2026-11-15', 'edicao'], ['2026-11-15', '2026-12-20', 'pedido']]);
  assert.equal(det.prazos[1].pedido_id, pedido.id);
  assert.equal(det.prazo_original, PRAZO);
});

test('ação apresentada em reunião: só o prazo muda, e ela não é excluída', async (t) => {
  const { call, nova } = await demo(t);
  const propria = await nova(ANA_CPE, 'Apresentada');
  const depois = { id: null };

  const ini = await call(DIRETOR, 'POST', '/reunioes/iniciar');
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${propria}`, { titulo: 'Durante a reunião' })).status, 200, 'antes de encerrar, ainda edita');
  assert.equal((await call(DIRETOR, 'POST', `/reunioes/${ini.data.reuniao.id}/encerrar`)).status, 200);
  depois.id = await nova(ANA_CPE, 'Criada depois da reunião');

  const det = (await call(ANA_CPE, 'GET', `/acoes/${propria}`)).data;
  assert.equal(det.apresentada, true);
  assert.deepEqual([det.pode_editar, det.pode_mudar_prazo, det.pode_excluir], [false, true, false]);
  const titulo = await call(ANA_CPE, 'PATCH', `/acoes/${propria}`, { titulo: 'Outro título' });
  assert.equal(titulo.status, 409);
  assert.match(titulo.data.erro, /apresentada em reunião/);
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${propria}`, { detalhe: 'Outro texto' })).status, 409);
  assert.equal((await call(ANA_CPE, 'DELETE', `/acoes/${propria}`)).status, 409);
  assert.equal((await call(ADMIN, 'DELETE', `/acoes/${propria}`)).status, 409, 'nem o Administrador');
  const prazo = await call(ANA_CPE, 'PATCH', `/acoes/${propria}`, { prazo: '2026-11-30' });
  assert.equal(prazo.status, 200);
  assert.equal(prazo.data.prazo, '2026-11-30');
  assert.deepEqual((await call(ANA_CPE, 'GET', `/acoes/${propria}`)).data.prazos.map((h) => h.prazo_anterior), [PRAZO]);

  // A ação criada depois da reunião continua livre até a próxima.
  assert.equal((await call(ANA_CPE, 'GET', `/acoes/${depois.id}`)).data.apresentada, false);
  assert.equal((await call(ANA_CPE, 'DELETE', `/acoes/${depois.id}`)).status, 200);
});

test('o chefe não edita nem exclui o que o Diretor direcionou, mas executa', async (t) => {
  const { db, call, nova } = await demo(t);
  const d = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Demanda do Diretor', prazo: PRAZO, destino: 'especificos', secoes: [CPE, COF] });
  const [demanda] = await db.prepare('select id from acoes where diretriz_id = ? and secao_id = ?').all(d.data.id, CPE);
  const direta = await nova(DIRETOR, 'Direta do Diretor', { secao_id: CPE });

  for (const id of [demanda.id, direta]) {
    assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { titulo: 'x' })).status, 403);
    assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { prazo: '2027-01-31' })).status, 403, 'prazo continua por pedido');
    assert.equal((await call(ANA_CPE, 'DELETE', `/acoes/${id}`)).status, 403);
    assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { status: 'em_andamento', prioridade: 'alta' })).status, 200);
  }
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${direta}/pedido-prazo`, { novo_prazo: '2027-01-31', justificativa: 'Prazo curto' })).status, 201);
});

test('o Diretor edita e exclui o que a gestão direcionou, não o que o chefe criou', async (t) => {
  const { db, call, nova } = await demo(t);
  const d = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Demanda', prazo: PRAZO, destino: 'especificos', secoes: [CPE] });
  const [demanda] = await db.prepare('select id from acoes where diretriz_id = ?').all(d.data.id);
  const r = await call(DIRETOR, 'PATCH', `/acoes/${demanda.id}`, { titulo: 'Demanda ajustada', prazo: '2026-10-15', prioridade: 'alta' });
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.titulo, r.data.prazo, r.data.prioridade], ['Demanda ajustada', '2026-10-15', 'alta']);

  // O que o Diretor Adjunto direcionou, o Diretor também edita (gestão), e vice-versa pelo acesso total.
  const doAdjunto = await nova(ADMIN, 'Do Diretor Adjunto', { secao_id: COF });
  assert.equal((await call(DIRETOR, 'PATCH', `/acoes/${doAdjunto}`, { detalhe: 'Complemento' })).status, 200);
  assert.equal((await call(APOIO, 'PATCH', `/acoes/${demanda.id}`, { detalhe: 'Pelo Apoio' })).status, 200);
  assert.equal((await call(ADMIN, 'PATCH', `/acoes/${demanda.id}`, { prazo: '2026-10-20' })).status, 200);

  const doChefe = await nova(BRUNO_COF, 'Do chefe do COF');
  assert.equal((await call(DIRETOR, 'PATCH', `/acoes/${doChefe}`, { titulo: 'x' })).status, 403);
  assert.equal((await call(DIRETOR, 'DELETE', `/acoes/${doChefe}`)).status, 403);
  assert.equal((await call(DIRETOR, 'GET', `/acoes/${doChefe}`)).data.pode_editar, false);
  assert.equal((await call(DIRETOR, 'DELETE', `/acoes/${demanda.id}`)).status, 200);
});

test('ação encerrada não é editada; o Diretor Adjunto não direciona para a própria seção', async (t) => {
  const { db, call, nova } = await demo(t);
  const id = await nova(ANA_CPE, 'Vai encerrar');
  await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' });
  await call(ANA_CPE, 'POST', `/acoes/${id}/tempo`, { minutos: 10 });
  await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { status: 'concluida' });
  await call(DIRETOR, 'POST', `/acoes/${id}/encerrar`);
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { titulo: 'Tarde demais' })).status, 409);

  const da = (await call(DIRETOR, 'POST', '/secoes', { nome: 'Diretoria Adjunta', sigla: 'DA', tipo: 'diretoria_adjunta' })).data.id;
  const email = (await db.prepare('select email from usuarios where id = ?').get(ADMIN)).email;
  await definirSecaoAdministrador(db, email, da);
  const propria = await call(ADMIN, 'POST', '/diretrizes', { titulo: 'Para mim', prazo: PRAZO, destino: 'especificos', secoes: [da, COF] });
  assert.equal(propria.status, 400);
  assert.match(propria.data.erro, /própria seção/);
  assert.equal((await call(ADMIN, 'POST', '/diretrizes', { titulo: 'Para o COF', prazo: PRAZO, destino: 'especificos', secoes: [COF] })).status, 201);
  assert.equal((await call(ADMIN, 'POST', '/diretrizes', { titulo: 'Para todos', prazo: PRAZO, destino: 'todos' })).status, 201);
  // O Diretor continua direcionando para a Diretoria Adjunta, e o Diretor Adjunto cria as dele em "Minhas ações".
  assert.equal((await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Para a DA', prazo: PRAZO, destino: 'especificos', secoes: [da] })).status, 201);
  assert.equal((await call(ADMIN, 'POST', '/acoes', { titulo: 'Minha', prazo: PRAZO, secao_id: da })).status, 201);
});

test('a lista de ações filtra pelo prazo (usado ao direcionar)', async (t) => {
  const { call, nova } = await demo(t);
  const mesmoDia = await nova(ANA_CPE, 'Mesmo dia', { prazo: '2026-11-11' });
  await nova(ANA_CPE, 'Outro dia', { prazo: '2026-11-12' });
  const r = await call(DIRETOR, 'GET', '/acoes?situacao=abertas&prazo=2026-11-11');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.map((a) => a.id), [mesmoDia]);
  assert.ok((await call(DIRETOR, 'GET', '/acoes?prazo=invalido')).data.length > 1, 'prazo inválido é ignorado');
});

test('a lista de direcionamentos traz as seções de cada um, inclusive depois de redirecionar', async (t) => {
  const { db, call } = await demo(t);
  const d = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Para dois', prazo: PRAZO, destino: 'especificos', secoes: [CPE, COF] });
  const siglas = async () => (await call(DIRETOR, 'GET', '/diretrizes')).data.find((x) => x.id === d.data.id).secoes.map((s) => s.sigla);
  assert.deepEqual(await siglas(), ['CPE', 'COF']);
  const [doCof] = await db.prepare('select id from acoes where diretriz_id = ? and secao_id = ?').all(d.data.id, COF);
  await call(DIRETOR, 'POST', `/acoes/${doCof.id}/redirecionar`, { secao_id: 3 });
  assert.deepEqual(await siglas(), ['CPE', 'CGP']);
});
