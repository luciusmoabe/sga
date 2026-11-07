# Referência da API

Todas as rotas ficam sob `/api`, falam JSON e exigem sessão (exceto as de entrada). Erros: `{ "erro": "mensagem" }` com status 400, 403, 404, 409 ou 422 (500 vira "Erro interno").

Mutações exigem o cabeçalho `X-CSRF-Token` (emitido no login) e `Origin` igual à origem pública configurada (veja [AUTENTICACAO.md](../AUTENTICACAO.md)).

**Legenda de perfis:** D = diretor · A = apoio · Adm = administrador · C = chefe · M = membro · Con = consulta · Pl = plataforma. "Qualquer" = qualquer perfil autenticado, ainda sujeito às travas de lista fechada (Consulta, Membro, Plataforma) descritas em [arquitetura.md](arquitetura.md).

Onde a coluna diz "regra na rota", a rota não usa `permit`: a decisão de quem pode é tomada dentro dela (`executa`, `ehAutor`, `visiveisAcoes`).

## Autenticação (`server/auth.js`)

| Método e rota | Quem | Função |
| --- | --- | --- |
| GET `/auth/config` | público | Modo de autenticação e configuração pública |
| GET `/auth/empresas` | público | Empresas listadas na entrada (demonstração) |
| GET `/usuarios-demo` | só modo demo | Perfis de demonstração |
| POST `/auth/entrar` | público | Login (e-mail e senha); `empresa` opcional restringe |
| POST `/auth/trocar-senha` | autenticado | Troca de senha (obrigatória no primeiro acesso de contas criadas por terceiros) |
| POST `/auth/sair` | autenticado | Encerra a sessão |

## Sessão, semana e painel (`rotas-semana.js`)

| Rota | Quem | Função |
| --- | --- | --- |
| GET `/bootstrap` | qualquer | Usuário, empresa, vocabulário, contadores (`acoes_novas`, `acoes_a_validar`), semana de referência e `atualizacao_enviada` (a unidade do chefe/Administrador já enviou nesta semana; `null` para quem não envia) |
| GET `/atualizacao` | C, Adm | Relato ao vivo da seção (`?resumo=1` pula o relato); traz `desatualizada` |
| PUT `/atualizacao` | C, Adm | Envia a atualização (`semana`, `observacoes`); servidor recalcula e congela a cópia |
| GET `/historico` | C, Adm | Histórico de atualizações da seção |
| DELETE `/atualizacoes/:id` | Adm | Exclui uma versão do histórico |
| GET `/painel` | D, A, Adm | Semáforo por unidade |
| GET `/pauta` | D, A, Adm | Pauta da reunião |
| GET `/secoes/:id/detalhe` | D, A, Adm | Detalhe de uma seção |

## Estrutura e pessoas (`rotas-estrutura.js`)

| Rota | Quem | Função |
| --- | --- | --- |
| GET `/secoes` | qualquer | Lista de seções visíveis (traz `membros` na Diretoria Adjunta) |
| POST `/secoes` | D, Adm | Cria seção |
| PATCH `/secoes/:id` | D, Adm | Edita seção (nome, tipo, superior, chefe, `na_reuniao`…); valida a hierarquia |
| DELETE `/secoes/:id` | D, Adm | Exclui seção (pela função `excluirCadastro`, em `crud-cadastros.js`) |
| GET `/usuarios` | D, A, Adm | Lista de contas (`suplente` marcado) |
| POST `/usuarios` | D, Adm | Cria conta |
| POST `/usuarios/chefes` | D, Adm | Cadastra chefe (cria a conta no Supabase Auth) |
| POST `/usuarios/acesso` | D, Adm | Cadastra acesso; `suplente: true` cria suplente |
| PATCH `/usuarios/:id` | D, Adm | Edita perfil, ativação, `ver_outros_centros` |
| PATCH `/usuarios/:id/login` | D, Adm, C | Redefine senha/login sem trocar e-mail |
| DELETE `/usuarios/:id` | D, Adm | Exclui conta (pela função `excluirCadastro`; conta com vínculos de histórico, como ciência de ação, não é excluída: use Desativar) |
| GET `/equipe` | C, Adm | Equipe da seção |
| POST `/equipe` | C, Adm | Cadastra membro da equipe |
| PATCH `/equipe/:id` | C, Adm | Desativa ou reativa membro |

## Diretrizes e ações (`rotas-acoes.js`)

| Rota | Quem | Função |
| --- | --- | --- |
| POST `/diretrizes` | D, A, Adm | Direciona ação a todos os Centros ou seções escolhidas (com prazo) |
| GET `/diretrizes` | D, A, Adm | Últimas ações direcionadas, com ciência por seção |
| POST `/diretrizes/:id/secoes` | D, A, Adm | Acrescenta seções a um direcionamento |
| GET `/acoes` | qualquer | Lista. Filtros: `situacao`, `prazo`, `origem=externa`, `escopo=todos`. Paginação opcional: `limite` (1 a 500) e `offset`; o total da lista vem em `X-Total-Count`. Sem `limite`, a lista inteira |
| POST `/acoes` | C, M, D, A, Adm | Cria ação |
| GET `/acoes/:id` | qualquer | Detalhe, com `pode_*`, `somente_leitura`, `prazos`, `vistas` |
| PATCH `/acoes/:id` | regra na rota | Edita título, detalhamento, prazo, status, prioridade, responsável, esforço |
| DELETE `/acoes/:id` | regra na rota | Exclui (só se não apresentada nem concluída) |
| POST `/acoes/:id/vista` | qualquer | Registra a ciência de recebimento |
| POST `/acoes/:id/tempo` | regra na rota | Registra tempo em minutos |
| POST `/acoes/:id/comentarios` | C, M, D, A, Adm | Comenta |
| POST `/acoes/:id/pedido-prazo` | C, Adm | Pede novo prazo |
| POST `/acoes/:id/impedimentos` | C, M, D, A, Adm | Registra impedimento |
| POST `/acoes/:id/impedimentos/:iid/resolver` | C, M, D, A, Adm | Resolve impedimento |
| GET `/acoes/:id/executores` | C, Adm | Quem pode ser responsável pela ação |
| GET `/acoes/:id/responsaveis` | regra na rota | Quem pode ser responsável por tarefa |
| POST `/acoes/:id/checklist` | regra na rota | Cria tarefa |
| PATCH `/acoes/:id/checklist/:iid` | regra na rota | Edita ou marca tarefa |
| DELETE `/acoes/:id/checklist/:iid` | regra na rota | Exclui tarefa |
| POST `/acoes/:id/redirecionar` | C, D, A, Adm | Muda a seção responsável, levando o histórico |
| POST `/acoes/:id/arquivar` · `/desarquivar` | C, Adm | Arquiva ou restaura |
| POST `/acoes/:id/validar` | C, Adm | Chefe valida ação concluída que delegou |
| POST `/acoes/:id/devolver` | C, D, Adm | Devolve para ajuste, com motivo |
| POST `/acoes/:id/encerrar` | D, Adm | Diretor aceita a ação concluída |
| GET `/tarefas` | qualquer | Tarefas visíveis a quem consulta (usada pela Agenda) |
| GET `/pedidos-prazo` | D, A, Adm | Lista pedidos |
| POST `/pedidos-prazo/:id/decidir` | D, A, Adm | Aprova ou recusa (Apoio só em reunião em andamento) |

> Nas rotas `/acoes/:id/...`, toda gravação bem-sucedida renova `movimentada_em` (middleware em `rotas-acoes.js`).

## Reuniões, combinados e configuração (`reunioes.js`, `reuniao-registros.js`, `ata-cabecalho.js`)

"Gestão" = D, A, Adm.

| Rota | Quem | Função |
| --- | --- | --- |
| GET `/combinados` | qualquer | Lista (ativos e arquivados) |
| POST `/combinados` | gestão | Cria |
| PATCH `/combinados/:id` | gestão | Edita ou arquiva (nunca exclui) |
| GET `/config` | qualquer | Configuração da empresa |
| PUT `/config` | gestão | Frequência dos combinados (`combinados_frequencia`, obrigatória), dia (`reuniao_dia`, 0–6) e hora (`reuniao_hora`, HH:MM) da reunião |
| PUT `/config/vocabulario` | D, Adm | Vocabulário da empresa |
| PUT `/config/ata` | D, A, Adm | Cabeçalho e brasões da ata |
| POST `/reunioes/iniciar` | gestão | Abre a reunião (ou retoma a em andamento) |
| GET `/reunioes` · `/reunioes/:id` | qualquer | Lista e detalhe |
| GET `/reunioes/:id/cartoes` | gestão | Cartões das seções |
| POST `/reunioes/:id/decisoes` | gestão | Registra decisão |
| PATCH/DELETE `/reunioes/:id/decisoes/:decisaoId` | gestão | Edita/exclui decisão (reunião em andamento) |
| POST `/reunioes/:id/acoes` | gestão | Nova ação durante a reunião |
| POST `/reunioes/:id/encerrar` | gestão | Encerra e gera a ata em rascunho |
| POST `/reunioes/:id/reabrir` | gestão | Reabre (só a partir de rascunho) |
| PUT `/reunioes/:id/ata` | gestão | Salva o texto da ata |
| POST `/reunioes/:id/enviar-ata` | gestão | Envia a ata |
| DELETE `/reunioes/:id` | gestão | Exclui reunião encerrada |
| GET `/reunioes/:id/candidatos` | gestão | Pessoas elegíveis à presença |
| PUT `/reunioes/:id/participantes` | gestão | Registra presença (ordem = ordem de seleção) |
| POST/PATCH/DELETE `/reunioes/:id/informacoes[/:infoId]` | gestão | Informações registradas |
| POST `/reunioes/:id/sugestoes` | C | Participante registrado sugere revisão da ata publicada (`tipo`: correcao, inclusao ou supressao) |
| POST `/reunioes/:id/sugestoes/:sugestaoId/responder` | gestão | Responde a sugestão pendente (`status`) |

## Avisos (`rotas-avisos.js`)

| Rota | Quem | Função |
| --- | --- | --- |
| GET `/avisos/atual` | qualquer | Aviso vigente (no máximo um) |
| GET `/avisos` | D, Adm | Lista |
| POST/PATCH/DELETE `/avisos[/:id]` | D, Adm | Gerencia (exclusão definitiva) |

## Avisos no celular (`push.js`)

Diretor, Apoio, Chefe e Administrador. Os demais perfis ficam fora pelas listas fechadas.

| Rota | Função |
| --- | --- |
| GET `/push/config[?endpoint=]` | Se os avisos estão disponíveis, a chave pública e se este aparelho já está ativo |
| POST `/push/assinar` | `{ assinatura }` (a do navegador): grava o aparelho; máximo 5 por pessoa; o mesmo aparelho passa a quem ativou por último |
| POST `/push/cancelar` | `{ endpoint }`: remove o aparelho da própria pessoa |
| POST `/push/teste` | Envia um aviso de teste aos aparelhos da própria pessoa |

## Operação (sem sessão)

| Rota | Quem | Função |
| --- | --- | --- |
| GET `/saude` | público | Confere que o banco responde; para monitores |
| GET/POST `/interno/lembretes` | agendador, com `Authorization: Bearer <segredo>` | Roda os lembretes da semana. Sem `SGC_CRON_SECRET`/`CRON_SECRET` a rota não existe (404). `?ensaio=1` só calcula. Não devolve e-mails |

## Produtividade e plataforma

| Rota | Quem | Função |
| --- | --- | --- |
| GET `/produtividade?de&ate[&secao]` | D, A, Adm, C | Indicadores por unidade; por pessoa só D, Adm e o chefe da unidade |
| GET `/plataforma/empresas` | Pl | Lista empresas |
| POST `/plataforma/empresas` | Pl | Cria empresa e primeiro Diretor |
| PATCH `/plataforma/empresas/:id` | Pl | Edita nome/sigla, lista na entrada, ativa/desativa |

## Convenções de teste

Rota nova entra com teste em `test/rotas.test.js` (e `test/api.test.js` para regras), e com teste de isolamento em `test/isolamento-empresas.test.js` quando tocar tabela raiz.
