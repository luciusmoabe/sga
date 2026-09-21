import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { createPgDb } from '../../server/db.js';

const executar = promisify(execFile);

// Nunca aceita URL externa: o cluster e todos os bancos pertencem a esta execução.
export async function clusterTemporario(t) {
  const pasta = await mkdtemp('/tmp/sgc-pg-');
  const dados = path.join(pasta, 'data');
  const bin = nome => process.env.PG_BIN ? path.join(process.env.PG_BIN, nome) : nome;
  // Não herdar opções/libpq/credenciais da sessão do desenvolvedor.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('PG')));
  let iniciado = false;
  const conexoes = new Set();
  t.after(async () => {
    try {
      await Promise.all([...conexoes].map(db => db.close()));
    } finally {
      const pid = await readFile(path.join(dados, 'postmaster.pid'), 'utf8').catch(() => '');
      if (iniciado || pid) await executar(bin('pg_ctl'), ['-D', dados, '-m', 'immediate', '-w', 'stop'], { env });
      await rm(pasta, { recursive: true, force: true });
    }
  });
  try {
    await executar(bin('initdb'), ['-D', dados, '-U', 'sgc_test', '-A', 'trust', '--encoding=UTF8', '--no-locale'], { env });
    await executar(bin('pg_ctl'), ['-D', dados, '-l', path.join(pasta, 'postgres.log'), '-w', 'start',
      '-o', `-h '' -k ${pasta} -c unix_socket_permissions=0700 -c max_connections=40`], { env });
    iniciado = true;
  } catch (erro) {
    const log = await readFile(path.join(pasta, 'postgres.log'), 'utf8').catch(() => '');
    throw new Error(`Não foi possível iniciar PostgreSQL temporário. Configure PG_BIN com initdb e pg_ctl. ${erro.message}\n${log}`);
  }
  const conectar = database => {
    const db = createPgDb(new pg.Pool({ host: pasta, port: 5432, user: 'sgc_test', password: '', database,
      ssl: false, max: 6, connectionTimeoutMillis: 5000, statement_timeout: 10000 }));
    conexoes.add(db);
    return db;
  };
  const admin = conectar('postgres');
  let contador = 0;
  return {
    versao: (await admin.prepare('select version() as versao').get()).versao,
    async banco(contexto) {
      const nome = `sgc_test_${++contador}`;
      await admin.exec(`create database ${nome}`);
      const db = conectar(nome);
      await db.exec(await readFile(new URL('../../server/schema.sql', import.meta.url), 'utf8'));
      const bancos = [db, conectar(nome)];
      contexto?.after(async () => {
        await Promise.all(bancos.map(async banco => {
          await banco.close();
          conexoes.delete(banco);
        }));
      });
      return bancos;
    },
  };
}
