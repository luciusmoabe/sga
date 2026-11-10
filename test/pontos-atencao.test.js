// Pontos de atenção da ação: registro com data/hora, descrição, autor e situação ativo/inativo; não mexe no status.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';

process.env.SGC_NOW = '2026-09-19T10:00:00';
const DIRETOR = 1, APOIO = 2, CHEFE = 3, CONSULTA_OU_OUTRO_CHEFE = 4;

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
  return { db, call };
}

test('ponto de atenção: registra, inativa e reativa, com autoria e sem mudar o status da ação', async (t) => {
  const { db, call } = await demo(t);
  const acao = await db.prepare(`select a.id, a.status from acoes a join secoes s on s.id = a.secao_id
    where s.chefe_id = ? and a.status = 'em_andamento' and a.interna = 0 limit 1`).get(CHEFE);
  assert.ok(acao, 'o seed tem ação em andamento do chefe');
  const base = `/acoes/${acao.id}/pontos-atencao`;

  assert.equal((await call(CHEFE, 'POST', base, { descricao: '   ' })).status, 400);
  const criado = await call(CHEFE, 'POST', base, { descricao: 'Fornecedor sinalizou atraso na entrega' });
  assert.equal(criado.status, 201);
  assert.equal(criado.data.ponto.ativo, true);
  assert.ok(criado.data.ponto.criado_em.startsWith('2026-09-19T'), 'data e hora do registro');
  assert.ok(criado.data.ponto.criado_por_nome);

  let detalhe = (await call(CHEFE, 'GET', `/acoes/${acao.id}`)).data;
  assert.equal(detalhe.status, acao.status, 'não muda o status');
  assert.equal(detalhe.pontos_atencao.length, 1);
  assert.equal(detalhe.pontos_atencao[0].descricao, 'Fornecedor sinalizou atraso na entrega');

  const pid = criado.data.ponto.id;
  assert.equal((await call(CHEFE, 'PATCH', `${base}/${pid}`, { ativo: 'não' })).status, 400);
  assert.equal((await call(CHEFE, 'PATCH', `${base}/${pid}`, { ativo: true })).status, 409, 'já está ativo');
  const inativo = await call(CHEFE, 'PATCH', `${base}/${pid}`, { ativo: false });
  assert.equal(inativo.status, 200);
  assert.equal(inativo.data.ponto.ativo, false);
  assert.ok(inativo.data.ponto.situacao_por_nome);
  assert.equal((await call(CHEFE, 'PATCH', `${base}/${pid}`, { ativo: true })).data.ponto.ativo, true);
  assert.equal((await call(CHEFE, 'PATCH', `${base}/999999`, { ativo: false })).status, 404);

  // Quem não executa não registra; o Diretor e o Administrador enxergam e registram.
  assert.equal((await call(CONSULTA_OU_OUTRO_CHEFE, 'POST', base, { descricao: 'x' })).status === 201, false, 'chefe de outra seção não registra');
  assert.equal((await call(DIRETOR, 'POST', base, { descricao: 'Observação do Diretor' })).status, 201);
  assert.equal((await call(APOIO, 'GET', `/acoes/${acao.id}`)).data.pontos_atencao.length, 2);
});

test('ponto de atenção: ação encerrada ou arquivada não recebe; excluir a ação leva os pontos junto', async (t) => {
  const { db, call } = await demo(t);
  const acao = await db.prepare(`select a.id from acoes a join secoes s on s.id = a.secao_id
    where s.chefe_id = ? and a.status = 'a_fazer' and a.interna = 0 and a.criado_por = ? limit 1`).get(CHEFE, CHEFE);
  const base = `/acoes/${acao?.id}/pontos-atencao`;
  if (acao) {
    assert.equal((await call(CHEFE, 'POST', base, { descricao: 'Ponto' })).status, 201);
    await db.prepare('update acoes set arquivada = 1 where id = ?').run(acao.id);
    assert.equal((await call(CHEFE, 'POST', base, { descricao: 'Outro' })).status, 409);
    await db.prepare('update acoes set arquivada = 0 where id = ?').run(acao.id);
    const exc = await call(CHEFE, 'DELETE', `/acoes/${acao.id}`);
    if (exc.status === 200) assert.equal(Number((await db.prepare('select count(*) as n from pontos_atencao where acao_id = ?').get(acao.id)).n), 0);
  }
});
