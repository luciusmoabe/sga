# Login por e-mail e senha com Supabase Auth

O Agilis autentica com o Supabase Auth (e-mail e senha). O navegador envia as credenciais somente à API Express; o servidor as repassa ao Supabase, confere o usuário retornado e descarta senha e tokens. Em seguida emite uma sessão própria, opaca, em cookie `HttpOnly`. O navegador nunca recebe tokens do Supabase, e o frontend não usa chave `anon`, `publishable` ou `service_role`.

## Configuração do Supabase

1. No painel do projeto, em Authentication, use o provedor de e-mail e senha. Desabilite o cadastro público (*Allow new users to sign up*): as contas são criadas pelo administrador.
2. Exija confirmação de e-mail. O Agilis recusa contas sem `email_confirmed_at` e contas anônimas.
3. Em Authentication → URL Configuration, informe a origem pública do Agilis como Site URL.
4. Crie os usuários no painel (Authentication → Users) e anote o **UUID** de cada um (`AUTH_USER_ID`). Redefinição de senha e convites são feitos pelo administrador; o Agilis não tem tela para isso.
5. Configure as políticas de senha e de MFA disponíveis no plano do projeto. O login do Agilis não solicita segundo fator: se o projeto exigir MFA, o login por senha não será concluído.

## Ambiente e implantação

Node.js 22.12 ou superior. Configure no servidor:

| Variável | Valor |
| --- | --- |
| `SGC_AUTH_MODE` | `supabase` (padrão) |
| `SGC_PUBLIC_ORIGIN` | Origem HTTPS fixa, por exemplo `https://agilis.exemplo.gov.br`, sem caminho |
| `SUPABASE_URL` | URL do projeto, por exemplo `https://projeto.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` ou `SUPABASE_ANON_KEY` | Chave pública do projeto. Chaves administrativas (`sb_secret_`, `service_role`) são recusadas |
| `DATABASE_URL` | Conexão PostgreSQL do backend |
| `SGC_MIGRATION_DATABASE_URL` | Destino explícito usado pelo migrador e pelo comando administrativo |
| `SGC_PG_CA_FILE` | Caminho da CA oficial do banco, caso necessário para verificar o certificado |

A aplicação recusa configuração incompleta antes de abrir o banco. HTTPS é obrigatório, exceto loopback em desenvolvimento. O proxy deve preservar o cabeçalho `Origin`, que é comparado com `SGC_PUBLIC_ORIGIN` em login e mutações.

Antes de iniciar, aplique `npm run migrate -- --postgres` no destino configurado. As migrações 4 e 5 criam as tabelas de autenticação e restringem permissões PostgreSQL. A conexão do backend precisa ser proprietária das tabelas ou usar um papel administrado com `BYPASSRLS`; nenhum segredo desse papel vai para o navegador. O modo institucional não cria usuários fictícios: prepare usuários locais, perfis e seções por procedimento administrativo e só então vincule as contas.

## Vincular uma conta

Confira o ambiente com `npm run check:auth`. O comando verifica presença e formato das configurações; não acessa banco ou rede, não altera `.env` e não exibe a chave. Retorna código 1 se houver pendências. Com `npm run check:auth -- --online`, também consulta `/auth/v1/settings` do projeto, enviando apenas a chave pública. Isso não comprova validade das credenciais, existência de usuários nem vínculos.

O vínculo usa **URL do projeto + UUID do usuário Supabase**, nunca o e-mail. Nome, e-mail e claims não atribuem permissões.

Com o destino administrativo configurado e o usuário local já cadastrado:

```bash
node server/vincular-identidade.js --postgres USUARIO_ID SUPABASE_URL AUTH_USER_ID
```

Para um SQLite explicitamente indicado:

```bash
node server/vincular-identidade.js --sqlite /caminho/sgc.db USUARIO_ID SUPABASE_URL AUTH_USER_ID
```

O comando verifica migrações e usuário ativo, é idempotente para o mesmo vínculo e recusa substituição ou apropriação de vínculo existente. Não altera perfil ou seção. Não existe endpoint público de cadastro ou vinculação. Para revogar acesso imediatamente, desative o usuário local (a API consulta o estado ativo e o perfil em toda requisição) e desative a conta no Supabase. Para trocar um vínculo, remova antes as sessões anteriores por procedimento administrativo.

## Sessão e proteção das requisições

- Sessão opaca em cookie `HttpOnly`, `SameSite=Lax`, `Secure` em HTTPS (nome `__Host-sgc_senha`), sem domínio e com caminho `/`. O banco guarda só o hash do token (`auth_sessoes_senha`).
- Sessão dura no máximo uma hora, limitada também pela validade do token Supabase. Não há refresh token; ao expirar, o usuário entra de novo.
- Login exige `Origin` igual à origem configurada e JSON. Mutações exigem também o token CSRF recebido no login/bootstrap. O cabeçalho `x-user-id` é ignorado fora do modo demo.
- Limite de tentativas em janelas de 15 minutos: 10 por e-mail e 100 por origem (`auth_tentativas`). Mensagens de erro não revelam se o e-mail existe.
- Sair remove a sessão do Agilis. Desativações urgentes devem desativar também o usuário local.
- APIs retornam `Cache-Control: no-store`. O cliente limpa seu cache e rejeita respostas pendentes da sessão anterior ao sair.
- O relógio de autenticação é o real do servidor e ignora `SGC_NOW`.
- Limites adicionais de taxa e proteção contra abuso devem ser configurados na infraestrutura de entrada antes da exposição pública.

## Banco e Supabase

O frontend usa exclusivamente a API Express. As migrações 4 e 5 habilitam RLS e revogam acesso de `PUBLIC`, `anon` e `authenticated` às tabelas Agilis, inclusive grants por coluna, sequências e a função `subarvore`. O backend continua autorizado pelas regras da API. Essa proteção segue a [separação de grants e RLS do Supabase](https://supabase.com/docs/guides/api/securing-your-api).

`server/seguranca-supabase.sql` permite reaplicar essa política separadamente. Foi gerado de `server/seguranca-supabase.js` e deve permanecer sincronizado. O escopo é apenas os objetos conhecidos do Agilis em `public`; não altera outros aplicativos, grants futuros do schema nem papéis personalizados. Reveja acessos herdados e funções adicionais na implantação. Se o projeto não usa a Data API, o administrador também pode desabilitá-la.

TLS PostgreSQL valida certificados. `sslmode=require` na URL não desliga essa verificação. Se necessário, configure a CA oficial em `SGC_PG_CA_FILE`; não use `rejectUnauthorized=false`. `SGC_PG_SSL=disable` só é aceito para banco em loopback e é destinado a testes locais.

## Cargas e demonstração

O exportador exige caminhos explícitos e gera arquivo novo, com permissão local `0600`:

```bash
node server/export-sqlite-to-pg.js /caminho/origem.db /caminho/carga.sql
```

Não executa SQL remoto. O SQL gerado e `server/seed-supabase.sql` exigem tabelas de domínio vazias, usam uma transação, ajustam identities antes do commit e não alteram permissões. Não apagam nem substituem dados existentes. Sessões e vínculos não são exportados. A aplicação deve estar parada durante a carga, e o esquema deve estar provisionado e migrado.

Para demonstração apenas local, use `SGC_AUTH_MODE=demo DATABASE_URL="" npm start`. Esse modo é recusado em produção/Vercel e escuta apenas `127.0.0.1`. Não coloque essa instância atrás de proxy público.

## Validação e pendências

### Roteiro de homologação

Execute em ambiente de homologação, depois da configuração e da migração. Registre resultado e data, sem senhas, tokens ou chaves. Todos os itens continuam pendentes de execução no projeto Supabase real.

| Verificação | Resultado esperado |
| --- | --- |
| `npm run check:auth` e opção `--online` | Configuração compatível e projeto responde |
| Conta vinculada, confirmada e ativa | Login conclui e mostra o perfil local correto |
| Conta Supabase sem vínculo | Acesso negado, sem criação automática de usuário |
| Senha errada e e-mail inexistente | Mesma mensagem genérica; bloqueio após excesso de tentativas |
| Diretor, Apoio e Chefe | Cada perfil acessa só as operações autorizadas; Chefe não vê ações internas fora da sua seção/subárvore |
| Tentativa de `x-user-id` sem sessão | API responde 401; lista demo responde 404 |
| Logout e retorno à página anterior | Requisições protegidas exigem novo login |
| Usuário local desativado | Próxima requisição protegida é recusada |
| Sessão expirada | Aplicação solicita novo login |
| Acesso direto Supabase por `anon`/`authenticated` | Tabelas Agilis não ficam acessíveis fora da API Express |

Testes locais cobrem provedor simulado, CSRF, origem, limite de tentativas, vínculo inexistente, sessão expirada/desativada, logout, regras de perfil, cache do cliente e TLS. PostgreSQL real verifica permissões e RLS com papéis `anon`/`authenticated` e sessões em conexões independentes.

Ainda é necessário configurar o projeto Supabase, criar e vincular as contas autorizadas e executar o login real. A tela de entrada não teve inspeção visual.

## Cadastro de chefes pelo Diretor

Em Estrutura → Usuários → Novo chefe com acesso, o Diretor informa nome, e-mail, senha inicial (12–128 caracteres) e seção ativa. Se ela já tiver chefe, o Diretor confirma explicitamente a substituição. O servidor cria a conta confirmada via Auth Admin API, cadastra o perfil fixo `chefe`, vincula o UUID e atribui a seção em transação. Não envia convite nem devolve ou armazena a senha no banco Agilis. A senha não tem troca obrigatória no primeiro acesso nesta versão.

Configure `SUPABASE_SERVICE_ROLE_KEY` no servidor com a chave legada `service_role` do mesmo projeto Supabase. Na Vercel, cadastre-a em Production e faça redeploy. É uma chave administrativa exclusiva do backend; mantenha `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_ANON_KEY` para login. Sem a chave administrativa, os logins existentes continuam funcionando, mas a criação retorna indisponibilidade.

E-mail já existente não é apropriado nem tem a senha substituída. Na substituição, o chefe anterior perde a atribuição à seção, mas seu cadastro e histórico são preservados. A confirmação vale somente para o chefe exibido; alterações concorrentes exigem atualizar a página. Falha na transação local tenta excluir somente a nova conta criada. Se essa compensação falhar, ou uma chamada remota expirar após criar a conta, revise a conta no Supabase antes de repetir; sem vínculo ela não ganha acesso ao Agilis. A criação remota e o banco local não compartilham uma transação distribuída.

Referência: https://supabase.com/docs/reference/javascript/auth-admin-createuser

## Gestão completa de seções e usuários

O Diretor gerencia os cadastros em **Estrutura**:

- **Seções:** criar, listar, editar nome/sigla/tipo/seção superior, atribuir chefia, ordenar, desativar/reativar e excluir. Alterações da hierarquia recusam ciclos e profundidade acima de três níveis; gravações compostas são transacionais.
- **Usuários:** criar Chefe ou Apoio com login, listar e-mail/perfil/seção, editar nome, perfil e atribuição, desativar/reativar e excluir. O Diretor pode editar o próprio nome e login, mas não excluir ou rebaixar seu perfil. Desativar ou mudar para Apoio libera a chefia anterior; reativar não restaura automaticamente essa atribuição.
- **Login:** alterar e-mail e/ou senha pelo botão Login para contas vinculadas. As alterações usam a API administrativa Supabase e revogam as sessões Agilis do usuário. A chave administrativa já exigida para criação é usada também aqui. Alterações remotas de credenciais e persistência local não compartilham transação: se ocorrer falha depois da resposta do Supabase, confira as credenciais no provedor antes de repetir.
- **Exclusão:** somente cadastros sem referências podem ser removidos. Usuários sem histórico podem ser excluídos mesmo com chefia atribuída: as seções são preservadas e ficam sem chefe. Usuários com histórico retornam conflito indicando as categorias e quantidades de registros; seções com subseções, usuários ou registros relacionados também retornam conflito. Nesses casos, use a desativação. Exclusão de usuário remove seus vínculos e sessões Agilis na mesma transação, mas preserva a conta no Supabase Auth, que pode servir a outros aplicativos. Essa conta fica sem acesso ao Agilis.

Contas vinculadas alteram e-mail pelo botão Login para atualizar também o provedor. O cadastro sem login permanece disponível para organizar os dados; não cria credenciais. As operações de escrita exigem Diretor, sessão válida, origem e CSRF. Não há migração de esquema nesta entrega.

## Exclusão de ações pela gestão

Diretor e Apoio podem excluir ações visíveis criadas por Diretor ou Apoio, incluindo demandas originadas em diretrizes. O detalhe recebe `pode_excluir` da API e só mostra o botão quando autorizado. A API verifica a permissão novamente no DELETE. A exclusão remove comentários, tempos e pedidos de prazo da ação em uma transação; ações derivadas impedem remover a ação pai. As atas já gravadas e a diretriz de origem são preservadas. As regras anteriores de acesso do Chefe e de privacidade continuam válidas.

A migração 6 adiciona autoria estruturada (`acoes.criado_por`) e recupera autoria das diretrizes existentes. Ações antigas sem diretriz e sem autor comprovável permanecem sem atribuição: texto livre de comentários não concede permissão de exclusão. Novas ações registram o usuário autenticado; o cliente não escolhe o autor. Aplique a migração no destino explicitamente configurado junto da implantação desta versão.
