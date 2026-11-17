# Tutorial passo a passo do Agilis

> **Prefere ser guiado na tela?** Dentro do Agilis, o botão **Tutorial** (no celular, **Mais → Tutorial guiado**) conduz você por estas mesmas lições, destacando cada parte da interface. Este documento é o roteiro em texto, para ler ou imprimir.

Escrito para quem vai usar o sistema pela primeira vez. Siga só a parte do **seu perfil**, na ordem. Cada lição leva de 5 a 10 minutos e termina com uma conferência ("Você aprendeu quando…").

Para consulta depois do treino, use o [Guia do usuário](guia-do-usuario.md) (resumo) ou o PDF `Guia-do-Usuario-Agilis.pdf` (com imagens). Os nomes de telas e de unidades (Centro, Coordenação…) podem variar de uma empresa para outra.

## Como treinar sem risco

- Se houver um **ambiente de demonstração**, treine nele: os dados são fictícios e nada vale de verdade. Quem mantém o sistema o abre com `npm run demo` (endereço `http://127.0.0.1:3222`; `npm run demo -- --zerar` recomeça do zero).
- No sistema de verdade, as lições marcadas com ⚠️ **gravam dados reais** (criam ações, enviam relato). Faça-as só quando for a hora, ou peça a quem administra uma ação de teste.
- Dica geral: nada se perde ao fechar uma janela de formulário sem salvar.

## O que todos precisam saber (5 minutos)

**O ritmo da semana**

| Quando | O que acontece |
|---|---|
| Durante a semana | Ações são direcionadas às seções e executadas |
| Sexta, 15h | Começa o aviso da atualização semanal |
| Segunda, 18h | Fechamento: prazo para o chefe enviar a atualização |
| Terça, 10h | Reunião com o Modo Reunião na TV |

**O semáforo** (sempre cor + forma + texto)

- ● **Crítico**: há ação atrasada ou impedimento crítico aberto.
- ▲ **Atenção**: atualização semanal não enviada, ou ação vencendo em até 2 dias.
- ✓ **Em dia**: o resto.

**Lição 0: entrar e se achar**

1. Abra o endereço do Agilis no navegador.
2. Digite **e-mail** e **senha**. Se a conta foi criada por outra pessoa, o sistema pede para você **definir uma nova senha** agora.
3. Olhe o **menu à esquerda** (no celular, as abas de baixo e o botão **Mais**). Ele mostra só o que o seu perfil pode usar, em grupos por assunto. No computador, a setinha ao lado da logo **recolhe** o menu para uma coluna de ícones; o sistema lembra a sua escolha. Embaixo ficam o seu nome e o seu perfil (quem é suplente aparece como **Suplente de seção** e vê os mesmos dados do titular).
4. No alto, a **linha do tempo da semana** mostra a reunião, o lembrete e o fechamento.
5. Abra a **Agenda**: o calendário mostra ações (círculo) e tarefas (quadrado). Clique num dia para ver o que vence nele. Vermelho = atrasado.
6. (Opcional) Abra **Avisos no celular** e toque em **Ativar avisos neste aparelho**. No iPhone, só funciona com o Agilis instalado na tela inicial.

✅ Você aprendeu quando consegue entrar, achar a Agenda e dizer o que a cor vermelha significa.

---

## Trilha A: Chefe de seção

**Meta:** em uma semana típica, você mantém suas ações em dia e envia a atualização semanal até segunda, 18h.

### Lição A1: o Início e "Sua semana"

> Ação que um chefe de cima atribuiu a você, mesmo vinda de uma seção acima da sua, chega em **Chegaram para você** com a sigla da seção de origem.

1. Abra **Início**.
2. Leia o cartão **Sua semana**. Ele lista o que falta antes da reunião: atualização, ações atrasadas, ações novas, validações e o que vence antes da reunião.
3. Clique em qualquer item: ele leva direto à tela que resolve.
4. Veja os quadros **Chegaram para você** (ações novas) e **Precisa de atenção** (atrasadas ou sem movimento há 7 dias, com botões rápidos de status e tempo).

✅ Você aprendeu quando sabe dizer quantos itens faltam e qual vence primeiro.

### Lição A2: trabalhar uma ação

1. Abra **Minhas ações**. As abas separam Todas ativas, Abertas, Concluídas e Arquivadas (em **Arquivadas** está o que foi arquivado; **Desarquivar**, no cartão, traz a ação de volta). Use a **busca**, os **atalhos de atenção** (com a contagem de atrasadas, que vencem em 7 dias, paradas, com impedimento…) o botão **Filtros** (Responsável, Origem, Seção, Prazo até a reunião, Status e Prioridade, cada opção com a contagem) e **Ordenar** para achar o que precisa de você. Use **+ Registrar andamento** para anotar no **diário de progresso** o que aconteceu, apontando a tarefa (ou "Geral da ação"), com tempo e referência opcionais; a ficha mostra a linha do tempo, com filtros por tipo e por tarefa.
2. Abra uma ação **nova** (traz o selo "nova"; abrir avisa quem direcionou que você viu).
3. Mude o status para **Em andamento**.
4. Registre o **tempo em minutos** (ex.: 90).
5. Em **Tarefas**, acrescente um passo ("Pedir dados ao setor X"), com data e responsável se quiser. Tarefas ajudam, mas não mudam o status.
6. Tente **Concluída**. ⚠️ Sem tempo maior que zero, o sistema recusa: é a regra. Com o tempo registrado, conclui.

⚠️ Voltar uma ação para **A fazer** apaga todo o tempo registrado (o sistema mostra quanto antes de confirmar).

✅ Você aprendeu quando concluiu uma ação com tempo registrado.

### Lição A3: impedimento e novo prazo

1. Numa ação **em andamento**, abra a seção **Impedimentos** e registre um (descreva o que trava; marque **crítico** só se paralisa a entrega).
2. Veja a ação passar a **Bloqueada**. Quando o problema for resolvido, use **Retomar**.
3. Para uma ação criada por **outra pessoa**, use **Pedir novo prazo**, informe a data e o motivo, e aguarde o Diretor decidir.

Impedimentos são histórico: não se editam nem se apagam. Para corrigir, resolva e registre outro. Impedimento crítico aberto deixa a seção em vermelho.

✅ Você aprendeu quando sabe a diferença entre bloquear e pedir prazo.

### Lição A4: criar e distribuir ações ⚠️

1. Em **Minhas ações**, clique em **+ Nova ação**.
2. Preencha título, detalhamento, prazo, prioridade e, se quiser, esforço estimado.
3. Escolha o **responsável** (membro ou suplente da seção).
4. Salve. A ação chega como "nova" para o responsável.
5. Quando um membro concluir uma ação que você atribuiu, ela aparece em **Aguardando sua validação**: **Valide** ou **Devolva** (com o motivo).

✅ Você aprendeu quando atribuiu uma ação e viu o responsável recebê-la.

### Lição A5: a atualização semanal ⚠️ (o passo mais importante)

1. A partir de **sexta, 15h**, uma **faixa amarela** lembra a atualização (vermelha depois do prazo).
2. Abra **Minha atualização**. O relato já vem **montado pelo sistema** com o que foi feito, está atrasado, está programado e trava.
3. Algo errado? Corrija na própria ação (status, prazo, impedimento) e volte: o relato se refaz.
4. Escreva as **observações** e **envie** até **segunda, 18h**. A faixa some.
5. Se algo mudar depois, a tela avisa "desatualizada": envie de novo (cria nova versão; o histórico fica em **Histórico**).

✅ Você aprendeu quando a faixa sumiu e a seção deixou de aparecer como pendente.

### Lição A6: Painel de gestão

1. Abra **Painel de gestão** (grupo "Hoje"). É só leitura: nada ali grava dados.
2. Leia o **radar** "O que precisa de você hoje": impedimento crítico, atrasos, validações, prazos chegando e ações paradas, por gravidade. Clique numa ação para abrir a ficha.
3. Veja o **fluxo** (a fazer, em andamento, bloqueadas) e os **prazos** das ações em curso.
4. Olhe as **entregas por semana** (8 semanas) e a **carga da equipe**: serve para distribuir melhor e conversar, não para ranquear.
5. Em **Conversas que valem a pena**, veja sugestões para apoiar, alinhar e reconhecer.

✅ Você aprendeu quando sabe dizer o que precisa de você hoje e quem precisa de apoio.

### Lição A7: direcionar às subseções ⚠️ (só quem tem subseções)

1. Abra **Direcionar ação** (grupo "Meu trabalho"; o item só aparece se a sua seção tem subseções).
2. Escreva o que precisa ser feito e escolha **Todas as subseções** (as diretamente abaixo da sua seção) ou **Escolher subseções**.
3. Informe o **prazo** (obrigatório) e direcione. Se as subseções já têm ações com o mesmo prazo, o sistema avisa antes.
4. Em **Últimas ações direcionadas**, veja quem já abriu a ação e use **Acrescentar seções** se precisar incluir outra subseção.
5. Quando a subseção concluir, a ação volta a você, no Início, em **Aguardando sua validação**: **Aceitar e encerrar** ou **Devolver para ajuste**, dizendo o que falta. O Diretor não aceita essas ações.

✅ Você aprendeu quando direcionou uma ação e viu a subseção recebê-la.

### Lição A8: equipe e reunião

1. **Minha equipe**: cadastre membros, **exclua** um cadastro feito por engano (só quem nunca deixou histórico; senão, Desativar), defina quem é Membro ou Suplente (o suplente tem os mesmos poderes seus), desative ou redefina senha.
2. **Combinados** e **Reuniões e atas**: consulte o que foi definido. Quem participou pode sugerir revisão numa ata enviada.
3. **Configuração da reunião** e a reunião da equipe: se você reúne sua própria equipe, o fluxo é o mesmo da reunião do Diretor (veja a Trilha D, lição D5, na instância "equipe").

---

## Trilha B: Membro da equipe

**Meta:** executar o que é seu e mantê-lo atualizado.

### Lição B1: achar o que é seu

1. Abra **Minhas ações**. A aba **Minhas** traz o que foi atribuído a você ou criado por você; **Da seção, só leitura** mostra o resto.
2. Ação nova atribuída pelo chefe chega com o selo "nova".

### Lição B2: executar

1. Abra uma ação sua e mude o status, a prioridade e o **tempo (minutos)**.
2. Crie e marque **tarefas**; registre **impedimentos**; **comente**.
3. Concluir exige tempo maior que zero. Se o chefe valida o que você conclui, ele pode **devolver com motivo**: leia nos comentários e ajuste.
4. Em ação de outra pessoa você só marca a tarefa que é sua e comenta onde tem tarefa.

### Lição B3: Agenda

Abra a **Agenda**, filtre **De quem → Só o que é meu** e veja suas tarefas e ações por dia. Marque tarefas direto ali.

✅ Você aprendeu quando concluiu uma ação com tempo e ela foi para a validação do chefe.

Não estão disponíveis ao membro: relato semanal, reuniões, estrutura e contas. As **Atas** da equipe, enviadas, você lê se esteve presente.

---

## Trilha C: Consulta

**Meta:** acompanhar sem alterar nada.

1. Abra **Ações dos Centros**: filtre por Centro e situação e abra uma ação para ver o histórico. Ações internas não aparecem.
2. Abra a **Agenda** para ver prazos de todos os Centros, filtrando por **Seção**.
3. Nenhum botão de alteração aparece: é só leitura, por desenho.

✅ Você aprendeu quando consegue achar todas as ações atrasadas de um Centro.

---

## Trilha D: Diretor e Apoio

**Meta:** direcionar o trabalho, decidir prazos e conduzir a reunião de terça.

### Lição D1: ler o Painel

1. Abra **Painel da semana**. Cada unidade é um cartão, em **ordem de necessidade** (críticas primeiro).
2. Leia o **motivo principal** do cartão e os quatro números fixos: atrasadas, vencem em 2 dias, pedidos de prazo, paradas há 7+ dias.
3. Clique no cartão para ver o relato e as ações da unidade. Navegue entre semanas pelas setas e use **Versão para impressão** como plano B.

Ações internas de subseções aparecem só como contagem.

✅ Você aprendeu quando sabe dizer qual unidade pede sua atenção primeiro e por quê.

### Lição D2: direcionar uma ação ⚠️

1. **Direcionar ação**: escreva o que precisa ser feito.
2. **Para quem**: "Todos os Centros" ou "Escolher seções".
3. Informe o **prazo** (obrigatório), prioridade e esforço.
4. O sistema avisa se as seções já têm ações com o mesmo prazo: **Direcionar mesmo assim** ou volte e revise.
5. À direita, **Últimas ações direcionadas** mostram quem já viu. **Acrescentar seções** inclui outras na mesma ação.

### Lição D3: acompanhar e decidir

1. **Ações**: filtre por seção, situação e origem (inclusive "demanda de entidade externa"). Uma diretriz enviada a várias seções aparece agrupada.
2. **Pedidos de prazo**: leia a justificativa e **Aprove** ou **Recuse**. O **Apoio** só decide dentro de uma reunião em andamento.
3. Ações concluídas que você demandou esperam seu **aceite** (ou devolução com motivo). Se também forem delegadas a um membro, o chefe valida primeiro.

### Lição D4: Combinados, avisos e produtividade

1. **Combinados**: crie, edite, reordene; para tirar, **arquive** (nunca exclui). Acima de 7 ativos o sistema avisa.
2. **Avisos** (Diretor): publique uma mensagem com início e fim; aparece no Início dos chefes.
3. **Produtividade**: compare unidades com o período anterior. Avalia unidades, não pessoas isoladas; nunca use um indicador sozinho.

### Lição D5: conduzir a reunião de terça

Antes: conecte o notebook à TV por HDMI.

1. Menu **Iniciar reunião**. A conferência mostra seções sem atualização, pedidos de prazo e combinados. Resolva o que der.
2. Clique **Iniciar reunião** (recarregar a página não abre outra; reunião em andamento volta como **Retomar reunião**).
3. Navegue com **→ e ←**: combinados → visão geral → uma tela por seção.
4. Em cada seção: leia o relato, edite ações, **decida pedidos de prazo**, **registre decisões**, crie **novas ações**, anote **informações** e marque a **presença**.
5. **Encerrar reunião** gera a **ata em rascunho**.
6. Em **Reuniões e atas**: revise com a barra de formatação, **Baixar PDF** se quiser, e **Enviar ata**.
7. Plano B: **Versão para impressão** da pauta.

✅ Você aprendeu quando encerrou uma reunião e enviou a ata aos chefes.

---

## Trilha E: Administrador

**Meta:** manter contas e estrutura saudáveis.

1. Faça a Trilha D (você tem tudo o que o Diretor tem, em qualquer seção).
2. **Configuração → Seções**: organize Centros, Coordenações e Subseções; defina quais participam da reunião.
3. **Configuração → Usuários e acessos**: crie contas, perfis e suplentes; redefina senhas. Conta com histórico não se exclui: use **Desativar**. Sempre deve existir um Diretor ativo.
4. **Configuração → Reunião e ata**, **Nomes das unidades** e o cabeçalho da ata.
5. Se tem seção vinculada (Diretoria Adjunta), você também tem **Início da seção**, como um chefe.

---

## Cola rápida

| Situação | O que fazer |
|---|---|
| Não consigo concluir | Registre o tempo (minutos, maior que zero) |
| Prazo de ação de outra pessoa | **Pedir novo prazo** |
| Algo mudou depois de enviar | Enviar a atualização de novo |
| A faixa amarela não some | Enviar em **Minha atualização** |
| Esqueci a senha | Peça ao chefe (membro) ou ao Diretor/Administrador |
| Quero compartilhar uma ação | **Copiar link da ação**, na ficha |
| Não recebo avisos | Reative em **Avisos no celular**; no iPhone, só com o app instalado |
