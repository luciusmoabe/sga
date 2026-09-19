# CLAUDE.md — SGC (protótipo)

Sistema para gerir e acompanhar a produtividade semanal dos Centros do Departamento de Planejamento, Orçamento e Gestão. Uso principal: a reunião presencial de terça-feira, 10h, do Diretor com os chefes de seção (Centros e uma Coordenação), com TV HDMI na sala e notebook já disponível.

Idioma do produto, dos textos da interface, dos commits e dos comentários: português do Brasil. Nomes de código (tabelas, colunas, funções) também estão em português; mantenha.

## Comandos

- `npm install` · `npm start` (porta 3000) · `npm run dev` · `npm run seed` (recria dados fictícios) · `npm test`
- `SGC_NOW=2026-09-22T09:30:00` muda o "agora" do servidor. Use em testes e demonstrações; nunca chame `new Date()` direto nas regras, use `agora()` de `server/logic.js`.
- Sempre rode `npm test` depois de mexer em `server/`. Para a interface não há teste automatizado: suba o servidor e confira no navegador (telas de 1920x1080 para o Modo Reunião e 390 px para o chefe).

## Arquitetura

- `server/`: Express 4 + better-sqlite3 (síncrono, WAL, `foreign_keys` ligado). ES modules. Sem ORM; SQL direto.
  - `app.js` rotas gerais; `reunioes.js` combinados, reuniões, decisões e ata; `helpers.js` painel, pauta e montagem de cartões; `logic.js` regras puras; `db.js` esquema e árvore de seções (CTE recursiva); `seed.js` dados fictícios.
  - Autenticação simulada: o cabeçalho `x-user-id` identifica o usuário. `/api/usuarios-demo` é a única rota sem usuário.
- `public/`: SPA em JavaScript puro (módulos ES, sem build), rota por hash em `js/main.js`. Cada tela é uma função `(raiz, {id, q, refresh})` que preenche um elemento. Dialogs com `<dialog>` via `abrirForm` em `js/ui.js`. Delegação de eventos com `on(raiz, tipo, seletor, fn)`.
  - Ao buscar elementos numa tela, use sempre `$('#id', raiz)`: a tela é montada num elemento ainda solto do documento, então `document.querySelector` não o encontra.
  - `estilo.css` traz o sistema visual (paleta petróleo, títulos em serifa, semáforo com forma + texto), o modo TV (`body.tv`, classes `.tv-*`) e regras de impressão.

## Regras de negócio (fonte: plano do projeto; não altere sem combinar com o Diretor)

- Semana = terça a segunda. Fechamento: segunda 18h. `refTerca`: na terça depois das 12h, a referência passa para a terça seguinte.
- Semáforo por seção: vermelho se houver ação atrasada ou impedimento crítico; amarelo se a atualização não foi enviada ou há ação vencendo em até 2 dias; verde no resto. A cor de uma seção considera as subseções (vale a pior). Limiares ainda a validar com o Diretor.
- Ações: status `a_fazer`, `em_andamento`, `bloqueada`, `concluida`, com transições permitidas em `TRANSICOES` (`server/logic.js`). Concluir exige tempo registrado maior que 0 minutos (erro 422). O chefe registra tempo em minutos.
- Diretriz do Diretor vira uma ação por seção destinatária (todos os Centros ou seções escolhidas), sempre com prazo.
- Prazo só muda por pedido (`pedidos_prazo`). O Diretor decide; o Apoio só decide dentro de reunião em andamento (`reuniao_id`), por delegação.
- Seções em árvore, até 3 níveis (`LIMITE_NIVEIS`). Ações internas de subseções (`interna = 1`) não aparecem ao Diretor nem ao Apoio, só contagens no resumo.
- Atualização semanal do chefe é versionada (`secao_id` + `semana` + `versao`); enviar de novo cria nova versão e o histórico é mantido.
- Combinados da reunião: CRUD completo, mas **arquivar, nunca excluir**. Cada reunião guarda `combinados_snapshot`. Aviso quando há mais de 7 ativos (`LIMITE_COMBINADOS`). Frequência de exibição: `sempre`, `primeira_do_mes`, `quando_mudarem` (tabela `config`).
- Reunião: `em_andamento` → (encerrar) `rascunho` → (enviar) `enviada`. Ata é gerada ao encerrar, editável em rascunho, imutável depois de enviada. "Reabrir" só a partir de rascunho.
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
