// Cria uma conta do perfil Plataforma, que administra as empresas pela tela "Empresas". Só existe por este comando (executado por
// quem tem acesso ao servidor): nenhuma tela ou rota da API cria ou promove contas de plataforma.
//
// Uso: node server/criar-plataforma.js --sqlite ARQUIVO|--postgres "Nome Completo" email@dominio
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SGC_ADMIN_SENHA_INICIAL vêm do ambiente (a senha não vai na linha de comando).
// As contas de plataforma ficam numa empresa interna ("Plataforma", slug `plataforma`, fora da lista da entrada): entram pelo
// endereço com ?empresa=plataforma e não enxergam dados de nenhuma outra empresa.
import { pathToFileURL } from 'node:url';
import { openDb } from './db.js';
import { origemValida } from './auth.js';
import { verificarMigracoes } from './migrations.js';
import { administradorAuth, cadastrarChefe } from './cadastro-chefes.js';
import { criarEmpresa } from './criar-empresa.js';

export async function criarPlataforma(db, config, admin, { nome, email, senha }) {
  await verificarMigracoes(db);
  const existente = await db.prepare("select id from empresas where slug = 'plataforma'").get();
  if (!existente) {
    const r = await criarEmpresa(db, config, admin, { nome: 'Plataforma', slug: 'plataforma', listada: false, diretor: nome, email, senha, perfil: 'plataforma' },
      { permitirReservado: true, ignorarContracao: true });
    return r.diretor;
  }
  return cadastrarChefe(db, config, admin, { nome, email, senha }, 'plataforma', { permitidos: ['plataforma'], empresaId: existente.id });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const modo = args.shift();
  const arquivo = modo === '--sqlite' ? args.shift() : null;
  if (!['--sqlite', '--postgres'].includes(modo) || (modo === '--sqlite' && !arquivo) || args.length !== 2) {
    throw new Error('Uso: node server/criar-plataforma.js --sqlite ARQUIVO|--postgres "Nome" email');
  }
  if (modo === '--postgres' && !process.env.SGC_MIGRATION_DATABASE_URL) throw new Error('Configure SGC_MIGRATION_DATABASE_URL explicitamente.');
  const local = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
  const config = { supabaseUrl: origemValida(process.env.SUPABASE_URL || '', { permitirLocal: local }) };
  const db = modo === '--sqlite' ? openDb(arquivo, { databaseUrl: null })
    : openDb('postgres', { databaseUrl: process.env.SGC_MIGRATION_DATABASE_URL });
  try {
    const u = await criarPlataforma(db, config, administradorAuth(config), { nome: args[0], email: args[1], senha: process.env.SGC_ADMIN_SENHA_INICIAL });
    console.log(`Conta de plataforma criada: ${u.email}. Entra em /?empresa=plataforma; a senha inicial precisa ser trocada no primeiro acesso.`);
  } finally { await db.close(); }
}
