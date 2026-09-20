import { openDb } from './db.js';
import { aplicarMigracoes } from './migrations.js';

const [modo, arquivo, ...extras] = process.argv.slice(2);
if (extras.length || !((modo === '--sqlite' && arquivo) || (modo === '--postgres' && !arquivo))) {
  throw new Error('Uso: npm run migrate -- --sqlite CAMINHO ou --postgres (com SGC_MIGRATION_DATABASE_URL).');
}
if (modo === '--postgres' && !process.env.SGC_MIGRATION_DATABASE_URL) {
  throw new Error('Informe SGC_MIGRATION_DATABASE_URL explicitamente. DATABASE_URL não é usada pelo migrador.');
}
const db = modo === '--sqlite'
  ? openDb(arquivo, { databaseUrl: null })
  : openDb('postgres', { databaseUrl: process.env.SGC_MIGRATION_DATABASE_URL });
try {
  const novas = await aplicarMigracoes(db);
  console.log(novas.length ? `Migrações aplicadas: ${novas.join(', ')}.` : 'Esquema já atualizado.');
} finally {
  await db.close();
}
