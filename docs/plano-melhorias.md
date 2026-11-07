# Plano de melhorias do Agilis

Origem: [avaliação especializada](avaliacao-especialista.md). Trabalho em branch própria (`melhorias/avaliacao-especializada`), em lotes pequenos, cada um com testes e conferência visual. **Regras de negócio não mudam sem combinar com o Diretor** (ver CLAUDE.md): itens que mexem em regra aparecem aqui como "decisão".

## Estado

| Lote | Item | Situação |
| --- | --- | --- |
| 1 | CI (GitHub Actions: testes, lint de empresa, sintaxe da interface, PostgreSQL) | feito |
| 1 | `GET /api/saude`, `X-Request-Id` e registro estruturado de erros (E7) | feito, com teste |
| 1 | Trilho da semana compacto fora do Início e do Painel (U3) | feito |
| 1 | Selos do cartão da ação: três à vista e o resto em "+N" (U5) | feito |
| 1 | Dica de rolagem nas abas do celular (U8) | feito |
| 2 | Lembretes e fechamento (G1): motor, migração 26, rota do agendador e modo ensaio | feito, com testes |
| 2 | **Avisos no celular (Web Push)** no lugar do e-mail (decisão de 07/11/2026): migração 27, rotas, service worker e tela "Avisos no celular" | feito, com testes; **falta ligar em produção** (chaves VAPID, migração e agendador: docs/operacao.md) e testar num celular real |
| 2 | Agrupar ações por diretriz na tela Ações (G4a) | feito, com testes |
| 2 | Ensaio de TV e ajuste de tamanhos (U2) | depende da TV real |
| 3 | Tendência por unidade e calibragem do semáforo (G2, G3) | decisão (limiares) |
| 3 | **"Sua semana" no Início do chefe e faixa de aviso** (substituem o e-mail dentro do sistema): checklist do que falta antes da reunião, com o prazo e o botão que resolve; faixa nas telas de trabalho enquanto a atualização estiver pendente (da sexta 15h até a reunião); `atualizacao_enviada` no bootstrap | feito, com testes |
| 3 | Hierarquia do cartão da unidade no Painel (U1, G2 em parte): motivo principal em destaque, quatro números fixos (atrasadas, vencem em 2 dias, pedidos de prazo, paradas), detalhe em letra pequena e cartão inteiro clicável | feito. **Falta** o "há quantos dias" do pior atraso, que exige mudar a consulta do painel |
| 3 | Ficha da ação com endereço próprio e seções recolhíveis (U4) | feito: link `#/acao/ID`, ficha na URL (`?acao=ID`), botão "Copiar link da ação", Impedimentos e Comentários recolhíveis. Segue como diálogo (não virou tela cheia) |
| 3 | Teste de ponta a ponta com axe (E1, acessibilidade): 7 jornadas e 25 telas, job `e2e` no CI | feito (puppeteer-core com o Chrome do sistema, sem baixar navegador). O axe achou contraste insuficiente em todas as telas e um rótulo de botão no celular: corrigidos |
| 3 | MFA, trilha de auditoria, LGPD (3.5) | a fazer |
| 4 | **XSS (E2)**: teste dinâmico de injeção de HTML (`test/e2e/injecao.test.js`): grava uma carga maliciosa em 14 tipos de campo, percorre ~40 telas e fichas e reprova se algo virar HTML; verificado por mutação (tirar um `esc()` de propósito o faz falhar). Hoje: nenhuma falha | feito. Substitui o `html` com escape automático, que exigiria reescrever ~60 pontos sem ganho adicional |
| 4 | **Desempenho (E6)**: medição com 20 mil ações (`npm run medir`) e paginação opcional compatível em `GET /api/acoes` (`?limite=&offset=`, total em `X-Total-Count`) | feito. Números abaixo |
| 4 | **Pior atraso no Painel** (G2): "1 ação atrasada · a pior há 5 dias" (`pior_atraso_dias` em `/api/painel`, só a contagem de dias, nunca o título) | feito, com teste |
| 4 | Camada de domínio de `rotas-acoes.js` (E3); perfis sem `CHECK` (E4); PostgreSQL também em desenvolvimento (E5) | **não feito**: refatorações grandes e arriscadas sem ganho imediato para o usuário; ver "Por que ficaram de fora" |

## Lembretes (G1): o que existe e o que falta

> **Decisão (07/11/2026):** nada de e-mail. Os lembretes saem como **notificação push no celular** (ver docs/operacao.md). O e-mail não está implementado.

**Pronto:** `server/lembretes.js` (janelas relativas ao dia e à hora da reunião, mensagens, envio único por pessoa, falha libera para nova tentativa), migração 26 (`lembretes_enviados`) e a rota `GET/POST /api/interno/lembretes`, protegida por segredo (`SGC_CRON_SECRET` ou `CRON_SECRET`) e desligada se não houver segredo. `?ensaio=1` e a ausência de transporte só calculam o que seria enviado.

**Falta (decisões do proprietário):** o agendamento (a Vercel só aceita cron de hora em hora fora do plano gratuito; alternativa: GitHub Actions agendado, veja docs/operacao.md; o `vercel.json` **não** tem cron) e a política de correção depois de segunda 18h.

Desenho original:

- Módulo `server/lembretes.js` com função pura `quemLembrar(agora, estado)` (testável com `SGC_NOW`) e um *transporte* plugável. Sem transporte configurado, só registra o que enviaria (modo ensaio).
- Disparo por rota protegida por segredo (`POST /api/interno/lembretes`, chamada por cron da Vercel de hora em hora); idempotente por tabela `lembretes_enviados (empresa_id, semana, tipo, usuario_id)`.
- Três tipos: sexta 15h (todos os chefes sem relato), segunda 12h (só pendentes) e segunda 18h (resumo ao Diretor com quem ficou pendente). Horários vêm da configuração da reunião, como o trilho.
- Migração aditiva nova (26) para `lembretes_enviados`; teste com banco em memória e transporte falso.

## Como validar cada lote

`npm test` (e `SGC_LINT_EMPRESA=1 npm test`), conferência visual em 1440×900 e 390×844 (TV em 1920×1080 quando mexer no Modo Reunião) e, ao mexer em SQL compartilhado, `npm run test:postgres`.

## Avisos no celular (Web Push): o que existe e o que falta

**Pronto:** migração 27 (`push_assinaturas`), `server/push.js` (chaves VAPID, rotas `/api/push/*`, canal de envio que remove aparelhos encerrados), service worker (`push` e `notificationclick`), tela "Avisos no celular" (`public/js/push.js`; menu lateral e folha "Mais"), `npm run push:chaves`, canal `SGC_LEMBRETES_CANAL=push` no motor de lembretes. Quem não ativou os avisos não é marcado como "enviado" e recebe se ativar antes da reunião.

**Verificado:** testes automáticos (rotas, validação, limite de aparelhos, remoção de assinaturas encerradas, motor) e, no Chrome, ativação e envio de um aviso real aceito pelo serviço do Google. **Não verificado:** a chegada do aviso num celular de verdade (Android e, principalmente, iPhone com o app instalado). Faça esse teste antes de confiar.

**Limites a conhecer:** no iPhone só com o app instalado; o usuário pode bloquear as notificações; o navegador pode atrasar a entrega (a mensagem vale por 6 horas).

## Desempenho medido (E6)

`npm run medir -- N` cria N ações fictícias num banco SQLite em memória e cronometra as respostas (mediana de 3 chamadas; o Diretor vê todas as ações).

| Rota | 2 mil ações | 20 mil ações |
| --- | --- | --- |
| `/api/bootstrap` | 6 ms | 8 ms |
| `/api/painel` | 7 ms | 26 ms |
| `/api/acoes` (Diretor, lista inteira) | 121 ms, 2,4 MB | 1.166 ms, 24 MB |
| `/api/acoes` (um chefe) | 14 ms, 272 KB | 205 ms, 2,7 MB |
| `/api/pauta` | 17 ms | 220 ms |
| `/api/produtividade` | 37 ms | 561 ms |

Conclusão: até alguns milhares de ações abertas nada pesa. O único ponto que cresce sem limite é a lista inteira de ações; por isso a API ganhou paginação opcional. Nenhuma tela usa `limite` ainda: quando a lista passar de ~5 mil ações, as telas Ações devem paginar. Em PostgreSQL remoto a latência por consulta é maior que no SQLite em memória; repita a medição no banco real antes de decidir índices.

## Por que ficaram de fora (E3, E4, E5)

- **Camada de domínio em `rotas-acoes.js` (1.000+ linhas)**: é reorganização sem mudança de comportamento. O risco (regras de autoria, permissão e validação, todas cobertas por testes, mas numa área sensível) supera o ganho hoje. Faça junto com a próxima mudança grande nessas regras, não isoladamente.
- **Perfis sem `CHECK` no banco (E4)**: cada perfil novo exigiu recriar `usuarios` (migrações 8, 19, 21, 24). Em PostgreSQL basta soltar a restrição; em SQLite exige recriar a tabela. Só vale na próxima vez que um perfil novo for necessário.
- **PostgreSQL também em desenvolvimento (E5)**: o CI já roda os testes de PostgreSQL de verdade (job `postgres`); trocar o ambiente local seria conforto, não segurança.
