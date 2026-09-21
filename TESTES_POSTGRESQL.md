# Integração PostgreSQL local

```bash
PG_BIN=/caminho/para/postgresql/bin npm run test:postgres
```

Se `initdb` e `pg_ctl` já estiverem no `PATH`, basta `npm run test:postgres`. Os binários precisam pertencer à mesma instalação, com suas bibliotecas e arquivos de suporte. Execute como usuário comum, não como root. A suíte usa sockets Unix e exige macOS ou Linux, além das dependências instaladas do projeto.

A execução validada utilizou PostgreSQL 17.9, Node 24.11.1 e macOS. Os binários foram obtidos separadamente com `@embedded-postgres/darwin-arm64@17.9.0-beta.16`, do projeto [embedded-postgres](https://github.com/leinelissen/embedded-postgres); não foram adicionados às dependências da aplicação. Esse pacote requer seu script `postinstall` para preparar os links das bibliotecas. Também é possível usar uma instalação local de PostgreSQL.

## Isolamento e limpeza

- Cada execução cria um cluster em `/tmp/sgc-pg-*`, com banco novo por cenário e esquema de `server/schema.sql`.
- A conexão é construída explicitamente para o socket do cluster. `DATABASE_URL`, `SGC_DB` e `SGC_MIGRATION_DATABASE_URL` não selecionam o destino. O módulo de banco ainda carrega `.env`, mas essas configurações não são usadas nesta suíte.
- PostgreSQL não escuta TCP. O diretório temporário e o socket restringem o acesso ao usuário local. As duas APIs de teste escutam apenas `127.0.0.1`, em portas dinâmicas.
- Os dados são fictícios, o relógio é fixado e cada API possui seu próprio pool. São duas instâncias Express no mesmo processo Node, com conexões PostgreSQL independentes.
- Ao terminar, inclusive em falhas de asserção, a suíte fecha APIs e pools, encerra PostgreSQL e remove o cluster. Se houver interrupção forçada do processo ou falha ao parar o servidor, o diretório pode permanecer; confirme que o servidor foi encerrado antes de removê-lo.
- A ausência dos binários causa falha explícita. A suíte não substitui PostgreSQL por mocks nem marca esses cenários como ignorados.

## Cenários verificados

1. Migradores simultâneos aplicam cada versão uma vez; a inicialização recusa migrações pendentes.
2. Uma falha SQL após DDL desfaz coluna, índice e registro de versões; nova tentativa funciona.
3. Leituras externas não veem alterações sem commit, e rollback preserva a gravação de outra conexão.
4. Oito solicitações simultâneas criam um pedido; decisões concorrentes têm um vencedor e prazo coerente.
5. Oito atualizações semanais preservam conteúdos e recebem versões distintas.
6. Abertura, encerramento e reabertura concorrentes respeitam a unicidade de reunião ativa.
7. Um trigger provoca falha real na atualização do prazo; a decisão inteira é revertida e a conexão continua utilizável.
8. IDs automáticos de seções e usuários continuam válidos após a carga com IDs explícitos.
9. Índices únicos rejeitam pedidos e reuniões duplicados também em SQL direto.
10. Reuniões legadas duplicadas interrompem migrações sem excluir dados.
11. Ações e decisões concorrentes ao encerramento entram na ata ou são recusadas; revisão concorrente ao envio não altera o conteúdo publicado.

12. Chefes inexistentes e exclusões diretas de registros com histórico são rejeitados; referências adiadas permitem cadastrar seção e chefe juntos.
13. Os catálogos SQLite/PostgreSQL têm as mesmas FKs, destinos e ações de exclusão/atualização.
14. A migração de cascatas antigas preserva os registros e desfaz alterações parciais se uma constraint inesperada for encontrada.
15. A API continua excluindo ações próprias e seus dependentes explicitamente após a migração.

16. RLS e revogação de grants bloqueiam os papéis públicos, inclusive grants por coluna, sequências, função e policies legadas permissivas.
17. Vínculos e sessões institucionais persistem entre conexões e respeitam unicidade.
18. Exportação transacional preserva conteúdo, ordena referências de pais, recusa destino ocupado e desfaz carga após erro.
19. O SQL de demonstração legado também recusa destino ocupado e não modifica permissões.

O runner reporta **21 testes**, contando dois agrupadores e seus **19 cenários**. `npm test` executa separadamente 77 testes e não exige binários PostgreSQL.

## Limites

A suíte usa o adaptador `createPgDb` com pools locais e sem TLS. Verifica RLS/grants localmente, mas não certifica certificados, pooler, permissões efetivas do projeto Supabase, login no tenant Entra, múltiplos processos Node ou carga prolongada. A configuração de TLS é verificada separadamente por testes unitários. A comparação de catálogos cobre as FKs existentes; novas constraints de domínio não fazem parte desta entrega. Nenhum banco existente precisa ser migrado para executar estes testes.
