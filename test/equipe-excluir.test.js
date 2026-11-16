// Excluir um membro da equipe (DELETE /api/equipe/:id): o chefe exclui só membros sem histórico, da própria árvore; com histórico,
// o caminho é Desativar. Quem é suplente ou chefe de subseção não sai por aqui. A conta de login remota também é removida.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { vincularIdentidade } from '../server/vincular-identidade.js';

const DIRETOR = 1, APOIO = 2, ANA_CPE = 3, BRUNO_COF = 4, GABRIELA_IND = 9;
const CPE = 1, COF = 2, IND = 7;

async function demo(t) {
  const db = openDb(':memory:');
  await seed(db);
  const novo = async (nome, perfil, secao) => (await db.prepare('insert into usuarios (nome, email, perfil, secao_id) values (?, ?, ?, ?)')
    .run(nome, `${nome.toLowerCase().replace(/ /g, '.')}@exemplo.invalid`, perfil, secao)).lastInsertRowid;
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
  const existe = async (id) => !!(await db.prepare('select 1 as ok from usuarios where id = ?').get(id));
  return { db, call, novo, existe };
}

test('o chefe exclui um membro sem histórico, da própria seção ou de uma subseção, e ele sai da lista', async (t) => {
  const { call, novo, existe } = await demo(t);
  const marta = await novo('Marta Lima', 'membro', CPE);
  const nuno = await novo('Nuno Reis', 'membro', IND); // subseção abaixo do CPE
  assert.ok((await call(ANA_CPE, 'GET', '/equipe')).data.some((m) => m.id === marta));

  assert.equal((await call(ANA_CPE, 'DELETE', `/equipe/${marta}`)).status, 200);
  assert.equal(await existe(marta), false);
  assert.ok(!(await call(ANA_CPE, 'GET', '/equipe')).data.some((m) => m.id === marta));
  assert.equal((await call(ANA_CPE, 'DELETE', `/equipe/${nuno}`)).status, 200, 'também os da subseção');
  assert.equal(await existe(nuno), false);
  assert.equal((await call(ANA_CPE, 'DELETE', `/equipe/${marta}`)).status, 404, 'já excluída');
});

test('um membro inativo também pode ser excluído', async (t) => {
  const { call, novo, existe } = await demo(t);
  const marta = await novo('Marta Lima', 'membro', CPE);
  assert.equal((await call(ANA_CPE, 'PATCH', `/equipe/${marta}`, { ativo: false })).status, 200);
  assert.equal((await call(ANA_CPE, 'DELETE', `/equipe/${marta}`)).status, 200);
  assert.equal(await existe(marta), false);
});

test('com histórico a exclusão é recusada e o caminho é Desativar: ações atribuídas, tempo e comentários', async (t) => {
  const { call, novo, existe } = await demo(t);
  const comAcao = await novo('Marta Lima', 'membro', CPE);
  const acao = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Ação da Marta', prazo: '2026-12-31', responsavel_id: comAcao })).data.id;
  const r = await call(ANA_CPE, 'DELETE', `/equipe/${comAcao}`);
  assert.equal(r.status, 409);
  assert.match(r.data.erro, /histórico/);
  assert.match(r.data.erro, /Desativar/);
  assert.equal(await existe(comAcao), true, 'a conta continua, com o nome nas ações');

  // Mesmo sem ação atribuída, ter registrado tempo ou comentado é histórico.
  const comentou = await novo('Nuno Reis', 'membro', CPE);
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${acao}`, { responsavel_id: comentou })).status, 200);
  assert.equal((await call(comentou, 'PATCH', `/acoes/${acao}`, { status: 'em_andamento' })).status, 200);
  assert.equal((await call(comentou, 'POST', `/acoes/${acao}/tempo`, { minutos: 20 })).status, 201);
  assert.equal((await call(ANA_CPE, 'PATCH', `/acoes/${acao}`, { responsavel_id: null })).status, 200);
  const depois = await call(ANA_CPE, 'DELETE', `/equipe/${comentou}`);
  assert.equal(depois.status, 409);
  assert.match(depois.data.erro, /lançamentos de tempo/);

  // Desativar continua possível, e a ação segue com o nome da pessoa.
  assert.equal((await call(ANA_CPE, 'PATCH', `/equipe/${comAcao}`, { ativo: false })).status, 200);
});

test('só membros saem por aqui; o chefe não exclui a si mesmo, suplente, chefe de subseção nem gente de outra seção', async (t) => {
  const { call, novo, existe } = await demo(t);
  const suplente = await novo('Sílvia Duarte', 'chefe', CPE);
  const deOutra = await novo('Olga Dias', 'membro', COF);
  const marta = await novo('Marta Lima', 'membro', CPE);

  assert.equal((await call(ANA_CPE, 'DELETE', `/equipe/${ANA_CPE}`)).status, 409, 'a si mesmo');
  assert.equal((await call(ANA_CPE, 'DELETE', `/equipe/${suplente}`)).status, 409, 'suplente: use Desativar');
  assert.equal((await call(ANA_CPE, 'DELETE', `/equipe/${GABRIELA_IND}`)).status, 409, 'chefe de subseção');
  assert.equal((await call(ANA_CPE, 'DELETE', `/equipe/${deOutra}`)).status, 404, 'de outra seção');
  assert.equal((await call(BRUNO_COF, 'DELETE', `/equipe/${marta}`)).status, 404, 'o chefe de outro Centro não alcança');
  assert.equal((await call(GABRIELA_IND, 'DELETE', `/equipe/${marta}`)).status, 404, 'nem a subseção alcança a seção acima');
  for (const id of [suplente, deOutra, marta, GABRIELA_IND]) assert.equal(await existe(id), true);
});

test('perfis sem a permissão: Diretor, Apoio e membro recebem 403', async (t) => {
  const { call, novo, existe } = await demo(t);
  const marta = await novo('Marta Lima', 'membro', CPE);
  const outro = await novo('Nuno Reis', 'membro', CPE);
  assert.equal((await call(DIRETOR, 'DELETE', `/equipe/${marta}`)).status, 403);
  assert.equal((await call(APOIO, 'DELETE', `/equipe/${marta}`)).status, 403);
  assert.equal((await call(outro, 'DELETE', `/equipe/${marta}`)).status, 403);
  assert.equal(await existe(marta), true);
});

// ---------------------------------------------------------------- com Supabase simulado: a conta remota também é removida
const projeto = 'https://projeto.supabase.co';
const config = { mode: 'supabase', supabaseUrl: projeto, key: 'sb_publishable_teste', origin: 'https://agilis.example', secure: true };
const SUBJ = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

test('Supabase simulado: ao excluir, a conta de login remota é removida e o e-mail pode ser cadastrado de novo', async (t) => {
  const db = openDb(':memory:');
  await seed(db);
  const remotas = new Map(), removidas = [];
  let proximo = 100;
  const provedor = { async autenticar(email, senha) {
    const c = remotas.get(email);
    if (!c || c.senha !== senha) throw Object.assign(new Error('x'), { status: 401 });
    return { subject: c.subject, expires: Math.floor(Date.now() / 1000) + 3600 };
  } };
  const adminAuth = {
    async criar(email, senha) { const subject = SUBJ(proximo++); remotas.set(email, { senha, subject }); return subject; },
    async atualizar() {},
    async remover(subject) { removidas.push(subject); for (const [e, c] of remotas) if (c.subject === subject) remotas.delete(e); },
  };
  await db.prepare('update usuarios set email = ? where id = ?').run('ana@orgao.gov.br', ANA_CPE);
  remotas.set('ana@orgao.gov.br', { senha: 'Senha-definitiva-1!', subject: SUBJ(1) });
  await vincularIdentidade(db, ANA_CPE, projeto, SUBJ(1));
  const server = createApp(db, { auth: config, provedor, adminAuth }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((ok) => server.close(ok)); await db.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const entrar = await fetch(`${base}/auth/entrar`, { method: 'POST', headers: { origin: config.origin, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ana@orgao.gov.br', senha: 'Senha-definitiva-1!' }) });
  assert.equal(entrar.status, 200);
  const csrf = (await entrar.json()).csrf, cookie = entrar.headers.get('set-cookie').split(';')[0];
  const api = async (metodo, caminho, corpo) => {
    const r = await fetch(`${base}${caminho}`, { method: metodo, headers: { cookie, origin: config.origin, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };

  const cadastro = { nome: 'Paulo Reis', email: 'paulo@orgao.gov.br', senha: 'Senha-ok-123' };
  const criado = await api('POST', '/equipe', cadastro);
  assert.equal(criado.status, 201, JSON.stringify(criado.data));
  const subject = remotas.get('paulo@orgao.gov.br').subject;

  assert.equal((await api('DELETE', `/equipe/${criado.data.id}`)).status, 200);
  assert.deepEqual(removidas, [subject], 'a conta remota foi removida');
  assert.equal(await db.prepare('select 1 as ok from usuarios where id = ?').get(criado.data.id), undefined);
  assert.equal((await api('POST', '/equipe', cadastro)).status, 201, 'o mesmo e-mail volta a poder ser cadastrado');
});
