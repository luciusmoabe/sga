// Redefinição de senha pelo servidor (npm run senha:redefinir).
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { vincularIdentidade } from '../server/vincular-identidade.js';
import { redefinirSenha, senhaProvisoria } from '../server/redefinir-senha.js';

const config = { supabaseUrl: 'https://projeto.supabase.co' };
const SUBJ = '33333333-3333-4333-8333-333333333333';

async function ambiente(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  await db.prepare("update usuarios set email = 'Admin@Orgao.invalid', trocar_senha = 0 where id = 10").run();
  await vincularIdentidade(db, 10, config.supabaseUrl, SUBJ);
  const chamadas = [];
  const admin = { async atualizar(id, dados) { chamadas.push([id, dados]); } };
  return { db, admin, chamadas };
}

test('troca a senha no Supabase, exige nova troca e encerra as sessões da conta, sem tocar nas outras', async (t) => {
  const { db, admin, chamadas } = await ambiente(t);
  const conta = (await db.prepare('select id from auth_contas where usuario_id = 10').get()).id;
  await db.prepare("insert into auth_sessoes_senha (id, conta_id, csrf, expira_em, criada_em) values ('s1', ?, 'c', 9999999999, 1)").run(conta);
  await vincularIdentidade(db, 3, config.supabaseUrl, '44444444-4444-4444-8444-444444444444');
  const outra = (await db.prepare('select id from auth_contas where usuario_id = 3').get()).id;
  await db.prepare("insert into auth_sessoes_senha (id, conta_id, csrf, expira_em, criada_em) values ('s2', ?, 'c', 9999999999, 1)").run(outra);

  const r = await redefinirSenha(db, config, admin, { email: ' ADMIN@orgao.invalid ', senha: 'Senha-provisoria-1' });
  assert.deepEqual([r.usuario_id, r.perfil], [10, 'administrador']);
  assert.deepEqual(chamadas, [[SUBJ, { password: 'Senha-provisoria-1' }]]);
  assert.equal((await db.prepare('select trocar_senha from usuarios where id = 10').get()).trocar_senha, 1);
  assert.equal((await db.prepare("select count(*) n from auth_sessoes_senha where id = 's1'").get()).n, 0, 'sessões da conta encerradas');
  assert.equal((await db.prepare("select count(*) n from auth_sessoes_senha where id = 's2'").get()).n, 1, 'outras contas intactas');
  assert.equal((await db.prepare('select trocar_senha from usuarios where id = 3').get()).trocar_senha, 0);
});

test('recusa e-mail sem login vinculado e senha fora do tamanho, sem chamar o Supabase', async (t) => {
  const { admin, chamadas, db } = await ambiente(t);
  await assert.rejects(redefinirSenha(db, config, admin, { email: 'ninguem@orgao.invalid', senha: 'Senha-provisoria-1' }), /Não há conta/);
  await assert.rejects(redefinirSenha(db, config, admin, { email: 'admin@orgao.invalid', senha: 'curta' }), /entre 8 e 128/);
  await assert.rejects(redefinirSenha(db, config, admin, { email: 'admin@orgao.invalid', senha: 'x'.repeat(129) }), /entre 8 e 128/);
  assert.equal(chamadas.length, 0);
  assert.equal((await db.prepare('select trocar_senha from usuarios where id = 10').get()).trocar_senha, 0, 'nada mudou');
});

test('não altera a conta se o Supabase recusar a troca', async (t) => {
  const { db } = await ambiente(t);
  const admin = { async atualizar() { throw new Error('Cadastro indisponível.'); } };
  await assert.rejects(redefinirSenha(db, config, admin, { email: 'admin@orgao.invalid', senha: 'Senha-provisoria-1' }), /indisponível/);
  assert.equal((await db.prepare('select trocar_senha from usuarios where id = 10').get()).trocar_senha, 0);
});

test('a senha provisória gerada é legível, tem 14 caracteres e varia', () => {
  const a = senhaProvisoria(), b = senhaProvisoria();
  assert.match(a, /^[abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789]{14}$/);
  assert.notEqual(a, b);
});
