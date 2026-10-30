// Multi-empresa, fase de expansão (migração 22): o órgão que já usa o sistema vira a Empresa 1, sem perder nada.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { aplicarMigracoes } from '../server/migrations.js';

const RAIZES = ['secoes', 'usuarios', 'diretrizes', 'acoes', 'combinados', 'avisos', 'reunioes', 'atualizacoes', 'config'];

/** Banco como estava antes da migração 22, já com dados do órgão atual. */
async function bancoAntes(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await aplicarMigracoes(db, { ate: 21 });
  await db.exec(`
    insert into secoes (id, nome, sigla, tipo, pai_id, ordem, criada_em) values (1, 'Centro A', 'CA', 'centro', null, 1, '2026-01-01T00:00:00'), (2, 'Seção A1', 'A1', 'subsecao', 1, 1, '2026-01-01T00:00:00');
    insert into usuarios (id, nome, email, perfil, secao_id) values (1, 'Diretor', 'diretor@exemplo.invalid', 'diretor', null), (2, 'Chefe A', 'chefe@exemplo.invalid', 'chefe', 1);
    insert into diretrizes (titulo, destino, prazo, prioridade, criado_por, criado_em) values ('Diretriz', 'todos', '2026-12-31', 'media', 1, '2026-01-01T00:00:00');
    insert into acoes (diretriz_id, secao_id, titulo, status, prazo, prazo_original, prioridade, criada_em, criado_por) values (1, 1, 'Ação A', 'a_fazer', '2026-12-31', '2026-12-31', 'media', '2026-01-01T00:00:00', 1);
    insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (1, 1, 'Oi', '2026-01-01T00:00:00');
    insert into tempo (acao_id, usuario_id, data, minutos, criado_em) values (1, 2, '2026-01-02', 30, '2026-01-02T10:00:00');
    insert into acao_checklist (acao_id, texto, criado_em) values (1, 'Item', '2026-01-02T10:00:00');
    insert into combinados (texto, ordem, ativo, arquivado, criado_por, criado_em, alterado_em) values ('Combinado', 1, 1, 0, 1, '2026-01-01T00:00:00', '2026-01-01T00:00:00');
    insert into config (chave, valor) values ('reuniao_dia', '2'), ('ata_cabecalho', 'Cabeçalho do órgão');
    insert into avisos (texto, data_inicio, data_fim, ativo, criado_por, criado_em) values ('Aviso', '2026-01-01', '2026-12-31', 1, 1, '2026-01-01T00:00:00');
    insert into reunioes (data, semana, iniciada_em) values ('2026-09-22', '2026-09-22', '2026-09-22T10:00:00Z');
    insert into atualizacoes (secao_id, semana, versao, feito, proximo, impedimentos, critico, apoio, usuario_id, enviada_em) values (1, '2026-09-22', 1, '{}', '[]', '[]', 0, '', 2, '2026-09-21T10:00:00');`);
  return db;
}
const tabelas = async (db) => (await db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name").all()).map((r) => r.name);
async function fotografia(db) {
  const f = {};
  for (const tabela of (await tabelas(db)).filter((n) => !['empresas', 'schema_migrations'].includes(n))) {
    f[tabela] = await db.prepare(`select * from ${tabela} order by 1, 2`).all();
  }
  return f;
}
const semEmpresa = (linhas) => linhas.map(({ empresa_id, ...resto }) => resto);

test('migração 22 mantém todos os dados do órgão atual, sem alterar nenhum, e os atribui à Empresa 1', async (t) => {
  const db = await bancoAntes(t);
  const antes = await fotografia(db);
  assert.ok(Object.values(antes).filter((l) => l.length).length >= 12, 'o cenário tem dados em várias tabelas');

  assert.deepEqual(await aplicarMigracoes(db), [22, 23]);

  const depois = await fotografia(db);
  assert.deepEqual(Object.keys(depois), Object.keys(antes), 'nenhuma tabela some');
  for (const tabela of Object.keys(antes)) {
    assert.equal(depois[tabela].length, antes[tabela].length, `${tabela}: mesma quantidade`);
    assert.deepEqual(semEmpresa(depois[tabela]), antes[tabela], `${tabela}: mesmo conteúdo`);
  }
  for (const tabela of RAIZES) {
    assert.ok(depois[tabela].every((l) => l.empresa_id === 1), `${tabela}: tudo na Empresa 1`);
    assert.equal(depois[tabela].length, antes[tabela].length);
  }
  const empresas = await db.prepare('select * from empresas').all();
  assert.equal(empresas.length, 1);
  assert.equal(empresas[0].id, 1);
  assert.equal(empresas[0].nome, 'Departamento de Planejamento, Orçamento e Gestão');
  assert.equal(empresas[0].slug, 'dpog');
  assert.equal(empresas[0].ativa, 1);
  assert.equal(empresas[0].listada_no_login, 1);
  assert.deepEqual(await aplicarMigracoes(db), [], 'rodar de novo não muda nada');
  assert.deepEqual(await db.prepare('pragma foreign_key_check').all(), []);
});

test('o que se insere sem informar a empresa entra na Empresa 1 (o padrão só sai num endurecimento futuro)', async (t) => {
  const db = await bancoAntes(t);
  await aplicarMigracoes(db);
  const id = (await db.prepare("insert into secoes (nome, sigla, tipo, ordem, criada_em) values ('Nova', 'NV', 'centro', 9, '2026-02-01T00:00:00')").run()).lastInsertRowid;
  assert.equal((await db.prepare('select empresa_id from secoes where id = ?').get(id)).empresa_id, 1);
  await db.prepare("insert into config (chave, valor, empresa_id) values ('reuniao_hora', '10:00', 1) on conflict(empresa_id, chave) do update set valor = excluded.valor").run();
  await db.prepare("insert into config (chave, valor, empresa_id) values ('reuniao_hora', '09:00', 1) on conflict(empresa_id, chave) do update set valor = excluded.valor").run();
  assert.equal((await db.prepare("select valor from config where chave = 'reuniao_hora'").get()).valor, '09:00', 'o upsert por empresa e chave vale');
  await assert.rejects(db.prepare("insert into secoes (nome, sigla, tipo, ordem, criada_em, empresa_id) values ('X', 'X', 'centro', 1, '2026-02-01T00:00:00', null)").run(), /NOT NULL/);
  await assert.rejects(db.prepare("insert into secoes (nome, sigla, tipo, ordem, criada_em, empresa_id) values ('X', 'X', 'centro', 1, '2026-02-01T00:00:00', 99)").run(), /FOREIGN KEY/, 'a empresa precisa existir');
});

test('depois da contração só valem as chaves únicas por empresa, e os dados da Empresa 1 seguem intactos', async (t) => {
  const db = await bancoAntes(t);
  await aplicarMigracoes(db, { ate: 22 });
  const indices22 = (await db.prepare("select name from sqlite_master where type = 'index'").all()).map((i) => i.name);
  for (const nome of ['uq_config_empresa_chave', 'uq_reuniao_em_andamento_empresa', 'uq_reuniao_em_andamento']) assert.ok(indices22.includes(nome), `${nome} existe na versão 22`);
  const antes = { config: await db.prepare('select * from config order by chave').all(), reunioes: await db.prepare('select * from reunioes').all() };

  assert.deepEqual(await aplicarMigracoes(db), [23]);
  const indices = (await db.prepare("select name from sqlite_master where type = 'index'").all()).map((i) => i.name);
  assert.ok(!indices.includes('uq_reuniao_em_andamento'), 'a chave global de reunião em andamento caiu');
  assert.ok(indices.includes('uq_reuniao_em_andamento_empresa') && RAIZES.filter((r) => r !== 'config').every((r) => indices.includes(`idx_${r}_empresa`)));
  assert.deepEqual(await db.prepare('select * from config order by chave').all(), antes.config, 'config: mesmos dados');
  assert.deepEqual(await db.prepare('select * from reunioes').all(), antes.reunioes);
  assert.deepEqual((await db.prepare('pragma table_info(config)').all()).filter((c) => c.pk > 0).map((c) => c.name), ['empresa_id', 'chave']);
  assert.deepEqual(await aplicarMigracoes(db), [], 'rodar de novo não muda nada');

  // Por empresa: a mesma chave e uma reunião em andamento em cada uma.
  await db.prepare("insert into empresas (nome, slug, criada_em) values ('B', 'b', '2026-02-01')").run();
  await db.prepare("insert into config (chave, valor, empresa_id) values ('reuniao_dia', '4', 2)").run();
  await db.prepare("update reunioes set status = 'em_andamento'").run();
  await db.prepare("insert into reunioes (data, semana, iniciada_em, status, empresa_id) values ('2026-09-29', '2026-09-29', '2026-09-29T10:00:00Z', 'em_andamento', 2)").run();
  // Dentro de cada empresa continua único.
  await assert.rejects(db.prepare("insert into config (chave, valor, empresa_id) values ('reuniao_dia', '5', 2)").run(), /UNIQUE/);
  await assert.rejects(db.prepare("insert into reunioes (data, semana, iniciada_em, status, empresa_id) values ('2026-10-06', '2026-10-06', '2026-10-06T10:00:00Z', 'em_andamento', 2)").run(), /UNIQUE/, 'uma reunião em andamento por empresa');
});

test('empresas: o slug é único e a próxima empresa nasce com o número 2', async (t) => {
  const db = await bancoAntes(t);
  await aplicarMigracoes(db);
  await assert.rejects(db.prepare("insert into empresas (nome, slug, criada_em) values ('Outra', 'dpog', '2026-02-01')").run(), /UNIQUE/);
  const id = (await db.prepare("insert into empresas (nome, sigla, slug, criada_em) values ('Empresa B', 'EB', 'empresa-b', '2026-02-01')").run()).lastInsertRowid;
  assert.equal(Number(id), 2);
  assert.equal((await db.prepare('select ativa, listada_no_login from empresas where id = 2').get()).listada_no_login, 1);
});

test('banco novo (seed) já nasce na Empresa 1 e a opção `ate` limita as versões aplicadas', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  assert.equal((await db.prepare('select count(*) n from empresas').get()).n, 1);
  for (const tabela of RAIZES) assert.equal((await db.prepare(`select count(*) n from ${tabela} where empresa_id != 1`).get()).n, 0, tabela);
  const parcial = openDb(':memory:');
  t.after(() => parcial.close());
  assert.deepEqual(await aplicarMigracoes(parcial, { ate: 5 }), [1, 2, 3, 4, 5]);
  assert.deepEqual(await aplicarMigracoes(parcial, { ate: 5 }), []);
});
