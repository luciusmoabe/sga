// Esquema base do SQLite (server/db.js) e do PostgreSQL (server/schema.sql) precisam ter as mesmas tabelas e colunas:
// as migrações rodam nos dois. A comparação depois das migrações, contra um PostgreSQL de verdade, está em
// test/postgres/paridade-esquema.test.js. Aqui é só a parte estática (sem PostgreSQL).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openDb } from '../server/db.js';
import { descreverEsquema } from './esquema.js';

/** Tabelas e colunas declaradas em `create table` de um texto SQL (só nomes). */
function tabelasDoSql(sql) {
  const out = {};
  for (const m of sql.matchAll(/create table(?: if not exists)?\s+(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    const colunas = [];
    for (const linha of m[2].split('\n')) {
      const c = linha.trim().match(/^(\w+)\s+(integer|text|real|numeric|boolean|bigint|timestamp\w*)\b/i);
      if (c) colunas.push(c[1]);
    }
    out[m[1]] = colunas;
  }
  return out;
}

test('esquema base: schema.sql (PostgreSQL) e db.js (SQLite) declaram as mesmas tabelas e colunas', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const sqlite = (await descreverEsquema(db)).tabelas;
  const pg = tabelasDoSql(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  assert.ok(Object.keys(pg).length >= 10, 'o schema.sql foi lido');
  const difs = [];
  for (const t of Object.keys(pg)) {
    if (!sqlite[t]) { difs.push(`tabela ${t}: só no schema.sql`); continue; }
    for (const c of pg[t]) if (!sqlite[t].includes(c)) difs.push(`${t}.${c}: só no schema.sql`);
    for (const c of sqlite[t]) if (!pg[t].includes(c)) difs.push(`${t}.${c}: só no db.js`);
  }
  assert.deepEqual(difs, [], 'esquemas base divergentes:\n' + difs.join('\n'));
});
