// Aprovação em cadeia (migração 38): a ação demandada pelo Diretor e concluída por alguém que tem chefe entre ele e a seção da ação passa pela
// aprovação de cada chefe, do mais próximo de quem executou para cima; só depois o Diretor aceita.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

// Seed: CPE (1) tem a subseção IND (7), chefiada por Gabriela. Ana chefia o CPE. O Diretor direciona ao CPE.
const DIRETOR = 1, ANA_CPE = 3, BRUNO_COF = 4, GABRIELA_IND = 9;
const CPE = 1, IND = 7;
const TEO_IND = 51, LIA_CPE = 52; // membros criados pelo teste: Teo, do IND; Lia, do CPE
const PRAZO = '2026-12-31';

async function demo(t) {
  const db = openDb(':memory:');
  await seed(db);
  await db.prepare('update acoes set recebida_em = null').run();
  const ins = db.prepare('insert into usuarios (id, nome, email, perfil, secao_id) values (?,?,?,?,?)');
  await ins.run(TEO_IND, 'Teo Alves', 'teo@exemplo.invalid', 'membro', IND);
  await ins.run(LIA_CPE, 'Lia Campos', 'lia@exemplo.invalid', 'membro', CPE);
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
  const acao = async (uid, id) => (await call(uid, 'GET', `/acoes/${id}`)).data;
  /** O Diretor direciona ao CPE; devolve o id da ação do CPE. */
  const demandaAoCpe = async () => {
    const r = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Levantar os indicadores do trimestre', prazo: PRAZO, destino: 'especificos', secoes: [CPE] });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return (await db.prepare('select id from acoes where diretriz_id = ? and secao_id = ?').get(r.data.id, CPE)).id;
  };
  const atribuir = async (id, responsavel) => assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { responsavel_id: responsavel })).status, 200);
  const concluir = async (uid, id) => {
    assert.equal((await call(uid, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' })).status, 200);
    assert.equal((await call(uid, 'POST', `/acoes/${id}/tempo`, { minutos: 30 })).status, 201);
    return call(uid, 'PATCH', `/acoes/${id}`, { status: 'concluida' });
  };
  const aValidar = async (uid) => (await call(uid, 'GET', '/bootstrap')).data.acoes_a_validar;
  return { db, call, acao, demandaAoCpe, atribuir, concluir, aValidar };
}

test('o chefe da subseção concluiu uma demanda do Diretor: o chefe do Centro aprova antes de o Diretor aceitar', async (t) => {
  const { call, acao, demandaAoCpe, atribuir, concluir, aValidar } = await demo(t);
  const id = await demandaAoCpe();
  await atribuir(id, GABRIELA_IND);
  assert.equal((await concluir(GABRIELA_IND, id)).status, 200);

  const a = await acao(ANA_CPE, id);
  assert.equal(a.cadeia_aprovacao, true);
  assert.equal(a.aprovacoes_total, 1);
  assert.equal(a.aguardando_validacao, 'chefe', 'o Diretor ainda não aceita: antes vem o chefe do Centro');
  assert.equal(a.aprovacao_secao_sigla, 'CPE');
  assert.equal(a.pode_validar_etapa, true, 'Ana é quem está na vez');
  assert.equal((await acao(GABRIELA_IND, id)).pode_validar_etapa, false, 'Gabriela concluiu; não aprova o próprio trabalho');
  assert.equal(await aValidar(ANA_CPE), 1);

  // O Diretor não aceita antes; Gabriela e outro chefe não aprovam a etapa de Ana.
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/encerrar`)).status, 409);
  assert.equal((await call(GABRIELA_IND, 'POST', `/acoes/${id}/validar`)).status, 403);
  assert.equal((await call(BRUNO_COF, 'POST', `/acoes/${id}/validar`)).status, 404, 'o chefe de outro Centro nem enxerga a ação');

  const ok = await call(ANA_CPE, 'POST', `/acoes/${id}/validar`);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const depois = await acao(DIRETOR, id);
  assert.equal(depois.aguardando_validacao, 'diretor', 'agora sim, o aceite do Diretor');
  assert.equal(depois.validada_chefe, true);
  assert.equal(await aValidar(ANA_CPE), 0);
  assert.ok(depois.comentarios.some((c) => /Aprovada pelo chefe de CPE \(Ana Ribeiro\)\./.test(c.texto)));
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/validar`)).status, 409, 'não aprova duas vezes');
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/encerrar`)).status, 200);
});

test('um membro da subseção: primeiro o chefe da subseção, depois o do Centro, depois o Diretor', async (t) => {
  const { call, acao, demandaAoCpe, atribuir, concluir, aValidar } = await demo(t);
  const id = await demandaAoCpe();
  await atribuir(id, TEO_IND);
  assert.equal((await concluir(TEO_IND, id)).status, 200);

  const a = await acao(ANA_CPE, id);
  assert.equal(a.aprovacoes_total, 2);
  assert.equal(a.aprovacao_secao_sigla, 'IND', 'primeiro, o chefe mais próximo de quem executou');
  assert.equal(a.pode_validar_etapa, false, 'Ana espera a vez');
  const gab = await acao(GABRIELA_IND, id);
  assert.equal(gab.id, id, 'o chefe chamado a aprovar enxerga a ação, mesmo ela estando no Centro acima');
  assert.equal(gab.pode_validar_etapa, true);
  assert.equal(await aValidar(GABRIELA_IND), 1);
  assert.equal(await aValidar(ANA_CPE), 0);
  assert.equal((await call(GABRIELA_IND, 'GET', '/acoes?situacao=concluidas&secao=7&minhas=1')).data.some((x) => x.id === id), true, 'e a lista dela traz a ação');

  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/validar`)).status, 403, 'Ana não pula a vez da Gabriela');
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/encerrar`)).status, 409);
  assert.equal((await call(GABRIELA_IND, 'POST', `/acoes/${id}/validar`)).status, 200);

  const meio = await acao(ANA_CPE, id);
  assert.equal(meio.aguardando_validacao, 'chefe', 'ainda falta o chefe do Centro');
  assert.equal(meio.aprovacao_secao_sigla, 'CPE');
  assert.equal(meio.validada_chefe, false);
  assert.equal(meio.pode_validar_etapa, true);
  assert.equal(await aValidar(GABRIELA_IND), 0);
  assert.equal(await aValidar(ANA_CPE), 1);
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/encerrar`)).status, 409, 'o Diretor continua esperando');

  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/validar`)).status, 200);
  assert.equal((await acao(DIRETOR, id)).aguardando_validacao, 'diretor');
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/encerrar`)).status, 200);
});

test('devolver recomeça a cadeia: quem está na vez devolve, e a nova conclusão fotografa a cadeia de novo', async (t) => {
  const { db, call, acao, demandaAoCpe, atribuir, concluir } = await demo(t);
  const id = await demandaAoCpe();
  await atribuir(id, TEO_IND);
  await concluir(TEO_IND, id);
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/devolver`, { comentario: 'Falta o anexo.' })).status, 403, 'não é a vez de Ana');
  assert.equal((await call(GABRIELA_IND, 'POST', `/acoes/${id}/validar`)).status, 200);
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/devolver`, { comentario: 'Falta o anexo.' })).status, 200);

  const a = await acao(ANA_CPE, id);
  assert.equal(a.status, 'em_andamento');
  assert.equal(a.aprovacoes_total, 0, 'as aprovações da conclusão anterior saíram');
  assert.equal((await db.prepare('select count(*) as n from acao_aprovacoes where acao_id = ?').get(id)).n, 0);

  assert.equal((await call(TEO_IND, 'PATCH', `/acoes/${id}`, { status: 'concluida' })).status, 200);
  const de_novo = await acao(ANA_CPE, id);
  assert.equal(de_novo.aprovacoes_total, 2, 'concluiu de novo: a cadeia recomeça pelo primeiro nível');
  assert.equal(de_novo.aprovacao_secao_sigla, 'IND');
});

test('sem chefe entre quem executa e o Diretor, nada muda: o chefe do Centro executando ele mesmo vai direto ao Diretor', async (t) => {
  const { call, acao, demandaAoCpe, concluir } = await demo(t);
  const id = await demandaAoCpe();
  assert.equal((await concluir(ANA_CPE, id)).status, 200);
  const a = await acao(ANA_CPE, id);
  assert.equal(a.cadeia_aprovacao, false);
  assert.equal(a.aguardando_validacao, 'diretor');
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/encerrar`)).status, 200);
});

test('um membro do próprio Centro: continua um só nível (o chefe do Centro), como antes', async (t) => {
  const { call, acao, demandaAoCpe, atribuir, concluir, aValidar } = await demo(t);
  const id = await demandaAoCpe();
  await atribuir(id, LIA_CPE);
  await concluir(LIA_CPE, id);
  const a = await acao(ANA_CPE, id);
  assert.equal(a.aprovacoes_total, 1);
  assert.equal(a.aprovacao_secao_sigla, 'CPE');
  assert.equal(await aValidar(ANA_CPE), 1);
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/validar`)).status, 200);
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/encerrar`)).status, 200);
});

test('ação que o chefe criou para um membro (sem demanda do Diretor) segue a validação de sempre, sem cadeia', async (t) => {
  const { call, acao, concluir } = await demo(t);
  const id = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Ação interna do CPE', prazo: PRAZO, responsavel_id: TEO_IND })).data.id;
  assert.ok(id, 'o chefe atribui a um membro da subseção');
  await concluir(TEO_IND, id);
  const a = await acao(ANA_CPE, id);
  assert.equal(a.cadeia_aprovacao, false);
  assert.equal(a.aguardando_validacao, 'chefe');
  assert.equal(a.pode_validar_etapa, true);
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/validar`)).status, 200);
});
