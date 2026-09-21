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
  assert.deepEqual(resultados, [[1, 2, 3, 4, 5, 6, 7, 8], []]);
  await verificarMigracoes(db);
  assert.equal((await db.prepare('select count(*) n from schema_migrations').get()).n, 8);
});

test('migrações: esquema antigo recebe arquivamento sem perder ações existentes', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const antes = await db.prepare('select id, titulo from acoes order by id').all();
  await db.exec('drop index uq_pedido_pendente_acao; drop index uq_reuniao_em_andamento; drop table schema_migrations; alter table acoes drop column arquivada');
  assert.deepEqual(await aplicarMigracoes(db), [1, 2, 3, 4, 5, 6, 7, 8]);
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
  assert.deepEqual(await aplicarMigracoes(db), [1, 2, 3, 4, 5, 6, 7, 8]);
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

test('migrações: banco na versão 6 recebe a sessão deslizante sem perder sessões abertas', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  await db.exec(`insert into auth_contas (usuario_id, projeto, subject) values (3, 'https://p.supabase.co', '33333333-3333-4333-8333-333333333333');
    insert into auth_sessoes_senha (id, conta_id, csrf, expira_em, criada_em) values ('abc', 1, 'x', 4102444800, 5);
    delete from schema_migrations where id = 7;
    alter table auth_sessoes_senha drop column criada_em`);
  assert.deepEqual(await aplicarMigracoes(db), [7]);
  assert.deepEqual(await db.prepare('select id, expira_em, criada_em from auth_sessoes_senha').all(), [{ id: 'abc', expira_em: 4102444800, criada_em: 0 }]);
  assert.deepEqual(await aplicarMigracoes(db), [], 'reexecução não altera nada');
});

test('migrações: banco anterior à versão 8 ganha o perfil Administrador sem perder usuários, vínculos ou histórico', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  // Reproduz o esquema antigo: CHECK sem administrador, sem trocar_senha, e um índice/uma view sobre usuarios.
  await db.exec(`pragma foreign_keys = off;
    create table usuarios_antiga (id integer primary key, nome text not null, email text,
      perfil text not null check (perfil in ('diretor','chefe','apoio')), secao_id integer references secoes(id), ativo integer not null default 1);
    insert into usuarios_antiga select id, nome, email, perfil, secao_id, ativo from usuarios where perfil != 'administrador';
    drop table usuarios;
    alter table usuarios_antiga rename to usuarios;
    create index idx_usuarios_perfil on usuarios(perfil);
    create view chefes_ativos as select id, nome from usuarios where perfil = 'chefe' and ativo = 1;
    delete from schema_migrations where id = 8;
    pragma foreign_keys = on`);
  const antes = await db.prepare('select id, nome, email, perfil, secao_id, ativo from usuarios order by id').all();
  await assert.rejects(db.prepare("insert into usuarios (nome, perfil) values ('Adm', 'administrador')").run(), /CHECK/);

  assert.deepEqual(await aplicarMigracoes(db), [8]);

  assert.deepEqual(await db.prepare('select id, nome, email, perfil, secao_id, ativo from usuarios order by id').all(), antes);
  assert.ok((await db.prepare('select trocar_senha from usuarios').all()).every(u => u.trocar_senha === 0));
  const id = (await db.prepare("insert into usuarios (nome, email, perfil, trocar_senha) values ('Adm', 'adm@example.org', 'administrador', 1)").run()).lastInsertRowid;
  assert.equal((await db.prepare('select perfil from usuarios where id = ?').get(id)).perfil, 'administrador');
  await assert.rejects(db.prepare("insert into usuarios (nome, perfil) values ('X', 'outro')").run(), /CHECK/);
  assert.deepEqual(await db.prepare('pragma foreign_key_check').all(), [], 'nenhuma referência ficou órfã');
  assert.equal((await db.prepare("select count(*) n from sqlite_master where name in ('idx_usuarios_perfil','chefes_ativos')").get()).n, 2, 'índice e view preservados');
  assert.ok((await db.prepare('select count(*) n from secoes where chefe_id is not null').get()).n > 0);
  assert.deepEqual(await aplicarMigracoes(db), [], 'reexecução não altera nada');
});
