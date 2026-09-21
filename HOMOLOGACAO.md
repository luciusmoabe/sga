# Homologação com o Supabase real

Roteiro para provar, num projeto Supabase de homologação, o que os testes locais só simulam: login, contas criadas pelo Administrador, senha provisória com troca obrigatória e as permissões por perfil. Leva de 2 a 3 horas na primeira vez. Quem executa precisa ter acesso ao painel do Supabase e ao computador (ou servidor) onde o Agilis vai rodar.

Regras de segurança para toda a execução:

- Use um projeto Supabase **de homologação**, com contas de teste. Não use o projeto de produção nem dados reais.
- A chave `service_role` cria contas e altera senhas. Ela fica só no ambiente do servidor: não vai para o repositório, para o navegador, para mensagens ou para capturas de tela. Se vazar, gere outra no painel.
- Ao registrar evidências, anote data, resultado e o que foi visto. **Nunca** anote senhas, tokens ou chaves.

## 1. Preparar o projeto Supabase

1. Em **Authentication → Providers**, mantenha só e-mail e senha.
2. Em **Authentication**, desligue o cadastro público (*Allow new users to sign up*). As contas são criadas pelo Agilis.
3. Em **Authentication → URL Configuration**, informe a origem do Agilis como Site URL: `http://localhost:3000` na fase local e a URL HTTPS da Vercel na fase seguinte.
4. Confira a política de senha do projeto. Ela vale para as senhas provisórias e para as trocas: se exigir mais que 12 caracteres ou complexidade, use senhas que a cumpram (veja o item de diagnóstico sobre "senha recusada").
5. Não ative MFA obrigatório nesta fase: o login do Agilis não pede segundo fator, e uma conta com MFA obrigatório não conclui o login.
6. Em **Project Settings → API**, separe: a URL do projeto, a chave pública (*publishable* ou *anon*) e a chave `service_role`.
7. Em **Project Settings → Database**, copie a string de conexão do PostgreSQL. Para o migrador e o comando do Administrador, prefira a conexão direta (porta 5432) à do *pooler* em modo de transação.

## 2. Configurar o ambiente

Copie `.env.example` para `.env` (o arquivo é ignorado pelo git) e preencha:

| Variável | Valor na fase local |
| --- | --- |
| `SGC_AUTH_MODE` | `supabase` |
| `SGC_PUBLIC_ORIGIN` | `http://localhost:3000` (só vale fora de produção; na Vercel, a URL HTTPS exata) |
| `SUPABASE_URL` | URL do projeto de homologação |
| `SUPABASE_PUBLISHABLE_KEY` | Chave pública (nunca a `service_role` aqui) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave `service_role` |
| `DATABASE_URL` | String de conexão do PostgreSQL de homologação |
| `SGC_MIGRATION_DATABASE_URL` | A mesma string, para o migrador e o comando do Administrador |
| `SGC_PG_CA_FILE` | `certs/supabase-prod-ca-2021.crt`, se a conexão pedir a CA do projeto |

Confira sem acessar o banco:

```powershell
npm run check:auth
npm run check:auth -- --online
```

**Esperado:** nenhuma pendência; com `--online`, o projeto responde. O primeiro comando não mostra a chave.

## 3. Preparar o banco

1. Faça um backup e confirme como restaurá-lo (mesmo em homologação).
2. Banco novo: aplique o esquema base `server/schema.sql` pelo editor SQL do Supabase. Banco que já tem dados: pule este passo.
3. Aplique as migrações e confira a versão:

   ```powershell
   npm run migrate -- --postgres
   ```

   **Esperado:** a lista de versões aplicadas termina na 8. Rodar de novo não aplica nada.
4. O backend precisa conectar como dono das tabelas (ou papel com `BYPASSRLS`), porque as migrações 4 a 8 ligam a segurança por linha e revogam o acesso direto de `anon` e `authenticated`. Se a API responder erro de permissão, este é o ponto a revisar.

A migração 8 (perfil Administrador e `usuarios.trocar_senha`) já foi validada em PostgreSQL 18.4, num cluster local e descartável, partindo do esquema antigo e do novo. Aqui ela roda pela primeira vez no PostgreSQL do Supabase.

## 4. Criar o primeiro Administrador

```powershell
$env:SGC_ADMIN_SENHA_INICIAL = "senha provisória de 12 a 128 caracteres"
npm run admin:criar -- --postgres "Nome do Administrador" administrador@exemplo.gov.br
Remove-Item Env:SGC_ADMIN_SENHA_INICIAL
```

**Esperado:** a mensagem "Administrador criado" e o aviso de que a senha precisa ser trocada no primeiro acesso. Ao conferir no painel do Supabase (Authentication → Users), a conta aparece confirmada.

Se a conta já existe no Supabase, use `$env:SGC_ADMIN_SUBJECT = "<UUID>"` no lugar da senha: o comando só vincula a conta.

Depois, suba o servidor:

```powershell
npm start
```

## 5. Testes

Marque cada linha e anote a data. Use janelas anônimas ou navegadores distintos para perfis diferentes.

### A. Administrador e primeiro acesso

| # | Passo | Resultado esperado | OK |
| --- | --- | --- | --- |
| A1 | Abrir `http://localhost:3000` | Tela de entrada com e-mail e senha | |
| A2 | Entrar como Administrador com a senha provisória | Tela "Crie a sua senha para continuar", sem menu | |
| A3 | Trocar o endereço para `#/painel` | A tela de troca continua; nada mais abre | |
| A4 | Enviar senha atual errada | Mensagem "A senha atual não confere" | |
| A5 | Enviar nova senha curta, ou confirmação diferente | Mensagem clara, sem chamar o servidor | |
| A6 | Trocar a senha corretamente | Entra no Painel da semana como Administrador | |
| A7 | Sair e entrar com a senha provisória | Recusado ("E-mail, senha ou acesso inválidos") | |
| A8 | Entrar com a senha nova | Entra direto, sem nova troca | |
| A9 | Conferir o menu | Painel, Ações, Pedidos de prazo, Combinados, Reuniões e atas, Contas e estrutura; sem Direcionar ação nem Iniciar reunião | |

### B. Contas por perfil

| # | Passo | Resultado esperado | OK |
| --- | --- | --- | --- |
| B1 | Em Contas e estrutura, criar um **Diretor** com senha provisória | Conta criada com login; aparece como Diretor | |
| B2 | Criar um **Apoio do Diretor** | Conta criada | |
| B3 | Criar um **Chefe de seção** vinculado a uma seção com subseções | Conta criada; se a seção já tinha chefe, pede confirmação de substituição | |
| B4 | Cada conta nova entra com a senha provisória | Tela obrigatória de nova senha; depois da troca, o menu do perfil | |
| B5 | Entrar como Diretor e tentar criar outro Diretor | O perfil Diretor não é oferecido (a API também recusa) | |
| B6 | Como Diretor, criar um Chefe e um Apoio | Funciona | |
| B7 | Como Diretor, tentar alterar a conta do Administrador | Sem opções de alteração; a API recusa | |
| B8 | Como Administrador, desativar o único Diretor ativo | Recusado, com a mensagem de que é preciso ao menos um Diretor ativo | |
| B9 | Tentar criar ou promover outro Administrador pela tela | Não existe essa opção | |

### C. Permissões por perfil

| # | Passo | Resultado esperado | OK |
| --- | --- | --- | --- |
| C1 | Chefe: abrir Minhas ações | Vê ações da própria seção e das subseções, e de nenhuma outra | |
| C2 | Chefe de outra seção: abrir o mesmo | Não vê as ações da primeira | |
| C3 | Chefe: tentar abrir Painel da semana pelo endereço | Volta ao Início | |
| C4 | Diretor: abrir Ações | Não vê as ações internas das subseções | |
| C5 | Administrador: abrir a mesma lista | Vê também as internas | |
| C6 | Administrador: abrir uma ação | Detalhe sem campo de comentário, sem prioridade, sem arquivar; só "Fechar" | |
| C7 | Administrador: abrir Combinados, Pedidos de prazo, Reuniões e atas | Somente leitura, sem botões de alterar ou decidir | |
| C8 | Apoio: abrir Estrutura pelo endereço | Volta ao Painel | |

### D. Senhas

| # | Passo | Resultado esperado | OK |
| --- | --- | --- | --- |
| D1 | Qualquer usuário: menu → **Alterar senha** | Diálogo com senha atual, nova e confirmação | |
| D2 | Trocar com sessão aberta em outro navegador | A outra sessão cai (401) e o aviso de sessão expirada aparece | |
| D3 | Administrador: Contas e estrutura → usuário → **Alterar e-mail ou senha**, definir senha nova | Sessões da pessoa encerradas; no próximo acesso a troca é obrigatória de novo | |
| D4 | Administrador: usar o mesmo botão na própria conta com senha | Recusado, com orientação de usar "Alterar senha" | |
| D5 | Senha errada e e-mail inexistente | Mesma mensagem genérica; depois de muitas tentativas, bloqueio temporário | |

### E. Segurança

| # | Passo | Resultado esperado | OK |
| --- | --- | --- | --- |
| E1 | Criar uma conta só no painel do Supabase e tentar entrar | Acesso negado; nenhum usuário é criado sozinho | |
| E2 | Desativar um usuário em Contas e estrutura | A próxima requisição dele é recusada | |
| E3 | Enviar `x-user-id` com `curl.exe` sem sessão: `curl.exe -i -H "x-user-id: 1" http://localhost:3000/api/bootstrap` | 401; e `/api/usuarios-demo` responde 404 | |
| E4 | Acessar o banco pela API pública do Supabase: `curl.exe -i "<SUPABASE_URL>/rest/v1/usuarios?select=*" -H "apikey: <chave pública>"` | Nenhuma linha é devolvida (erro de permissão ou lista vazia) | |
| E5 | Deixar uma sessão aberta e inativa por mais de 1 hora | Próxima ação pede novo login e volta à mesma tela | |

### F. Implantação na Vercel (depois de tudo acima)

Siga [VERCEL.md](VERCEL.md): configure as variáveis com a URL HTTPS exata em `SGC_PUBLIC_ORIGIN`, atualize o Site URL do Supabase, faça o deploy e repita A1 a A9 e E3. Confira os passos "Conferir o deployment" desse documento.

## 6. Se algo falhar

| Sintoma | Causa provável |
| --- | --- |
| Servidor não inicia: "Configure SUPABASE_URL…" | Variáveis ausentes ou `SGC_PUBLIC_ORIGIN` sem HTTPS fora do local |
| "Migrações pendentes" ao iniciar | Falta rodar `npm run migrate -- --postgres` |
| "Cadastro indisponível: configure SUPABASE_SERVICE_ROLE_KEY" | Chave `service_role` ausente ou errada no servidor |
| "E-mail já cadastrado ou senha recusada pela política do projeto" | A mesma mensagem cobre e-mail repetido no Supabase e senha que não cumpre a política do projeto (tamanho, complexidade, senha vazada). Confira as duas causas |
| "Requisição de login inválida" ou 403 ao gravar | A origem do navegador difere de `SGC_PUBLIC_ORIGIN` (`localhost` ≠ `127.0.0.1`) |
| Login recusado com senha correta | Conta sem e-mail confirmado, sem vínculo local, usuário inativo ou MFA obrigatório |
| "Troca de senha indisponível…" | O servidor está sem a `service_role` |
| "A senha atual não confere" com a senha certa | O projeto Supabase pode ter alterado a senha por fora do Agilis; redefina pelo botão Login |
| API responde erro de permissão no banco | O papel de conexão não é dono das tabelas nem tem `BYPASSRLS` (etapa 3, item 4) |

Não copie strings de conexão, cookies ou chaves para o relato do problema. Descreva o passo, a mensagem exibida e o horário; o log do servidor permite localizar o resto.

## 7. Ao terminar

- Desative ou apague as contas de teste no Agilis e no painel do Supabase.
- Guarde a tabela preenchida, sem segredos, junto ao projeto.
- Marque em `ESTABILIZACAO.md` o que passou e o que falhou; itens que falharam viram correção antes de qualquer dado real.
- Ainda ficam para depois deste roteiro: o ensaio na TV ([ENSAIO_TV.md](ENSAIO_TV.md)) e as respostas do Diretor às decisões de regra.
