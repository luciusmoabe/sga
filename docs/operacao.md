# Operação: instalar, configurar, publicar e testar

## Requisitos

- Node.js 22.12 ou superior (testado em 24.11.1).
- Para produção: um projeto Supabase (Auth + PostgreSQL). Para demonstração local: nada além do Node.

## Demonstração local (SQLite, dados fictícios)

```bash
npm install
npm run demo
```

Abra http://127.0.0.1:3222. O comando é **isolado**: não lê o `.env`, descarta `DATABASE_URL` e usa um SQLite na pasta temporária do sistema (`agilis-demo/demo.db`), então nunca toca o Supabase. `npm run demo -- --zerar` recria o banco com os dados fictícios. Funciona igual no Windows (PowerShell), macOS e Linux. O modo demo escuta apenas em loopback e é recusado com `NODE_ENV=production` ou na Vercel.

> Evite montar a demonstração à mão com `DATABASE_URL=""`: no PowerShell, `$env:DATABASE_URL=""` apaga a variável e o `.env` volta a valer (com o banco real).

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
| `SGC_VAPID_PUBLIC_KEY`, `SGC_VAPID_PRIVATE_KEY`, `SGC_VAPID_SUBJECT` | Chaves dos avisos no celular (veja a seção abaixo) |
| `SGC_LEMBRETES_CANAL` | `push` envia os lembretes aos aparelhos; vazio ou `ensaio` só calcula |
| `SGC_CRON_SECRET` (ou `CRON_SECRET`) | Segredo do agendador dos lembretes; sem ele a rota `/api/interno/lembretes` não existe |
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
| `npm run guia` | Gera o Guia do Usuário em PDF (A4) em `docs/Guia-do-Usuario-Agilis.pdf`: sobe o sistema com dados fictícios, captura as telas no Chrome e monta o documento (`--saida` escolhe outro caminho) |
| `npm run medir -- 20000` | Mede tempo e tamanho das respostas com N ações fictícias (banco em memória) |
| `npm run test:e2e` | Jornadas críticas e acessibilidade (axe) no Chrome, com dados fictícios em memória |
| `npm run push:chaves` | Gera as chaves VAPID dos avisos no celular |

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

## Avisos no celular (notificação push)

Os usuários recebem no próprio celular o lembrete da atualização semanal, sem e-mail. Funciona assim: a pessoa ativa os avisos em **Avisos no celular** (menu lateral ou "Mais"), o navegador pede a permissão e o servidor passa a enviar direto ao aparelho. A mensagem nunca traz dados das ações, só o texto do lembrete.

**Quem recebe:** Diretor, Apoio, Chefe e Administrador. Chefes e Administradores recebem o lembrete (sexta 15h) e as "últimas horas" (segunda 12h) quando a unidade ainda não enviou; o Diretor recebe o resumo no fechamento (segunda 18h). Membros e o perfil Consulta não têm avisos.

### Ligar em produção (uma vez)

1. **Chaves:** rode `npm run push:chaves` e cadastre `SGC_VAPID_PUBLIC_KEY`, `SGC_VAPID_PRIVATE_KEY` e `SGC_VAPID_SUBJECT` nas variáveis do servidor (Vercel: Settings → Environment Variables). A chave privada é segredo. Trocar as chaves depois invalida todos os aparelhos já ativados.
2. **Migração 27:** em PostgreSQL, `npm run migrate -- --postgres` (cria `push_assinaturas`; aditiva).
3. **Canal:** `SGC_LEMBRETES_CANAL=push`.
4. **Agendador:** os lembretes só saem quando algo chama `GET/POST /api/interno/lembretes` com `Authorization: Bearer <segredo>` (cadastre o segredo em `SGC_CRON_SECRET`). Chame **de hora em hora**: o motor decide sozinho o que está na hora e nunca repete o mesmo aviso. Opções:
   - **Vercel Cron** (`crons` no `vercel.json`, `"path": "/api/interno/lembretes"`, `"schedule": "0 * * * *"`). Atenção: no plano gratuito (Hobby) a Vercel só aceita execução diária; com uma vez por dia os lembretes das 12h de segunda não saem (sai o do fechamento). Hoje o `vercel.json` **não** tem o cron.
   - **GitHub Actions agendado** (gratuito; pode atrasar alguns minutos): um workflow com `schedule: cron: '5 * * * *'` e um passo `curl -fsS -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" https://SEU-ENDERECO/api/interno/lembretes`.
   - Teste sem enviar: acrescente `?ensaio=1` à chamada.
5. **Cada pessoa** ativa os avisos no próprio celular e usa **Enviar um aviso de teste** para conferir.

### No celular

- **Android (Chrome):** funciona no navegador; instalar o app (Adicionar à tela inicial) deixa mais confiável.
- **iPhone/iPad (iOS 16.4 ou mais novo):** só funciona com o Agilis **instalado** (Compartilhar → Adicionar à Tela de Início) e aberto pelo ícone. Dentro do Safari comum a opção não existe.
- É preciso **HTTPS** (a Vercel já serve assim). Em `localhost` também funciona, para desenvolvimento.
- Se a pessoa bloquear as notificações, só ela desfaz: nas configurações do navegador ou do aparelho.
- Sair da conta desliga os avisos daquele aparelho para aquela pessoa (aparelho compartilhado); ao entrar de novo, a mesma pessoa os religa sozinha.

## Testes

- `npm test` (Node test runner, `test/*.test.js`): regras, API, concorrência em SQLite em memória, migrações, isolamento entre empresas e adaptador PostgreSQL com pool simulado.
- `npm run test:postgres`: cluster PostgreSQL temporário, sem usar `DATABASE_URL`. Exige binários locais (`PG_BIN=/caminho/bin`). Veja [TESTES_POSTGRESQL.md](../TESTES_POSTGRESQL.md). Rode ao alterar transações, migrações ou SQL compartilhado.
- `npm run test:e2e`: abre o Chrome de verdade (`CHROME_PATH` aponta o executável; sem ele procura nos lugares comuns e **pula** os testes, exceto no CI, onde a falta do Chrome é erro). Cobre as jornadas críticas (Painel, direcionar ação, concluir ação com tempo, atualização semanal, link de ação, reunião do início ao fim) e roda o **axe** (WCAG 2.0/2.1 A e AA) em 25 telas, no computador e no celular: nenhuma violação é aceita. Corrigir uma tela que o axe reprovar vale mais do que registrá-la como "conhecida" (`CONHECIDAS` em `test/e2e/acessibilidade.test.js`).
- - **Injeção de HTML** (`test/e2e/injecao.test.js`): grava uma carga maliciosa em todo campo de texto de usuário (títulos, comentários, nomes, atas…), percorre as telas e reprova se algo virar HTML. Texto de usuário entra na tela sempre por `esc()`; este teste pega o esquecimento.
- Aspecto, TV e celular de verdade: continuam sendo conferidos por olho, em 1920×1080 (Modo Reunião) e 390×844 (celular).
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
| Avisos no celular indisponíveis na tela | Faltam as variáveis `SGC_VAPID_*` no servidor |
| Lembretes não chegam | Sem agendador chamando `/api/interno/lembretes`, `SGC_LEMBRETES_CANAL` diferente de `push`, ou a pessoa não ativou os avisos (o resultado da chamada mostra `semAparelho`) |
| Datas deslocadas em um dia | Uso de getters locais de `Date`; use as funções de `logic.js` / `datas.js` |

## Guia do Usuário em PDF

`npm run guia` gera `docs/Guia-do-Usuario-Agilis.pdf` (os PDFs de `docs/` não são versionados: regere quando as telas ou o texto mudarem).

- **Onde editar:** o texto e as figuras estão em `scripts/guia/conteudo.mjs`; o estilo em `scripts/guia/estilo.css`; a lista de telas capturadas (`TELAS`) em `scripts/guia/gerar.mjs`. Ao acrescentar uma `fig('nome', 'legenda')` no texto, acrescente a captura `nome` em `TELAS`.
- **Dados:** fictícios, num banco em memória, numa sexta-feira às 16h simuladas (a faixa de aviso e o "Sua semana" aparecem). Não toca em nenhum banco real e não usa o `.env`.
- **Papel A4 e margens:** 25 mm à esquerda (encadernação, como na ata) e 20 mm no topo e na direita; 22 mm embaixo, onde fica o rodapé. A capa também respeita as margens (não vai até a borda da folha, para imprimir em qualquer impressora). Área útil: 165 × 255 mm.
- **Conferir as margens:** `python scripts/verificar-margens-pdf.py docs/Guia-do-Usuario-Agilis.pdf` mede o que foi realmente impresso e falha se alguma página invadir as margens (pede `pip install pymupdf pillow`).
- **Sumário:** os números de página são calculados renderizando o documento por partes; um capítulo sempre começa em página nova.
- Requer o Chrome (`CHROME_PATH` aponta o executável).
