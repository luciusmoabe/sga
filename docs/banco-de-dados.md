# Banco de dados

Dois backends com o mesmo esquema lógico: **SQLite** (`better-sqlite3`, arquivo `data/sgc.db`, demonstração e testes) e **PostgreSQL** (`pg`, produção no Supabase). O esquema base está em `server/schema.sql`; as mudanças posteriores são migrações incrementais em `server/migrations.js` e nos arquivos `server/migration-*.js`.

Este documento descreve as tabelas por finalidade. Para colunas exatas, consulte `server/schema.sql` e as migrações; elas são a fonte de verdade.

## Tabelas

### Estrutura e pessoas

| Tabela | Finalidade |
| --- | --- |
| `empresas` | Órgãos atendidos pelo sistema (a Empresa 1 é o órgão original; existe uma empresa interna `plataforma`) |
| `secoes` | Árvore de unidades: `tipo` (`centro`, `coordenacao`, `subsecao`, `diretoria_adjunta`), `pai_id`, `chefe_id`, `na_reuniao`, ativa |
| `usuarios` | Contas: `perfil`, `secao_id`, `trocar_senha`, `ver_outros_centros`, ativo |
| `auth_contas`, `auth_identidades` | Vínculo entre a conta do sistema e a identidade do Supabase Auth (por UUID, nunca por e-mail) |
| `auth_sessoes`, `auth_sessoes_senha` | Sessões (guardadas por hash) e token CSRF |
| `auth_fluxos`, `auth_tentativas` | Fluxos de autenticação e limite de tentativas de login |

### Ações

| Tabela | Finalidade |
| --- | --- |
| `diretrizes` | Direcionamento do Diretor; gera uma ação por seção destinatária |
| `acoes` | A ação: status, prazo, `prazo_original`, prioridade, esforço, autoria (`criado_por`), `responsavel_id`, `interna`, `recebida_em`, `movimentada_em`, `apresentada_em`, `iniciada_em`, `devolucoes`, `demandante_externo`, arquivamento |
| `acao_comentarios` | Comentários, inclusive os automáticos (edição, redirecionamento, mudança de responsável) |
| `tempo` | Tempo registrado em minutos |
| `acao_checklist` | Tarefas da ação (na tela, "Tarefas"): texto, `concluido`, `ordem`, `data`, `responsavel_id` |
| `impedimentos` | Impedimentos da ação: descrição, `critico`, apoio, ciclo aberto → resolvido; histórico, nunca editado |
| `pedidos_prazo` | Pedidos de novo prazo e a decisão |
| `acao_prazos` | Histórico de mudanças de prazo (`origem` = `edicao` ou `pedido`) |
| `acao_vistas` | Ciência de recebimento por pessoa |

### Semana e reunião

| Tabela | Finalidade |
| --- | --- |
| `atualizacoes` | Relato semanal versionado (`secao_id` + `semana` + `versao`) com a cópia congelada |
| `combinados` | Combinados da reunião (arquivados, nunca excluídos) |
| `reunioes` | Reunião: situação (`em_andamento`, `rascunho`, `enviada`), `ata_texto`, `combinados_snapshot` |
| `decisoes` | Decisões tomadas na reunião |
| `reuniao_participantes` | Presença, com nome e seção como estavam no registro e a ordem de seleção |
| `reuniao_informacoes` | Informações registradas durante ou depois da reunião |
| `ata_sugestoes`, `ata_revisoes` | Sugestões de revisão da ata publicada e suas respostas |
| `avisos` | Quadro de avisos com janela de vigência |
| `lembretes_enviados` | Lembretes por e-mail já enviados; a chave única impede repetir |
| `config` | Configuração por empresa (chave/valor): dia e hora da reunião, frequência dos combinados, vocabulário, cabeçalho e brasões da ata |
| `schema_migrations` | Versões de migração aplicadas |

Quase todas as tabelas raiz têm `empresa_id` (padrão 1, por enquanto). Veja [MULTIEMPRESA.md](../MULTIEMPRESA.md).

## Migrações

Cada versão aplicada é registrada em `schema_migrations`. **Nunca altere uma versão já aplicada:** acrescente uma nova. Mudanças futuras exigem nova versão, inclusive para arquivos auxiliares de migração. As migrações são aditivas, por isso um banco mais novo que o código só gera aviso; uma migração pendente impede o início.

| # | Nome | Assunto |
| --- | --- | --- |
| 1 | `acoes_arquivadas` | Arquivamento de ações |
| 2 | `unicidade_pedidos_e_reunioes` | Um pedido aberto por ação e uma reunião ativa |
| 3 | `integridade_referencial` | Chaves estrangeiras alinhadas |
| 4 | `identidade_institucional` | Identidade do Supabase Auth; RLS e revogação de acesso público |
| 5 | `login_email_senha` | Login por e-mail e senha |
| 6 | `autoria_acoes` | Autoria das ações |
| 7 | `sessao_deslizante` | Sessão com renovação |
| 8 | `perfil_administrador` | Perfil Administrador |
| 9 | `impedimentos_da_acao` | Impedimentos |
| 10 | `checklist_da_acao` | Tarefas da ação |
| 11 | `secao_diretoria_adjunta` | Tipo de seção Diretoria Adjunta |
| 12 | `secao_na_reuniao` | Seção dentro ou fora da reunião |
| 13 | `prazos_e_acoes_apresentadas` | Histórico de prazos e ações apresentadas |
| 14 | `acoes_ultima_movimentacao` | `movimentada_em` |
| 15 | `quadro_de_avisos` | Avisos |
| 16 | `registros_e_revisao_de_reuniao` | Presença, informações, sugestões de revisão |
| 17 | `ordem_participantes_reuniao` | Ordem da presença |
| 18 | `acoes_recebidas_e_vistas` | Ação recebida e ciência |
| 19 | `perfil_consulta` | Perfil Consulta |
| 20 | `tarefas_da_acao` | Data e responsável nas tarefas |
| 21 | `membros_e_validacao_de_acoes` | Membro da equipe, responsável e validação |
| 22 | `empresas` | Multi-empresa (Fase 1) |
| 23 | `contracao_multiempresa` | Chaves únicas por empresa (contração) |
| 24 | `perfil_plataforma` | Perfil Plataforma |
| 25 | `produtividade` | Esforço, devoluções e início da execução |
| 26 | `lembretes_enviados` | Registro dos lembretes enviados (um por empresa, semana, tipo e pessoa) |

## Executando migrações

- **SQLite:** aplicadas ao iniciar.
- **PostgreSQL:** o servidor só verifica. Rode o migrador explicitamente:

```bash
SGC_MIGRATION_DATABASE_URL="postgres://..." npm run migrate -- --postgres
npm run migrate -- --sqlite caminho/do/arquivo.db
```

- Um PostgreSQL novo precisa antes do esquema base de `server/schema.sql`.
- Nunca remova dados duplicados automaticamente para instalar uma constraint: verifique, decida com o responsável e só então migre (ver [MIGRACOES.md](../MIGRACOES.md)).
- Antes de migrar produção, conte os registros com `scripts/contagem-registros.js`.
- Mudanças que mexem em transações, migrações ou SQL compartilhado devem passar também por `npm run test:postgres`.

## Scripts SQL de apoio (`scripts/`)

| Arquivo | Uso |
| --- | --- |
| `criar-banco-supabase.sql` | Provisionamento do banco no Supabase |
| `migracao-9-supabase.sql`, `migracao-10-supabase.sql` | Aplicação manual de migrações específicas |
| `diagnostico-supabase.sql` | Diagnóstico |
| `excluir-reuniao-2026-10-02.sql`, `excluir-sugestao-teste-fulano.sql`, `limpar-acoes-piloto.sql` | Limpezas pontuais do piloto. Leia antes de executar: apagam dados |
| `contagem-registros.js` | Contagem de registros por tabela (use antes de migrar produção) |
