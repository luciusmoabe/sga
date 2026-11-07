# Arquitetura

## Visão de conjunto

```
Navegador (SPA em JavaScript puro, módulos ES, sem build)
        │  fetch /api/*  (cookie de sessão HttpOnly + CSRF)
        ▼
Express 4 (server/app.js)
  segurança HTTP → compressão → JSON → estáticos → auth → escopo da empresa
  → travas por perfil (Consulta, Plataforma, Membro) → rotas por assunto → tratador de erros
        │
        ▼
Adaptador de banco (server/db.js), interface assíncrona
  ├─ SQLite  (better-sqlite3, WAL, foreign_keys ligado)  → desenvolvimento e demonstração
  └─ PostgreSQL (pg)                                      → produção (Supabase)
```

Autenticação em produção: Supabase Auth (e-mail e senha), mediada pelo servidor Express. Hospedagem prevista: Vercel (função Node + estáticos). Sem ORM: SQL direto.

## Estrutura de pastas

| Pasta | Conteúdo |
| --- | --- |
| `server/` | API Express, adaptadores de banco, migrações, seed e comandos administrativos |
| `public/` | Interface: `index.html`, `estilo.css`, `js/` (uma tela por arquivo), `manifest.webmanifest`, `sw.js`, `imagens/`, `fontes/` |
| `test/` | Testes com o executor nativo do Node (`node --test`); `test/postgres/` usa um cluster PostgreSQL descartável |
| `scripts/` | SQLs de apoio (provisionamento Supabase, limpezas pontuais) e `contagem-registros.js` |
| `docs/` | Esta documentação |
| `certs/` | Certificado CA do Supabase para conexão PostgreSQL verificada |

## Servidor

### Montagem (`server/app.js`)

`createApp(db, { auth })` monta, nesta ordem: cabeçalhos de segurança, compressão, JSON (limite de 200 kb), estáticos, autenticação, escopo da empresa e três travas por perfil. Depois registra as rotas e, por último, o tratador de erros.

As três travas são **listas fechadas**: o perfil Consulta só lê quatro rotas de ações; o Plataforma só acessa `/bootstrap` e `/plataforma/*`; o Membro só acessa `ROTAS_MEMBRO`. Rota nova não precisa fazer nada para ficar fechada a esses perfis.

### Arquivos por responsabilidade

| Arquivo | Responsabilidade |
| --- | --- |
| `index.js` | Ponto de entrada: configura auth, abre o banco, migra (SQLite) ou verifica (PostgreSQL), sobe o servidor |
| `contexto.js` | Auxiliares comuns às rotas: `q`, `q1`, `run`, `hoje`, configuração da reunião, vocabulário |
| `rotas-estrutura.js` | Seções, usuários, equipe |
| `rotas-acoes.js` | Diretrizes, ações, tarefas, impedimentos, redirecionamento, validação, pedidos de prazo |
| `rotas-semana.js` | Bootstrap, atualização semanal, histórico, painel, pauta, detalhe da seção |
| `reunioes.js` | Combinados, configuração, reuniões, decisões, ata |
| `reuniao-registros.js` | Presença, informações e sugestões de revisão da ata |
| `ata-cabecalho.js`, `ata-registros.js` | Cabeçalho/brasões e registros da ata |
| `rotas-avisos.js` | Quadro de avisos |
| `rotas-produtividade.js`, `produtividade.js` | Indicadores de produtividade das unidades |
| `rotas-plataforma.js` | Gestão de empresas (perfil Plataforma) |
| `helpers.js` | Painel, pauta e montagem de cartões |
| `relato.js` | Montagem do relato semanal |
| `logic.js` | Regras puras: datas, semana, fechamento, semáforo |
| `empresa.js` | Escopo da empresa por requisição |
| `auth.js`, `cadastro-chefes.js`, `vincular-identidade.js`, `verificar-auth.js` | Login, sessão, CSRF, criação de contas |
| `seguranca-http.js`, `seguranca-supabase.*` | Cabeçalhos HTTP e endurecimento do Supabase (RLS) |
| `db.js`, `schema.sql` | Esquema, abertura do banco e árvore de seções (CTE recursiva) |
| `migrations.js`, `migration-*.js`, `migrate.js` | Migrações incrementais e comando do migrador |
| `seed.js`, `export-sqlite-to-pg.js` | Dados fictícios e exportação SQLite → PostgreSQL |
| `criar-*.js`, `redefinir-senha.js`, `secao-administrador.js` | Comandos administrativos (veja [operacao.md](operacao.md)) |

### Banco de dados

- A interface dos dois adaptadores é assíncrona: aguarde `get`, `all`, `run`, `seed` e os helpers de árvore.
- Transações: `await db.transaction(async () => { ... })`. Transações aninhadas são rejeitadas. No SQLite, consultas externas aguardam a transação; no PostgreSQL, o cliente é mantido por contexto assíncrono.
- A hierarquia de seções é consultada no banco, sem cache.

### Multi-empresa

A empresa vem **da conta logada**, nunca do cliente (`empresaAtual()` em `empresa.js`). Todo SQL de tabela raiz filtra por `empresa_id`; em `visiveisAcoes` o `a.empresa_id = ?` é sempre o primeiro marcador. `SGC_LINT_EMPRESA=1 npm test` falha em SQL de tabela raiz sem `empresa_id` dentro de uma requisição. Detalhes em [MULTIEMPRESA.md](../MULTIEMPRESA.md).

### Tempo

Nunca chame `new Date()` nas regras: use `agora()` de `server/logic.js`, que obedece a `SGC_NOW`. O fuso de negócio é `America/Bahia`. Datas civis usam aritmética UTC. Exceção: a segurança (sessões, tentativas de login) usa `Date.now()` real.

## Interface

### Estrutura

- `index.html` carrega `js/main.js`, que faz o roteamento por hash (`#/agenda`, `#/acoes-centros`, …).
- Cada tela é uma função `(raiz, { id, q, refresh })` que preenche um elemento. Esse elemento está solto do documento durante a montagem, então use `$('#id', raiz)` e nunca `document.querySelector`.
- Diálogos usam `<dialog>` via `abrirForm` (`js/ui.js`). Eventos usam delegação: `on(raiz, tipo, seletor, fn)`.

### Módulos principais

| Módulo | Função |
| --- | --- |
| `main.js` | Roteamento, menu, abas do celular (`ABAS_MOVEL`), instalação do app |
| `api.js`, `estado.js` | Chamadas à API e estado da sessão |
| `regras.js` | **Fonte única** de status, transições, prioridades, ordem do semáforo — compartilhada com o servidor |
| `datas.js` | Funções de data no fuso de negócio |
| `vocabulario.js`, `vocab.js` | Vocabulário por empresa (puro) e atalhos da tela |
| `telas-chefe.js`, `telas-diretor.js` | Telas por perfil |
| `acao-comum.js` | Detalhe da ação (`abrirAcao`), confirmação de prazo |
| `agenda.js`, `consulta.js`, `equipe.js`, `estrutura.js`, `avisos.js`, `combinados.js` | Telas por assunto |
| `reuniao.js`, `reuniao-historico.js`, `presenca-ordem.js` | Modo Reunião |
| `atas.js`, `ata-*.js`, `pdf-ata.js` | Ata: edição, marcação leve, cabeçalho, PDF (jsPDF no navegador) |
| `produtividade.js`, `plataforma.js`, `senha.js`, `relato-vista.js` | Demais telas |
| `vendor/` | jsPDF e Quill, vendorizados (sem CDN) |

### Estilo

`estilo.css` traz o sistema visual (paleta petróleo, títulos em serifa, semáforo com forma e texto), o modo TV (`body.tv`, classes `.tv-*`), a seção "Celular" e regras de impressão.

### Aplicativo instalável

`manifest.webmanifest` e `sw.js`. O service worker é deliberadamente **sem cache**: o sistema tem sessão e regras sensíveis a versão; ele existe apenas para satisfazer o critério de instalação.

## Segurança

- Sessão HttpOnly persistida por hash; CSRF; limite de tentativas de login. Detalhes em [AUTENTICACAO.md](../AUTENTICACAO.md).
- `configurarAuth()` falha sem configuração institucional. `SGC_AUTH_MODE=demo` aceita `x-user-id` apenas fora de produção e só em loopback.
- Nunca vincule identidades por e-mail e nunca confie em perfil enviado pelo cliente.
- Permissões de perfil e propriedade são conferidas nas rotas (`permit` e verificações internas).
- Migração 4 habilita RLS e revoga acesso público aos objetos no PostgreSQL.

## Testes

`npm test` roda a suíte em SQLite em memória, mais o adaptador PostgreSQL com pool simulado. `npm run test:postgres` cria um PostgreSQL descartável. Veja [operacao.md](operacao.md).
