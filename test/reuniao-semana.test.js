// A semana da reunião não deve depender do corte das 12h quando ela é iniciada no próprio dia.
process.env.SGC_NOW = '2026-09-19T10:00:00'; // sábado

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

const { openDb } = await import('../server/db.js');
const { seed } = await import('../server/seed.js');
const { createApp } = await import('../server/app.js');

async function iniciarEm(agora) {
  process.env.SGC_NOW = agora;
  const db = openDb(':memory:');
  await seed(db);
  const server = createApp(db, { auth: { mode: 'demo' } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/reunioes/iniciar`, { method: 'POST', headers: { 'x-user-id': '1', 'content-type': 'application/json' }, body: '{}' });
    return { status: r.status, ...(await r.json()) };
  } finally {
    await new Promise((ok) => server.close(ok));
    await db.close();
  }
}

test('reunião iniciada na terça de manhã ou à tarde trata da semana de hoje', async () => {
  for (const agora of ['2026-09-22T09:30:00', '2026-09-22T14:30:00', '2026-09-22T23:00:00']) {
    const r = await iniciarEm(agora);
    assert.equal(r.status, 201, agora);
    assert.equal(r.reuniao.data, '2026-09-22', agora);
    assert.equal(r.reuniao.semana, '2026-09-22', `semana em ${agora}`);
  }
});

test('reunião iniciada em outro dia trata da próxima reunião', async () => {
  assert.equal((await iniciarEm('2026-09-19T10:00:00')).reuniao.semana, '2026-09-22'); // sábado
  assert.equal((await iniciarEm('2026-09-21T17:00:00')).reuniao.semana, '2026-09-22'); // segunda
  assert.equal((await iniciarEm('2026-09-23T10:00:00')).reuniao.semana, '2026-09-29'); // quarta
});
