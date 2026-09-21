import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { configurarAuth, criarProvedorSupabase, hash } from '../server/auth.js';
import { openDb, configurarPg } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { vincularIdentidade } from '../server/vincular-identidade.js';

const subject = '33333333-3333-4333-8333-333333333333';
const config = { mode: 'supabase', supabaseUrl: 'https://projeto.supabase.co', key: 'sb_publishable_teste', origin: 'https://agilis.example', secure: true };
const credenciais = { email: 'chefe@example.org', senha: 'Senha fictícia de teste' };

async function ambiente(t, { vincular = true } = {}) {
  const db = openDb(':memory:');
  await seed(db);
  if (vincular) await vincularIdentidade(db, 3, config.supabaseUrl, subject);
  let tentativas = 0;
  const provedor = { async autenticar(email, senha) {
    tentativas++;
    if (email !== credenciais.email || senha !== credenciais.senha) throw Object.assign(new Error('Detalhe secreto'), { status: 401 });
    return { subject, expires: Math.floor(Date.now() / 1000) + 3600 };
  } };
  const server = createApp(db, { auth: config, provedor }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    await db.close();
  });
  const call = (url, options = {}) => fetch(`http://127.0.0.1:${server.address().port}/api${url}`, {
    redirect: 'manual', signal: AbortSignal.timeout(3000), ...options,
  });
  const login = (dados = credenciais, headers = {}) => call('/auth/entrar', { method: 'POST',
    headers: { origin: config.origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(dados) });
  return { db, call, login, provedor, tentativas: () => tentativas };
}

const lerCookie = r => r.headers.get('set-cookie').split(';')[0];

test('auth: Supabase é padrão, configuração falha fechada e demo não funciona em produção', () => {
  assert.throws(() => configurarAuth({}), /Configure SUPABASE/);
  assert.throws(() => configurarAuth({ SGC_AUTH_MODE: 'entra' }), /supabase ou demo/);
  assert.throws(() => configurarAuth({ SGC_AUTH_MODE: 'demo', NODE_ENV: 'production' }), /proibido/);
  assert.throws(() => configurarAuth({ SGC_AUTH_MODE: 'demo', VERCEL: '1' }), /proibido/);
  assert.deepEqual(configurarAuth({ SGC_AUTH_MODE: 'demo' }), { mode: 'demo' });
  const env = { SUPABASE_URL: config.supabaseUrl, SUPABASE_PUBLISHABLE_KEY: config.key, SGC_PUBLIC_ORIGIN: config.origin };
  assert.equal(configurarAuth(env).secure, true);
  assert.throws(() => configurarAuth({ ...env, SGC_PUBLIC_ORIGIN: 'http://agilis.example' }), /HTTPS/);
  assert.throws(() => configurarAuth({ ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_teste' }), /administrativas/);
  assert.throws(() => configurarAuth({ ...env, SUPABASE_URL: 'https://projeto.supabase.co/caminho' }), /HTTPS/);
});

test('auth: provedor valida senha no Supabase e confirma usuário; descarta tokens', async () => {
  const chamadas = [];
  const provider = criarProvedorSupabase(config, { fetchImpl: async (url, options) => {
    chamadas.push({ url, options });
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.apikey, config.key);
    if (url.endsWith('/token?grant_type=password')) {
      assert.deepEqual(JSON.parse(options.body), { email: credenciais.email, password: credenciais.senha });
      return new Response(JSON.stringify({ access_token: 'token-secreto', refresh_token: 'refresh-secreto', expires_in: 3600, user: { id: subject } }));
    }
    assert.equal(url, config.supabaseUrl + '/auth/v1/user');
    assert.equal(options.headers.authorization, 'Bearer token-secreto');
    return new Response(JSON.stringify({ id: subject, email_confirmed_at: '2026-01-01', is_anonymous: false }));
  } });
  const resultado = await provider.autenticar(credenciais.email, credenciais.senha);
  assert.equal(resultado.subject, subject);
  assert.deepEqual(Object.keys(resultado).sort(), ['expires', 'subject']);
  assert.equal(chamadas.length, 2);
});

test('auth: erros do provedor são sanitizados e usuário não confirmado é recusado', async () => {
  for (const [status, esperado] of [[400, 401], [401, 401], [429, 429], [500, 503]]) {
    const provider = criarProvedorSupabase(config, { fetchImpl: async () => new Response('detalhe-secreto', { status }) });
    await assert.rejects(provider.autenticar('a@b.com', 'senha'), e => e.status === esperado && !e.message.includes('detalhe-secreto'));
  }
  for (const user of [{ id: subject }, { id: subject, email_confirmed_at: '2026-01-01', is_anonymous: true }, { id: 'outro' }]) {
    const provider = criarProvedorSupabase(config, { fetchImpl: async url => new Response(JSON.stringify(url.includes('/token?')
      ? { access_token: 'secreto', expires_in: 3600, user: { id: subject } } : user)) });
    await assert.rejects(provider.autenticar('a@b.com', 'senha'), { status: 401 });
  }
});

test('auth: login usa vínculo local, ignora ID demo e protege mutações e logout por CSRF', async t => {
  const { db, call, login } = await ambiente(t);
  assert.equal((await call('/bootstrap', { headers: { 'x-user-id': '1' } })).status, 401);
  assert.equal((await call('/usuarios-demo')).status, 404);
  assert.equal((await call('/auth/entrar')).status, 404);
  assert.equal((await call('/auth/retorno')).status, 404);
  const r = await login();
  assert.equal(r.status, 200);
  const cookie = lerCookie(r);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax']) assert.ok(r.headers.get('set-cookie').includes(flag));
  const resposta = await call('/bootstrap', { headers: { cookie, 'x-user-id': '1' } });
  assert.equal(resposta.headers.get('cache-control'), 'no-store');
  const boot = await resposta.json();
  assert.equal(boot.user.id, 3);
  assert.equal(boot.user.perfil, 'chefe');
  const sessao = await db.prepare('select * from auth_sessoes_senha').get();
  assert.equal(sessao.id, hash(cookie.split('=')[1]));
  assert.ok(!JSON.stringify(sessao).includes(credenciais.senha));
  for (const headers of [{ cookie }, { cookie, origin: 'https://malicioso.example', 'x-csrf-token': boot.csrf },
    { cookie, origin: config.origin, 'x-csrf-token': 'errado' }]) {
    assert.equal((await call('/auth/sair', { method: 'POST', headers })).status, 403);
  }
  assert.equal((await call('/secoes', { method: 'POST', headers: { cookie, origin: config.origin, 'x-csrf-token': boot.csrf,
    'content-type': 'application/json' }, body: JSON.stringify({ nome: 'Tentativa', tipo: 'centro' }) })).status, 403);
  assert.equal((await call('/auth/sair', { method: 'POST', headers: { cookie, origin: config.origin, 'x-csrf-token': boot.csrf } })).status, 200);
  assert.equal((await call('/bootstrap', { headers: { cookie } })).status, 401);
});

test('auth: login recusa origem externa e dados inválidos antes de enviar senha ao provedor', async t => {
  const { login, tentativas } = await ambiente(t);
  assert.equal((await login(credenciais, { origin: 'https://malicioso.example' })).status, 403);
  assert.equal((await login({ email: 'inválido', senha: 'teste' })).status, 400);
  assert.equal((await login({ email: credenciais.email, senha: '' })).status, 400);
  assert.equal(tentativas(), 0);
});

test('auth: conta sem vínculo e senha errada retornam a mesma resposta sem cadastrar usuários', async t => {
  const { db, login } = await ambiente(t, { vincular: false });
  const semAcesso = await login();
  const senhaErrada = await login({ ...credenciais, senha: 'errada' });
  assert.equal(semAcesso.status, 401);
  assert.equal(senhaErrada.status, 401);
  assert.deepEqual(await semAcesso.json(), await senhaErrada.json());
  assert.equal((await db.prepare('select count(*) n from usuarios').get()).n, 10);
  assert.equal((await db.prepare('select count(*) n from auth_sessoes_senha').get()).n, 0);
});

test('auth: sessões expiradas/desativadas são recusadas e novo login revoga o cookie anterior', async t => {
  const { db, call, login } = await ambiente(t);
  const antigo = lerCookie(await login());
  const cookie = lerCookie(await login(credenciais, { cookie: antigo }));
  assert.equal((await call('/bootstrap', { headers: { cookie: antigo } })).status, 401);
  await db.exec('update usuarios set ativo = 0 where id = 3');
  assert.equal((await call('/bootstrap', { headers: { cookie } })).status, 401);
  await db.exec('update usuarios set ativo = 1 where id = 3; update auth_sessoes_senha set expira_em = 1');
  assert.equal((await call('/bootstrap', { headers: { cookie } })).status, 401);
});

test('auth: limite de tentativas é atômico, inclusive em logins concorrentes', async t => {
  const { db, login, tentativas } = await ambiente(t);
  const respostas = await Promise.all(Array.from({ length: 12 }, () => login({ ...credenciais, senha: 'errada' })));
  assert.equal(respostas.filter(r => r.status === 401).length, 10);
  assert.equal(respostas.filter(r => r.status === 429).length, 2);
  assert.equal(tentativas(), 10);
  assert.ok(!(await db.prepare('select * from auth_tentativas').all()).some(r => JSON.stringify(r).includes(credenciais.email)));
});

test('auth: vínculo é por projeto e UUID, idempotente e não substitui contas existentes', async t => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  await vincularIdentidade(db, 3, config.supabaseUrl, subject);
  await vincularIdentidade(db, 3, config.supabaseUrl, subject);
  await assert.rejects(vincularIdentidade(db, 4, config.supabaseUrl, subject), /já vinculado/);
  await assert.rejects(vincularIdentidade(db, 3, 'https://outro.supabase.co', subject), /já vinculado/);
  await assert.rejects(vincularIdentidade(db, 999, config.supabaseUrl, '44444444-4444-4444-8444-444444444444'), /inexistente/);
  assert.equal((await db.prepare('select count(*) n from auth_contas').get()).n, 1);
});

test('auth: sessão é renovada com atividade, respeitando o teto de 8 h e as sessões antigas', async t => {
  const { db, call, login } = await ambiente(t);
  const cookie = lerCookie(await login());
  const agora = () => Math.floor(Date.now() / 1000);
  const estado = async () => await db.prepare('select expira_em, criada_em from auth_sessoes_senha').get();
  const ajustar = (expira, criada) => db.exec(`update auth_sessoes_senha set expira_em = ${expira}, criada_em = ${criada}`);

  // Sessão recém-criada: mais de metade da janela restante, nada é gravado nem reenviado.
  const inicial = await estado();
  assert.ok(inicial.criada_em > 0);
  const quieta = await call('/bootstrap', { headers: { cookie } });
  assert.equal(quieta.status, 200);
  assert.equal(quieta.headers.get('set-cookie'), null);
  assert.equal((await estado()).expira_em, inicial.expira_em);

  // Perto de expirar: renova por mais 1 h e reenvia o cookie com a nova validade.
  await ajustar(agora() + 600, agora() - 3000);
  const renovada = await call('/bootstrap', { headers: { cookie } });
  assert.equal(renovada.status, 200);
  assert.match(renovada.headers.get('set-cookie'), /Max-Age=3[56]\d\d/);
  assert.ok((await estado()).expira_em >= agora() + 3590);

  // Perto do teto de 8 h: a renovação é limitada ao teto.
  await ajustar(agora() + 100, agora() - (8 * 3600 - 600));
  assert.equal((await call('/bootstrap', { headers: { cookie } })).status, 200);
  const limitada = (await estado()).expira_em;
  assert.ok(limitada > agora() + 500 && limitada <= agora() + 600, `expira em ${limitada - agora()} s`);

  // Depois do teto não há renovação: a sessão expira e o usuário entra de novo.
  await ajustar(agora() + 100, agora() - (8 * 3600 + 100));
  const antes = (await estado()).expira_em;
  assert.equal((await call('/bootstrap', { headers: { cookie } })).status, 200);
  assert.equal((await estado()).expira_em, antes);

  // Sessão anterior à migração (criada_em = 0) mantém o prazo original.
  await ajustar(agora() + 100, 0);
  const legada = (await estado()).expira_em;
  assert.equal((await call('/bootstrap', { headers: { cookie } })).status, 200);
  assert.equal((await estado()).expira_em, legada);
});

test('PostgreSQL: TLS valida certificado e impede downgrade por URL', () => {
  const config = configurarPg('postgresql://usuario:senha@banco.example/db?sslmode=require', {});
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.ok(!config.connectionString.includes('sslmode'));
  for (const parametro of ['sslmode=disable', 'sslmode=no-verify', 'ssl=false', 'sslrootcert=arquivo']) {
    assert.throws(() => configurarPg(`postgresql://usuario:senha@banco.example/db?${parametro}`, {}), /TLS/);
  }
  assert.throws(() => configurarPg('postgresql://usuario:senha@banco.example/db', { SGC_PG_SSL: 'disable' }), /local/);
  assert.equal(configurarPg('postgresql://usuario:senha@127.0.0.1/db', { SGC_PG_SSL: 'disable' }).ssl, false);
});
