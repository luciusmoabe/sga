// Implementação da versão 25: dados para os indicadores de produtividade das unidades. Alterações futuras exigem uma nova migração.
//
// Só acrescenta colunas opcionais a `acoes` (a versão anterior do código continua funcionando):
// - esforco: estimativa de esforço da ação ('pequena', 'media' ou 'grande'); vazio vale "média" nos indicadores;
// - devolucoes: quantas vezes a ação foi devolvida para ajuste na validação (retrabalho);
// - iniciada_em: quando a ação foi para "em andamento" pela primeira vez (tempo de execução, separado da espera).
// As ações que já existem ficam com esforço e início vazios e nenhuma devolução registrada.
const COLUNAS = [
  ['esforco', "text check (esforco in ('pequena','media','grande'))"],
  ['devolucoes', 'integer not null default 0'],
  ['iniciada_em', 'text'],
];

async function existentes(db) {
  return db.isPg
    ? (await db.prepare("select column_name as nome from information_schema.columns where table_schema = current_schema() and table_name = 'acoes'").all()).map(c => c.nome)
    : (await db.prepare('pragma table_info(acoes)').all()).map(c => c.name);
}

export async function aplicarProdutividade(db) {
  const colunas = await existentes(db);
  for (const [nome, definicao] of COLUNAS) {
    if (!colunas.includes(nome)) await db.exec(`alter table acoes add column ${nome} ${definicao}`);
  }
}
