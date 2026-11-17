// Telas "Meu diário" e "Diário da seção" (#/diario): os registros do diário de progresso por dia, de um período, com a ação e a tarefa
// em etiquetas e filtros por pessoa, ação e tipo. Uma tela só: o chefe (e o Administrador com seção) alterna entre "Meu diário" (o que
// ele registrou) e "Diário da seção" (o de todos nas ações da própria árvore); o membro só tem o dele. Dados de GET /api/diario;
// só leitura, e a ação abre na ficha (onde se registra, retifica e exclui). O estado (período, filtros) vive só em memória.
import { get } from './api.js';
import { est } from './estado.js';
import { $, addDias, esc, fmtMin, on, toast, vazio } from './ui.js';
import { abrirAcao } from './acao-comum.js';
import { TIPOS_DIARIO, agruparPorDia, ehLink, filtrarRegistros, opcoesDosRegistros, resumoParaCopiar, rotuloDoDia, rotuloTipo } from './diario.js';

const PERIODOS = [['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['mes', 'Este mês'], ['livre', 'Escolher datas']];
const hora = (iso) => String(iso || '').slice(11, 16);

function intervaloDe(periodo, hoje, livre) {
  if (periodo === 'livre') return livre;
  if (periodo === 'mes') return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
  return { de: addDias(hoje, -(Number(periodo) - 1)), ate: hoje };
}

const itemHTML = (r, comAutor) => `<article class="diario-item tipo-${esc(r.tipo)}">
  <header class="diario-cab">
    <span class="pilula">${esc(rotuloTipo(r.tipo))}</span>
    <button type="button" class="btn btn-fantasma btn-mini" data-abrir="${r.acao_id}" title="Abrir a ação">${esc(r.acao_titulo)}</button>
    ${r.tarefa_nome ? `<span class="pilula diario-tarefa" title="Tarefa a que o registro se refere">Tarefa: ${esc(r.tarefa_nome)}${r.tarefa_id ? '' : ' (excluída)'}</span>` : ''}
    ${r.minutos ? `<span class="pequeno num">${fmtMin(r.minutos)}</span>` : ''}
  </header>
  <p class="diario-texto">${esc(r.texto)}</p>
  ${r.referencia ? `<p class="pequeno suave">Referência: ${ehLink(r.referencia) ? `<a href="${esc(r.referencia.trim())}" target="_blank" rel="noopener noreferrer">${esc(r.referencia.trim())}</a>` : esc(r.referencia)}</p>` : ''}
  <footer class="pequeno suave">${comAutor ? `${esc(r.autor_nome || '')} · ` : ''}${hora(r.criado_em)}${r.secao_sigla ? ` · ${esc(r.secao_sigla)}` : ''}</footer>
</article>`;

export async function diarioTela(raiz, { q = {}, refresh } = {}) {
  const u = est.user;
  const hoje = est.boot.hoje;
  const gere = ['chefe', 'administrador'].includes(u.perfil) && !!u.secao_id;
  if (!u.secao_id && u.perfil !== 'administrador') {
    raiz.innerHTML = `<div class="cabeca"><h1>Meu diário</h1></div><div class="cartao">${vazio('Você ainda não está vinculado a uma seção', 'O diário aparece quando você tiver ações para registrar.')}</div>`;
    return;
  }
  const e = { escopo: gere && q.i === 'secao' ? 'secao' : 'meu', periodo: '7', livre: { de: addDias(hoje, -6), ate: hoje }, pessoa: '', acao: '', tipo: '' };
  let dados = null;

  const carregar = async () => {
    const { de, ate } = intervaloDe(e.periodo, hoje, e.livre);
    dados = await get(`/diario?escopo=${e.escopo}&de=${de}&ate=${ate}`);
  };

  const desenhar = () => {
    const secao = e.escopo === 'secao';
    const todos = dados?.registros || [];
    const op = opcoesDosRegistros(todos);
    // Pessoa e ação só valem se ainda existem no período carregado.
    if (e.pessoa && !op.pessoas.some((p) => String(p.id) === e.pessoa)) e.pessoa = '';
    if (e.acao && !op.acoes.some((a) => String(a.id) === e.acao)) e.acao = '';
    const lista = filtrarRegistros(todos, e);
    const minutos = lista.reduce((s, r) => s + (r.minutos || 0), 0);
    const ativos = [e.pessoa, e.acao, e.tipo].filter(Boolean).length;
    raiz.innerHTML = `
      <div class="cabeca"><div><h1>${secao ? 'Diário da seção' : 'Meu diário'}</h1>
        <p class="suave">${secao ? 'O que a equipe registrou nas ações da seção.' : 'O que você registrou nas ações.'} Para registrar, retificar ou excluir, abra a ação.</p></div>
        <button type="button" class="btn btn-sec" id="dt-copiar" ${lista.length ? '' : 'disabled'}>Copiar resumo</button></div>
      ${gere ? `<div class="ma-atalhos" role="group" aria-label="Qual diário ver" style="margin-bottom:12px">
        <button type="button" class="ma-chip" data-escopo="meu" aria-pressed="${!secao}">Meu diário</button>
        <button type="button" class="ma-chip" data-escopo="secao" aria-pressed="${secao}">Diário da seção</button></div>` : ''}
      <div class="cartao diario-tela-filtros">
        <div class="campo"><label for="dt-periodo">Período</label><select id="dt-periodo">${PERIODOS.map(([v, r]) => `<option value="${v}" ${v === e.periodo ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        ${e.periodo === 'livre' ? `<div class="campo"><label for="dt-de">De</label><input type="date" id="dt-de" value="${e.livre.de}" max="${hoje}"></div>
          <div class="campo"><label for="dt-ate">Até</label><input type="date" id="dt-ate" value="${e.livre.ate}" max="${hoje}"></div>` : ''}
        ${secao && op.pessoas.length > 1 ? `<div class="campo"><label for="dt-pessoa">Pessoa</label><select id="dt-pessoa"><option value="">Todas</option>${op.pessoas.map((p) => `<option value="${p.id}" ${String(p.id) === e.pessoa ? 'selected' : ''}>${esc(p.nome)} (${p.n})</option>`).join('')}</select></div>` : ''}
        ${op.acoes.length > 1 ? `<div class="campo"><label for="dt-acao">Ação</label><select id="dt-acao"><option value="">Todas</option>${op.acoes.map((a) => `<option value="${a.id}" ${String(a.id) === e.acao ? 'selected' : ''}>${esc(a.nome)} (${a.n})</option>`).join('')}</select></div>` : ''}
        <div class="campo"><label for="dt-tipo">Tipo</label><select id="dt-tipo"><option value="">Todos</option>${TIPOS_DIARIO.map(([v, r]) => `<option value="${v}" ${v === e.tipo ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        ${ativos ? '<button type="button" class="btn btn-fantasma" id="dt-limpar">Limpar filtros</button>' : ''}
      </div>
      <p class="suave" role="status">${lista.length} registro${lista.length === 1 ? '' : 's'}${minutos ? ` · ${fmtMin(minutos)} lançados` : ''}${ativos ? ` (de ${todos.length} no período)` : ''}${dados?.truncado ? ' · mostrando só os 500 mais recentes: reduza o período' : ''}</p>
      ${lista.length ? agruparPorDia(lista).map((g) => `<section class="diario-dia" aria-label="${esc(rotuloDoDia(g.data, hoje))}"><h2 class="diario-dia-titulo">${esc(rotuloDoDia(g.data, hoje))}</h2>${g.registros.map((r) => itemHTML(r, secao)).join('')}</section>`).join('')
        : `<div class="cartao">${vazio(todos.length ? 'Nenhum registro com esses filtros' : 'Nenhum registro neste período', todos.length ? 'Tire um filtro para ver mais.' : 'Registre o andamento pela ação: o botão "+ Registrar andamento" fica em cada cartão.')}</div>`}`;
  };

  const recarregar = async () => { try { await carregar(); desenhar(); } catch (err) { toast(err.message, 'erro'); } };
  await recarregar();

  on(raiz, 'click', '[data-escopo]', async (el) => { e.escopo = el.dataset.escopo; e.pessoa = ''; e.acao = ''; await recarregar(); });
  on(raiz, 'change', '#dt-periodo', async (el) => { e.periodo = el.value; await recarregar(); $('#dt-periodo', raiz)?.focus(); });
  on(raiz, 'change', '#dt-de', async (el) => { e.livre.de = el.value; if (e.livre.de > e.livre.ate) e.livre.ate = e.livre.de; await recarregar(); });
  on(raiz, 'change', '#dt-ate', async (el) => { e.livre.ate = el.value; if (e.livre.de > e.livre.ate) e.livre.de = e.livre.ate; await recarregar(); });
  on(raiz, 'change', '#dt-pessoa', (el) => { e.pessoa = el.value; desenhar(); $('#dt-pessoa', raiz)?.focus(); });
  on(raiz, 'change', '#dt-acao', (el) => { e.acao = el.value; desenhar(); $('#dt-acao', raiz)?.focus(); });
  on(raiz, 'change', '#dt-tipo', (el) => { e.tipo = el.value; desenhar(); $('#dt-tipo', raiz)?.focus(); });
  on(raiz, 'click', '#dt-limpar', () => { e.pessoa = ''; e.acao = ''; e.tipo = ''; desenhar(); });
  on(raiz, 'click', '[data-abrir]', (el) => abrirAcao(el.dataset.abrir, async () => { await recarregar(); refresh?.(); }).catch((err) => toast(err.message, 'erro')));
  on(raiz, 'click', '#dt-copiar', async () => {
    const { de, ate } = dados;
    const texto = resumoParaCopiar(filtrarRegistros(dados.registros, e), { de, ate, titulo: e.escopo === 'secao' ? 'Diário da seção' : 'Meu diário', comAutor: e.escopo === 'secao' });
    try { await navigator.clipboard.writeText(texto); toast('Resumo copiado.'); }
    catch { toast('Não foi possível copiar. Selecione o texto da tela e copie.', 'erro'); }
  });
}
