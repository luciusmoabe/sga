// Depois de todas as migrações, SQLite e PostgreSQL devem ter as mesmas tabelas, colunas e índices nomeados
// (só os nomes: os tipos diferem de propósito). Pega migração que mexe num banco e esquece o outro.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterTemporario } from './cluster.js';
import { aplicarMigracoes } from '../../server/migrations.js';
import { openDb } from '../../server/db.js';
import { descreverEsquema, diferencas } from '../esquema.js';

// Diferenças conhecidas e intencionais, no formato das linhas de `diferencas`; acrescente só com justificativa.
// Índices de desempenho que o schema.sql cria e o esquema base do SQLite (desenvolvimento e demonstração, poucos dados) não cria.
// Achado da primeira execução; se virar problema no SQLite, crie os índices numa migração e tire a linha daqui.
const ESPERADAS = [
  'índice idx_acoes_arquivada: só no PostgreSQL',
  'índice idx_acoes_diretriz: só no PostgreSQL',
  'índice idx_acoes_encerrada: só no PostgreSQL',
  'índice idx_acoes_prazo: só no PostgreSQL',
  'índice idx_acoes_secao_status: só no PostgreSQL',
  'índice idx_acoes_status: só no PostgreSQL',
  'índice idx_atualizacoes_secao_semana: só no PostgreSQL',
  'índice idx_atualizacoes_semana_versao: só no PostgreSQL',
  'índice idx_comentarios_acao: só no PostgreSQL',
  'índice idx_config_empresa: só no PostgreSQL',
  'índice idx_decisoes_reuniao: só no PostgreSQL',
  'índice idx_pedidos_acao: só no PostgreSQL',
  'índice idx_pedidos_status: só no PostgreSQL',
  'índice idx_tempo_acao: só no PostgreSQL',
  'índice idx_tempo_data: só no PostgreSQL',
];

test('paridade de esquema entre SQLite e PostgreSQL depois das migrações', { timeout: 120000 }, async (t) => {
  const cluster = await clusterTemporario(t);
  // O banco vai num subteste, como nos demais testes do PostgreSQL: o cluster e o banco fecham as conexões em ganchos
  // distintos, e usar o mesmo `t` para os dois fecha o mesmo pool duas vezes.
  await t.test('esquemas iguais', async (t) => {
    const [pg] = await cluster.banco(t);
    await aplicarMigracoes(pg);
    const sqlite = openDb(':memory:');
    t.after(() => sqlite.close());
    await aplicarMigracoes(sqlite);
    const difs = diferencas(await descreverEsquema(sqlite), await descreverEsquema(pg)).filter((d) => !ESPERADAS.includes(d));
    assert.deepEqual(difs, [], 'esquemas divergentes depois das migrações:\n' + difs.join('\n'));
  });
});
