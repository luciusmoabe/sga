// Cria uma conta de Administrador. Só existe por este comando (executado por quem tem acesso ao servidor):
// nenhuma tela ou rota da API cria ou promove Administradores.
//
// Uso: node server/criar-administrador.js --sqlite ARQUIVO|--postgres "Nome Completo" email@orgao.gov.br
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SGC_ADMIN_SENHA_INICIAL vêm do ambiente (a senha não vai na linha de comando).
//   Opcional: SGC_ADMIN_SUBJECT=<UUID> vincula uma conta que já existe no Supabase, sem criar nem definir senha.
import { pathToFileURL } from 'node:url';
import { openDb } from './db.js';
import { GUID, origemValida } from './auth.js';
import { verificarMigracoes } from './migrations.js';
import { administradorAuth, cadastrarChefe } from './cadastro-chefes.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function criarAdministrador(db, config, admin, { nome, email, senha, subject }) {
  await verificarMigracoes(db);
  if (!subject) return cadastrarChefe(db, config, admin, { nome, email, senha }, 'administrador', { permitidos: ['administrador'] });
  nome = String(nome || '').trim();
  email = String(email || '').trim().toLowerCase();
  if (!nome || nome.length > 120 || email.length > 160 || !EMAIL.test(email) || !GUID.test(subject)) {
    throw new Error('Informe nome, e-mail e UUID do usuário Supabase válidos.');
  }
  return db.transaction(async () => {
    if (await db.prepare('select id from usuarios where lower(email) = ?').get(email)) throw new Error('E-mail já cadastrado no Agilis.');
    if (await db.prepare('select id from auth_contas where projeto = ? and subject = ?').get(config.supabaseUrl, subject.toLowerCase())) {
      throw new Error('Esta identidade Supabase já está vinculada a outro usuário.');
    }
    const id = (await db.prepare("insert into usuarios (nome, email, perfil) values (?, ?, 'administrador')").run(nome, email)).lastInsertRowid;
    await db.prepare('insert into auth_contas (usuario_id, projeto, subject) values (?, ?, ?)').run(id, config.supabaseUrl, subject.toLowerCase());
    return { id, nome, email, perfil: 'administrador', ativo: 1, trocar_senha: 0 };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const modo = args.shift();
  const arquivo = modo === '--sqlite' ? args.shift() : null;
  if (!['--sqlite', '--postgres'].includes(modo) || (modo === '--sqlite' && !arquivo) || args.length !== 2) {
    throw new Error('Uso: node server/criar-administrador.js --sqlite ARQUIVO|--postgres "Nome" email');
  }
  if (modo === '--postgres' && !process.env.SGC_MIGRATION_DATABASE_URL) throw new Error('Configure SGC_MIGRATION_DATABASE_URL explicitamente.');
  const local = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
  const config = { supabaseUrl: origemValida(process.env.SUPABASE_URL || '', { permitirLocal: local }) };
  const subject = process.env.SGC_ADMIN_SUBJECT || null;
  const db = modo === '--sqlite' ? openDb(arquivo, { databaseUrl: null })
    : openDb('postgres', { databaseUrl: process.env.SGC_MIGRATION_DATABASE_URL });
  try {
    const u = await criarAdministrador(db, config, administradorAuth(config),
      { nome: args[0], email: args[1], senha: process.env.SGC_ADMIN_SENHA_INICIAL, subject });
    console.log(`Administrador criado: ${u.email} (usuário ${u.id}).${subject ? '' : ' A senha inicial precisa ser trocada no primeiro acesso.'}`);
  } finally { await db.close(); }
}
