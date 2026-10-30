// Multi-empresa, fase 3 (tela): perfil Plataforma, que cria e administra as empresas sem ler dados de negócio.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { aplicarMigracoes } from '../server/migrations.js';
import { vincularIdentidade } from '../server/vincular-identidade.js';
import { criarPlataforma } from '../server/criar-plataforma.js';

const config = { mode: 'supabase', supabaseUrl: 'https://projeto.supabase.co', key: 'sb_publishable_teste', origin: 'https://agilis.example', secure: true };
const SUBJ = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const SENHA = 'Senha-inicial-123';

async function ambiente(t) {
  const db = openDb(':memory:');
  await seed(db);
  const contas = new Map(); // e-mail -> { senha, subject }
  const admin = {
    async criar(email, senha) { const subject = SUBJ(contas.size + 100); contas.set(email, { senha, subject }); return subject; },
    async remover() {}, async atualizar() {},
  };
  const provedor = { async autenticar(email, senha) {
    const c = contas.get(email);
    if (!c || c.senha !== senha) throw Object.assign(new Error('x'), { status: 401 });
    return { subject: c.subject, expires: Math.floor(Date.now() / 1000) + 3600 };
  } };
  await db.prepare("update usuarios set email = 'diretor@a.invalid' where id = 1").run();
  await vincularIdentidade(db, 1, config.supabaseUrl, SUBJ(1)); // o Diretor da Empresa 1
  contas.set('diretor@a.invalid', { senha: SENHA, subject: SUBJ(1) });
  const plataforma = await criarPlataforma(db, config, admin, { nome: 'Plataforma Um', email: 'plat@agilis.invalid', senha: SENHA });
  const server = createApp(db, { auth: config, provedor, adminAuth: admin }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((ok, no) => server.close((e) => (e ? no(e) : ok()))); await db.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const entrar = async (empresa, email) => {
    const r = await fetch(`${base}/auth/entrar`, { method: 'POST', headers: { origin: config.origin, 'content-type': 'application/json' }, body: JSON.stringify({ empresa, email, senha: SENHA }) });
    if (r.status !== 200) return { status: r.status };
    return { status: 200, cookie: r.headers.get('set-cookie').split(';')[0], csrf: (await r.json()).csrf };
  };
  const chamar = async (sessao, method, caminho, body) => {
    const r = await fetch(`${base}${caminho}`, {
      method, headers: { cookie: sessao.cookie, origin: config.origin, 'x-csrf-token': sessao.csrf, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  const listaDaEntrada = async () => (await (await fetch(`${base}/auth/empresas`)).json()).empresas.map((e) => e.slug);
  return { db, admin, contas, plataforma, entrar, chamar, listaDaEntrada };
}

test('o comando cria a empresa interna da plataforma, fora da lista da entrada, e permite mais de uma conta', async (t) => {
  const { db, admin, plataforma } = await ambiente(t);
  const e = await db.prepare("select * from empresas where slug = 'plataforma'").get();
  assert.deepEqual([e.listada_no_login, e.ativa], [0, 1]);
  const u = await db.prepare('select * from usuarios where id = ?').get(plataforma.id);
  assert.deepEqual([u.perfil, u.empresa_id, u.trocar_senha, u.secao_id], ['plataforma', e.id, 1, null]);
  const outra = await criarPlataforma(db, config, admin, { nome: 'Plataforma Dois', email: 'plat2@agilis.invalid', senha: SENHA });
  assert.equal((await db.prepare('select empresa_id from usuarios where id = ?').get(outra.id)).empresa_id, e.id);
  assert.equal((await db.prepare("select count(*) n from empresas where slug = 'plataforma'").get()).n, 1);
  assert.equal((await db.prepare('select count(*) n from secoes where empresa_id = ?').get(e.id)).n, 0, 'a empresa da plataforma não tem dados de negócio');
});

test('a conta de plataforma entra pela empresa interna e só enxerga as rotas da plataforma', async (t) => {
  const { db, entrar, chamar, plataforma, listaDaEntrada } = await ambiente(t);
  await db.prepare('update usuarios set trocar_senha = 0 where id = ?').run(plataforma.id);
  assert.deepEqual(await listaDaEntrada(), ['dpog'], 'a empresa da plataforma não aparece na entrada');
  assert.equal((await entrar('dpog', 'plat@agilis.invalid')).status, 401, 'não entra pela empresa dos outros');
  const s = await entrar('plataforma', 'plat@agilis.invalid');
  assert.equal(s.status, 200);
  assert.equal((await chamar(s, 'GET', '/bootstrap')).data.user.perfil, 'plataforma');
  const lista = (await chamar(s, 'GET', '/plataforma/empresas')).data;
  assert.deepEqual(lista.map((x) => x.slug), ['dpog'], 'a empresa da própria plataforma não aparece');
  assert.ok(lista[0].usuarios >= 10);
  for (const caminho of ['/acoes', '/secoes', '/usuarios', '/config', '/avisos/atual', '/painel', '/reunioes', '/combinados', '/tarefas', '/diretrizes', '/atualizacao']) {
    assert.equal((await chamar(s, 'GET', caminho)).status, 403, caminho);
  }
  assert.equal((await chamar(s, 'POST', '/acoes', { titulo: 'x', prazo: '2026-12-31' })).status, 403);
  assert.equal((await chamar(s, 'PATCH', '/secoes/1', { nome: 'x' })).status, 403);
});

test('quem não é da plataforma não acessa as rotas da plataforma', async (t) => {
  const { db, entrar, chamar } = await ambiente(t);
  await db.prepare('update usuarios set trocar_senha = 0 where id = 1').run();
  const d = await entrar('dpog', 'diretor@a.invalid');
  assert.equal(d.status, 200);
  for (const [m, c, b] of [['GET', '/plataforma/empresas'], ['POST', '/plataforma/empresas', {}], ['PATCH', '/plataforma/empresas/1', { ativa: false }]]) {
    assert.equal((await chamar(d, m, c, b)).status, 403, `${m} ${c}`);
  }
  assert.equal((await db.prepare('select ativa from empresas where id = 1').get()).ativa, 1);
});

test('a plataforma cria a empresa e o primeiro Diretor, que entra pela empresa nova', async (t) => {
  const { db, entrar, chamar, contas, plataforma } = await ambiente(t);
  await db.prepare('update usuarios set trocar_senha = 0 where id = ?').run(plataforma.id);
  const s = await entrar('plataforma', 'plat@agilis.invalid');
  const dados = { nome: 'Empresa ZB', slug: 'zb', sigla: 'zb', diretor: 'Diretora ZB', email: 'Dir@ZB.invalid', senha: SENHA };
  const r = await chamar(s, 'POST', '/plataforma/empresas', dados);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.deepEqual([r.data.empresa.slug, r.data.empresa.sigla, r.data.empresa.usuarios, r.data.diretor.email], ['zb', 'ZB', 1, 'dir@zb.invalid']);
  const u = await db.prepare("select * from usuarios where email = 'dir@zb.invalid'").get();
  assert.deepEqual([u.perfil, u.empresa_id, u.trocar_senha], ['diretor', r.data.empresa.id, 1], 'o Diretor nasce na empresa nova, não na da plataforma');
  assert.ok(contas.has('dir@zb.invalid'));
  // Erros claros, e nenhuma empresa pela metade.
  for (const [corpo, status, trecho] of [
    [{ ...dados, slug: 'zb' }, 409, /Já existe/],
    [{ ...dados, slug: 'plataforma', email: 'x@zb.invalid' }, 400, /identificador/],
    [{ ...dados, slug: 'Com Espaço', email: 'y@zb.invalid' }, 400, /identificador/],
    [{ ...dados, slug: 'outra', email: 'dir@zb.invalid' }, 409, /já cadastrado/],
    [{ ...dados, slug: 'curta', email: 'c@zb.invalid', senha: 'curta' }, 400, /senha inicial/],
    [{ ...dados, slug: 'semnome', nome: ' ', email: 'n@zb.invalid' }, 400, /nome da empresa/],
  ]) {
    const e = await chamar(s, 'POST', '/plataforma/empresas', corpo);
    assert.equal(e.status, status, JSON.stringify(e.data));
    assert.match(e.data.erro, trecho);
  }
  assert.equal((await db.prepare("select count(*) n from empresas where slug in ('outra','curta','semnome')").get()).n, 0);
  // O Diretor novo entra pela empresa nova, e só vê a empresa dele.
  await db.prepare('update usuarios set trocar_senha = 0 where id = ?').run(u.id);
  assert.equal((await entrar('dpog', 'dir@zb.invalid')).status, 401);
  const d = await entrar('zb', 'dir@zb.invalid');
  assert.equal(d.status, 200);
  assert.equal((await chamar(d, 'GET', '/secoes')).data.length, 0);
  assert.equal((await chamar(d, 'GET', '/usuarios')).data.length, 1);
  assert.equal((await chamar(d, 'GET', '/plataforma/empresas')).status, 403);
});

test('a plataforma edita, tira da lista da entrada e desativa a empresa, que perde o acesso na hora', async (t) => {
  const { db, entrar, chamar, plataforma, listaDaEntrada } = await ambiente(t);
  await db.prepare('update usuarios set trocar_senha = 0 where id in (1, ?)').run(plataforma.id);
  const s = await entrar('plataforma', 'plat@agilis.invalid');
  const d = await entrar('dpog', 'diretor@a.invalid');
  assert.equal((await chamar(d, 'GET', '/bootstrap')).status, 200);
  const r = await chamar(s, 'PATCH', '/plataforma/empresas/1', { nome: 'Nome novo', sigla: 'nn', listada_no_login: false });
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.nome, r.data.sigla, r.data.listada_no_login, r.data.ativa], ['Nome novo', 'NN', false, true]);
  assert.deepEqual(await listaDaEntrada(), [], 'fora da lista da entrada');
  assert.equal((await entrar('dpog', 'diretor@a.invalid')).status, 200, 'mas ainda entra pelo identificador');
  assert.equal((await chamar(s, 'PATCH', '/plataforma/empresas/1', { ativa: false })).status, 200);
  assert.equal((await chamar(d, 'GET', '/bootstrap')).status, 401, 'a sessão da empresa desativada cai');
  assert.equal((await entrar('dpog', 'diretor@a.invalid')).status, 401);
  assert.equal((await chamar(s, 'PATCH', '/plataforma/empresas/1', { ativa: true })).status, 200);
  assert.equal((await entrar('dpog', 'diretor@a.invalid')).status, 200);
  // Validações e limites
  assert.equal((await chamar(s, 'PATCH', '/plataforma/empresas/1', { nome: ' ' })).status, 400);
  assert.equal((await chamar(s, 'PATCH', '/plataforma/empresas/1', { ativa: 'sim' })).status, 400);
  assert.equal((await chamar(s, 'PATCH', '/plataforma/empresas/999', { ativa: false })).status, 404);
  const propria = (await db.prepare("select id from empresas where slug = 'plataforma'").get()).id;
  assert.equal((await chamar(s, 'PATCH', `/plataforma/empresas/${propria}`, { ativa: false })).status, 404, 'a plataforma não desativa a si mesma');
});

test('migração 24: o perfil plataforma entra na restrição sem perder nenhum usuário', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await aplicarMigracoes(db, { ate: 23 });
  await db.prepare("insert into usuarios (nome, email, perfil) values ('Antigo', 'a@a.invalid', 'diretor')").run();
  await assert.rejects(db.prepare("insert into usuarios (nome, perfil) values ('P', 'plataforma')").run(), /CHECK/);
  const antes = await db.prepare('select * from usuarios order by id').all();
  assert.deepEqual(await aplicarMigracoes(db), [24]);
  assert.deepEqual(await db.prepare('select * from usuarios order by id').all(), antes);
  await db.prepare("insert into usuarios (nome, perfil) values ('P', 'plataforma')").run();
  await assert.rejects(db.prepare("insert into usuarios (nome, perfil) values ('Q', 'outro')").run(), /CHECK/);
  assert.deepEqual(await aplicarMigracoes(db), []);
});
