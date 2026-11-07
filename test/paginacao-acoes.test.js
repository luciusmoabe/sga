// GET /api/acoes: paginação opcional (?limite=&offset=) e total no cabeçalho; sem `limite` a resposta é a lista inteira, como antes.
process.env.SGC_NOW = '2026-09-22T09:30:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

const DIRETOR = 1;

async function montar(t) {
  const db = openDb(':memory:');
  await seed(db);
  const server = createApp(db, { auth: { mode: 'demo' } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((ok) => server.close(ok)); await db.close(); });
  return async (caminho, uid = DIRETOR) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api${caminho}`, { headers: { 'x-user-id': String(uid) } });
    return { status: r.status, total: r.headers.get('x-total-count'), dados: await r.json().catch(() => null) };
  };
}

test('sem limite a lista vem inteira e o total acompanha no cabeçalho', async (t) => {
  const get = await montar(t);
  const r = await get('/acoes');
  assert.equal(r.status, 200);
  assert.ok(r.dados.length > 5);
  assert.equal(Number(r.total), r.dados.length);
});

test('com limite e offset: páginas consecutivas reconstroem a lista, na mesma ordem', async (t) => {
  const get = await montar(t);
  const tudo = (await get('/acoes')).dados;
  const p1 = await get('/acoes?limite=4&offset=0');
  const p2 = await get('/acoes?limite=4&offset=4');
  assert.equal(p1.dados.length, 4);
  assert.equal(Number(p1.total), tudo.length, 'o total é o da lista inteira, não o da página');
  assert.deepEqual([...p1.dados, ...p2.dados].map((a) => a.id), tudo.slice(0, 8).map((a) => a.id));
  const fim = await get(`/acoes?limite=500&offset=${tudo.length}`);
  assert.deepEqual(fim.dados, [], 'além do fim vem vazio');
  assert.equal(Number(fim.total), tudo.length);
});

test('a paginação respeita os filtros e o escopo de quem pede', async (t) => {
  const get = await montar(t);
  const chefe = await get('/acoes?limite=1', 4);
  const todas = await get('/acoes', 4);
  assert.equal(chefe.dados.length, 1);
  assert.equal(Number(chefe.total), todas.dados.length);
  assert.ok(todas.dados.length < (await get('/acoes')).dados.length, 'o chefe vê menos que o Diretor');
  const filtro = await get('/acoes?situacao=atrasadas&limite=100');
  assert.ok(filtro.dados.every((a) => a.atrasada));
  assert.equal(Number(filtro.total), filtro.dados.length);
});

test('limite e offset inválidos são recusados com orientação', async (t) => {
  const get = await montar(t);
  for (const caminho of ['/acoes?limite=0', '/acoes?limite=501', '/acoes?limite=abc', '/acoes?limite=2.5', '/acoes?limite=5&offset=-1', '/acoes?limite=5&offset=x']) {
    const r = await get(caminho);
    assert.equal(r.status, 400, caminho);
    assert.match(r.dados.erro, /limite|offset/i, caminho);
  }
});
