// O chefe direciona ações às subseções dele, como o Diretor faz com os Centros: uma ação por subseção, ligada a um direcionamento,
// com ciência, acompanhamento e o aceite (ou devolução) de quem demandou, e não do Diretor.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

// Seed: CPE (1) tem a subseção IND (7), que tem a subseção PNL (9). Ana chefia o CPE, Gabriela o IND, Bruno o COF (sem subseções).
const DIRETOR = 1, ANA_CPE = 3, BRUNO_COF = 4, GABRIELA_IND = 9;
const CPE = 1, COF = 2, IND = 7, PNL = 9;
const MEMBRO_IND = 51; // membro do IND, criado pelo teste
const PRAZO = '2026-12-31';

async function demo(t) {
  const db = openDb(':memory:');
  await seed(db);
  await db.prepare('update acoes set recebida_em = null').run();
  await db.prepare('insert into usuarios (id, nome, email, perfil, secao_id) values (?,?,?,?,?)').run(MEMBRO_IND, 'Teo Alves', 'teo@exemplo.invalid', 'membro', IND);
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
  const idDa = async (diretriz, secao) => (await db.prepare('select id from acoes where diretriz_id = ? and secao_id = ?').get(diretriz, secao))?.id;
  const direcionar = async (uid, corpo) => call(uid, 'POST', '/diretrizes', { titulo: 'Levantar os indicadores do trimestre', prazo: PRAZO, ...corpo });
  const concluir = async (uid, id) => {
    assert.equal((await call(uid, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' })).status, 200);
    assert.equal((await call(uid, 'POST', `/acoes/${id}/tempo`, { minutos: 30 })).status, 201);
    return call(uid, 'PATCH', `/acoes/${id}`, { status: 'concluida' });
  };
  return { db, call, acao, idDa, direcionar, concluir };
}

test('o chefe direciona às subseções: "todas" são as de nível imediato; escolher aceita qualquer subseção da árvore', async (t) => {
  const { call, acao, idDa, direcionar } = await demo(t);
  const todas = await direcionar(ANA_CPE, { destino: 'todos' });
  assert.equal(todas.status, 201, JSON.stringify(todas.data));
  assert.equal(todas.data.acoes_criadas, 1, 'só o IND, que fica diretamente abaixo do CPE');
  const a = await acao(ANA_CPE, await idDa(todas.data.id, IND));
  assert.equal(a.secao_id, IND);
  assert.equal(a.criado_por, ANA_CPE);
  assert.equal(a.demandada_chefe, true);
  assert.equal(a.demandada_diretor, false, 'não é demanda do Diretor: ele não aceita');
  assert.equal(a.demandado_por_nome, 'Ana Ribeiro');
  assert.ok(a.comentarios.some((c) => /Ação demandada por Ana Ribeiro \(CPE\)\./.test(c.texto)));

  const duas = await direcionar(ANA_CPE, { destino: 'especificos', secoes: [IND, PNL] });
  assert.equal(duas.data.acoes_criadas, 2, 'escolhendo, vale qualquer subseção da árvore');
  assert.ok(await idDa(duas.data.id, PNL));

  // Fora do que o chefe pode: a própria seção, outro Centro, ninguém e prazo no passado.
  assert.equal((await direcionar(ANA_CPE, { destino: 'especificos', secoes: [CPE] })).status, 400);
  assert.equal((await direcionar(ANA_CPE, { destino: 'especificos', secoes: [COF] })).status, 400);
  assert.equal((await direcionar(ANA_CPE, { destino: 'especificos', secoes: [] })).status, 400);
  assert.equal((await direcionar(ANA_CPE, { destino: 'todos', prazo: '2026-09-01' })).status, 400);
  const semSub = await direcionar(BRUNO_COF, { destino: 'todos' });
  assert.equal(semSub.status, 400);
  assert.match(semSub.data.erro, /não tem subseções/);
  // O chefe de uma subseção direciona às dele (PNL), nunca às de cima.
  assert.equal((await direcionar(GABRIELA_IND, { destino: 'todos' })).data.acoes_criadas, 1);
  assert.equal((await direcionar(GABRIELA_IND, { destino: 'especificos', secoes: [IND] })).status, 400);
  // O membro não direciona.
  assert.equal((await call(MEMBRO_IND, 'POST', '/diretrizes', { titulo: 'x', prazo: PRAZO, destino: 'todos' })).status, 403);
});

test('a ação chega como nova para a subseção, não para quem demandou; cada um vê só os seus direcionamentos', async (t) => {
  const { call, idDa, direcionar } = await demo(t);
  const d = (await direcionar(ANA_CPE, { destino: 'todos' })).data;
  const id = await idDa(d.id, IND);
  const novas = async (uid) => (await call(uid, 'GET', '/bootstrap')).data.acoes_novas;
  assert.equal(await novas(GABRIELA_IND), 1);
  assert.equal(await novas(ANA_CPE), 0, 'quem direcionou já está ciente');
  const lista = (await call(GABRIELA_IND, 'GET', '/acoes?situacao=abertas')).data.find((a) => a.id === id);
  assert.equal(lista.nova, true);
  assert.equal(lista.pode_executar, true);
  assert.equal(lista.pode_editar, false, 'quem recebe não edita o que foi demandado');

  const dirs = async (uid) => (await call(uid, 'GET', '/diretrizes')).data;
  assert.deepEqual((await dirs(ANA_CPE)).map((x) => x.id), [d.id]);
  assert.deepEqual((await dirs(ANA_CPE))[0].secoes.map((s) => s.sigla), ['IND']);
  assert.deepEqual(await dirs(GABRIELA_IND), [], 'a subseção não vê o direcionamento da seção acima');
  assert.deepEqual(await dirs(BRUNO_COF), [], 'outro Centro não vê');
  assert.ok(!(await dirs(DIRETOR)).some((x) => x.id === d.id), 'o Diretor não vê, na lista dele, os direcionamentos dos chefes');
  const doDiretor = (await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Do Diretor', prazo: PRAZO, destino: 'especificos', secoes: [COF] })).data;
  assert.ok((await dirs(DIRETOR)).some((x) => x.id === doDiretor.id), 'o do próprio Diretor aparece para ele');
  assert.deepEqual((await dirs(ANA_CPE)).map((x) => x.id), [d.id], 'e o chefe não vê os do Diretor');
});

test('acrescentar subseções: só ao direcionamento da própria seção e só às subseções dela', async (t) => {
  const { call, idDa, direcionar } = await demo(t);
  const d = (await direcionar(ANA_CPE, { destino: 'todos' })).data;
  const r = await call(ANA_CPE, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [PNL] });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.ok(await idDa(d.id, PNL));
  assert.equal((await call(ANA_CPE, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [PNL] })).status, 409, 'já recebeu');
  assert.equal((await call(ANA_CPE, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [COF] })).status, 400);
  assert.equal((await call(BRUNO_COF, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [PNL] })).status, 404, 'outro chefe não mexe');
  assert.equal((await call(GABRIELA_IND, 'POST', `/diretrizes/${d.id}/secoes`, { secoes: [PNL] })).status, 404);
});

test('aceite: a subseção conclui, quem demandou aceita ou devolve; nem a subseção nem o Diretor aceitam', async (t) => {
  const { db, call, acao, idDa, direcionar, concluir } = await demo(t);
  const d = (await direcionar(ANA_CPE, { destino: 'todos' })).data;
  const id = await idDa(d.id, IND);
  assert.equal((await concluir(GABRIELA_IND, id)).status, 200);

  const a = await acao(ANA_CPE, id);
  assert.equal(a.aguardando_validacao, 'demandante');
  assert.equal(a.pode_aceitar_demanda, true);
  assert.equal((await acao(GABRIELA_IND, id)).pode_aceitar_demanda, false, 'quem concluiu não se aceita');
  assert.equal((await call(ANA_CPE, 'GET', '/bootstrap')).data.acoes_a_validar, 1, 'selo "Aguardando sua validação" da Ana');
  assert.equal((await call(GABRIELA_IND, 'GET', '/bootstrap')).data.acoes_a_validar, 0);

  assert.equal((await call(GABRIELA_IND, 'POST', `/acoes/${id}/encerrar`)).status, 403);
  assert.equal((await call(GABRIELA_IND, 'POST', `/acoes/${id}/devolver`, { comentario: 'x' })).status, 403);
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/encerrar`)).status, 409, 'não foi demandada pelo Diretor');
  assert.equal((await call(BRUNO_COF, 'POST', `/acoes/${id}/encerrar`)).status, 404);
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/devolver`, {})).status, 400, 'devolver pede o motivo');

  const dev = await call(ANA_CPE, 'POST', `/acoes/${id}/devolver`, { comentario: 'Faltou a série de 2025.' });
  assert.equal(dev.status, 200, JSON.stringify(dev.data));
  const volta = await acao(GABRIELA_IND, id);
  assert.equal(volta.status, 'em_andamento');
  assert.equal(volta.devolucoes, 1);
  assert.ok(volta.comentarios.some((c) => /Devolvida pelo chefe \(Ana Ribeiro\): Faltou a série de 2025\./.test(c.texto)));
  assert.equal((await call(ANA_CPE, 'GET', '/bootstrap')).data.acoes_a_validar, 0);

  assert.equal((await call(GABRIELA_IND, 'PATCH', `/acoes/${id}`, { status: 'concluida' })).status, 200);
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/encerrar`)).status, 200);
  const fim = await acao(ANA_CPE, id);
  assert.equal(fim.encerrada, true);
  assert.ok(fim.comentarios.some((c) => /Aceita e encerrada por Ana Ribeiro\./.test(c.texto)));
  assert.equal((await db.prepare('select encerrada from acoes where id = ?').get(id)).encerrada, 1);
});

test('aceite em sequência: se a subseção atribuiu a um membro, o chefe dela valida primeiro e só então quem demandou aceita', async (t) => {
  const { call, acao, idDa, direcionar, concluir } = await demo(t);
  const d = (await direcionar(ANA_CPE, { destino: 'todos' })).data;
  const id = await idDa(d.id, IND);
  assert.equal((await call(GABRIELA_IND, 'PATCH', `/acoes/${id}`, { responsavel_id: MEMBRO_IND })).status, 200);
  assert.equal((await concluir(MEMBRO_IND, id)).status, 200);

  assert.equal((await acao(GABRIELA_IND, id)).aguardando_validacao, 'chefe', 'primeiro a validação do chefe da subseção');
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/encerrar`)).status, 409, 'o aceite vem depois');
  assert.equal((await call(ANA_CPE, 'GET', '/bootstrap')).data.acoes_a_validar, 1, 'a validação pendente conta uma vez só (para o chefe da árvore)');

  assert.equal((await call(GABRIELA_IND, 'POST', `/acoes/${id}/validar`)).status, 200);
  const a = await acao(ANA_CPE, id);
  assert.equal(a.aguardando_validacao, 'demandante');
  assert.equal(a.pode_aceitar_demanda, true);
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/encerrar`)).status, 200);
});

test('a subseção não arquiva nem exclui a ação demandada; quem demandou edita e muda o prazo; o suplente da seção que demandou aceita', async (t) => {
  const { db, call, acao, idDa, direcionar, concluir } = await demo(t);
  const d = (await direcionar(ANA_CPE, { destino: 'todos' })).data;
  const id = await idDa(d.id, IND);
  const arquivar = await call(GABRIELA_IND, 'POST', `/acoes/${id}/arquivar`);
  assert.equal(arquivar.status, 403);
  assert.match(arquivar.data.erro, /direcionadas pelo chefe da seção acima/);
  assert.equal((await call(GABRIELA_IND, 'DELETE', `/acoes/${id}`)).status, 403);
  assert.equal((await call(GABRIELA_IND, 'PATCH', `/acoes/${id}`, { prazo: '2027-01-31' })).status, 403, 'o prazo muda por pedido');
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { prazo: '2027-01-31', titulo: 'Título revisto' })).status, 200);
  assert.equal((await acao(GABRIELA_IND, id)).prazo, '2027-01-31');

  // Suplente da Ana (segundo chefe do CPE) também é de quem demandou: aceita.
  await db.prepare("insert into usuarios (id, nome, email, perfil, secao_id) values (61, 'Sílvia Duarte', 'silvia@exemplo.invalid', 'chefe', ?)").run(CPE);
  assert.equal((await concluir(GABRIELA_IND, id)).status, 200);
  assert.equal((await acao(61, id)).pode_aceitar_demanda, true);
  assert.equal((await call(61, 'POST', `/acoes/${id}/encerrar`)).status, 200);
});

test('o fluxo do Diretor não muda: a ação direcionada por ele continua aguardando o aceite dele', async (t) => {
  const { call, acao, idDa, concluir } = await demo(t);
  const d = (await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Do Diretor', prazo: PRAZO, destino: 'especificos', secoes: [CPE] })).data;
  const id = await idDa(d.id, CPE);
  assert.equal((await concluir(ANA_CPE, id)).status, 200);
  const a = await acao(ANA_CPE, id);
  assert.equal(a.aguardando_validacao, 'diretor');
  assert.equal(a.demandada_diretor, true);
  assert.equal(a.demandada_chefe, false);
  assert.equal(a.pode_aceitar_demanda, false, 'a chefe não aceita o que o Diretor demandou');
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${id}/encerrar`)).status, 403);
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/encerrar`)).status, 200);
});

test('bootstrap: o chefe com subseções ativas é marcado, o das demais seções não', async (t) => {
  const { call } = await demo(t);
  assert.equal((await call(ANA_CPE, 'GET', '/bootstrap')).data.secao.tem_subsecoes, true);
  assert.equal((await call(GABRIELA_IND, 'GET', '/bootstrap')).data.secao.tem_subsecoes, true, 'o IND tem o PNL abaixo');
  assert.equal((await call(BRUNO_COF, 'GET', '/bootstrap')).data.secao.tem_subsecoes, false);
});

test('a ciência de quem demandou não conta como ciência da subseção; a da subseção, sim', async (t) => {
  const { call, idDa, direcionar } = await demo(t);
  const d = (await direcionar(ANA_CPE, { destino: 'todos' })).data;
  const id = await idDa(d.id, IND);
  const ciencia = async () => (await call(ANA_CPE, 'GET', '/diretrizes')).data.find((x) => x.id === d.id).secoes[0];
  assert.equal((await ciencia()).vista_em, null, 'a subseção ainda não viu');
  assert.equal((await call(GABRIELA_IND, 'POST', `/acoes/${id}/vista`)).status, 200);
  const depois = await ciencia();
  assert.ok(depois.vista_em, 'depois que a subseção abre, aparece');
  assert.equal(depois.vista_por, 'Gabriela Sena');
});
