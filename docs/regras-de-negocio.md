# Regras de negócio

Fonte: plano do projeto. **Não altere sem combinar com o Diretor.** Este texto é um resumo legível; o detalhe técnico (nomes de rotas, campos e funções) está em [CLAUDE.md](../CLAUDE.md). As constantes compartilhadas estão em `public/js/regras.js`; as regras de data e semáforo, em `server/logic.js`.

## Semana, fechamento e semáforo

- Semana = terça a segunda. Fechamento: segunda, 18h.
- `refTerca`: na terça depois das 12h, a referência passa para a terça seguinte. O dia, a hora da reunião e o corte são configuráveis por empresa.
- Semáforo da seção: vermelho (ação atrasada ou impedimento crítico aberto em ação em curso), amarelo (atualização não enviada ou ação vencendo em até 2 dias), verde (o resto). Subseções entram na cor do cartão acima (vale a pior).
- "Ação sem atualização" (7 dias sem movimentação) é só informativa: não muda o semáforo.

## Ações

- Status: `a_fazer`, `em_andamento`, `bloqueada`, `concluida`, com transições em `TRANSICOES`.
- **Concluir exige tempo registrado maior que 0 minutos** (erro 422). O chefe registra tempo em minutos.
- Voltar para `a_fazer` exclui todo o tempo registrado e registra um comentário com a quantidade excluída.
- Prioridades: alta, média, baixa. Esforço estimado: pequeno (1), médio (2), grande (3).
- Toda ação nasce com prazo. Diretriz do Diretor vira uma ação por seção destinatária.
- Antes de direcionar, o sistema avisa sobre ações em aberto com o mesmo prazo nas seções alvo. É só aviso: não bloqueia.

### Autoria e edição

O autor (chefe ou suplente que criou; a gestão, nas criadas pela gestão; o Administrador, em todas) edita título e detalhamento enquanto a ação não foi apresentada em reunião, muda o prazo enquanto está em curso e exclui só se não foi apresentada nem concluída. Ação concluída ou apresentada não é excluída por ninguém. Status, tempo, tarefas e impedimentos ficam com quem executa. Toda edição com mudança registra um comentário.

### Prazo

O prazo de ação criada por outra pessoa só muda por **pedido** (`pedidos_prazo`). O Diretor decide; o Apoio só decide dentro de reunião em andamento, por delegação. O autor altera direto pela edição. Toda mudança grava o prazo anterior e o novo (`acao_prazos`).

### Tarefas

Servem de apoio: não mudam o status nem a regra de concluir. São listadas por data, as sem data no fim; tarefa com data passada e não feita fica marcada como atrasada (só destaque visual). Podem ser editadas e excluídas livremente por quem executa a ação; o membro dono da tarefa também a marca como feita. Diretor e Apoio só veem.

### Impedimentos

Pertencem a uma ação, com ciclo aberto → resolvido. São histórico: nunca editados nem excluídos (para corrigir, resolva e registre outro). `bloquear` só vale com a ação em andamento; `retomar` volta a ação bloqueada para em andamento. Concluir a ação resolve os impedimentos abertos.

### Redirecionar

Muda a seção responsável levando todo o histórico e registra um comentário com origem, destino e motivo. A gestão escolhe qualquer seção ativa; o chefe, só a própria seção ou as subseções. Não vale para ação concluída, encerrada ou arquivada.

### Ação recebida

A ação "chega" à seção quando vem de fora (diretriz, seção acrescentada, criada pela gestão, redirecionamento). Fica `nova` para quem a recebe até a pessoa abri-la. O Início do chefe tem o quadro "Chegaram para você". A gestão vê a ciência por seção. Só aviso dentro do sistema, sem e-mail.

### Validação

Depois de concluída, só duas origens têm validação:

1. **Atribuída pelo chefe a um membro:** o chefe valida ou devolve com motivo.
2. **Demandada pelo Diretor** (diretriz ou "Demanda do Diretor"): o Diretor aceita ou devolve.

Quando as duas valem, primeiro o chefe, depois o Diretor. As demais ações ficam prontas ao concluir. Mudar status, reabrir ou trocar o responsável recomeça a validação do chefe.

### Demanda de entidade externa

Marca a ação demandada por entidade fora da subordinação ao Diretor (órgão de controle, outra secretaria). O nome (até 120 caracteres) é obrigatório quando marcada; torna a ação visível ao Diretor e não muda o semáforo.

## Estrutura

- Tipos: Centro, Coordenação, Subseção e Diretoria Adjunta (no máximo uma, sem chefe). Níveis configuráveis por empresa (2 a 6, padrão 3).
- **Unidade de acompanhamento** (cartão da reunião, linha do Painel e do semáforo): Diretoria Adjunta, Centro e Coordenação. A Subseção nunca é cartão e soma no cartão acima.
- Ações internas de subseção (`interna = 1`) não aparecem ao Diretor nem ao Apoio, só em contagens.
- Seção fora da reunião (`na_reuniao = 0`) sai dos cartões, da pauta e da ata; o Painel continua mostrando, com a marca.
- A Diretoria Adjunta não recebe diretriz "todos os Centros". O Diretor Adjunto (Administrador vinculado à Diretoria Adjunta) não direciona ações para a própria seção.

## Perfis e permissões

| Perfil | Pode |
| --- | --- |
| Diretor | Direciona, decide prazos, conduz a reunião, aceita/devolve, gere estrutura e contas de Chefe e Apoio. Não vê ações internas |
| Apoio | O mesmo, exceto Estrutura; decide prazos só em reunião em andamento |
| Chefe | Age na própria seção e subordinadas; envia a atualização; cadastra a equipe; pode ter um suplente com os mesmos poderes |
| Membro | Lê a seção; age no que é atribuído a ele ou criado por ele; não atribui, não arquiva, não redireciona, não pede prazo |
| Consulta | Só lê ações (e tarefas) de todos os Centros, sem as internas e sem relatos |
| Administrador | Tudo dentro da empresa, inclusive ações internas e contas |
| Plataforma | Cria e gerencia empresas; não lê dados de negócio |

Travas de integridade: sempre há um Diretor ativo; Administrador e Plataforma só nascem por comando de linha (`admin:criar`, `plataforma:criar`); contas com senha definida por terceiros exigem troca no primeiro acesso.

O chefe com `ver_outros_centros` (ligado pelo Diretor ou Administrador) lê as ações de todos os Centros, só leitura.

## Atualização semanal

- Versionada (`secao_id` + `semana` + `versao`): enviar de novo cria nova versão; o histórico é mantido. O Administrador pode excluir uma versão (para corrigir um relato de teste ou enviado por engano).
- O relato é montado pelo servidor a partir das ações e impedimentos da seção e subseções. Concluídas: 7 dias antes da reunião até a véspera. Programadas: do dia da reunião a 7 dias depois. Atrasadas: prazo anterior a hoje e não concluídas. Impedimentos: os abertos em ações em curso.
- O envio recalcula no servidor e congela uma cópia que **nunca contém ações internas, só contagens**.
- Não há trava automática após segunda 18h: o chefe ainda consegue enviar correção.

## Reunião e ata

- Situação: `em_andamento` → (encerrar) `rascunho` → (enviar) `enviada`. Reabrir só a partir de rascunho.
- A ata é gerada ao encerrar. Diretor, Apoio e Administrador a editam (também depois de enviada) e podem excluí-la; excluir apaga as decisões e desvincula ações e pedidos, que permanecem.
- Ao encerrar, as ações dos cartões ficam marcadas como apresentadas (a data da primeira reunião não muda).
- **Combinados:** arquivar, nunca excluir. Cada reunião guarda uma cópia (`combinados_snapshot`). Aviso quando há mais de 7 ativos. Frequência: sempre, primeira do mês ou quando mudarem. Não entram no texto da ata.
- A ata usa marcação leve: `**negrito**`, `*itálico*`, listas com `- ` ou `1. `. O texto é escapado antes de aplicar as marcas.
- Presença, informações e sugestões de revisão: ver [REUNIOES.md](../REUNIOES.md).

## Quadro de avisos

Uma mensagem do Diretor ou Administrador, com início e fim (fim obrigatório e nunca no passado). Aparece no Início do chefe e da Diretoria Adjunta; no máximo uma por vez (a vigente de maior id). Exclusão definitiva.

## Produtividade

Avalia **unidades**, não pessoas isoladas, sempre comparando com o período anterior de mesma duração. Indicadores: entregas (com pontos pelo esforço), pontualidade, retrabalho, tempo de ciclo, dedicação e carga de hoje. Só soma ações visíveis a quem consulta. Por pessoa: apenas Diretor, Administrador e o chefe da unidade. Não compare unidades de natureza diferente nem use um indicador sozinho.

## Multi-empresa e vocabulário

Cada empresa tem nome, sigla, logo, cabeçalho e brasões da ata, dia/hora da reunião e **vocabulário próprio** (nomes dos tipos de unidade e do perfil do topo). Todo texto de interface ou mensagem que cite Centro, Coordenação, Subseção, Diretoria Adjunta ou Diretor deve vir do vocabulário, não fixo no código. A entrada pede só e-mail e senha: o servidor descobre o órgão pela conta.
