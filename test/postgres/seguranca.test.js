import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { clusterTemporario } from './cluster.js';
import { aplicarMigracoes } from '../../server/migrations.js';
import { sqlSeguranca, TABELAS_APP } from '../../server/seguranca-supabase.js';
import { gerarCarga } from '../../server/export-sqlite-to-pg.js';
import { openDb } from '../../server/db.js';
import { seed } from '../../server/seed.js';
import { vincularIdentidade } from '../../server/vincular-identidade.js';

test('PostgreSQL: permissões públicas e importação segura', { timeout: 120000 }, async t => {
  const cluster = await clusterTemporario(t);
  await t.test('migração revoga grants de tabelas, colunas, sequências e função, inclusive com policies legadas', async t => {
    const [db] = await cluster.banco(t);
    await db.exec(`create role anon; create role authenticated;
      grant usage on schema public to anon, authenticated;
      grant all on all tables in schema public to anon, authenticated;
      grant all on all sequences in schema public to anon, authenticated;
      grant select (nome), update (nome) on usuarios to public, anon, authenticated;
      create policy legado on usuarios for all to public using (true) with check (true);
      alter default privileges in schema public grant all on tables to anon, authenticated;
      alter default privileges in schema public grant all on sequences to anon, authenticated;`);
    await aplicarMigracoes(db);
    await seed(db);
    const tabelas = [...TABELAS_APP, 'schema_migrations', 'auth_contas', 'auth_sessoes', 'auth_fluxos', 'auth_contas', 'auth_sessoes_senha', 'auth_tentativas'];
    for (const papel of ['anon', 'authenticated']) {
      for (const tabela of tabelas) {
        for (const sql of [`select * from ${tabela}`, `delete from ${tabela}`]) {
          await assert.rejects(db.transaction(async () => {
            await db.exec(`set local role ${papel}`);
            await db.exec(sql);
          }), { code: '42501' });
        }
      }
      for (const sql of ["select nome from usuarios", "update usuarios set nome = 'Tentativa'", "select nextval('usuarios_id_seq')", 'select * from subarvore(1)']) {
        await assert.rejects(db.transaction(async () => { await db.exec(`set local role ${papel}`); await db.exec(sql); }), { code: '42501' });
      }
    }
    assert.equal((await db.prepare("select count(*) n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity").get()).n, 0);
    assert.equal((await db.prepare('select count(*) n from usuarios').get()).n, 9);
    await db.exec(sqlSeguranca()); // Aplicação manual também é idempotente.
    const gerado = await readFile(new URL('../../server/seguranca-supabase.sql', import.meta.url), 'utf8');
    assert.ok(gerado.endsWith(sqlSeguranca()));
  });

  await t.test('vínculos e sessões persistem entre conexões, com unicidade de identidade', async t => {
    const [a, b] = await cluster.banco(t);
    await seed(a);
    const tenant = 'https://projeto.supabase.co', oid = '22222222-2222-4222-8222-222222222222';
    await vincularIdentidade(a, 3, tenant, oid);
    await assert.rejects(vincularIdentidade(b, 4, tenant, oid), /já vinculado/);
    const identidade = await b.prepare('select id from auth_contas where usuario_id = 3').get();
    await a.prepare('insert into auth_sessoes_senha (id, conta_id, csrf, expira_em) values (?, ?, ?, ?)')
      .run('hash-ficticio', identidade.id, 'csrf-ficticio', Math.floor(Date.now() / 1000) + 60);
    assert.equal((await b.prepare('select conta_id from auth_sessoes_senha where id = ?').get('hash-ficticio')).conta_id, identidade.id);
    await b.prepare('delete from auth_sessoes_senha where id = ?').run('hash-ficticio');
    assert.equal(await a.prepare('select * from auth_sessoes_senha where id = ?').get('hash-ficticio'), null);
  });

  await t.test('exportação preserva dados, ordena pais e não substitui destino ocupado', async t => {
    const pasta = await mkdtemp(path.join(tmpdir(), 'sgc-export-'));
    t.after(() => rm(pasta, { recursive: true, force: true }));
    const arquivo = path.join(pasta, 'origem.db');
    const origem = openDb(arquivo, { databaseUrl: null });
    await seed(origem);
    await origem.exec("update secoes set pai_id = 2 where id = 1; update acoes set titulo = 'Teste ''aspas'' e barra\nlinha' where id = 1");
    const antes = await origem.prepare('select * from secoes order by id').all();
    await origem.close();
    const raw = new Database(arquivo, { readonly: true });
    let sql;
    try { sql = raw.transaction(() => gerarCarga(raw))(); } finally { raw.close(); }
    assert.doesNotMatch(sql, /truncate|disable row level|grant all|auth_sessoes/i);
    const [db] = await cluster.banco(t);
    await aplicarMigracoes(db);
    // Uma conexão dedicada evita deixar transações abortadas no pool após erro do script.
    const client = await db.pool.connect();
    try {
      await client.query(sql);
      assert.deepEqual((await client.query('select * from secoes order by id')).rows, antes);
      assert.equal((await client.query('select titulo from acoes where id = 1')).rows[0].titulo, "Teste 'aspas' e barra\nlinha");
      await assert.rejects(client.query(sql), /destino vazio/);
      await client.query('rollback');
      assert.equal((await client.query('select count(*) n from secoes')).rows[0].n, 9);
      assert.equal((await client.query("insert into secoes (nome, tipo, criada_em) values ('Nova', 'centro', '2026-09-22') returning id")).rows[0].id, 10);
    } finally { client.release(); }
    const [vazio] = await cluster.banco(t);
    await aplicarMigracoes(vazio);
    const falho = sql.replace('set constraints all immediate;', 'select 1/0;\nset constraints all immediate;');
    const outro = await vazio.pool.connect();
    try {
      await assert.rejects(outro.query(falho), { code: '22012' });
      await outro.query('rollback');
      assert.equal((await outro.query('select count(*) n from usuarios')).rows[0].n, 0);
    } finally { outro.release(); }
  });

  await t.test('SQL de demonstração legado também exige destino vazio e mantém permissões', async t => {
    const [db] = await cluster.banco(t);
    await aplicarMigracoes(db);
    const sql = await readFile(new URL('../../server/seed-supabase.sql', import.meta.url), 'utf8');
    assert.doesNotMatch(sql, /truncate|disable row level|grant all/i);
    const client = await db.pool.connect();
    try {
      await client.query(sql);
      await assert.rejects(client.query(sql), /destino vazio/);
      await client.query('rollback');
      assert.equal((await client.query('select count(*) n from usuarios')).rows[0].n, 9);
    } finally { client.release(); }
  });
});
