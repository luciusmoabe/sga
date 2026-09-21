import assert from 'node:assert/strict';
import { seed } from '../server/seed.js';

// Fixture do esquema v2: pula migrações posteriores durante a carga fictícia.
export async function semearLegado(db) {
  await db.exec('create table schema_migrations (id integer primary key, nome text not null, aplicada_em text not null)');
  await db.prepare('insert into schema_migrations values (?, ?, ?)').run(3, 'integridade_referencial', '2026-09-22');
  await db.prepare('insert into schema_migrations values (?, ?, ?)').run(4, 'identidade_institucional', '2026-09-22');
  await db.prepare('insert into schema_migrations values (?, ?, ?)').run(5, 'login_email_senha', '2026-09-22');
  await db.prepare('insert into schema_migrations values (?, ?, ?)').run(6, 'autoria_acoes', '2026-09-22');
  await db.prepare('insert into schema_migrations values (?, ?, ?)').run(7, 'sessao_deslizante', '2026-09-22');
  await db.prepare('insert into schema_migrations values (?, ?, ?)').run(8, 'perfil_administrador', '2026-09-22');
  await seed(db);
  await db.exec('delete from schema_migrations where id >= 3');
}

export async function conferirIntegridade(db) {
  const erroFK = db.isPg ? { code: '23503' } : /FOREIGN KEY/;
  await assert.rejects(db.transaction(async () => {
    await db.prepare('update secoes set chefe_id = ? where id = 1').run(9999);
  }), erroFK);
  assert.equal((await db.prepare('select chefe_id from secoes where id = 1').get()).chefe_id, 3);

  // A referência é adiada, permitindo preencher o ciclo seção/usuário na mesma transação.
  await db.transaction(async () => {
    await db.prepare("insert into secoes (id, nome, tipo, chefe_id, criada_em) values (100, 'Nova', 'centro', 100, '2026-09-22')").run();
    await db.prepare("insert into usuarios (id, nome, perfil, secao_id) values (100, 'Chefe novo', 'chefe', 100)").run();
  });
  await assert.rejects(db.prepare('delete from usuarios where id = 100').run(), erroFK);
  assert.equal((await db.prepare('select chefe_id from secoes where id = 100').get()).chefe_id, 100);

  for (const [tabela, inserir] of [
    ['acao_comentarios', "insert into acao_comentarios (acao_id, texto, criado_em) values (?, 'Histórico', '2026-09-22')"],
    ['tempo', "insert into tempo (acao_id, data, minutos, criado_em) values (?, '2026-09-22', 10, '2026-09-22')"],
    ['pedidos_prazo', "insert into pedidos_prazo (acao_id, prazo_atual, novo_prazo, justificativa, criado_em) values (?, '2026-09-22', '2026-09-23', 'Teste', '2026-09-22')"],
  ]) {
    const { lastInsertRowid: id } = await db.prepare(`insert into acoes (secao_id, titulo, prazo, prazo_original, criada_em)
      values (1, 'Histórico protegido', '2026-09-22', '2026-09-22', '2026-09-22')`).run();
    await db.prepare(inserir).run(id);
    await assert.rejects(db.prepare('delete from acoes where id = ?').run(id), erroFK);
    assert.equal((await db.prepare(`select count(*) n from ${tabela} where acao_id = ?`).get(id)).n, 1);
    await db.transaction(async () => {
      await db.prepare(`delete from ${tabela} where acao_id = ?`).run(id);
      await db.prepare('delete from acoes where id = ?').run(id);
    });
    assert.equal(await db.prepare('select id from acoes where id = ?').get(id) ?? null, null);
  }
  const { lastInsertRowid: reuniao } = await db.prepare(`insert into reunioes (data, semana, iniciada_em)
    values ('2026-09-22', '2026-09-22', '2026-09-22')`).run();
  await db.prepare("insert into decisoes (reuniao_id, texto, criada_em) values (?, 'Decisão protegida', '2026-09-22')").run(reuniao);
  await assert.rejects(db.prepare('delete from reunioes where id = ?').run(reuniao), erroFK);
  assert.equal((await db.prepare('select count(*) n from decisoes where reuniao_id = ?').get(reuniao)).n, 1);
}
