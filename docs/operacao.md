# Operação: instalar, configurar, publicar e testar

## Requisitos

- Node.js 22.12 ou superior (testado em 24.11.1).
- Para produção: um projeto Supabase (Auth + PostgreSQL). Para demonstração local: nada além do Node.

## Demonstração local (SQLite, dados fictícios)

```bash
npm install
SGC_AUTH_MODE=demo DATABASE_URL="" npm start
```

Abra http://127.0.0.1:3000. O banco (`data/sgc.db`) é criado com dados fictícios. O modo demo escuta apenas em loopback e é recusado com `NODE_ENV=production` ou na Vercel. Para um banco isolado: `DATABASE_URL="" SGC_DB=/tmp/sgc-demo.db npm run seed`, iniciando depois com as mesmas variáveis.

No PowerShell (Windows), defina as variáveis antes: `$env:SGC_AUTH_MODE="demo"; $env:DATABASE_URL=""; npm start`.

## Variáveis de ambiente

O modelo está em `.env.example`. **Nunca versione `.env`, `.env.local` nem chaves.**

| Variável | Uso |
| --- | --- |
| `PORT` | Porta do servidor (padrão 3000) |
| `SGC_AUTH_MODE` | `supabase` (padrão institucional) ou `demo` (só local) |
| `SGC_PUBLIC_ORIGIN` | Origem pública do sistema; conferida no CSRF |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publishable/anon. Nunca use secret/service_role aqui |
| `SUPABASE_SERVICE_ROLE_KEY` | Exclusiva do servidor: criação de contas e troca de senha |
| `DATABASE_URL` | PostgreSQL da aplicação. Vazia = SQLite |
| `SGC_MIGRATION_DATABASE_URL` | Destino explícito de migrações e comandos administrativos |
| `SGC_PG_CA_FILE`, `SGC_PG_SSL` | CA do servidor e modo de verificação TLS (`certs/supabase-prod-ca-2021.crt`) |
| `SGC_DB` | Caminho do arquivo SQLite |
| `SGC_NOW` | "Agora" fictício, para testes e demonstrações (ex.: `2026-09-22T09:30:00`, interpretado no fuso da Bahia) |
| `SGC_TRUST_PROXY` | Número de proxies confiáveis (IP real no limite de login). Ativo por padrão na Vercel |
| `SGC_ADMIN_SENHA_INICIAL`, `SGC_ADMIN_SUBJECT`, `SGC_ADMIN_SECAO` | Comando `admin:criar` |
| `SGC_NOVA_SENHA` | Comando `senha:redefinir` |
| `SGC_EMPRESA`, `SGC_EMPRESA_SIGLA`, `SGC_EMPRESA_LISTADA` | Comandos de empresa |
| `SGC_LINT_EMPRESA` | `1` faz os testes falharem em SQL de tabela raiz sem `empresa_id` |

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm start` | Sobe o servidor |
| `npm run dev` | Igual, reiniciando ao alterar o servidor |
| `npm run seed` | Recria os dados fictícios (recusado com `DATABASE_URL`) |
| `npm run migrate -- --sqlite ARQUIVO` / `-- --postgres` | Aplica migrações |
| `npm run check:auth` | Confere a configuração do Supabase sem exibir chaves (`-- --online` consulta o projeto) |
| `npm run admin:criar -- --sqlite ARQUIVO "Nome" e-mail` | Cria o primeiro Administrador (`--postgres` para PostgreSQL) |
| `npm run admin:secao -- --sqlite ARQUIVO e-mail ID\|nenhuma` | Vincula/desvincula um Administrador à Diretoria Adjunta |
| `npm run senha:redefinir` | Redefine a senha de uma conta (senha em `SGC_NOVA_SENHA`) |
| `npm run empresa:criar` | Cria uma empresa e o primeiro Diretor (senha provisória com troca obrigatória) |
| `npm run plataforma:criar` | Cria o usuário do perfil Plataforma |
| `npm test` | Suíte principal |
| `npm run test:postgres` | Integração com PostgreSQL descartável |

## Implantação em produção

1. **Supabase:** desabilite o cadastro público, exija confirmação de e-mail, informe a origem pública em *URL Configuration*. Passo a passo em [AUTENTICACAO.md](../AUTENTICACAO.md).
2. **Banco:** provisione o esquema base (`server/schema.sql` / `scripts/criar-banco-supabase.sql`) e rode o migrador. Antes, conte os registros (`scripts/contagem-registros.js`).
3. **Primeiro Administrador:** `npm run admin:criar` com `--postgres`.
4. **Publicação:** Vercel, conforme [VERCEL.md](../VERCEL.md) (Root Directory na raiz, builders do `vercel.json`, Node 22.x ou 24.x, variáveis configuradas no painel).
5. **Homologação:** execute o roteiro de [HOMOLOGACAO.md](../HOMOLOGACAO.md) num projeto Supabase de teste antes de usar o de produção.
6. **Ensaio da reunião:** [ENSAIO_TV.md](../ENSAIO_TV.md).

Pontos de atenção:

- PostgreSQL exige a execução explícita do migrador a cada versão nova; o servidor não migra sozinho.
- Na Vercel, cabeçalhos de cache dos estáticos vêm do `vercel.json`, não do Express.
- **Não crie a 2ª empresa** antes de a migração 23 estar aplicada em produção.
- A chave `service_role` nunca vai para o repositório, o navegador, mensagens ou capturas de tela.

## Testes

- `npm test` (Node test runner, `test/*.test.js`): regras, API, concorrência em SQLite em memória, migrações, isolamento entre empresas e adaptador PostgreSQL com pool simulado.
- `npm run test:postgres`: cluster PostgreSQL temporário, sem usar `DATABASE_URL`. Exige binários locais (`PG_BIN=/caminho/bin`). Veja [TESTES_POSTGRESQL.md](../TESTES_POSTGRESQL.md). Rode ao alterar transações, migrações ou SQL compartilhado.
- Interface: sem teste automatizado. Suba o servidor e confira no navegador em 1920×1080 (Modo Reunião) e 390×844 (celular).
- Sempre rode `npm test` depois de mexer em `server/`. Rota nova entra com teste (`test/rotas.test.js`, `test/api.test.js`; isolamento em `test/isolamento-empresas.test.js`).

## Demonstrar uma data específica

```bash
SGC_NOW=2026-09-22T09:30:00 npm run seed
SGC_NOW=2026-09-22T09:30:00 npm start
```

Use a mesma variável no seed para os dados de exemplo fazerem sentido.

## Instalação como aplicativo

O botão "Instalar aplicativo" aparece na barra lateral quando o navegador dispara `beforeinstallprompt`. Os ícones são gerados a partir de `logo_agilis.png` e `icone_agilis.png` (arte-fonte na raiz, fora de `public/`).

## Solução de problemas

| Sintoma | Causa provável |
| --- | --- |
| Servidor não inicia, fala em migração pendente | PostgreSQL sem migrar: rode `npm run migrate -- --postgres` |
| Servidor recusa iniciar sem configuração | `SGC_AUTH_MODE` padrão exige Supabase; configure o `.env` ou use o modo demo local |
| Login funciona no demo mas não em produção | O modo demo não vale em produção; use contas do Supabase |
| Erro 403 em toda mutação | `Origin` diferente de `SGC_PUBLIC_ORIGIN` ou CSRF ausente |
| Limite de tentativas atinge todos de uma vez | Falta `SGC_TRUST_PROXY` atrás de proxy |
| Datas deslocadas em um dia | Uso de getters locais de `Date`; use as funções de `logic.js` / `datas.js` |
