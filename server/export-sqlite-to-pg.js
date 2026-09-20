import Database from 'better-sqlite3';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { TABELAS_APP } from './seguranca-supabase.js';

function ordenarPais(rows, coluna) {
  const pendentes = new Map(rows.map(r => [r.id, r]));
  const vistos = new Set();
  const ordenadas = [];
  while (pendentes.size) {
    const tamanho = pendentes.size;
    for (const [id, row] of pendentes) {
      if (row[coluna] == null || vistos.has(row[coluna])) {
        ordenadas.push(row); vistos.add(id); pendentes.delete(id);
      }
    }
    if (pendentes.size === tamanho) throw new Error(`Carga interrompida: hierarquia inválida em ${coluna}.`);
  }
  return ordenadas;
}

// Carga apenas em destino vazio. Nunca inclui sessões ou vínculos institucionais.
export function gerarCarga(db) {
  let sql = `-- Carga do Agilis: destino vazio, esquema provisionado e migrado.
begin;
set standard_conforming_strings = on;
set constraints all deferred;
`;
  sql += `lock table ${TABELAS_APP.join(', ')} in access exclusive mode;
`;
  sql += `do $carga$ declare tabela text; ocupado boolean; begin
    foreach tabela in array array[${TABELAS_APP.map(t => `'${t}'`).join(', ')}] loop
      execute format('select exists(select 1 from %I)', tabela) into ocupado;
      if ocupado then raise exception 'Carga exige destino vazio: %', tabela; end if;
    end loop;
  end $carga$;
`;
  for (const tabela of TABELAS_APP) {
    let rows = db.prepare(`select * from ${tabela}`).all();
    if (tabela === 'secoes') rows = ordenarPais(rows, 'pai_id');
    if (tabela === 'acoes') rows = ordenarPais(rows, 'acao_pai_id');
    for (const row of rows) {
      const cols = Object.keys(row);
      const valores = cols.map(c => row[c] == null ? 'NULL' : typeof row[c] === 'number' ? String(row[c])
        : `'${String(row[c]).replaceAll("'", "''")}'`);
      sql += `insert into ${tabela} (${cols.map(c => `"${c.replaceAll('"', '""')}"`).join(', ')}) values (${valores.join(', ')});
`;
    }
  }
  // ALTER identity é transacional, ao contrário de setval.
  sql += `set constraints all immediate;
`;
  for (const tabela of TABELAS_APP.filter(t => t !== 'config')) {
    const { maior } = db.prepare(`select coalesce(max(id), 0) as maior from ${tabela}`).get();
    sql += `alter table ${tabela} alter column id restart with ${maior + 1};
`;
  }
  return sql + `commit;
`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [origem, destino, ...extras] = process.argv.slice(2);
  if (!origem || !destino || extras.length) throw new Error('Uso: node server/export-sqlite-to-pg.js ORIGEM.sqlite DESTINO.sql');
  const db = new Database(origem, { readonly: true, fileMustExist: true });
  try {
    const sql = db.transaction(() => gerarCarga(db))();
    fs.writeFileSync(destino, sql, { flag: 'wx', mode: 0o600 });
    console.log('Carga criada; nenhum banco PostgreSQL foi acessado.');
  } finally { db.close(); }
}
