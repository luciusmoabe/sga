// Suplente: um segundo Chefe para a mesma seção, com os mesmos poderes do titular, sem substituí-lo.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { vincularIdentidade } from '../server/vincular-identidade.js';

const DIRETOR = 1, ADMIN = 10, CPE_TITULAR = 3, CPE_SECAO = 1;
const projeto = 'https://projeto.supabase.co';
const config = { mode: 'supabase', supabaseUrl: projeto, key: 'sb_publishable_teste', origin: 'https://agilis.example', secure: true };
const SUBJ = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

async function institucional(t) {
  const db = openDb(':memory:');
  await seed(db);
  const contasRemotas = new Map();
  let proximo = 100;
  const registrar = (email, senha, subject) => contasRemotas.set(email, { senha, subject });
  const provedor = { async autenticar(email, senha) {
    const c = contasRemotas.get(email);
    if (!c || c.senha !== senha) throw Object.assign(new Error('x'), { status: 401 });
    return { subject: c.subject, expires: Math.floor(Date.now() / 1000) + 3600 };
  } };
  const adminAuth = {
    async criar(email, senha) { const subject = SUBJ(proximo++); registrar(email, senha, subject); return subject; },
    async atualizar(subject, dados) {
      for (const c of contasRemotas.values()) if (c.subject === subject && dados.password) c.senha = dados.password;
    },
    async remover() {},
  };
  for (const [uid, email, n] of [[ADMIN, 'admin@orgao.gov.br', 1], [DIRETOR, 'diretor@orgao.gov.br', 2], [CPE_TITULAR, 'ana@orgao.gov.br', 3]]) {
    await db.prepare('update usuarios set email = ? where id = ?').run(email, uid);
    registrar(email, `Senha-definitiva-${n}!`, SUBJ(n));
    await vincularIdentidade(db, uid, projeto, SUBJ(n));
  }
  const server = createApp(db, { auth: config, provedor, adminAuth }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((ok) => server.close(ok)); await db.close(); });
  const chamar = (caminho, opcoes = {}) => fetch(`http://127.0.0.1:${server.address().port}/api${caminho}`, { redirect: 'manual', ...opcoes });
  const entrar = async (email, senha) => {
    const r = await chamar('/auth/entrar', { method: 'POST', headers: { origin: config.origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, senha }) });
    if (r.status !== 200) return { status: r.status };
    const csrf = (await r.json()).csrf;
    return { status: 200, cookie: r.headers.get('set-cookie').split(';')[0], csrf };
  };
  const api = (sessao) => async (metodo, caminho, corpo) => {
    const r = await chamar(caminho, { method: metodo, headers: { cookie: sessao.cookie, origin: config.origin, 'x-csrf-token': sessao.csrf, 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  return { db, entrar, api };
}

test('Diretor cadastra um suplente para o CPE: o titular continua, os dois respondem pela seção', async (t) => {
  const { db, entrar, api } = await institucional(t);
  const dir = api(await entrar('diretor@orgao.gov.br', 'Senha-definitiva-2!'));
  const antes = await db.prepare('select chefe_id from secoes where id = ?').get(CPE_SECAO);
  assert.equal(antes.chefe_id, CPE_TITULAR, 'a seção CPE já tem um titular na demonstração');

  const criado = await dir('POST', '/usuarios/acesso', {
    nome: 'Suplente do CPE', email: 'suplente.cpe@orgao.gov.br', senha: 'Senha-inicial-123', perfil: 'chefe', secao_id: CPE_SECAO, suplente: '1',
  });
  assert.equal(criado.status, 201, JSON.stringify(criado.data));
  assert.equal(criado.data.suplente, true);
  assert.equal(criado.data.secao_id, CPE_SECAO);

  // O titular continua intacto: mesma seção, ainda o chefe_id da seção.
  const depois = await db.prepare('select chefe_id from secoes where id = ?').get(CPE_SECAO);
  assert.equal(depois.chefe_id, CPE_TITULAR, 'o titular não foi trocado');
  const titular = await db.prepare('select secao_id from usuarios where id = ?').get(CPE_TITULAR);
  assert.equal(titular.secao_id, CPE_SECAO, 'o titular não perdeu a seção');

  // GET /usuarios marca o suplente e não marca o titular.
  const lista = (await dir('GET', '/usuarios')).data;
  assert.equal(lista.find((u) => u.id === criado.data.id).suplente, true);
  assert.equal(lista.find((u) => u.id === CPE_TITULAR).suplente, false);

  // O suplente age como um chefe de verdade: cria ação, registra tempo, envia o relato da seção.
  const sup = api(await entrar('suplente.cpe@orgao.gov.br', 'Senha-inicial-123'));
  const troca = await sup('POST', '/auth/trocar-senha', { senha_atual: 'Senha-inicial-123', senha_nova: 'Senha-do-suplente-nova' });
  assert.equal(troca.status, 200);
  const supLogado = api(await entrar('suplente.cpe@orgao.gov.br', 'Senha-do-suplente-nova'));
  const acao = await supLogado('POST', '/acoes', { titulo: 'Ação registrada pelo suplente', prazo: '2026-12-31' });
  assert.equal(acao.status, 201);
  assert.equal(acao.data.secao_sigla, 'CPE');
  const envio = await supLogado('PUT', '/atualizacao', { semana: '2026-09-22', observacoes: 'Enviado pelo suplente na ausência da titular.' });
  assert.equal(envio.status, 200);

  // A tela do titular mostra quem enviou, já que agora duas pessoas podem enviar pela mesma seção.
  const relato = await api(await entrar('ana@orgao.gov.br', 'Senha-definitiva-3!'))('GET', '/atualizacao?semana=2026-09-22');
  assert.equal(relato.data.atual.usuario_nome, 'Suplente do CPE');

  // Desativar o suplente não afeta o titular; ele para de conseguir agir.
  await dir('PATCH', `/usuarios/${criado.data.id}`, { ativo: false });
  assert.equal((await supLogado('GET', '/bootstrap')).status, 401);
  assert.equal((await api(await entrar('ana@orgao.gov.br', 'Senha-definitiva-3!'))('GET', '/bootstrap')).status, 200, 'o titular segue ativo');
});

test('sem marcar suplente, cadastrar chefe numa seção ocupada continua exigindo confirmação de substituição', async (t) => {
  const { api, entrar } = await institucional(t);
  const dir = api(await entrar('diretor@orgao.gov.br', 'Senha-definitiva-2!'));
  const semConfirmar = await dir('POST', '/usuarios/acesso', { nome: 'Novo Chefe', email: 'novo.chefe@orgao.gov.br', senha: 'Senha-inicial-123', perfil: 'chefe', secao_id: CPE_SECAO });
  assert.equal(semConfirmar.status, 409);
  const comConfirmar = await dir('POST', '/usuarios/acesso', { nome: 'Novo Chefe', email: 'novo.chefe@orgao.gov.br', senha: 'Senha-inicial-123', perfil: 'chefe', secao_id: CPE_SECAO, substituir_chefe_id: CPE_TITULAR });
  assert.equal(comConfirmar.status, 201);
  assert.equal(comConfirmar.data.suplente, false);
});

test('suplente só se aplica ao perfil Chefe', async (t) => {
  const { api, entrar } = await institucional(t);
  const dir = api(await entrar('diretor@orgao.gov.br', 'Senha-definitiva-2!'));
  const r = await dir('POST', '/usuarios/acesso', { nome: 'Apoio X', email: 'apoio.x@orgao.gov.br', senha: 'Senha-inicial-123', perfil: 'apoio', suplente: '1' });
  assert.equal(r.status, 400);
});
