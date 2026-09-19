import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
create table if not exists secoes (
  id integer primary key,
  nome text not null,
  sigla text,
  tipo text not null check (tipo in ('centro','coordenacao','subsecao')),
  pai_id integer references secoes(id),
  ordem integer not null default 0,
  ativa integer not null default 1,
  chefe_id integer,
  criada_em text not null
);
create table if not exists usuarios (
  id integer primary key,
  nome text not null,
  email text,
  perfil text not null check (perfil in ('diretor','chefe','apoio')),
  secao_id integer references secoes(id),
  ativo integer not null default 1
);
create table if not exists diretrizes (
  id integer primary key,
  titulo text not null,
  detalhe text,
  destino text not null check (destino in ('todos','especificos')),
  prazo text not null,
  prioridade text not null default 'media',
  criado_por integer references usuarios(id),
  criado_em text not null,
  reuniao_id integer
);
create table if not exists acoes (
  id integer primary key,
  diretriz_id integer references diretrizes(id),
  secao_id integer not null references secoes(id),
  acao_pai_id integer references acoes(id),
  titulo text not null,
  detalhe text,
  status text not null default 'a_fazer',
  prazo text not null,
  prazo_original text not null,
  prioridade text not null default 'media',
  interna integer not null default 0,
  compartilhada integer not null default 0,
  encerrada integer not null default 0,
  arquivada integer not null default 0,
  concluida_em text,
  criada_em text not null
);
create index if not exists idx_acoes_secao on acoes(secao_id);
create table if not exists acao_comentarios (
  id integer primary key,
  acao_id integer not null references acoes(id),
  usuario_id integer references usuarios(id),
  texto text not null,
  criado_em text not null
);
create table if not exists tempo (
  id integer primary key,
  acao_id integer not null references acoes(id),
  usuario_id integer references usuarios(id),
  data text not null,
  minutos integer not null check (minutos > 0),
  criado_em text not null
);
create table if not exists pedidos_prazo (
  id integer primary key,
  acao_id integer not null references acoes(id),
  usuario_id integer references usuarios(id),
  prazo_atual text not null,
  novo_prazo text not null,
  justificativa text not null,
  status text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
  criado_em text not null,
  decidido_em text,
  decidido_por integer references usuarios(id),
  reuniao_id integer
);
create table if not exists atualizacoes (
  id integer primary key,
  secao_id integer not null references secoes(id),
  semana text not null,
  versao integer not null,
  feito text not null default '{}',
  proximo text not null default '[]',
  impedimentos text not null default '[]',
  critico integer not null default 0,
  apoio text,
  usuario_id integer references usuarios(id),
  enviada_em text not null,
  unique (secao_id, semana, versao)
);
create table if not exists combinados (
  id integer primary key,
  texto text not null,
  ordem integer not null default 0,
  ativo integer not null default 1,
  arquivado integer not null default 0,
  criado_por integer references usuarios(id),
  criado_em text not null,
  alterado_em text not null
);
create table if not exists config (
  chave text primary key,
  valor text not null
);
create table if not exists reunioes (
  id integer primary key,
  data text not null,
  semana text not null,
  iniciada_em text not null,
  encerrada_em text,
  status text not null default 'em_andamento' check (status in ('em_andamento','rascunho','enviada')),
  combinados_snapshot text not null default '[]',
  ata_texto text,
  enviada_em text,
  criada_por integer references usuarios(id)
);
create table if not exists decisoes (
  id integer primary key,
  reuniao_id integer not null references reunioes(id),
  secao_id integer references secoes(id),
  texto text not null,
  criada_em text not null,
  criada_por integer references usuarios(id)
);
`;

export function openDb(file = process.env.SGC_DB || 'data/sgc.db') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  try { db.prepare('alter table acoes add column arquivada integer not null default 0').run(); } catch {}
  return db;
}

/** Ids da seção e de todas as suas descendentes (árvore de seções). */
export function subarvore(db, id) {
  return db
    .prepare(
      `with recursive t(id) as (
         select ? union all select s.id from secoes s join t on s.pai_id = t.id
       ) select id from t`,
    )
    .all(id)
    .map((r) => r.id);
}

/** Nível da seção: Centro e Coordenação = 1, subseção = 2, subseção da subseção = 3. */
export function nivel(db, id) {
  let n = 0;
  let atual = id;
  while (atual) {
    n += 1;
    atual = db.prepare('select pai_id from secoes where id = ?').get(atual)?.pai_id;
  }
  return n;
}

/** Ancestrais (do pai até o Centro), útil para permissões. */
export function ancestrais(db, id) {
  const lista = [];
  let atual = db.prepare('select pai_id from secoes where id = ?').get(id)?.pai_id;
  while (atual) {
    lista.push(atual);
    atual = db.prepare('select pai_id from secoes where id = ?').get(atual)?.pai_id;
  }
  return lista;
}

export function estaVazio(db) {
  return db.prepare('select count(*) n from usuarios').get().n === 0;
}
