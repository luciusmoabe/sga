import test from 'node:test';
import assert from 'node:assert/strict';
import { verificarAuth } from '../server/verificar-auth.js';

const tenant = '11111111-1111-4111-8111-111111111111';
const env = { ENTRA_TENANT_ID: tenant, ENTRA_CLIENT_ID: '22222222-2222-4222-8222-222222222222',
  ENTRA_CLIENT_SECRET: 'segredo-nao-deve-aparecer', SGC_PUBLIC_ORIGIN: 'https://agilis.example' };
const base = `https://login.microsoftonline.com/${tenant}`;
const metadados = { issuer: `${base}/v2.0`, authorization_endpoint: `${base}/oauth2/v2.0/authorize`,
  token_endpoint: `${base}/oauth2/v2.0/token`, jwks_uri: `${base}/discovery/v2.0/keys`,
  id_token_signing_alg_values_supported: ['RS256'], response_types_supported: ['code'] };

test('verificação auth: dados ausentes são reportados sem acesso à rede', async () => {
  const r = await verificarAuth({}, { online: true, fetchImpl: () => { assert.fail('Não deve acessar a rede'); } });
  assert.equal(r.ok, false);
  assert.equal(r.resultados.filter(i => !i.ok).length, 4);
  assert.equal(r.callback, null);
});

test('verificação auth: modo local valida formato sem revelar segredo nem consultar rede', async () => {
  const r = await verificarAuth(env, { fetchImpl: () => { assert.fail('Não deve acessar a rede'); } });
  assert.equal(r.ok, true);
  assert.equal(r.callback, 'https://agilis.example/api/auth/retorno');
  assert.ok(!JSON.stringify(r).includes(env.ENTRA_CLIENT_SECRET));
  assert.match(r.limites, /não comprova/);
  assert.equal((await verificarAuth({ ...env, SGC_AUTH_MODE: 'demo' })).ok, false);
  assert.equal((await verificarAuth({ ...env, ENTRA_TENANT_ID: 'common' })).ok, false);
  assert.equal((await verificarAuth({ ...env, SGC_PUBLIC_ORIGIN: 'http://agilis.example' })).ok, false);
});

test('verificação auth: descoberta usa endpoint oficial sem enviar credenciais', async () => {
  const r = await verificarAuth(env, { online: true, fetchImpl: async (url, options) => {
    assert.equal(url, `${base}/v2.0/.well-known/openid-configuration`);
    assert.equal(options.redirect, 'error');
    assert.ok(!JSON.stringify(options).includes(env.ENTRA_CLIENT_SECRET));
    assert.equal(options.body, undefined);
    return new Response(JSON.stringify(metadados));
  } });
  assert.equal(r.ok, true);
});

test('verificação auth: metadados divergentes e falhas não são tratados como sucesso', async () => {
  for (const dados of [{ ...metadados, issuer: 'https://outro.example' }, { ...metadados, jwks_uri: 'https://outro.example/keys' }, {}]) {
    const r = await verificarAuth(env, { online: true, fetchImpl: async () => new Response(JSON.stringify(dados)) });
    assert.equal(r.ok, false);
  }
  const r = await verificarAuth(env, { online: true, fetchImpl: async () => { throw new Error(env.ENTRA_CLIENT_SECRET); } });
  assert.equal(r.ok, false);
  assert.ok(!JSON.stringify(r).includes(env.ENTRA_CLIENT_SECRET));
});
