// Suplente: um segundo Chefe da mesma seção, com o mesmo acesso do titular (chefe imediato). Ele é marcado como suplente no
// bootstrap (a interface mostra "Suplente de seção"), herda do titular as permissões por pessoa (ver as ações de todos os
// Centros e abrir a Configuração). A autoria continua como era: o titular responde pelas ações do suplente, mas o suplente
// não edita nem exclui as do titular (coberta em acoes-edicao.test.js).
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

const DIRETOR = 1, ANA_CPE = 3, BRUNO_COF = 4;
const CPE = 1;
const ARVORE_CPE = [1, 7, 9]; // CPE e as subseções abaixo dele
const SUPLENTE = 41; // suplente da Ana no CPE, criado pelo teste

async function demo(t) {
  const db = openDb(':memory:');
  await seed(db);
  await db.prepare('insert into usuarios (id, nome, email, perfil, secao_id) values (?,?,?,?,?)').run(SUPLENTE, 'Sílvia Duarte', 'silvia@exemplo.invalid', 'chefe', CPE);
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

test('o bootstrap marca o suplente (e só ele): o titular, o chefe de outra seção e os demais perfis não são suplentes', async (t) => {
  const { call } = await demo(t);
  assert.equal((await call(SUPLENTE, 'GET', '/bootstrap')).data.user.suplente, true);
  assert.equal((await call(ANA_CPE, 'GET', '/bootstrap')).data.user.suplente, false);
  assert.equal((await call(BRUNO_COF, 'GET', '/bootstrap')).data.user.suplente, false);
  assert.equal((await call(DIRETOR, 'GET', '/bootstrap')).data.user.suplente, false);
});

test('o suplente herda do titular a leitura das ações de todos os Centros e o acesso à Configuração', async (t) => {
  const { db, call } = await demo(t);
  const doCentro = async (uid) => (await call(uid, 'GET', '/acoes?escopo=todos')).data;
  assert.ok((await doCentro(SUPLENTE)).every((a) => ARVORE_CPE.includes(a.secao_id)), 'sem a permissão do titular, só a própria árvore');

  await db.prepare('update usuarios set ver_outros_centros = 1, acesso_configuracao = 1 where id = ?').run(ANA_CPE);
  const lista = await doCentro(SUPLENTE);
  assert.ok(lista.some((a) => !ARVORE_CPE.includes(a.secao_id)), 'com a permissão do titular, lê também as ações de outros Centros');
  assert.ok(lista.filter((a) => !ARVORE_CPE.includes(a.secao_id)).every((a) => a.somente_leitura === true), 'as de fora da árvore dele são só leitura');
  const user = (await call(SUPLENTE, 'GET', '/bootstrap')).data.user;
  assert.equal(Number(user.ver_outros_centros), 1);
  assert.equal(Number(user.acesso_configuracao), 1);
  assert.equal((await call(SUPLENTE, 'GET', '/secoes?todas=1')).status, 200, 'abre a Configuração (estrutura inteira)');

  // Titular desativado: não repassa nada.
  await db.prepare('update usuarios set ativo = 0 where id = ?').run(ANA_CPE);
  const sem = (await call(SUPLENTE, 'GET', '/bootstrap')).data.user;
  assert.equal(Number(sem.ver_outros_centros), 0);
  assert.equal(sem.suplente, false, 'sem titular ativo, ele deixa de ser tratado como suplente (é o único chefe)');
});

test('um chefe comum não herda nada de outra seção e o suplente não passa ao titular o que não é dele', async (t) => {
  const { db, call } = await demo(t);
  await db.prepare('update usuarios set ver_outros_centros = 1 where id = ?').run(ANA_CPE);
  assert.equal(Number((await call(BRUNO_COF, 'GET', '/bootstrap')).data.user.ver_outros_centros), 0, 'outra seção não herda');
  await db.prepare('update usuarios set ver_outros_centros = 1 where id = ?').run(SUPLENTE);
  await db.prepare('update usuarios set ver_outros_centros = 0 where id = ?').run(ANA_CPE);
  assert.equal(Number((await call(ANA_CPE, 'GET', '/bootstrap')).data.user.ver_outros_centros), 0, 'o titular não herda do suplente');
});
