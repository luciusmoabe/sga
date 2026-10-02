// Diretoria Adjunta: seção de primeiro nível só de estrutura, cujos membros são Administradores criados pelo servidor.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { aplicarMigracoes } from '../server/migrations.js';
import { criarAdministrador, definirSecaoAdministrador } from '../server/criar-administrador.js';

// Usuários e seções do banco de demonstração (server/seed.js).
const DIRETOR = 1, APOIO = 2, ANA_CPE = 3, BRUNO_COF = 4, ADMIN = 10;
const CPE = 1, COF = 2;
const PRAZO = '2026-12-31';
const config = { supabaseUrl: 'https://projeto.supabase.co' };
const SUBJ = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

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
  const criarDA = async () => {
    const r = await call(DIRETOR, 'POST', '/secoes', { nome: 'Diretoria Adjunta', sigla: 'DA', tipo: 'diretoria_adjunta' });
    assert.equal(r.status, 201);
    return r.data.id;
  };
  return { db, call, criarDA };
}

test('o Diretor cadastra uma única Diretoria Adjunta, sem chefe e sem subseções', async (t) => {
  const { call, criarDA } = await demo(t);
  assert.equal((await call(DIRETOR, 'POST', '/secoes', { nome: 'DA', tipo: 'diretoria_adjunta', chefe_id: ANA_CPE })).status, 400, 'sem chefe');
  const da = await criarDA();
  assert.equal((await call(ADMIN, 'POST', '/secoes', { nome: 'Outra', tipo: 'diretoria_adjunta' })).status, 409, 'só uma');
  assert.equal((await call(APOIO, 'POST', '/secoes', { nome: 'X', tipo: 'diretoria_adjunta' })).status, 403);

  assert.equal((await call(DIRETOR, 'POST', '/secoes', { nome: 'Sub', tipo: 'subsecao', pai_id: da })).status, 400, 'sem subseções');
  assert.equal((await call(DIRETOR, 'PATCH', `/secoes/${da}`, { chefe_id: ANA_CPE })).status, 400, 'não recebe chefe');
  assert.equal((await call(DIRETOR, 'PATCH', `/secoes/${da}`, { tipo: 'centro' })).status, 400, 'não deixa de ser DA');
  assert.equal((await call(DIRETOR, 'PATCH', `/secoes/${CPE}`, { tipo: 'diretoria_adjunta' })).status, 400, 'Centro não vira DA');
  assert.equal((await call(DIRETOR, 'PATCH', `/secoes/${da}`, { nome: 'Diretoria Adjunta de Gestão' })).status, 200, 'renomear pode');

  // Chefe não é vinculado à Diretoria Adjunta, nem pela edição do usuário.
  const edit = await call(DIRETOR, 'PATCH', `/usuarios/${BRUNO_COF}`, { secao_id: da });
  assert.equal(edit.status, 400);
  assert.match(edit.data.erro, /não tem chefe/);
});

test('o Diretor acompanha a Diretoria Adjunta como as demais seções; o relato vem dos membros', async (t) => {
  const { db, call, criarDA } = await demo(t);
  const da = await criarDA();

  // Recebe ações: direta, por diretriz para seções escolhidas e por redirecionamento. "Todos os Centros" não a inclui.
  const direta = await call(DIRETOR, 'POST', '/acoes', { titulo: 'Ação da DA', prazo: PRAZO, secao_id: da });
  assert.equal(direta.status, 201);
  const todos = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Para todos', prazo: PRAZO, destino: 'todos' });
  assert.equal((await db.prepare('select count(*) n from acoes where diretriz_id = ? and secao_id = ?').get(todos.data.id, da)).n, 0);
  const escolhida = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Só DA', prazo: PRAZO, destino: 'especificos', secoes: [da] });
  assert.equal(escolhida.status, 201);
  const id = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Veio do CPE', prazo: PRAZO })).data.id;
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${id}/redirecionar`, { secao_id: da })).status, 200);

  // O Diretor vê as ações na lista, no detalhe da seção e no Painel.
  const lista = (await call(DIRETOR, 'GET', `/acoes?secao=${da}`)).data;
  assert.deepEqual(lista.map((a) => a.titulo).sort(), ['Ação da DA', 'Só DA', 'Veio do CPE']);
  const detalhe = await call(DIRETOR, 'GET', `/secoes/${da}/detalhe`);
  assert.equal(detalhe.status, 200);
  const noPainel = (await call(DIRETOR, 'GET', '/painel')).data.itens.find((i) => i.secao.id === da);
  assert.equal(noPainel.abertas, 3);
  assert.equal(noPainel.enviada, false);

  // Um Administrador da Diretoria Adjunta envia o relato da própria seção sem informar secao_id.
  const email = (await db.prepare('select email from usuarios where id = ?').get(ADMIN)).email;
  await definirSecaoAdministrador(db, email, da);
  const semana = (await call(ADMIN, 'GET', '/bootstrap')).data.semana;
  const relato = await call(ADMIN, 'GET', `/atualizacao?semana=${semana}`);
  assert.equal(relato.status, 200);
  assert.equal(relato.data.atual, null, 'ainda não enviado');
  assert.equal((await call(ADMIN, 'PUT', '/atualizacao', { semana, observacoes: 'Semana tranquila.' })).status, 200);

  // O Diretor Adjunto cria as ações da própria seção ("Minhas ações") e o Diretor as vê como as das demais.
  const propria = await call(ADMIN, 'POST', '/acoes', { titulo: 'Criada pelo Diretor Adjunto', prazo: PRAZO, secao_id: da });
  assert.equal(propria.status, 201);
  assert.equal(propria.data.interna, false);
  assert.ok((await call(ADMIN, 'GET', `/acoes?situacao=abertas&secao=${da}`)).data.every((a) => a.secao_id === da));
  assert.ok((await call(DIRETOR, 'GET', `/acoes?secao=${da}`)).data.some((a) => a.id === propria.data.id));
  assert.equal((await call(DIRETOR, 'GET', '/painel')).data.itens.find((i) => i.secao.id === da).enviada, true);
});

test('Administradores entram na Diretoria Adjunta só pelo servidor e mantêm acesso total', async (t) => {
  const { db, call, criarDA } = await demo(t);
  const da = await criarDA();
  const admin = { async criar() { return SUBJ(700); }, async remover() {} };

  const u = await criarAdministrador(db, config, admin, { nome: 'Adjunta Um', email: 'adj1@orgao.gov.br', senha: 'Senha-inicial-123', secao: da });
  assert.equal(u.perfil, 'administrador');
  assert.equal(u.secao_id, da);
  const v = await criarAdministrador(db, config, admin, { nome: 'Adjunta Dois', email: 'adj2@orgao.gov.br', subject: SUBJ(701), secao: da });
  assert.equal(v.secao_id, da);
  await assert.rejects(criarAdministrador(db, config, admin, { nome: 'Errado', email: 'adj3@orgao.gov.br', senha: 'Senha-inicial-123', secao: CPE }), /Diretoria Adjunta/);
  await assert.rejects(criarAdministrador(db, config, admin, { nome: 'Errado', email: 'adj4@orgao.gov.br', subject: SUBJ(702), secao: COF }), /Diretoria Adjunta/);

  // Administrador já existente: vincula e desvincula pelo comando, sem mudar perfil nem acesso.
  const email = (await db.prepare('select email from usuarios where id = ?').get(ADMIN)).email;
  await definirSecaoAdministrador(db, email, da);
  assert.equal((await db.prepare('select secao_id, perfil from usuarios where id = ?').get(ADMIN)).secao_id, da);
  await assert.rejects(definirSecaoAdministrador(db, email, CPE), /Diretoria Adjunta/);
  const chefeEmail = (await db.prepare('select email from usuarios where id = ?').get(ANA_CPE)).email;
  await assert.rejects(definirSecaoAdministrador(db, chefeEmail, da), /não encontrado/, 'não promove chefe');

  // A tela de Estrutura lista os membros; o vínculo não reduz o acesso do Administrador.
  const secoes = (await call(DIRETOR, 'GET', '/secoes')).data;
  assert.deepEqual(secoes.find((s) => s.id === da).membros.map((m) => m.nome).sort(),
    ['Adjunta Dois', 'Adjunta Um', 'Administrador (demonstração)']);
  assert.equal((await call(ADMIN, 'GET', '/painel')).status, 200);
  const todas = (await call(ADMIN, 'GET', '/acoes')).data.length;
  assert.equal(todas, (await db.prepare("select count(*) n from acoes where arquivada = 0 and status != 'concluida' and encerrada = 0").get()).n);
  // A API continua sem mexer na conta do Administrador.
  assert.equal((await call(ADMIN, 'PATCH', `/usuarios/${u.id}`, { secao_id: null })).status, 400);

  await definirSecaoAdministrador(db, email, null);
  assert.equal((await db.prepare('select secao_id from usuarios where id = ?').get(ADMIN)).secao_id, null);
});

test('migrações: banco anterior à versão 11 aceita a Diretoria Adjunta sem perder seções nem vínculos', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  // Reproduz o CHECK antigo de secoes, com um índice e uma view sobre a tabela.
  const { sql } = await db.prepare("select sql from sqlite_master where type = 'table' and name = 'secoes'").get();
  const antiga = sql.replace(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"secoes"|secoes)\s*\(/i, 'CREATE TABLE secoes_antiga (')
    .replace("'subsecao','diretoria_adjunta'", "'subsecao'");
  assert.notEqual(antiga, sql);
  await db.exec(`pragma foreign_keys = off;
    ${antiga};
    insert into secoes_antiga select * from secoes;
    drop table secoes;
    alter table secoes_antiga rename to secoes;
    create index idx_secoes_pai on secoes(pai_id);
    create view centros_ativos as select id, nome from secoes where pai_id is null and ativa = 1;
    delete from schema_migrations where id = 11;
    pragma foreign_keys = on`);
  const antes = await db.prepare('select * from secoes order by id').all();
  await assert.rejects(db.prepare("insert into secoes (nome, tipo, criada_em) values ('DA', 'diretoria_adjunta', 'x')").run(), /CHECK/);

  assert.deepEqual(await aplicarMigracoes(db), [11]);

  assert.deepEqual(await db.prepare('select * from secoes order by id').all(), antes);
  await db.prepare("insert into secoes (nome, tipo, criada_em) values ('DA', 'diretoria_adjunta', 'x')").run();
  await assert.rejects(db.prepare("insert into secoes (nome, tipo, criada_em) values ('X', 'outro', 'x')").run(), /CHECK/);
  assert.deepEqual(await db.prepare('pragma foreign_key_check').all(), [], 'nenhuma referência ficou órfã');
  assert.equal((await db.prepare("select count(*) n from sqlite_master where name in ('idx_secoes_pai','centros_ativos')").get()).n, 2);
  assert.deepEqual(await aplicarMigracoes(db), [], 'reexecução não altera nada');
});
