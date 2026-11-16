// Guardas que rodam sem PostgreSQL e pegam o que o job `postgres` do CI só pegava tarde: scripts e arquivos gerados que
// listam tabelas à mão e ficam para trás quando uma migração cria tabela nova.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openDb } from '../server/db.js';
import { aplicarMigracoes } from '../server/migrations.js';
import { seed } from '../server/seed.js';
import { sqlSeguranca } from '../server/seguranca-supabase.js';
import { gerarCarga } from '../server/export-sqlite-to-pg.js';

async function bancoMigrado(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await aplicarMigracoes(db);
  return db;
}
const tabelasDe = async (db) => (await db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").all()).map((r) => r.name);

test('seguranca-supabase.sql está em dia com seguranca-supabase.js (regenere ao criar tabela)', async () => {
  const arquivo = await readFile(new URL('../server/seguranca-supabase.sql', import.meta.url), 'utf8');
  assert.ok(arquivo.endsWith(sqlSeguranca()), 'o arquivo difere do gerado: reescreva-o como o cabeçalho + sqlSeguranca()');
});

test('toda tabela do esquema migrado entra na política de segurança (RLS e revogações)', async (t) => {
  const db = await bancoMigrado(t);
  const sql = sqlSeguranca();
  const fora = (await tabelasDe(db)).filter((nome) => !sql.includes(`'${nome}'`));
  assert.deepEqual(fora, [], 'tabela nova precisa entrar em TABELAS_APP (server/seguranca-supabase.js)');
});

test('limpar-acoes-piloto.sql esvazia todas as tabelas que referenciam acoes', async (t) => {
  const db = await bancoMigrado(t);
  const script = await readFile(new URL('../scripts/limpar-acoes-piloto.sql', import.meta.url), 'utf8');
  const truncate = script.match(/truncate table([\s\S]*?)continue identity/i)?.[1] || '';
  const listadas = new Set([...truncate.matchAll(/public\.(\w+)/g)].map((m) => m[1]));
  const dependentes = [];
  for (const nome of await tabelasDe(db)) {
    if ((await db.prepare(`pragma foreign_key_list(${nome})`).all()).some((f) => f.table === 'acoes')) dependentes.push(nome);
  }
  assert.ok(dependentes.includes('acao_comentarios') && dependentes.includes('pontos_atencao'));
  assert.deepEqual(dependentes.filter((n) => !listadas.has(n)), [], 'tabela que referencia acoes e não está no truncate do script de limpeza');
});

test('exportação SQLite → PostgreSQL: gera a carga do banco de demonstração e só reinicia identidade onde há coluna id', async (t) => {
  // gerarCarga lê um arquivo SQLite cru (better-sqlite3), como o script de linha de comando faz.
  const pasta = await mkdtemp(path.join(tmpdir(), 'sgc-export-'));
  t.after(() => rm(pasta, { recursive: true, force: true }));
  const arquivo = path.join(pasta, 'origem.db');
  const origem = openDb(arquivo, { databaseUrl: null });
  await seed(origem);
  await origem.close();
  const raw = new Database(arquivo, { readonly: true });
  let sql;
  try { sql = raw.transaction(() => gerarCarga(raw))(); } finally { raw.close(); }
  assert.match(sql, /alter table acoes alter column id restart with/);
  for (const compostas of ['config', 'acao_vistas', 'secao_config', 'secao_cabecalho_ata', 'reuniao_equipe_acoes']) {
    assert.doesNotMatch(sql, new RegExp(`alter table ${compostas} alter column id`), `${compostas} não tem coluna id`);
  }
});
