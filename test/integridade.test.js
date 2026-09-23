import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { aplicarMigracoes } from '../server/migrations.js';
import { seed } from '../server/seed.js';
import { conferirIntegridade, semearLegado } from './integridade-cenarios.js';

test('SQLite: integridade de chefes e proteção de históricos após migração', async t => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  await conferirIntegridade(db);
});

test('SQLite: versão 3 preserva dados, índices, views e triggers do esquema anterior', async t => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await semearLegado(db);
  await db.exec(`alter table secoes add column observacao text;
    update secoes set observacao = 'Preservar';
    create index idx_secao_nome on secoes(nome);
    create view nomes_secoes as select id, nome from secoes;
    create trigger registrar_nome after update of nome on secoes begin
      insert into config (chave, valor) values ('ultimo_nome', NEW.nome)
        on conflict(chave) do update set valor = excluded.valor;
    end;
    create trigger mudar_nome instead of update on nomes_secoes begin
      update secoes set nome = NEW.nome where id = OLD.id;
    end`);
  const tabelas = ['secoes', 'usuarios', 'acoes', 'tempo', 'decisoes', 'pedidos_prazo'];
  const antes = await Promise.all(tabelas.map(nome => db.prepare(`select * from ${nome} order by id`).all()));
  assert.deepEqual(await aplicarMigracoes(db), [3, 4, 5, 6, 7, 8, 9]);
  const depois = await Promise.all(tabelas.map(nome => db.prepare(`select * from ${nome} order by id`).all()));
  for (const acao of depois[2]) delete acao.criado_por; // coluna adicionada pela migração 6
  assert.deepEqual(depois, antes);
  assert.ok(await db.prepare("select name from sqlite_master where name = 'idx_secao_nome'").get());
  await db.exec("update nomes_secoes set nome = 'Nome novo' where id = 1");
  assert.equal((await db.prepare("select valor from config where chave = 'ultimo_nome'").get()).valor, 'Nome novo');
  assert.deepEqual(await db.prepare('pragma foreign_key_check').all(), []);
  assert.equal((await db.prepare('pragma foreign_keys').get()).foreign_keys, 1);
});

test('SQLite: chefe órfão impede migração sem alterar registros ou versão', async t => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await semearLegado(db);
  await db.exec('update secoes set chefe_id = 9999 where id = 1');
  await assert.rejects(aplicarMigracoes(db), /chefe inexistente nas seções 1/);
  assert.equal((await db.prepare('select chefe_id from secoes where id = 1').get()).chefe_id, 9999);
  assert.equal((await db.prepare('select count(*) n from schema_migrations').get()).n, 2);
  assert.equal((await db.prepare('pragma foreign_keys').get()).foreign_keys, 1);
  await db.exec('update secoes set chefe_id = 3 where id = 1');
  assert.deepEqual(await aplicarMigracoes(db), [3, 4, 5, 6, 7, 8, 9]);
});

test('SQLite: erro após reconstrução desfaz o esquema e restaura fiscalização das FKs', async t => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await semearLegado(db);
  const antes = await db.prepare('select * from secoes order by id').all();
  const preparar = db.prepare.bind(db);
  db.prepare = sql => {
    const stmt = preparar(sql);
    if (!sql.startsWith('insert into schema_migrations')) return stmt;
    return { ...stmt, run: async (...args) => {
      if (args[0] === 3) throw new Error('Falha ao registrar versão 3');
      return stmt.run(...args);
    } };
  };
  await assert.rejects(aplicarMigracoes(db), /Falha ao registrar/);
  db.prepare = preparar;
  assert.deepEqual(await db.prepare('select * from secoes order by id').all(), antes);
  assert.ok(!(await db.prepare('pragma foreign_key_list(secoes)').all()).some(c => c.from === 'chefe_id'));
  assert.equal((await db.prepare('pragma foreign_keys').get()).foreign_keys, 1);
  await assert.rejects(db.exec('update acoes set secao_id = 9999 where id = 1'), /FOREIGN KEY/);
  assert.deepEqual(await aplicarMigracoes(db), [3, 4, 5, 6, 7, 8, 9]);
});

test('SQLite: verificação final impede commit de referências inválidas no modo de reconstrução', async t => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  await assert.rejects(db.transaction(() => db.exec('update acoes set secao_id = 9999 where id = 1'),
    { rebuildForeignKeys: true }), /referências inválidas/);
  assert.equal((await db.prepare('pragma foreign_keys').get()).foreign_keys, 1);
  assert.equal((await db.prepare('select secao_id from acoes where id = 1').get()).secao_id, 1);
});

test('SQLite: migração persiste após reabrir arquivo e consultas externas aguardam a reativação das FKs', async t => {
  const pasta = await mkdtemp(path.join(tmpdir(), 'sgc-integridade-'));
  const arquivo = path.join(pasta, 'legado.db');
  let db = openDb(arquivo, { databaseUrl: null });
  t.after(async () => { await db.close(); await rm(pasta, { recursive: true, force: true }); });
  await semearLegado(db);
  await aplicarMigracoes(db);
  await db.close();
  db = openDb(arquivo, { databaseUrl: null });
  assert.equal((await db.prepare('select count(*) n from secoes').get()).n, 9);
  assert.deepEqual(await aplicarMigracoes(db), []);
  let liberar, avisar;
  const espera = new Promise(r => { liberar = r; });
  const iniciou = new Promise(r => { avisar = r; });
  const migracao = db.transaction(async () => { avisar(); await espera; }, { rebuildForeignKeys: true });
  await iniciou;
  let terminou = false;
  const externa = assert.rejects(db.exec('update secoes set chefe_id = 9999 where id = 1'), /FOREIGN KEY/)
    .then(() => { terminou = true; });
  try {
    await new Promise(r => setImmediate(r));
    assert.equal(terminou, false);
  } finally { liberar(); }
  await Promise.all([migracao, externa]);
  assert.equal((await db.prepare('pragma foreign_keys').get()).foreign_keys, 1);
});
