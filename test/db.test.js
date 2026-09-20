import test from 'node:test';
import assert from 'node:assert/strict';
import { createPgDb } from '../server/db.js';

// Pool instrumentado: não abre conexões nem lê DATABASE_URL.
function bancoSimulado({ falharRollback = false } = {}) {
  const eventos = [];
  const gravados = [];
  let proximoId = 0;
  const executar = async (conexao, sql, params, pendentes = gravados) => {
    eventos.push({ conexao, sql, params });
    if (sql.includes('falhar')) throw new Error('Falha de consulta simulada');
    if (sql.startsWith('insert')) pendentes.push(params[0]);
    return { rows: [{ id: 42 }], rowCount: 1 };
  };
  const pool = {
    query: (sql, params) => executar('pool', sql, params),
    async connect() {
      const id = ++proximoId;
      const pendentes = [];
      return {
        async query(sql, params) {
          if (sql === 'COMMIT') gravados.push(...pendentes);
          if (sql === 'ROLLBACK' && falharRollback) throw new Error('Falha de rollback');
          return executar(id, sql, params, pendentes);
        },
        release(erro) { eventos.push({ conexao: id, liberar: true, erro }); },
      };
    },
    async end() {},
  };
  return { db: createPgDb(pool), eventos, gravados };
}

test('PostgreSQL: leituras e escritas usam o cliente da transação, mesmo preparadas antes', async () => {
  const { db, eventos, gravados } = bancoSimulado();
  const consulta = db.prepare('select id from acoes where id = ?');
  const resultado = await db.transaction(async () => {
    await db.exec('create table exemplo (id integer)');
    await consulta.all(1);
    assert.equal((await consulta.get(1)).id, 42);
    return db.prepare('insert into acoes (titulo) values (?)').run('Teste');
  });
  assert.equal(resultado.lastInsertRowid, 42);
  assert.deepEqual(gravados, ['Teste']);
  assert.ok(eventos.every(e => e.conexao === 1));
  assert.equal(eventos[0].sql, 'BEGIN');
  assert.equal(eventos.at(-2).sql, 'COMMIT');
  assert.equal(eventos.at(-1).liberar, true);
  assert.ok(eventos.some(e => e.sql === 'insert into acoes (titulo) values ($1) RETURNING id'));
});

test('PostgreSQL: falha desfaz escritas anteriores e libera o cliente', async () => {
  const { db, eventos, gravados } = bancoSimulado();
  await assert.rejects(db.transaction(async () => {
    await db.prepare('insert into acoes (titulo) values (?)').run('Não persistir');
    await db.prepare('select falhar').get();
  }), /Falha de consulta/);
  assert.deepEqual(gravados, []);
  assert.equal(eventos.at(-2).sql, 'ROLLBACK');
  assert.equal(eventos.at(-1).liberar, true);
  assert.ok(!eventos.some(e => e.sql === 'COMMIT'));
});

test('PostgreSQL: transações simultâneas e consultas externas mantêm conexões separadas', async () => {
  const { db, eventos, gravados } = bancoSimulado();
  let liberar, avisar;
  const espera = new Promise(resolve => { liberar = resolve; });
  const iniciou = new Promise(resolve => { avisar = resolve; });
  const primeira = db.transaction(async () => {
    await db.prepare('insert into config (chave, valor) values (?, ?)').run('primeira', '1');
    avisar();
    await espera;
    await db.prepare('select id from acoes').all();
    throw new Error('Desfazer primeira');
  });
  const rejeicao = assert.rejects(primeira, /Desfazer primeira/);
  await iniciou;
  try {
    await db.prepare('select id from usuarios').get();
    await db.transaction(async () => {
      await db.prepare('insert into config (chave, valor) values (?, ?)').run('segunda', '2');
    });
  } finally {
    liberar();
  }
  await rejeicao;
  assert.deepEqual(gravados, ['segunda']);
  assert.equal(eventos.find(e => e.sql === 'select id from usuarios').conexao, 'pool');
  assert.equal(eventos.find(e => e.sql === 'select id from acoes').conexao, 1);
  assert.equal(eventos.find(e => e.params?.[0] === 'segunda').conexao, 2);
});

test('PostgreSQL: cliente com rollback falho é descartado e erro original é preservado', async () => {
  const { db, eventos } = bancoSimulado({ falharRollback: true });
  await assert.rejects(db.transaction(async () => {
    throw new Error('Erro original');
  }), /Erro original/);
  assert.match(eventos.at(-1).erro.message, /Falha de rollback/);
});

test('PostgreSQL: falha de conectividade é propagada', async () => {
  const db = createPgDb({ query: async () => { throw new Error('Banco indisponível'); } });
  await assert.rejects(db.prepare('select 1').get(), /Banco indisponível/);
});

test('PostgreSQL: transação aninhada falha antes de adquirir outro cliente', async () => {
  const { db, eventos } = bancoSimulado();
  await assert.rejects(db.transaction(async () => {
    await db.transaction(async () => {});
  }), /aninhadas/);
  assert.ok(eventos.every(e => e.conexao === 1));
  assert.equal(eventos.at(-2).sql, 'ROLLBACK');
});
