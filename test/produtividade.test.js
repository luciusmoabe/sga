// Produtividade das unidades: indicadores, esforço, devoluções e quem pode ver o quê.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { cargaAtual, diasEntre, indicadoresDoPeriodo, periodoAnterior } from '../server/produtividade.js';

const DIRETOR = 1, APOIO = 2, ANA_CPE = 3, BRUNO_COF = 4, GABRIELA_IND = 9, ADMIN = 10;
const CPE = 1, COF = 2, IND = 7;
// Março: um período em que o seed não tem ações nem tempo, para os números serem só os dos dados deste teste.
const DE = '2026-03-01', ATE = '2026-03-18';

test('indicadores puros: pontualidade, retrabalho, ciclo, pontos por esforço e dedicação', () => {
  const concluidas = [
    { prazo: '2026-09-10', prazo_original: '2026-09-10', concluida_dia: '2026-09-09', devolucoes: 0, esforco: 'grande', inicio_dia: '2026-09-01', iniciada_dia: null },
    { prazo: '2026-09-08', prazo_original: '2026-09-05', concluida_dia: '2026-09-12', devolucoes: 1, esforco: 'pequena', inicio_dia: '2026-09-02', iniciada_dia: '2026-09-10' },
    { prazo: '2026-09-20', prazo_original: '2026-09-20', concluida_dia: '2026-09-14', devolucoes: 0, esforco: null, inicio_dia: '2026-09-10', iniciada_dia: null },
  ];
  const i = indicadoresDoPeriodo({ concluidas, minutos: 180, bloqueios: [{ criado_dia: '2026-09-02', resolvido_dia: '2026-09-05', no_periodo: true }, { criado_dia: '2026-09-10', resolvido_dia: null, no_periodo: true }] });
  assert.equal(i.concluidas, 3);
  assert.equal(i.pontos, 3 + 1 + 2, 'grande 3, pequena 1, sem estimativa vale média (2)');
  assert.deepEqual([i.no_prazo, i.pontualidade, i.pontualidade_original], [2, 67, 67]);
  assert.deepEqual([i.prazo_alterado, i.prazo_alterado_pct], [1, 33]);
  assert.deepEqual([i.com_retrabalho, i.retrabalho_pct, i.devolucoes], [1, 33, 1]);
  assert.deepEqual([i.ciclo_medio_dias, i.ciclo_mediano_dias], [7.3, 8]);
  assert.equal(i.execucao_media_dias, 2, 'só entra quem tem início da execução registrado');
  assert.equal(i.minutos, 180);
  assert.deepEqual([i.bloqueios_registrados, i.bloqueios_resolvidos, i.bloqueio_medio_dias], [2, 1, 3]);
  const vazio = indicadoresDoPeriodo({});
  assert.deepEqual([vazio.concluidas, vazio.pontualidade, vazio.retrabalho_pct, vazio.ciclo_medio_dias], [0, null, null, null], 'sem entregas, sem percentuais inventados');
});

test('carga atual e período anterior', () => {
  const c = cargaAtual([
    { prazo: '2026-09-10', status: 'em_andamento', movimentada_dia: '2026-09-18', criada_dia: '2026-09-01' },
    { prazo: '2026-09-30', status: 'bloqueada', movimentada_dia: '2026-09-05', criada_dia: '2026-09-01' },
    { prazo: '2026-09-30', status: 'a_fazer', movimentada_dia: null, criada_dia: '2026-09-18' },
  ], '2026-09-19');
  assert.deepEqual(c, { abertas: 3, atrasadas: 1, paradas: 1, bloqueadas: 1 });
  assert.deepEqual(periodoAnterior('2026-09-01', '2026-09-18'), { de: '2026-08-14', ate: '2026-08-31', dias: 18 });
  assert.equal(diasEntre('2026-09-01', '2026-09-10'), 9);
});

async function demo(t) {
  const db = openDb(':memory:');
  await seed(db);
  // Entregas controladas na unidade do CPE (seção 1, com IND 7 abaixo) e uma no COF.
  const nova = async (c) => (await db.prepare(`insert into acoes (secao_id, titulo, status, prazo, prazo_original, prioridade, criada_em, criado_por, responsavel_id, concluida_em, devolucoes, esforco, iniciada_em, atribuida_em, interna, empresa_id)
    values (?, ?, ?, ?, ?, 'media', ?, 1, ?, ?, ?, ?, ?, ?, ?, 1)`).run(c.secao, c.titulo, c.status ?? 'concluida', c.prazo, c.prazoOriginal ?? c.prazo, c.criada ?? '2026-03-02T09:00:00',
    c.resp ?? null, c.concluida ?? null, c.dev ?? 0, c.esforco ?? null, c.iniciada ?? null, c.atribuida ?? null, c.interna ?? 0)).lastInsertRowid;
  const a1 = await nova({ secao: CPE, titulo: 'P1', resp: ANA_CPE, prazo: '2026-03-10', concluida: '2026-03-09T12:00:00', esforco: 'grande', atribuida: '2026-03-01T10:00:00' });
  const a2 = await nova({ secao: CPE, titulo: 'P2', resp: ANA_CPE, prazo: '2026-03-08', prazoOriginal: '2026-03-05', concluida: '2026-03-12T10:00:00', esforco: 'pequena', dev: 1, iniciada: '2026-03-10T08:00:00' });
  const a3 = await nova({ secao: IND, titulo: 'P3', resp: GABRIELA_IND, prazo: '2026-03-20', concluida: '2026-03-14T09:00:00', criada: '2026-03-10T08:00:00' });
  await nova({ secao: IND, titulo: 'Interna do IND', resp: GABRIELA_IND, prazo: '2026-03-30', concluida: '2026-03-15T09:00:00', interna: 1 });
  await nova({ secao: CPE, titulo: 'Período anterior', resp: ANA_CPE, prazo: '2026-08-25', concluida: '2026-02-20T09:00:00' });
  await nova({ secao: COF, titulo: 'Do COF', resp: BRUNO_COF, prazo: '2026-03-30', concluida: '2026-03-11T09:00:00' });
  await db.prepare("insert into tempo (acao_id, usuario_id, data, minutos, criado_em) values (?, ?, '2026-03-10', 120, '2026-03-10T10:00:00'), (?, ?, '2026-02-20', 60, '2026-02-20T10:00:00')").run(a1, ANA_CPE, a1, ANA_CPE);
  const server = createApp(db, { auth: { mode: 'demo' } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((ok) => server.close(ok)); await db.close(); });
  const call = async (uid, method, caminho, body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api${caminho}`, {
      method, headers: { 'x-user-id': String(uid), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  const consulta = `?de=${DE}&ate=${ATE}`;
  return { db, call, consulta, a1, a2, a3 };
}

test('a unidade do CPE soma as subseções, pesa pelo esforço e compara com o período anterior', async (t) => {
  const { call, consulta } = await demo(t);
  const r = (await call(ADMIN, 'GET', `/produtividade${consulta}&secao=${CPE}`)).data;
  assert.deepEqual(r.periodo, { de: DE, ate: ATE, dias: 18 });
  const u = r.unidades[0];
  assert.equal(u.secao.id, CPE);
  assert.equal(u.atual.concluidas, 4, 'o Administrador vê também a ação interna da subseção');
  assert.equal(u.anterior.concluidas, 1);
  assert.equal(u.anterior.minutos, 60);
  assert.equal(u.atual.minutos, 120);
  assert.deepEqual(u.subunidades.map((s) => s.secao.id), [IND], 'a subseção aparece à parte');
  assert.equal(u.subunidades[0].atual.concluidas, 2);
  assert.equal(u.ocultas, 0);
  // O Diretor não vê a ação interna: ela não entra nos números, e só a quantidade que ficou de fora é informada.
  const d = (await call(DIRETOR, 'GET', `/produtividade${consulta}&secao=${CPE}`)).data.unidades[0];
  assert.equal(d.atual.concluidas, 3);
  assert.deepEqual([d.atual.pontos, d.atual.pontualidade, d.atual.retrabalho_pct, d.atual.prazo_alterado], [6, 67, 33, 1]);
  // O que ficou de fora (concluídas e em aberto) é a diferença para o que o Administrador enxerga.
  assert.equal(d.ocultas, (u.atual.concluidas - d.atual.concluidas) + (u.carga.abertas - d.carga.abertas));
  assert.ok(d.ocultas >= 1);
  assert.equal(d.atual.devolucoes, 1);
});

test('por pessoa: só o Diretor, o Administrador e o chefe da unidade; o Apoio vê só a unidade', async (t) => {
  const { call, consulta } = await demo(t);
  const doDiretor = (await call(DIRETOR, 'GET', `/produtividade${consulta}&secao=${CPE}`)).data;
  assert.equal(doDiretor.pode_ver_pessoas, true);
  const pessoas = doDiretor.unidades[0].pessoas;
  const ana = pessoas.find((p) => p.id === ANA_CPE);
  assert.equal(ana.atual.concluidas, 2);
  assert.equal(ana.atual.minutos, 120, 'horas de quem as lançou');
  assert.equal(pessoas.find((p) => p.id === GABRIELA_IND).atual.concluidas, 1);
  const doApoio = (await call(APOIO, 'GET', `/produtividade${consulta}&secao=${CPE}`)).data;
  assert.equal(doApoio.pode_ver_pessoas, false);
  assert.equal(doApoio.unidades[0].pessoas, null);
  assert.equal(doApoio.unidades[0].atual.concluidas, 3, 'os números da unidade o Apoio vê');
  // O chefe vê a própria unidade com as pessoas e não consegue abrir a de outro Centro.
  const ana1 = (await call(ANA_CPE, 'GET', `/produtividade${consulta}`)).data;
  assert.deepEqual(ana1.unidades.map((u) => u.secao.id), [CPE]);
  assert.ok(ana1.unidades[0].pessoas.length >= 2);
  assert.equal(ana1.unidades[0].atual.concluidas, 4, 'o chefe vê as ações internas da própria árvore');
  const bruno = (await call(BRUNO_COF, 'GET', `/produtividade${consulta}&secao=${CPE}`)).data;
  assert.deepEqual(bruno.unidades.map((u) => u.secao.id), [COF], 'pedir o CPE devolve a unidade do próprio chefe');
  assert.equal(bruno.unidades[0].atual.concluidas, 1);
  // Gestão sem seção: todas as unidades de acompanhamento.
  const todas = (await call(DIRETOR, 'GET', `/produtividade${consulta}`)).data.unidades;
  assert.ok(todas.length >= 6 && todas.every((u) => ['centro', 'coordenacao', 'diretoria_adjunta'].includes(u.secao.tipo)));
});

test('perfis sem acesso e validações do período', async (t) => {
  const { db, call, consulta } = await demo(t);
  const membro = (await db.prepare("insert into usuarios (nome, email, perfil, secao_id) values ('Membro', 'm@exemplo.invalid', 'membro', 1)").run()).lastInsertRowid;
  const consultaUser = (await db.prepare("insert into usuarios (nome, email, perfil) values ('Leitor', 'l@exemplo.invalid', 'consulta')").run()).lastInsertRowid;
  for (const uid of [membro, consultaUser]) assert.equal((await call(uid, 'GET', `/produtividade${consulta}`)).status, 403, `perfil ${uid}`);
  for (const q of ['?de=ontem&ate=2026-03-18', `?de=${ATE}&ate=${DE}`, '?de=2026-03-01&ate=2026-12-31', '?de=2024-01-01&ate=2026-03-18', `${consulta}&secao=abc`]) {
    assert.equal((await call(DIRETOR, 'GET', `/produtividade${q}`)).status, 400, q);
  }
  assert.equal((await call(DIRETOR, 'GET', `/produtividade${consulta}&secao=9999`)).status, 404);
  assert.equal((await call(DIRETOR, 'GET', '/produtividade')).status, 200, 'sem período vale o padrão: os últimos 28 dias');
});

test('esforço: quem cria ou executa informa; valores inválidos são recusados; a diretriz leva o esforço às ações', async (t) => {
  const { db, call } = await demo(t);
  const criada = await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Com esforço', prazo: '2026-12-31', esforco: 'grande' });
  assert.equal(criada.status, 201);
  assert.equal(criada.data.esforco, 'grande');
  assert.equal((await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Inválida', prazo: '2026-12-31', esforco: 'enorme' })).status, 400);
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${criada.data.id}`, { esforco: 'pequena' })).status, 200);
  assert.equal((await db.prepare('select esforco from acoes where id = ?').get(criada.data.id)).esforco, 'pequena');
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${criada.data.id}`, { esforco: null })).status, 200);
  assert.equal((await db.prepare('select esforco from acoes where id = ?').get(criada.data.id)).esforco, null);
  assert.equal((await call(DIRETOR, 'PATCH', `/acoes/${criada.data.id}`, { esforco: 'media' })).status, 403, 'a gestão não mexe no que é da seção');
  const dir = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Com esforço', prazo: '2026-12-31', destino: 'especificos', secoes: [CPE, COF], esforco: 'media' });
  assert.equal(dir.status, 201);
  assert.deepEqual((await db.prepare('select esforco from acoes where diretriz_id = ?').all(dir.data.id)).map((a) => a.esforco), ['media', 'media']);
  assert.equal((await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'x', prazo: '2026-12-31', destino: 'todos', esforco: 'x' })).status, 400);
});

test('o início da execução marca a primeira vez em andamento e a devolução conta como retrabalho', async (t) => {
  const { db, call } = await demo(t);
  const dir = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Para devolver', prazo: '2026-12-31', destino: 'especificos', secoes: [CPE] });
  const id = (await db.prepare('select id from acoes where diretriz_id = ?').get(dir.data.id)).id;
  assert.equal((await db.prepare('select iniciada_em, devolucoes from acoes where id = ?').get(id)).iniciada_em, null);
  await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' });
  const primeira = (await db.prepare('select iniciada_em from acoes where id = ?').get(id)).iniciada_em;
  assert.ok(primeira);
  await call(ANA_CPE, 'POST', `/acoes/${id}/tempo`, { minutos: 30 });
  await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { status: 'concluida' });
  const devolvida = await call(DIRETOR, 'POST', `/acoes/${id}/devolver`, { comentario: 'Falta o anexo.' });
  assert.equal(devolvida.status, 200, JSON.stringify(devolvida.data));
  let a = await db.prepare('select iniciada_em, devolucoes, status from acoes where id = ?').get(id);
  assert.deepEqual([a.devolucoes, a.status, a.iniciada_em], [1, 'em_andamento', primeira], 'conta a devolução e preserva o início');
  await call(ANA_CPE, 'PATCH', `/acoes/${id}`, { status: 'concluida' });
  await call(DIRETOR, 'POST', `/acoes/${id}/devolver`, { comentario: 'Ainda falta.' });
  assert.equal((await db.prepare('select devolucoes from acoes where id = ?').get(id)).devolucoes, 2);
});
