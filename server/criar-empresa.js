// Cria uma empresa e o seu primeiro Diretor. Só existe por este comando (executado por quem tem acesso ao servidor):
// nenhuma tela ou rota da API cria empresas (ver MULTIEMPRESA.md).
//
// Uso: node server/criar-empresa.js --sqlite ARQUIVO|--postgres "Nome da Empresa" slug "Nome do Diretor" email@empresa.gov.br
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SGC_ADMIN_SENHA_INICIAL vêm do ambiente (a senha não vai na linha de comando).
//   Opcional: SGC_EMPRESA_SIGLA=<sigla>; SGC_EMPRESA_LISTADA=0 para não aparecer na lista da entrada (entra pelo endereço com ?empresa=slug).
//
// A 2ª empresa só pode existir depois da contração do esquema (fase 5 de MULTIEMPRESA.md): enquanto as chaves únicas globais
// de config e de reunião em andamento existirem, o comando recusa.
import { pathToFileURL } from 'node:url';
import { openDb } from './db.js';
import { origemValida } from './auth.js';
import { verificarMigracoes } from './migrations.js';
import { administradorAuth, cadastrarChefe } from './cadastro-chefes.js';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESERVADOS = new Set(['api', 'admin', 'plataforma', 'www', 'entrar', 'sair', 'imagens', 'fontes', 'js']);

/** O esquema já perdeu as chaves únicas globais (config.chave e uma reunião em andamento no sistema inteiro)? */
export async function esquemaContraido(db) {
  const indice = db.isPg
    ? await db.prepare("select 1 as x from pg_indexes where schemaname = current_schema() and indexname = 'uq_reuniao_em_andamento'").get()
    : await db.prepare("select 1 as x from sqlite_master where type = 'index' and name = 'uq_reuniao_em_andamento'").get();
  if (indice) return false;
  const chave = db.isPg
    ? await db.prepare(`select count(*) as n from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = current_schema() and c.relname = 'config' and i.indisunique and i.indnatts = 1
          and (select attname from pg_attribute where attrelid = c.oid and attnum = i.indkey[0]) = 'chave'`).get()
    : { n: (await db.prepare("select count(*) as n from pragma_index_list('config') l where l.[unique] = 1 and (select count(*) from pragma_index_info(l.name)) = 1 and (select name from pragma_index_info(l.name)) = 'chave'").get()).n };
  return Number(chave.n) === 0;
}

export async function criarEmpresa(db, config, admin, { nome, slug, sigla = null, listada = true, diretor, email, senha }, { ignorarContracao = false } = {}) {
  await verificarMigracoes(db);
  nome = String(nome || '').trim();
  slug = String(slug || '').trim().toLowerCase();
  sigla = sigla ? String(sigla).trim().toUpperCase().slice(0, 12) : null;
  if (!nome || nome.length > 160) throw new Error('Informe o nome da empresa, com até 160 caracteres.');
  if (!SLUG.test(slug) || slug.length < 2 || slug.length > 40 || RESERVADOS.has(slug)) {
    throw new Error('O identificador da empresa (slug) usa só letras minúsculas, números e hífens (2 a 40 caracteres), e não pode ser um nome reservado.');
  }
  if ((await db.prepare('select count(*) as n from empresas').get()).n > 0 && !ignorarContracao && !(await esquemaContraido(db))) {
    throw new Error('Ainda não é possível criar uma 2ª empresa: o esquema do banco não passou pela contração (fase 5 de MULTIEMPRESA.md).');
  }
  if (await db.prepare('select id from empresas where slug = ?').get(slug)) throw new Error('Já existe uma empresa com este identificador.');
  const id = (await db.prepare('insert into empresas (nome, sigla, slug, listada_no_login, criada_em) values (?,?,?,?,?)')
    .run(nome, sigla, slug, listada ? 1 : 0, new Date().toISOString())).lastInsertRowid;
  try {
    const usuario = await cadastrarChefe(db, config, admin, { nome: diretor, email, senha }, 'diretor', { permitidos: ['diretor'], empresaId: id });
    return { empresa: { id, nome, sigla, slug, listada_no_login: listada ? 1 : 0 }, diretor: usuario };
  } catch (e) {
    // A empresa ainda não tem nenhum dado: desfaz, para a repetição do comando não esbarrar no identificador.
    await db.prepare('delete from empresas where id = ?').run(id);
    throw e;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const modo = args.shift();
  const arquivo = modo === '--sqlite' ? args.shift() : null;
  if (!['--sqlite', '--postgres'].includes(modo) || (modo === '--sqlite' && !arquivo) || args.length !== 4) {
    throw new Error('Uso: node server/criar-empresa.js --sqlite ARQUIVO|--postgres "Nome da Empresa" slug "Nome do Diretor" email');
  }
  if (modo === '--postgres' && !process.env.SGC_MIGRATION_DATABASE_URL) throw new Error('Configure SGC_MIGRATION_DATABASE_URL explicitamente.');
  const local = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
  const config = { supabaseUrl: origemValida(process.env.SUPABASE_URL || '', { permitirLocal: local }) };
  const db = modo === '--sqlite' ? openDb(arquivo, { databaseUrl: null })
    : openDb('postgres', { databaseUrl: process.env.SGC_MIGRATION_DATABASE_URL });
  try {
    const r = await criarEmpresa(db, config, administradorAuth(config), {
      nome: args[0], slug: args[1], diretor: args[2], email: args[3], senha: process.env.SGC_ADMIN_SENHA_INICIAL,
      sigla: process.env.SGC_EMPRESA_SIGLA || null, listada: process.env.SGC_EMPRESA_LISTADA !== '0',
    });
    console.log(`Empresa criada: ${r.empresa.nome} (${r.empresa.slug}, número ${r.empresa.id}). Diretor: ${r.diretor.email}; a senha inicial precisa ser trocada no primeiro acesso.`);
  } finally { await db.close(); }
}
