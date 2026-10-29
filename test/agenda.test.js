// Agenda: GET /api/tarefas devolve as tarefas das ações que a pessoa enxerga e as atribuídas a ela.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

const DIRETOR = 1, APOIO = 2, ANA_CPE = 3, BRUNO_COF = 4, GABRIELA_IND = 9, ADMIN = 10;
const PRAZO = '2026-12-31';

async function demo(t) {
  const db = openDb(':memory:');
  await seed(db);
  const consulta = (await db.prepare("insert into usuarios (nome, email, perfil) values ('Leitor', 'leitor@exemplo.invalid', 'consulta')").run()).lastInsertRowid;
  const server = createApp(db, { auth: { mode: 'demo' } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((ok) => server.close(ok)); await db.close(); });
  const call = async (uid, method, caminho, body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api${caminho}`, {
      method, headers: { 'x-user-id': String(uid), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  const tarefa = async (uid, acao, corpo) => (await call(uid, 'POST', `/acoes/${acao}/checklist`, corpo)).data;
  return { db, call, consulta, tarefa };
}

test('chefe vê as tarefas da própria árvore, ordenadas por data (sem data no fim), com a ação e a seção', async (t) => {
  const { call, tarefa } = await demo(t);
  const acao = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Plano', prazo: PRAZO })).data.id;
  const semData = await tarefa(ANA_CPE, acao, { texto: 'Sem data' });
  const tarde = await tarefa(ANA_CPE, acao, { texto: 'Tarde', data: '2026-10-20' });
  const cedo = await tarefa(ANA_CPE, acao, { texto: 'Cedo', data: '2026-09-10', responsavel_id: ANA_CPE });

  const lista = (await call(ANA_CPE, 'GET', '/tarefas')).data;
  assert.deepEqual(lista.map((x) => x.id), [cedo.id, tarde.id, semData.id]);
  assert.equal(lista[0].acao_titulo, 'Plano');
  assert.equal(lista[0].secao_sigla, 'CPE');
  assert.equal(lista[0].responsavel_nome, 'Ana Ribeiro');
  assert.equal(lista[0].atrasada, true);
  assert.ok(lista.every((x) => x.acao_visivel === true));

  assert.deepEqual((await call(BRUNO_COF, 'GET', '/tarefas')).data, [], 'outro Centro não vê');
  await call(ANA_CPE, 'PATCH', `/acoes/${acao}/checklist/${cedo.id}`, { concluido: true });
  assert.equal((await call(ANA_CPE, 'GET', '/tarefas')).data.find((x) => x.id === cedo.id).atrasada, false);
});

test('tarefa atribuída a quem não enxerga a ação aparece só como informação (acao_visivel falso)', async (t) => {
  const { call, tarefa } = await demo(t);
  // A ação é do CPE; a chefe da subseção IND pode ser responsável, mas não enxerga a ação do Centro.
  const acao = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Do Centro', prazo: PRAZO })).data.id;
  const t1 = await tarefa(ANA_CPE, acao, { texto: 'Para a subseção', data: '2026-10-05', responsavel_id: GABRIELA_IND });
  await tarefa(ANA_CPE, acao, { texto: 'Da Ana', data: '2026-10-06', responsavel_id: ANA_CPE });

  const dela = (await call(GABRIELA_IND, 'GET', '/tarefas')).data;
  assert.deepEqual(dela.map((x) => x.id), [t1.id], 'só a atribuída a ela');
  assert.equal(dela[0].acao_visivel, false);
  assert.equal(dela[0].acao_titulo, 'Do Centro');
  assert.equal((await call(GABRIELA_IND, 'GET', `/acoes/${acao}`)).status, 404, 'a ação em si continua fechada');
});

test('Diretor, Apoio e Administrador veem as tarefas das ações visíveis; internas só o Administrador; Consulta lê', async (t) => {
  const { db, call, consulta, tarefa } = await demo(t);
  const acao = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Aberta', prazo: PRAZO })).data.id;
  const feita = await tarefa(ANA_CPE, acao, { texto: 'Visível', data: '2026-10-05' });
  const interna = (await db.prepare(`select id from acoes where interna = 1 and compartilhada = 0 and status != 'concluida' and encerrada = 0 and arquivada = 0 limit 1`).get()).id;
  const dela = await tarefa(ADMIN, interna, { texto: 'Da interna', data: '2026-10-06' });

  for (const uid of [DIRETOR, APOIO, consulta]) {
    const ids = (await call(uid, 'GET', '/tarefas')).data.map((x) => x.id);
    assert.ok(ids.includes(feita.id), `${uid} vê a tarefa da ação aberta`);
    assert.ok(!ids.includes(dela.id), `${uid} não vê a de ação interna`);
  }
  assert.ok((await call(ADMIN, 'GET', '/tarefas')).data.some((x) => x.id === dela.id));
});

test('tarefas de ação arquivada ou encerrada ficam fora da agenda', async (t) => {
  const { call, tarefa } = await demo(t);
  const acao = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Vai arquivar', prazo: PRAZO })).data.id;
  const item = await tarefa(ANA_CPE, acao, { texto: 'Item', data: '2026-10-05' });
  assert.ok((await call(ANA_CPE, 'GET', '/tarefas')).data.some((x) => x.id === item.id));
  await call(ANA_CPE, 'POST', `/acoes/${acao}/arquivar`);
  assert.ok(!(await call(ANA_CPE, 'GET', '/tarefas')).data.some((x) => x.id === item.id));
});
