# Multi-empresa

O Agilis nasceu para um órgão só. Este documento registra o plano para atender várias empresas (ou órgãos) no mesmo sistema **sem perder os dados do órgão atual**, que passa a ser a Empresa 1.

## Decisões

1. **Quem cria empresas:** só o administrador da plataforma. Não há autocadastro.
2. **Cada pessoa pertence a uma só empresa.** Um e-mail, um login do Supabase Auth, um usuário. Vários vínculos por pessoa ficam para depois (exigiria ligar vários usuários ao mesmo login em `auth_contas`).
3. **O método é o mesmo para todas:** Diretor, chefes, membros, reunião semanal, semáforo. Variam o nome, o logo, o cabeçalho e o brasão da ata, e o dia e a hora da reunião. Vocabulário configurável fica para depois, se as empresas novas pedirem.
4. **A pessoa escolhe a empresa na tela de entrada** (decisão do proprietário). Endereço único; subdomínio por empresa, só se for preciso.
5. **Uma base compartilhada**, com `empresa_id` nas tabelas, e não uma base por empresa.
6. **Administrador** continua total *dentro* da empresa. A plataforma ganha um perfil próprio, que cria e gerencia empresas mas não lê os dados de negócio delas.

### A escolha da empresa na entrada
- A tela de entrada traz um seletor de empresa (com busca), lembra a última escolha e aceita `?empresa=slug` no endereço. Depois de escolher, mostra o nome e o logo da empresa.
- `GET /api/auth/empresas` é público e lista só as empresas ativas com `listada_no_login = 1`. A empresa que não quiser aparecer na lista deixa o campo em 0 e entra pelo link com o `slug`.
- O login envia `{ empresa, e-mail, senha }`. **O servidor confere** que a conta pertence àquela empresa; a escolha nunca é confiada ao cliente. Erro genérico ("E-mail, senha ou empresa incorretos"), para não revelar a que empresa um e-mail pertence. O limite de tentativas passa a considerar a empresa.
- Como cada e-mail pertence a uma só empresa, a escolha também é uma segunda conferência e já prepara o futuro "uma pessoa em várias empresas".

## Fases (cada uma publicada separada)

| Fase | O que é | Estado |
| --- | --- | --- |
| 0 | Backup, ensaio da migração numa cópia e contagem de registros antes e depois (`scripts/contagem-registros.js`) | script pronto; falta rodar em produção |
| 1 | **Banco, só acrescenta** (migração 22): tabela `empresas`, Empresa 1, `empresa_id` nas tabelas raiz, chaves únicas por empresa ao lado das globais | publicada |
| 2 | **Servidor:** todo SQL filtra pela empresa de quem está logado; login com escolha da empresa; **testes de isolamento** (duas empresas, toda rota provada contra acesso cruzado) | pronta e testada localmente (sem migração nova); ainda não publicada |
| 3 | Plataforma: `npm run empresa:criar` (empresa + primeiro Diretor) e depois a tela "Empresas" | comando pronto e testado (SQLite e PostgreSQL); a tela depende de um perfil novo (migração 23) e ainda não existe |
| 4 | Identidade: seletor na entrada, nome na barra e no título da aba, ata por empresa (cabeçalho e os dois brasões) | pronta (sem migração); logo da empresa na barra fica para depois |
| 5 | **Contração:** troca as chaves únicas globais pelas por empresa (migração 23). **Só depois disso pode existir a 2ª empresa.** Remover o padrão 1 de `empresa_id` fica como endurecimento à parte (exige que todo INSERT, o seed e os testes informem a empresa) | migração 23 pronta e testada (SQLite e PostgreSQL); falta aplicar em produção |

## Regras para não perder dados nem derrubar o sistema

- Migração e publicação seguem **expandir → publicar → contrair**: cada passo é aditivo e a versão anterior do código continua funcionando com o banco já migrado (o servidor tolera banco mais novo, ver `MIGRACOES.md`).
- **Tabelas raiz** (levam `empresa_id`): `secoes`, `usuarios`, `diretrizes`, `acoes`, `combinados`, `avisos`, `reunioes`, `atualizacoes`, `config`. As **filhas** (comentários, tempo, tarefas, prazos, pedidos, impedimentos, ciência, decisões, informações, presenças, sugestões e versões da ata) herdam a empresa da ação ou da reunião.
- O padrão `empresa_id = 1` ainda existe: o código atual sempre informa a empresa, mas ele protege inserts avulsos (seed, testes). Removê-lo é um endurecimento à parte, depois da Fase 5. Até lá, a defesa contra um insert esquecido é a rede de segurança (`SGC_LINT_EMPRESA`) e os testes de isolamento.
- As duas chaves únicas globais (`config.chave` e "uma reunião em andamento", `uq_reuniao_em_andamento`) caem na migração 23, que só deve ser aplicada depois de publicado o código da fase 2 (ele já usa `on conflict(empresa_id, chave)` e a unicidade por empresa).
- Antes de cada migração em produção: backup, ensaio numa cópia (um ramo do Supabase) e `node scripts/contagem-registros.js --postgres > antes.txt`; depois, `depois.txt` e `diff`. Nunca na terça da reunião.
## Como a Fase 2 isola as empresas

- **Contexto da empresa** (`server/empresa.js`): depois de autenticar, `escopoDaEmpresa` fixa o `empresa_id` da conta para a requisição (contexto assíncrono). O número vem sempre da conta no banco, nunca do cliente. `empresaAtual()` falha alto se não houver empresa em curso.
- **Todo SQL de tabela raiz filtra por `empresa_id`** (`from`, `update`, `delete from`, `insert into`). Os escopos de ação (`visiveisAcoes`/`visiveisLeitura`) começam sempre por `a.empresa_id = ?`. Tabelas filhas (tempo, tarefas, impedimentos, pedidos de prazo, decisões…) herdam a empresa da ação ou da reunião, que é sempre carregada já filtrada; consultas que partem de uma filha (ex.: lista de pedidos de prazo) filtram por `a.empresa_id` na junção.
- **Referências cruzadas recusadas ao gravar**: seção, pai, chefe, responsável, reunião e participantes precisam ser da mesma empresa.
- **Rede de segurança** (`SGC_LINT_EMPRESA=1`, ligada nos testes de isolamento): dentro de uma requisição autenticada, SQL que leia ou grave tabela raiz sem `empresa_id` falha na hora. A consulta que precisa olhar todas as empresas (e-mail único no sistema inteiro) leva o marcador `/*global*/`, e fica à vista na revisão. Rode `SGC_LINT_EMPRESA=1 npm test` ao mexer em SQL.
- **Testes** (`test/isolamento-empresas.test.js`, `test/login-empresas.test.js` e o teste PostgreSQL "multi-empresa… duas empresas"): duas empresas no mesmo banco, com o esquema da contração simulado; provam que nenhuma leitura traz dado da outra, que conhecer o número de um registro não dá acesso, que gravações cruzadas são recusadas sem alterar nada, e que configuração, avisos, combinados, reunião em andamento e direcionamentos são independentes.
- Rotas de ação, estrutura, semana, reuniões e avisos, o cabeçalho da ata, os cadastros e os comandos do servidor foram todos escopados. Novas rotas e consultas devem seguir a mesma regra, com teste de isolamento.
- A migração 13 (histórico de prazos) ganhou a própria consulta de árvore: migração não pode depender de código que passou a exigir `empresa_id`, coluna que só existe a partir da versão 22.

- O principal risco é vazamento entre empresas: por isso os testes de isolamento vêm junto da Fase 2, e uma proteção extra no banco (RLS por empresa) fica como evolução.
