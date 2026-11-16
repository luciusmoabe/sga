// Ação atribuída a alguém de uma subseção, criada na seção-mãe (por autoridade superior): ela precisa aparecer para o
// responsável, que a recebe como nova, abre, executa e acompanha. Antes, a visibilidade era só "ações da minha seção e
// das de baixo", e quem estava abaixo da seção da ação não a enxergava (mas o selo do menu a contava).
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

const ANA_CPE = 3, GABRIELA_IND = 9, DIRETOR = 1;
const CPE = 1, IND = 7;
const MARINA = 31, PAULO = 32; // membros criados pelo teste: Marina na subseção IND (abaixo do CPE), Paulo no próprio CPE

async function demo(t) {
  const db = openDb(':memory:');
  await seed(db);
  await db.prepare('update acoes set recebida_em = null').run();
  const ins = db.prepare('insert into usuarios (id, nome, email, perfil, secao_id) values (?,?,?,?,?)');
  await ins.run(MARINA, 'Marina Costa', 'marina@exemplo.invalid', 'membro', IND);
  await ins.run(PAULO, 'Paulo Lima', 'paulo@exemplo.invalid', 'membro', CPE);
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
  const criar = async (titulo, responsavel) => {
    const r = await call(ANA_CPE, 'POST', '/acoes', { titulo, prazo: '2026-12-31', prioridade: 'media', responsavel_id: responsavel });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data.id;
  };
  const lista = async (uid) => (await call(uid, 'GET', '/acoes')).data;
  const novas = async (uid) => (await call(uid, 'GET', '/bootstrap')).data.acoes_novas;
  return { db, call, criar, lista, novas };
}

test('membro de uma subseção vê a ação da seção-mãe que foi atribuída a ele, como nova, e a executa', async (t) => {
  const { call, criar, lista, novas } = await demo(t);
  const id = await criar('Levantar os indicadores do trimestre', MARINA);
  const outra = await criar('Ação da seção-mãe sem responsável na subseção', PAULO);

  const dela = await lista(MARINA);
  const a = dela.find((x) => x.id === id);
  assert.ok(a, 'a ação delegada aparece na lista dela');
  assert.equal(a.pode_executar, true, 'é dela: cai na aba "Minhas"');
  assert.equal(a.nova, true, 'chega como nova');
  assert.equal(a.responsavel_nome, 'Marina Costa');
  assert.ok(!dela.some((x) => x.id === outra), 'só vê, além da subseção, o que foi atribuído a ela (não a seção-mãe inteira)');
  assert.equal(await novas(MARINA), 1, 'o selo do menu bate com a lista');

  assert.equal((await call(MARINA, 'GET', `/acoes/${id}`)).status, 200, 'abre o detalhe');
  assert.equal((await call(MARINA, 'POST', `/acoes/${id}/vista`)).status, 200, 'a ficha registra a ciência ao abrir');
  assert.equal(await novas(MARINA), 0, 'abrir tira o "nova"');
  assert.equal((await call(MARINA, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' })).status, 200, 'executa a própria ação');
  assert.equal((await call(MARINA, 'GET', `/acoes/${outra}`)).status, 404, 'a ação da seção-mãe que não é dela continua invisível');
});

test('chefe de uma subseção vê a ação da seção-mãe atribuída a ele, como nova, sem enxergar o resto da seção-mãe', async (t) => {
  const { call, criar, lista, novas } = await demo(t);
  const id = await criar('Preparar a nota técnica de indicadores', GABRIELA_IND);
  const outra = await criar('Ação da seção-mãe de outra pessoa', PAULO);

  const dela = await lista(GABRIELA_IND);
  const a = dela.find((x) => x.id === id);
  assert.ok(a, 'a ação delegada aparece para o chefe da subseção');
  assert.equal(a.pode_executar, true);
  assert.equal(a.somente_leitura, false);
  assert.equal(a.nova, true);
  assert.ok(!dela.some((x) => x.id === outra));
  assert.equal(await novas(GABRIELA_IND), 1);

  assert.equal((await call(GABRIELA_IND, 'GET', `/acoes/${id}`)).status, 200);
  assert.equal((await call(GABRIELA_IND, 'POST', `/acoes/${id}/vista`)).status, 200);
  assert.equal(await novas(GABRIELA_IND), 0);
  assert.equal((await call(GABRIELA_IND, 'POST', `/acoes/${id}/tempo`, { minutos: 30 })).status, 201, 'registra tempo');
  assert.equal((await call(GABRIELA_IND, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' })).status, 200);
  assert.equal((await call(GABRIELA_IND, 'GET', `/acoes/${outra}`)).status, 404);
});

test('a ação delegada aparece também nas tarefas e nada muda para quem já a via (membro da própria seção)', async (t) => {
  const { call, criar, lista } = await demo(t);
  const id = await criar('Ação da seção-mãe para a subseção', MARINA);
  const tarefa = await call(ANA_CPE, 'POST', `/acoes/${id}/checklist`, { texto: 'Pedir os dados', data: '2026-10-05', responsavel_id: MARINA });
  assert.equal(tarefa.status, 201, JSON.stringify(tarefa.data));
  assert.ok((await call(MARINA, 'GET', '/tarefas')).data.some((x) => x.acao_id === id));

  const paulo = await lista(PAULO); // membro do CPE: lê a árvore do CPE e continua lendo (a ação não é dele: só leitura)
  const vista = paulo.find((x) => x.id === id);
  assert.ok(vista);
  assert.equal(vista.pode_executar, false);
  // O Diretor segue vendo a ação como sempre.
  assert.ok((await lista(DIRETOR)).some((x) => x.id === id));
});

test('filtro por seção das telas do chefe e do membro: com minhas=1 inclui as atribuídas a quem consulta, sem isso não', async (t) => {
  const { call, criar } = await demo(t);
  const id = await criar('Ação da seção-mãe atribuída à subseção', MARINA);
  const ids = async (uid, qs) => (await call(uid, 'GET', `/acoes?situacao=abertas&secao=${IND}${qs}`)).data.map((a) => a.id);
  assert.ok(!(await ids(MARINA, '')).includes(id), 'sem minhas=1, o filtro por seção continua restrito à seção');
  assert.ok((await ids(MARINA, '&minhas=1')).includes(id), 'com minhas=1, a ação atribuída a ela entra');
  assert.ok((await ids(GABRIELA_IND, '&minhas=1')).every((x) => x !== id), 'não vale para quem não é o responsável');
  // Quem não é da seção (gestão) não ganha nada com o parâmetro: o filtro segue exato.
  assert.ok(!(await ids(DIRETOR, '&minhas=1')).includes(id));
});
