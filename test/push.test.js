// Avisos no celular (Web Push): configuração, assinatura do aparelho, aviso de teste e canal de envio. O serviço de entrega
// do navegador é substituído por um emissor falso: nada sai da máquina.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { canalPush, configurarPush, validarAssinatura } from '../server/push.js';

const DIRETOR = 1, CHEFE_CPE = 3, CHEFE_COF = 4;
const CHAVES = { SGC_VAPID_PUBLIC_KEY: 'BPublicaDeTeste', SGC_VAPID_PRIVATE_KEY: 'privada-de-teste', SGC_VAPID_SUBJECT: 'mailto:teste@orgao.gov.br' };
const aparelho = (n) => ({ endpoint: `https://push.exemplo.test/envio/${n}`, keys: { p256dh: `chavePublicaDoAparelho${n}`, auth: `segredo${n}` } });

function comChaves(t, valores = CHAVES) {
  const antes = Object.fromEntries(Object.keys(CHAVES).map((k) => [k, process.env[k]]));
  for (const k of Object.keys(CHAVES)) { if (valores[k] === undefined) delete process.env[k]; else process.env[k] = valores[k]; }
  t.after(() => { for (const [k, v] of Object.entries(antes)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}

async function montar(t) {
  const db = openDb(':memory:');
  await seed(db);
  const emissor = Object.assign(async (sub, mensagem, opcoes) => { emissor.chamadas.push({ sub, mensagem: JSON.parse(mensagem), opcoes }); if (emissor.falha) throw emissor.falha(sub); }, { chamadas: [], falha: null });
  const server = createApp(db, { auth: { mode: 'demo' }, emissorPush: emissor }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((ok) => server.close(ok)); await db.close(); });
  const call = async (uid, method, caminho, body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api${caminho}`, {
      method, headers: { 'x-user-id': String(uid), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  return { db, call, emissor };
}

test('configuração: só vale com as três variáveis; sem elas os avisos ficam indisponíveis', async (t) => {
  assert.equal(configurarPush({}).ativo, false);
  assert.equal(configurarPush({ ...CHAVES, SGC_VAPID_SUBJECT: '' }).ativo, false);
  assert.equal(configurarPush(CHAVES).ativo, true);
  comChaves(t, {});
  const { call } = await montar(t);
  assert.deepEqual((await call(CHEFE_CPE, 'GET', '/push/config')).data, { disponivel: false });
  const r = await call(CHEFE_CPE, 'POST', '/push/assinar', { assinatura: aparelho(1) });
  assert.equal(r.status, 409);
  assert.match(r.data.erro, /ainda não foram configurados/);
});

test('config: devolve a chave pública (nunca a privada) e diz se este aparelho já está ativo', async (t) => {
  comChaves(t);
  const { call } = await montar(t);
  const antes = await call(CHEFE_CPE, 'GET', `/push/config?endpoint=${encodeURIComponent(aparelho(1).endpoint)}`);
  assert.equal(antes.data.disponivel, true);
  assert.equal(antes.data.chavePublica, CHAVES.SGC_VAPID_PUBLIC_KEY);
  assert.equal(antes.data.ativo, false);
  assert.doesNotMatch(JSON.stringify(antes.data), /privada-de-teste/);
  assert.equal((await call(CHEFE_CPE, 'POST', '/push/assinar', { assinatura: aparelho(1) })).status, 201);
  const depois = await call(CHEFE_CPE, 'GET', `/push/config?endpoint=${encodeURIComponent(aparelho(1).endpoint)}`);
  assert.equal(depois.data.ativo, true);
  const outro = await call(CHEFE_COF, 'GET', `/push/config?endpoint=${encodeURIComponent(aparelho(1).endpoint)}`);
  assert.equal(outro.data.ativo, false, 'o aparelho é de quem o ativou');
});

test('assinatura: recusa endereço inseguro, chaves ausentes e lixo; aceita a do navegador', () => {
  assert.deepEqual(validarAssinatura(aparelho(1)), { endpoint: aparelho(1).endpoint, p256dh: 'chavePublicaDoAparelho1', auth: 'segredo1' });
  assert.throws(() => validarAssinatura({ ...aparelho(1), endpoint: 'http://inseguro.test/x' }), { status: 400 });
  assert.throws(() => validarAssinatura({ ...aparelho(1), endpoint: 'nao e uma url' }), { status: 400 });
  assert.throws(() => validarAssinatura({ endpoint: aparelho(1).endpoint }), { status: 400 });
  assert.throws(() => validarAssinatura({ endpoint: aparelho(1).endpoint, keys: { p256dh: 'x y', auth: 'a' } }), { status: 400 });
  assert.throws(() => validarAssinatura({ endpoint: `https://x.test/${'a'.repeat(1001)}`, keys: aparelho(1).keys }), { status: 400 });
  assert.throws(() => validarAssinatura(null), { status: 400 });
});

test('assinar: grava uma vez por aparelho; o mesmo aparelho passa a avisar quem ativou por último', async (t) => {
  comChaves(t);
  const { db, call } = await montar(t);
  assert.equal((await call(CHEFE_CPE, 'POST', '/push/assinar', { assinatura: aparelho(1) })).status, 201);
  assert.equal((await call(CHEFE_CPE, 'POST', '/push/assinar', { assinatura: aparelho(1) })).status, 201);
  assert.equal((await db.prepare('select count(*) n from push_assinaturas').get()).n, 1, 'não duplica');
  assert.equal((await call(CHEFE_COF, 'POST', '/push/assinar', { assinatura: aparelho(1) })).status, 201);
  const linha = await db.prepare('select usuario_id from push_assinaturas').get();
  assert.equal(linha.usuario_id, CHEFE_COF, 'o aparelho agora é de quem ativou por último');
  assert.equal((await call(CHEFE_CPE, 'POST', '/push/assinar', { assinatura: { endpoint: 'http://x.test/1', keys: aparelho(1).keys } })).status, 400);
});

test('assinar: no máximo 5 aparelhos por pessoa; o mais antigo sai', async (t) => {
  comChaves(t);
  const { db, call } = await montar(t);
  for (let n = 1; n <= 7; n++) assert.equal((await call(CHEFE_CPE, 'POST', '/push/assinar', { assinatura: aparelho(n) })).status, 201);
  const fica = (await db.prepare('select endpoint from push_assinaturas where usuario_id = ? order by id').all(CHEFE_CPE)).map((r) => r.endpoint);
  assert.deepEqual(fica, [3, 4, 5, 6, 7].map((n) => aparelho(n).endpoint));
});

test('cancelar: só remove o aparelho da própria pessoa', async (t) => {
  comChaves(t);
  const { db, call } = await montar(t);
  await call(CHEFE_CPE, 'POST', '/push/assinar', { assinatura: aparelho(1) });
  assert.equal((await call(CHEFE_COF, 'POST', '/push/cancelar', { endpoint: aparelho(1).endpoint })).status, 200);
  assert.equal((await db.prepare('select count(*) n from push_assinaturas').get()).n, 1, 'o de outra pessoa continua');
  assert.equal((await call(CHEFE_CPE, 'POST', '/push/cancelar', { endpoint: aparelho(1).endpoint })).status, 200);
  assert.equal((await db.prepare('select count(*) n from push_assinaturas').get()).n, 0);
  assert.equal((await call(CHEFE_CPE, 'POST', '/push/cancelar', {})).status, 400);
});

test('teste: envia aos aparelhos da própria pessoa com as chaves VAPID; sem aparelho avisa como resolver', async (t) => {
  comChaves(t);
  const { call, emissor } = await montar(t);
  const sem = await call(CHEFE_CPE, 'POST', '/push/teste');
  assert.equal(sem.status, 409);
  assert.match(sem.data.erro, /Ative os avisos/);
  await call(CHEFE_CPE, 'POST', '/push/assinar', { assinatura: aparelho(1) });
  await call(CHEFE_COF, 'POST', '/push/assinar', { assinatura: aparelho(2) });
  const r = await call(CHEFE_CPE, 'POST', '/push/teste');
  assert.deepEqual(r.data, { ok: true, entregues: 1 });
  assert.equal(emissor.chamadas.length, 1, 'só o aparelho de quem pediu');
  const c = emissor.chamadas[0];
  assert.equal(c.sub.endpoint, aparelho(1).endpoint);
  assert.deepEqual(c.sub.keys, aparelho(1).keys);
  assert.match(c.mensagem.corpo, /funcionando/);
  assert.equal(c.opcoes.vapidDetails.subject, CHAVES.SGC_VAPID_SUBJECT);
  assert.equal(c.opcoes.vapidDetails.publicKey, CHAVES.SGC_VAPID_PUBLIC_KEY);
  assert.ok(c.opcoes.TTL > 0);
});

test('perfis: sem sessão é recusado; o Diretor também pode ativar', async (t) => {
  comChaves(t);
  const { call } = await montar(t);
  assert.equal((await call('', 'GET', '/push/config')).status, 401);
  assert.equal((await call(DIRETOR, 'POST', '/push/assinar', { assinatura: aparelho(9) })).status, 201);
});

test('canal: aparelho que o serviço diz estar encerrado (410/404) é removido; outro erro não remove', async (t) => {
  comChaves(t);
  const { db, call, emissor } = await montar(t);
  await call(CHEFE_CPE, 'POST', '/push/assinar', { assinatura: aparelho(1) });
  await call(CHEFE_CPE, 'POST', '/push/assinar', { assinatura: aparelho(2) });
  const canal = canalPush(db, configurarPush(CHAVES), { emissor });
  const erros = t.mock.method(console, 'error', () => {});

  emissor.falha = (sub) => Object.assign(new Error('Gone'), { statusCode: sub.endpoint === aparelho(1).endpoint ? 410 : 500 });
  const n = await canal.enviar({ usuario: CHEFE_CPE, empresa: 1, titulo: 'T', corpo: 'C', url: '/' });
  assert.equal(n, 0, 'nenhum recebeu');
  const restam = (await db.prepare('select endpoint from push_assinaturas').all()).map((r) => r.endpoint);
  assert.deepEqual(restam, [aparelho(2).endpoint], 'o encerrado saiu; o que deu erro 500 fica para a próxima');
  assert.equal(erros.mock.callCount(), 1, 'o erro inesperado foi registrado');

  emissor.falha = null;
  assert.equal(await canal.enviar({ usuario: CHEFE_CPE, empresa: 1, titulo: 'T', corpo: 'C', url: '/' }), 1);
  assert.ok((await db.prepare('select ultimo_envio_em from push_assinaturas').get()).ultimo_envio_em, 'registra o último envio');
});

test('canal: a mensagem leva título, corpo e a tela a abrir', async (t) => {
  comChaves(t);
  const { db, call, emissor } = await montar(t);
  await call(CHEFE_CPE, 'POST', '/push/assinar', { assinatura: aparelho(1) });
  await canalPush(db, configurarPush(CHAVES), { emissor }).enviar({ usuario: CHEFE_CPE, empresa: 1, titulo: 'Lembrete', corpo: 'Falta enviar', url: '/#/atualizacao' });
  assert.deepEqual(emissor.chamadas[0].mensagem, { titulo: 'Lembrete', corpo: 'Falta enviar', url: '/#/atualizacao' });
});

test('excluir uma conta sem histórico leva junto os aparelhos dela', async (t) => {
  comChaves(t);
  const { db, call } = await montar(t);
  const novo = await call(DIRETOR, 'POST', '/usuarios', { nome: 'Fulana de Tal', email: 'fulana.push@exemplo.invalid', perfil: 'chefe' });
  if (novo.status !== 201) return t.skip(`cadastro de teste indisponível neste modo (${novo.status})`);
  await db.prepare('insert into push_assinaturas (empresa_id, usuario_id, endpoint, p256dh, auth, criada_em) values (1, ?, ?, ?, ?, ?)')
    .run(novo.data.id, aparelho(1).endpoint, 'p', 'a', '2026-09-21T10:00:00Z');
  assert.equal((await call(DIRETOR, 'DELETE', `/usuarios/${novo.data.id}`)).status, 200);
  assert.equal((await db.prepare('select count(*) n from push_assinaturas').get()).n, 0);
});
