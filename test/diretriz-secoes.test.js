// Acrescentar seções a um direcionamento já feito (POST /api/diretrizes/:id/secoes).
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { definirSecaoAdministrador } from '../server/criar-administrador.js';

// Usuários e seções do banco de demonstração (server/seed.js).
const DIRETOR = 1, APOIO = 2, ANA_CPE = 3, ADMIN = 10;
const CPE = 1, COF = 2, CGP = 3, IND = 7;
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
  return { db, call };
}

test('o Diretor acrescenta seções a um direcionamento; elas recebem a mesma ação', async (t) => {
  const { db, call } = await demo(t);
  const d = (await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Levantar contratos', detalhe: 'Até 2025', prazo: PRAZO, prioridade: 'alta', destino: 'especificos', secoes: [CPE] })).data;

  const r = await call(DIRETOR, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [COF, CGP] });
  assert.equal(r.status, 201);
  assert.equal(r.data.acoes_criadas, 2);
  const acoes = await db.prepare('select secao_id, titulo, detalhe, prazo, prioridade, criado_por from acoes where diretriz_id = ? order by secao_id').all(d.id);
  assert.deepEqual(acoes.map((a) => a.secao_id), [CPE, COF, CGP]);
  assert.ok(acoes.every((a) => a.titulo === 'Levantar contratos' && a.detalhe === 'Até 2025' && a.prazo === PRAZO && a.prioridade === 'alta'));
  const lista = (await call(DIRETOR, 'GET', '/diretrizes')).data.find((x) => x.id === d.id);
  assert.deepEqual([lista.total, lista.secoes.map((s) => s.sigla)], [3, ['CPE', 'COF', 'CGP']]);
  // A seção nova vê a ação como demanda do Diretor.
  const doCof = (await call(4, 'GET', '/acoes')).data.find((a) => a.diretriz_id === d.id);
  assert.equal(doCof.demandada_diretor, true);

  // Prazo próprio para as seções acrescentadas.
  assert.equal((await call(ADMIN, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [4], prazo: '2027-01-15' })).status, 201);
  assert.equal((await db.prepare('select prazo from acoes where diretriz_id = ? and secao_id = 4').get(d.id)).prazo, '2027-01-15');
});

test('validações: seção repetida, subseção, prazo vencido, perfil e Diretor Adjunto', async (t) => {
  const { db, call } = await demo(t);
  const d = (await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Demanda', prazo: PRAZO, destino: 'especificos', secoes: [CPE] })).data;
  assert.equal((await call(DIRETOR, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [] })).status, 400);
  assert.equal((await call(DIRETOR, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [CPE] })).status, 409, 'já recebeu');
  assert.equal((await call(DIRETOR, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [IND] })).status, 400, 'subseção não');
  assert.equal((await call(DIRETOR, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [COF], prazo: '2026-09-01' })).status, 400);
  assert.equal((await call(DIRETOR, 'POST', '/diretrizes/999999/secoes', { secoes: [COF] })).status, 404);
  assert.equal((await call(ANA_CPE, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [COF] })).status, 403);
  assert.equal((await call(APOIO, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [COF] })).status, 201);

  // Diretriz cujo prazo já passou: só com prazo novo.
  await db.prepare("update diretrizes set prazo = '2026-09-10' where id = ?").run(d.id);
  const vencido = await call(DIRETOR, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [CGP] });
  assert.equal(vencido.status, 400);
  assert.match(vencido.data.erro, /já passou/);
  assert.equal((await call(DIRETOR, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [CGP], prazo: '2026-10-30' })).status, 201);

  // O Diretor Adjunto não acrescenta a própria seção.
  const da = (await call(DIRETOR, 'POST', '/secoes', { nome: 'Diretoria Adjunta', sigla: 'DA', tipo: 'diretoria_adjunta' })).data.id;
  await definirSecaoAdministrador(db, (await db.prepare('select email from usuarios where id = ?').get(ADMIN)).email, da);
  const propria = await call(ADMIN, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [da], prazo: '2026-10-30' });
  assert.equal(propria.status, 400);
  assert.match(propria.data.erro, /própria seção/);
  assert.equal((await call(DIRETOR, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [da], prazo: '2026-10-30' })).status, 201, 'o Diretor pode');
});

test('direcionamento para "Todos os Centros" passa a listar as seções quando ganha mais uma', async (t) => {
  const { call } = await demo(t);
  const d = (await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Para todos', prazo: PRAZO, destino: 'todos' })).data;
  const da = (await call(DIRETOR, 'POST', '/secoes', { nome: 'Diretoria Adjunta', sigla: 'DA', tipo: 'diretoria_adjunta' })).data.id;
  assert.equal((await call(DIRETOR, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [da] })).status, 201);
  const x = (await call(DIRETOR, 'GET', '/diretrizes')).data.find((y) => y.id === d.id);
  assert.equal(x.destino, 'especificos');
  assert.ok(x.secoes.some((s) => s.sigla === 'DA'));
});
