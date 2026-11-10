// Implementação da versão 31: na reunião do chefe com a equipe, quem apresenta são as seções subordinadas (e não as pessoas),
// então a decisão passa a poder ser ligada a uma seção, como na reunião do Diretor. Alterações futuras exigem uma nova migração.
//
// Só acrescenta uma coluna (a versão anterior do código continua funcionando).
export async function aplicarReuniaoEquipeSecao(db) {
  if (db.isPg) {
    await db.exec('alter table reuniao_equipe_decisoes add column if not exists secao_id integer references secoes(id)');
    return;
  }
  const colunas = (await db.prepare('pragma table_info(reuniao_equipe_decisoes)').all()).map((c) => c.name);
  if (!colunas.includes('secao_id')) await db.exec('alter table reuniao_equipe_decisoes add column secao_id integer references secoes(id)');
}
