// Implementação da versão 23: multi-empresa, fase de CONTRAÇÃO (ver MULTIEMPRESA.md). Alterações futuras exigem uma nova migração.
//
// Troca as duas chaves únicas globais pelas por empresa, que já existem desde a versão 22 e que o código atual usa
// (`on conflict(empresa_id, chave)`): `config` passa a ter chave primária (empresa_id, chave) e cai o índice que permitia uma única
// reunião em andamento no sistema inteiro (continua valendo uma por empresa, `uq_reuniao_em_andamento_empresa`).
// Só depois desta versão uma 2ª empresa pode existir. Não altera nem apaga dados.
//
// O padrão `empresa_id = 1` NÃO sai aqui: removê-lo é um endurecimento à parte (exige que todo INSERT informe a empresa).
// Versões do código anteriores à fase 2 não funcionam com este esquema (o upsert por `chave` deixa de existir).
export async function aplicarContracao(db) {
  await db.exec('drop index if exists uq_reuniao_em_andamento');
  if (db.isPg) {
    await db.exec(`do $contracao$ begin
      if exists (select 1 from pg_constraint where conrelid = 'config'::regclass and conname = 'config_pkey' and array_length(conkey, 1) = 1) then
        alter table config drop constraint config_pkey;
        alter table config add primary key (empresa_id, chave);
      end if;
    end $contracao$`);
    await db.exec('drop index if exists uq_config_empresa_chave');
    return;
  }
  const pk = (await db.prepare('pragma table_info(config)').all()).filter((c) => c.pk > 0).map((c) => c.name);
  if (pk.length === 1 && pk[0] === 'chave') {
    await db.exec(`create table config_nova (
      empresa_id integer not null default 1 references empresas(id),
      chave text not null,
      valor text not null,
      primary key (empresa_id, chave)
    );
    insert into config_nova (empresa_id, chave, valor) select empresa_id, chave, valor from config;
    drop table config;
    alter table config_nova rename to config;`);
  }
}
