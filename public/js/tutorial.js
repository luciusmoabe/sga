// Tutorial guiado: lições curtas, por perfil, que levam a pessoa de tela em tela e destacam cada parte da interface.
//
// Regras do módulo:
//   - Só ensina: nunca grava nada no servidor. Os passos destacam, explicam e, no máximo, pedem um clique de navegação.
//   - Nenhum passo abre diálogo (um <dialog> modal deixaria o painel do tutorial inerte); a ficha da ação é explicada à parte.
//   - Se o destaque não existe (tela vazia, perfil sem aquela parte), o passo aparece sem destaque, no painel.
//   - O progresso fica só neste navegador (localStorage, com try/catch): quem limpar os dados do site recomeça.
//   - Texto de passo é HTML escrito aqui (confiável); qualquer valor que venha do sistema passa por `esc()`.
import { $, esc } from './ui.js';
import { est } from './estado.js';
import { OTopo, doTopo, oTopo } from './vocab.js';

const PERFIS_COM_TUTORIAL = ['diretor', 'apoio', 'chefe', 'membro', 'consulta', 'administrador'];
export const temTutorial = (perfil) => PERFIS_COM_TUTORIAL.includes(perfil);

// ---------------------------------------------------------------- conteúdo
const visivel = (e) => !!e && e.getClientRects().length > 0;
/** Alvos do menu: a lateral no computador, as abas no celular. */
const menu = (rota) => [`.menu a[data-rota="${rota}"]`, `.abas-movel a[data-rota="${rota}"]`];
const eh = (...perfis) => perfis.includes(est.user?.perfil);

const PASSOS_COMUNS = () => [
  { rota: null, titulo: 'Bem-vindo ao Agilis', texto: 'Este tutorial leva você pelas telas que o seu perfil usa. <b>Ele só mostra: não grava nem altera nada</b>, então pode clicar sem medo. Use <b>Próximo</b> para avançar e <b>Sair</b> quando quiser; você retoma depois.' },
  { rota: null, alvo: ['.menu', '.abas-movel'], titulo: 'O menu', texto: 'Aqui ficam as telas disponíveis para <b>o seu perfil</b>. Os pequenos números que aparecem ao lado mostram pendências (ações novas, pedidos de prazo).' },
  { rota: null, alvo: menu('agenda'), clicar: true, titulo: 'Agora é com você', texto: 'Clique em <b>Agenda</b> para abrir o calendário.' },
  { rota: '#/agenda', alvo: '#cal-grade', titulo: 'A Agenda', texto: 'Cada dia mostra o que vence nele: <b>círculo</b> = ação, <b>quadrado</b> = tarefa. A marca fica <b>vermelha</b> só quando aquela ação ou tarefa está atrasada. Clique num dia para ver os detalhes ao lado.' },
  { rota: '#/agenda', alvo: ['#cal-f-mostrar', '.cal-filtros-wrap'], titulo: 'Filtros da Agenda', texto: 'Escolha o que mostrar (tudo, só ações, só tarefas)' + (eh('chefe', 'membro', 'administrador') ? ' e use <b>Só o que é meu</b> para ver apenas o que está com você.' : ' e filtre por seção.') },
];

function licoes() {
  const chefe = eh('chefe');
  const membro = eh('membro');
  const consulta = eh('consulta');
  const gestao = eh('diretor', 'apoio', 'administrador');
  const L = [{ id: 'comeco', titulo: 'Conhecendo o Agilis', resumo: 'O menu, a Agenda e como o tutorial funciona.', passos: PASSOS_COMUNS() }];

  if (chefe) {
    L.push(
      { id: 'inicio', titulo: 'Sua semana, no Início', resumo: 'O que falta fazer antes da reunião.', passos: [
        { rota: '#/inicio', alvo: '.sua-semana', titulo: 'Sua semana', texto: 'Este cartão lista <b>o que falta antes da reunião</b>: a atualização, ações atrasadas, ações novas, validações e o que vence antes da reunião. Cada item leva direto à tela que resolve.' },
        { rota: '#/inicio', alvo: ['.atencao-quadro', '.novas-quadro'], titulo: 'Quadros de atenção', texto: 'Quando houver, aparecem aqui <b>Chegaram para você</b> (ações novas), <b>Aguardando sua validação</b> e <b>Precisa de atenção</b> (atrasadas ou sem movimento há 7 dias), com botões rápidos de status e tempo.' },
        { rota: '#/inicio', alvo: '#trilho', titulo: 'A linha do tempo da semana', texto: 'Mostra a reunião, o lembrete (sexta, 15h) e o <b>fechamento: segunda, 18h</b>. Da sexta até a reunião, uma <b>faixa amarela</b> no alto das telas lembra a atualização, e fica vermelha depois do prazo.' },
      ] },
      { id: 'gestao', titulo: 'Gestão da seção', resumo: 'O painel para liderar a equipe da semana.', passos: [
        { rota: '#/gestao', alvo: '#gestao-radar', titulo: 'O que precisa de você hoje', texto: 'O <b>radar</b> reúne, por gravidade, o que pede a sua decisão: impedimento crítico, atrasos, validações, prazos chegando e ações paradas. Clique numa ação para abrir a ficha.' },
        { rota: '#/gestao', alvo: ['#gestao-fluxo', '#gestao-horizonte'], titulo: 'Fluxo e prazos', texto: 'Veja quanto está <b>a fazer, em andamento e bloqueado</b> e como se distribuem os prazos. Muita coisa começada e pouca terminada é sinal para priorizar.' },
        { rota: '#/gestao', alvo: '#gestao-semanas', titulo: 'Estamos entregando?', texto: 'As entregas das últimas 8 semanas mostram o <b>ritmo</b> da equipe e quantas saíram no prazo. Olhe a tendência, não uma semana isolada.' },
        { rota: '#/gestao', alvo: '#gestao-equipe', titulo: 'Carga da equipe', texto: 'Quem tem mais a resolver aparece primeiro, com sinais em texto (atrasada, parada, carga alta). Serve para <b>distribuir melhor e conversar</b>, não para ranquear.' },
        { rota: '#/gestao', alvo: '#gestao-conversas', titulo: 'Conversas que valem a pena', texto: 'Sugestões geradas pelos números para a reunião da equipe e os 1:1: <b>apoiar</b> quem está travado, <b>alinhar</b> prioridades e <b>reconhecer</b> boas entregas.' },
      ] },
      { id: 'acoes', titulo: 'Trabalhando suas ações', resumo: 'Status, tempo, tarefas, impedimentos e novo prazo.', passos: [
        { rota: '#/minhas-acoes', alvo: '.abas-lista', titulo: 'Suas ações', texto: 'As abas separam <b>Todas ativas</b>, <b>Abertas</b>, <b>Concluídas</b> e <b>Arquivadas</b>.' },
        { rota: '#/minhas-acoes', alvo: '.cartao.acao', titulo: 'Cada cartão é uma ação', texto: 'Os selos mostram o que importa (atrasada, nova, aguardando validação). Por aqui você muda o <b>status</b> e registra o <b>tempo em minutos</b>. <b>Concluir exige tempo maior que zero.</b>' },
        { rota: '#/minhas-acoes', alvo: '.cartao.acao', titulo: 'A ficha da ação', texto: 'Em <b>Detalhes e histórico</b> você cria <b>tarefas</b> (apoio, não mudam o status), registra <b>impedimentos</b> (quem trava a ação; ficam como histórico, não se apagam) e comenta. Em ação criada por outra pessoa, o prazo só muda pelo botão <b>Pedir novo prazo</b>.' },
        { rota: '#/minhas-acoes', alvo: '#btn-nova-acao', titulo: 'Criar uma ação', texto: 'Informe título, prazo, prioridade e, se quiser, o <b>responsável</b> entre os membros da sua seção. A ação chega para ele como "nova". Quando ele concluir, você <b>valida</b> ou <b>devolve</b> com o motivo.' },
      ] },
      { id: 'atualizacao', titulo: 'Enviando a atualização semanal', resumo: 'O passo mais importante da semana.', passos: [
        { rota: '#/atualizacao', alvo: '.cabeca', titulo: 'Quando enviar', texto: 'O prazo é <b>segunda-feira, 18h</b>. Se passar, a seção aparece como pendente na reunião.' },
        { rota: '#/atualizacao', alvo: '#form-at', titulo: 'O relato já vem pronto', texto: 'O sistema monta o relato com as suas ações e impedimentos: o que foi feito, o que está atrasado, o que vence e o que trava. <b>Algo errado? Corrija na própria ação</b> e volte: o relato se refaz.' },
        { rota: '#/atualizacao', alvo: '#obs', titulo: 'Observações e envio', texto: `Acrescente o que ${oTopo()} precisa saber e envie. Se algo mudar depois, a tela avisa que o relato está <b>desatualizado</b>: envie de novo (cria nova versão; o histórico fica em <b>Histórico</b>).` },
      ] },
      { id: 'equipe', titulo: 'Sua equipe e as reuniões', resumo: 'Membros, combinados e atas.', passos: [
        { rota: '#/equipe', alvo: '#conteudo .cabeca', titulo: 'Minha equipe', texto: 'Cadastre os membros da seção, escolha quem é <b>Membro</b> ou <b>Suplente</b> (o suplente tem os mesmos poderes que você), desative quem sair e redefina senhas.' },
        { rota: '#/combinados', alvo: '#conteudo .cabeca', titulo: 'Combinados', texto: 'Os acordos lembrados na abertura das reuniões. Você consulta aqui o que está valendo.' },
        { rota: '#/atas', alvo: '#conteudo .cabeca', titulo: 'Reuniões e atas', texto: 'As atas enviadas ficam aqui. Quem participou pode <b>sugerir revisão</b>. Para reunir a sua própria equipe, use o seletor de <b>equipe</b> no alto da tela.' },
      ] },
    );
  }

  if (membro) {
    L.push(
      { id: 'acoes', titulo: 'Suas ações', resumo: 'O que é seu e como executar.', passos: [
        { rota: '#/minhas-acoes', alvo: '.segmento', titulo: 'Minhas e da seção', texto: '<b>Minhas</b> traz o que foi atribuído a você ou criado por você. <b>Da seção (só leitura)</b> mostra o resto, sem alteração.' },
        { rota: '#/minhas-acoes', alvo: '.cartao.acao', titulo: 'Executando', texto: 'Na ficha da ação você muda status e prioridade, registra o <b>tempo em minutos</b> (concluir exige tempo maior que zero), cria e marca <b>tarefas</b>, registra impedimentos e comenta. Se o seu chefe valida o que você conclui, ele pode devolver com um motivo: leia nos comentários.' },
        { rota: '#/minhas-acoes', titulo: 'O que não é seu', texto: 'Em ação de outra pessoa você só marca a tarefa que é sua e comenta onde tem tarefa. Relatos, reuniões e contas são com o seu chefe.' },
      ] },
      { id: 'agenda', titulo: 'Sua Agenda', resumo: 'Tarefas e ações por dia.', passos: [
        { rota: '#/agenda', alvo: '#cal-f-escopo', titulo: 'Só o que é meu', texto: 'Escolha <b>Só o que é meu</b> para ver suas tarefas e as ações que você executa. Dá para marcar a tarefa como feita direto no calendário.' },
        { rota: '#/atas', alvo: '#conteudo .cabeca', titulo: 'Atas', texto: 'As atas das reuniões da equipe, enviadas, em que você esteve presente.' },
      ] },
    );
  }

  if (consulta) {
    L.push({ id: 'acoes', titulo: 'Acompanhando as ações', resumo: 'Leitura de todas as ações.', passos: [
      { rota: '#/acoes-centros', alvo: '#conteudo .cabeca', titulo: 'Ações das unidades', texto: 'Aqui você lê as ações de todas as unidades, sem as internas. Abra uma ação para ver o histórico completo. <b>Nenhum botão de alteração aparece</b>: o seu perfil é só de leitura.' },
    ] });
  }

  if (gestao) {
    const topo = OTopo();
    L.push(
      { id: 'painel', titulo: 'O Painel da semana', resumo: 'Qual unidade pede atenção primeiro.', passos: [
        { rota: '#/painel', alvo: '#trilho', titulo: 'A semana', texto: 'A linha do tempo mostra a reunião, o lembrete e o fechamento (segunda, 18h). A barra abaixo soma as unidades por situação.' },
        { rota: '#/painel', alvo: '.grade', titulo: 'Um cartão por unidade', texto: 'Em <b>ordem de necessidade</b>: as críticas primeiro. Cada cartão traz o <b>motivo principal</b> (impedimento crítico, atraso, atualização pendente…) e quatro números fixos: atrasadas, vencem em 2 dias, pedidos de prazo e paradas há 7+ dias. Clique no cartão para ver o detalhe.' },
        { rota: '#/painel', alvo: ['.cabeca'], titulo: 'Cor, forma e texto', texto: '<b>● Crítico</b>: ação atrasada ou impedimento crítico. <b>▲ Atenção</b>: atualização não enviada ou prazo em até 2 dias. <b>✓ Em dia</b>: o resto. Nunca só pela cor.' },
      ] },
      { id: 'direcionar', titulo: 'Direcionando ações', resumo: 'Pedir um trabalho às seções.', passos: [
        { rota: '#/direcionar', alvo: '#d-titulo', titulo: 'O que precisa ser feito', texto: 'Escreva a ação com clareza. O detalhamento é opcional.' },
        { rota: '#/direcionar', alvo: '#alvos', titulo: 'Para quem', texto: 'Para todas as unidades de uma vez ou só para as seções escolhidas. Se elas já tiverem ações com o mesmo prazo, o sistema avisa antes de criar.' },
        { rota: '#/direcionar', alvo: '#d-prazo', titulo: 'Prazo obrigatório', texto: 'Toda ação direcionada tem prazo. Depois, em <b>Últimas ações direcionadas</b>, você vê quem já abriu a ação e pode <b>Acrescentar seções</b>.' },
      ] },
      { id: 'acompanhar', titulo: 'Acompanhando e decidindo', resumo: 'Lista de ações, pedidos de prazo e aceite.', passos: [
        { rota: '#/acoes', alvo: '.filtros-acoes', titulo: 'Todas as ações', texto: 'Filtre por seção, situação, origem e status, ou busque por texto. Uma ação enviada a várias seções aparece <b>agrupada</b>.' },
        { rota: '#/prazos', alvo: '#conteudo .cabeca', titulo: 'Pedidos de novo prazo', texto: `Cada pedido traz o prazo atual, o proposto e a justificativa. ${topo} decide: <b>Aprovar</b> ou <b>Recusar</b>. O Apoio só decide dentro de uma reunião em andamento.` },
        { rota: '#/acoes', alvo: '#lista-acoes', titulo: 'Aceite', texto: `Ações concluídas que ${doTopo()} demandou esperam o <b>aceite</b> (ou a devolução, com motivo). Se foram delegadas a um membro, o chefe valida primeiro.` },
      ] },
      { id: 'reuniao', titulo: 'Conduzindo a reunião', resumo: 'Do Iniciar reunião à ata enviada.', passos: [
        { rota: '#/reuniao', alvo: '#iniciar-reuniao', titulo: 'Antes de começar', texto: 'Conecte o notebook à TV por HDMI. A conferência mostra seções sem atualização, pedidos de prazo e combinados. <b>A reunião só é criada ao clicar em Iniciar reunião</b>; recarregar a página não abre outra.' },
        { rota: '#/reuniao', titulo: 'Durante a reunião (Modo TV)', texto: 'Letras grandes e <b>setas do teclado</b> (→ avança, ← volta): combinados → visão geral → uma tela por seção. Em cada seção você lê o relato, edita ações, <b>decide pedidos de prazo</b>, <b>registra decisões</b>, cria <b>novas ações</b>, anota informações e marca a <b>presença</b>.' },
        { rota: '#/reuniao', titulo: 'Encerrar e enviar a ata', texto: '<b>Encerrar reunião</b> gera a ata em rascunho. Em <b>Reuniões e atas</b> você revisa o texto, baixa o PDF e <b>envia</b> a ata aos chefes. Plano B se a TV falhar: <b>Versão para impressão</b> da pauta, no Painel.' },
        { rota: '#/reunioes', alvo: '#conteudo .cabeca', titulo: 'Reuniões e atas', texto: 'Aqui ficam as reuniões. Depois de enviada, a ata ainda pode ser editada pela gestão.' },
      ] },
      { id: 'organizacao', titulo: 'Combinados, avisos e configuração', resumo: 'Acordos, mensagens e estrutura.', passos: [
        { rota: '#/combinados', alvo: '#conteudo .cabeca', titulo: 'Combinados', texto: 'Crie, edite e reordene. Para tirar um combinado, <b>arquive</b>: nunca se exclui, porque cada reunião guarda uma cópia do que estava valendo. Acima de 7 ativos, o sistema avisa.' },
        ...(eh('diretor', 'administrador') ? [
          { rota: '#/avisos', alvo: '#conteudo .cabeca', titulo: 'Quadro de avisos', texto: 'Uma mensagem com início e fim, exibida em destaque no Início dos chefes. Só uma aparece por vez: a vigente mais recente.' },
          { rota: '#/estrutura', alvo: '#conteudo .cabeca', titulo: 'Configuração', texto: 'Organize as seções, as pessoas e acessos, a rotina da reunião, o cabeçalho da ata e os nomes das unidades.' },
        ] : [
          { rota: '#/configuracao', alvo: '#conteudo .cabeca', titulo: 'Configuração da ata', texto: 'Aqui você configura o cabeçalho e a rotina da ata das reuniões.' },
        ]),
        { rota: '#/produtividade', alvo: '#conteudo .cabeca', titulo: 'Produtividade', texto: 'Indicadores das <b>unidades</b>, sempre comparados com o período anterior. Não use um indicador sozinho nem compare unidades de natureza diferente.' },
      ] },
    );
  }
  return L;
}

// ---------------------------------------------------------------- progresso (só neste navegador)
const chave = () => `agilis:tutorial:${est.user?.id}`;
const ler = () => { try { return JSON.parse(localStorage.getItem(chave()) || '{}'); } catch { return {}; } };
const gravar = (dados) => { try { localStorage.setItem(chave(), JSON.stringify(dados)); } catch { /* sem armazenamento: o tutorial funciona, só não lembra */ } };
const feitas = () => new Set(ler().feitas || []);
const marcarFeita = (id) => { const d = ler(); d.feitas = [...new Set([...(d.feitas || []), id])]; gravar(d); };
const marcarConvite = () => { const d = ler(); d.convidado = true; gravar(d); };

// ---------------------------------------------------------------- painel
let painel = null, foco = null, lista = [], licao = null, passoI = 0, alvoEl = null, abertoPor = null, espera = null, relogio = null;
let ouvintes = [];

const caminho = (h) => (h || '').split('?')[0];
const naRota = (r) => !r || caminho(location.hash) === caminho(r);
const celular = () => window.matchMedia?.('(max-width: 760px)').matches;
const achar = (alvo) => {
  for (const s of [].concat(alvo || [])) { const e = typeof s === 'function' ? s() : document.querySelector(s); if (visivel(e)) return e; }
  return null;
};

function garantirPainel() {
  if (painel) return painel;
  painel = document.createElement('section');
  painel.className = 'tut';
  painel.tabIndex = -1;
  painel.setAttribute('role', 'dialog');
  painel.setAttribute('aria-modal', 'false');
  painel.setAttribute('aria-labelledby', 'tut-titulo');
  painel.setAttribute('aria-describedby', 'tut-corpo');
  foco = document.createElement('div');
  foco.className = 'tut-foco';
  foco.setAttribute('aria-hidden', 'true');
  document.body.append(foco, painel);
  const aoTeclar = (ev) => { if (ev.key === 'Escape' && !document.querySelector('dialog[open]')) fechar(); };
  const aoClicar = (ev) => {
    const p = licao?.passos[passoI];
    if (p?.clicar && alvoEl && alvoEl.contains(ev.target)) setTimeout(() => { if (licao?.passos[passoI] === p) proximo(); }, 250);
  };
  const reposicionar = () => { if (alvoEl) posicionar(); };
  document.addEventListener('keydown', aoTeclar);
  document.addEventListener('click', aoClicar, true);
  window.addEventListener('resize', reposicionar);
  window.addEventListener('scroll', reposicionar, true);
  window.addEventListener('hashchange', aoMudarRota);
  ouvintes = [['keydown', aoTeclar, document], ['click', aoClicar, document, true], ['resize', reposicionar, window], ['scroll', reposicionar, window, true], ['hashchange', aoMudarRota, window]];
  relogio = setInterval(reposicionar, 400); // a tela pode se reorganizar sozinha (dados chegando, filtros)
  painel.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tut]');
    if (!b) return;
    const a = b.dataset.tut;
    if (a === 'proximo') proximo(); else if (a === 'voltar') voltar(); else if (a === 'sair') fechar();
    else if (a === 'lista') abrirLista(); else if (a === 'licao') iniciar(b.dataset.id);
    else if (a === 'ir') irParaRota();
  });
  return painel;
}

function fechar() {
  clearInterval(relogio); clearTimeout(espera);
  for (const [tipo, fn, alvo, cap] of ouvintes) alvo.removeEventListener(tipo, fn, cap);
  ouvintes = [];
  painel?.remove(); foco?.remove();
  painel = foco = alvoEl = licao = null;
  if (abertoPor?.isConnected) abertoPor.focus?.();
  abertoPor = null;
}

function desenhar({ titulo, corpo, rodape, modo }) {
  painel.dataset.modo = modo || 'passo';
  painel.innerHTML = `<div class="tut-cab"><span class="tut-rotulo">Tutorial guiado</span><button type="button" class="tut-x" data-tut="sair" aria-label="Sair do tutorial">×</button></div>
    <h2 id="tut-titulo" class="tut-titulo">${titulo}</h2><div id="tut-corpo" class="tut-corpo">${corpo}</div><div class="tut-rodape">${rodape}</div>`;
  painel.focus({ preventScroll: true });
}

function abrirLista() {
  lista = licoes();
  licao = null; alvoEl = null;
  foco.classList.remove('visivel');
  const ok = feitas();
  const concluidas = lista.filter((l) => ok.has(l.id)).length;
  desenhar({
    modo: 'lista',
    titulo: 'Escolha uma lição',
    corpo: `<p class="tut-sub">${concluidas} de ${lista.length} concluídas. Cada lição leva poucos minutos e não altera nenhum dado.</p>
      <ol class="tut-licoes">${lista.map((l) => `<li><button type="button" data-tut="licao" data-id="${esc(l.id)}"><span class="tut-marca${ok.has(l.id) ? ' feita' : ''}" aria-hidden="true">${ok.has(l.id) ? '✓' : ''}</span><span><b>${esc(l.titulo)}</b><small>${esc(l.resumo)}${ok.has(l.id) ? ' · concluída' : ''}</small></span></button></li>`).join('')}</ol>`,
    rodape: '<button type="button" class="btn btn-fantasma btn-mini" data-tut="sair">Fechar</button>',
  });
  posicionar();
}

export function abrirTutorial(botao) {
  if (!est.user || !temTutorial(est.user.perfil)) return;
  if (painel) { painel.focus({ preventScroll: true }); return; }
  abertoPor = botao || document.activeElement;
  garantirPainel();
  abrirLista();
}

function iniciar(id) {
  licao = lista.find((l) => l.id === id);
  if (!licao) return abrirLista();
  passoI = 0;
  mostrar();
}

const proximo = () => { if (!licao) return; if (passoI >= licao.passos.length - 1) return concluir(); passoI += 1; mostrar(); };
const voltar = () => { if (licao && passoI > 0) { passoI -= 1; mostrar(); } };

function concluir() {
  marcarFeita(licao.id);
  const i = lista.indexOf(licao);
  const ok = feitas();
  const seguinte = lista.slice(i + 1).concat(lista.slice(0, i)).find((l) => !ok.has(l.id));
  const tudo = lista.every((l) => ok.has(l.id));
  alvoEl = null; foco.classList.remove('visivel');
  desenhar({
    modo: 'fim',
    titulo: tudo ? 'Tutorial concluído 🎉' : 'Lição concluída ✓',
    corpo: tudo ? '<p>Você viu todas as lições do seu perfil. O tutorial fica sempre disponível no botão <b>Tutorial</b>, se quiser rever alguma.</p>'
      : `<p>Você terminou <b>${esc(licao.titulo)}</b>.</p>${seguinte ? `<p class="tut-sub">Próxima sugerida: <b>${esc(seguinte.titulo)}</b>.</p>` : ''}`,
    rodape: `${seguinte ? `<button type="button" class="btn btn-primario btn-mini" data-tut="licao" data-id="${esc(seguinte.id)}">Próxima lição</button>` : ''}<button type="button" class="btn btn-sec btn-mini" data-tut="lista">Ver as lições</button><button type="button" class="btn btn-fantasma btn-mini" data-tut="sair">Sair</button>`,
  });
  licao = null; posicionar();
}

function irParaRota() { const p = licao?.passos[passoI]; if (p?.rota) { location.hash = p.rota; } }

/** Mostra o passo atual: vai para a tela certa, espera o destaque existir (até 4 s) e então desenha. */
function mostrar() {
  clearTimeout(espera);
  const p = licao.passos[passoI];
  const antes = licao;
  const vai = !!p.rota && !naRota(p.rota);
  if (vai) location.hash = p.rota;
  const inicio = Date.now();
  const tentar = () => {
    if (licao !== antes || licao.passos[passoI] !== p) return;
    if (document.body.classList.contains('carregando')) { espera = setTimeout(tentar, 120); return; }
    const el = achar(p.alvo);
    if (el || !p.alvo || Date.now() - inicio > 4000) { alvoEl = el; desenharPasso(p); return; }
    espera = setTimeout(tentar, 120);
  };
  if (vai) espera = setTimeout(tentar, 250); // dá tempo de a tela nova começar a montar (a antiga ainda tem os mesmos seletores)
  else tentar();
}

function desenharPasso(p) {
  const total = licao.passos.length;
  const ultimo = passoI === total - 1;
  const forado = !naRota(p.rota);
  desenhar({
    modo: 'passo',
    titulo: esc(p.titulo),
    corpo: `<p class="tut-licao">${esc(licao.titulo)} · passo ${passoI + 1} de ${total}</p>
      <div class="tut-barra" aria-hidden="true"><i style="width:${Math.round(((passoI + 1) / total) * 100)}%"></i></div>
      <p>${p.texto}</p>${p.alvo && !alvoEl && !forado ? '<p class="tut-sub">Nesta tela ainda não há nada para destacar aqui, mas o que foi explicado vale quando aparecer.</p>' : ''}
      ${forado ? '<p class="tut-sub">Você saiu da tela desta lição.</p>' : ''}${p.clicar ? '<p class="tut-sub">Você também pode usar <b>Próximo</b>.</p>' : ''}`,
    rodape: `<button type="button" class="btn btn-fantasma btn-mini" data-tut="lista">Lições</button>
      ${passoI > 0 ? '<button type="button" class="btn btn-sec btn-mini" data-tut="voltar">Voltar</button>' : ''}
      ${forado ? '<button type="button" class="btn btn-sec btn-mini" data-tut="ir">Ir para a tela</button>' : ''}
      <button type="button" class="btn btn-primario btn-mini" data-tut="proximo">${ultimo ? 'Concluir lição' : 'Próximo'}</button>`,
  });
  if (alvoEl) alvoEl.scrollIntoView({ block: 'center', inline: 'nearest' });
  posicionar();
}

/** O usuário navegou por conta própria: se o destaque sumiu, o passo continua no painel, sem destaque. */
function aoMudarRota() {
  if (!painel || !licao) return;
  const p = licao.passos[passoI];
  if (naRota(p.rota)) { clearTimeout(espera); mostrar(); } else { alvoEl = null; desenharPasso(p); }
}

const cruza = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
function posicionar() {
  if (!painel) return;
  const p = licao?.passos[passoI];
  if (p?.alvo && naRota(p.rota) && (!alvoEl || !alvoEl.isConnected || !visivel(alvoEl))) alvoEl = achar(p.alvo); // a tela foi remontada
  else if (alvoEl && !visivel(alvoEl)) alvoEl = null;
  const r = alvoEl?.getBoundingClientRect();
  if (r) {
    const m = 6;
    Object.assign(foco.style, { left: `${r.left - m}px`, top: `${r.top - m}px`, width: `${r.width + 2 * m}px`, height: `${r.height + 2 * m}px` });
    foco.classList.add('visivel');
  } else foco.classList.remove('visivel');
  // Posição do painel: o primeiro canto que não cobre o destaque.
  const cantos = celular() ? ['baixo', 'cima'] : ['direita-baixo', 'esquerda-baixo', 'direita-cima', 'esquerda-cima'];
  const livre = !r ? (painel.dataset.modo === 'passo' && !celular() ? 'centro' : cantos[0]) : null;
  if (livre) { painel.dataset.pos = livre; return; }
  for (const c of cantos) {
    painel.dataset.pos = c;
    if (!cruza(painel.getBoundingClientRect(), r)) return;
  }
}

/** Convite de primeira vez: aparece uma vez por pessoa (neste navegador), sem bloquear nada. */
let convidouNaSessao = null;
export function convidarSeNovo() {
  if (!est.user || !temTutorial(est.user.perfil) || painel || convidouNaSessao === est.user.id) return;
  convidouNaSessao = est.user.id;
  if (ler().convidado || feitas().size) return;
  marcarConvite();
  abertoPor = null;
  garantirPainel();
  desenhar({
    modo: 'convite',
    titulo: 'Primeira vez por aqui?',
    corpo: '<p>Faça o <b>tutorial guiado</b>: lições curtas, de poucos minutos, que mostram o Agilis na prática. Nada que você fizer ali altera dados.</p><p class="tut-sub">Depois, ele fica no botão <b>Tutorial</b>.</p>',
    rodape: '<button type="button" class="btn btn-primario btn-mini" data-tut="lista">Começar</button><button type="button" class="btn btn-fantasma btn-mini" data-tut="sair">Agora não</button>',
  });
  foco.classList.remove('visivel');
  painel.dataset.pos = celular() ? 'baixo' : 'direita-baixo';
}
