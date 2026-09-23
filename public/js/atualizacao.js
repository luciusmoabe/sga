// Minha atualização: o relato semanal é montado pelo servidor a partir das ações da seção e das subseções.
// O chefe confere, resolve o que travou e envia. Ao enviar, o servidor congela uma cópia: o que mudar depois só
// aparece para a reunião se ele enviar de novo.
import { get, put } from './api.js';
import { est } from './estado.js';
import { $, addDias, br, dataHora, diaSemana, esc, on, STATUS, toast, vazio } from './ui.js';
import { abrirAcao, abrirNovoImpedimento, abrirResolverImpedimento } from './acao-comum.js';
import { HORA_FECHAMENTO } from './regras.js';

const semSecao = (raiz) => {
  raiz.innerHTML = `<div class="cabeca"><h1>Sem seção atribuída</h1></div><div class="cartao">${vazio(
    'Você ainda não está vinculado a uma seção', 'Peça ao Diretor para atribuí-lo a uma seção na tela Estrutura.')}</div>`;
};

const pilulaStatus = (a) => `<span class="pilula st-${a.status}">${STATUS[a.status]}</span>`;
const pilulaInterna = (a) => (a.interna && !a.compartilhada
  ? ' <span class="pilula" title="Não aparece ao Diretor: entra só na contagem">Interna</span>' : '');

const linhaAcao = (a, { concluida = false } = {}) => `<div class="item relato-item" data-acao="${a.id}">
  <span><b>${esc(a.titulo)}</b> <span class="suave pequeno">${esc(a.secao_sigla)} · ${concluida ? `concluída em ${dataHora(a.concluida_em).slice(0, 10)}` : `prazo ${br(a.prazo)}`}</span>
    ${pilulaStatus(a)}${pilulaInterna(a)}</span>
  <span class="linha" style="gap:4px"><button type="button" class="btn btn-fantasma btn-mini" data-abrir="${a.id}">Abrir</button>
    ${concluida ? '' : `<button type="button" class="btn btn-fantasma btn-mini" data-imp-novo="${a.id}">Registrar impedimento</button>`}</span></div>`;

const linhaImpedimento = (i) => `<div class="item relato-item"><span><b>${esc(i.acao_titulo)}</b> <span class="suave pequeno">${esc(i.secao_sigla)}</span>
  ${i.critico ? '<span class="pilula atraso">Crítico</span>' : ''}${pilulaInterna(i)}<br>${esc(i.descricao)}
  ${i.apoio ? `<br><span class="pequeno"><b>Apoio solicitado:</b> ${esc(i.apoio)}</span>` : ''}</span>
  <span class="linha" style="gap:4px"><button type="button" class="btn btn-fantasma btn-mini" data-abrir="${i.acao_id}">Abrir</button>
    <button type="button" class="btn btn-fantasma btn-mini" data-imp-resolver="${i.id}:${i.acao_id}">Resolver</button></span></div>`;

const bloco = (titulo, sub, linhas, semItens) => `<div class="cartao"><h2>${titulo}</h2>
  <div class="suave pequeno" style="margin:-4px 0 8px">${sub}</div>
  ${linhas.length ? `<div class="itens">${linhas.join('')}</div>` : `<p class="suave pequeno">${semItens}</p>`}</div>`;

export async function atualizacao(raiz, { refresh }) {
  if (!est.user.secao_id) return semSecao(raiz);
  const semana = est.boot.semana;
  const d = await get(`/atualizacao?semana=${semana}`);
  const at = d.atual;
  const rel = d.relato;
  const j = rel.janelas;

  // Só as observações são digitadas: ficam num rascunho da aba, que sobrevive a recarga e a queda de sessão.
  const chaveRascunho = `agilis-rascunho:${est.user.id}:${semana}`;
  let observacoes = at?.feito?.snapshot?.observacoes || '';
  try {
    const r = JSON.parse(sessionStorage.getItem(chaveRascunho));
    if (typeof r?.observacoes === 'string') observacoes = r.observacoes;
  } catch { /* sem rascunho ou armazenamento indisponível */ }

  raiz.innerHTML = `
    <div class="cabeca"><div><h1>Minha atualização</h1><div class="sub">Para a reunião de ${diaSemana(semana)}, ${br(semana)} · prazo regular ${diaSemana(addDias(semana, -1))}, ${br(addDias(semana, -1))}, às ${HORA_FECHAMENTO}h</div></div></div>
    ${d.desatualizada ? '<div class="info" role="status"><b>O relato mudou desde o último envio</b> (ação concluída, prazo novo ou impedimento). Envie de novo para a reunião ver a versão atual.</div>' : ''}
    ${at && !at.feito.snapshot ? '<div class="info">Esta atualização foi enviada no formato antigo (texto livre). Ao enviar de novo, ela passa a ser montada a partir das suas ações.</div>' : ''}
    ${at && at.feito.snapshot && !d.desatualizada ? `<div class="info">Você já enviou esta atualização (versão ${at.versao}). Ao enviar de novo, a nova versão substitui a anterior e o histórico é mantido.</div>` : ''}
    <div class="info">O relato é montado a partir das suas ações. Para mudar algo, atualize a ação (status, prazo ou impedimento) e volte aqui.</div>
    <form id="form-at" novalidate>
      <div class="erro-form oculto" role="alert"></div>
      ${bloco('O que foi feito', `Ações concluídas de ${br(j.concluidas.de)} a ${br(j.concluidas.ate)}`, rel.concluidas.map((a) => linhaAcao(a, { concluida: true })), 'Nenhuma ação concluída neste período.')}
      ${bloco('Atrasadas', `Prazo anterior a ${br(j.atrasadas.antes)} e ainda não concluídas. Deixam a seção em vermelho.`, rel.atrasadas.map((a) => linhaAcao(a)), 'Nenhuma ação atrasada.')}
      ${bloco('O que será feito nesta semana', `Ações com prazo de ${br(j.programadas.de)} a ${br(j.programadas.ate)}`, rel.programadas.map((a) => linhaAcao(a)), 'Nenhuma ação com prazo neste período.')}
      ${bloco('O que trava', 'Impedimentos ainda abertos nas suas ações. Para registrar um novo, use o botão da ação.', rel.impedimentos.map(linhaImpedimento), 'Nenhum impedimento aberto.')}
      <div class="cartao"><h2>Observações</h2><div class="campo"><label for="obs" class="suave pequeno">Algo que não está nas ações (opcional)</label>
        <textarea id="obs" maxlength="600" placeholder="Ex.: contexto para a reunião">${esc(observacoes)}</textarea></div></div>
      <div class="espaco"></div>
      <button class="btn btn-primario" type="submit">${at ? 'Enviar correção' : 'Enviar atualização'}</button>
    </form>`;

  const gravarRascunho = () => {
    try { sessionStorage.setItem(chaveRascunho, JSON.stringify({ observacoes: $('#obs', raiz).value })); } catch { /* segue sem rascunho */ }
  };
  on(raiz, 'input', '#obs', gravarRascunho);
  const erro = (e) => toast(e.message, 'erro');
  // A tela é redesenhada depois de registrar ou resolver: o texto das observações já está no rascunho.
  on(raiz, 'click', '[data-abrir]', (el) => { gravarRascunho(); abrirAcao(el.dataset.abrir, refresh).catch(erro); });
  const acaoPorId = (id) => [...rel.concluidas, ...rel.atrasadas, ...rel.programadas].find((a) => a.id === Number(id));
  on(raiz, 'click', '[data-imp-novo]', (el) => {
    const a = acaoPorId(el.dataset.impNovo);
    if (!a) return;
    gravarRascunho();
    abrirNovoImpedimento(a, refresh);
  });
  on(raiz, 'click', '[data-imp-resolver]', (el) => {
    const [iid, aid] = el.dataset.impResolver.split(':').map(Number);
    const i = rel.impedimentos.find((x) => x.id === iid);
    if (!i) return;
    gravarRascunho();
    abrirResolverImpedimento({ id: aid, titulo: i.acao_titulo, status: i.acao_status }, i, refresh);
  });

  $('#form-at', raiz).addEventListener('submit', async (e) => {
    e.preventDefault();
    const caixa = $('.erro-form', raiz);
    caixa.classList.add('oculto');
    try {
      await put('/atualizacao', { semana, observacoes: $('#obs', raiz).value });
      try { sessionStorage.removeItem(chaveRascunho); } catch { /* ignora */ }
      toast('Atualização enviada. Obrigado!');
      location.hash = '#/inicio';
    } catch (ex) {
      caixa.textContent = ex.message;
      caixa.classList.remove('oculto');
      caixa.scrollIntoView({ block: 'center' });
    }
  });
}
