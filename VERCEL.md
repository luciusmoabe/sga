# Implantação do Agilis na Vercel

O `vercel.json` publica `public/**` como arquivos estáticos e empacota `server/index.js` como função Node. `/` entrega o HTML, `/api` e `/api/*` usam Express e os demais caminhos procuram arquivos em `public`. A navegação do app usa fragmentos (`#`). Arquivos inexistentes devem retornar 404. A página inicial não precisa abrir o banco para ser servida.

A publicação explícita de estáticos é necessária porque, com `builds`, a Vercel inclui somente as saídas dos builders. Referência: [configuração oficial](https://vercel.com/docs/project-configuration/vercel-json#builds).

## Configurar o projeto

Use a raiz deste repositório como Root Directory. Mantenha os builders do `vercel.json`, sem substituir o Output Directory por `public` (isso removeria a API). Selecione Node.js 22.x ou 24.x. Configure as variáveis no ambiente correspondente (Production ou Preview) e faça novo deployment após alterá-las.

| Variável | Configuração |
| --- | --- |
| `SGC_AUTH_MODE` | `supabase` |
| `SGC_PUBLIC_ORIGIN` | URL HTTPS exata usada no navegador, sem caminho, por exemplo `https://seu-projeto.vercel.app` |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_PUBLISHABLE_KEY` ou `SUPABASE_ANON_KEY` | Chave pública do mesmo projeto |
| `DATABASE_URL` | Conexão PostgreSQL fornecida pelo painel Supabase, acessível pela função |
| `SGC_PG_CA_FILE` | `certs/supabase-prod-ca-2021.crt` se esse for o certificado CA indicado para o banco |

Na Vercel o servidor confia no primeiro proxy (`trust proxy`), de modo que o limite de tentativas de login use o IP real de cada usuário; fora dela, use `SGC_TRUST_PROXY` (número de proxies) somente atrás de um proxy confiável. A interface envia CSP restritiva e demais cabeçalhos de segurança, e as fontes ficam em `public/fontes` (sem Google Fonts).

A CA já é incluída no pacote da função. Não desabilite a verificação TLS. SQLite é recusado na Vercel, inclusive se `DATABASE_URL` estiver ausente. Não configure `SGC_AUTH_MODE=demo`.

Use uma origem estável para homologação. Acessar um alias diferente de `SGC_PUBLIC_ORIGIN` impede login e gravações pela proteção de origem. Configure Preview separadamente, preferencialmente com banco e usuários de homologação.

## Preparar o banco e as contas

Siga [AUTENTICACAO.md](AUTENTICACAO.md) para provisionar o esquema, aplicar as migrações e vincular os usuários. Execute o migrador fora da função, com `SGC_MIGRATION_DATABASE_URL` apontando explicitamente ao destino pretendido. A inicialização PostgreSQL apenas verifica as migrações; não migra nem semeia dados automaticamente.

O usuário do Supabase Auth precisa estar confirmado e vinculado a um usuário local ativo. Criar somente uma conta no Supabase não concede acesso ao Agilis.

## Conferir o deployment

1. Abra `/`, `/estilo.css` e `/js/main.js`: devem retornar 200, com HTML, CSS e JavaScript respectivamente.
2. Abra `/api/auth/config`: deve retornar JSON com `modo: supabase`. Um 500 nessa etapa exige consultar o log da função (variáveis, conexão, CA ou migrações).
3. Faça login com uma conta confirmada e vinculada. Confirme o perfil, uma operação autorizada e o logout.
4. Após sair, confirme que uma API protegida retorna 401 e que um arquivo inexistente retorna 404.

Um deployment com build aprovado ainda pode falhar na inicialização da API. Os testes locais não comprovam configuração, conectividade ou login no projeto remoto. Não copie senhas, strings de conexão ou cookies para logs compartilhados.
