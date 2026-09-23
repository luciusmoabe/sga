# Migrações do banco

As migrações incrementais ficam em `server/migrations.js`. Cada versão aplicada é registrada em `schema_migrations`. Não altere versões já aplicadas: acrescente uma nova versão.

## Comportamento de inicialização

- SQLite: cria o esquema base e aplica migrações antes de servir requisições. A carga de demonstração também aguarda as migrações.
- PostgreSQL: verifica as versões ao iniciar, sem executar DDL automaticamente. Se houver migrações pendentes, a inicialização falha com uma mensagem orientando a execução do migrador.
- PostgreSQL novo precisa ter o esquema base de `server/schema.sql` provisionado antes da migração. Não use o script de carga de demonstração como migração de um banco existente.

## Execução explícita

SQLite, indicando o arquivo:

```bash
npm run migrate -- --sqlite /caminho/sgc.db
```

Esse comando ignora `DATABASE_URL`, mesmo que esteja definida no `.env`.

PostgreSQL, após configurar `SGC_MIGRATION_DATABASE_URL` no ambiente seguro da implantação:

```bash
npm run migrate -- --postgres
```

O migrador não utiliza `DATABASE_URL` como destino implícito. Não registre a URL com credenciais em código, logs ou histórico de comandos compartilhado.

## Versões

| ID | Nome | Alteração |
| --- | --- | --- |
| 1 | `acoes_arquivadas` | Adiciona `acoes.arquivada` se estiver ausente, preservando as linhas existentes |
| 2 | `unicidade_pedidos_e_reunioes` | Cria índices únicos para um pedido pendente por ação e uma reunião em andamento |
| 3 | `integridade_referencial` | Acrescenta FK adiada de chefe no SQLite e remove quatro cascatas PostgreSQL, preservando os registros |
| 4 | `identidade_institucional` | Cria tabelas de identidade da integração OAuth anterior (Entra), hoje sem uso; em PostgreSQL/public habilita RLS e revoga permissões públicas aos objetos Agilis |
| 5 | `login_email_senha` | Cria `auth_contas` (vínculo com usuário Supabase), `auth_sessoes_senha` e `auth_tentativas`; reaplica RLS e revogações em PostgreSQL/public |
| 6 | `autoria_acoes` | Adiciona `acoes.criado_por` e preenche a autoria das ações vindas de diretrizes; reaplica RLS e revogações em PostgreSQL/public |
| 8 | `perfil_administrador` | Aceita o perfil `administrador` em `usuarios.perfil` e adiciona `usuarios.trocar_senha` (0 nos usuários existentes). No SQLite a tabela `usuarios` é reconstruída, como na versão 3, preservando dados, índices, views e triggers; no PostgreSQL a restrição de perfil é recriada. Reaplica RLS e revogações em PostgreSQL/public |
| 7 | `sessao_deslizante` | Adiciona `auth_sessoes_senha.criada_em` (0 nas sessões já abertas, que expiram no prazo original); reaplica RLS e revogações em PostgreSQL/public |
| 9 | `impedimentos_da_acao` | Cria `impedimentos` (ligados a `acoes`, com `critico`, `apoio`, autoria e ciclo aberto → resolvido) e seus índices, inclusive o parcial dos abertos; em PostgreSQL/public reaplica RLS e revogações. Não altera nem apaga dados existentes; os impedimentos em texto dos relatos já enviados continuam nesses relatos |

A unicidade das versões semanais já faz parte do esquema base (`secao_id`, `semana`, `versao`). Os destinos e as regras de exclusão/atualização de todas as FKs do esquema migrado são comparados automaticamente entre SQLite e PostgreSQL.

## Integridade referencial na versão 3

`secoes.chefe_id` passa a exigir um usuário existente também no SQLite, com verificação adiada até o commit, como no PostgreSQL. Isso permite cadastrar seção e usuário na mesma transação. Se uma seção antiga apontar para um chefe inexistente, a migração informa os IDs das seções e interrompe a execução sem corrigir ou excluir registros automaticamente.

PostgreSQL passa a usar `ON DELETE NO ACTION`, como SQLite, nos vínculos de comentários, tempo e pedidos com ações, e de decisões com reuniões. Uma exclusão direta do registro pai é recusada enquanto existirem dependentes. A API continua removendo explicitamente os dependentes na mesma transação quando a exclusão de uma ação própria é autorizada. Scripts externos que dependiam das cascatas precisam fazer essa remoção explícita; não reaplique o esquema base para atualizar bancos existentes.

SQLite reconstrói `secoes`, preservando colunas, registros, índices, views e triggers. O migrador usa a fila da conexão e `BEGIN IMMEDIATE`; desativa FKs antes da transação, executa `foreign_key_check` antes do commit e reativa a fiscalização ao terminar, inclusive após rollback. Consultas externas na mesma conexão aguardam todo esse procedimento. A implantação deve pausar outras instâncias durante a migração e ter espaço para a cópia temporária da tabela. Procedimento baseado na [documentação de reconstrução de tabelas SQLite](https://www.sqlite.org/lang_altertable.html#making_other_kinds_of_table_schema_changes).

No PostgreSQL, as quatro constraints são substituídas dentro da transação de migração. Definições inesperadas interrompem a operação para revisão, e as substituições anteriores são desfeitas. A distinção entre cascata e exclusão explícita segue as [regras de chaves estrangeiras PostgreSQL](https://www.postgresql.org/docs/17/ddl-constraints.html#DDL-CONSTRAINTS-FK).

Esta versão alinha os vínculos existentes. Não acrescenta novas regras de domínio para status/prioridade, unicidade de chefia ou ciclos hierárquicos, nem novos vínculos para `diretrizes.reuniao_id` e `pedidos_prazo.reuniao_id`, que continuam sem FK nos dois esquemas.

## Atualização de ambiente existente

Para as versões 4 e 5, configure o projeto Supabase Auth e prepare os vínculos antes de reabrir a aplicação. A migração PostgreSQL altera permissões: acessos diretos de `anon` e `authenticated` deixam de funcionar. O backend deve usar papel proprietário ou administrado com `BYPASSRLS`; veja [AUTENTICACAO.md](AUTENTICACAO.md). Dados existentes não são vinculados por e-mail automaticamente. Nenhuma sessão nem identidade fictícia é criada pela migração.

1. Faça backup e confirme o procedimento de restauração.
2. Teste a migração em uma cópia isolada dos dados.
3. Pause as gravações da aplicação antiga durante a atualização do esquema.
4. Execute o comando com o destino explícito e confira o resultado.
5. Inicie a nova versão e valide abertura/encerramento da reunião, pedidos de prazo e atualizações.

Todas as migrações pendentes de uma execução ficam na mesma transação. Falhas desfazem tanto o DDL executado nessa transação quanto os registros de versão. No PostgreSQL, uma trava transacional coordena execuções simultâneas do migrador. Em SQLite, a fila coordena a conexão local; a implantação deve ter um único processo migrador.

Se houver duplicidades antigas, o comando informa os IDs envolvidos e interrompe a migração. Não exclui pedidos, não encerra reuniões e não escolhe automaticamente um registro vencedor. Consultas para diagnóstico:

```sql
select acao_id, count(*)
from pedidos_prazo
where status = 'pendente'
group by acao_id
having count(*) > 1;

select id, data, semana
from reunioes
where status = 'em_andamento'
order by id;
```

A resolução desses registros exige revisão do histórico e uma decisão registrada. Após corrigir a inconsistência, execute novamente o migrador. Reexecuções após sucesso não reaplicam versões.

Não há comando automático de downgrade. Para reverter uma implantação, avalie a compatibilidade da versão anterior com os índices novos; se for necessário restaurar o banco, use o backup validado. Não remova linhas de `schema_migrations` para forçar uma reaplicação.

## Validação desta entrega

Foram testados SQLite em memória e arquivos temporários: idempotência, esquema antigo, preservação dos registros, bloqueio de duplicidades, rollback de DDL e destino explícito no CLI. A integração em PostgreSQL 17.9 local também validou migradores simultâneos com pools independentes, rollback de DDL e do registro de versões, bloqueio de dados duplicados e índices únicos em escritas diretas. Consulte [TESTES_POSTGRESQL.md](TESTES_POSTGRESQL.md) para repetir a validação. O ensaio com cópia dos dados e permissões do ambiente de implantação continua necessário.

Referências: [travas transacionais PostgreSQL](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS) e [índices parciais](https://www.postgresql.org/docs/current/indexes-partial.html).
