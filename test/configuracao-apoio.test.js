// O Diretor (ou o Administrador) assinala o Apoio que também abre a Configuração; contas e perfis seguem só com eles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';

process.env.SGC_NOW = '2026-09-19T10:00:00';
const DIRETOR = 1, APOIO = 2, CHEFE = 3, ADMIN = 10;

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
  return { db, call };
}

test('Apoio sem o acesso não mexe na estrutura; com o acesso assinalado, sim, mas não nas contas', async (t) => {
  const { call } = await demo(t);
  const nova = { nome: 'Centro Novo', tipo: 'centro' };
  assert.equal((await call(APOIO, 'POST', '/secoes', nova)).status, 403);
  assert.equal((await call(APOIO, 'PUT', '/config/vocabulario', {})).status, 403);
  assert.equal((await call(APOIO, 'GET', '/bootstrap')).data.user.acesso_configuracao, 0);

  const liberou = await call(DIRETOR, 'PATCH', `/usuarios/${APOIO}`, { acesso_configuracao: true });
  assert.equal(liberou.status, 200);
  assert.equal(liberou.data.acesso_configuracao, 1);
  assert.equal((await call(APOIO, 'GET', '/bootstrap')).data.user.acesso_configuracao, 1);

  const criada = await call(APOIO, 'POST', '/secoes', nova);
  assert.equal(criada.status, 201);
  assert.equal((await call(APOIO, 'PATCH', `/secoes/${criada.data.id}`, { nome: 'Centro Novo II' })).status, 200);
  assert.equal((await call(APOIO, 'DELETE', `/secoes/${criada.data.id}`)).status, 200);
  assert.notEqual((await call(APOIO, 'PUT', '/config/vocabulario', {})).status, 403, 'passa da checagem de acesso (o corpo vazio é que é recusado)');

  // Contas e perfis continuam com o Diretor e o Administrador: nem o Apoio liberado se promove ou cria contas.
  assert.equal((await call(APOIO, 'PATCH', `/usuarios/${APOIO}`, { acesso_configuracao: true })).status, 403);
  assert.equal((await call(APOIO, 'PATCH', `/usuarios/${CHEFE}`, { perfil: 'apoio' })).status, 403);
  assert.equal((await call(APOIO, 'POST', '/usuarios', { nome: 'X', email: 'x@exemplo.invalid', perfil: 'chefe' })).status, 403);

  // O Administrador também assinala; tirar o acesso fecha de novo.
  assert.equal((await call(ADMIN, 'PATCH', `/usuarios/${APOIO}`, { acesso_configuracao: false })).data.acesso_configuracao, 0);
  assert.equal((await call(APOIO, 'POST', '/secoes', nova)).status, 403);
});

test('o acesso à Configuração vale para o Apoio e o Chefe; outros perfis não recebem, e trocar o perfil o desliga', async (t) => {
  const { call } = await demo(t);
  assert.equal((await call(DIRETOR, 'PATCH', `/usuarios/${APOIO}`, { perfil: 'consulta', acesso_configuracao: true })).status, 400, 'só Apoio e Chefe');
  assert.equal((await call(DIRETOR, 'PATCH', `/usuarios/${APOIO}`, { acesso_configuracao: 'sim' })).status, 400);
  assert.equal((await call(CHEFE, 'POST', '/secoes', { nome: 'Y', tipo: 'centro' })).status, 403, 'sem o acesso');
  assert.equal((await call(CHEFE, 'GET', '/usuarios')).status, 403);
  assert.equal((await call(CHEFE, 'PUT', '/config', { combinados_frequencia: 'sempre', reuniao_hora: '11:00' })).status, 403, 'sem o acesso');
  assert.equal((await call(CHEFE, 'PUT', '/config/ata', { ata_cabecalho: 'x', ata_brasao: '' })).status, 403);

  // O Chefe assinalado abre a estrutura (e lê os usuários para escolher chefes), mas não mexe em contas.
  const liberou = await call(DIRETOR, 'PATCH', `/usuarios/${CHEFE}`, { acesso_configuracao: true });
  assert.equal(liberou.status, 200);
  assert.equal(liberou.data.acesso_configuracao, 1);
  assert.equal(liberou.data.perfil, 'chefe');
  assert.equal((await call(CHEFE, 'GET', '/bootstrap')).data.user.acesso_configuracao, 1);
  const criada = await call(CHEFE, 'POST', '/secoes', { nome: 'Centro Novo', tipo: 'centro' });
  assert.equal(criada.status, 201);
  assert.ok((await call(CHEFE, 'GET', '/secoes?todas=1')).data.some((x) => x.id === criada.data.id), 'a estrutura inteira');
  assert.ok(!(await call(CHEFE, 'GET', '/secoes')).data.some((x) => x.id === criada.data.id), 'as demais telas seguem só com a árvore dele');
  assert.equal((await call(CHEFE, 'GET', '/usuarios')).status, 200);
  assert.equal((await call(CHEFE, 'PATCH', `/usuarios/${APOIO}`, { perfil: 'chefe' })).status, 403, 'contas continuam com o Diretor');
  assert.equal((await call(CHEFE, 'PATCH', `/usuarios/${CHEFE}`, { acesso_configuracao: false })).status, 403);

  // A configuração da reunião e o cabeçalho da ata da instituição também são dele (Configuração › Reunião e › Ata).
  assert.equal((await call(CHEFE, 'PUT', '/config', { combinados_frequencia: 'sempre', reuniao_hora: '11:00' })).status, 200);
  assert.equal((await call(CHEFE, 'PUT', '/config/ata', { ata_cabecalho: 'Instituição e unidade', ata_brasao: '' })).status, 200);
  assert.equal((await call(DIRETOR, 'GET', '/config')).data.reuniao_hora, '11:00');

  // Trocar o perfil desliga; voltar não restaura sozinho.
  const mudou = await call(DIRETOR, 'PATCH', `/usuarios/${CHEFE}`, { perfil: 'consulta', secao_id: null });
  assert.equal(mudou.status, 200);
  assert.equal(mudou.data.acesso_configuracao, 0);
});
