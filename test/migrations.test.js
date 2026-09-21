import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { aplicarMigracoes, verificarMigracoes } from '../server/migrations.js';
import { seed } from '../server/seed.js';

test('migrações: aplicação concorrente é idempotente e registra a versão', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await assert.rejects(verificarMigracoes(db), /Migrações pendentes/);
  const resultados = await Promise.all([aplicarMigracoes(db), aplicarMigracoes(db)]);
  assert.deepEqual(resultados, [[1, 2, 3, 4, 5, 6], []]);
  await verificarMigracoes(db);
  assert.equal((await db.prepare('select count(*) n from schema_migrations').get()).n, 6);
});

test('migrações: esquema antigo recebe arquivamento sem perder ações existentes', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const antes = await db.prepare('select id, titulo from acoes order by id').all();
  await db.exec('drop index uq_pedido_pendente_acao; drop index uq_reuniao_em_andamento; drop table schema_migrations; alter table acoes drop column arquivada');
  assert.deepEqual(await aplicarMigracoes(db), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(await db.prepare('select id, titulo from acoes order by id').all(), antes);
  assert.ok((await db.prepare('select arquivada from acoes').all()).every(a => a.arquivada === 0));
});

test('migrações: pedidos duplicados interrompem a atualização sem excluir registros', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  await db.exec('drop index uq_pedido_pendente_acao; drop index uq_reuniao_em_andamento; delete from schema_migrations where id >= 2');
  await db.exec(`insert into pedidos_prazo (acao_id, prazo_atual, novo_prazo, justificativa, criado_em)
    select acao_id, prazo_atual, novo_prazo, justificativa, criado_em from pedidos_prazo limit 1`);
  const antes = await db.prepare('select * from pedidos_prazo order by id').all();
  await assert.rejects(aplicarMigracoes(db), /pedidos pendentes duplicados/);
  assert.deepEqual(await db.prepare('select * from pedidos_prazo order by id').all(), antes);
  assert.deepEqual((await db.prepare('select id from schema_migrations').all()).map(m => m.id), [1]);
});

test('migrações: reuniões duplicadas interrompem atualização sem escolher uma vencedora', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  await db.exec('drop index uq_pedido_pendente_acao; drop index uq_reuniao_em_andamento; delete from schema_migrations where id >= 2');
  for (let i = 0; i < 2; i++) {
    await db.prepare('insert into reunioes (data, semana, iniciada_em) values (?, ?, ?)').run('2026-09-22', '2026-09-22', '2026-09-22T10:00:00Z');
  }
  await assert.rejects(aplicarMigracoes(db), /reuniões simultâneas/);
  assert.equal((await db.prepare("select count(*) n from reunioes where status = 'em_andamento'").get()).n, 2);
});

test('migrações: erro de DDL desfaz índices e registro da migração', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const executar = db.exec;
  db.exec = async sql => {
    if (sql.includes('create unique index uq_reuniao_em_andamento')) throw new Error('Falha de DDL');
    return executar(sql);
  };
  await assert.rejects(aplicarMigracoes(db), /Falha de DDL/);
  assert.deepEqual(await db.prepare("select name from sqlite_master where name in ('schema_migrations','uq_pedido_pendente_acao')").all(), []);
  db.exec = executar;
  assert.deepEqual(await aplicarMigracoes(db), [1, 2, 3, 4, 5, 6]);
});

test('migrações: índices impedem duplicidades até em escritas diretas', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  await assert.rejects(db.exec(`insert into pedidos_prazo (acao_id, prazo_atual, novo_prazo, justificativa, criado_em)
    select acao_id, prazo_atual, novo_prazo, justificativa, criado_em from pedidos_prazo limit 1`), /UNIQUE/);
  await db.prepare('insert into reunioes (data, semana, iniciada_em) values (?, ?, ?)').run('2026-09-22', '2026-09-22', '2026-09-22T10:00:00Z');
  await assert.rejects(db.prepare('insert into reunioes (data, semana, iniciada_em) values (?, ?, ?)').run('2026-09-22', '2026-09-22', '2026-09-22T10:01:00Z'), /UNIQUE/);
});

test('migrações: versão desconhecida e erros de acesso são propagados', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await aplicarMigracoes(db);
  await db.prepare('insert into schema_migrations (id, nome, aplicada_em) values (?, ?, ?)').run(99, 'futura', '2026-09-22');
  await assert.rejects(verificarMigracoes(db), /incompatível/);
  await assert.rejects(aplicarMigracoes(db), /incompatível/);
  await assert.rejects(verificarMigracoes({ prepare: () => ({ all: async () => { throw new Error('Acesso negado'); } }) }), /Acesso negado/);
});
