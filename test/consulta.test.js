// Leitura das ações de todos os Centros: perfil Consulta e chefe com usuarios.ver_outros_centros. Só leitura.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { aplicarMigracoes } from '../server/migrations.js';

const DIRETOR = 1, APOIO = 2, ANA_CPE = 3, ADMIN = 10;
const CPE = 1, COF = 2, IND = 7, MAP = 8;
const PRAZO = '2026-12-31';

async function demo(t) {
  const db = openDb(':memory:');
  await seed(db);
  const consulta = (await db.prepare("insert into usuarios (nome, email, perfil) values ('Leitor', 'leitor@exemplo.invalid', 'consulta')").run()).lastInsertRowid;
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
  const acaoDe = async (secao) => (await db.prepare("select id from acoes where secao_id = ? and status != 'concluida' order by id limit 1").get(secao)).id;
  return { db, call, consulta, acaoDe };
}

test('perfil Consulta lê as ações que o Diretor vê, todas como somente leitura, sem as internas', async (t) => {
  const { db, call, consulta, acaoDe } = await demo(t);
  const doDiretor = (await call(DIRETOR, 'GET', '/acoes?situacao=abertas')).data.map((a) => a.id).sort();
  const lista = (await call(consulta, 'GET', '/acoes?situacao=abertas')).data;
  assert.deepEqual(lista.map((a) => a.id).sort(), doDiretor);
  assert.ok(lista.length > 0 && lista.every((a) => a.somente_leitura && !a.pode_editar && !a.pode_excluir && !a.pode_mudar_prazo));
  assert.ok(!lista.some((a) => [IND, MAP].includes(a.secao_id)), 'ações internas das subseções ficam de fora');

  const det = (await call(consulta, 'GET', `/acoes/${await acaoDe(COF)}`)).data;
  assert.equal(det.somente_leitura, true);
  assert.equal(det.pode_editar, false);
  const interna = (await db.prepare('select id from acoes where interna = 1 limit 1').get()).id;
  assert.equal((await call(consulta, 'GET', `/acoes/${interna}`)).status, 404);
  assert.equal((await call(consulta, 'GET', '/bootstrap')).data.pedidos_pendentes, 0);
});

test('perfil Consulta não grava nada nem lê relatos, reuniões, seções ou avisos', async (t) => {
  const { call, consulta, acaoDe } = await demo(t);
  const id = await acaoDe(CPE);
  for (const caminho of ['/secoes', '/painel', '/pauta', '/reunioes', '/combinados', '/atualizacao', '/avisos/atual', '/diretrizes', '/pedidos-prazo', '/usuarios', '/config', `/secoes/${CPE}/detalhe`]) {
    const r = await call(consulta, 'GET', caminho);
    assert.equal(r.status, 403, caminho);
    assert.match(r.data.erro, /Consulta só permite ler/);
  }
  const gravacoes = [
    ['POST', '/acoes', { titulo: 'X', prazo: PRAZO, secao_id: CPE }],
    ['PATCH', `/acoes/${id}`, { status: 'em_andamento' }],
    ['POST', `/acoes/${id}/comentarios`, { texto: 'Oi' }],
    ['POST', `/acoes/${id}/tempo`, { minutos: 5 }],
    ['POST', `/acoes/${id}/checklist`, { texto: 'Item' }],
    ['POST', `/acoes/${id}/impedimentos`, { descricao: 'Trava' }],
    ['POST', `/acoes/${id}/vista`],
    ['DELETE', `/acoes/${id}`],
  ];
  for (const [metodo, caminho, corpo] of gravacoes) assert.equal((await call(consulta, metodo, caminho, corpo)).status, 403, `${metodo} ${caminho}`);
});

test('chefe com a permissão lê as ações de todos os Centros, sem alterar as de fora da própria árvore', async (t) => {
  const { db, call, acaoDe } = await demo(t);
  const doCof = await acaoDe(COF);
  const daCpe = await acaoDe(CPE);

  // Sem a permissão, nada muda: escopo=todos devolve só a própria árvore.
  assert.ok((await call(ANA_CPE, 'GET', '/acoes?escopo=todos')).data.every((a) => [CPE, IND, 9].includes(a.secao_id)));
  assert.equal((await call(ANA_CPE, 'GET', `/acoes/${doCof}`)).status, 404);

  assert.equal((await call(APOIO, 'PATCH', `/usuarios/${ANA_CPE}`, { ver_outros_centros: true })).status, 403, 'Apoio não concede');
  assert.equal((await call(DIRETOR, 'PATCH', `/usuarios/${APOIO}`, { ver_outros_centros: true })).status, 400, 'só para chefe');
  assert.equal((await call(DIRETOR, 'PATCH', `/usuarios/${ANA_CPE}`, { ver_outros_centros: 'sim' })).status, 400);
  const r = await call(DIRETOR, 'PATCH', `/usuarios/${ANA_CPE}`, { ver_outros_centros: true });
  assert.equal(r.status, 200);
  assert.equal(r.data.ver_outros_centros, 1);
  assert.equal((await db.prepare('select secao_id from usuarios where id = ?').get(ANA_CPE)).secao_id, CPE, 'continua chefe do CPE');

  const todas = (await call(ANA_CPE, 'GET', '/acoes?escopo=todos')).data;
  assert.equal(todas.find((a) => a.id === doCof).somente_leitura, true);
  assert.equal(todas.find((a) => a.id === daCpe).somente_leitura, false);
  assert.ok(todas.some((a) => a.secao_id === IND), 'internas da própria árvore continuam');
  assert.ok(!todas.some((a) => a.secao_id === MAP), 'internas de outro Centro ficam de fora');
  assert.ok((await call(ANA_CPE, 'GET', '/acoes')).data.every((a) => [CPE, IND, 9].includes(a.secao_id)), 'sem escopo, só a própria árvore');

  const det = (await call(ANA_CPE, 'GET', `/acoes/${doCof}`)).data;
  assert.equal(det.somente_leitura, true);
  assert.equal(det.nova, false);
  assert.equal((await call(ANA_CPE, 'GET', `/acoes/${daCpe}`)).data.somente_leitura, false);
  for (const [metodo, caminho, corpo] of [
    ['PATCH', `/acoes/${doCof}`, { status: 'em_andamento' }],
    ['POST', `/acoes/${doCof}/comentarios`, { texto: 'Oi' }],
    ['POST', `/acoes/${doCof}/tempo`, { minutos: 5 }],
    ['POST', `/acoes/${doCof}/checklist`, { texto: 'Item' }],
    ['POST', `/acoes/${doCof}/impedimentos`, { descricao: 'Trava' }],
    ['POST', `/acoes/${doCof}/pedido-prazo`, { novo_prazo: PRAZO, justificativa: 'x' }],
    ['POST', `/acoes/${doCof}/redirecionar`, { secao_id: CPE }],
    ['POST', `/acoes/${doCof}/arquivar`],
  ]) assert.equal((await call(ANA_CPE, metodo, caminho, corpo)).status, 404, `${metodo} ${caminho}`);

  // Trocar o perfil desliga a permissão.
  await call(DIRETOR, 'PATCH', `/usuarios/${ANA_CPE}`, { perfil: 'apoio' });
  assert.equal((await db.prepare('select ver_outros_centros from usuarios where id = ?').get(ANA_CPE)).ver_outros_centros, 0);
});

test('Diretor e Administrador passam uma conta para o perfil Consulta', async (t) => {
  const { call } = await demo(t);
  const r = await call(DIRETOR, 'PATCH', `/usuarios/${APOIO}`, { perfil: 'consulta' });
  assert.equal(r.status, 200);
  assert.equal(r.data.perfil, 'consulta');
  assert.equal((await call(APOIO, 'GET', '/painel')).status, 403);
  assert.equal((await call(ADMIN, 'PATCH', `/usuarios/${APOIO}`, { perfil: 'apoio' })).status, 200);
  assert.equal((await call(APOIO, 'GET', '/painel')).status, 200);
});

test('migração 19 aceita o perfil Consulta sem perder usuários, vínculos, índices nem views', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  await db.exec(`pragma foreign_keys = off;
    create table usuarios_antiga (id integer primary key, nome text not null, email text,
      perfil text not null check (perfil in ('diretor','chefe','apoio','administrador')), secao_id integer references secoes(id),
      ativo integer not null default 1, trocar_senha integer not null default 0);
    insert into usuarios_antiga select id, nome, email, perfil, secao_id, ativo, trocar_senha from usuarios;
    drop table usuarios;
    alter table usuarios_antiga rename to usuarios;
    create index idx_usuarios_perfil on usuarios(perfil);
    create view chefes_ativos as select id, nome from usuarios where perfil = 'chefe' and ativo = 1;
    delete from schema_migrations where id = 19;
    pragma foreign_keys = on`);
  const antes = await db.prepare('select id, nome, email, perfil, secao_id, ativo, trocar_senha from usuarios order by id').all();
  await assert.rejects(db.prepare("insert into usuarios (nome, perfil) values ('L', 'consulta')").run(), /CHECK/);

  assert.deepEqual(await aplicarMigracoes(db), [19]);

  assert.deepEqual(await db.prepare('select id, nome, email, perfil, secao_id, ativo, trocar_senha from usuarios order by id').all(), antes);
  assert.ok((await db.prepare('select ver_outros_centros from usuarios').all()).every((u) => u.ver_outros_centros === 0));
  await db.prepare("insert into usuarios (nome, perfil) values ('L', 'consulta')").run();
  await assert.rejects(db.prepare("insert into usuarios (nome, perfil) values ('X', 'outro')").run(), /CHECK/);
  assert.deepEqual(await db.prepare('pragma foreign_key_check').all(), []);
  assert.equal((await db.prepare("select count(*) n from sqlite_master where name in ('idx_usuarios_perfil','chefes_ativos')").get()).n, 2);
  assert.deepEqual(await aplicarMigracoes(db), []);
});
