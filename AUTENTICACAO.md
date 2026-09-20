# Microsoft Entra ID no Agilis

O login institucional usa aplicação Web de um único tenant, código de autorização, PKCE S256, `state` e `nonce`. O servidor valida assinatura RS256 pelas chaves oficiais do tenant, emissor, destinatário, validade e identificadores. A implementação usa `jose`; o navegador não recebe o Client Secret nem os tokens Microsoft. Referências: [fluxo de autorização Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) e [claims de identidade](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference).

## Registro institucional

1. No Microsoft Entra admin center, crie ou selecione um registro de aplicação com contas apenas do diretório institucional (single tenant).
2. Em Authentication, adicione plataforma **Web**, com URI de retorno exatamente `https://SEU-DOMINIO/api/auth/retorno`. Para desenvolvimento, pode registrar separadamente `http://localhost:3000/api/auth/retorno`.
3. Não habilite implicit grant nem trate esse retorno como plataforma SPA. O código é trocado pelo servidor.
4. Anote Directory (tenant) ID e Application (client) ID. Crie um Client Secret, guarde seu **valor** no gerenciador de segredos da implantação e programe sua rotação antes de expirar.
5. Configure atribuição de usuários/grupos à aplicação e as políticas institucionais de MFA/Conditional Access conforme a administração do tenant. O Agilis solicita somente `openid profile`; não solicita permissões Microsoft Graph.

## Ambiente e implantação

Node.js 22.12 ou superior é necessário. Configure no servidor:

| Variável | Valor |
| --- | --- |
| `SGC_AUTH_MODE` | `entra` (padrão) |
| `SGC_PUBLIC_ORIGIN` | Origem HTTPS fixa, por exemplo `https://agilis.exemplo.gov.br`, sem caminho |
| `ENTRA_TENANT_ID` | GUID do diretório institucional |
| `ENTRA_CLIENT_ID` | GUID do registro da aplicação |
| `ENTRA_CLIENT_SECRET` | Valor do segredo, exclusivamente no servidor |
| `DATABASE_URL` | Conexão PostgreSQL do backend |
| `SGC_MIGRATION_DATABASE_URL` | Destino explícito usado pelo migrador e pelo comando administrativo |
| `SGC_PG_CA_FILE` | Caminho da CA oficial do banco, caso necessário para verificar o certificado |

A aplicação recusa configuração incompleta antes de abrir o banco. HTTPS é obrigatório, exceto loopback em desenvolvimento. O callback é derivado exclusivamente de `SGC_PUBLIC_ORIGIN`, nunca de cabeçalhos enviados pelo cliente. O proxy deve preservar `Origin` das requisições; evite registrar query strings do retorno OAuth.

Antes de iniciar, aplique `npm run migrate -- --postgres` no destino configurado. A migração 4 cria vínculos, sessões e fluxos de login e também restringe permissões PostgreSQL. A conexão do backend precisa ser proprietária das tabelas ou usar um papel administrado com `BYPASSRLS`; nenhum segredo desse papel vai para o navegador. O modo institucional não cria usuários fictícios automaticamente: prepare usuários locais, perfis e seções por procedimento administrativo e só então vincule as identidades.

## Vincular uma conta

Antes de vincular contas, confira o ambiente com `npm run check:auth`. O comando verifica presença e formato das configurações e informa a URI de retorno exata; não acessa banco ou rede, não altera `.env` e não exibe segredo ou identificadores. Retorna código 1 se houver pendências.

Depois de configurar os dados institucionais, execute `npm run check:auth -- --online` para conferir a descoberta OIDC pública do tenant. Essa opção só consulta o endpoint oficial Microsoft, sem enviar Client Secret nem credenciais. Os metadados precisam corresponder aos endpoints utilizados pela implementação. A consulta não comprova validade do segredo, existência do Client ID, cadastro da URI ou autorização de uma conta. Referência: [descoberta OIDC Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc#fetch-the-openid-configuration-document).

O vínculo usa **Tenant ID + Object ID do usuário naquele tenant**. O Object ID fica no cadastro do usuário no Entra; não é o Client ID nem o e-mail. Contas convidadas usam o Object ID no tenant institucional. Nome, e-mail e claims de grupos não atribuem permissões automaticamente.

Com o destino administrativo configurado e o usuário local já cadastrado:

```bash
node server/vincular-identidade.js --postgres USUARIO_ID TENANT_ID OBJECT_ID
```

Para um SQLite explicitamente indicado:

```bash
node server/vincular-identidade.js --sqlite /caminho/sgc.db USUARIO_ID TENANT_ID OBJECT_ID
```

O comando verifica migrações e usuário ativo, é idempotente para o mesmo vínculo e recusa substituição ou apropriação de vínculo existente. Não altera perfil ou seção. Não existe endpoint público de cadastro/vinculação. Para revogar acesso imediatamente, desative o usuário local ou remova suas sessões por procedimento administrativo; a API consulta o estado ativo e o perfil em toda requisição. Para trocar um vínculo, revogue as sessões anteriores antes de revisar a identidade cadastrada.

## Sessão e proteção das requisições

- Sessão opaca em cookie `HttpOnly`, `Secure` em HTTPS, `SameSite=Lax`, sem domínio e com caminho `/`. O banco armazena somente o hash do token da sessão.
- Fluxos OAuth duram dez minutos, vinculam o retorno ao cookie do navegador e são consumidos uma única vez. O verificador PKCE fica no banco até consumo/expiração; as tabelas de autenticação são privadas.
- Sessões duram no máximo uma hora, limitadas também pela validade do ID token. Não há refresh token persistido; quando expirar, o usuário entra novamente, aproveitando o SSO Microsoft quando disponível.
- Mutações exigem `Origin` igual à origem configurada e token CSRF recebido no bootstrap. O cabeçalho `x-user-id` é ignorado no modo institucional.
- Sair revoga a sessão do Agilis, sem encerrar outras aplicações Microsoft. Mudanças no tenant não revogam automaticamente sessões locais já emitidas; em desligamentos urgentes, desative também o usuário local. Não há integração CAE/front-channel logout nesta versão.
- APIs retornam `Cache-Control: no-store`. O cliente limpa seu cache e rejeita respostas pendentes da sessão anterior ao sair.
- O relógio de autenticação é o real do servidor e ignora `SGC_NOW`.

## Banco e Supabase

O frontend usa exclusivamente a API Express. Não precisa de chave `anon`, `publishable` ou `service_role` Supabase. A migração 4 habilita RLS e revoga acesso de `PUBLIC`, `anon` e `authenticated` às tabelas Agilis, inclusive grants por coluna, sequências e função `subarvore`. A consulta e atualização pelo backend continuam autorizadas pelas regras da API. Essa proteção segue a [separação de grants e RLS do Supabase](https://supabase.com/docs/guides/api/securing-your-api).

`server/seguranca-supabase.sql` permite reaplicar essa mesma política separadamente. Foi gerado de `server/seguranca-supabase.js` e deve permanecer sincronizado. O escopo é apenas os objetos conhecidos do Agilis em `public`; não altera outros aplicativos, grants futuros do schema nem papéis personalizados. Reveja acessos herdados e funções adicionais do ambiente na implantação. Se o projeto não usa a Data API, ela também pode ser desabilitada pelo administrador no Supabase.

TLS PostgreSQL agora valida certificados. `sslmode=require` na URL não desliga essa verificação. Se necessário, configure a CA oficial em `SGC_PG_CA_FILE`; não use `rejectUnauthorized=false`. `SGC_PG_SSL=disable` só é aceito para banco em loopback e é destinado a testes locais.

## Cargas e demonstração

O exportador exige caminhos explícitos e gera arquivo novo, com permissão local `0600`:

```bash
node server/export-sqlite-to-pg.js /caminho/origem.db /caminho/carga.sql
```

Não executa SQL remoto. O SQL gerado e `server/seed-supabase.sql` exigem tabelas de domínio vazias, usam uma transação, ajustam identities antes do commit e não alteram permissões. Não apagam nem substituem dados existentes. Sessões, fluxos e vínculos institucionais não são exportados. A aplicação deve estar parada durante a carga, e o esquema deve estar provisionado e migrado.

Para demonstração apenas local, use `SGC_AUTH_MODE=demo DATABASE_URL="" npm start`. Esse modo é recusado em produção/Vercel e escuta apenas `127.0.0.1`. Não coloque essa instância atrás de proxy público.

## Validação e pendências

### Roteiro de homologação institucional

Execute em ambiente destinado à homologação, depois do registro, configuração e migração. Registre o resultado observado e a data, sem tokens, códigos OAuth ou segredos. Todos os itens abaixo continuam pendentes de execução no tenant real.

| Verificação | Resultado esperado |
| --- | --- |
| `npm run check:auth` e opção `--online` | Configuração e descoberta compatíveis |
| Conta institucional vinculada e ativa | Login conclui e mostra o perfil local correto |
| MFA/Conditional Access | Políticas do tenant são aplicadas no login conforme definidas pela instituição |
| Conta sem vínculo | Acesso negado, sem criação automática de usuário |
| Diretor, Apoio e Chefe | Cada perfil acessa somente as operações autorizadas; Chefe não vê ações internas fora da sua seção/subárvore |
| Tentativa de `x-user-id` sem sessão | API responde 401; lista demo responde 404 |
| Logout e retorno à página anterior | Requisições protegidas exigem novo login; sessão anterior não volta a funcionar |
| Usuário local desativado | Próxima requisição protegida é recusada |
| Sessão expirada | Aplicação solicita novo login |
| Acesso direto Supabase por `anon`/`authenticated` | Tabelas Agilis não ficam acessíveis fora da API Express |

O registro institucional exige uma sessão administrativa autorizada no Entra. Esta workspace não possui os identificadores nem a origem configurados, e não há ferramenta administrativa conectada para criar o registro. A preparação local não equivale à execução desse roteiro.

Testes locais cobrem tokens assinados/adulterados, claims, CSRF, state/replay, vínculo inexistente, sessão expirada/desativada, logout, regras de perfil, cache do cliente e TLS. PostgreSQL real verifica permissões e RLS com papéis `anon`/`authenticated`, sessões em conexões independentes e cargas com rollback.

Ainda é necessário configurar os identificadores e o segredo do registro institucional, vincular contas autorizadas e executar o login real no tenant, incluindo MFA e políticas de acesso. A nova tela de entrada não teve inspeção visual nesta sessão. Nenhum serviço remoto, conta institucional ou banco existente foi alterado. Limites e rate limiting da aplicação devem ser configurados na infraestrutura de entrada antes da exposição pública.
