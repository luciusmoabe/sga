// Conta os registros de cada tabela (SOMENTE LEITURA) e, onde existe `empresa_id`, por empresa. Serve para conferir que uma
// migração não perdeu nem alterou dados: rode antes e depois e compare as duas saídas (`diff antes.txt depois.txt`).
//
//   SQLite:      node scripts/contagem-registros.js --sqlite caminho/do/banco.db
//   PostgreSQL:  node scripts/contagem-registros.js --postgres      (usa SGC_MIGRATION_DATABASE_URL, como o migrador)
//
// Não imprime senhas, e-mails nem texto de nenhum registro: só nomes de tabelas e números.
import { openDb } from '../server/db.js';
import { TABELAS_APP } from '../server/seguranca-supabase.js';

const [modo, arquivo] = process.argv.slice(2);
if (!((modo === '--sqlite' && arquivo) || (modo === '--postgres' && !arquivo))) {
  throw new Error('Uso: node scripts/contagem-registros.js --sqlite CAMINHO ou --postgres (com SGC_MIGRATION_DATABASE_URL).');
}
if (modo === '--postgres' && !process.env.SGC_MIGRATION_DATABASE_URL) throw new Error('Informe SGC_MIGRATION_DATABASE_URL explicitamente.');
const db = modo === '--sqlite' ? openDb(arquivo, { databaseUrl: null }) : openDb('postgres', { databaseUrl: process.env.SGC_MIGRATION_DATABASE_URL });

async function temColuna(tabela, coluna) {
  return db.isPg
    ? !!(await db.prepare('select 1 as x from information_schema.columns where table_schema = current_schema() and table_name = ? and column_name = ?').get(tabela, coluna))
    : (await db.prepare(`pragma table_info(${tabela})`).all()).some((c) => c.name === coluna);
}
async function existe(tabela) {
  return db.isPg
    ? !!(await db.prepare('select 1 as x from information_schema.tables where table_schema = current_schema() and table_name = ?').get(tabela))
    : !!(await db.prepare("select 1 as x from sqlite_master where type = 'table' and name = ?").get(tabela));
}

try {
  const migracao = await db.prepare('select max(id) as v, count(*) as n from schema_migrations').get();
  console.log(`versão do banco: ${migracao.v} (${migracao.n} migrações registradas)`);
  let total = 0;
  for (const tabela of [...TABELAS_APP].sort()) {
    if (!(await existe(tabela))) { console.log(`${tabela}: (não existe)`); continue; }
    const { n } = await db.prepare(`select count(*) as n from ${tabela}`).get();
    total += Number(n);
    console.log(`${tabela}: ${n}`);
    if (await temColuna(tabela, 'empresa_id')) {
      for (const linha of await db.prepare(`select empresa_id, count(*) as n from ${tabela} group by empresa_id order by empresa_id`).all()) {
        console.log(`  empresa ${linha.empresa_id}: ${linha.n}`);
      }
    }
  }
  console.log(`total de registros nas tabelas do app: ${total}`);
} finally {
  await db.close();
}
