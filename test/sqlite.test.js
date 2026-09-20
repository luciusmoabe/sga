import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, subarvore, nivel } from '../server/db.js';
import { seed } from '../server/seed.js';

test('SQLite: rollback não captura gravações externas e leituras aguardam a transação', { timeout: 3000 }, async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let liberar, avisar;
  const espera = new Promise(resolve => { liberar = resolve; });
  const iniciou = new Promise(resolve => { avisar = resolve; });
  const primeira = db.transaction(async () => {
    await db.prepare('insert into config (chave, valor) values (?, ?)').run('descartar', '1');
    avisar();
    await espera;
    throw new Error('Desfazer primeira');
  });
  const rejeicao = assert.rejects(primeira, /Desfazer primeira/);
  await iniciou;
  let leu = false;
  const leitura = db.prepare('select * from config').all().then(rows => { leu = true; return rows; });
  const externa = db.prepare('insert into config (chave, valor) values (?, ?)').run('externa', '2');
  const segunda = db.transaction(async () => {
    await db.prepare('insert into config (chave, valor) values (?, ?)').run('segunda', '3');
  });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(leu, false, 'leitura não observa dados ainda não confirmados');
  } finally {
    liberar();
  }
  await Promise.all([rejeicao, externa, segunda]);
  assert.deepEqual(await leitura, []);
  assert.deepEqual((await db.prepare('select chave from config order by chave').all()).map(r => r.chave), ['externa', 'segunda']);
});

test('SQLite: várias transações concorrentes confirmam integralmente', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await Promise.all(Array.from({ length: 12 }, (_, i) => db.transaction(async () => {
    await db.prepare('insert into config (chave, valor) values (?, ?)').run(`chave-${i}`, 'inicial');
    await new Promise(resolve => setImmediate(resolve));
    await db.prepare('update config set valor = ? where chave = ?').run('final', `chave-${i}`);
  })));
  const rows = await db.prepare('select * from config').all();
  assert.equal(rows.length, 12);
  assert.ok(rows.every(r => r.valor === 'final'));
});

test('SQLite: transação aninhada é rejeitada e fila continua utilizável', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await assert.rejects(db.transaction(async () => {
    await db.prepare('insert into config (chave, valor) values (?, ?)').run('descartar', '1');
    await db.transaction(async () => {});
  }), /aninhadas/);
  assert.deepEqual(await db.prepare('select * from config').all(), []);
  await db.transaction(async () => db.prepare('insert into config (chave, valor) values (?, ?)').run('ok', '2'));
  assert.equal((await db.prepare('select count(*) n from config').get()).n, 1);
});

test('SQLite: seed aguarda commit e propaga falhas sem deixar carga parcial', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const preparar = db.prepare.bind(db);
  db.prepare = (sql) => sql.startsWith('insert into usuarios')
    ? { run: async () => { throw new Error('Falha no seed'); } }
    : preparar(sql);
  await assert.rejects(seed(db), /Falha no seed/);
  db.prepare = preparar;
  assert.equal((await db.prepare('select count(*) n from secoes').get()).n, 0);
  await seed(db);
  assert.equal((await db.prepare('select count(*) n from usuarios').get()).n, 9);
  assert.deepEqual((await subarvore(db, 1)).sort((a, b) => a - b), [1, 7, 9]);
  assert.equal(await nivel(db, 9), 3);
  await db.prepare('update secoes set pai_id = ? where id = ?').run(2, 7);
  assert.deepEqual(await subarvore(db, 1), [1]);
  assert.deepEqual((await subarvore(db, 2)).sort((a, b) => a - b), [2, 7, 9]);
});
