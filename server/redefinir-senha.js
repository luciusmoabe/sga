// Redefine a senha de uma conta pelo servidor, para quem não consegue entrar nem tem outro Administrador que a redefina pela tela
// (o Administrador só é redefinido por outro Administrador). Troca a senha pela API administrativa do Supabase, marca a troca
// obrigatória no próximo acesso e encerra as sessões abertas da conta.
//
// Uso: node server/redefinir-senha.js --sqlite ARQUIVO|--postgres email@orgao.gov.br
//   SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY vêm do ambiente. A senha provisória é gerada ao acaso e mostrada uma única vez;
//   SGC_NOVA_SENHA define uma própria (a senha não vai na linha de comando).
import { pathToFileURL } from 'node:url';
import { randomInt } from 'node:crypto';
import { openDb } from './db.js';
import { origemValida } from './auth.js';
import { verificarMigracoes } from './migrations.js';
import { administradorAuth } from './cadastro-chefes.js';
import { TAM_SENHA } from '../public/js/regras.js';

const ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem caracteres ambíguos
export const senhaProvisoria = () => Array.from({ length: 14 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');

export async function redefinirSenha(db, config, admin, { email, senha }) {
  await verificarMigracoes(db);
  email = String(email || '').trim().toLowerCase();
  if (typeof senha !== 'string' || senha.length < TAM_SENHA.min || senha.length > TAM_SENHA.max) {
    throw new Error(`A senha deve ter entre ${TAM_SENHA.min} e ${TAM_SENHA.max} caracteres.`);
  }
  const conta = await db.prepare(`select c.id as conta_id, c.subject, u.id as usuario_id, u.nome, u.perfil, u.ativo, u.empresa_id
    from usuarios u join auth_contas c on c.usuario_id = u.id
    where lower(u.email) = ? and c.projeto = ?`).get(email, config.supabaseUrl);
  if (!conta) throw new Error('Não há conta com este e-mail e login vinculado neste projeto.');
  await admin.atualizar(conta.subject, { password: senha });
  await db.transaction(async () => {
    await db.prepare('update usuarios set trocar_senha = 1 where id = ?').run(conta.usuario_id);
    await db.prepare('delete from auth_sessoes_senha where conta_id = ?').run(conta.conta_id);
  });
  return { usuario_id: conta.usuario_id, nome: conta.nome, perfil: conta.perfil, ativo: !!conta.ativo };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const modo = args.shift();
  const arquivo = modo === '--sqlite' ? args.shift() : null;
  if (!['--sqlite', '--postgres'].includes(modo) || (modo === '--sqlite' && !arquivo) || args.length !== 1) {
    throw new Error('Uso: node server/redefinir-senha.js --sqlite ARQUIVO|--postgres email');
  }
  if (modo === '--postgres' && !process.env.SGC_MIGRATION_DATABASE_URL) throw new Error('Configure SGC_MIGRATION_DATABASE_URL explicitamente.');
  const local = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
  const config = { supabaseUrl: origemValida(process.env.SUPABASE_URL || '', { permitirLocal: local }) };
  const db = modo === '--sqlite' ? openDb(arquivo, { databaseUrl: null })
    : openDb('postgres', { databaseUrl: process.env.SGC_MIGRATION_DATABASE_URL });
  try {
    const senha = process.env.SGC_NOVA_SENHA || senhaProvisoria();
    const u = await redefinirSenha(db, config, administradorAuth(config), { email: args[0], senha });
    console.log(`Senha redefinida: ${u.nome} (${u.perfil}${u.ativo ? '' : ', conta INATIVA'}).`);
    if (!process.env.SGC_NOVA_SENHA) console.log(`Senha provisória (mostrada só agora): ${senha}`);
    console.log('A pessoa é obrigada a trocá-la no próximo acesso; as sessões abertas foram encerradas.');
  } finally { await db.close(); }
}
