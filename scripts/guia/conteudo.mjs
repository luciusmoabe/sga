// Texto do Guia do Usuário (capítulos, figuras e legendas). O gerador é `scripts/guia/gerar.mjs` (`npm run guia`).
// Cada figura `fig('nome', 'legenda')` corresponde a uma captura de tela de `gerar.mjs` (lista `TELAS`): ao criar uma figura
// nova, acrescente a captura lá. O texto é HTML simples; os valores citados (horários, regras) seguem CLAUDE.md.

/** Monta os capítulos. `dirImagens` é o diretório (relativo ao HTML) onde ficam as capturas. */
export function conteudo(dirImagens) {
  let n = 0;
  const fig = (f, leg, cls = '') => `<figure class="${cls}"><img src="${dirImagens}/${f}.png" alt=""><figcaption><b>Figura ${++n}.</b> ${leg}</figcaption></figure>`;
  const dica = (t) => `<div class="box dica"><b>Dica</b>${t}</div>`;
  const aviso = (t) => `<div class="box aviso"><b>Importante</b>${t}</div>`;
  const passos = (...p) => `<ol class="passos">${p.map(x => `<li>${x}</li>`).join('')}</ol>`;
  const caps = [];
  const cap = (id, titulo, corpo) => { caps.push([id, titulo]); return `<section class="cap" id="${id}"><div class="num">${String(caps.length).padStart(2, '0')}</div><h1>${titulo}</h1>${corpo}</section>`; };

  const corpo = [
  cap('intro', 'Conhecendo o Agilis', `
  <p>O <b>Agilis</b> é o sistema que o Departamento de Planejamento, Orçamento e Gestão usa para acompanhar o trabalho semanal dos Centros e da Coordenação. Ele reúne em um só lugar o que foi pedido, o que está em andamento, o que está atrasado ou travado e o que foi decidido na reunião de terça-feira.</p>
  <h2>O ritmo da semana</h2>
  <table><tr><th style="width:24%">Quando</th><th>O que acontece</th><th style="width:22%">Quem</th></tr>
  <tr><td>Durante a semana</td><td>Ações são direcionadas às seções e executadas: status, tempo, tarefas e impedimentos são atualizados.</td><td>Diretor, Apoio e chefes</td></tr>
  <tr><td>Sexta, 15h</td><td>Começa o aviso da atualização semanal: faixa no sistema e, para quem ativou, notificação no celular.</td><td>Chefes</td></tr>
  <tr><td>Até segunda, 18h</td><td>Cada chefe confere o relato montado pelo sistema e o envia (<i>atualização semanal</i>).</td><td>Chefes</td></tr>
  <tr><td>Terça, 10h</td><td>Reunião conduzida no <b>Modo Reunião</b>, na TV da sala.</td><td>Diretor ou Apoio</td></tr>
  <tr><td>Ao encerrar</td><td>O sistema gera a ata em rascunho, que é revisada e enviada.</td><td>Diretor ou Apoio</td></tr></table>
  <h2>O semáforo</h2>
  <p>Cada unidade recebe uma situação, sempre indicada por <b>cor, forma e texto</b> (nunca só pela cor):</p>
  <table><tr><th style="width:24%">Situação</th><th>Quando</th></tr>
  <tr><td><span class="sem v">● Crítico</span></td><td>Há ação atrasada, ou impedimento crítico aberto em ação em curso.</td></tr>
  <tr><td><span class="sem a">▲ Atenção</span></td><td>A atualização semanal não foi enviada, ou há ação vencendo em até 2 dias.</td></tr>
  <tr><td><span class="sem g">✓ Em dia</span></td><td>Todo o resto.</td></tr></table>
  <h2>Perfis de acesso</h2>
  <table><tr><th style="width:24%">Perfil</th><th>O que faz</th></tr>
  <tr><td>Diretor</td><td>Direciona ações, decide prazos, conduz a reunião, administra estrutura e contas.</td></tr>
  <tr><td>Apoio do Diretor</td><td>O mesmo que o Diretor, exceto Estrutura; só decide prazos dentro de reunião em andamento.</td></tr>
  <tr><td>Chefe de seção</td><td>Age na própria seção e nas subseções; envia a atualização semanal; cadastra a equipe. Pode ter um <i>suplente</i> com os mesmos poderes.</td></tr>
  <tr><td>Membro da equipe</td><td>Vê a seção e age apenas no que é atribuído a ele ou criado por ele.</td></tr>
  <tr><td>Consulta</td><td>Somente lê as ações dos Centros.</td></tr>
  <tr><td>Administrador</td><td>Acesso total na empresa, inclusive contas, perfis e estrutura.</td></tr>
  <tr><td>Plataforma</td><td>Cria e administra as empresas; não vê dados de negócio.</td></tr></table>
  ${aviso('As imagens deste guia usam <b>dados fictícios</b>, de demonstração. Os nomes de telas e de tipos de unidade (Centro, Coordenação…) podem variar de uma empresa para outra.')}`),

  cap('acesso', 'Entrando e se orientando', `
  <h2>Entrar no sistema</h2>
  ${passos('Abra o endereço do Agilis no navegador.', 'Informe o <b>e-mail</b> e a <b>senha</b> da sua conta.', 'Se a conta foi criada por outra pessoa, o sistema pede que você <b>defina uma nova senha</b> no primeiro acesso.')}
  ${fig('01-entrada', 'Tela de entrada. <i>Nesta captura, o ambiente de demonstração mostra os perfis para escolha; em uso real, a entrada pede e-mail e senha.</i>')}
  <h2>A tela e o menu</h2>
  <p>No computador, o menu fica à esquerda e as telas disponíveis dependem do seu perfil. No alto há a <b>linha do tempo da semana</b>, que mostra a reunião de terça, o lembrete, o fechamento (segunda, 18h) e quanto falta para o prazo. Pequenos números vermelhos no menu indicam pendências (pedidos de prazo, ações novas ou a validar).</p>
  ${fig('02-painel', 'O menu à esquerda, a linha do tempo da semana no alto e, abaixo, a tela escolhida (aqui, o Painel da semana).')}
  <h2>Avisos no celular</h2>
  <p>Para receber no próprio celular o lembrete da atualização semanal, use <b>Avisos no celular</b> (no menu lateral ou em <b>Mais</b>, no celular). Quem recebe: Diretor, Apoio, Chefe e Administrador.</p>
  ${passos('Toque em <b>Avisos no celular</b> e depois em <b>Ativar avisos neste aparelho</b>.', 'Permita as notificações quando o navegador perguntar.', 'Toque em <b>Enviar um aviso de teste</b> para conferir que chega.')}
  ${fig('29-avisos-celular', 'Ativando os avisos neste aparelho.')}
  <ul><li>Os avisos chegam na <b>sexta, 15h</b> (lembrete) e na <b>segunda, 12h</b> (últimas horas); o Diretor recebe na <b>segunda, 18h</b> o resumo de quem não enviou.</li>
  <li>A mensagem nunca traz dados das ações, só o texto do lembrete. Tocar nela abre a tela certa.</li>
  <li>No <b>iPhone</b>, os avisos só funcionam com o Agilis instalado: toque em Compartilhar, depois em "Adicionar à Tela de Início", e abra o Agilis pelo ícone novo.</li>
  <li>Se você bloquear as notificações, só você desfaz: nas configurações do navegador ou do aparelho. Ao <b>sair</b> da conta, os avisos daquele aparelho param para você (importante em aparelho compartilhado).</li></ul>
  <h2>No celular</h2>
  <p>Até 760 px de largura o sistema vira um aplicativo: a barra inferior traz as telas principais e <b>Mais</b> abre o menu completo e a conta. Pelo navegador, use <b>Instalar aplicativo</b> para colocá-lo na tela inicial.</p>
  <div class="duas">${fig('30-cel-inicio', 'Início do chefe no celular.', 'cel')}${fig('31-cel-acoes', 'Minhas ações no celular.', 'cel')}</div>
  <h2>Compartilhar uma ação</h2>
  <p>Na ficha de qualquer ação há o botão <b>Copiar link da ação</b>. O endereço copiado abre aquela ação direto para quem tem acesso a ela (depois de entrar, se for preciso). Recarregar a página mantém a ação aberta.</p>`),

  cap('chefe', 'Guia do Chefe de seção', `
  <p>O chefe acompanha a própria seção e as subseções. Seu dia a dia gira em torno de quatro telas: <b>Início</b>, <b>Minhas ações</b>, <b>Minha atualização</b> e <b>Agenda</b>.</p>
  <h2>Início e "Sua semana"</h2>
  <p>O cartão <b>Sua semana</b> lista o que falta antes da reunião e leva direto ao que resolve cada item:</p>
  <ul><li><b>Atualização:</b> enviar a atualização da semana (com o prazo e quanto falta).</li><li><b>Atrasadas:</b> ações atrasadas para resolver.</li><li><b>Novas:</b> ações que chegaram e você ainda não abriu (quem direcionou fica sabendo que você viu).</li><li><b>Validações:</b> ações concluídas pela sua equipe, para você validar.</li><li><b>Vencem antes da reunião:</b> ações com prazo antes da reunião.</li></ul>
  <p>O título mostra quantos itens já estão em dia. O cartão ganha uma borda amarela quando faltam menos de 24 horas para o fechamento e vermelha depois do prazo regular. Abaixo, os quadros <i>Chegaram para você</i> e <i>Precisa de atenção</i> (atrasadas, sem andamento há 7 dias ou com prazo até a reunião, com botões rápidos de status e tempo) e o aviso vigente do Diretor, quando houver.</p>
  ${fig('20-chefe-inicio', 'Início do chefe de seção, com o cartão "Sua semana".')}
  <h3>A faixa de aviso</h3>
  <p>Enquanto a atualização da sua seção não for enviada, uma <b>faixa amarela</b> aparece no alto das telas de trabalho, da sexta, às 15h, até a reunião. Depois do prazo regular ela fica <b>vermelha</b>. Tem o botão para registrar a atualização e some assim que você envia.</p>
  ${fig('21-chefe-faixa', 'Faixa de aviso no alto de "Minhas ações".')}
  <h2>Minhas ações</h2>
  <p>Lista as ações da seção, com abas <i>Todas ativas</i>, <i>Abertas</i>, <i>Concluídas</i> e <i>Arquivadas</i>. Em cada cartão você muda o <b>status</b>, registra o <b>tempo</b> e acessa os detalhes. Os selos mostram o que mais importa (atrasada, nova, aguardando validação, prioridade, demandada pelo Diretor…); quando há mais de quatro, o resto fica atrás de um "+N".</p>
  <h3>Status e tempo</h3>
  <table><tr><th style="width:24%">Status</th><th>Significado</th></tr>
  <tr><td>A fazer</td><td>Ainda não começou. Voltar para este status <b>apaga todo o tempo registrado</b> (o sistema pede confirmação mostrando quanto será apagado) e a ação recomeça do zero.</td></tr>
  <tr><td>Em andamento</td><td>Em execução.</td></tr>
  <tr><td>Bloqueada</td><td>Só vale com a ação em andamento; indica impedimento. Use <i>retomar</i> para voltar.</td></tr>
  <tr><td>Concluída</td><td>Exige <b>tempo registrado maior que zero</b>. Os impedimentos abertos são resolvidos automaticamente.</td></tr></table>
  ${aviso('O tempo é informado em <b>minutos</b>. Sem tempo registrado, o sistema não permite concluir a ação.')}
  <h3>Ficha da ação</h3>
  <p>O botão <b>Detalhes e histórico</b> abre a ficha completa: origem, responsável, prioridade, esforço, prazo, tempo, <b>tarefas</b>, <b>impedimentos</b> e comentários. <b>Impedimentos</b> e <b>Comentários</b> são seções que se recolhem; Impedimentos abre sozinha quando há algum aberto. Tarefas servem de apoio e não alteram o status. Impedimentos são histórico: não se edita nem exclui; para corrigir, resolva e registre outro. <b>Copiar link da ação</b> gera o endereço para compartilhar.</p>
  ${fig('26-ficha-acao', 'Ficha da ação, com tarefas, impedimentos e comentários.')}
  <h3>Pedir novo prazo</h3>
  <p>O prazo de uma ação criada por outra pessoa só muda por <b>pedido</b>. Use <b>Pedir novo prazo</b>, informe a nova data e o motivo, e aguarde a decisão do Diretor.</p>
  ${fig('27-pedir-prazo', 'Pedido de novo prazo.')}
  <h3>Criar uma ação</h3>
  ${passos('Em <b>Minhas ações</b>, clique em <b>+ Nova ação</b>.', 'Informe título, detalhamento, prazo e prioridade.', 'Se quiser, escolha o <b>responsável</b> entre os membros da seção e informe o esforço estimado.', 'Clique para salvar.')}
  ${fig('28-nova-acao', 'Formulário de nova ação.')}
  <p>Você ainda pode <b>redirecionar</b> a ação para a própria seção ou subseções, <b>atribuir um responsável</b> e <b>validar</b> ou <b>devolver</b> (com o motivo) o que um membro concluiu.</p>
  <h2>Minha atualização (relato semanal)</h2>
  <p>O relato é <b>montado pelo sistema</b> a partir das suas ações e impedimentos: o que foi feito, o que está atrasado, o que está programado e o que trava. Você confere, acrescenta observações e envia até a <b>segunda, 18h</b>.</p>
  ${fig('22-chefe-atualizacao', 'Minha atualização: o relato montado automaticamente e o campo de observações.')}
  ${passos('Abra <b>Minha atualização</b>.', 'Confira cada bloco; se algo estiver errado, corrija na ação (status, prazo, impedimento) e volte.', 'Escreva as observações e envie a atualização. Você volta ao Início.')}
  ${dica('Se algo mudar depois do envio, a tela avisa que o relato está <b>desatualizado</b>. Enviar de novo cria uma nova versão; o histórico é mantido. O relato enviado nunca mostra o detalhe de ações internas, apenas contagens.')}
  <h2>Minha equipe</h2>
  <p>Cadastre os membros da seção, desative ou reative e redefina senhas. Ações atribuídas a quem for desativado continuam com o nome da pessoa, para você reatribuir.</p>
  ${fig('23-chefe-equipe', 'Minha equipe.')}
  <h2>Agenda</h2>
  <p>Calendário do mês com as ações da seção (pelo prazo, com círculo) e as tarefas (pela data, com quadrado). A marca fica vermelha só se aquela ação ou tarefa está atrasada. Use o filtro <i>De quem</i> → <b>Só o que é meu</b> para ver apenas as suas tarefas e as ações da sua própria seção.</p>
  ${fig('25-chefe-agenda', 'Agenda do chefe.')}
  <h2>Histórico, Combinados e Atas</h2>
  <p>O <b>Histórico</b> guarda as atualizações enviadas, da mais recente à mais antiga. Em <b>Combinados</b> e <b>Atas</b> você consulta o que foi definido nas reuniões. Participantes registrados podem <b>sugerir revisões</b> a uma ata publicada.</p>
  ${fig('24-chefe-historico', 'Histórico de atualizações enviadas.')}
  ${dica('Se a sua seção tem <b>suplente</b>, ele tem os mesmos poderes e responde na sua ausência.')}`),

  cap('membro', 'Guia do Membro da equipe', `
  <p>O membro enxerga todas as ações e tarefas da sua seção, mas <b>age apenas no que é dele</b>: ações atribuídas a ele ou criadas por ele.</p>
  <table><tr><th style="width:50%">Você pode</th><th>Você não pode</th></tr>
  <tr><td>Mudar status, prioridade e tempo das suas ações<br>Criar, editar e marcar tarefas<br>Registrar impedimentos e comentar<br>Criar ações para si<br>Marcar como feita a tarefa que é sua em ação de outra pessoa</td><td>Atribuir, arquivar ou redirecionar ações<br>Pedir novo prazo<br>Validar ou excluir o que não criou<br>Acessar relatos, reuniões, atas, estrutura e contas<br>Receber os avisos no celular</td></tr></table>
  <p>Em <b>Minhas ações</b> há duas abas: <b>Minhas</b> e <b>Da seção, só leitura</b>. A <b>Agenda</b> mostra suas tarefas e as ações que você executa (use o filtro <i>Só o que é meu</i>). Quando o chefe atribui uma ação, ela chega marcada como <b>nova</b>.</p>
  ${aviso('Se a ação passa por validação, ao concluí-la ela aguarda o chefe. Se o chefe devolver, o motivo aparece nos comentários.')}`),

  cap('diretor', 'Guia do Diretor e do Apoio', `
  <h2>Painel da semana</h2>
  <p>Mostra uma ficha por unidade, em <b>ordem de necessidade</b> (críticas primeiro). Em cada ficha:</p>
  <ul><li>o <b>motivo principal</b> da situação, em destaque, na ordem de gravidade: impedimento crítico, ação atrasada (com <i>há quantos dias está a pior</i>), atualização pendente, prazo chegando ou "Sem pendências";</li>
  <li><b>quatro números</b> sempre no mesmo lugar: atrasadas, vencem em 2 dias, pedidos de prazo e paradas há 7 dias ou mais (zero fica apagado; acima de zero ganha cor e continua com o rótulo escrito);</li>
  <li>em letra pequena, o horário da atualização e o tempo registrado na semana.</li></ul>
  <p>A barra no topo soma o total por situação. Use <b>Semana atual</b> e as setas para navegar entre semanas e <b>Versão para impressão</b> como plano B. O cartão inteiro é clicável.</p>
  ${fig('02b-painel-sem-menu', 'Painel da semana.')}
  <p>Ao abrir uma unidade você vê o detalhe: relato, ações abertas e recentes, tempo registrado e semanas anteriores.</p>
  ${fig('03-detalhe-secao', 'Detalhe de uma unidade.')}
  ${dica('Ações <b>internas</b> de subseções não aparecem para o Diretor nem para o Apoio, apenas contagens no resumo.')}
  <h2>Direcionar ação</h2>
  ${passos('Em <b>Direcionar ação</b>, escreva <b>o que precisa ser feito</b> e, se quiser, os detalhes.', 'Escolha <b>Para quem</b>: <i>Todos os Centros</i> ou <i>Escolher seções</i>.', 'Defina o <b>prazo</b> (obrigatório), a prioridade e, opcionalmente, o esforço estimado.', 'Clique em <b>Direcionar ação</b>. Se as seções já tiverem ações com o mesmo prazo, o sistema avisa e você escolhe <i>Direcionar mesmo assim</i> ou volta para revisar.')}
  ${fig('04-direcionar', 'Direcionar ação, com as últimas ações direcionadas ao lado.')}
  <p>À direita, <b>Últimas ações direcionadas</b> mostram o andamento e quais seções já viram a ação. O botão <b>Acrescentar seções</b> inclui outras seções no mesmo direcionamento.</p>
  <h2>Ações</h2>
  <p>Lista todas as ações, com filtros por seção, situação, origem, status e busca por texto. Uma diretriz enviada a várias seções aparece <b>agrupada</b>: uma linha com o total de seções, o prazo e a contagem por situação (a opção <i>Agrupar por diretriz</i> pode ser desligada). Clique no grupo para abrir as seções.</p>
  ${fig('05-acoes-agrupadas', 'Lista de ações com a diretriz agrupada.')}
  ${fig('05b-acoes-expandida', 'O grupo aberto: uma linha por seção, com o status de cada uma.')}
  <p>Ações concluídas que você demandou aguardam o seu <b>aceite</b> (ou devolução com motivo).</p>
  <h2>Pedidos de novo prazo</h2>
  <p>Cada pedido mostra a ação, o prazo atual e o proposto e a justificativa. Escolha <b>Aprovar novo prazo</b> ou <b>Recusar</b>. O <i>Apoio</i> só decide dentro de uma reunião em andamento.</p>
  ${fig('06-prazos', 'Pedidos de novo prazo pendentes.')}
  <h2>Agenda</h2>
  <p>Calendário do mês com as ações (pelo prazo, marcadas com círculo) e as tarefas (pela data, com quadrado). A marca fica vermelha só se aquela ação ou tarefa está atrasada. Clique em um dia para ver o painel à direita; os filtros <i>Mostrar</i> e <i>Seção</i> refinam a vista.</p>
  ${fig('10-agenda', 'Agenda de todas as seções.')}
  <h2>Produtividade</h2>
  <p>Indicadores das <b>unidades</b> (não de pessoas isoladas), sempre comparados ao período anterior de mesma duração: <b>entregas</b>, <b>pontualidade</b>, <b>retrabalho</b>, <b>tempo de ciclo</b>, <b>dedicação</b> registrada e <b>carga de hoje</b>.</p>
  ${fig('09-produtividade', 'Produtividade das unidades.')}
  ${aviso('Não compare unidades de natureza diferente nem use um indicador isolado para avaliar. A visão por pessoa é restrita ao Diretor, ao Administrador e ao chefe da própria unidade.')}
  <h2>Combinados</h2>
  <p>São os acordos de convivência lembrados na abertura da reunião. Você pode criar, editar, reordenar, desativar e <b>arquivar</b>, mas <b>nunca excluir</b>: cada reunião guarda uma cópia do que estava valendo. O sistema avisa quando há mais de 7 ativos e permite escolher quando aparecem (<i>sempre</i>, <i>primeira do mês</i> ou <i>quando mudarem</i>).</p>
  ${fig('07-combinados', 'Combinados da reunião.')}
  <h2>Quadro de avisos</h2>
  <p>O Diretor (e o Administrador) publica uma mensagem com início e fim, exibida em destaque no Início dos chefes. Só um aviso aparece por vez: o vigente mais recente.</p>
  ${fig('11-avisos', 'Quadro de avisos.')}
  <h2>Configuração (Estrutura)</h2>
  <p>O Diretor organiza as <b>seções</b> (Centros, Coordenações, Subseções e a Diretoria Adjunta), as <b>pessoas e acessos</b>, a rotina da <b>reunião semanal</b>, o <b>cabeçalho da ata</b> e os <b>nomes das unidades</b>. O Apoio acessa apenas a configuração da ata.</p>
  ${fig('12-estrutura', 'Configuração: organização das seções.')}`),

  cap('reuniao', 'Conduzindo a reunião de terça', `
  <h2>Antes da reunião</h2>
  ${passos('Conecte o notebook à TV por HDMI e abra o Agilis.', 'No menu, escolha <b>Iniciar reunião</b>. A tela de <b>conferência</b> mostra seções sem atualização, pedidos de prazo pendentes e os combinados.', 'Resolva o que for possível (por exemplo, decida os pedidos de prazo) e clique em <b>Iniciar reunião</b>.')}
  ${fig('40-reuniao-conferencia', 'Conferência antes de iniciar. Com a reunião em andamento, o botão passa a ser <i>Retomar reunião</i>.')}
  ${aviso('A reunião só é criada ao clicar em <b>Iniciar reunião</b>. Recarregar a página ou voltar no navegador <b>não</b> abre outra; uma reunião em andamento é retomada por <b>Retomar reunião</b>.')}
  <h2>Modo Reunião (TV)</h2>
  <p>A tela usa letras grandes e navega pelas <b>setas do teclado</b> (→ avança, ← volta). A sequência é: combinados, <b>visão geral</b> das seções em ordem de necessidade e <b>uma tela por seção</b>.</p>
  ${fig('41-reuniao-visao-geral', 'Visão geral: uma ficha por seção, da mais crítica para a mais tranquila.')}
  <p>Na tela de cada seção você vê o <b>relato</b> (feito, próximo, impedimentos, apoio necessário) e, ao lado, as <b>ações e decisões</b>. Tudo é editado ao vivo, sem sair da reunião:</p>
  <ul><li>abra uma ação para ver ou alterar o detalhe;</li><li><b>Registrar decisão</b> e <b>Nova ação</b>, direto no cartão da seção;</li><li><b>Presença</b>: marque quem participou (titulares e suplentes); a ordem da seleção é guardada;</li><li><b>Registrar informação</b>: comunicados e contexto que não são ação nem decisão;</li><li>aprove ou recuse pedidos de prazo na hora.</li></ul>
  ${fig('42-reuniao-secao', 'Tela de uma seção durante a reunião.')}
  <h2>Encerrando e publicando a ata</h2>
  ${passos('Clique em <b>Encerrar reunião</b>. O sistema gera a <b>ata em rascunho</b> e marca as ações apresentadas.', 'Em <b>Reuniões e atas</b>, abra a reunião e revise o texto com a barra de formatação (negrito, itálico, listas).', 'Clique em <b>Baixar PDF</b> se quiser uma cópia (papel A4).', 'Clique em <b>Enviar ata</b> para liberar a leitura aos chefes.')}
  ${fig('08-reunioes', 'Reuniões e atas.')}
  ${dica('Depois de enviada, a ata ainda pode ser editada pela gestão. <b>Reabrir</b> a reunião só é possível enquanto a ata é rascunho. A ata não lista combinados no texto: eles ficam guardados à parte na reunião.')}
  <p>Plano B: se a TV falhar, use a <b>Versão para impressão</b> da pauta, no Painel.</p>`),

  cap('outros', 'Consulta, Administrador e Plataforma', `
  <h2>Perfil Consulta</h2>
  <p>Em <b>Ações dos Centros</b> você lê as ações de todos os Centros (sem as internas e sem relatos) e usa a <b>Agenda</b>. Nenhum botão de alteração aparece. Chefes também podem receber essa permissão do Diretor ou do Administrador.</p>
  <h2>Administrador</h2>
  <p>Faz tudo o que Diretor, Apoio e Chefe fazem, em qualquer seção, e gerencia contas, perfis e estrutura. Pode excluir uma versão do histórico de atualizações (para corrigir um envio de teste ou por engano). O Administrador vinculado à <b>Diretoria Adjunta</b> usa a tela <b>Início da seção</b>, como um chefe.</p>
  <h2>Plataforma</h2>
  <p>Na tela <b>Empresas</b>, o perfil Plataforma cria uma empresa com o seu primeiro Diretor, edita nome e sigla, oculta a empresa da lista de entrada e a desativa ou reativa (desativar encerra as sessões). Não acessa dados de negócio.</p>`),

  cap('duvidas', 'Dúvidas frequentes', `
  <table class="faq"><tr><th style="width:36%">Pergunta</th><th>Resposta</th></tr>
  <tr><td>Não consigo concluir a ação.</td><td>Registre o tempo gasto (em minutos, maior que zero) antes de concluir.</td></tr>
  <tr><td>Quero mudar o prazo de uma ação que recebi.</td><td>Use <i>Pedir novo prazo</i>; o Diretor decide. O autor da ação altera o prazo direto pela edição.</td></tr>
  <tr><td>Enviei a atualização e algo mudou.</td><td>Envie novamente: cria nova versão e o histórico é mantido.</td></tr>
  <tr><td>Passou das 18h de segunda.</td><td>Ainda é possível enviar correção, mas a unidade pode ter aparecido como pendente.</td></tr>
  <tr><td>A faixa amarela não some.</td><td>Ela some quando a atualização da sua seção é enviada. Envie pela tela <i>Minha atualização</i>.</td></tr>
  <tr><td>Não recebo os avisos no celular.</td><td>Confira se ativou em <i>Avisos no celular</i> neste aparelho, se as notificações não estão bloqueadas e, no iPhone, se abriu o Agilis pelo ícone instalado. Sair da conta desliga os avisos do aparelho.</td></tr>
  <tr><td>Perdi o tempo registrado.</td><td>Voltar a ação para <i>A fazer</i> apaga o tempo registrado e deixa um comentário com o total excluído.</td></tr>
  <tr><td>Por que não vejo as ações de outra seção?</td><td>O chefe só vê a própria árvore. Chefes com permissão e o perfil Consulta leem as ações dos Centros, apenas em leitura.</td></tr>
  <tr><td>Posso excluir um combinado?</td><td>Não: apenas arquivar, para preservar o histórico das reuniões.</td></tr>
  <tr><td>Posso apagar um impedimento?</td><td>Não. Resolva-o e, se preciso, registre outro.</td></tr>
  <tr><td>Esqueci a senha.</td><td>Peça ao chefe (para membros) ou ao Diretor/Administrador para redefinir; no próximo acesso você define uma nova.</td></tr></table>
  <div class="fim">Agilis · Departamento de Planejamento, Orçamento e Gestão</div>`),
  ].join('\n');
  return { corpo, caps };
}
