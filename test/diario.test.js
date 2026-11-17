// Diário de progresso das ações (migração 36): registro com tarefa opcional, tempo opcional, concluir a tarefa, data, retificação,
// permissões por perfil e o destino do diário quando a tarefa ou a ação é excluída. Não muda status nem semáforo.
process.env.SGC_NOW = '2026-09-22T09:30:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

const DIRETOR = 1, APOIO = 2, ANA_CPE = 3, BRUNO_COF = 4;
const MARINA = 31, PAULO = 32; // membros do COF criados pelo teste: Marina é responsável pela ação; Paulo só tem uma tarefa nela
const OUTRO = 33; // membro do COF sem nenhuma relação com a ação

async function demo(t) {
  const db = openDb(':memory:');
  await seed(db);
  const ins = db.prepare('insert into usuarios (id, nome, email, perfil, secao_id) values (?,?,?,?,?)');
  await ins.run(MARINA, 'Marina Costa', 'marina@exemplo.invalid', 'membro', 2);
  await ins.run(PAULO, 'Paulo Lima', 'paulo@exemplo.invalid', 'membro', 2);
  await ins.run(OUTRO, 'Olga Dias', 'olga@exemplo.invalid', 'membro', 2);
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
  // Uma ação do COF atribuída à Marina, com duas tarefas: uma da Marina, outra do Paulo.
  const acao = (await call(BRUNO_COF, 'POST', '/acoes', { titulo: 'Manifestar-se sobre o contrato', prazo: '2026-12-31', responsavel_id: MARINA })).data.id;
  const t1 = (await call(BRUNO_COF, 'POST', `/acoes/${acao}/checklist`, { texto: 'Minuta do ofício', responsavel_id: MARINA })).data.id;
  const t2 = (await call(BRUNO_COF, 'POST', `/acoes/${acao}/checklist`, { texto: 'Conferir o empenho', responsavel_id: PAULO })).data.id;
  const detalhe = async (uid, id = acao) => (await call(uid, 'GET', `/acoes/${id}`)).data;
  const registrar = (uid, corpo, id = acao) => call(uid, 'POST', `/acoes/${id}/diario`, corpo);
  return { db, call, acao, t1, t2, detalhe, registrar };
}

test('o chefe registra o andamento: aparece no detalhe, no resumo da lista e renova a última movimentação, sem mudar o status', async (t) => {
  const { call, acao, detalhe, registrar } = await demo(t);
  const antes = await detalhe(BRUNO_COF);
  const r = await registrar(BRUNO_COF, { texto: '  Enviei o ofício ao jurídico.  ', referencia: 'SEI 052.3010.2026.0005350-55' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.registro.tipo, 'andamento', 'tipo padrão');
  assert.equal(r.data.registro.texto, 'Enviei o ofício ao jurídico.');
  assert.equal(r.data.registro.autor_nome, 'Bruno Tavares');
  assert.equal(r.data.registro.data, '2026-09-22');
  assert.equal(r.data.registro.referencia, 'SEI 052.3010.2026.0005350-55');

  const depois = await detalhe(BRUNO_COF);
  assert.equal(depois.diario.length, 1);
  assert.equal(depois.diario_total, 1);
  assert.equal(depois.status, antes.status, 'não muda o status');
  assert.ok(depois.movimentada_em >= antes.movimentada_em, 'renova a última movimentação');
  const daLista = (await call(BRUNO_COF, 'GET', '/acoes')).data.find((a) => a.id === acao);
  assert.equal(daLista.diario_total, 1);
  assert.equal(daLista.ultimo_registro_texto, 'Enviei o ofício ao jurídico.');
  assert.equal(daLista.ultimo_registro_por, 'Bruno Tavares');
  assert.ok(daLista.ultimo_registro_em);
  assert.equal(daLista.pode_registrar_diario, true);
});

test('registro apontando uma tarefa: o nome aparece, o contador da tarefa sobe e só vale tarefa da própria ação', async (t) => {
  const { call, acao, t1, t2, detalhe, registrar } = await demo(t);
  await registrar(BRUNO_COF, { texto: 'Minuta revisada.', tarefa_id: t1, tipo: 'entrega' });
  await registrar(BRUNO_COF, { texto: 'Aguardando o jurídico.', tarefa_id: t1 });
  await registrar(BRUNO_COF, { texto: 'Conversa geral.' });
  const d = await detalhe(BRUNO_COF);
  assert.equal(d.diario.length, 3);
  const daTarefa = d.diario.filter((x) => x.tarefa_id === t1);
  assert.equal(daTarefa.length, 2);
  assert.ok(daTarefa.every((x) => x.tarefa_nome === 'Minuta do ofício'));
  assert.equal(d.diario.find((x) => x.tipo === 'entrega').texto, 'Minuta revisada.');
  const contadores = Object.fromEntries(d.checklist.map((c) => [c.id, c.diario_total]));
  assert.deepEqual([contadores[t1], contadores[t2]], [2, 0]);
  // Tarefa de outra ação, inexistente ou tipo inválido.
  const outra = (await call(BRUNO_COF, 'POST', '/acoes', { titulo: 'Outra ação', prazo: '2026-12-31' })).data.id;
  const tOutra = (await call(BRUNO_COF, 'POST', `/acoes/${outra}/checklist`, { texto: 'Tarefa de outra' })).data.id;
  assert.equal((await registrar(BRUNO_COF, { texto: 'x', tarefa_id: tOutra })).status, 404, 'tarefa de outra ação');
  assert.equal((await registrar(BRUNO_COF, { texto: 'x', tarefa_id: 999999 })).status, 404);
  assert.equal((await registrar(BRUNO_COF, { texto: 'x', tipo: 'fofoca' })).status, 400);
  assert.equal((await registrar(BRUNO_COF, { texto: '   ' })).status, 400, 'texto obrigatório');
  const longo = await registrar(BRUNO_COF, { texto: 'x'.repeat(1500) });
  assert.equal(longo.status, 201);
  assert.equal(longo.data.registro.texto.length, 1000, 'o texto passa de 1000 caracteres: o servidor corta, como nos comentários');
  void acao;
});

test('tempo no registro também entra no tempo da ação, na data do trabalho; minutos inválidos são recusados', async (t) => {
  const { call, acao, detalhe, registrar } = await demo(t);
  const r = await registrar(BRUNO_COF, { texto: 'Reunião com o jurídico.', minutos: 40, data: '2026-09-20' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.registro.minutos, 40);
  const d = await detalhe(BRUNO_COF);
  assert.equal(d.tempo_total, 40);
  assert.deepEqual(d.lancamentos.map((l) => [l.data, l.minutos]), [['2026-09-20', 40]]);
  for (const minutos of [0, -5, 1441, 2.5, 'abc']) assert.equal((await registrar(BRUNO_COF, { texto: 'x', minutos })).status, 400, `minutos ${minutos}`);
  assert.equal((await detalhe(BRUNO_COF)).tempo_total, 40, 'registro recusado não deixa tempo');
  const semTempo = await registrar(BRUNO_COF, { texto: 'Só uma observação.' });
  assert.equal(semTempo.data.registro.minutos, null);
  assert.equal((await detalhe(BRUNO_COF)).tempo_total, 40);
  void call; void acao;
});

test('concluir a tarefa pelo registro: marca, guarda quem concluiu e recusa tarefa já concluída ou sem tarefa escolhida', async (t) => {
  const { acao, t1, t2, detalhe, registrar } = await demo(t);
  const r = await registrar(BRUNO_COF, { texto: 'Minuta pronta e enviada.', tarefa_id: t1, concluir_tarefa: true });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const tarefa = (await detalhe(BRUNO_COF)).checklist.find((c) => c.id === t1);
  assert.equal(tarefa.concluido, true);
  assert.equal(tarefa.concluido_por, BRUNO_COF);
  assert.equal((await registrar(BRUNO_COF, { texto: 'De novo', tarefa_id: t1, concluir_tarefa: true })).status, 409, 'já concluída');
  assert.equal((await registrar(BRUNO_COF, { texto: 'Sem tarefa', concluir_tarefa: true })).status, 400, 'escolha a tarefa');
  assert.equal((await detalhe(BRUNO_COF)).checklist.find((c) => c.id === t2).concluido, false, 'a outra tarefa não muda');
  void acao;
});

test('data do trabalho: hoje por padrão, no passado até 60 dias, nunca no futuro', async (t) => {
  const { registrar } = await demo(t);
  assert.equal((await registrar(BRUNO_COF, { texto: 'a', data: '2026-09-23' })).status, 400, 'futura');
  assert.equal((await registrar(BRUNO_COF, { texto: 'a', data: '2026-07-22' })).status, 400, '62 dias atrás: além do limite');
  assert.equal((await registrar(BRUNO_COF, { texto: 'a', data: '2026-07-24' })).status, 201, '60 dias atrás');
  assert.equal((await registrar(BRUNO_COF, { texto: 'a', data: 'ontem' })).status, 400, 'formato inválido');
});

test('retificar: o novo registro aponta o anterior, que passa a constar como retificado', async (t) => {
  const { acao, call, detalhe, registrar } = await demo(t);
  const errado = (await registrar(BRUNO_COF, { texto: 'Enviado ao setor errado.' })).data.registro.id;
  const certo = (await registrar(BRUNO_COF, { texto: 'Correção: foi enviado ao jurídico.', retifica_id: errado })).data.registro;
  assert.equal(certo.retifica_id, errado);
  const d = await detalhe(BRUNO_COF);
  assert.equal(d.diario.find((x) => x.id === errado).retificado, true);
  assert.equal(d.diario.find((x) => x.id === certo.id).retificado, false);
  const outra = (await call(BRUNO_COF, 'POST', '/acoes', { titulo: 'Outra', prazo: '2026-12-31' })).data.id;
  assert.equal((await registrar(BRUNO_COF, { texto: 'x', retifica_id: errado }, outra)).status, 404, 'só retifica registro da mesma ação');
  void acao;
});

test('quem registra: chefe e membro executor; membro com tarefa registra só sobre ela; Diretor, Apoio e outros não, mas o Diretor lê', async (t) => {
  const { db, call, acao, t1, t2, detalhe, registrar } = await demo(t);
  // Membro executor (responsável pela ação): registra, com tempo.
  assert.equal((await registrar(MARINA, { texto: 'Iniciei a minuta.', tarefa_id: t1, minutos: 25 })).status, 201);
  // Membro só com tarefa (Paulo): registra sobre a tarefa dele e conclui, mas não registra geral, nem tarefa alheia, nem tempo.
  assert.equal((await registrar(PAULO, { texto: 'Empenho conferido.', tarefa_id: t2, concluir_tarefa: true })).status, 201);
  assert.equal((await registrar(PAULO, { texto: 'Conversa geral.' })).status, 403, 'sem tarefa: não é dele');
  assert.equal((await registrar(PAULO, { texto: 'Mexendo na tarefa alheia.', tarefa_id: t1 })).status, 403);
  assert.equal((await registrar(PAULO, { texto: 'Com tempo.', tarefa_id: t2, minutos: 10 })).status, 403, 'tempo é de quem executa');
  // Sem relação com a ação, outro Centro, e a gestão (que só lê).
  assert.equal((await registrar(OUTRO, { texto: 'Não é minha.' })).status, 403);
  assert.equal((await registrar(ANA_CPE, { texto: 'Outro Centro.' })).status, 404);
  assert.equal((await registrar(DIRETOR, { texto: 'Gestão.' })).status, 403);
  assert.equal((await registrar(APOIO, { texto: 'Gestão.' })).status, 403);
  // O Diretor lê o diário da ação demandada por ele (não interna) e não tem o botão de registrar.
  const d = await detalhe(DIRETOR);
  assert.equal(d.diario.length, 2);
  assert.equal(d.pode_registrar_diario, false);
  // O membro com tarefa vê o botão no detalhe (e só ele tem a tarefa).
  assert.equal((await detalhe(PAULO)).pode_registrar_diario, true);
  assert.equal((await detalhe(OUTRO)).pode_registrar_diario, false);
  // Ação interna do COF: o Diretor não a enxerga, então não lê o diário.
  await db.prepare('update acoes set interna = 1 where id = ?').run(acao);
  assert.equal((await call(DIRETOR, 'GET', `/acoes/${acao}`)).status, 404);
});

test('ação encerrada ou arquivada não recebe registros; o diário continua legível', async (t) => {
  const { db, call, acao, detalhe, registrar } = await demo(t);
  await registrar(BRUNO_COF, { texto: 'Antes de arquivar.' });
  await db.prepare('update acoes set arquivada = 1 where id = ?').run(acao);
  assert.equal((await registrar(BRUNO_COF, { texto: 'Depois de arquivar.' })).status, 409);
  assert.equal((await detalhe(BRUNO_COF)).diario.length, 1, 'continua lendo');
  assert.equal((await detalhe(BRUNO_COF)).pode_registrar_diario, false);
  await db.prepare('update acoes set arquivada = 0, encerrada = 1 where id = ?').run(acao);
  assert.equal((await registrar(BRUNO_COF, { texto: 'Depois de encerrar.' })).status, 409);
  void call;
});

test('excluir a tarefa exclui os registros dela (e só os dela); excluir a ação apaga o diário dela', async (t) => {
  const { db, call, acao, t1, detalhe, registrar } = await demo(t);
  await registrar(BRUNO_COF, { texto: 'Trabalhei na minuta.', tarefa_id: t1 });
  await registrar(BRUNO_COF, { texto: 'Trabalhei de novo.', tarefa_id: t1 });
  await registrar(BRUNO_COF, { texto: 'Registro geral da ação.' });
  assert.equal((await detalhe(BRUNO_COF)).checklist.find((c) => c.id === t1).diario_total, 2);
  const r = await call(BRUNO_COF, 'DELETE', `/acoes/${acao}/checklist/${t1}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.diario_excluidos, 2);
  const d = (await detalhe(BRUNO_COF)).diario;
  assert.deepEqual(d.map((x) => x.texto), ['Registro geral da ação.'], 'o registro geral continua');
  assert.equal((await call(BRUNO_COF, 'DELETE', `/acoes/${acao}`)).status, 200);
  assert.equal((await db.prepare('select count(*) as n from acao_diario where acao_id = ?').get(acao)).n, 0);
});

test('excluir um registro: quem o fez ou quem executa a ação; os retificadores deixam de apontá-lo; ação encerrada não permite', async (t) => {
  const { db, call, acao, detalhe, registrar } = await demo(t);
  const errado = (await registrar(BRUNO_COF, { texto: 'Enviado ao jurídico.' })).data.registro.id;
  const certo = (await registrar(BRUNO_COF, { texto: 'Correção.', retifica_id: errado })).data.registro.id;
  const d = await detalhe(BRUNO_COF);
  assert.equal(d.diario.every((x) => x.pode_excluir), true, 'o chefe pode excluir todos');
  assert.equal((await detalhe(DIRETOR)).diario.some((x) => x.pode_excluir), false, 'o Diretor lê, não exclui');
  assert.equal((await call(DIRETOR, 'DELETE', `/acoes/${acao}/diario/${errado}`)).status, 403);
  assert.equal((await call(OUTRO, 'DELETE', `/acoes/${acao}/diario/${errado}`)).status, 403);
  assert.equal((await call(BRUNO_COF, 'DELETE', `/acoes/${acao}/diario/999999`)).status, 404);
  assert.equal((await call(BRUNO_COF, 'DELETE', `/acoes/${acao}/diario/${errado}`)).status, 200);
  const depois = (await detalhe(BRUNO_COF)).diario;
  assert.deepEqual(depois.map((x) => x.id), [certo]);
  assert.equal(depois[0].retifica_id, null);
  await db.prepare('update acoes set encerrada = 1 where id = ?').run(acao);
  assert.equal((await call(BRUNO_COF, 'DELETE', `/acoes/${acao}/diario/${certo}`)).status, 409);
});
