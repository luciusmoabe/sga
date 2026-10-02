// Implementação da versão 14: data da última movimentação de cada ação. Alterações futuras exigem uma nova migração.
// Para as ações que já existem, usa a mais recente das movimentações registradas: criação, conclusão, tempo,
// comentário, checklist, impedimento, histórico de prazo e pedido de prazo. Mudanças de status antigas não deixaram
// data, então não entram.

const colunas = async (db, tabela) => (db.isPg
  ? await db.prepare('select column_name as nome from information_schema.columns where table_schema = current_schema() and table_name = ?').all(tabela)
  : (await db.prepare(`pragma table_info(${tabela})`).all()).map(c => ({ nome: c.name })));

const FONTES = [
  'select id as acao_id, criada_em as m from acoes',
  'select id as acao_id, concluida_em as m from acoes where concluida_em is not null',
  'select acao_id, max(criado_em) as m from tempo group by acao_id',
  'select acao_id, max(criado_em) as m from acao_comentarios group by acao_id',
  'select acao_id, max(criado_em) as m from acao_checklist group by acao_id',
  'select acao_id, max(concluido_em) as m from acao_checklist where concluido_em is not null group by acao_id',
  'select acao_id, max(criado_em) as m from impedimentos group by acao_id',
  'select acao_id, max(resolvido_em) as m from impedimentos where resolvido_em is not null group by acao_id',
  'select acao_id, max(alterado_em) as m from acao_prazos group by acao_id',
  'select acao_id, max(coalesce(decidido_em, criado_em)) as m from pedidos_prazo group by acao_id',
];

export async function aplicarMovimentacao(db) {
  if ((await colunas(db, 'acoes')).some(c => c.nome === 'movimentada_em')) return;
  await db.exec('alter table acoes add column movimentada_em text');
  const ultima = new Map();
  for (const sql of FONTES) {
    for (const { acao_id, m } of await db.prepare(sql).all()) {
      if (m && (!ultima.has(acao_id) || m > ultima.get(acao_id))) ultima.set(acao_id, m);
    }
  }
  const atualizar = db.prepare('update acoes set movimentada_em = ? where id = ?');
  for (const [id, m] of ultima) await atualizar.run(m, id);
}
