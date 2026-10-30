// Membro da equipe, responsável pela ação, validação de quem delegou e demanda de entidade externa.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { aplicarMigracoes } from '../server/migrations.js';
import { cadastrarChefe } from '../server/cadastro-chefes.js';

const DIRETOR = 1, ANA_CPE = 3, BRUNO_COF = 4, GABRIELA_IND = 9, ADMIN = 10;
const CPE = 1, COF = 2;
const PRAZO = '2026-12-31';

async function demo(t) {
  const db = openDb(':memory:');
  await seed(db);
  const membro = async (nome, secao) => (await db.prepare('insert into usuarios (nome, email, perfil, secao_id) values (?, ?, ?, ?)')
    .run(nome, `${nome.toLowerCase().replace(/ /g, '.')}@exemplo.invalid`, 'membro', secao)).lastInsertRowid;
  const m1 = await membro('Marta Lima', CPE);
  const m2 = await membro('Nuno Reis', CPE);
  const mCof = await membro('Olga Dias', COF);
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
  const criar = async (uid, titulo, extra = {}) => (await call(uid, 'POST', '/acoes', { titulo, prazo: PRAZO, ...extra })).data;
  /** Executa o caminho em_andamento → tempo → concluída como `uid`. */
  const concluir = async (uid, id) => {
    assert.equal((await call(uid, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' })).status, 200);
    assert.equal((await call(uid, 'POST', `/acoes/${id}/tempo`, { minutos: 15 })).status, 201);
    assert.equal((await call(uid, 'PATCH', `/acoes/${id}`, { status: 'concluida' })).status, 200);
  };
  const detalhe = async (uid, id) => (await call(uid, 'GET', `/acoes/${id}`)).data;
  const doDiretor = async (titulo) => {
    const d = (await call(DIRETOR, 'POST', '/diretrizes', { titulo, prazo: PRAZO, destino: 'especificos', secoes: [CPE] })).data;
    return (await db.prepare('select id from acoes where diretriz_id = ?').get(d.id)).id;
  };
  return { db, call, m1, m2, mCof, criar, concluir, detalhe, doDiretor };
}

test('o membro lê a árvore da própria seção e nada além dela; rotas fora da lista respondem 403', async (t) => {
  const { db, call, m1, mCof, criar } = await demo(t);
  const doCpe = (await criar(ANA_CPE, 'Do CPE')).id;
  const doCof = (await criar(BRUNO_COF, 'Do COF')).id;
  const internaInd = (await db.prepare('select id from acoes where interna = 1 and secao_id = 7 limit 1').get()).id;

  const lista = (await call(m1, 'GET', '/acoes')).data;
  assert.ok(lista.some((a) => a.id === doCpe));
  assert.ok(lista.some((a) => a.id === internaInd), 'a subseção da própria árvore também é lida');
  assert.ok(!lista.some((a) => a.id === doCof), 'outro Centro não aparece');
  assert.equal((await call(m1, 'GET', `/acoes/${doCof}`)).status, 404);
  assert.deepEqual([...new Set((await call(m1, 'GET', '/secoes')).data.map((s) => s.id))].sort((x, y) => x - y), [1, 7, 9], 'só a árvore dele');
  assert.deepEqual((await call(mCof, 'GET', '/secoes')).data.map((s) => s.id), [COF]);

  for (const caminho of ['/reunioes', '/combinados', '/painel', '/pauta', '/usuarios', '/equipe', '/atualizacao', '/historico', '/diretrizes', '/pedidos-prazo', '/config', '/avisos']) {
    assert.equal((await call(m1, 'GET', caminho)).status, 403, caminho);
  }
  for (const [metodo, caminho] of [['POST', `/acoes/${doCpe}/arquivar`], ['POST', `/acoes/${doCpe}/redirecionar`], ['POST', `/acoes/${doCpe}/pedido-prazo`],
    ['POST', `/acoes/${doCpe}/validar`], ['POST', `/acoes/${doCpe}/encerrar`], ['POST', `/acoes/${doCpe}/devolver`], ['POST', '/equipe'], ['PATCH', `/equipe/${m1}`]]) {
    assert.equal((await call(m1, metodo, caminho, {})).status, 403, `${metodo} ${caminho}`);
  }
  assert.equal((await call(m1, 'GET', '/bootstrap')).status, 200);
});

test('ação de outra pessoa: o membro só lê; atribuída a ele, ele executa mas não edita nem atribui', async (t) => {
  const { call, m1, m2, criar, detalhe } = await demo(t);
  const id = (await criar(ANA_CPE, 'Preparar o relatório')).id;

  const leitura = await detalhe(m1, id);
  assert.equal(leitura.somente_leitura, true);
  assert.equal(leitura.pode_executar, false);
  assert.equal(leitura.pode_comentar, false);
  for (const [metodo, caminho, corpo] of [['PATCH', `/acoes/${id}`, { status: 'em_andamento' }], ['POST', `/acoes/${id}/tempo`, { minutos: 5 }],
    ['POST', `/acoes/${id}/comentarios`, { texto: 'Oi' }], ['POST', `/acoes/${id}/checklist`, { texto: 'Item' }], ['POST', `/acoes/${id}/impedimentos`, { descricao: 'Trava' }],
    ['PATCH', `/acoes/${id}`, { prioridade: 'alta' }], ['PATCH', `/acoes/${id}`, { titulo: 'Outro' }], ['DELETE', `/acoes/${id}`]]) {
    assert.equal((await call(m1, metodo, caminho, corpo)).status, 403, `${metodo} ${caminho}`);
  }

  // Só o chefe atribui, e só a gente da seção.
  assert.equal((await call(m1, 'PATCH', `/acoes/${id}`, { responsavel_id: m1 })).status, 403, 'membro não atribui');
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { responsavel_id: DIRETOR })).status, 400, 'o Diretor não é da seção');
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { responsavel_id: BRUNO_COF })).status, 400, 'chefe de outro Centro');
  assert.equal((await call(BRUNO_COF, 'PATCH', `/acoes/${id}`, { responsavel_id: m1 })).status, 404, 'o COF nem enxerga a ação');
  const atribuida = await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { responsavel_id: m1 });
  assert.equal(atribuida.status, 200);
  assert.equal(atribuida.data.responsavel_id, m1);
  assert.equal(atribuida.data.atribuido_por, ANA_CPE);
  assert.match((await detalhe(ANA_CPE, id)).comentarios.at(-1).texto, /Responsável: sem responsável → Marta Lima/);

  const dele = await detalhe(m1, id);
  assert.equal(dele.somente_leitura, false);
  assert.equal(dele.pode_executar, true);
  assert.equal(dele.pode_editar, false, 'quem executa não edita título, detalhamento nem prazo');
  assert.equal(dele.pode_atribuir, false);
  assert.equal((await call(m1, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' })).status, 200);
  assert.equal((await call(m1, 'PATCH', `/acoes/${id}`, { prioridade: 'alta' })).status, 200);
  assert.equal((await call(m1, 'POST', `/acoes/${id}/tempo`, { minutos: 20 })).status, 201);
  const tarefa = await call(m1, 'POST', `/acoes/${id}/checklist`, { texto: 'Levantar dados', data: '2026-10-01', responsavel_id: m1 });
  assert.equal(tarefa.status, 201);
  assert.equal((await call(m1, 'PATCH', `/acoes/${id}/checklist/${tarefa.data.id}`, { concluido: true })).status, 200);
  assert.equal((await call(m1, 'POST', `/acoes/${id}/comentarios`, { texto: 'Em andamento' })).status, 201);
  assert.equal((await call(m1, 'POST', `/acoes/${id}/impedimentos`, { descricao: 'Aguardando dados' })).status, 201);
  for (const [metodo, caminho, corpo] of [['PATCH', `/acoes/${id}`, { titulo: 'Outro' }], ['PATCH', `/acoes/${id}`, { prazo: '2027-01-10' }], ['PATCH', `/acoes/${id}`, { responsavel_id: m2 }], ['DELETE', `/acoes/${id}`]]) {
    assert.equal((await call(m1, metodo, caminho, corpo)).status, 403, `${metodo} ${caminho}`);
  }
  assert.equal((await call(m2, 'PATCH', `/acoes/${id}`, { status: 'concluida' })).status, 403, 'outro membro continua só lendo');
});

test('ação criada pelo membro: ele responde como autor, não precisa de validação e não atribui a outros', async (t) => {
  const { call, m1, criar, concluir, detalhe } = await demo(t);
  const criada = await criar(m1, 'Organizar o arquivo');
  assert.equal(criada.secao_id, CPE, 'sempre na própria seção');
  assert.equal(criada.recebida_em, null);
  assert.equal((await call(m1, 'POST', '/acoes', { titulo: 'Para outro', prazo: PRAZO, secao_id: COF })).data.secao_id, CPE, 'o secao_id enviado é ignorado');
  assert.equal((await call(m1, 'POST', '/acoes', { titulo: 'Atribuída', prazo: PRAZO, responsavel_id: m1 })).status, 403);

  const d = await detalhe(m1, criada.id);
  assert.equal(d.pode_executar, true);
  assert.equal(d.pode_editar, true);
  assert.equal((await call(m1, 'PATCH', `/acoes/${criada.id}`, { titulo: 'Organizar o arquivo geral' })).status, 200);
  assert.equal((await detalhe(ANA_CPE, criada.id)).pode_editar, true, 'o chefe responde pelas ações da própria equipe');

  await concluir(m1, criada.id);
  const pronta = await detalhe(ANA_CPE, criada.id);
  assert.equal(pronta.aguardando_validacao, null, 'ação do próprio membro: concluir é definitivo');
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${criada.id}/validar`)).status, 409);
  assert.equal((await call(m1, 'DELETE', `/acoes/${criada.id}`)).status, 409, 'concluída não se exclui');
  const outra = await criar(m1, 'Rascunho');
  assert.equal((await call(m1, 'DELETE', `/acoes/${outra.id}`)).status, 200);
});

test('validação do chefe: o que o chefe atribuiu a um membro só fica pronto depois que ele valida; o chefe devolve para ajuste', async (t) => {
  const { call, m1, criar, concluir, detalhe } = await demo(t);
  const id = (await criar(ANA_CPE, 'Mapear os processos')).id;
  await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { responsavel_id: m1 });
  await concluir(m1, id);

  let d = await detalhe(ANA_CPE, id);
  assert.equal(d.delegada, true);
  assert.equal(d.aguardando_validacao, 'chefe');
  assert.equal((await call(m1, 'POST', `/acoes/${id}/validar`)).status, 403, 'o membro não valida o próprio trabalho');
  assert.equal((await call(BRUNO_COF, 'POST', `/acoes/${id}/validar`)).status, 404);
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/encerrar`)).status, 409, 'não é demanda do Diretor');

  // Devolver: volta a em andamento e a validação recomeça.
  assert.equal((await call(m1, 'POST', `/acoes/${id}/devolver`, { comentario: 'x' })).status, 403);
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/devolver`, {})).status, 400, 'explique o que falta');
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/devolver`, { comentario: 'Faltou o anexo.' })).status, 200);
  d = await detalhe(ANA_CPE, id);
  assert.equal(d.status, 'em_andamento');
  assert.match(d.comentarios.at(-1).texto, /Devolvida pelo chefe \(Ana Ribeiro\): Faltou o anexo\./);
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/devolver`, { comentario: 'de novo' })).status, 409, 'só se estiver concluída');

  await call(m1, 'PATCH', `/acoes/${id}`, { status: 'concluida' });
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/validar`)).status, 200);
  d = await detalhe(ANA_CPE, id);
  assert.equal(d.validada_chefe, true);
  assert.equal(d.aguardando_validacao, null, 'sem demanda do Diretor, a ação está pronta');
  assert.equal(d.validada_chefe_por_nome, 'Ana Ribeiro');
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/validar`)).status, 409, 'já validada');

  // Reabrir recomeça a validação.
  await call(m1, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' });
  await call(m1, 'PATCH', `/acoes/${id}`, { status: 'concluida' });
  assert.equal((await detalhe(ANA_CPE, id)).aguardando_validacao, 'chefe');
});

test('demanda do Diretor delegada a um membro: validação em sequência, primeiro o chefe e depois o Diretor', async (t) => {
  const { call, m1, concluir, detalhe, doDiretor } = await demo(t);
  const id = await doDiretor('Enviar o plano de trabalho');
  await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { responsavel_id: m1 });
  await concluir(m1, id);

  assert.equal((await detalhe(ANA_CPE, id)).aguardando_validacao, 'chefe');
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/encerrar`)).status, 409, 'antes, o chefe');
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/devolver`, { comentario: 'x' })).status, 409);
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/validar`)).status, 200);

  const d = await detalhe(DIRETOR, id);
  assert.equal(d.aguardando_validacao, 'diretor');
  assert.equal(d.exige_validacao_chefe && d.exige_validacao_diretor, true);
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/devolver`, { comentario: 'x' })).status, 409, 'agora é a vez do Diretor');
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/encerrar`)).status, 200);
  assert.equal((await detalhe(DIRETOR, id)).encerrada, true);
});

test('só a demanda do Diretor tem o aceite dele: a ação da própria seção fica pronta ao ser concluída', async (t) => {
  const { call, criar, concluir, detalhe, doDiretor } = await demo(t);
  const dele = await doDiretor('Da diretriz');
  await concluir(ANA_CPE, dele);
  assert.equal((await detalhe(DIRETOR, dele)).aguardando_validacao, 'diretor', 'como sempre foi');
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${dele}/encerrar`)).status, 200);

  const propria = (await criar(ANA_CPE, 'Da seção')).id;
  await concluir(ANA_CPE, propria);
  assert.equal((await detalhe(DIRETOR, propria)).aguardando_validacao, null);
  const recusa = await call(DIRETOR, 'POST', `/acoes/${propria}/encerrar`);
  assert.equal(recusa.status, 409);
  assert.match(recusa.data.erro, /não foi demandada pelo Diretor/);
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${propria}/devolver`, { comentario: 'x' })).status, 409);
  assert.equal((await call(ADMIN, 'POST', `/acoes/${propria}/encerrar`)).status, 200, 'o Administrador tem acesso total');

  // "Demanda do Diretor" declarada pela seção também conta.
  const declarada = (await criar(ANA_CPE, 'Declarada', { demanda_diretor: true })).id;
  await concluir(ANA_CPE, declarada);
  assert.equal((await detalhe(DIRETOR, declarada)).aguardando_validacao, 'diretor');
});

test('trocar o responsável recomeça a validação e a ação atribuída chega como nova para o membro', async (t) => {
  const { call, m1, m2, criar, concluir, detalhe } = await demo(t);
  const id = (await criar(ANA_CPE, 'Revisar a minuta')).id;
  assert.equal((await call(m1, 'GET', '/bootstrap')).data.acoes_novas, 0);
  await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { responsavel_id: m1 });
  assert.equal((await call(m1, 'GET', '/bootstrap')).data.acoes_novas, 1);
  assert.equal((await detalhe(m1, id)).nova, true);
  assert.equal((await call(ANA_CPE, 'GET', '/bootstrap')).data.acoes_novas, 0, 'a chefe não recebe: ela atribuiu');
  assert.equal((await call(m1, 'POST', `/acoes/${id}/vista`)).data.registrada, true);
  assert.equal((await call(m1, 'GET', '/bootstrap')).data.acoes_novas, 0);
  assert.equal((await detalhe(m1, id)).nova, false);

  await concluir(m1, id);
  assert.equal((await call(ANA_CPE, 'GET', '/bootstrap')).data.acoes_a_validar, 1);
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { responsavel_id: m2 })).status, 409, 'concluída: reabra antes');
  await call(ANA_CPE, 'POST', `/acoes/${id}/validar`);
  assert.equal((await call(ANA_CPE, 'GET', '/bootstrap')).data.acoes_a_validar, 0);
  await call(m1, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' });
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { responsavel_id: m2 })).status, 200);
  const d = await detalhe(ANA_CPE, id);
  assert.equal(d.validada_chefe, false);
  assert.equal(d.atribuido_por, ANA_CPE);
  assert.equal((await call(m2, 'GET', '/bootstrap')).data.acoes_novas, 1);
  // A própria pessoa que assume a ação não "delega" a si mesma: nada a validar.
  await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { responsavel_id: ANA_CPE });
  assert.equal((await detalhe(ANA_CPE, id)).delegada, false);
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { responsavel_id: null })).data.responsavel_id, null);
});

test('tarefa atribuída ao membro em ação que ele não executa: ele só marca como feita e comenta', async (t) => {
  const { call, m1, m2, criar, detalhe } = await demo(t);
  const id = (await criar(ANA_CPE, 'Ação da chefe')).id;
  const tarefa = (await call(ANA_CPE, 'POST', `/acoes/${id}/checklist`, { texto: 'Conferir os números', data: '2026-10-05', responsavel_id: m2 })).data;

  assert.equal((await call(m2, 'POST', `/acoes/${id}/comentarios`, { texto: 'Estou nisso' })).status, 201, 'tem tarefa nesta ação');
  assert.equal((await call(m1, 'POST', `/acoes/${id}/comentarios`, { texto: 'Posso ajudar?' })).status, 403, 'não tem papel nela');
  const d = await detalhe(m2, id);
  assert.equal(d.somente_leitura, false);
  assert.equal(d.pode_executar, false);
  assert.equal(d.checklist[0].pode_marcar, true);
  assert.equal((await detalhe(m1, id)).checklist[0].pode_marcar, false);
  assert.equal((await call(m1, 'PATCH', `/acoes/${id}/checklist/${tarefa.id}`, { concluido: true })).status, 403);

  assert.equal((await call(m2, 'PATCH', `/acoes/${id}/checklist/${tarefa.id}`, { texto: 'Outro texto' })).status, 403);
  assert.equal((await call(m2, 'PATCH', `/acoes/${id}/checklist/${tarefa.id}`, { data: '2026-11-01' })).status, 403);
  assert.equal((await call(m2, 'DELETE', `/acoes/${id}/checklist/${tarefa.id}`)).status, 403);
  assert.equal((await call(m2, 'POST', `/acoes/${id}/checklist`, { texto: 'Nova' })).status, 403);
  const feita = await call(m2, 'PATCH', `/acoes/${id}/checklist/${tarefa.id}`, { concluido: true });
  assert.equal(feita.status, 200);
  assert.equal(feita.data.concluido, true);

  const tarefas = (await call(m2, 'GET', '/tarefas')).data;
  assert.equal(tarefas.find((x) => x.id === tarefa.id).pode_marcar, true);
  assert.equal((await call(m1, 'GET', '/tarefas')).data.find((x) => x.id === tarefa.id).pode_marcar, false);
});

test('responsável só da seção da ação; inativo não é escolhido', async (t) => {
  const { db, call, m1, mCof, criar } = await demo(t);
  const id = (await criar(ANA_CPE, 'Ação')).id;
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { responsavel_id: mCof })).status, 400, 'membro de outro Centro');
  assert.equal((await call(ANA_CPE, 'GET', `/acoes/${id}/executores`)).data.map((u) => u.id).includes(m1), true);
  assert.equal((await call(ANA_CPE, 'GET', `/acoes/${id}/executores`)).data.map((u) => u.id).includes(mCof), false);
  assert.equal((await call(m1, 'GET', `/acoes/${id}/executores`)).status, 403);
  await db.prepare('update usuarios set ativo = 0 where id = ?').run(m1);
  assert.equal((await call(ANA_CPE, 'GET', `/acoes/${id}/executores`)).data.map((u) => u.id).includes(m1), false);
  assert.equal((await call(ANA_CPE, 'POST', '/acoes', { titulo: 'X', prazo: PRAZO, responsavel_id: m1 })).status, 400);
  const nova = await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Com responsável', prazo: PRAZO, responsavel_id: ANA_CPE });
  assert.equal(nova.status, 201);
  assert.equal(nova.data.responsavel_nome, 'Ana Ribeiro');
  assert.equal(nova.data.atribuido_por, null, 'a pessoa que assume a própria ação não delega a si mesma');
  assert.equal((await call(DIRETOR, 'POST', '/acoes', { titulo: 'Y', prazo: PRAZO, secao_id: CPE, responsavel_id: ANA_CPE })).status, 403, 'a gestão não atribui');
});

test('demanda de entidade externa: nome obrigatório, exclusiva da demanda do Diretor, sempre visível ao Diretor', async (t) => {
  const { db, call, criar, doDiretor } = await demo(t);
  const externa = await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Responder ofício', prazo: PRAZO, demandante_externo: ' Tribunal de Contas ' });
  assert.equal(externa.status, 201);
  assert.equal(externa.data.demandante_externo, 'Tribunal de Contas');
  assert.match((await call(ANA_CPE, 'GET', `/acoes/${externa.data.id}`)).data.comentarios[0].texto, /Demanda de Tribunal de Contas/);
  assert.ok((await call(DIRETOR, 'GET', '/acoes')).data.some((a) => a.id === externa.data.id && a.demandante_externo === 'Tribunal de Contas'), 'o Diretor enxerga');

  assert.equal((await call(ANA_CPE, 'POST', '/acoes', { titulo: 'X', prazo: PRAZO, demandante_externo: '   ' })).status, 400, 'o nome é obrigatório');
  assert.equal((await call(ANA_CPE, 'POST', '/acoes', { titulo: 'X', prazo: PRAZO, demandante_externo: 5 })).status, 400);
  assert.equal((await call(ANA_CPE, 'POST', '/acoes', { titulo: 'X', prazo: PRAZO, demandante_externo: 'Órgão', demanda_diretor: true })).status, 400, 'uma origem só');
  assert.equal((await call(ANA_CPE, 'POST', '/acoes', { titulo: 'X', prazo: PRAZO, demandante_externo: 'Órgão', interna: true })).status, 400, 'visível ao Diretor');

  // Edição: marcar torna a ação visível ao Diretor; remover limpa; a origem declarada como Diretor não convive com a externa.
  const interna = (await criar(ANA_CPE, 'Interna', { interna: true })).id;
  assert.equal((await db.prepare('select interna from acoes where id = ?').get(interna)).interna, 1);
  const marcada = await call(ANA_CPE, 'PATCH', `/acoes/${interna}`, { demandante_externo: 'Secretaria da Fazenda' });
  assert.equal(marcada.status, 200);
  assert.equal(marcada.data.demandante_externo, 'Secretaria da Fazenda');
  assert.equal(marcada.data.interna, false);
  assert.match((await call(ANA_CPE, 'GET', `/acoes/${interna}`)).data.comentarios.at(-1).texto, /demanda de Secretaria da Fazenda/);
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${interna}`, { demanda_diretor: true })).status, 400);
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${interna}`, { demandante_externo: '' })).status, 400);
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${interna}`, { demandante_externo: null })).data.demandante_externo, null);
  assert.equal((await call(BRUNO_COF, 'PATCH', `/acoes/${interna}`, { demandante_externo: 'X' })).status, 404);

  // A ação que veio de diretriz do Diretor tem origem fixa.
  const diretriz = await doDiretor('Do Diretor');
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${diretriz}`, { demandante_externo: 'Órgão' })).status, 403, 'a chefe nem edita a ação do Diretor');
  assert.equal((await call(DIRETOR, 'PATCH', `/acoes/${diretriz}`, { demandante_externo: 'Órgão' })).status, 409, 'nem o Diretor muda a origem de uma diretriz');

  // Demanda externa sozinha não tem aceite do Diretor.
  const id = externa.data.id;
  await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' });
  await call(ANA_CPE, 'POST', `/acoes/${id}/tempo`, { minutos: 10 });
  await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { status: 'concluida' });
  assert.equal((await call(DIRETOR, 'GET', `/acoes/${id}`)).data.aguardando_validacao, null);
});

test('equipe: o chefe lista e desativa os membros da própria seção; Diretor e Administrador mudam o perfil', async (t) => {
  const { db, call, m1, m2, mCof, criar } = await demo(t);
  const equipe = (await call(ANA_CPE, 'GET', '/equipe')).data;
  assert.deepEqual(equipe.map((m) => m.id).sort(), [m1, m2].sort());
  assert.deepEqual((await call(BRUNO_COF, 'GET', '/equipe')).data.map((m) => m.id), [mCof]);
  assert.equal((await call(DIRETOR, 'GET', '/equipe')).status, 403);

  const id = (await criar(ANA_CPE, 'Ação')).id;
  await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { responsavel_id: m1 });
  assert.equal((await call(ANA_CPE, 'GET', '/equipe')).data.find((m) => m.id === m1).acoes_abertas, 1);

  assert.equal((await call(BRUNO_COF, 'PATCH', `/equipe/${m1}`, { ativo: false })).status, 404, 'é de outra equipe');
  assert.equal((await call(ANA_CPE, 'PATCH', `/equipe/${GABRIELA_IND}`, { ativo: false })).status, 404, 'chefe não é membro');
  assert.equal((await call(ANA_CPE, 'PATCH', `/equipe/${m1}`, { ativo: 'não' })).status, 400);
  const off = await call(ANA_CPE, 'PATCH', `/equipe/${m1}`, { ativo: false });
  assert.equal(off.status, 200);
  assert.equal(off.data.ativo, false);
  assert.equal((await call(m1, 'GET', '/bootstrap')).status, 401, 'conta inativa não entra');
  assert.equal((await call(ANA_CPE, 'PATCH', `/equipe/${m1}`, { ativo: true })).data.ativo, true);
  assert.equal((await detalheNome(call, ANA_CPE, id)), 'Marta Lima', 'a atribuição fica com o nome dela');

  // Diretor/Administrador: passar uma conta para membro exige uma seção ativa.
  const apoio = 2;
  assert.equal((await call(DIRETOR, 'PATCH', `/usuarios/${apoio}`, { perfil: 'membro' })).status, 400);
  const virou = await call(DIRETOR, 'PATCH', `/usuarios/${apoio}`, { perfil: 'membro', secao_id: CPE });
  assert.equal(virou.status, 200);
  assert.equal(virou.data.secao_id, CPE);
  assert.ok((await call(ANA_CPE, 'GET', '/equipe')).data.some((m) => m.id === apoio));
  assert.equal((await call(ADMIN, 'PATCH', `/usuarios/${apoio}`, { perfil: 'apoio' })).status, 200);
  assert.equal((await db.prepare('select secao_id from usuarios where id = ?').get(apoio)).secao_id, null);
});
const detalheNome = async (call, uid, id) => (await call(uid, 'GET', `/acoes/${id}`)).data.responsavel_nome;

test('cadastro de membro (Supabase simulado): seção do chefe, senha mínima de 8 caracteres e troca no primeiro acesso', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const config = { mode: 'supabase', supabaseUrl: 'https://projeto.supabase.co' };
  let n = 0;
  const admin = { async criar() { return `${String(++n).padStart(8, '0')}-0000-4000-8000-000000000000`; }, async remover() {} };
  const dados = { nome: 'Paulo Reis', email: 'paulo@orgao.gov.br', senha: 'Senha-ok-1', secao_id: CPE };

  await assert.rejects(cadastrarChefe(db, config, admin, { ...dados, senha: '1234567' }, 'membro', { permitidos: ['membro'] }), /entre 8 e 128/);
  await assert.rejects(cadastrarChefe(db, config, admin, { ...dados, secao_id: undefined }, 'membro', { permitidos: ['membro'] }), /Escolha uma seção/);
  await assert.rejects(cadastrarChefe(db, config, admin, dados, 'chefe', { permitidos: ['membro'] }), /só de membro/);
  const antes = (await db.prepare('select chefe_id from secoes where id = ?').get(CPE)).chefe_id;
  const membro = await cadastrarChefe(db, config, admin, { ...dados, senha: '12345678' }, 'membro', { permitidos: ['membro'] });
  assert.equal(membro.perfil, 'membro');
  assert.equal(membro.trocar_senha, 1);
  assert.equal(membro.suplente, false);
  assert.equal((await db.prepare('select chefe_id from secoes where id = ?').get(CPE)).chefe_id, antes, 'não mexe na chefia');
  await assert.rejects(cadastrarChefe(db, config, admin, dados, 'membro', { permitidos: ['membro'] }), /E-mail já cadastrado/);
  await assert.rejects(cadastrarChefe(db, config, admin, { ...dados, email: 'x@orgao.gov.br', secao_id: 9999 }, 'membro', { permitidos: ['membro'] }), /seção ativa/);
});

test('migração 21 aceita o perfil Membro e acrescenta os campos da ação sem perder dados', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  await db.exec(`pragma foreign_keys = off;
    create table usuarios_antiga (id integer primary key, nome text not null, email text,
      perfil text not null check (perfil in ('diretor','chefe','apoio','administrador','consulta')), secao_id integer references secoes(id),
      ativo integer not null default 1, trocar_senha integer not null default 0, ver_outros_centros integer not null default 0);
    insert into usuarios_antiga select id, nome, email, perfil, secao_id, ativo, trocar_senha, ver_outros_centros from usuarios;
    drop table usuarios;
    alter table usuarios_antiga rename to usuarios;
    create index idx_usuarios_perfil on usuarios(perfil);
    create view chefes_ativos as select id, nome from usuarios where perfil = 'chefe' and ativo = 1;
    delete from schema_migrations where id = 21;
    pragma foreign_keys = on`);
  const antes = await db.prepare('select id, nome, email, perfil, secao_id, ativo, trocar_senha, ver_outros_centros from usuarios order by id').all();
  await assert.rejects(db.prepare("insert into usuarios (nome, perfil) values ('M', 'membro')").run(), /CHECK/);

  assert.deepEqual(await aplicarMigracoes(db), [21]);

  assert.deepEqual(await db.prepare('select id, nome, email, perfil, secao_id, ativo, trocar_senha, ver_outros_centros from usuarios order by id').all(), antes);
  await db.prepare("insert into usuarios (nome, perfil, secao_id) values ('M', 'membro', 1)").run();
  await assert.rejects(db.prepare("insert into usuarios (nome, perfil) values ('X', 'outro')").run(), /CHECK/);
  assert.deepEqual(await db.prepare('pragma foreign_key_check').all(), []);
  assert.equal((await db.prepare("select count(*) n from sqlite_master where name in ('idx_usuarios_perfil','chefes_ativos')").get()).n, 2);
  const colunas = (await db.prepare('pragma table_info(acoes)').all()).map((c) => c.name);
  for (const c of ['responsavel_id', 'atribuido_por', 'atribuida_em', 'validada_chefe_em', 'validada_chefe_por', 'demandante_externo']) assert.ok(colunas.includes(c), c);
  assert.deepEqual(await aplicarMigracoes(db), []);
});
