// Telas do chefe de seção: início, atualização semanal, ações e histórico.
import { del, get, patch, post } from './api.js';
import { est } from './estado.js';
import {
  $, abrirForm, addDias, br, confirmar, dataHora, diaSemana, esc, fmtMin, on, pilulaStatus, plural, PRIO, STATUS, toast, vazio,
} from './ui.js';
import { abrirAcao, abrirNovoImpedimento, aceitaImpedimento } from './acao-comum.js';
import { HORA_FECHAMENTO, TRANSICOES } from './regras.js';
import { relatoHTML } from './telas-diretor.js';

const semSecao = (raiz) => {
  raiz.innerHTML = `<div class="cabeca"><h1>Sem seção atribuída</h1></div><div class="cartao">${vazio(
    'Você ainda não está vinculado a uma seção', 'Peça ao Diretor para atribuí-lo a uma seção na tela Estrutura.')}</div>`;
};

// ---------- Início ----------
export async function inicio(raiz, { refresh }) {
  if (!est.user.secao_id) return semSecao(raiz);
  const semana = est.boot.semana;
  const [up, abertas] = await Promise.all([get(`/atualizacao?semana=${semana}&resumo=1`), get('/acoes?situacao=abertas')]);
  const atrasadas = abertas.filter((a) => a.atrasada).length;
  const vencendo = abertas.filter((a) => !a.atrasada && a.prazo <= addDias(est.boot.hoje, 2)).length;
  const pedidos = abertas.filter((a) => a.pedido_pendente).length;
  raiz.innerHTML = `
    <div class="cabeca"><div><h1>${esc(est.boot.secao?.nome || 'Minha seção')}</h1><div class="sub">Olá, ${esc(est.user.nome.split(' ')[0])}. Aqui está o que precisa da sua atenção.</div></div></div>
    <div class="cartao"><div class="linha entre"><div>
      <h2>Sua atualização desta semana</h2>
      ${up.atual ? `<p class="suave" style="margin:2px 0 0">Enviada em ${dataHora(up.atual.enviada_em)} (versão ${up.atual.versao}). Se algo mudou, envie uma correção.</p>`
        : `<p style="margin:2px 0 0">Pendente. Atualizações abertas até ${diaSemana(addDias(semana, -1))}, <b>${br(addDias(semana, -1))}</b>, às ${HORA_FECHAMENTO}h.</p>`}</div>
      <a class="btn btn-primario" href="#/atualizacao">${up.atual ? 'Enviar correção' : 'Registrar atualização'}</a></div></div>
    <div class="espaco"></div>
    <div class="grade" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
      <div class="cartao"><div class="suave pequeno">Ações abertas</div><div style="font-family:var(--head);font-weight:650;font-size:2rem" class="num">${abertas.length}</div></div>
      <div class="cartao"><div class="suave pequeno">Atrasadas</div><div style="font-family:var(--head);font-weight:650;font-size:2rem;color:${atrasadas ? 'var(--vermelho)' : 'inherit'}" class="num">${atrasadas}</div></div>
      <div class="cartao"><div class="suave pequeno">Vencem em até 2 dias</div><div style="font-family:var(--head);font-weight:650;font-size:2rem;color:${vencendo ? 'var(--amarelo)' : 'inherit'}" class="num">${vencendo}</div></div>
      <div class="cartao"><div class="suave pequeno">Pedidos de prazo</div><div style="font-family:var(--head);font-weight:650;font-size:2rem" class="num">${pedidos}</div></div>
    </div>
    <div class="espaco"></div>
    <div class="cartao"><div class="linha entre"><h2>Próximas ações</h2><a href="#/minhas-acoes">Ver todas</a></div>
      ${abertas.length ? `<table><tbody>${abertas.slice(0, 4).map((a) => `<tr class="clicavel" data-acao="${a.id}" tabindex="0">
        <td><b>${esc(a.titulo)}</b>${a.demandada_diretor ? `<div class="suave pequeno" style="color:var(--verde);margin-top:2px">Demandada pelo Diretor em ${br(a.demandado_em || a.criada_em)}</div>` : ''}</td>
        <td class="num">${br(a.prazo)}</td><td>${pilulaStatus(a)}</td></tr>`).join('')}</tbody></table>`
        : vazio('Nenhuma ação em aberto', 'Quando o Diretor direcionar algo, aparecerá aqui.')}</div>`;
  const abrir = (el) => abrirAcao(el.dataset.acao, refresh).catch((e) => toast(e.message, 'erro'));
  on(raiz, 'click', 'tr[data-acao]', abrir);
  on(raiz, 'keydown', 'tr[data-acao]', (el, ev) => { if (ev.key === 'Enter') abrir(el); });
}

// ---------- Minhas ações ----------
export async function minhasAcoes(raiz) {
  if (!est.user.secao_id) return semSecao(raiz);
  const buscar = () => Promise.all([
    get('/acoes?situacao=abertas'),
    get('/acoes?situacao=concluidas'),
    get('/acoes?situacao=arquivadas'),
  ]);
  let [abertas, concl, arq] = await buscar();

  let aba = 'ativas';
  let todasAtivas = [...abertas, ...concl];

  const renderizar = () => {
    // Guarda os minutos digitados e o foco, para que atualizar um cartão não apague o que está em outro.
    const digitado = new Map([...raiz.querySelectorAll('[data-min]')].filter((i) => i.value).map((i) => [i.closest('[data-id]').dataset.id, i.value]));
    const foco = raiz.contains(document.activeElement) ? document.activeElement.closest('[data-id]')?.dataset.id : null;
    let lista = todasAtivas;
    if (aba === 'abertas') lista = abertas;
    else if (aba === 'concluidas') lista = concl;
    else if (aba === 'arquivadas') lista = arq;

    raiz.innerHTML = `
      <div class="cabeca linha entre" style="align-items:flex-start">
        <div>
          <h1>Minhas ações</h1>
          <div class="sub">${plural(abertas.length, 'ação aberta', 'ações abertas')}${concl.length ? ` · ${plural(concl.length, 'concluída aguardando aceite', 'concluídas aguardando aceite')}` : ''}${arq.length ? ` · ${plural(arq.length, 'arquivada', 'arquivadas')}` : ''}</div>
        </div>
        <button class="btn btn-primario" id="btn-nova-acao">+ Nova ação</button>
      </div>
      <div class="linha" style="margin:10px 0 16px;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn ${aba === 'ativas' ? 'btn-sec' : 'btn-fantasma'} btn-mini" data-aba="ativas">Todas ativas (${todasAtivas.length})</button>
        <button type="button" class="btn ${aba === 'abertas' ? 'btn-sec' : 'btn-fantasma'} btn-mini" data-aba="abertas">Abertas (${abertas.length})</button>
        <button type="button" class="btn ${aba === 'concluidas' ? 'btn-sec' : 'btn-fantasma'} btn-mini" data-aba="concluidas">Concluídas (${concl.length})</button>
        <button type="button" class="btn ${aba === 'arquivadas' ? 'btn-sec' : 'btn-fantasma'} btn-mini" data-aba="arquivadas">Arquivadas (${arq.length})</button>
      </div>
      ${lista.length ? lista.map((a) => `<article class="cartao acao${a.atrasada ? ' atrasada' : ''}" data-id="${a.id}">
        <header class="acao-topo">
          <div>
            <h3>${esc(a.titulo)}</h3>
            <div class="acao-meta">Prazo <b class="num">${br(a.prazo)}</b> · ${esc(a.secao_sigla)}${a.interna ? ' · ação interna' : ''}${a.demandada_diretor ? ` · demandada em ${br(a.demandado_em || a.criada_em)}` : ''}</div>
          </div>
          <div class="acao-selos">
            ${a.atrasada ? '<span class="pilula atraso">Atrasada</span>' : ''}
            ${a.demandada_diretor ? '<span class="pilula diretor" title="Ações demandadas pelo Diretor não podem ser arquivadas nem excluídas pela seção">Demandada pelo Diretor</span>' : ''}
            <span class="pilula prio-${a.prioridade}">Prioridade ${PRIO[a.prioridade].toLowerCase()}</span>
            ${a.pedido_pendente ? '<span class="pilula">Pedido de prazo enviado</span>' : ''}
            ${a.impedimento_critico ? '<span class="pilula atraso">Impedimento crítico</span>' : a.impedimentos_abertos ? '<span class="pilula st-bloqueada">Impedimento aberto</span>' : ''}
            ${a.status === 'concluida' && !a.arquivada ? '<span class="pilula st-concluida">Aguardando aceite</span>' : ''}
            ${a.arquivada ? '<span class="pilula enc">Arquivada</span>' : ''}
          </div>
        </header>
        ${a.detalhe ? `<p class="acao-detalhe">${esc(a.detalhe)}</p>` : ''}
        ${!a.arquivada ? `
          <div class="segmento" role="group" aria-label="Status da ação">${Object.entries(STATUS).map(([k, v]) =>
            `<button type="button" data-status="${k}" aria-pressed="${a.status === k}" ${a.status !== k && !TRANSICOES[a.status].includes(k) ? 'disabled' : ''}>${v}</button>`).join('')}</div>
          <div class="tempo-linha"><span>Tempo gasto <b class="num">${fmtMin(a.tempo_total)}</b></span>
            <input type="number" min="1" max="1440" step="1" inputmode="numeric" placeholder="minutos" aria-label="Minutos gastos" data-min>
            <button type="button" class="btn btn-sec btn-mini" data-tempo aria-label="Registrar tempo gasto">Registrar</button></div>
        ` : ''}
        <footer class="acao-rodape">
          <button type="button" class="btn btn-fantasma btn-mini" data-detalhe>Detalhes e histórico</button>
          ${!a.arquivada && a.status !== 'concluida' && !a.pedido_pendente ? '<button type="button" class="btn btn-fantasma btn-mini" data-prazo>Pedir novo prazo</button>' : ''}
          ${aceitaImpedimento(a) ? '<button type="button" class="btn btn-fantasma btn-mini" data-impedimento>Impedimento</button>' : ''}
          ${!a.demandada_diretor ? `<details class="mais"><summary class="btn btn-fantasma btn-mini">Mais</summary>
            <div class="mais-itens">
              ${a.arquivada ? '<button type="button" class="btn btn-sec btn-mini" data-desarquivar>Desarquivar</button>' : '<button type="button" class="btn btn-sec btn-mini" data-arquivar>Arquivar</button>'}
              <button type="button" class="btn btn-sec btn-mini perigo-texto" data-excluir>Excluir ação</button>
            </div></details>` : ''}
        </footer>
      </article>`).join('') : `<div class="cartao">${vazio('Nenhuma ação nesta visão', aba === 'arquivadas' ? 'Nenhuma ação arquivada.' : 'Quando o Diretor ou você criarem ações, elas aparecerão aqui.')}</div>`}`;
    for (const [id, v] of digitado) { const i = raiz.querySelector(`[data-id="${id}"] [data-min]`); if (i) i.value = v; }
    if (foco) raiz.querySelector(`[data-id="${foco}"] [data-min]`)?.focus({ preventScroll: true });
  };

  // Recarrega só os dados desta tela: a aba escolhida e os campos em edição continuam como estavam.
  const recarregar = async () => {
    [abertas, concl, arq] = await buscar();
    todasAtivas = [...abertas, ...concl];
    renderizar();
  };

  renderizar();

  const acaoDe = (el) => {
    const id = Number(el.closest('[data-id]').dataset.id);
    return [...todasAtivas, ...arq].find((a) => a.id === id);
  };
  const erro = (e) => toast(e.message, 'erro');

  on(raiz, 'click', '[data-aba]', (el) => {
    aba = el.dataset.aba;
    renderizar();
  });

  on(raiz, 'click', '[data-impedimento]', (el) => abrirNovoImpedimento(acaoDe(el), recarregar));

  on(raiz, 'click', '[data-arquivar]', async (el) => {
    const a = acaoDe(el);
    try {
      await post(`/acoes/${a.id}/arquivar`);
      toast('Ação arquivada.');
      await recarregar();
    } catch (e) { erro(e); }
  });

  on(raiz, 'click', '[data-desarquivar]', async (el) => {
    const a = acaoDe(el);
    try {
      await post(`/acoes/${a.id}/desarquivar`);
      toast('Ação desarquivada.');
      await recarregar();
    } catch (e) { erro(e); }
  });

  on(raiz, 'click', '[data-excluir]', async (el) => {
    const a = acaoDe(el);
    const ok = await confirmar({
      titulo: 'Excluir ação',
      texto: `A ação <b>${esc(a.titulo)}</b> será excluída para sempre, com o tempo e os comentários registrados. Se quiser só tirá-la da lista, use Arquivar.`,
      rotulo: 'Excluir ação', perigo: true,
    });
    if (!ok) return;
    try {
      await del(`/acoes/${a.id}`);
      toast('Ação excluída.');
      await recarregar();
    } catch (e) { erro(e); }
  });

  on(raiz, 'click', '#btn-nova-acao', () => {
    abrirForm({
      titulo: 'Nova ação da seção',
      corpo: `
        <div class="campo"><label for="na-titulo">Título da ação</label><input id="na-titulo" name="titulo" required maxlength="140" placeholder="Ex.: Mapear processos internos"></div>
        <div class="campo"><label for="na-detalhe">Detalhamento (opcional)</label><textarea id="na-detalhe" name="detalhe" placeholder="Orientações e contexto"></textarea></div>
        <div class="grade" style="grid-template-columns:1fr 1fr;gap:12px">
          <div class="campo"><label for="na-prazo">Prazo</label><input id="na-prazo" type="date" name="prazo" required min="${est.boot.hoje}" value="${addDias(est.boot.hoje, 7)}"></div>
          <div class="campo"><label for="na-prio">Prioridade</label><select id="na-prio" name="prioridade"><option value="alta">Alta</option><option value="media" selected>Média</option><option value="baixa">Baixa</option></select></div>
        </div>
        <div class="escolha" style="margin-top:8px"><label><input type="checkbox" name="interna" value="1"> Ação interna da subseção (não exibida na pauta executiva do Diretor)</label></div>`,
      rotulo: 'Criar ação',
      aoEnviar: async (d) => {
        await post('/acoes', {
          titulo: d.titulo,
          detalhe: d.detalhe,
          prazo: d.prazo,
          prioridade: d.prioridade,
          interna: d.interna === '1',
        });
        toast('Ação criada com sucesso.');
        recarregar().catch(erro);
      },
    });
  });

  on(raiz, 'click', '[data-status]', async (el) => {
    const a = acaoDe(el);
    if (el.getAttribute('aria-pressed') === 'true') return;
    if (el.dataset.status === 'a_fazer' && a.tempo_total > 0) {
      const ok = await confirmar({
        titulo: 'Voltar para "a fazer"',
        texto: `O tempo já registrado nesta ação (<b>${fmtMin(a.tempo_total)}</b>) será excluído, porque a ação recomeça do zero.`,
        rotulo: 'Voltar e excluir o tempo', perigo: true,
      });
      if (!ok) return;
    }
    try { await patch(`/acoes/${a.id}`, { status: el.dataset.status }); toast(`Status: ${STATUS[el.dataset.status]}.`); await recarregar(); }
    catch (e) {
      erro(e);
      if (e.status === 422) $('[data-min]', el.closest('[data-id]')).focus();
    }
  });

  on(raiz, 'click', '[data-tempo]', async (el) => {
    const a = acaoDe(el);
    const inp = $('[data-min]', el.closest('[data-id]'));
    try { await post(`/acoes/${a.id}/tempo`, { minutos: Number(inp.value) }); toast('Tempo registrado.'); await recarregar(); } catch (e) { erro(e); inp.focus(); }
  });
  on(raiz, 'keydown', '[data-min]', (el, ev) => { if (ev.key === 'Enter') $('[data-tempo]', el.closest('[data-id]')).click(); });
  on(raiz, 'click', '[data-detalhe]', (el) => abrirAcao(acaoDe(el).id, recarregar).catch(erro));
  on(raiz, 'click', '[data-prazo]', (el) => {
    const a = acaoDe(el);
    abrirForm({
      titulo: 'Pedir novo prazo',
      corpo: `<p class="suave">${esc(a.titulo)}<br>Prazo atual: <b>${br(a.prazo)}</b></p>
        <div class="campo"><label for="np">Novo prazo</label><input id="np" type="date" name="novo_prazo" min="${addDias(a.prazo, 1)}" value="${addDias(a.prazo, 7)}"></div>
        <div class="campo"><label for="jp">Motivo</label><textarea id="jp" name="justificativa" placeholder="Explique o que justifica o novo prazo"></textarea></div>`,
      rotulo: 'Enviar pedido',
      aoEnviar: async (d) => { await post(`/acoes/${a.id}/pedido-prazo`, d); toast('Pedido enviado ao Diretor.'); recarregar().catch(erro); },
    });
  });
}

// ---------- Histórico ----------
export async function historico(raiz) {
  if (!est.user.secao_id) return semSecao(raiz);
  const h = await get('/historico');
  raiz.innerHTML = `
    <div class="cabeca"><div><h1>Histórico</h1><div class="sub">Suas atualizações semanais, da mais recente para a mais antiga.</div></div></div>
    ${h.length ? h.map((x, i) => `<details class="cartao" ${i === 0 ? 'open' : ''}><summary><b>Reunião de ${br(x.semana)}</b> <span class="suave pequeno">· enviada em ${dataHora(x.enviada_em)}</span></summary>
      <div style="padding-top:12px">${relatoHTML(x)}</div></details>`).join('') : `<div class="cartao">${vazio('Nenhuma atualização enviada', 'Depois da primeira atualização, o histórico aparece aqui.')}</div>`}`;
}
