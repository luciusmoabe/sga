// Impedimentos ligados às ações: registro, resolução, histórico, bloqueio, semáforo e permissões.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

const DIRETOR = 1, APOIO = 2, ADMIN = 10;
const PRAZO = '2026-12-31';

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
  // Um chefe de Centro e outro de Centro diferente, lidos do banco de demonstração.
  const chefes = await db.prepare(`select u.id, u.secao_id from usuarios u join secoes s on s.id = u.secao_id
    where u.perfil = 'chefe' and s.pai_id is null order by u.id`).all();
  const nova = async (chefe, titulo = 'Ação para impedimento') =>
    (await call(chefe.id, 'POST', '/acoes', { titulo, prazo: PRAZO })).data.id;
  return { db, call, chefes, nova };
}

test('o chefe registra e resolve impedimentos da própria ação, com histórico', async (t) => {
  const { call, chefes, nova } = await demo(t);
  const [c1, c2] = chefes;
  const id = await nova(c1);

  assert.equal((await call(c1.id, 'POST', `/acoes/${id}/impedimentos`, { descricao: '  ' })).status, 400, 'descrição obrigatória');
  const r1 = await call(c1.id, 'POST', `/acoes/${id}/impedimentos`, { descricao: 'Sem acesso ao sistema', apoio: 'Liberar o perfil' });
  assert.equal(r1.status, 201);
  assert.equal(r1.data.impedimento.aberto, true);
  assert.equal(r1.data.impedimento.critico, false);
  assert.equal(r1.data.impedimento.apoio, 'Liberar o perfil');
  assert.equal(r1.data.acao.impedimentos_abertos, 1);
  const r2 = await call(c1.id, 'POST', `/acoes/${id}/impedimentos`, { descricao: 'Fornecedor não respondeu', critico: true });
  assert.equal(r2.data.acao.impedimentos_abertos, 2);
  assert.equal(r2.data.acao.impedimento_critico, true);

  // Outro Centro não enxerga a ação: nem registra, nem resolve.
  assert.equal((await call(c2.id, 'POST', `/acoes/${id}/impedimentos`, { descricao: 'x' })).status, 404);
  assert.equal((await call(c2.id, 'POST', `/acoes/${id}/impedimentos/${r1.data.impedimento.id}/resolver`, {})).status, 404);

  const res = await call(c1.id, 'POST', `/acoes/${id}/impedimentos/${r1.data.impedimento.id}/resolver`, { resolucao: 'Acesso liberado' });
  assert.equal(res.status, 200);
  assert.equal(res.data.impedimento.aberto, false);
  assert.equal(res.data.impedimento.resolucao, 'Acesso liberado');
  assert.equal(res.data.acao.impedimentos_abertos, 1);
  assert.equal((await call(c1.id, 'POST', `/acoes/${id}/impedimentos/${r1.data.impedimento.id}/resolver`, {})).status, 409, 'já resolvido');
  assert.equal((await call(c1.id, 'POST', `/acoes/${id}/impedimentos/999999/resolver`, {})).status, 404);

  // O histórico fica na ação, do mais recente ao mais antigo, e nos comentários.
  const detalhe = (await call(c1.id, 'GET', `/acoes/${id}`)).data;
  assert.deepEqual(detalhe.impedimentos.map((i) => i.id), [r2.data.impedimento.id, r1.data.impedimento.id]);
  assert.equal(detalhe.impedimentos[1].resolvido_por_nome !== null, true);
  assert.ok(detalhe.comentarios.some((c) => /Impedimento registrado \(crítico\): Fornecedor/.test(c.texto)));
  assert.ok(detalhe.comentarios.some((c) => /Impedimento resolvido: Acesso liberado/.test(c.texto)));
  const lista = (await call(c1.id, 'GET', '/acoes')).data.find((a) => a.id === id);
  assert.equal(lista.impedimentos_abertos, 1);
});

test('bloquear exige a ação em andamento; resolver pode retomá-la', async (t) => {
  const { call, chefes, nova } = await demo(t);
  const c = chefes[0];
  const id = await nova(c);
  const aFazer = await call(c.id, 'POST', `/acoes/${id}/impedimentos`, { descricao: 'Travou', bloquear: true });
  assert.equal(aFazer.status, 409, 'a fazer não vai direto a bloqueada');
  assert.match(aFazer.data.erro, /em andamento/);
  assert.equal((await call(c.id, 'GET', `/acoes/${id}`)).data.impedimentos.length, 0, 'nada foi gravado');

  await call(c.id, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' });
  const b = await call(c.id, 'POST', `/acoes/${id}/impedimentos`, { descricao: 'Travou', bloquear: true });
  assert.equal(b.status, 201);
  assert.equal(b.data.acao.status, 'bloqueada');

  const sem = await call(c.id, 'POST', `/acoes/${id}/impedimentos/${b.data.impedimento.id}/resolver`, {});
  assert.equal(sem.data.acao.status, 'bloqueada', 'sem "retomar", o status não muda');
  const b2 = await call(c.id, 'POST', `/acoes/${id}/impedimentos`, { descricao: 'Outro' });
  const com = await call(c.id, 'POST', `/acoes/${id}/impedimentos/${b2.data.impedimento.id}/resolver`, { retomar: true });
  assert.equal(com.data.acao.status, 'em_andamento');
});

test('impedimento crítico aberto deixa o Centro em vermelho até ser resolvido', async (t) => {
  const { call, chefes, nova } = await demo(t);
  const painel = async () => (await call(DIRETOR, 'GET', '/painel')).data.itens;
  const antes = await painel();
  const item = antes.find((i) => i.cor !== 'vermelho' && chefes.some((c) => c.secao_id === i.secao.id));
  assert.ok(item, 'a demonstração tem um Centro que não está em vermelho');
  const chefe = chefes.find((c) => c.secao_id === item.secao.id);
  const id = await nova(chefe);

  const imp = await call(chefe.id, 'POST', `/acoes/${id}/impedimentos`, { descricao: 'Bloqueio grave', critico: true });
  const durante = (await painel()).find((i) => i.secao.id === item.secao.id);
  assert.equal(durante.cor, 'vermelho');
  assert.equal(durante.critico, true);
  assert.equal(durante.impedimentos_criticos, 1);

  await call(chefe.id, 'POST', `/acoes/${id}/impedimentos/${imp.data.impedimento.id}/resolver`, {});
  const depois = (await painel()).find((i) => i.secao.id === item.secao.id);
  assert.equal(depois.cor, item.cor, 'voltou à cor de antes');
  assert.equal(depois.impedimentos_criticos, 0);

  // Impedimento não crítico não muda a cor.
  await call(chefe.id, 'POST', `/acoes/${id}/impedimentos`, { descricao: 'Incômodo' });
  assert.equal((await painel()).find((i) => i.secao.id === item.secao.id).cor, item.cor);
});

test('Diretor, Apoio e Administrador registram e resolvem; ações internas só o Administrador vê', async (t) => {
  const { db, call, chefes, nova } = await demo(t);
  const id = await nova(chefes[0]);
  for (const uid of [DIRETOR, APOIO, ADMIN]) {
    const r = await call(uid, 'POST', `/acoes/${id}/impedimentos`, { descricao: `Registro de ${uid}`, critico: uid === DIRETOR });
    assert.equal(r.status, 201, `perfil ${uid} registra`);
    assert.equal((await call(uid, 'POST', `/acoes/${id}/impedimentos/${r.data.impedimento.id}/resolver`, { resolucao: 'ok' })).status, 200, `perfil ${uid} resolve`);
  }
  const interna = await db.prepare(`select id from acoes where interna = 1 and compartilhada = 0 and status != 'concluida' and encerrada = 0 and arquivada = 0 limit 1`).get();
  assert.ok(interna);
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${interna.id}/impedimentos`, { descricao: 'x' })).status, 404);
  assert.equal((await call(APOIO, 'POST', `/acoes/${interna.id}/impedimentos`, { descricao: 'x' })).status, 404);
  assert.equal((await call(ADMIN, 'POST', `/acoes/${interna.id}/impedimentos`, { descricao: 'x' })).status, 201);
});

test('concluir encerra os impedimentos abertos; ação concluída não recebe novos', async (t) => {
  const { call, chefes, nova } = await demo(t);
  const c = chefes[0];
  const id = await nova(c);
  await call(c.id, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' });
  const imp = await call(c.id, 'POST', `/acoes/${id}/impedimentos`, { descricao: 'Pendência menor' });
  await call(c.id, 'POST', `/acoes/${id}/tempo`, { minutos: 30 });
  assert.equal((await call(c.id, 'PATCH', `/acoes/${id}`, { status: 'concluida' })).status, 200);
  const detalhe = (await call(c.id, 'GET', `/acoes/${id}`)).data;
  const registro = detalhe.impedimentos.find((i) => i.id === imp.data.impedimento.id);
  assert.equal(registro.aberto, false);
  assert.equal(registro.resolucao, 'Ação concluída.');
  assert.equal((await call(c.id, 'POST', `/acoes/${id}/impedimentos`, { descricao: 'Tarde demais' })).status, 409);
});

test('excluir a ação apaga os impedimentos; excluir usuário com impedimentos registrados é recusado', async (t) => {
  const { db, call, chefes, nova } = await demo(t);
  const c = chefes[0];
  const id = await nova(c);
  await call(c.id, 'POST', `/acoes/${id}/impedimentos`, { descricao: 'Vai sumir com a ação' });
  assert.equal((await db.prepare('select count(*) n from impedimentos where acao_id = ?').get(id)).n, 1);
  assert.equal((await call(c.id, 'DELETE', `/acoes/${id}`)).status, 200);
  assert.equal((await db.prepare('select count(*) n from impedimentos where acao_id = ?').get(id)).n, 0);

  const outra = await nova(c, 'Outra ação');
  await call(c.id, 'POST', `/acoes/${outra}/impedimentos`, { descricao: 'Fica no histórico' });
  const r = await call(ADMIN, 'DELETE', `/usuarios/${c.id}`);
  assert.equal(r.status, 409);
  assert.match(r.data.erro, /impedimentos registrados/);
});
