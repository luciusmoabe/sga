// Agenda: calendário do mês à esquerda e, à direita, o dia escolhido com as ações (pelo prazo) e as tarefas
// (pela data de execução, atreladas às ações). Nada de dado novo na tela: as ações vêm de GET /acoes, que já
// filtra pelo que cada perfil pode ver, e as tarefas de GET /tarefas (as das ações visíveis mais as atribuídas
// à própria pessoa). Para o Chefe é a agenda da seção; para Diretor, Apoio, Administrador e Consulta, a de todas
// as seções (a seção aparece em destaque, em selo).
// Acessibilidade: cada dia é um botão com a descrição por extenso ("28 de outubro: 2 ações, 1 tarefa, 1 atrasada"),
// as marcas diferem pela forma (círculo = ação, quadrado = tarefa) e o atraso também vem em texto, não só em cor.
import { get, patch } from './api.js';
import { est } from './estado.js';
import { $, addDias, br, esc, on, pilulaStatus, plural, PRIO, toast, vazio } from './ui.js';
import { abrirAcao } from './acao-comum.js';

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const fmt = (opcoes) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...opcoes });
const meioDia = (iso) => new Date(`${iso}T12:00:00Z`);
const nomeMes = (mes) => fmt({ month: 'long', year: 'numeric' }).format(meioDia(`${mes}-01`));
const nomeDia = (iso) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(meioDia(iso));
const diaDoMes = (iso) => `${Number(iso.slice(8))} de ${fmt({ month: 'long' }).format(meioDia(iso))}`;
const somarMes = (mes, n) => { const [a, m] = mes.split('-').map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

export async function agenda(raiz) {
  const gestao = est.user.perfil !== 'chefe'; // Diretor, Apoio, Administrador e Consulta veem todas as seções
  if (!gestao && !est.user.secao_id) {
    raiz.innerHTML = `<div class="cabeca"><h1>Agenda</h1></div><div class="cartao">${vazio(
      'Você ainda não está vinculado a uma seção', 'Peça ao Diretor para atribuí-lo a uma seção na tela Estrutura.')}</div>`;
    return;
  }
  const hoje = est.boot.hoje;
  const podeSerResponsavel = ['chefe', 'administrador'].includes(est.user.perfil);
  const minhaSecao = est.user.secao_id; // quem não tem seção (ex.: Administrador sem vínculo) não tem o filtro "Só o que é meu"
  const temEscopo = podeSerResponsavel && !!minhaSecao;
  const podeMarcar = (t) => podeSerResponsavel && t.acao_visivel; // quem gere a ação marca a tarefa como feita

  // Estado da tela (só em memória: ao sair e voltar, a agenda abre de novo em hoje).
  let acoes = [];
  let tarefas = [];
  let mes = hoje.slice(0, 7);
  let dia = hoje;
  let modo = 'dia'; // 'dia' ou 'atrasadas'
  let mostrar = 'tudo'; // 'tudo', 'acoes' ou 'tarefas'
  let soMinhas = false;
  let secao = '';

  const carregar = async () => {
    const [abertas, concluidas, lista] = await Promise.all([get('/acoes?situacao=abertas'), get('/acoes?situacao=concluidas'), get('/tarefas')]);
    acoes = [...abertas, ...concluidas];
    tarefas = lista;
  };
  await carregar();

  // ---------- Filtros e índice por data ----------
  // "Só meu": as tarefas atribuídas a mim (em qualquer ação) e as ações da minha seção (a própria seção, não as de fora).
  const doFiltroAcao = (a) => mostrar !== 'tarefas' && (!soMinhas || a.secao_id === minhaSecao) && (!secao || String(a.secao_id) === secao);
  const doFiltroTarefa = (t) => mostrar !== 'acoes' && (!soMinhas || t.responsavel_id === est.user.id) && (!secao || String(t.secao_id) === secao);
  const visiveis = () => ({ as: acoes.filter(doFiltroAcao), ts: tarefas.filter(doFiltroTarefa) });
  const indice = () => {
    const porDia = new Map();
    const pega = (d) => { if (!porDia.has(d)) porDia.set(d, { acoes: [], tarefas: [], atrasoAcao: false, atrasoTarefa: false, atraso: false }); return porDia.get(d); };
    const { as, ts } = visiveis();
    // Cada marca leva a própria cor de atraso: uma ação concluída no dia não fica vermelha por causa de uma tarefa atrasada.
    for (const a of as) { const e = pega(a.prazo); e.acoes.push(a); if (a.atrasada) e.atrasoAcao = e.atraso = true; }
    for (const t of ts) if (t.data) { const e = pega(t.data); e.tarefas.push(t); if (t.atrasada) e.atrasoTarefa = e.atraso = true; }
    return porDia;
  };

  // ---------- Esqueleto fixo (os filtros não são redesenhados, para não perder o foco) ----------
  const secoes = gestao ? [...new Map(acoes.map((a) => [a.secao_id, a.secao_sigla || a.secao_nome])).entries()].sort((x, y) => x[1].localeCompare(y[1])) : [];
  raiz.innerHTML = `
    <div class="cabeca"><div><h1>Agenda</h1><div class="sub">${gestao ? 'Ações e tarefas de todas as seções, por data' : 'Suas ações e tarefas, por data'}</div></div></div>
    <div class="cal">
      <section class="cartao cal-mes" aria-label="Calendário">
        <div class="cal-topo">
          <button type="button" class="cal-nav" data-mes="-1" aria-label="Mês anterior">‹</button>
          <h2 id="cal-titulo" aria-live="polite"></h2>
          <button type="button" class="cal-nav" data-mes="1" aria-label="Próximo mês">›</button>
        </div>
        <div class="cal-semana" aria-hidden="true">${SEMANA.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="cal-grade" id="cal-grade" role="group" aria-label="Dias do mês"></div>
        <div class="cal-rodape">
          <button type="button" class="btn btn-fantasma btn-mini" data-hoje>Hoje</button>
          <span class="cal-legenda"><i class="cal-marca cal-marca-acao"></i> Ação <i class="cal-marca cal-marca-tarefa"></i> Tarefa <i class="cal-marca cal-marca-atraso"></i> Atrasada</span>
        </div>
        <details class="cal-filtros-wrap" open>
          <summary>Filtros <span class="cal-filtros-ativos" id="cal-ativos"></span></summary>
          <div class="cal-filtros">
            <div class="cal-filtro" role="group" aria-labelledby="cal-f-mostrar">
              <span class="cal-filtro-rotulo" id="cal-f-mostrar">Mostrar</span>
              <div class="segmento">
                <button type="button" data-mostrar="tudo" aria-pressed="true">Tudo</button>
                <button type="button" data-mostrar="acoes" aria-pressed="false">Ações</button>
                <button type="button" data-mostrar="tarefas" aria-pressed="false">Tarefas</button>
              </div>
            </div>
            ${temEscopo ? `<div class="cal-filtro" role="group" aria-labelledby="cal-f-escopo">
              <span class="cal-filtro-rotulo" id="cal-f-escopo">De quem</span>
              <div class="segmento">
                <button type="button" data-escopo="tudo" aria-pressed="true">Tudo</button>
                <button type="button" data-escopo="meu" aria-pressed="false">Só o que é meu</button>
              </div>
              <p class="cal-filtro-dica" id="cal-dica-escopo"></p>
            </div>` : ''}
            ${gestao && secoes.length > 1 ? `<div class="cal-filtro"><label class="cal-filtro-rotulo" for="cal-secao">Seção</label>
              <select id="cal-secao"><option value="">Todas as seções</option>${secoes.map(([id, nome]) => `<option value="${id}">${esc(nome)}</option>`).join('')}</select></div>` : ''}
          </div>
        </details>
      </section>
      <section class="cartao cal-painel" id="cal-painel" aria-label="Dia selecionado" aria-live="polite"></section>
    </div>`;

  // No celular os filtros ficam recolhidos atrás do botão "Filtros", para o painel do dia aparecer logo abaixo do calendário.
  if (window.matchMedia('(max-width: 760px)').matches) $('.cal-filtros-wrap', raiz).removeAttribute('open');

  // ---------- Calendário ----------
  const rotuloDia = (iso, e) => {
    const partes = [];
    if (e?.acoes.length) partes.push(plural(e.acoes.length, 'ação', 'ações'));
    if (e?.tarefas.length) partes.push(plural(e.tarefas.length, 'tarefa', 'tarefas'));
    if (e?.atraso) partes.push('com atraso');
    return `${diaDoMes(iso)}${iso === hoje ? ', hoje' : ''}${partes.length ? `: ${partes.join(', ')}` : ': nada previsto'}`;
  };
  const desenharCalendario = () => {
    $('#cal-titulo', raiz).textContent = nomeMes(mes);
    const [ano, m] = mes.split('-').map(Number);
    const antes = new Date(Date.UTC(ano, m - 1, 1)).getUTCDay();
    const total = new Date(Date.UTC(ano, m, 0)).getUTCDate();
    const porDia = indice();
    const celulas = Array.from({ length: antes }, () => '<span class="cal-vazio" aria-hidden="true"></span>');
    for (let d = 1; d <= total; d++) {
      const iso = `${mes}-${String(d).padStart(2, '0')}`;
      const e = porDia.get(iso);
      const marcas = `${e?.acoes.length ? `<i class="cal-marca cal-marca-acao${e.atrasoAcao ? ' cal-m-atraso' : ''}"></i>` : ''}${e?.tarefas.length ? `<i class="cal-marca cal-marca-tarefa${e.atrasoTarefa ? ' cal-m-atraso' : ''}"></i>` : ''}`;
      const escolhido = modo === 'dia' && iso === dia;
      celulas.push(`<button type="button" class="cal-dia${escolhido ? ' cal-escolhido' : ''}${iso === hoje ? ' cal-hoje' : ''}" data-dia="${iso}"
        aria-label="${esc(rotuloDia(iso, e))}" aria-pressed="${escolhido}" ${iso === hoje ? 'aria-current="date"' : ''} tabindex="${iso === dia ? 0 : -1}">
        <span class="cal-numero">${d}</span><span class="cal-marcas" aria-hidden="true">${marcas}</span></button>`);
    }
    $('#cal-grade', raiz).innerHTML = celulas.join('');
  };

  // ---------- Painel do dia (ou das atrasadas) ----------
  const metaTarefa = (t, { comData = false } = {}) => {
    const partes = [];
    if (comData) partes.push(t.data ? `<span class="${t.atrasada ? 'cal-vermelho' : ''}">${t.atrasada ? 'Atrasada · ' : ''}${br(t.data)}</span>` : '<span>Sem data</span>');
    else if (t.atrasada) partes.push('<span class="cal-vermelho">Atrasada</span>');
    partes.push(`<span>Ação: ${esc(t.acao_titulo)}</span>`);
    partes.push(t.responsavel_id === est.user.id ? '<span><b>Você</b> é o responsável</span>' : `<span>${t.responsavel_nome ? `Responsável: ${esc(t.responsavel_nome)}` : 'Sem responsável'}</span>`);
    return partes.join('');
  };
  const linhaAcao = (a, { comPrazo = false } = {}) => `<button type="button" class="cal-item" data-abrir="${a.id}">
    <span class="cal-tipo cal-tipo-acao">Ação</span>
    <span class="cal-item-corpo"><span class="cal-item-titulo">${esc(a.titulo)}</span>
      <span class="cal-item-meta">${comPrazo ? `<span class="cal-vermelho">Atrasada desde ${br(a.prazo)}</span>` : ''}<span class="pilula" title="Seção responsável">${esc(a.secao_sigla)}</span> ${pilulaStatus(a)} <span class="pilula prio-${a.prioridade}">Prioridade ${PRIO[a.prioridade].toLowerCase()}</span></span></span></button>`;
  const linhaTarefa = (t, opcoes) => {
    const corpo = `<span class="cal-tipo cal-tipo-tarefa">Tarefa</span>
      <span class="cal-item-corpo"><span class="cal-item-titulo ${t.concluido ? 'cal-feita' : ''}">${esc(t.texto)}</span>
        <span class="cal-item-meta">${metaTarefa(t, opcoes)} <span class="pilula" title="Seção da ação">${esc(t.secao_sigla)}</span></span></span>`;
    return `<div class="cal-tarefa${t.concluido ? ' cal-concluida' : ''}" data-tarefa="${t.id}">
      <input type="checkbox" data-marcar="${t.id}" data-acao-id="${t.acao_id}" ${t.concluido ? 'checked' : ''} ${podeMarcar(t) ? '' : 'disabled'}
        aria-label="${t.concluido ? 'Reabrir' : 'Concluir'} tarefa: ${esc(t.texto)}">
      ${t.acao_visivel
    ? `<button type="button" class="cal-item" data-abrir="${t.acao_id}">${corpo}</button>`
    : `<div class="cal-item cal-item-fechado" title="Ação de outra seção: você vê só a tarefa atribuída a você">${corpo}</div>`}
    </div>`;
  };
  const secaoLista = (titulo, itens) => (itens.length ? `<h3 class="cal-secao">${titulo} <span class="suave pequeno">(${itens.length})</span></h3><div class="cal-lista">${itens.join('')}</div>` : '');
  const ordemTarefas = (x, y) => (x.concluido - y.concluido) || x.acao_titulo.localeCompare(y.acao_titulo) || x.id - y.id;

  const desenharPainel = () => {
    const { as, ts } = visiveis();
    const atrasadasA = as.filter((a) => a.atrasada).sort((x, y) => x.prazo.localeCompare(y.prazo));
    const atrasadasT = ts.filter((t) => t.atrasada).sort((x, y) => x.data.localeCompare(y.data));
    const nAtraso = atrasadasA.length + atrasadasT.length;
    const semData = ts.filter((t) => !t.data && !t.concluido).sort(ordemTarefas);
    const aviso = nAtraso && modo === 'dia'
      ? `<button type="button" class="cal-aviso" data-modo="atrasadas"><span aria-hidden="true">▲</span> ${plural(nAtraso, 'item atrasado', 'itens atrasados')} <span class="cal-aviso-ver">Ver</span></button>` : '';
    let cabeca;
    let corpo;
    if (modo === 'atrasadas') {
      cabeca = `<h2>Atrasadas</h2><button type="button" class="btn btn-sec btn-mini" data-modo="dia">Voltar ao calendário</button>`;
      corpo = nAtraso
        ? secaoLista('Ações', atrasadasA.map((a) => linhaAcao(a, { comPrazo: true }))) + secaoLista('Tarefas', atrasadasT.map((t) => linhaTarefa(t, { comData: true })))
        : vazio('Nada atrasado', 'Tudo em dia com os filtros escolhidos.');
    } else {
      const porDia = indice().get(dia);
      const acoesDia = (porDia?.acoes || []).slice().sort((x, y) => (x.status === 'concluida') - (y.status === 'concluida'));
      const tarefasDia = (porDia?.tarefas || []).slice().sort(ordemTarefas);
      const resumo = [acoesDia.length ? plural(acoesDia.length, 'ação', 'ações') : '', tarefasDia.length ? plural(tarefasDia.length, 'tarefa', 'tarefas') : ''].filter(Boolean).join(' · ');
      cabeca = `<div><h2>${esc(nomeDia(dia))}${dia === hoje ? ' <span class="pilula">Hoje</span>' : ''}</h2>${resumo ? `<div class="suave pequeno">${resumo}</div>` : ''}</div>`;
      corpo = (acoesDia.length || tarefasDia.length)
        ? secaoLista('Ações com prazo neste dia', acoesDia.map((a) => linhaAcao(a))) + secaoLista('Tarefas deste dia', tarefasDia.map((t) => linhaTarefa(t)))
        : vazio('Nada previsto para este dia', mostrar === 'tudo' && !soMinhas && !secao ? 'Escolha outro dia no calendário.' : 'Os filtros escolhidos podem estar escondendo itens.');
    }
    const rodape = semData.length
      ? `<details class="cal-semdata"><summary>Tarefas sem data <span class="suave pequeno">(${semData.length})</span></summary><div class="cal-lista">${semData.map((t) => linhaTarefa(t, { comData: true })).join('')}</div>
         <p class="suave pequeno">Dê uma data a essas tarefas, na ação, para que apareçam no calendário.</p></details>` : '';
    $('#cal-painel', raiz).innerHTML = `<div class="cal-painel-topo">${cabeca}</div>${aviso}${corpo}${rodape}`;
  };

  // Os filtros se explicam e se resumem: a dica diz o que "De quem" está valendo, o botão recolhido (celular) conta
  // quantos filtros estão ativos e, com "Só o que é meu" ligado, o filtro de seção sai de cena (o meu já é uma seção).
  const atualizarFiltros = () => {
    const dica = $('#cal-dica-escopo', raiz);
    if (dica) dica.textContent = soMinhas ? 'Suas tarefas e as ações da sua seção.' : (gestao ? 'Tudo o que você enxerga, de todas as seções.' : 'Tudo da sua seção e subseções.');
    const sel = $('#cal-secao', raiz);
    if (sel) { sel.disabled = soMinhas; if (soMinhas) { sel.value = ''; secao = ''; } sel.title = soMinhas ? 'Com "Só o que é meu", a seção já é a sua.' : ''; }
    const ativos = (mostrar !== 'tudo' ? 1 : 0) + (soMinhas ? 1 : 0) + (secao ? 1 : 0);
    $('#cal-ativos', raiz).textContent = ativos ? `· ${plural(ativos, 'ativo', 'ativos')}` : '';
  };
  const desenhar = () => { atualizarFiltros(); desenharCalendario(); desenharPainel(); };
  const irPara = (iso, { foco = false } = {}) => {
    dia = iso;
    mes = iso.slice(0, 7);
    modo = 'dia';
    desenhar();
    if (foco) $(`[data-dia="${iso}"]`, raiz)?.focus();
  };
  desenhar();

  // ---------- Interação ----------
  on(raiz, 'click', '[data-dia]', (el) => {
    irPara(el.dataset.dia, { foco: true });
    // No celular o painel fica abaixo do calendário: leva-o para a vista.
    if (window.matchMedia('(max-width: 760px)').matches) $('#cal-painel', raiz).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  on(raiz, 'keydown', '[data-dia]', (el, ev) => {
    const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key];
    if (!passo) return;
    ev.preventDefault();
    irPara(addDias(el.dataset.dia, passo), { foco: true });
  });
  on(raiz, 'click', '[data-mes]', (el) => {
    mes = somarMes(mes, Number(el.dataset.mes));
    dia = mes === hoje.slice(0, 7) ? hoje : `${mes}-01`;
    modo = 'dia';
    desenhar();
  });
  on(raiz, 'click', '[data-hoje]', () => irPara(hoje));
  on(raiz, 'click', '[data-modo]', (el) => { modo = el.dataset.modo; desenhar(); });
  on(raiz, 'click', '[data-mostrar]', (el) => {
    mostrar = el.dataset.mostrar;
    for (const b of raiz.querySelectorAll('[data-mostrar]')) b.setAttribute('aria-pressed', String(b === el));
    desenhar();
  });
  on(raiz, 'click', '[data-escopo]', (el) => {
    soMinhas = el.dataset.escopo === 'meu';
    for (const b of raiz.querySelectorAll('[data-escopo]')) b.setAttribute('aria-pressed', String(b === el));
    desenhar();
  });
  $('#cal-secao', raiz)?.addEventListener('change', (ev) => { secao = ev.target.value; desenhar(); });

  // Recarrega só os dados (ação ou tarefa mudou): o mês, o dia e os filtros escolhidos continuam como estavam.
  let recarregando = false;
  const recarregar = async () => {
    if (recarregando) return;
    recarregando = true;
    try { await carregar(); desenhar(); } catch (e) { toast(e.message, 'erro'); } finally { recarregando = false; }
  };
  on(raiz, 'click', '[data-abrir]', (el) => abrirAcao(el.dataset.abrir, recarregar).catch((e) => toast(e.message, 'erro')));
  on(raiz, 'change', '[data-marcar]', async (el) => {
    try {
      await patch(`/acoes/${el.dataset.acaoId}/checklist/${el.dataset.marcar}`, { concluido: el.checked });
      toast(el.checked ? 'Tarefa concluída.' : 'Tarefa reaberta.');
      await recarregar();
    } catch (e) { el.checked = !el.checked; toast(e.message, 'erro'); }
  });
}
