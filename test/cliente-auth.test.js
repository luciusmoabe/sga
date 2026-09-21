import test from 'node:test';
import assert from 'node:assert/strict';

test('cliente: Supabase não envia ID demo, propaga CSRF e limpa sessão no logout', async t => {
  const chamadas = [];
  t.mock.method(globalThis, 'fetch', async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    return new Response(JSON.stringify(url.endsWith('/config') ? { modo: 'supabase' }
      : url.endsWith('/bootstrap') ? { user: { id: 3 }, csrf: 'csrf-servidor' } : { ok: true }));
  });
  const cliente = await import('../public/js/api.js?teste=supabase');
  await cliente.modoAuth();
  cliente.sessao.userId = '1'; // Valor legado no navegador não determina a identidade.
  await cliente.get('/bootstrap');
  await cliente.post('/atualizacao', { proximo: ['Entrega'] });
  const envio = chamadas.at(-1).opcoes;
  assert.equal(envio.headers['x-user-id'], undefined);
  assert.equal(envio.headers['x-csrf-token'], 'csrf-servidor');
  assert.equal(envio.credentials, 'same-origin');
  await cliente.sair();
  assert.equal(chamadas.at(-1).url, '/api/auth/sair');
  assert.equal(cliente.sessao.csrf, null);
  assert.equal(cliente.sessao.userId, null);
});

test('cliente: resposta de sessão anterior não repopula cache nem CSRF após saída', async t => {
  let responder;
  t.mock.method(globalThis, 'fetch', () => new Promise(r => { responder = r; }));
  const cliente = await import('../public/js/api.js?teste=concorrencia');
  const pedido = cliente.get('/bootstrap');
  const rejeicao = assert.rejects(pedido, /sessão mudou/);
  cliente.limparSessao();
  responder(new Response(JSON.stringify({ user: { id: 1 }, csrf: 'antigo' })));
  await rejeicao;
  assert.equal(cliente.sessao.csrf, null);
});
