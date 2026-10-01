// Redirecionar uma ação para outra seção: quem pode, para onde, e o que acompanha a ação.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

// Seções e usuários do banco de demonstração (server/seed.js).
const DIRETOR = 1, APOIO = 2, ANA_CPE = 3, BRUNO_COF = 4, GABRIELA_IND = 9, ADMIN = 10;
const CPE = 1, COF = 2, CGP = 3, IND = 7, MAP = 8, PNL = 9;
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

test('o Diretor redireciona a ação para outro Centro, com histórico e comentário', async (t) => {
  const { call } = await demo(t);
  const id = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Ação no centro errado', prazo: PRAZO })).data.id;
  await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' });
  await call(ANA_CPE, 'POST', `/acoes/${id}/tempo`, { minutos: 30 });
  await call(ANA_CPE, 'POST', `/acoes/${id}/checklist`, { texto: 'Item' });

  const r = await call(DIRETOR, 'POST', `/acoes/${id}/redirecionar`, { secao_id: COF, motivo: 'Assunto de orçamento' });
  assert.equal(r.status, 200);
  assert.equal(r.data.secao_id, COF);
  assert.equal(r.data.secao_sigla, 'COF');
  assert.equal(r.data.status, 'em_andamento', 'o status continua');
  assert.equal(r.data.tempo_total, 30, 'o tempo acompanha a ação');
  assert.equal(r.data.checklist_total, 1);

  // A seção de origem deixa de ver; a de destino passa a ver e gerir.
  assert.equal((await call(ANA_CPE, 'GET', `/acoes/${id}`)).status, 404);
  const det = await call(BRUNO_COF, 'GET', `/acoes/${id}`);
  assert.equal(det.status, 200);
  assert.ok(det.data.comentarios.some((c) => c.texto === 'Ação redirecionada de CPE para COF. Motivo: Assunto de orçamento'));
  assert.equal((await call(BRUNO_COF, 'POST', `/acoes/${id}/tempo`, { minutos: 10 })).status, 201);
});

test('Apoio e Administrador também redirecionam; validações do destino', async (t) => {
  const { call } = await demo(t);
  const id = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Ação', prazo: PRAZO })).data.id;
  assert.equal((await call(APOIO, 'POST', `/acoes/${id}/redirecionar`, { secao_id: CGP })).status, 200);
  assert.equal((await call(ADMIN, 'POST', `/acoes/${id}/redirecionar`, { secao_id: MAP })).status, 200);

  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/redirecionar`, {})).status, 400, 'destino obrigatório');
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/redirecionar`, { secao_id: MAP })).status, 400, 'mesma seção');
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/redirecionar`, { secao_id: 999 })).status, 409, 'seção inexistente');
  assert.equal((await call(DIRETOR, 'POST', '/acoes/999999/redirecionar', { secao_id: COF })).status, 404);
});

test('o chefe redireciona só dentro da própria árvore', async (t) => {
  const { call } = await demo(t);
  const id = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Para a subseção', prazo: PRAZO })).data.id;

  const fora = await call(ANA_CPE, 'POST', `/acoes/${id}/redirecionar`, { secao_id: COF });
  assert.equal(fora.status, 403);
  assert.match(fora.data.erro, /subseções/);
  assert.equal((await call(BRUNO_COF, 'POST', `/acoes/${id}/redirecionar`, { secao_id: COF })).status, 404, 'outro Centro não vê a ação');

  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/redirecionar`, { secao_id: PNL })).status, 200, 'neta da árvore');
  // A chefe da subseção IND vê a ação de PNL e pode devolvê-la ao Centro? Não: CPE está fora da árvore dela.
  assert.equal((await call(GABRIELA_IND, 'POST', `/acoes/${id}/redirecionar`, { secao_id: CPE })).status, 403);
  assert.equal((await call(GABRIELA_IND, 'POST', `/acoes/${id}/redirecionar`, { secao_id: IND })).status, 200);
});

test('ação concluída, arquivada ou já atribuída pela mesma diretriz não é redirecionada', async (t) => {
  const { call, db } = await demo(t);
  const d = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Diretriz', prazo: PRAZO, destino: 'especificos', secoes: [CPE, COF] });
  assert.equal(d.status, 201);
  const [acaoCpe] = await db.prepare('select id from acoes where diretriz_id = ? and secao_id = ?').all(d.data.id, CPE);
  const dup = await call(DIRETOR, 'POST', `/acoes/${acaoCpe.id}/redirecionar`, { secao_id: COF });
  assert.equal(dup.status, 409);
  assert.match(dup.data.erro, /mesma demanda/);
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${acaoCpe.id}/redirecionar`, { secao_id: CGP })).status, 200);

  const id = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Concluída', prazo: PRAZO })).data.id;
  await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' });
  await call(ANA_CPE, 'POST', `/acoes/${id}/tempo`, { minutos: 5 });
  await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { status: 'concluida' });
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/redirecionar`, { secao_id: COF })).status, 409);

  const arq = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Arquivada', prazo: PRAZO })).data.id;
  await call(ANA_CPE, 'POST', `/acoes/${arq}/arquivar`);
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${arq}/redirecionar`, { secao_id: COF })).status, 409);
});
