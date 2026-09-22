// Cabeçalhos de segurança, proxy confiável e ausência de recursos de terceiros na interface.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';

const { openDb } = await import('../server/db.js');
const { createApp } = await import('../server/app.js');

const db = openDb(':memory:');
test.after(() => db.close());

async function subir(auth) {
  const server = createApp(db, { auth }).listen(0);
  await once(server, 'listening');
  const fechar = () => new Promise((ok) => server.close(ok));
  return { base: `http://127.0.0.1:${server.address().port}`, fechar };
}

test('respostas estáticas e da API trazem os cabeçalhos de segurança', async () => {
  const { base, fechar } = await subir({ mode: 'demo' });
  try {
    for (const caminho of ['/', '/api/auth/config']) {
      const r = await fetch(base + caminho);
      const csp = r.headers.get('content-security-policy');
      assert.match(csp, /default-src 'self'/, caminho);
      assert.match(csp, /frame-ancestors 'none'/, caminho);
      assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/, caminho);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(r.headers.get('x-frame-options'), 'DENY');
      assert.equal(r.headers.get('x-powered-by'), null);
      assert.equal(r.headers.get('strict-transport-security'), null, 'HSTS só com HTTPS');
    }
  } finally { await fechar(); }
});

test('HSTS é enviado apenas quando o site é servido por HTTPS', async () => {
  const { base, fechar } = await subir({ mode: 'demo', secure: true });
  try {
    const r = await fetch(base + '/');
    assert.match(r.headers.get('strict-transport-security'), /max-age=\d+/);
  } finally { await fechar(); }
});

test('proxy confiável só é ativado por configuração explícita (a Vercel o ativa por padrão)', () => {
  const antes = { v: process.env.VERCEL, n: process.env.NETLIFY, t: process.env.SGC_TRUST_PROXY };
  try {
    delete process.env.VERCEL; delete process.env.NETLIFY; delete process.env.SGC_TRUST_PROXY;
    assert.equal(createApp(db, { auth: { mode: 'demo' } }).get('trust proxy'), false);
    process.env.SGC_TRUST_PROXY = 'true'; // valor não numérico: um salto
    assert.equal(createApp(db, { auth: { mode: 'demo' } }).get('trust proxy'), 1);
    process.env.SGC_TRUST_PROXY = '2';
    assert.equal(createApp(db, { auth: { mode: 'demo' } }).get('trust proxy'), 2);
  } finally {
    for (const [k, v] of [['VERCEL', antes.v], ['NETLIFY', antes.n], ['SGC_TRUST_PROXY', antes.t]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('a interface não depende de fontes ou scripts de terceiros', async () => {
  const { base, fechar } = await subir({ mode: 'demo' });
  try {
    const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
    const css = await readFile(new URL('../public/estilo.css', import.meta.url), 'utf8');
    assert.doesNotMatch(html + css, /https?:\/\/(?!www\.w3\.org)/, 'sem URLs externas na página e no CSS');
    for (const f of ['manrope-latin', 'dm-sans-latin']) {
      const r = await fetch(`${base}/fontes/${f}.woff2`);
      assert.equal(r.status, 200, f);
      assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0, 4).toString(), 'wOF2', f);
    }
  } finally { await fechar(); }
});
