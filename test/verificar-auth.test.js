import test from 'node:test';
import assert from 'node:assert/strict';
import { verificarAuth } from '../server/verificar-auth.js';

const env = { SUPABASE_URL: 'https://projeto.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_chave_publica',
  SGC_PUBLIC_ORIGIN: 'https://agilis.example' };
const settings = { external: { email: true }, disable_signup: true };

test('verificação auth: dados ausentes são reportados sem acesso à rede', async () => {
  const r = await verificarAuth({}, { online: true, fetchImpl: () => { assert.fail('Não deve acessar a rede'); } });
  assert.equal(r.ok, false);
  assert.equal(r.resultados.filter(i => !i.ok).length, 3);
  assert.equal(r.callback, null);
});

test('verificação auth: modo local valida formato sem consultar rede', async () => {
  const r = await verificarAuth(env, { fetchImpl: () => { assert.fail('Não deve acessar a rede'); } });
  assert.equal(r.ok, true);
  assert.equal(r.callback, 'https://agilis.example');
  assert.match(r.limites, /não comprova/);
  assert.equal((await verificarAuth({ ...env, SGC_AUTH_MODE: 'demo' })).ok, false);
  assert.equal((await verificarAuth({ ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_admin' })).ok, false);
  assert.equal((await verificarAuth({ ...env, SGC_PUBLIC_ORIGIN: 'http://agilis.example' })).ok, false);
});

test('verificação auth: consulta só as configurações públicas com a chave pública', async () => {
  const r = await verificarAuth(env, { online: true, fetchImpl: async (url, options) => {
    assert.equal(url, `${env.SUPABASE_URL}/auth/v1/settings`);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
    assert.equal(options.body, undefined);
    return new Response(JSON.stringify(settings));
  } });
  assert.equal(r.ok, true);
});

test('verificação auth: respostas divergentes e falhas não são tratados como sucesso', async () => {
  for (const dados of [{}, { external: null }]) {
    const r = await verificarAuth(env, { online: true, fetchImpl: async () => new Response(JSON.stringify(dados)) });
    assert.equal(r.ok, false);
  }
  const r = await verificarAuth(env, { online: true, fetchImpl: async () => { throw new Error(env.SUPABASE_PUBLISHABLE_KEY); } });
  assert.equal(r.ok, false);
  assert.ok(!JSON.stringify(r).includes(env.SUPABASE_PUBLISHABLE_KEY));
});
