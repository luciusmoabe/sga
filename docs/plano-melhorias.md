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
| 2 | Lembretes e fechamento (G1): motor, migração 26, rota do agendador e modo ensaio | feito, com testes; **envio real aguarda a escolha do provedor** |
| 2 | Agrupar ações por diretriz na tela Ações (G4a) | feito, com testes |
| 2 | Ensaio de TV e ajuste de tamanhos (U2) | depende da TV real |
| 3 | Tendência por unidade e calibragem do semáforo (G2, G3) | decisão (limiares) |
| 3 | Ficha da ação com rota própria e seções recolhíveis (U4) | a fazer |
| 3 | Teste de ponta a ponta (Playwright) com axe (E1, acessibilidade) | a fazer |
| 3 | MFA, trilha de auditoria, LGPD (3.5) | a fazer |
| 4 | Camada de domínio, `html` seguro, perfis sem `CHECK`, paginação (E2–E6) | a fazer |

## Lembretes (G1): o que existe e o que falta

**Pronto:** `server/lembretes.js` (janelas relativas ao dia e à hora da reunião, mensagens, envio único por pessoa, falha libera para nova tentativa), migração 26 (`lembretes_enviados`) e a rota `GET/POST /api/interno/lembretes`, protegida por segredo (`SGC_CRON_SECRET` ou `CRON_SECRET`) e desligada se não houver segredo. `?ensaio=1` e a ausência de transporte só calculam o que seria enviado.

**Falta (decisões do proprietário):** provedor de e-mail (Supabase SMTP ou Resend), remetente institucional, a política de correção depois de segunda 18h e o agendamento (cron de hora em hora na Vercel, que **não** foi acrescentado ao `vercel.json` para não rodar antes da hora). Com o provedor escolhido, falta só implementar o transporte em `escolherTransporte` e ligar `SGC_EMAIL_TRANSPORTE`.

Desenho original:

- Módulo `server/lembretes.js` com função pura `quemLembrar(agora, estado)` (testável com `SGC_NOW`) e um *transporte* plugável. Sem transporte configurado, só registra o que enviaria (modo ensaio).
- Disparo por rota protegida por segredo (`POST /api/interno/lembretes`, chamada por cron da Vercel de hora em hora); idempotente por tabela `lembretes_enviados (empresa_id, semana, tipo, usuario_id)`.
- Três tipos: sexta 15h (todos os chefes sem relato), segunda 12h (só pendentes) e segunda 18h (resumo ao Diretor com quem ficou pendente). Horários vêm da configuração da reunião, como o trilho.
- Migração aditiva nova (26) para `lembretes_enviados`; teste com banco em memória e transporte falso.

## Como validar cada lote

`npm test` (e `SGC_LINT_EMPRESA=1 npm test`), conferência visual em 1440×900 e 390×844 (TV em 1920×1080 quando mexer no Modo Reunião) e, ao mexer em SQL compartilhado, `npm run test:postgres`.
