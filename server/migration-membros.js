// Implementação da versão 21: perfil Membro da equipe e campos novos da ação (responsável, atribuição, validação do
// chefe e demandante externo). Alterações futuras exigem uma nova migração.
//
// Tudo é aditivo para a versão anterior da aplicação continuar funcionando com o banco já migrado (ver MIGRACOES.md):
// colunas opcionais, sem valor obrigatório, e um perfil a mais na restrição de usuarios.perfil.
const PERFIS = "('diretor','chefe','apoio','administrador','consulta','membro')";
const identificador = nome => `"${nome.replaceAll('"', '""')}"`;

const COLUNAS_ACAO = [
  ['responsavel_id', 'integer references usuarios(id)'], // quem executa a ação (chefe ou membro da seção)
  ['atribuido_por', 'integer references usuarios(id)'], // quem atribuiu; vazio quando a pessoa executa a própria ação
  ['atribuida_em', 'text'],
  ['validada_chefe_em', 'text'], // validação do chefe, quando ele delegou a ação a um membro
  ['validada_chefe_por', 'integer references usuarios(id)'],
  ['demandante_externo', 'text'], // entidade fora da subordinação ao Diretor que demandou a ação
];

async function colunasAcao(db) {
  return db.isPg
    ? (await db.prepare("select column_name as nome from information_schema.columns where table_schema=current_schema() and table_name='acoes'").all()).map(c => c.nome)
    : (await db.prepare('pragma table_info(acoes)').all()).map(c => c.name);
}

async function sqlite(db) {
  const colunas = (await db.prepare('pragma table_info(usuarios)').all()).map(c => c.name);
  const { sql } = await db.prepare("select sql from sqlite_master where type = 'table' and name = 'usuarios'").get();
  if (/'membro'/i.test(sql)) return;
  // O SQLite não altera CHECK: reconstrói a tabela, como nas versões 3, 8 e 19, preservando dados, índices, views e triggers.
  const nova = sql.replace(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"usuarios"|usuarios)\s*\(/i, 'CREATE TABLE usuarios_migracao_21 (')
    .replace(/\(\s*'diretor'\s*,\s*'chefe'\s*,\s*'apoio'\s*,\s*'administrador'\s*,\s*'consulta'\s*\)/i, PERFIS);
  if (!nova.startsWith('CREATE TABLE usuarios_migracao_21 (') || !nova.includes("'membro'")) {
    throw new Error('Migração interrompida: definição de usuarios incompatível com a reconstrução.');
  }
  const indices = await db.prepare("select sql from sqlite_master where type = 'index' and tbl_name = 'usuarios' and sql is not null").all();
  const objetos = await db.prepare("select type, name, sql from sqlite_master where type in ('view','trigger') and sql is not null order by type, name").all();
  for (const o of objetos) await db.exec(`drop ${o.type} ${identificador(o.name)}`);
  const lista = colunas.map(identificador).join(', ');
  await db.exec(nova);
  await db.exec(`insert into usuarios_migracao_21 (${lista}) select ${lista} from usuarios`);
  await db.exec('drop table usuarios');
  await db.exec('alter table usuarios_migracao_21 rename to usuarios');
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
  if (!perfil.length || !/membro/.test(perfil[0].def)) {
    if (perfil.length) await db.exec(`alter table usuarios drop constraint ${identificador(perfil[0].conname)}`);
    await db.exec(`alter table usuarios add constraint usuarios_perfil_check check (perfil in ${PERFIS})`);
  }
}

export async function aplicarMembros(db) {
  const existentes = await colunasAcao(db);
  for (const [nome, tipo] of COLUNAS_ACAO) {
    if (!existentes.includes(nome)) await db.exec(`alter table acoes add column ${nome} ${tipo}`);
  }
  await db.exec('create index if not exists idx_acoes_responsavel on acoes(responsavel_id)');
  return db.isPg ? postgres(db) : sqlite(db);
}
