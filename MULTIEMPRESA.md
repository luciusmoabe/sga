# Multi-empresa

O Agilis nasceu para um órgão só. Este documento registra o plano para atender várias empresas (ou órgãos) no mesmo sistema **sem perder os dados do órgão atual**, que passa a ser a Empresa 1.

## Decisões

1. **Quem cria empresas:** só o administrador da plataforma. Não há autocadastro.
2. **Cada pessoa pertence a uma só empresa.** Um e-mail, um login do Supabase Auth, um usuário. Vários vínculos por pessoa ficam para depois (exigiria ligar vários usuários ao mesmo login em `auth_contas`).
3. **O método é o mesmo para todas:** Diretor, chefes, membros, reunião semanal, semáforo. Variam o nome, o logo, o cabeçalho e o brasão da ata, e o dia e a hora da reunião. Vocabulário configurável fica para depois, se as empresas novas pedirem.
4. **O órgão é descoberto pela conta, na entrada** (decisão do proprietário, revista em 05/11/2026: antes a pessoa escolhia numa caixa de seleção). Endereço único; a pessoa digita só e-mail e senha.
5. **Uma base compartilhada**, com `empresa_id` nas tabelas, e não uma base por empresa.
6. **Administrador** continua total *dentro* da empresa. A plataforma ganha um perfil próprio, que cria e gerencia empresas mas não lê os dados de negócio delas.

### Como a entrada acha o órgão
- A tela de entrada pede só e-mail e senha. Depois que o Supabase confirma a identidade, o servidor acha a conta vinculada (`auth_contas`) e o órgão dela. **Não usa o domínio do e-mail**: cada e-mail já pertence a um só órgão, então funciona também com `gmail.com` e com vários órgãos no mesmo domínio.
- Conta inativa, órgão inativo ou e-mail desconhecido respondem como senha errada ("E-mail, senha ou órgão incorretos."), sem revelar a que órgão um e-mail pertence. O limite de tentativas conta por e-mail.
- `empresa` (o identificador) continua aceito no login só como restrição opcional, para endereços antigos com `?empresa=slug`. `GET /api/auth/empresas` segue público (ativas e listadas; `?slug=` devolve também uma empresa fora da lista) e é usado pela demonstração.
- Futuro "uma pessoa em várias empresas": exigirá ligar vários usuários ao mesmo login e, aí sim, voltar a perguntar o órgão quando houver mais de um.

## Fases (cada uma publicada separada)

| Fase | O que é | Estado |
| --- | --- | --- |
| 0 | Backup, ensaio da migração numa cópia e contagem de registros antes e depois (`scripts/contagem-registros.js`) | script pronto; falta rodar em produção |
| 1 | **Banco, só acrescenta** (migração 22): tabela `empresas`, Empresa 1, `empresa_id` nas tabelas raiz, chaves únicas por empresa ao lado das globais | publicada |
| 2 | **Servidor:** todo SQL filtra pela empresa de quem está logado; login com escolha da empresa; **testes de isolamento** (duas empresas, toda rota provada contra acesso cruzado) | pronta e testada localmente (sem migração nova); ainda não publicada |
| 3 | Plataforma: `npm run empresa:criar` (empresa + primeiro Diretor) e depois a tela "Empresas" | comando e tela "Empresas" prontos e testados; a tela exige o perfil `plataforma` (migração 24, ainda não aplicada em produção) e uma conta criada por `npm run plataforma:criar` |
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

## Organograma por empresa

Cada empresa tem a sua própria árvore de seções (já isolada). O que variava era o molde: os nomes (Centro, Coordenação…), a profundidade e quais unidades viram cartão na reunião. Exemplos reais: **Deplan** = Diretoria (o perfil Diretor) → Diretoria Adjunta → Centros → Coordenações, podendo haver Coordenação direto sob a Adjunta; **SGTO** = Superintendência (o perfil do topo) → Diretorias → Coordenações. Plano em etapas, cada uma preservando o comportamento atual como padrão:

1. **Vocabulário por empresa** (pronta, sem migração): `config.vocabulario` (JSON) guarda, por empresa, singular, plural e gênero de cada tipo de unidade e o nome do perfil do topo. Módulo puro compartilhado `public/js/vocabulario.js` (servidor e tela), `public/js/vocab.js` (atalhos da tela), `PUT /api/config/vocabulario` (Diretor e Administrador), vindo no bootstrap (`vocabulario`). O gênero acerta os artigos ("Todos os Centros" / "Todas as Diretorias"). Edição em Configuração → "Nomes das unidades". **Tipos opcionais**: a empresa pode não usar a Coordenação de primeiro nível nem a Diretoria Adjunta (`usa: false`, p. ex. a SGTO, que não tem unidade sem chefe própria): o tipo some dos formulários e dos textos, o servidor recusa criar ou trocar unidade para ele (400) e recusa desligar o tipo enquanto houver unidade ativa dele (409). Centro e Subseção sempre existem. Aplicado nos menus, títulos, "Direcionar ação", Configuração, ata e mensagens da API. **Ainda com o texto fixo**: as demais ocorrências de "Diretor" (por exemplo "Demandada pelo Diretor", "Peça ao Diretor") e algumas legendas; a lista vai sendo trocada à medida que as telas são revisadas.
2. **Posição livre da árvore** (pronta, sem migração): Centro e Coordenação ficam no primeiro nível ou diretamente sob a Diretoria Adjunta; esta fica só no primeiro nível, no máximo uma, e pode ter unidades abaixo; a Subseção fica sob qualquer seção. Os níveis da árvore são configuração da empresa (`vocabulario.niveis`, 2 a 6, padrão 3).
3. **Unidade de acompanhamento** (pronta, **sem migração**: a regra sai do tipo, não de uma marcação): são cartões a Diretoria Adjunta, o Centro e a Coordenação, onde estiverem na árvore (decisão do proprietário para o Deplan: a Adjunta e a Coordenação sob ela também são cartões); a Subseção entra na soma do cartão acima, e Centro ou Coordenação abaixo da Adjunta não somam nela. "Todos os Centros" vale para Centros e Coordenações, sem a Adjunta. Painel, reunião, ata, relato, "Minha equipe" e a visibilidade descem só por Subseções. A SGTO não usa Adjunta nem Coordenação de primeiro nível (tipos opcionais desligados).

