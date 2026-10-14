// Ações recebidas: a ação direcionada ou redirecionada chega como nova para quem a recebe, até ele abrir o detalhe.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

const DIRETOR = 1, APOIO = 2, ANA_CPE = 3, BRUNO_COF = 4, GABRIELA_IND = 9, ADMIN = 10;
const CPE = 1, COF = 2, IND = 7;
const PRAZO = '2026-12-31';

async function demo(t) {
  process.env.SGC_NOW = '2026-09-19T10:00:00';
  const db = openDb(':memory:');
  await seed(db);
  // Começa sem as novas da carga de demonstração, para contar só o que o teste cria.
  await db.prepare('update acoes set recebida_em = null').run();
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
  const novas = async (uid) => (await call(uid, 'GET', '/bootstrap')).data.acoes_novas;
  const daLista = async (uid, id) => (await call(uid, 'GET', '/acoes')).data.find((a) => a.id === id);
  return { db, call, novas, daLista };
}

test('ação direcionada chega como nova para o chefe até ele abrir o detalhe; a gestão vê quem tomou ciência', async (t) => {
  const { db, call, novas, daLista } = await demo(t);
  const d = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Levantar demandas', prazo: PRAZO, destino: 'especificos', secoes: [CPE, COF] });
  assert.equal(d.status, 201);
  const acaoCpe = (await db.prepare('select id from acoes where diretriz_id = ? and secao_id = ?').get(d.data.id, CPE)).id;

  assert.equal(await novas(ANA_CPE), 1);
  assert.equal(await novas(BRUNO_COF), 1);
  assert.equal(await novas(DIRETOR), 0, 'a gestão não recebe');
  assert.equal((await daLista(ANA_CPE, acaoCpe)).nova, true);
  assert.equal((await daLista(DIRETOR, acaoCpe)).nova, false);
  assert.equal((await call(ANA_CPE, 'GET', `/acoes/${acaoCpe}`)).data.nova, true, 'o detalhe sozinho não marca');

  // Quem não recebe a ação não deixa registro de ciência.
  assert.deepEqual((await call(DIRETOR, 'POST', `/acoes/${acaoCpe}/vista`)).data, { ok: true, registrada: false });
  assert.deepEqual((await call(ANA_CPE, 'POST', `/acoes/${acaoCpe}/vista`)).data, { ok: true, registrada: true });
  assert.equal(await novas(ANA_CPE), 0);
  assert.equal((await daLista(ANA_CPE, acaoCpe)).nova, false);
  const detalhe = (await call(DIRETOR, 'GET', `/acoes/${acaoCpe}`)).data;
  assert.deepEqual(detalhe.vistas.map((v) => v.usuario_nome), ['Ana Ribeiro']);

  const dir = (await call(DIRETOR, 'GET', '/diretrizes')).data.find((x) => x.id === d.data.id);
  const porSigla = Object.fromEntries(dir.secoes.map((s) => [s.sigla, s]));
  assert.equal(porSigla.CPE.vista_por, 'Ana Ribeiro');
  assert.ok(porSigla.CPE.vista_em);
  assert.equal(porSigla.COF.vista_em, null);
  assert.ok(porSigla.COF.recebida_em);

  // Abrir de novo não muda a primeira ciência; o chefe de outra seção não enxerga a ação.
  const primeira = porSigla.CPE.vista_em;
  process.env.SGC_NOW = '2026-09-19T11:00:00';
  await call(ANA_CPE, 'POST', `/acoes/${acaoCpe}/vista`);
  assert.equal((await call(DIRETOR, 'GET', `/acoes/${acaoCpe}`)).data.vistas[0].vista_em, primeira);
  assert.equal((await call(BRUNO_COF, 'POST', `/acoes/${acaoCpe}/vista`)).status, 404);
});

test('ação criada pela própria seção não chega como nova; criada pela gestão para a seção, sim', async (t) => {
  const { call, novas } = await demo(t);
  const propria = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Da seção', prazo: PRAZO })).data;
  assert.equal(propria.recebida_em, null);
  assert.equal((await call(ANA_CPE, 'GET', `/acoes/${propria.id}`)).data.nova, false);
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${propria.id}/vista`)).data.registrada, false);

  for (const uid of [DIRETOR, APOIO, ADMIN]) {
    const r = await call(uid, 'POST', '/acoes', { titulo: `Da gestão ${uid}`, prazo: PRAZO, secao_id: CPE });
    assert.equal(r.status, 201);
    assert.ok(r.data.recebida_em, `criada por ${uid}`);
  }
  assert.equal(await novas(ANA_CPE), 3);
});

test('redirecionar faz a ação chegar de novo à seção de destino; quem redireciona na própria árvore já está ciente', async (t) => {
  const { call, novas, daLista, db } = await demo(t);
  const d = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Para o COF', prazo: PRAZO, destino: 'especificos', secoes: [COF] });
  const id = (await db.prepare('select id from acoes where diretriz_id = ?').get(d.data.id)).id;
  await call(BRUNO_COF, 'POST', `/acoes/${id}/vista`);
  assert.equal(await novas(BRUNO_COF), 0);

  process.env.SGC_NOW = '2026-09-19T11:00:00';
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/redirecionar`, { secao_id: CPE })).status, 200);
  assert.equal(await novas(ANA_CPE), 1);
  assert.equal((await daLista(ANA_CPE, id)).nova, true);
  assert.deepEqual((await call(DIRETOR, 'GET', `/acoes/${id}`)).data.vistas, [], 'a ciência do COF não vale para a nova chegada');

  // Ana passa a ação para a subseção: Gabriela recebe; Ana, que a moveu, não a vê como nova.
  process.env.SGC_NOW = '2026-09-19T12:00:00';
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/redirecionar`, { secao_id: IND })).status, 200);
  assert.equal(await novas(GABRIELA_IND), 1);
  assert.equal(await novas(ANA_CPE), 0);
  assert.equal((await daLista(ANA_CPE, id)).nova, false);

  // De volta ao COF: a ciência antiga de Bruno é anterior à nova chegada.
  process.env.SGC_NOW = '2026-09-19T13:00:00';
  await call(DIRETOR, 'POST', `/acoes/${id}/redirecionar`, { secao_id: COF });
  assert.equal(await novas(BRUNO_COF), 1);
});

test('ação recebida em curso: concluída deixa de ser nova; ciência não conta como movimentação; excluir a ação apaga a ciência', async (t) => {
  const { db, call, novas } = await demo(t);
  const d = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Rápida', prazo: PRAZO, destino: 'especificos', secoes: [CPE] });
  const id = (await db.prepare('select id from acoes where diretriz_id = ?').get(d.data.id)).id;
  await db.prepare("update acoes set movimentada_em = '2026-09-01T09:00:00' where id = ?").run(id);
  await call(ANA_CPE, 'POST', `/acoes/${id}/vista`);
  assert.equal((await db.prepare('select movimentada_em from acoes where id = ?').get(id)).movimentada_em, '2026-09-01T09:00:00');
  assert.equal((await db.prepare('select count(*) n from acao_vistas where acao_id = ?').get(id)).n, 1);
  assert.equal((await call(DIRETOR, 'DELETE', `/acoes/${id}`)).status, 200);
  assert.equal((await db.prepare('select count(*) n from acao_vistas where acao_id = ?').get(id)).n, 0);

  const outra = (await call(DIRETOR, 'POST', '/acoes', { titulo: 'Concluir logo', prazo: PRAZO, secao_id: CPE })).data;
  assert.equal(await novas(ANA_CPE), 1);
  await call(ANA_CPE, 'PATCH', `/acoes/${outra.id}`, { status: 'em_andamento' });
  await call(ANA_CPE, 'POST', `/acoes/${outra.id}/tempo`, { minutos: 10 });
  await call(ANA_CPE, 'PATCH', `/acoes/${outra.id}`, { status: 'concluida' });
  assert.equal(await novas(ANA_CPE), 0);
});

test('conta com ciência registrada não é excluída: o histórico é preservado', async (t) => {
  const { db, call } = await demo(t);
  const d = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Ciência', prazo: PRAZO, destino: 'especificos', secoes: [CPE] });
  const id = (await db.prepare('select id from acoes where diretriz_id = ?').get(d.data.id)).id;
  await call(DIRETOR, 'POST', `/acoes/${id}/redirecionar`, { secao_id: IND });
  assert.equal((await call(GABRIELA_IND, 'POST', `/acoes/${id}/vista`)).data.registrada, true);
  const r = await call(ADMIN, 'DELETE', `/usuarios/${GABRIELA_IND}`);
  assert.equal(r.status, 409);
  assert.match(r.data.erro, /ciência de ações recebidas/);
});
