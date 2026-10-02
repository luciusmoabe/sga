// Última movimentação das ações: "sem atualização há 7+ dias" para o chefe e contagem no Painel do Diretor.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { aplicarMigracoes } from '../server/migrations.js';

const DIRETOR = 1, ANA_CPE = 3, BRUNO_COF = 4;
const CPE = 1;
const PRAZO = '2026-12-31';
// O servidor grava com agoraISO() (UTC): basta conferir que a data foi renovada para o dia de hoje.
const renovada = (m) => m >= '2026-09-19';

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
  const envelhecer = (id, quando = '2026-09-10T09:00:00') => db.prepare('update acoes set movimentada_em = ?, criada_em = ? where id = ?').run(quando, quando, id);
  const mov = async (id) => (await db.prepare('select movimentada_em from acoes where id = ?').get(id)).movimentada_em;
  return { db, call, envelhecer, mov };
}

test('ação sem movimentação há 7 dias ou mais aparece como parada; qualquer atualização a tira da lista', async (t) => {
  const { call, envelhecer, mov } = await demo(t);
  const id = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Ação', prazo: PRAZO })).data.id;
  assert.equal((await call(ANA_CPE, 'GET', `/acoes/${id}`)).data.parada, false, 'nova não está parada');

  await envelhecer(id, '2026-09-13T08:00:00'); // 6 dias: ainda não
  assert.equal((await call(ANA_CPE, 'GET', `/acoes/${id}`)).data.parada, false);
  await envelhecer(id, '2026-09-12T08:00:00'); // 7 dias
  const parada = (await call(ANA_CPE, 'GET', '/acoes')).data.find((a) => a.id === id);
  assert.equal(parada.parada, true);
  assert.equal(parada.movimentada_em, '2026-09-12T08:00:00');

  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' })).status, 200);
  assert.ok(renovada(await mov(id)));
  assert.equal((await call(ANA_CPE, 'GET', `/acoes/${id}`)).data.parada, false);
});

test('tempo, comentário, checklist, impedimento e pedido de prazo contam como movimentação; erro não conta', async (t) => {
  const { db, call, envelhecer, mov } = await demo(t);
  const id = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Ação', prazo: PRAZO })).data.id;
  const casos = [
    ['tempo', () => call(ANA_CPE, 'POST', `/acoes/${id}/tempo`, { minutos: 20 })],
    ['comentário', () => call(DIRETOR, 'POST', `/acoes/${id}/comentarios`, { texto: 'Como está?' })],
    ['checklist', () => call(ANA_CPE, 'POST', `/acoes/${id}/checklist`, { texto: 'Item' })],
    ['impedimento', () => call(ANA_CPE, 'POST', `/acoes/${id}/impedimentos`, { descricao: 'Aguardando' })],
    ['pedido de prazo', () => call(ANA_CPE, 'POST', `/acoes/${id}/pedido-prazo`, { novo_prazo: '2027-01-31', justificativa: 'Motivo' })],
  ];
  for (const [nome, fazer] of casos) {
    await envelhecer(id);
    const r = await fazer();
    assert.ok(r.status < 300, `${nome}: ${r.status}`);
    assert.ok(renovada(await mov(id)), nome);
  }
  // Decidir o pedido também movimenta.
  await envelhecer(id);
  const pedido = await db.prepare("select id from pedidos_prazo where acao_id = ? and status = 'pendente'").get(id);
  assert.equal((await call(DIRETOR, 'POST', `/pedidos-prazo/${pedido.id}/decidir`, { aprovar: false })).status, 200);
  assert.ok(renovada(await mov(id)));

  // Gravação recusada não conta.
  await envelhecer(id);
  assert.equal((await call(BRUNO_COF, 'POST', `/acoes/${id}/tempo`, { minutos: 5 })).status, 404);
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/tempo`, { minutos: 0 })).status, 400);
  assert.equal(await mov(id), '2026-09-10T09:00:00');
});

test('o Painel conta as ações paradas por seção, sem as internas', async (t) => {
  const { call, envelhecer } = await demo(t);
  const paradasCPE = async () => (await call(DIRETOR, 'GET', '/painel')).data.itens.find((i) => i.secao.id === CPE).paradas;
  const antes = await paradasCPE();
  const visivel = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Visível', prazo: PRAZO })).data.id;
  const interna = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Interna', prazo: PRAZO, interna: true })).data.id;
  await envelhecer(visivel);
  await envelhecer(interna);
  assert.equal(await paradasCPE(), antes + 1);
  const cartao = (await call(DIRETOR, 'GET', '/pauta')).data.cartoes.find((c) => c.secao.id === CPE);
  assert.equal(cartao.paradas, antes + 1, 'o cartão da reunião traz a mesma contagem');
});

test('migrações: banco anterior à versão 14 ganha a última movimentação a partir do que já está registrado', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  await db.exec('alter table acoes drop column movimentada_em; delete from schema_migrations where id = 14');
  const [a, b] = await db.prepare('select id from acoes order by id limit 2').all();
  await db.prepare("update acoes set criada_em = '2026-08-01T09:00:00' where id in (?, ?)").run(a.id, b.id);
  await db.prepare('delete from tempo where acao_id in (?, ?)').run(a.id, b.id);
  await db.prepare('delete from acao_comentarios where acao_id in (?, ?)').run(a.id, b.id);
  await db.prepare("insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?, 1, 'x', '2026-09-05T15:00:00')").run(a.id);
  await db.prepare("insert into tempo (acao_id, usuario_id, data, minutos, criado_em) values (?, 3, '2026-09-08', 30, '2026-09-08T16:00:00')").run(a.id);

  assert.deepEqual(await aplicarMigracoes(db), [14]);

  const m = async (id) => (await db.prepare('select movimentada_em from acoes where id = ?').get(id)).movimentada_em;
  assert.equal(await m(a.id), '2026-09-08T16:00:00', 'a mais recente das movimentações');
  assert.ok((await m(b.id)) >= '2026-08-01T09:00:00');
  assert.deepEqual(await aplicarMigracoes(db), []);
});
