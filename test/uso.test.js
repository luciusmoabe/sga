// Contagem anônima de aberturas de tela (migração 37, server/rotas-uso.js): soma por empresa, dia, tela, perfil e versão, sem guardar pessoa.
process.env.SGC_NOW = '2026-09-22T09:30:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

const DIRETOR = 1, APOIO = 2, ANA_CPE = 3, BRUNO_COF = 4;
const MEMBRO = 31, CONSULTA = 32;

async function demo(t) {
  const db = openDb(':memory:');
  await seed(db);
  await db.prepare('insert into usuarios (id, nome, email, perfil, secao_id) values (?,?,?,?,?)').run(MEMBRO, 'Marina Costa', 'marina@exemplo.invalid', 'membro', 2);
  await db.prepare('insert into usuarios (id, nome, email, perfil) values (?,?,?,?)').run(CONSULTA, 'Cida Consulta', 'cida@exemplo.invalid', 'consulta');
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

test('cada abertura soma 1 para a tela, o perfil e a versão; versões e perfis ficam separados', async (t) => {
  const { call } = await demo(t);
  for (const [uid, corpo] of [
    [BRUNO_COF, { tela: 'minhas-acoes' }], [BRUNO_COF, { tela: 'minhas-acoes' }], [BRUNO_COF, { tela: 'minhas-acoes', versao: 'nova' }],
    [ANA_CPE, { tela: 'minhas-acoes' }], [DIRETOR, { tela: 'painel' }], [APOIO, { tela: 'painel' }],
  ]) assert.equal((await call(uid, 'POST', '/uso', corpo)).status, 204);
  const r = (await call(DIRETOR, 'GET', '/uso')).data;
  assert.equal(r.ate, '2026-09-22');
  assert.equal(r.de, '2026-08-26', '28 dias, contando hoje');
  assert.equal(r.desde, '2026-09-22', 'a contagem começou hoje');
  const n = (tela, perfil, versao) => r.linhas.find((l) => l.tela === tela && l.perfil === perfil && l.versao === versao)?.aberturas;
  assert.equal(n('minhas-acoes', 'chefe', 'atual'), 3, 'dois chefes na versão atual');
  assert.equal(n('minhas-acoes', 'chefe', 'nova'), 1);
  assert.equal(n('painel', 'diretor', 'atual'), 1);
  assert.equal(n('painel', 'apoio', 'atual'), 1);
});

test('não guarda quem abriu: a tabela só tem empresa, dia, tela, perfil, versão e a contagem', async (t) => {
  const { db, call } = await demo(t);
  await call(BRUNO_COF, 'POST', '/uso', { tela: 'agenda' });
  const colunas = (await db.prepare('pragma table_info(uso_telas)').all()).map((c) => c.name).sort();
  assert.deepEqual(colunas, ['aberturas', 'dia', 'empresa_id', 'id', 'perfil', 'tela', 'versao']);
  const linha = await db.prepare('select * from uso_telas').get();
  assert.equal(linha.aberturas, 1);
  assert.equal(linha.dia, '2026-09-22');
  assert.equal(linha.perfil, 'chefe');
});

test('nome de tela inválido é recusado; versão desconhecida vale como atual', async (t) => {
  const { db, call } = await demo(t);
  for (const tela of ['', 'Agenda', 'a b', '1agenda', 'a'.repeat(41), '../x', 'x;drop table usuarios', undefined]) {
    assert.equal((await call(BRUNO_COF, 'POST', '/uso', { tela })).status, 400, `tela ${JSON.stringify(tela)}`);
  }
  assert.equal((await call(BRUNO_COF, 'POST', '/uso', { tela: 'agenda', versao: 'qualquer' })).status, 204);
  assert.equal((await db.prepare("select versao from uso_telas where tela = 'agenda'").get()).versao, 'atual');
  assert.equal((await db.prepare('select count(*) as n from usuarios').get()).n > 0, true, 'a tabela de usuários continua intacta');
});

test('o membro e a Consulta avisam a abertura; só o Diretor lê o total (o chefe, não)', async (t) => {
  const { call } = await demo(t);
  assert.equal((await call(MEMBRO, 'POST', '/uso', { tela: 'minhas-acoes' })).status, 204);
  assert.equal((await call(CONSULTA, 'POST', '/uso', { tela: 'acoes-centros' })).status, 204);
  assert.equal((await call(BRUNO_COF, 'GET', '/uso')).status, 403);
  assert.equal((await call(MEMBRO, 'GET', '/uso')).status, 403);
  assert.equal((await call(CONSULTA, 'GET', '/uso')).status, 403);
  const linhas = (await call(DIRETOR, 'GET', '/uso')).data.linhas;
  assert.deepEqual(linhas.map((l) => `${l.tela}:${l.perfil}`).sort(), ['acoes-centros:consulta', 'minhas-acoes:membro']);
});

test('período do relatório: validado, e só entra o que está dentro dele', async (t) => {
  const { db, call } = await demo(t);
  await db.prepare("insert into uso_telas (empresa_id, dia, tela, perfil, versao, aberturas) values (1, '2026-08-01', 'antiga', 'chefe', 'atual', 9)").run();
  await call(BRUNO_COF, 'POST', '/uso', { tela: 'agenda' });
  assert.deepEqual((await call(DIRETOR, 'GET', '/uso')).data.linhas.map((l) => l.tela), ['agenda'], 'a de agosto está fora dos 28 dias');
  const todas = (await call(DIRETOR, 'GET', '/uso?de=2026-07-01&ate=2026-09-22')).data.linhas;
  assert.deepEqual(todas.map((l) => `${l.tela}:${l.aberturas}`).sort(), ['agenda:1', 'antiga:9']);
  assert.equal((await call(DIRETOR, 'GET', '/uso?de=2026-09-22&ate=2026-09-01')).status, 400);
  assert.equal((await call(DIRETOR, 'GET', '/uso?de=2020-01-01&ate=2026-09-22')).status, 400, 'mais de um ano');
  assert.equal((await call(DIRETOR, 'GET', '/uso?de=xx')).status, 400);
});
