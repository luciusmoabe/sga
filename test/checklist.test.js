// Checklist de itens dentro da ação: apoio visual, sem efeito no status nem na regra de concluir.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

const DIRETOR = 1, APOIO = 2, ADMIN = 10;

async function demo(t) {
  const db = openDb(':memory:');
  await seed(db);
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
  const chefes = await db.prepare(`select u.id, u.secao_id from usuarios u join secoes s on s.id = u.secao_id
    where u.perfil = 'chefe' and s.pai_id is null order by u.id`).all();
  const nova = async (chefe, titulo = 'Ação para checklist') =>
    (await call(chefe.id, 'POST', '/acoes', { titulo, prazo: '2026-12-31' })).data.id;
  return { db, call, chefes, nova };
}

test('o chefe adiciona, marca, edita e exclui itens do checklist; a contagem aparece na ação', async (t) => {
  const { call, chefes, nova } = await demo(t);
  const [c1, c2] = chefes;
  const id = await nova(c1);

  assert.equal((await call(c1.id, 'POST', `/acoes/${id}/checklist`, { texto: '   ' })).status, 400, 'texto obrigatório');
  const i1 = await call(c1.id, 'POST', `/acoes/${id}/checklist`, { texto: 'Levantar os dados' });
  assert.equal(i1.status, 201);
  assert.equal(i1.data.concluido, false);
  const i2 = await call(c1.id, 'POST', `/acoes/${id}/checklist`, { texto: 'Redigir a minuta' });
  assert.equal(i2.status, 201);

  // Outro Centro não enxerga a ação: nem adiciona, nem marca, nem exclui.
  assert.equal((await call(c2.id, 'POST', `/acoes/${id}/checklist`, { texto: 'x' })).status, 404);
  assert.equal((await call(c2.id, 'PATCH', `/acoes/${id}/checklist/${i1.data.id}`, { concluido: true })).status, 404);
  assert.equal((await call(c2.id, 'DELETE', `/acoes/${id}/checklist/${i1.data.id}`)).status, 404);

  const marcado = await call(c1.id, 'PATCH', `/acoes/${id}/checklist/${i1.data.id}`, { concluido: true });
  assert.equal(marcado.status, 200);
  assert.equal(marcado.data.concluido, true);
  assert.ok(marcado.data.concluido_em);

  const editado = await call(c1.id, 'PATCH', `/acoes/${id}/checklist/${i2.data.id}`, { texto: 'Redigir e revisar a minuta' });
  assert.equal(editado.status, 200);
  assert.equal(editado.data.texto, 'Redigir e revisar a minuta');
  assert.equal((await call(c1.id, 'PATCH', `/acoes/${id}/checklist/${i2.data.id}`, { texto: '' })).status, 400);

  // A contagem aparece na própria ação (para o selo "1/2" nas listas).
  const acao = (await call(c1.id, 'GET', `/acoes/${id}`)).data;
  assert.equal(acao.checklist_total, 2);
  assert.equal(acao.checklist_feitos, 1);
  assert.deepEqual(acao.checklist.map((it) => it.texto).sort(), ['Levantar os dados', 'Redigir e revisar a minuta'].sort());

  // Desmarcar limpa quem/quando concluiu; excluir remove e atualiza a contagem.
  const desmarcado = await call(c1.id, 'PATCH', `/acoes/${id}/checklist/${i1.data.id}`, { concluido: false });
  assert.equal(desmarcado.data.concluido, false);
  assert.equal(desmarcado.data.concluido_em, null);
  assert.equal((await call(c1.id, 'DELETE', `/acoes/${id}/checklist/${i2.data.id}`)).status, 200);
  assert.equal((await call(c1.id, 'DELETE', `/acoes/${id}/checklist/999999`)).status, 404);
  const depois = (await call(c1.id, 'GET', `/acoes/${id}`)).data;
  assert.equal(depois.checklist_total, 1);
  assert.equal(depois.checklist_feitos, 0);
});

test('checklist não muda o status nem afeta a regra de concluir (que continua exigindo tempo)', async (t) => {
  const { call, chefes, nova } = await demo(t);
  const c = chefes[0];
  const id = await nova(c);
  await call(c.id, 'POST', `/acoes/${id}/checklist`, { texto: 'Item 1' });
  await call(c.id, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' });
  const item = await call(c.id, 'POST', `/acoes/${id}/checklist`, { texto: 'Item 2' });
  await call(c.id, 'PATCH', `/acoes/${id}/checklist/${item.data.id}`, { concluido: true });
  // Ambos os itens marcados, mas sem tempo registrado: continua recusando concluir.
  await call(c.id, 'PATCH', `/acoes/${id}/checklist/999999999`, {}); // no-op, não deveria quebrar nada
  const acaoAntes = (await call(c.id, 'GET', `/acoes/${id}`)).data;
  assert.equal(acaoAntes.status, 'em_andamento', 'marcar itens não muda o status sozinho');
  assert.equal((await call(c.id, 'PATCH', `/acoes/${id}`, { status: 'concluida' })).status, 422, 'ainda exige tempo, mesmo com checklist completo');
  await call(c.id, 'POST', `/acoes/${id}/tempo`, { minutos: 10 });
  assert.equal((await call(c.id, 'PATCH', `/acoes/${id}`, { status: 'concluida' })).status, 200);
});

test('Diretor, Apoio e Administrador só consultam; Diretor e Apoio nem veem ações internas', async (t) => {
  const { db, call, chefes, nova } = await demo(t);
  const id = await nova(chefes[0]);
  const item = await call(chefes[0].id, 'POST', `/acoes/${id}/checklist`, { texto: 'Item' });
  for (const uid of [DIRETOR, APOIO]) {
    assert.equal((await call(uid, 'POST', `/acoes/${id}/checklist`, { texto: 'x' })).status, 403);
    assert.equal((await call(uid, 'PATCH', `/acoes/${id}/checklist/${item.data.id}`, { concluido: true })).status, 403);
    assert.equal((await call(uid, 'GET', `/acoes/${id}`)).data.checklist.length, 1, `${uid} consulta o checklist`);
  }
  assert.equal((await call(ADMIN, 'POST', `/acoes/${id}/checklist`, { texto: 'Do Administrador' })).status, 201);

  const interna = await db.prepare(`select id from acoes where interna = 1 and compartilhada = 0 and status != 'concluida' and encerrada = 0 and arquivada = 0 limit 1`).get();
  assert.ok(interna);
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${interna.id}/checklist`, { texto: 'x' })).status, 404);
  assert.equal((await call(ADMIN, 'POST', `/acoes/${interna.id}/checklist`, { texto: 'x' })).status, 201);
});

test('ação encerrada não aceita mais mudanças no checklist; excluir a ação apaga os itens', async (t) => {
  const { db, call, chefes, nova } = await demo(t);
  const c = chefes[0];
  const id = await nova(c);
  const item = await call(c.id, 'POST', `/acoes/${id}/checklist`, { texto: 'Item' });
  await call(c.id, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' });
  await call(c.id, 'POST', `/acoes/${id}/tempo`, { minutos: 5 });
  await call(c.id, 'PATCH', `/acoes/${id}`, { status: 'concluida' });
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/encerrar`, {})).status, 200);
  assert.equal((await call(c.id, 'POST', `/acoes/${id}/checklist`, { texto: 'Tarde demais' })).status, 409);
  assert.equal((await call(c.id, 'PATCH', `/acoes/${id}/checklist/${item.data.id}`, { concluido: false })).status, 409);
  assert.equal((await call(c.id, 'DELETE', `/acoes/${id}/checklist/${item.data.id}`)).status, 409);

  const outra = await nova(c, 'Outra ação');
  await call(c.id, 'POST', `/acoes/${outra}/checklist`, { texto: 'Vai sumir com a ação' });
  assert.equal((await db.prepare('select count(*) n from acao_checklist where acao_id = ?').get(outra)).n, 1);
  assert.equal((await call(c.id, 'DELETE', `/acoes/${outra}`)).status, 200);
  assert.equal((await db.prepare('select count(*) n from acao_checklist where acao_id = ?').get(outra)).n, 0);
});

test('excluir usuário com itens de checklist registrados é recusado', async (t) => {
  const { call, chefes, nova } = await demo(t);
  const c = chefes[0];
  const id = await nova(c);
  await call(c.id, 'POST', `/acoes/${id}/checklist`, { texto: 'Fica no histórico' });
  const r = await call(ADMIN, 'DELETE', `/usuarios/${c.id}`);
  assert.equal(r.status, 409);
  assert.match(r.data.erro, /itens de checklist/);
});
