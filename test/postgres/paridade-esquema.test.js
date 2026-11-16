// Depois de todas as migrações, SQLite e PostgreSQL devem ter as mesmas tabelas, colunas e índices nomeados
// (só os nomes: os tipos diferem de propósito). Pega migração que mexe num banco e esquece o outro.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterTemporario } from './cluster.js';
import { aplicarMigracoes } from '../../server/migrations.js';
import { openDb } from '../../server/db.js';
import { descreverEsquema, diferencas } from '../esquema.js';

// Diferenças conhecidas e intencionais, no formato das linhas de `diferencas`. Comece vazio; acrescente com justificativa.
const ESPERADAS = [];

test('paridade de esquema entre SQLite e PostgreSQL depois das migrações', { timeout: 120000 }, async (t) => {
  const cluster = await clusterTemporario(t);
  const [pg] = await cluster.banco(t);
  await aplicarMigracoes(pg);
  const sqlite = openDb(':memory:');
  t.after(() => sqlite.close());
  await aplicarMigracoes(sqlite);
  const difs = diferencas(await descreverEsquema(sqlite), await descreverEsquema(pg)).filter((d) => !ESPERADAS.includes(d));
  assert.deepEqual(difs, [], 'esquemas divergentes depois das migrações:\n' + difs.join('\n'));
});
