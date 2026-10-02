// Vincula um Administrador existente à Diretoria Adjunta, ou desvincula. Como a criação do Administrador,
// só existe por comando no servidor: nenhuma tela ou rota da API mexe na conta do Administrador.
//
// Uso: node server/secao-administrador.js --sqlite ARQUIVO|--postgres email@orgao.gov.br SECAO_ID|nenhuma
import { pathToFileURL } from 'node:url';
import { openDb } from './db.js';
import { definirSecaoAdministrador } from './criar-administrador.js';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const modo = args.shift();
  const arquivo = modo === '--sqlite' ? args.shift() : null;
  if (!['--sqlite', '--postgres'].includes(modo) || (modo === '--sqlite' && !arquivo) || args.length !== 2) {
    throw new Error('Uso: node server/secao-administrador.js --sqlite ARQUIVO|--postgres email SECAO_ID|nenhuma');
  }
  if (modo === '--postgres' && !process.env.SGC_MIGRATION_DATABASE_URL) throw new Error('Configure SGC_MIGRATION_DATABASE_URL explicitamente.');
  const secao = args[1] === 'nenhuma' ? null : Number(args[1]);
  const db = modo === '--sqlite' ? openDb(arquivo, { databaseUrl: null })
    : openDb('postgres', { databaseUrl: process.env.SGC_MIGRATION_DATABASE_URL });
  try {
    await definirSecaoAdministrador(db, args[0], secao);
    console.log(secao ? 'Administrador vinculado à Diretoria Adjunta.' : 'Administrador desvinculado da Diretoria Adjunta.');
  } finally { await db.close(); }
}
