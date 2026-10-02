// Implementação da versão 11: tipo de seção Diretoria Adjunta. Alterações futuras exigem uma nova migração.
const TIPOS = "('centro','coordenacao','subsecao','diretoria_adjunta')";
const identificador = nome => `"${nome.replaceAll('"', '""')}"`;

async function sqlite(db) {
  const { sql } = await db.prepare("select sql from sqlite_master where type = 'table' and name = 'secoes'").get();
  if (/diretoria_adjunta/i.test(sql)) return;
  // O SQLite não altera CHECK: reconstrói a tabela, como nas versões 3 e 8, preservando dados, índices, views e triggers.
  const nova = sql.replace(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"secoes"|secoes)\s*\(/i, 'CREATE TABLE secoes_migracao_11 (')
    .replace(/\(\s*'centro'\s*,\s*'coordenacao'\s*,\s*'subsecao'\s*\)/i, TIPOS);
  if (!nova.startsWith('CREATE TABLE secoes_migracao_11 (') || !nova.includes('diretoria_adjunta')) {
    throw new Error('Migração interrompida: definição de secoes incompatível com a reconstrução.');
  }
  const indices = await db.prepare("select sql from sqlite_master where type = 'index' and tbl_name = 'secoes' and sql is not null").all();
  const objetos = await db.prepare("select type, name, sql from sqlite_master where type in ('view','trigger') and sql is not null order by type, name").all();
  for (const o of objetos) await db.exec(`drop ${o.type} ${identificador(o.name)}`);
  const lista = (await db.prepare('pragma table_info(secoes)').all()).map(c => identificador(c.name)).join(', ');
  await db.exec(nova);
  await db.exec(`insert into secoes_migracao_11 (${lista}) select ${lista} from secoes`);
  await db.exec('drop table secoes');
  await db.exec('alter table secoes_migracao_11 rename to secoes');
  for (const o of indices) await db.exec(o.sql);
  for (const tipo of ['view', 'trigger']) {
    for (const o of objetos.filter(o => o.type === tipo)) await db.exec(o.sql);
  }
}

async function postgres(db) {
  const checks = await db.prepare(`select c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'c' and n.nspname = current_schema() and t.relname = 'secoes'`).all();
  const tipo = checks.filter(c => /tipo/.test(c.def));
  if (tipo.length > 1) throw new Error('Migração interrompida: mais de uma restrição de tipo em secoes. Revise o esquema.');
  if (tipo.length && /diretoria_adjunta/.test(tipo[0].def)) return;
  if (tipo.length) await db.exec(`alter table secoes drop constraint ${identificador(tipo[0].conname)}`);
  await db.exec(`alter table secoes add constraint secoes_tipo_check check (tipo in ${TIPOS})`);
}

export async function aplicarDiretoriaAdjunta(db) {
  return db.isPg ? postgres(db) : sqlite(db);
}
