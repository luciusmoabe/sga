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
| 2 | Lembretes e fechamento (G1) | decisão + desenho abaixo |
| 2 | Agrupar ações por diretriz (G4a) | a fazer |
| 2 | Ensaio de TV e ajuste de tamanhos (U2) | depende da TV real |
| 3 | Tendência por unidade e calibragem do semáforo (G2, G3) | decisão (limiares) |
| 3 | Ficha da ação com rota própria e seções recolhíveis (U4) | a fazer |
| 3 | Teste de ponta a ponta (Playwright) com axe (E1, acessibilidade) | a fazer |
| 3 | MFA, trilha de auditoria, LGPD (3.5) | a fazer |
| 4 | Camada de domínio, `html` seguro, perfis sem `CHECK`, paginação (E2–E6) | a fazer |

## Desenho dos lembretes (G1)

Decisões necessárias do proprietário: provedor de e-mail (Supabase SMTP ou Resend), remetente institucional e a política de correção depois de segunda 18h.

- Módulo `server/lembretes.js` com função pura `quemLembrar(agora, estado)` (testável com `SGC_NOW`) e um *transporte* plugável. Sem transporte configurado, só registra o que enviaria (modo ensaio).
- Disparo por rota protegida por segredo (`POST /api/interno/lembretes`, chamada por cron da Vercel de hora em hora); idempotente por tabela `lembretes_enviados (empresa_id, semana, tipo, usuario_id)`.
- Três tipos: sexta 15h (todos os chefes sem relato), segunda 12h (só pendentes) e segunda 18h (resumo ao Diretor com quem ficou pendente). Horários vêm da configuração da reunião, como o trilho.
- Migração aditiva nova (26) para `lembretes_enviados`; teste com banco em memória e transporte falso.

## Como validar cada lote

`npm test` (e `SGC_LINT_EMPRESA=1 npm test`), conferência visual em 1440×900 e 390×844 (TV em 1920×1080 quando mexer no Modo Reunião) e, ao mexer em SQL compartilhado, `npm run test:postgres`.
