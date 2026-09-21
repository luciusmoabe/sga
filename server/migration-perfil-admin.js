// Implementação da versão 8: perfil Administrador e troca obrigatória da senha inicial.
// Alterações futuras exigem uma nova migração.
const PERFIS = "('diretor','chefe','apoio','administrador')";
const identificador = nome => `"${nome.replaceAll('"', '""')}"`;

async function sqlite(db) {
  const { sql } = await db.prepare("select sql from sqlite_master where type = 'table' and name = 'usuarios'").get();
  const colunas = (await db.prepare('pragma table_info(usuarios)').all()).map(c => c.name);
  const temColuna = colunas.includes('trocar_senha');
  if (/administrador/i.test(sql)) {
    if (!temColuna) await db.exec('alter table usuarios add column trocar_senha integer not null default 0');
    return;
  }
  // O SQLite não altera CHECK: reconstrói a tabela, como na versão 3, preservando dados, índices, views e triggers.
  let nova = sql.replace(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"usuarios"|usuarios)\s*\(/i, 'CREATE TABLE usuarios_migracao_8 (')
    .replace(/\(\s*'diretor'\s*,\s*'chefe'\s*,\s*'apoio'\s*\)/i, PERFIS);
  if (!temColuna) nova = nova.replace(/\)(\s*(?:STRICT|WITHOUT ROWID)?\s*)$/i, ', trocar_senha integer not null default 0)$1');
  if (!nova.startsWith('CREATE TABLE usuarios_migracao_8 (') || !nova.includes('administrador') || !/trocar_senha/.test(nova)) {
    throw new Error('Migração interrompida: definição de usuarios incompatível com a reconstrução.');
  }
  const indices = await db.prepare("select sql from sqlite_master where type = 'index' and tbl_name = 'usuarios' and sql is not null").all();
  const objetos = await db.prepare("select type, name, sql from sqlite_master where type in ('view','trigger') and sql is not null order by type, name").all();
  for (const o of objetos) await db.exec(`drop ${o.type} ${identificador(o.name)}`);
  const lista = colunas.map(identificador).join(', ');
  await db.exec(nova);
  await db.exec(`insert into usuarios_migracao_8 (${lista}) select ${lista} from usuarios`);
  await db.exec('drop table usuarios');
  await db.exec('alter table usuarios_migracao_8 rename to usuarios');
  for (const o of indices) await db.exec(o.sql);
  for (const tipo of ['view', 'trigger']) {
    for (const o of objetos.filter(o => o.type === tipo)) await db.exec(o.sql);
  }
}

async function postgres(db) {
  const checks = await db.prepare(`select c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'c' and n.nspname = current_schema() and t.relname = 'usuarios'`).all();
  const perfil = checks.filter(c => /perfil/.test(c.def));
  if (perfil.length > 1) throw new Error('Migração interrompida: mais de uma restrição de perfil em usuarios. Revise o esquema.');
  if (!perfil.length || !/administrador/.test(perfil[0].def)) {
    if (perfil.length) await db.exec(`alter table usuarios drop constraint ${identificador(perfil[0].conname)}`);
    await db.exec(`alter table usuarios add constraint usuarios_perfil_check check (perfil in ${PERFIS})`);
  }
  await db.exec('alter table usuarios add column if not exists trocar_senha integer not null default 0');
}

export async function aplicarPerfilAdministrador(db) {
  return db.isPg ? postgres(db) : sqlite(db);
}
