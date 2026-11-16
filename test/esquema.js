// Descreve o esquema (tabelas, colunas e índices nomeados) de um banco SQLite ou PostgreSQL, só com nomes,
// para comparar os dois: os tipos diferem de propósito (identity x autoincrement), os nomes não podem diferir.

/** Tabelas e colunas de um banco já aberto. Devolve { tabela: [coluna, ...] } e { indices: [nome, ...] }. */
export async function descreverEsquema(db) {
  const tabelas = {};
  const indices = [];
  if (db.isPg) {
    for (const r of await db.prepare(`select table_name as t, column_name as c from information_schema.columns
        where table_schema = current_schema() order by table_name, ordinal_position`).all()) (tabelas[r.t] ??= []).push(r.c);
    // Restrições primárias e únicas geram índices automáticos (`*_pkey`, `*_key`): no SQLite são `sqlite_autoindex_*`.
    for (const r of await db.prepare(`select indexname as n from pg_indexes where schemaname = current_schema()`).all()) {
      if (!/_(pkey|key)$/.test(r.n)) indices.push(r.n);
    }
  } else {
    for (const r of await db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").all()) {
      tabelas[r.name] = (await db.prepare(`pragma table_info(${r.name})`).all()).map((c) => c.name);
    }
    for (const r of await db.prepare("select name from sqlite_master where type = 'index' and name not like 'sqlite_%'").all()) indices.push(r.name);
  }
  return { tabelas, indices: indices.sort() };
}

/** Diferenças entre dois esquemas descritos, em linhas legíveis. Vazio = iguais. */
export function diferencas(a, b, nomeA = 'SQLite', nomeB = 'PostgreSQL') {
  const out = [];
  for (const t of new Set([...Object.keys(a.tabelas), ...Object.keys(b.tabelas)])) {
    if (!a.tabelas[t]) { out.push(`tabela ${t}: só no ${nomeB}`); continue; }
    if (!b.tabelas[t]) { out.push(`tabela ${t}: só no ${nomeA}`); continue; }
    for (const c of a.tabelas[t]) if (!b.tabelas[t].includes(c)) out.push(`${t}.${c}: só no ${nomeA}`);
    for (const c of b.tabelas[t]) if (!a.tabelas[t].includes(c)) out.push(`${t}.${c}: só no ${nomeB}`);
  }
  for (const i of a.indices) if (!b.indices.includes(i)) out.push(`índice ${i}: só no ${nomeA}`);
  for (const i of b.indices) if (!a.indices.includes(i)) out.push(`índice ${i}: só no ${nomeB}`);
  return out.sort();
}
