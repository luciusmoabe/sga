# CLAUDE.md — SGC (protótipo)

Sistema para gerir e acompanhar a produtividade semanal dos Centros do Departamento de Planejamento, Orçamento e Gestão. Uso principal: a reunião presencial de terça-feira, 10h, do Diretor com os chefes de seção (Centros e uma Coordenação), com TV HDMI na sala e notebook já disponível.

Idioma do produto, dos textos da interface, dos commits e dos comentários: português do Brasil. Nomes de código (tabelas, colunas, funções) também estão em português; mantenha.

## Comandos

- `npm install` · `npm start` (porta 3000) · `npm run dev` · `npm run seed` (recria dados fictícios) · `npm test`
- `SGC_NOW=2026-09-22T09:30:00` muda o "agora" do servidor. Use em testes e demonstrações; nunca chame `new Date()` direto nas regras, use `agora()` de `server/logic.js`.
- Sempre rode `npm test` depois de mexer em `server/`. Para a interface não há teste automatizado: suba o servidor e confira no navegador (telas de 1920x1080 para o Modo Reunião e 390 px para o chefe).
- Datas: use as funções de `server/logic.js` e `public/js/datas.js`. O fuso de negócio é `America/Bahia`; datas civis usam aritmética UTC, e timestamps sem offset são interpretados nesse fuso. Não use getters locais de `Date` nas regras.
- Migrações: veja `MIGRACOES.md`. PostgreSQL verifica a versão ao iniciar e exige execução explícita do migrador. SQLite aplica as migrações ao iniciar. Nunca remova dados duplicados automaticamente para instalar uma constraint.
- Integração PostgreSQL: `PG_BIN=/caminho/bin npm run test:postgres` cria um cluster descartável, sem usar `DATABASE_URL`. Veja `TESTES_POSTGRESQL.md`. Execute ao alterar transações, migrações ou SQL compartilhado; `npm test` continua sem exigir PostgreSQL.

## Arquitetura

- `server/`: Express 4 + adaptadores SQLite (better-sqlite3, WAL, `foreign_keys` ligado) e PostgreSQL (pg). ES modules. Sem ORM; SQL direto. A interface de ambos os bancos é assíncrona: aguarde `get`, `all`, `run`, `seed` e os helpers de árvore. Use `await db.transaction(async () => { ... })`; transações aninhadas são rejeitadas. SQLite serializa consultas externas durante uma transação; PostgreSQL mantém o cliente por contexto assíncrono. A hierarquia é consultada no banco, sem cache local.
  - `app.js` só monta o Express, a segurança e as rotas, que ficam por assunto: `rotas-estrutura.js` (seções e usuários), `rotas-acoes.js` (diretrizes, ações e pedidos de prazo), `rotas-semana.js` (sessão, atualização semanal, painel e pauta) e `reunioes.js`; `contexto.js` traz os auxiliares comuns (`q`, `q1`, `run`, `hoje`, configuração da reunião). Rota nova entra em `test/rotas.test.js`; `reunioes.js` combinados, reuniões, decisões e ata; `helpers.js` painel, pauta e montagem de cartões; `logic.js` regras puras (status, transições, prioridades e ordem do semáforo vêm de `public/js/regras.js`, fonte única compartilhada com a interface; não duplique essas regras); `db.js` esquema e árvore de seções (CTE recursiva); `seed.js` dados fictícios.
  - Autenticação: `auth.js` implementa login e-mail/senha via Supabase Auth, sessão HttpOnly persistida por hash, CSRF e limite de tentativas. `configurarAuth()` falha sem configuração institucional; `SGC_AUTH_MODE=demo` permite `x-user-id` somente fora de produção. Nunca vincule identidades por e-mail nem confie em perfil enviado pelo cliente. Permissões de perfil/propriedade continuam nas rotas. Veja `AUTENTICACAO.md`.
  - Segurança usa `Date.now()` real, independentemente de `SGC_NOW`. Migração 4 habilita RLS e revoga acesso público aos objetos Agilis em PostgreSQL/public. Mudanças futuras exigem nova versão, inclusive para os arquivos auxiliares de migração.
- `public/`: SPA em JavaScript puro (módulos ES, sem build), rota por hash em `js/main.js`. Cada tela é uma função `(raiz, {id, q, refresh})` que preenche um elemento. Dialogs com `<dialog>` via `abrirForm` em `js/ui.js`. Delegação de eventos com `on(raiz, tipo, seletor, fn)`.
  - Ao buscar elementos numa tela, use sempre `$('#id', raiz)`: a tela é montada num elemento ainda solto do documento, então `document.querySelector` não o encontra.
  - `estilo.css` traz o sistema visual (paleta petróleo, títulos em serifa, semáforo com forma + texto), o modo TV (`body.tv`, classes `.tv-*`) e regras de impressão.

## Regras de negócio (fonte: plano do projeto; não altere sem combinar com o Diretor)

- Semana = terça a segunda. Fechamento: segunda 18h. `refTerca`: na terça depois das 12h, a referência passa para a terça seguinte.
- Semáforo por seção: vermelho se houver ação atrasada ou impedimento crítico aberto em ação em curso (tabela `impedimentos`; a marca `critico` de relatos semanais antigos ainda vale enquanto a tela do relato a oferecer); amarelo se a atualização não foi enviada ou há ação vencendo em até 2 dias; verde no resto. A cor de uma seção considera as subseções (vale a pior). Limiares ainda a validar com o Diretor.
- Ações: status `a_fazer`, `em_andamento`, `bloqueada`, `concluida`, com transições permitidas em `TRANSICOES` (`server/logic.js`). Concluir exige tempo registrado maior que 0 minutos (erro 422). O chefe registra tempo em minutos. Voltar o status para `a_fazer` exclui todo o tempo já registrado na ação (a ação recomeça do zero) e registra um comentário informando quanto foi excluído.
- Impedimentos pertencem a uma ação (`impedimentos`: descrição, `critico`, `apoio` opcional, autoria) e têm ciclo aberto → resolvido; são histórico, nunca editados nem excluídos (corrigir = resolver e registrar outro). Chefe (na própria árvore), Diretor, Apoio e Administrador registram e resolvem (`POST /api/acoes/:id/impedimentos` e `.../:iid/resolver`); Diretor e Apoio não veem ações internas. `bloquear` só vale com a ação em andamento; `retomar` volta a ação bloqueada para em andamento. Concluir a ação resolve os impedimentos abertos. Excluir a ação apaga os impedimentos dela.
- Diretriz do Diretor vira uma ação por seção destinatária (todos os Centros ou seções escolhidas), sempre com prazo.
- Prazo só muda por pedido (`pedidos_prazo`). O Diretor decide; o Apoio só decide dentro de reunião em andamento (`reuniao_id`), por delegação.
- Perfis: Diretor, Apoio, Chefe (vê a própria seção e as subordinadas) e Administrador (acesso total por decisão do proprietário: vê todas as ações, inclusive internas, e faz tudo o que o Diretor, o Apoio e o Chefe fazem, em qualquer seção, além de gerir contas, perfis e estrutura; nas rotas de atualização semanal informa `secao_id`. Continuam valendo as travas de integridade: sempre um Diretor ativo e Administrador só criado por `npm run admin:criar`). Administrador só nasce por `npm run admin:criar`; a API não cria nem promove. O Diretor cria Chefe e Apoio; o Administrador também cria Diretor. Sempre deve existir um Diretor ativo. Contas com senha definida por terceiros exigem troca no primeiro acesso (`usuarios.trocar_senha`). Rota nova de gestão inclui `'administrador'` em `permit` e, se listar ações, respeita `visiveisAcoes`.
- Seções em árvore, até 3 níveis (`LIMITE_NIVEIS`). Ações internas de subseções (`interna = 1`) não aparecem ao Diretor nem ao Apoio, só contagens no resumo.
- Atualização semanal do chefe é versionada (`secao_id` + `semana` + `versao`); enviar de novo cria nova versão e o histórico é mantido.
- O relato é montado pelo servidor a partir das ações e dos impedimentos da seção e das subseções (`server/relato.js`). Concluídas: de 7 dias antes da reunião até a véspera (dia da Bahia, não UTC). Programadas: do dia da reunião até 7 dias depois. Atrasadas: prazo anterior a hoje e não concluídas (a mesma regra do semáforo). Vencem antes da reunião: em aberto com prazo de hoje à véspera (só na tela do chefe, fora da cópia congelada). Impedimentos: os abertos em ações em curso. `GET /api/atualizacao` devolve o relato ao vivo (com ações internas, marcadas) e `desatualizada` quando mudou desde o último envio; `?resumo=1` pula o relato ao vivo. O envio (`PUT /api/atualizacao` só com `semana` e `observacoes`) recalcula no servidor e congela `feito.snapshot` (formato 2), que **nunca contém ações internas, só contagens**; os campos antigos (`feito.extras`, `proximo`, `impedimentos`, `apoio`) são derivados da cópia para as telas ainda não migradas, e `critico` fica 0 (o semáforo lê os impedimentos). O corpo antigo com listas de texto continua aceito (legado, a remover). Diretor, Apoio e Administrador leem o relato por `public/js/relato-vista.js` (mesma forma nos dois formatos): feito e próximo como foram reportados, impedimentos e apoio como estão abertos agora (`cartoesReuniao` traz `impedimentos` por seção, só de ações visíveis ao Diretor). A ata lista os impedimentos críticos em aberto.
- Combinados da reunião: CRUD completo, mas **arquivar, nunca excluir**. Cada reunião guarda `combinados_snapshot`. Aviso quando há mais de 7 ativos (`LIMITE_COMBINADOS`). Frequência de exibição: `sempre`, `primeira_do_mes`, `quando_mudarem` (tabela `config`).
- Reunião: `em_andamento` → (encerrar) `rascunho` → (enviar) `enviada`. Ata é gerada ao encerrar e Diretor, Apoio e Administrador podem editá-la em rascunho ou depois de enviada, e excluí-la (`DELETE /api/reunioes/:id`, só com a reunião encerrada; apaga as decisões e desvincula ações e pedidos, que permanecem). "Reabrir" só a partir de rascunho.
- Modo Reunião: tela para TV, letras grandes, setas do teclado, semáforo sempre com forma e texto (não só cor).

## Fora do protótipo (fase 2, em ordem sugerida)

1. Login real (contas institucionais, sessão, perfis) e trava de permissões no servidor além do cabeçalho simulado.
2. Lembretes por e-mail (sexta 15h) e envio real da ata; fechamento automático da segunda 18h.
3. Tela do chefe para subseções e ações internas.
4. Relatórios e histórico (produtividade por seção, tempo por ação), anotações privadas do Diretor.
5. Implantação: decidir hospedagem (servidor do órgão ou nuvem) e segurança; trocar SQLite por outro banco só se o volume ou a concorrência pedirem.

## Convenções

- Erros de API: `{ erro: 'mensagem em português' }` com o status HTTP adequado (400, 403, 404, 409, 422). A interface mostra `e.message` ao usuário, então escreva mensagens que orientem o que fazer.
- Toda rota nova valida perfil (`permit`) e propriedade (chefe só mexe na própria seção). Escreva um teste em `test/api.test.js`.
- Textos da interface: verbos claros ("Direcionar ação", "Enviar aos chefes"), o mesmo nome do botão na confirmação. Sem jargão técnico.
- Datas em ISO (`AAAA-MM-DD`) no banco e na API; formate com `br()` na tela.
- Dados de exemplo são fictícios; não inclua dados reais do Departamento no repositório.
