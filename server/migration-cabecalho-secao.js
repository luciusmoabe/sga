// Implementação da versão 32: cabeçalho próprio da ata de reunião de cada seção (texto e brasões). Alterações futuras exigem uma
// nova migração.
//
// Só cria uma tabela nova (a versão anterior do código continua funcionando). Fica fora de `config` porque os brasões são imagens
// e `GET /api/config` devolve todas as chaves a todos os perfis. Sem linha, a seção usa o cabeçalho da instituição.
export async function aplicarCabecalhoSecao(db) {
  await db.exec(`create table if not exists secao_cabecalho_ata (
    secao_id integer primary key references secoes(id),
    empresa_id integer not null default 1 references empresas(id),
    ata_cabecalho text not null,
    ata_brasao text not null default '',
    ata_brasao_esq text not null default '',
    alterado_em text not null,
    alterado_por integer references usuarios(id)
  )`);
}
