import Database from 'better-sqlite3';
import fs from 'node:fs';

const db = new Database('data/sgc.db');

const tables = [
  'secoes',
  'usuarios',
  'diretrizes',
  'acoes',
  'acao_comentarios',
  'tempo',
  'pedidos_prazo',
  'atualizacoes',
  'combinados',
  'config',
  'reunioes',
  'decisoes'
];

let sql = `-- Script de carga de dados para Supabase PostgreSQL\n\n`;

// Disable RLS for all tables so API and backend have full access
sql += `-- Desabilitar RLS para que o backend/API gerencie as permissões\n`;
for (const t of tables) {
  sql += `alter table if exists ${t} disable row level security;\n`;
  sql += `grant all on ${t} to anon, authenticated, service_role;\n`;
}
sql += `\n`;

// Clean existing rows
sql += `-- Limpar dados anteriores caso existam\n`;
for (const t of [...tables].reverse()) {
  sql += `truncate table ${t} cascade;\n`;
}
sql += `\n`;

sql += `begin;\n`;
sql += `set constraints all deferred;\n\n`;

// Export rows
for (const t of tables) {
  const rows = db.prepare(`select * from ${t}`).all();
  if (rows.length === 0) continue;

  const cols = Object.keys(rows[0]);
  sql += `-- Tabela ${t} (${rows.length} registros)\n`;

  for (const row of rows) {
    const vals = cols.map(c => {
      const v = row[c];
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number') return v;
      // string: escape single quotes
      return `'${String(v).replace(/'/g, "''")}'`;
    });
    sql += `insert into ${t} (${cols.join(', ')}) values (${vals.join(', ')});\n`;
  }
  sql += `\n`;
}

sql += `commit;\n\n`;

// Reset sequences
sql += `-- Atualizar sequências das chaves primárias\n`;
for (const t of tables) {
  if (t === 'config') continue;
  sql += `select setval(pg_get_serial_sequence('${t}', 'id'), coalesce(max(id), 1)) from ${t};\n`;
}

fs.writeFileSync('server/seed-supabase.sql', sql);
console.log('Arquivo server/seed-supabase.sql gerado com sucesso!');
