// Multi-empresa, fase 2: escolha da empresa na entrada. O servidor confere que a conta pertence à empresa escolhida.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { vincularIdentidade } from '../server/vincular-identidade.js';

const config = { mode: 'supabase', supabaseUrl: 'https://projeto.supabase.co', key: 'sb_publishable_teste', origin: 'https://agilis.example', secure: true };
const SENHA = 'Senha fictícia de teste';
const CONTAS = {
  'ana@a.invalid': { subject: '33333333-3333-4333-8333-333333333333' },
  'bia@zb.invalid': { subject: '44444444-4444-4444-8444-444444444444' },
};
const MSG = 'E-mail, senha ou empresa incorretos.';

async function ambiente(t) {
  const db = openDb(':memory:');
  await seed(db);
  await vincularIdentidade(db, 3, config.supabaseUrl, CONTAS['ana@a.invalid'].subject);
  await db.prepare("insert into empresas (nome, sigla, slug, criada_em) values ('Empresa ZB', 'ZB', 'zb', '2026-09-01')").run();
  const bia = (await db.prepare("insert into usuarios (nome, email, perfil, empresa_id) values ('Bia ZB', 'bia@zb.invalid', 'diretor', 2)").run()).lastInsertRowid;
  await vincularIdentidade(db, bia, config.supabaseUrl, CONTAS['bia@zb.invalid'].subject);
  const provedor = { async autenticar(email, senha) {
    if (!CONTAS[email] || senha !== SENHA) throw Object.assign(new Error('Detalhe secreto'), { status: 401 });
    return { subject: CONTAS[email].subject, expires: Math.floor(Date.now() / 1000) + 3600 };
  } };
  const server = createApp(db, { auth: config, provedor }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((ok, no) => server.close((e) => (e ? no(e) : ok()))); await db.close(); });
  const call = (url, options = {}) => fetch(`http://127.0.0.1:${server.address().port}/api${url}`, { redirect: 'manual', signal: AbortSignal.timeout(3000), ...options });
  const login = (dados) => call('/auth/entrar', { method: 'POST', headers: { origin: config.origin, 'content-type': 'application/json' }, body: JSON.stringify(dados) });
  return { db, call, login };
}
const cookieDe = (r) => r.headers.get('set-cookie').split(';')[0];

test('a lista de empresas da entrada é pública, traz só as ativas e listadas e não expõe números internos', async (t) => {
  const { db, call } = await ambiente(t);
  await db.prepare("insert into empresas (nome, slug, listada_no_login, criada_em) values ('Empresa Oculta', 'oculta', 0, '2026-09-01')").run();
  await db.prepare("insert into empresas (nome, slug, ativa, criada_em) values ('Empresa Inativa', 'inativa', 0, '2026-09-01')").run();
  const r = await call('/auth/empresas'); // sem cookie nem identificação
  assert.equal(r.status, 200);
  const { empresas } = await r.json();
  assert.deepEqual(empresas.map((e) => e.slug), ['dpog', 'zb'], 'só as ativas e listadas, por ordem de nome');
  for (const e of empresas) assert.deepEqual(Object.keys(e).sort(), ['nome', 'sigla', 'slug']);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('com mais de uma empresa ativa é preciso escolher; a conta só entra na empresa a que pertence', async (t) => {
  const { call, login } = await ambiente(t);
  const faltando = await login({ email: 'ana@a.invalid', senha: SENHA });
  assert.equal(faltando.status, 400);
  assert.match((await faltando.json()).erro, /empresa/i);

  const certa = await login({ empresa: 'dpog', email: 'ana@a.invalid', senha: SENHA });
  assert.equal(certa.status, 200);
  const boot = await (await call('/bootstrap', { headers: { cookie: cookieDe(certa) } })).json();
  assert.equal(boot.user.id, 3);
  assert.equal(boot.empresa.slug, 'dpog');
  assert.deepEqual(Object.keys(boot.empresa).sort(), ['nome', 'sigla', 'slug']);

  const certaB = await login({ empresa: 'zb', email: 'bia@zb.invalid', senha: SENHA });
  assert.equal(certaB.status, 200);
  const bootB = await (await call('/bootstrap', { headers: { cookie: cookieDe(certaB) } })).json();
  assert.equal(bootB.user.empresa_id, 2);
  assert.equal(bootB.empresa.nome, 'Empresa ZB');
  assert.equal((await (await call('/secoes', { headers: { cookie: cookieDe(certaB) } })).json()).length, 0, 'a empresa nova ainda não tem seções da outra');

  // Empresa errada, desconhecida ou em maiúsculas: a mesma resposta genérica, sem revelar a que empresa o e-mail pertence.
  const respostas = [];
  for (const [empresa, email] of [['zb', 'ana@a.invalid'], ['dpog', 'bia@zb.invalid'], ['nao-existe', 'ana@a.invalid'], ['dpog', 'ninguem@a.invalid']]) {
    const r = await login({ empresa, email, senha: SENHA });
    assert.equal(r.status, 401, `${empresa} ${email}`);
    respostas.push((await r.json()).erro);
  }
  assert.deepEqual([...new Set(respostas)], [MSG]);
  assert.equal((await login({ empresa: 'dpog', email: 'ana@a.invalid', senha: 'errada' })).status, 401);
  assert.equal((await login({ empresa: 'DPOG ', email: 'ana@a.invalid', senha: SENHA })).status, 200, 'o identificador é normalizado');
  assert.equal((await login({ empresa: 42, email: 'ana@a.invalid', senha: SENHA })).status, 400);
  assert.equal((await login({ empresa: 'x'.repeat(61), email: 'ana@a.invalid', senha: SENHA })).status, 400);
});

test('com uma só empresa ativa a entrada segue funcionando sem escolha (telas antigas)', async (t) => {
  const { db, login } = await ambiente(t);
  await db.prepare('update empresas set ativa = 0 where id = 2').run();
  assert.equal((await login({ email: 'ana@a.invalid', senha: SENHA })).status, 200);
  assert.equal((await login({ empresa: 'zb', email: 'bia@zb.invalid', senha: SENHA })).status, 401, 'empresa inativa não aceita entrada');
});

test('desativar a empresa encerra o acesso das contas dela na hora', async (t) => {
  const { db, call, login } = await ambiente(t);
  const r = await login({ empresa: 'zb', email: 'bia@zb.invalid', senha: SENHA });
  const cookie = cookieDe(r);
  assert.equal((await call('/bootstrap', { headers: { cookie } })).status, 200);
  await db.prepare('update empresas set ativa = 0 where id = 2').run();
  assert.equal((await call('/bootstrap', { headers: { cookie } })).status, 401);
  assert.equal((await login({ empresa: 'zb', email: 'bia@zb.invalid', senha: SENHA })).status, 401);
  // A outra empresa não é afetada.
  const a = await login({ empresa: 'dpog', email: 'ana@a.invalid', senha: SENHA });
  assert.equal((await call('/bootstrap', { headers: { cookie: cookieDe(a) } })).status, 200);
});

test('o limite de tentativas conta por empresa e e-mail', async (t) => {
  const { db, login } = await ambiente(t);
  for (let i = 0; i < 12; i++) await login({ empresa: 'zb', email: 'ana@a.invalid', senha: 'errada' });
  assert.equal((await login({ empresa: 'zb', email: 'ana@a.invalid', senha: 'errada' })).status, 429);
  assert.equal((await login({ empresa: 'dpog', email: 'ana@a.invalid', senha: SENHA })).status, 200, 'o mesmo e-mail na empresa certa não foi bloqueado');
  assert.ok((await db.prepare('select count(*) n from auth_tentativas').get()).n >= 2);
});
