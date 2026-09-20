// Implementação da versão 3. Alterações futuras exigem uma nova migração.
const identificador = nome => `"${nome.replaceAll('"', '""')}"`;

async function adicionarChefeSqlite(db) {
  const chaves = await db.prepare('pragma foreign_key_list(secoes)').all();
  if (chaves.some(c => c.from === 'chefe_id' && c.table === 'usuarios' && c.to === 'id')) return;
  const { sql } = await db.prepare("select sql from sqlite_master where type = 'table' and name = 'secoes'").get();
  const nova = sql.replace(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"secoes"|secoes)\s*\(/i, 'CREATE TABLE secoes_migracao_3 (')
    .replace(/\)(\s*(?:STRICT|WITHOUT ROWID)?\s*)$/i,
      ', constraint fk_secoes_chefe foreign key (chefe_id) references usuarios(id) deferrable initially deferred)$1');
  if (nova === sql || !nova.startsWith('CREATE TABLE secoes_migracao_3 (') || !nova.includes('constraint fk_secoes_chefe')) {
    throw new Error('Migração interrompida: definição de secoes incompatível com a reconstrução.');
  }
  const indices = await db.prepare("select sql from sqlite_master where type = 'index' and tbl_name = 'secoes' and sql is not null").all();
  // Views e triggers podem referenciar secoes a partir de outras tabelas.
  // Guardá-los evita referências temporariamente inválidas durante o RENAME.
  const objetos = await db.prepare("select type, name, sql from sqlite_master where type in ('view','trigger') and sql is not null order by type, name").all();
  for (const o of objetos) await db.exec(`drop ${o.type} ${identificador(o.name)}`);
  const colunas = (await db.prepare('pragma table_info(secoes)').all()).map(c => identificador(c.name)).join(', ');
  await db.exec(nova);
  await db.exec(`insert into secoes_migracao_3 (${colunas}) select ${colunas} from secoes`);
  await db.exec('drop table secoes');
  await db.exec('alter table secoes_migracao_3 rename to secoes');
  for (const o of indices) await db.exec(o.sql);
  // Views antes dos triggers, inclusive os INSTEAD OF associados a views.
  for (const tipo of ['view', 'trigger']) {
    for (const o of objetos.filter(o => o.type === tipo)) await db.exec(o.sql);
  }
}

export async function alinharIntegridade(db) {
  const invalidas = await db.prepare(`select s.id from secoes s left join usuarios u on u.id = s.chefe_id
    where s.chefe_id is not null and u.id is null order by s.id`).all();
  if (invalidas.length) throw new Error(`Migração interrompida: chefe inexistente nas seções ${invalidas.map(s => s.id).join(', ')}. Revise as referências antes de tentar novamente.`);
  if (!db.isPg) return adicionarChefeSqlite(db);

  // Mantém o comportamento restritivo do SQLite. A API já remove dependentes
  // explicitamente, na mesma transação, quando uma exclusão é permitida.
  for (const [tabela, coluna, pai] of [
    ['acao_comentarios', 'acao_id', 'acoes'], ['tempo', 'acao_id', 'acoes'],
    ['pedidos_prazo', 'acao_id', 'acoes'], ['decisoes', 'reuniao_id', 'reunioes'],
  ]) {
    const chaves = await db.prepare(`select c.conname, c.confdeltype, c.confupdtype, c.condeferrable,
      cardinality(c.conkey) as tamanho, p.relname as pai, pa.attname as destino
      from pg_constraint c join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
      join pg_class p on p.oid = c.confrelid and p.relnamespace = n.oid
      join pg_attribute pa on pa.attrelid = p.oid and pa.attnum = c.confkey[1]
      where c.contype = 'f' and n.nspname = current_schema() and t.relname = ? and a.attname = ?`).all(tabela, coluna);
    if (chaves.length !== 1 || chaves[0].tamanho !== 1 || chaves[0].pai !== pai || chaves[0].destino !== 'id'
      || chaves[0].confupdtype !== 'a' || chaves[0].condeferrable || !['a', 'c'].includes(chaves[0].confdeltype)) {
      throw new Error(`Migração interrompida: chave estrangeira inesperada em ${tabela}.${coluna}. Revise o esquema.`);
    }
    if (chaves[0].confdeltype === 'a') continue;
    await db.exec(`alter table ${tabela} drop constraint ${identificador(chaves[0].conname)},
      add constraint ${identificador(chaves[0].conname)} foreign key (${coluna}) references ${pai}(id) on delete no action`);
  }
}
