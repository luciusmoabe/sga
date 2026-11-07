# Agilis — Avaliação especializada e proposta de melhorias

**Escopo:** produto (gestão), UX/UI, acessibilidade, engenharia, segurança e adoção.
**Base da análise:** leitura do código (≈ 11,6 mil linhas de aplicação e 6,6 mil de testes), execução da suíte (283 testes, todos passando), navegação por todas as telas principais em ambiente de demonstração (desktop 1440×900, TV 1920×1080 e celular 390×844) e as regras de negócio documentadas.
**O que esta avaliação não cobre:** uso com pessoas reais, dados reais, desempenho sob carga, a TV da sala e o projeto Supabase de produção. Onde a conclusão é hipótese e não observação, está marcado como **[verificar]**.

---

## 1. Resumo executivo

**Veredito:** o Agilis é um protótipo **bem acima da média** em rigor de regras, permissões e testes, e já está pronto para um **piloto controlado**. Ainda não está pronto para escalar (muitos órgãos, muitos usuários) sem tratar os pontos abaixo.

**O ponto forte é raro:** o sistema foi desenhado em torno de um *ritual* (a reunião de terça), não de um "gerenciador de tarefas" genérico. O relato semanal montado pelo servidor, o semáforo com forma e texto, a ata gerada e as travas de integridade mostram maturidade de produto.

**O maior risco não é técnico, é de adoção:** todo o ciclo depende de os chefes atualizarem as ações toda semana, e hoje **nada os lembra de fazer isso** (sem e-mail, sem notificação, sem fechamento automático). Um sistema desses vive ou morre pela regularidade.

### As cinco melhorias de maior retorno

| # | Melhoria | Por quê |
| --- | --- | --- |
| 1 | **Lembretes e fechamento automático** (sexta 15h, segunda 12h, segunda 18h) | Sustenta a regularidade, que é o que dá valor ao Painel |
| 2 | **Calibrar o semáforo e mostrar tendência** (histórico por unidade) | Hoje o vermelho tende a saturar e o Painel é só uma "foto" da semana |
| 3 | **Agrupar ações por diretriz** e ligá-las a um objetivo | A lista repete a mesma ação por seção; falta o "para quê" estratégico |
| 4 | **Rede de proteção de engenharia**: CI, teste de ponta a ponta e acessibilidade automatizada | A interface (≈ 7 mil linhas) não tem nenhum teste; é a parte que mais muda |
| 5 | **Piloto com métricas de adoção** e ensaio real na TV | Valida premissas antes de investir em escala |

---

## 2. O que está bom e deve ser preservado

- **Regras de negócio explícitas e testadas.** Transições de status, validação em duas etapas, histórico de prazos, impedimentos como histórico imutável, combinados que nunca se apagam. É o que dá confiança a um sistema de gestão.
- **Relato semanal automático.** Reduz a digitação do chefe a quase zero. Essa é a decisão de UX mais importante do produto: **preservar e ampliar** (veja 4.1).
- **Semáforo nunca só por cor.** Forma + texto + cor, em qualquer tela, inclusive na TV.
- **Segurança acima do padrão de protótipo:** sessão HttpOnly por hash, CSRF, limite de tentativas, CSP com `script-src 'self'`, RLS no PostgreSQL, listas fechadas de rotas por perfil (Consulta, Membro, Plataforma) que fecham rotas novas por padrão, isolamento por empresa com *lint* em teste.
- **Acessibilidade de base:** `lang="pt-BR"`, `:focus-visible`, ~100 atributos `aria-*`, `prefers-reduced-motion`, alvos de toque de 44 px, agenda navegável por teclado.
- **Documentação** viva (CLAUDE.md e documentos temáticos) e **migrações versionadas** com testes, inclusive contra PostgreSQL real.
- **Mobile pensado:** abas inferiores, folhas que sobem de baixo, ação principal fixa.

---

## 3. Achados e recomendações

Legenda: **Impacto** A/M/B · **Esforço** P/M/G (pequeno, médio, grande).

### 3.1 Produto e gestão

**G1. Sem lembretes, sem fechamento automático.** — *Impacto A · Esforço M*
O prazo do relato (segunda 18h) é só uma regra visual; ninguém é avisado. O README e o CLAUDE.md já listam isso como "fase 2".
*Recomendação:* e-mail transacional (Supabase/Resend) com três disparos: sexta 15h (lembrete), segunda 12h (quem ainda não enviou) e segunda 18h (fechamento, com resumo ao Diretor de quem ficou pendente). Depois, notificação *push* (o app já é instalável). Decidir e documentar a política de correção após o fechamento (hoje é livre).

**G2. O semáforo tende a saturar e a esconder gravidade.** — *Impacto A · Esforço M*
"Qualquer ação atrasada" torna a unidade vermelha, seja 1 ação ou 10, atrasada há 1 dia ou 30. Na própria demonstração, 3 de 6 unidades estão "Crítico". Quando metade do painel é vermelho, o vermelho deixa de informar. Os limiares estão documentados como "a validar com o Diretor". **[verificar com dados reais]**
*Recomendação:* manter as três cores (simples e já aceitas), mas **ordenar e detalhar dentro delas**: exibir a "razão principal" na primeira linha do cartão (ex.: "2 atrasadas, a pior há 9 dias") e usar a gravidade (dias de atraso, prioridade alta, impedimento crítico) para desempatar a ordem. Calibrar os limiares com 8 a 12 semanas de dados antes de mexer na regra.

**G3. Falta tendência: o Painel é uma foto.** — *Impacto A · Esforço M*
Um diretor precisa responder "esta unidade está melhorando ou piorando?" e "quais ações reincidem em atraso?". Os dados já existem (versões de `atualizacoes`, `acao_prazos`, `movimentada_em`).
*Recomendação:* mapa de calor do semáforo por unidade nas últimas 8 a 12 semanas, contagem de prazos adiados por ação (3 adiamentos = sinal) e uma seta de tendência no cartão.

**G4. Diretriz sem agrupamento e sem "para quê".** — *Impacto A · Esforço M*
Na tela Ações, a mesma ação aparece repetida, uma linha por seção (visto na demonstração). E não há como ligar ações a um objetivo, projeto ou meta.
*Recomendação:* (a) agrupar por diretriz, com progresso ("3 de 6 seções concluíram"), expansível; (b) um campo leve de **Objetivo/Projeto** (lista cadastrada, opcional) para dar contexto estratégico e permitir uma visão "por objetivo" na reunião. Evitar um OKR completo: começar leve.

**G5. Tempo obrigatório para concluir pode gerar dado ruim.** — *Impacto M · Esforço P*
Exigir "minutos > 0" para concluir é uma regra definida pelo Diretor, mas na prática convida a digitar qualquer número (efeito Goodhart), e a Produtividade usa esse dado como "dedicação".
*Recomendação:* manter a regra, **reduzir o atrito** (atalhos 15/30/60 min, "registrar ao concluir" no próprio diálogo) e **auditar** a distribuição dos valores depois de um mês (muitos "1 minuto" indicam preenchimento por obrigação). Rotular dedicação como *indicativa* nas telas.

**G6. A reunião pode ficar mais "por exceção".** — *Impacto M · Esforço M*
O Modo Reunião percorre seção a seção. O sistema já sugere relato oral opcional para as verdes, o que é bom.
*Recomendação:* abrir com "**O que ficou da reunião anterior**" (decisões e ações da última ata ainda abertas, com responsável e prazo), definir um tempo-caixa por seção e registrar cada decisão já com responsável e prazo, gerando a ação. Meta: reuniões mais curtas com mais decisões rastreáveis. **[verificar se já cobre parte disso]**

**G7. Ata sem envio real.** — *Impacto M · Esforço P*
"Enviar ata" só libera a leitura. Com o e-mail de G1, enviar a ata em PDF aos participantes fecha o ciclo e cria prova de ciência.

**G8. Governança do uso de produtividade.** — *Impacto A · Esforço P (não técnico)*
Indicadores por pessoa em um órgão público exigem regras claras de uso. O sistema já limita a visão por pessoa (Diretor, Administrador e chefe da unidade); falta o documento institucional: finalidade, quem vê, retenção e comunicação às equipes. Ver também 3.5.

### 3.2 UX e UI

**U1. Hierarquia visual do Painel e do Início.** — *Impacto A · Esforço M*
Os cartões trazem 5 a 7 linhas com o mesmo peso tipográfico; o olho não sabe onde pousar. O botão "Ver relato e ações" é pequeno e idêntico em todos.
*Recomendação:* primeira linha = situação + razão principal em destaque; números grandes (atrasadas, a vencer, pedidos); detalhes secundários recolhidos; todo o cartão clicável.

**U2. Legibilidade na TV.** — *Impacto A · Esforço P*
Nas capturas em 1920×1080, o texto dos cartões da visão geral é pequeno para quem está a 4 a 6 metros. **[verificar no ensaio real, ver ENSAIO_TV.md]**
*Recomendação:* como regra de partida, corpo ≥ 28 px e títulos ≥ 40 px nesse modo; menos itens por tela (3 a 4 cartões por linha, relato resumido) e contraste alto. É a tela mais importante do produto: merece um ensaio com a TV real antes de qualquer outra melhoria visual.

**U3. A linha do tempo da semana ocupa espaço em todas as telas.** — *Impacto M · Esforço P*
No celular ocupa cerca de um sexto da altura; no desktop se repete em telas onde não ajuda.
*Recomendação:* mostrar completa só no Início e no Painel; nas demais, uma faixa de uma linha ("Reunião em 30 min · fecha segunda 18h").

**U4. A ficha da ação é um diálogo longo e não tem endereço.** — *Impacto M · Esforço M*
Tarefas, impedimentos, prazos, comentários e redirecionar convivem em um único diálogo rolável. Como é diálogo, não há link para compartilhar ("veja esta ação") nem botão Voltar natural. **[verificar]**
*Recomendação:* rota própria (`#/acao/ID`), seções recolhíveis (Tarefas, Impedimentos, Histórico), ações principais fixas no rodapé e comentários em linha do tempo única (comentários + mudanças de status/prazo).

**U5. Excesso de selos por ação.** — *Impacto M · Esforço P*
Uma ação pode exibir até quatro selos ao mesmo tempo (status, atrasada, sem atualização, demandada, prioridade). *Recomendação:* no máximo dois no cartão (o mais grave e a prioridade) e o resto no detalhe.

**U6. Ações destrutivas e reversão.** — *Impacto M · Esforço P*
Voltar uma ação para "A fazer" apaga todo o tempo registrado. *Verificado depois da avaliação:* a tela de Minhas ações **já pede confirmação** mostrando o tempo que será excluído; resta conferir o mesmo cuidado na ficha da ação e na reunião, e avaliar um "Desfazer".

**U7. Primeiro uso e estados vazios.** — *Impacto M · Esforço P*
*Recomendação:* um roteiro de 3 passos no primeiro acesso do chefe ("veja o que chegou, atualize o status, envie a atualização") e uma lista "Sua semana" no Início com o que falta fazer até segunda 18h.

**U8. Mobile.** — *Impacto B · Esforço P*
Abas de filtro cortadas em "Arq…" sem indicação de rolagem; os quatro botões de status ocupam muito espaço. *Recomendação:* sombra/gradiente de rolagem nas abas e controle de status compacto com "Concluir" como ação primária.

**U9. Busca e atalhos.** — *Impacto B · Esforço M*
Não há busca global. *Recomendação:* campo de busca no topo (ações, seções, reuniões) e atalhos de teclado para o Painel e a reunião.

### 3.3 Acessibilidade

A base é boa, mas é afirmada, não medida. *Impacto M · Esforço P*
- Auditar **contraste** (selos amarelos, textos secundários cinza-claro, verde sobre verde na TV) contra WCAG 2.2 AA.
- Rodar **axe** automatizado em cada tela (ver E1) e uma revisão manual com leitor de tela (NVDA) nos fluxos: entrar, atualizar status, enviar atualização.
- Diálogos: foco preso e devolvido ao elemento de origem; mensagens de erro e toasts em região `aria-live`.
- Estilos em linha (≈ 100 ocorrências de `style=`/`onclick=`) dificultam temas e alto contraste; migrar para classes.
- Oferecer **tema escuro/alto contraste** além do modo TV. **[verificar `prefers-color-scheme`: não encontrei uso]**

### 3.4 Engenharia

**E1. Interface sem testes e sem integração contínua.** — *Impacto A · Esforço M*
Há 283 testes de servidor e regras, todos passando, mas **nenhum** para os ≈ 7 mil linhas de interface, e não há CI, linter ou formatador (`.github` ausente; `package.json` sem ESLint/Prettier).
*Recomendação:* GitHub Actions rodando `npm test` e `npm run test:postgres`; 6 a 8 testes de ponta a ponta (Playwright) para as jornadas críticas (entrar, atualizar status e tempo, enviar relato, direcionar ação, conduzir e encerrar reunião, ata em PDF) com axe embutido; ESLint com regras de segurança.

**E2. XSS depende de disciplina.** — *Impacto M · Esforço M*
São 58 usos de `innerHTML` com 214 chamadas a `esc()`. A CSP (`script-src 'self'`) mitiga bastante, mas um `esc()` esquecido continua sendo um defeito.
*Recomendação:* um *tagged template* `html` que escapa por padrão (e só aceita HTML explícito via marcador), mais uma regra de lint (`no-unsanitized`). Remover `unsafe-inline` dos estilos quando os `style=` forem migrados.

**E3. Arquivos de regra concentrados.** — *Impacto M · Esforço G*
`rotas-acoes.js` tem 1.035 linhas misturando permissão, SQL e regra. O CLAUDE.md virou a especificação de fato (denso e longo).
*Recomendação:* extrair uma camada de domínio (`acoes/permissoes`, `acoes/validacao`, `acoes/prazos`), manter as rotas finas; transformar as regras do CLAUDE.md em documento de produto e registrar as decisões importantes em ADRs curtos.

**E4. Perfis presos em `CHECK` do banco.** — *Impacto M · Esforço M*
Quatro migrações (8, 19, 21, 24) recriaram a tabela `usuarios` só para acrescentar um perfil. *Recomendação:* trocar o `CHECK` por tabela de perfis (ou validar só na aplicação) para que novo perfil não exija reconstruir a tabela mais sensível.

**E5. Dois bancos, dois comportamentos.** — *Impacto M · Esforço M*
Manter SQLite e PostgreSQL dobra a superfície de teste e de divergência; a produção é PostgreSQL. *Recomendação:* usar PostgreSQL também no desenvolvimento (o Docker já está instalado na máquina) e deixar SQLite apenas para a demonstração, ou aposentá-lo depois do piloto.

**E6. Desempenho: ainda não é problema, vai ser.** — *Impacto M · Esforço M*
`GET /api/acoes` não pagina; a busca usa `like '%texto%'`; o `bootstrap` calcula contadores a cada navegação; o service worker não guarda nada em cache (decisão consciente e correta pelo risco de versão antiga). **[verificar com 5 mil+ ações]**
*Recomendação:* paginação/`limit` no servidor, índice apropriado (ou `pg_trgm` no PostgreSQL) para a busca, ETag nos GET estáveis e medição de tempo de resposta por rota antes de otimizar. Em Vercel com PostgreSQL, usar o *pooler* do Supabase para evitar esgotar conexões.

**E7. Observabilidade.** — *Impacto A · Esforço P*
O único registro de erro é `console.error`. *Recomendação:* log estruturado com identificador de requisição, captura de erros (Sentry ou equivalente), endpoint de saúde e alerta simples (e-mail) para erros 5xx e falhas de login em série.

**E8. Backup e restauração não ensaiados.** — *Impacto A · Esforço P*
O próprio ESTABILIZACAO.md lista "backup e restauração" como pendência. *Recomendação:* ensaiar uma restauração completa numa cópia, medir o tempo e documentar o procedimento antes de entrar em produção com dados reais.

**E9. Dívida conhecida do multi-empresa.** — *Impacto M · Esforço M*
O padrão `empresa_id = 1` ainda existe e a migração 23 não foi aplicada em produção. Concluir antes de criar a 2ª empresa (o próprio plano já diz isso) e manter o *lint* de empresa no CI.

### 3.5 Segurança e privacidade

- **MFA** para Diretor, Administrador e Plataforma. Hoje o login por senha não conclui se o projeto Supabase exigir MFA; implementar o segundo fator (TOTP) no fluxo. *Impacto A · Esforço M*
- **Trilha de auditoria** de mudanças sensíveis (contas, perfis, estrutura, exclusão de versões do histórico): quem, quando, o quê. Hoje só ações têm comentários automáticos. *Impacto A · Esforço M*
- **LGPD:** mapear finalidade, base legal, quem acessa tempo e produtividade por pessoa, **retenção** (por quanto tempo guardar relatos e tempo) e anonimização após o prazo. Formalizar junto ao encarregado do órgão. *Impacto A · Esforço P (não técnico)*
- **Revisão de privilégios do Administrador:** acesso total é decisão do proprietário, mas merece alerta de uso (ex.: notificar o Diretor quando o Administrador exclui uma versão do histórico).

### 3.6 Adoção e gestão da mudança

Aqui está o maior risco do projeto.

- **Piloto em duas unidades** durante 4 semanas antes de abrir para todas, com um "campeão" em cada uma, e a regra de ouro: *o Diretor só usa o que está no sistema* (se pedirem relato por outro canal, o sistema perde).
- **Medir adoção desde o primeiro dia** (ver seção 5).
- **Reduzir mais a digitação:** atualização de status por link seguro enviado por e-mail (um toque), e resumo da semana pré-preenchido.
- **Canal de feedback dentro do app** ("O que atrapalhou hoje?") e *novidades* em cada versão.
- **Comunicar o que não se mede:** o sistema avalia **unidades**, não pessoas, e isso precisa ser dito e repetido às equipes, sob pena de resistência.

---

## 4. Roteiro priorizado

### Agora (0 a 30 dias): proteger a base e validar
1. Ensaio na TV real e ajuste de tamanhos (U2).
2. CI + teste de ponta a ponta das jornadas críticas (E1).
3. Ensaio de backup/restauração (E8) e observabilidade mínima (E7).
4. Lembretes por e-mail e política de fechamento (G1).
5. Linha do tempo compacta, menos selos, confirmação de apagar tempo (U3, U5, U6).
6. Definir as métricas de adoção e o piloto (3.6).

### Próximo (30 a 90 dias): valor para o Diretor
7. Tendência por unidade e calibração do semáforo (G2, G3).
8. Agrupar por diretriz e campo de Objetivo/Projeto (G4).
9. Reforma da ficha da ação com rota própria (U4); hierarquia do Painel (U1).
10. Gabarito de acessibilidade (axe, contraste, leitor de tela).
11. MFA, trilha de auditoria e documento de LGPD (3.5).
12. Registro de tempo com menos atrito (G5); ata enviada por e-mail (G7).

### Depois (90 dias ou mais): escala
13. Camada de domínio e redução do `rotas-acoes.js` (E3); `html` seguro (E2).
14. Perfis sem `CHECK`, PostgreSQL também em desenvolvimento (E4, E5).
15. Paginação, índices de busca e pooler (E6); conclusão do multi-empresa (E9).
16. Dependências entre ações, carga por pessoa, integrações (Teams/WhatsApp), exportações.

---

## 5. Como saber se está funcionando

| Indicador | Como medir | Meta sugerida (a pactuar) |
| --- | --- | --- |
| Atualizações enviadas até segunda 18h | `atualizacoes` por semana | ≥ 90% das unidades |
| Ações com movimentação nos últimos 7 dias | `movimentada_em` | ≥ 80% das ações em curso |
| Duração da reunião | `iniciada_em` a `encerrada_em` | reduzir 20% em 8 semanas |
| Decisões com responsável e prazo | `decisoes` e ações geradas | ≥ 90% |
| Ações atrasadas reincidentes (3+ adiamentos) | `acao_prazos` | tendência de queda |
| Satisfação dos chefes (1 pergunta semanal) | canal de feedback | ≥ 4 de 5 |

---

## 6. Premissas e perguntas em aberto

- Quantos usuários e quantas ações por semana são esperados no primeiro ano? (muda a urgência de E6)
- Existe encarregado de dados (LGPD) no órgão para validar 3.5?
- O sistema substituirá relatórios atuais (planilhas, e-mails)? Se não, a adoção fica em risco.
- A política de correção depois da segunda 18h: livre, com registro de "enviado fora do prazo" ou bloqueada?
- O Diretor quer comparar unidades entre si ou cada uma consigo mesma? (o sistema hoje já recomenda a segunda opção; manter a comunicação alinhada)
