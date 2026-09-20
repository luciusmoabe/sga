import Database from 'better-sqlite3';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import 'dotenv/config';

const { Pool, types } = pg;
// Garante que contadores e identificadores int8 sejam retornados como Number no JavaScript
types.setTypeParser(types.builtins.INT8, (val) => (val === null ? null : parseInt(val, 10)));

const SCHEMA = `
create table if not exists secoes (
  id integer primary key,
  nome text not null,
  sigla text,
  tipo text not null check (tipo in ('centro','coordenacao','subsecao')),
  pai_id integer references secoes(id),
  ordem integer not null default 0,
  ativa integer not null default 1,
  chefe_id integer,
  criada_em text not null
);
create table if not exists usuarios (
  id integer primary key,
  nome text not null,
  email text,
  perfil text not null check (perfil in ('diretor','chefe','apoio')),
  secao_id integer references secoes(id),
  ativo integer not null default 1
);
create table if not exists diretrizes (
  id integer primary key,
  titulo text not null,
  detalhe text,
  destino text not null check (destino in ('todos','especificos')),
  prazo text not null,
  prioridade text not null default 'media',
  criado_por integer references usuarios(id),
  criado_em text not null,
  reuniao_id integer
);
create table if not exists acoes (
  id integer primary key,
  diretriz_id integer references diretrizes(id),
  secao_id integer not null references secoes(id),
  acao_pai_id integer references acoes(id),
  titulo text not null,
  detalhe text,
  status text not null default 'a_fazer',
  prazo text not null,
  prazo_original text not null,
  prioridade text not null default 'media',
  interna integer not null default 0,
  compartilhada integer not null default 0,
  encerrada integer not null default 0,
  arquivada integer not null default 0,
  concluida_em text,
  criada_em text not null
);
create index if not exists idx_acoes_secao on acoes(secao_id);
create table if not exists acao_comentarios (
  id integer primary key,
  acao_id integer not null references acoes(id),
  usuario_id integer references usuarios(id),
  texto text not null,
  criado_em text not null
);
create table if not exists tempo (
  id integer primary key,
  acao_id integer not null references acoes(id),
  usuario_id integer references usuarios(id),
  data text not null,
  minutos integer not null check (minutos > 0),
  criado_em text not null
);
create table if not exists pedidos_prazo (
  id integer primary key,
  acao_id integer not null references acoes(id),
  usuario_id integer references usuarios(id),
  prazo_atual text not null,
  novo_prazo text not null,
  justificativa text not null,
  status text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
  criado_em text not null,
  decidido_em text,
  decidido_por integer references usuarios(id),
  reuniao_id integer
);
create table if not exists atualizacoes (
  id integer primary key,
  secao_id integer not null references secoes(id),
  semana text not null,
  versao integer not null,
  feito text not null default '{}',
  proximo text not null default '[]',
  impedimentos text not null default '[]',
  critico integer not null default 0,
  apoio text,
  usuario_id integer references usuarios(id),
  enviada_em text not null,
  unique (secao_id, semana, versao)
);
create table if not exists combinados (
  id integer primary key,
  texto text not null,
  ordem integer not null default 0,
  ativo integer not null default 1,
  arquivado integer not null default 0,
  criado_por integer references usuarios(id),
  criado_em text not null,
  alterado_em text not null
);
create table if not exists config (
  chave text primary key,
  valor text not null
);
create table if not exists reunioes (
  id integer primary key,
  data text not null,
  semana text not null,
  iniciada_em text not null,
  encerrada_em text,
  status text not null default 'em_andamento' check (status in ('em_andamento','rascunho','enviada')),
  combinados_snapshot text not null default '[]',
  ata_texto text,
  enviada_em text,
  criada_por integer references usuarios(id)
);
create table if not exists decisoes (
  id integer primary key,
  reuniao_id integer not null references reunioes(id),
  secao_id integer references secoes(id),
  texto text not null,
  criada_em text not null,
  criada_por integer references usuarios(id)
);
`;

export function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function openSqliteDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  try { db.prepare('alter table acoes add column arquivada integer not null default 0').run(); } catch {}
  // Toda operação externa passa pela fila, inclusive leituras. Assim nenhuma
  // requisição entra na transação aberta por outra enquanto seu callback aguarda.
  const transacao = new AsyncLocalStorage();
  let fila = Promise.resolve();
  const enfileirar = (fn) => {
    const resultado = fila.then(fn);
    fila = resultado.catch(() => {});
    return resultado;
  };
  const executar = (fn) => {
    const contexto = transacao.getStore();
    if (!contexto) return enfileirar(fn);
    if (!contexto.ativa) return Promise.reject(new Error('A transação já terminou.'));
    return Promise.resolve().then(fn);
  };

  return {
    isPg: false,
    prepare(sql) {
      return Object.fromEntries(['all', 'get', 'run'].map(metodo => [
        metodo, (...params) => executar(() => db.prepare(sql)[metodo](...params)),
      ]));
    },
    async transaction(fn) {
      if (transacao.getStore()) throw new Error('Transações aninhadas não são suportadas.');
      return enfileirar(async () => {
        const contexto = { ativa: true };
        db.exec('BEGIN');
        try {
          const resultado = await transacao.run(contexto, fn);
          db.exec('COMMIT');
          return resultado;
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        } finally {
          contexto.ativa = false;
        }
      });
    },
    close: () => enfileirar(() => db.close()),
  };
}

function openPgDb(url) {
  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX) || 10,
    idleTimeoutMillis: 30_000,       // fecha conexões ociosas após 30s
    connectionTimeoutMillis: 5_000,  // erro se não conectar em 5s
  });

  return createPgDb(pool);
}

/** Adaptador separado da conexão para permitir testes sem acessar o banco real. */
export function createPgDb(pool) {
  const transacao = new AsyncLocalStorage();
  const query = (sql, params) => {
    const contexto = transacao.getStore();
    if (contexto && !contexto.ativa) throw new Error('A transação já terminou.');
    return (contexto?.client || pool).query(sql, params);
  };

  const db = {
    isPg: true,
    pool,
    prepare(sql) {
      return {
        all: async (...p) => {
          const res = await query(toPgSql(sql), p);
          return res.rows;
        },
        get: async (...p) => {
          const res = await query(toPgSql(sql), p);
          return res.rows[0] || null;
        },
        run: async (...p) => {
          let s = toPgSql(sql);
          const isInsert = /^\s*insert\s+into/i.test(sql);
          if (isInsert && !/returning/i.test(sql) && !/\binto\s+config\b/i.test(sql)) {
            s += ' RETURNING id';
          }
          const res = await query(s, p);
          return {
            changes: res.rowCount,
            lastInsertRowid: res.rows[0]?.id,
          };
        },
      };
    },
    async transaction(fn) {
      if (transacao.getStore()) throw new Error('Transações aninhadas não são suportadas.');
      const client = await pool.connect();
      const contexto = { client, ativa: true };
      let descartar;
      try {
        await client.query('BEGIN');
        const res = await transacao.run(contexto, fn);
        await client.query('COMMIT');
        return res;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) { descartar = rollbackError; }
        throw err;
      } finally {
        contexto.ativa = false;
        client.release(descartar);
      }
    },
    async close() {
      await pool.end();
    },
  };

  return db;
}

export function openDb(target = process.env.SGC_DB || 'data/sgc.db') {
  const dbUrl = process.env.DATABASE_URL;
  if (target !== ':memory:' && dbUrl) {
    return openPgDb(dbUrl);
  }
  return openSqliteDb(target);
}

/** Ids da seção e descendentes, consultados no banco para todas as instâncias. */
export async function subarvore(db, id) {
  const rows = await db.prepare(
    `with recursive t(id) as (
       select cast(? as integer) union select s.id from secoes s join t on s.pai_id = t.id
     ) select id from t`,
  ).all(id);
  return rows.map(r => r.id);
}

/** Ancestrais (do pai até o Centro), útil para permissões. */
export async function ancestrais(db, id) {
  const lista = [];
  const vistos = new Set([id]);
  let atual = (await db.prepare('select pai_id from secoes where id = ?').get(id))?.pai_id;
  while (atual) {
    if (vistos.has(atual)) throw new Error('A estrutura de seções contém um ciclo.');
    vistos.add(atual);
    lista.push(atual);
    atual = (await db.prepare('select pai_id from secoes where id = ?').get(atual))?.pai_id;
  }
  return lista;
}

/** Centro = 1, subseção = 2, subseção da subseção = 3. */
export async function nivel(db, id) {
  return 1 + (await ancestrais(db, id)).length;
}

export async function estaVazio(db) {
  if (db.isPg) return false; // PostgreSQL é provisionado por migrações/carga explícita.
  return (await db.prepare('select count(*) n from usuarios').get()).n === 0;
}
