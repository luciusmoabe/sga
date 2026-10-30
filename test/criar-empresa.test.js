// Multi-empresa, fase 3: comando que cria uma empresa e o seu primeiro Diretor.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { criarEmpresa, esquemaContraido } from '../server/criar-empresa.js';

const config = { supabaseUrl: 'https://projeto.supabase.co' };
const SUBJ = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const dados = { nome: 'Empresa ZB', slug: 'zb', sigla: 'zb', diretor: 'Diretora ZB', email: 'Diretora@ZB.invalid', senha: 'Senha-inicial-123' };

async function banco(t, { contraido = true } = {}) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  if (!contraido) {
    // O esquema anterior à versão 23: chaves únicas globais de config e de reunião em andamento.
    await db.exec(`create unique index uq_reuniao_em_andamento on reunioes(status) where status = 'em_andamento';
      create table config_antiga (chave text primary key, valor text not null, empresa_id integer not null default 1 references empresas(id));
      insert into config_antiga select chave, valor, empresa_id from config; drop table config; alter table config_antiga rename to config;`);
  }
  const criadas = [];
  const admin = { async criar(email, senha) { criadas.push([email, senha]); return SUBJ(criadas.length); }, async remover(id) { criadas.push(['remover', id]); } };
  return { db, admin, criadas };
}

test('cria a empresa e o primeiro Diretor, com troca de senha obrigatória, sem tocar nos dados da Empresa 1', async (t) => {
  const { db, admin, criadas } = await banco(t);
  const antes = (await db.prepare('select count(*) n from usuarios where empresa_id = 1').get()).n;
  const r = await criarEmpresa(db, config, admin, dados);
  assert.equal(r.empresa.id, 2);
  assert.equal(r.empresa.sigla, 'ZB');
  const e = await db.prepare('select * from empresas where id = 2').get();
  assert.deepEqual([e.slug, e.ativa, e.listada_no_login], ['zb', 1, 1]);
  const d = await db.prepare('select * from usuarios where id = ?').get(r.diretor.id);
  assert.deepEqual([d.perfil, d.empresa_id, d.email, d.trocar_senha, d.secao_id], ['diretor', 2, 'diretora@zb.invalid', 1, null]);
  assert.deepEqual(criadas, [['diretora@zb.invalid', 'Senha-inicial-123']]);
  assert.equal((await db.prepare('select count(*) n from auth_contas where usuario_id = ?').get(r.diretor.id)).n, 1);
  assert.equal((await db.prepare('select count(*) n from usuarios where empresa_id = 1').get()).n, antes);
});

test('recusa identificador inválido, repetido ou reservado, nome vazio, e-mail já usado e senha curta', async (t) => {
  const { db, admin } = await banco(t);
  for (const slug of ['', 'A', 'com espaço', 'Zé', '-zb', 'zb-', 'api', 'plataforma', 'x'.repeat(41)]) {
    await assert.rejects(criarEmpresa(db, config, admin, { ...dados, slug }), /identificador/, slug);
  }
  await assert.rejects(criarEmpresa(db, config, admin, { ...dados, slug: 'dpog' }), /Já existe/);
  await assert.rejects(criarEmpresa(db, config, admin, { ...dados, nome: ' ' }), /nome da empresa/);
  await criarEmpresa(db, config, admin, dados);
  await assert.rejects(criarEmpresa(db, config, admin, { ...dados, slug: 'outra' }), /já cadastrado/);
  assert.equal((await db.prepare("select count(*) n from empresas where slug = 'outra'").get()).n, 0, 'a empresa é desfeita quando o Diretor não pode ser criado');
  await assert.rejects(criarEmpresa(db, config, admin, { ...dados, slug: 'curta', email: 'c@zb.invalid', senha: 'curta' }), /senha inicial/);
  assert.equal((await db.prepare("select count(*) n from empresas where slug = 'curta'").get()).n, 0);
});

test('uma empresa fora da lista da entrada é criada com listada_no_login = 0', async (t) => {
  const { db, admin } = await banco(t);
  await criarEmpresa(db, config, admin, { ...dados, listada: false });
  assert.equal((await db.prepare("select listada_no_login l from empresas where slug = 'zb'").get()).l, 0);
});

test('antes da contração do esquema o comando recusa a 2ª empresa', async (t) => {
  const { db, admin } = await banco(t, { contraido: false });
  assert.equal(await esquemaContraido(db), false);
  await assert.rejects(criarEmpresa(db, config, admin, dados), /contração/);
  assert.equal((await db.prepare('select count(*) n from empresas').get()).n, 1);
  const { db: db2, admin: admin2 } = await banco(t);
  assert.equal(await esquemaContraido(db2), true);
  await criarEmpresa(db2, config, admin2, dados);
});
