import { pathToFileURL } from 'node:url';
import { openDb } from './db.js';
import { GUID, origemValida } from './auth.js';
import { verificarMigracoes } from './migrations.js';
import { ehProducao } from './ambiente.js';

export async function vincularIdentidade(db, usuario, projeto, subject) {
  if (!Number.isSafeInteger(usuario) || usuario < 1 || !GUID.test(subject)) {
    throw new Error('Informe ID numérico do usuário, URL do projeto e UUID do usuário Supabase válidos.');
  }
  projeto = origemValida(projeto, { permitirLocal: !ehProducao() });
  await verificarMigracoes(db);
  return db.transaction(async () => {
    const u = await db.prepare('select id from usuarios where id = ? and ativo = 1').get(usuario);
    if (!u) throw new Error('Usuário local inexistente ou inativo.');
    const existente = await db.prepare('select * from auth_contas where usuario_id = ? or (projeto = ? and subject = ?)')
      .all(usuario, projeto, subject.toLowerCase());
    if (existente.length) {
      if (existente.length === 1 && existente[0].usuario_id === usuario && existente[0].projeto === projeto
        && existente[0].subject === subject.toLowerCase()) return;
      throw new Error('Usuário ou identidade já vinculado. Revise o vínculo existente; ele não será substituído.');
    }
    await db.prepare('insert into auth_contas (usuario_id, projeto, subject) values (?, ?, ?)')
      .run(usuario, projeto, subject.toLowerCase());
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const modo = args.shift();
  const arquivo = modo === '--sqlite' ? args.shift() : null;
  if (!['--sqlite', '--postgres'].includes(modo) || (modo === '--sqlite' && !arquivo) || args.length !== 3) {
    throw new Error('Uso: node server/vincular-identidade.js --sqlite ARQUIVO|--postgres USUARIO_ID SUPABASE_URL AUTH_USER_ID');
  }
  if (modo === '--postgres' && !process.env.SGC_MIGRATION_DATABASE_URL) throw new Error('Configure SGC_MIGRATION_DATABASE_URL explicitamente.');
  const db = modo === '--sqlite' ? openDb(arquivo, { databaseUrl: null })
    : openDb('postgres', { databaseUrl: process.env.SGC_MIGRATION_DATABASE_URL });
  try {
    await vincularIdentidade(db, Number(args[0]), args[1], args[2]);
    console.log('Vínculo Supabase confirmado. Nenhum perfil foi alterado.');
  } finally { await db.close(); }
}
