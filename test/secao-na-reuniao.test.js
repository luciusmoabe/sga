// Seção na reunião: cada seção escolhe se aparece nos cartões do Modo Reunião, na pauta e na ata. Padrão: aparece.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { aplicarMigracoes } from '../server/migrations.js';

// Usuários e seções do banco de demonstração (server/seed.js).
const DIRETOR = 1, APOIO = 2, ANA_CPE = 3, BRUNO_COF = 4, GABRIELA_IND = 9, ADMIN = 10;
const CPE = 1, COF = 2, IND = 7, PNL = 9;
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

test('toda seção começa aparecendo; Diretor e Administrador mudam, o Apoio não', async (t) => {
  const { call } = await demo(t);
  const secoes = (await call(DIRETOR, 'GET', '/secoes')).data;
  assert.ok(secoes.every((s) => s.na_reuniao === true));
  const nova = await call(DIRETOR, 'POST', '/secoes', { nome: 'Nova', tipo: 'centro' });
  assert.equal(nova.data.na_reuniao, true);
  const fora = await call(DIRETOR, 'POST', '/secoes', { nome: 'Fora', tipo: 'centro', na_reuniao: false });
  assert.equal(fora.data.na_reuniao, false);

  assert.equal((await call(DIRETOR, 'PATCH', `/secoes/${COF}`, { na_reuniao: 'não' })).status, 400);
  assert.equal((await call(APOIO, 'PATCH', `/secoes/${COF}`, { na_reuniao: false })).status, 403);
  assert.equal((await call(BRUNO_COF, 'PATCH', `/secoes/${COF}`, { na_reuniao: false })).status, 403);
  const r = await call(DIRETOR, 'PATCH', `/secoes/${COF}`, { na_reuniao: false });
  assert.equal(r.status, 200);
  assert.equal(r.data.na_reuniao, false);
  assert.equal((await call(ADMIN, 'PATCH', `/secoes/${COF}`, { na_reuniao: true })).data.na_reuniao, true);
});

test('seção fora da reunião sai dos cartões e da pauta, mas continua no Painel', async (t) => {
  const { call } = await demo(t);
  await call(DIRETOR, 'PATCH', `/secoes/${COF}`, { na_reuniao: false });

  const pauta = (await call(DIRETOR, 'GET', '/pauta')).data;
  assert.ok(!pauta.cartoes.some((c) => c.secao.id === COF));
  assert.ok(pauta.cartoes.some((c) => c.secao.id === CPE));
  const painel = (await call(DIRETOR, 'GET', '/painel')).data.itens;
  const cof = painel.find((i) => i.secao.id === COF);
  assert.ok(cof, 'o Painel continua mostrando a seção');
  assert.equal(cof.secao.na_reuniao, false);

  const ini = await call(DIRETOR, 'POST', '/reunioes/iniciar');
  const cartoes = (await call(DIRETOR, 'GET', `/reunioes/${ini.data.reuniao.id}/cartoes`)).data.cartoes;
  assert.ok(!cartoes.some((c) => c.secao.id === COF));
});

test('subseção fora da reunião leva junto as subseções abaixo dela, no cartão e na ata', async (t) => {
  const { call } = await demo(t);
  const doCentro = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Ação do CPE', prazo: PRAZO })).data.id;
  const daSub = (await call(GABRIELA_IND, 'POST', '/acoes', { titulo: 'Ação da IND', prazo: PRAZO })).data.id;
  const daNeta = (await call(DIRETOR, 'POST', '/acoes', { titulo: 'Ação da PNL', prazo: PRAZO, secao_id: PNL })).data.id;
  await call(GABRIELA_IND, 'POST', `/acoes/${daSub}/impedimentos`, { descricao: 'Bloqueio da IND', critico: true });
  await call(ANA_CPE, 'POST', `/acoes/${doCentro}/impedimentos`, { descricao: 'Bloqueio do CPE', critico: true });

  const cartaoCPE = async () => (await call(DIRETOR, 'GET', '/pauta')).data.cartoes.find((c) => c.secao.id === CPE);
  const antes = (await cartaoCPE()).acoes.map((a) => a.id);
  assert.ok([doCentro, daSub, daNeta].every((id) => antes.includes(id)), 'por padrão a subseção aparece');

  await call(DIRETOR, 'PATCH', `/secoes/${IND}`, { na_reuniao: false });
  const depois = await cartaoCPE();
  assert.ok(depois.acoes.some((a) => a.id === doCentro));
  assert.ok(!depois.acoes.some((a) => a.id === daSub), 'a subseção saiu');
  assert.ok(!depois.acoes.some((a) => a.id === daNeta), 'a subseção abaixo dela também');
  assert.deepEqual(depois.impedimentos.map((i) => i.descricao), ['Bloqueio do CPE']);
  assert.equal(depois.subsecoes, 0);

  const ini = await call(DIRETOR, 'POST', '/reunioes/iniciar');
  const ata = (await call(DIRETOR, 'POST', `/reunioes/${ini.data.reuniao.id}/encerrar`)).data.ata_texto;
  assert.match(ata, /Bloqueio do CPE/);
  assert.doesNotMatch(ata, /Bloqueio da IND/);
});

test('migrações: banco anterior à versão 12 ganha "aparece na reunião" ligado em todas as seções', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  await db.exec('alter table secoes drop column na_reuniao; delete from schema_migrations where id = 12');
  const antes = await db.prepare('select * from secoes order by id').all();

  assert.deepEqual(await aplicarMigracoes(db), [12]);

  const depois = await db.prepare('select * from secoes order by id').all();
  assert.deepEqual(depois.map(({ na_reuniao, ...s }) => s), antes);
  assert.ok(depois.every((s) => s.na_reuniao === 1));
  assert.deepEqual(await aplicarMigracoes(db), [], 'reexecução não altera nada');
});
