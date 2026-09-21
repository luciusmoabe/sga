// Modo Reunião: tela cheia para a TV da sala, conduzida pelo Diretor ou pelo Apoio.
// Abre com os Combinados, mostra as seções por ordem de necessidade e registra decisões e ações ao vivo.
// Ficam ocultos na projeção, por padrão: tempo em minutos e ações internas de subseções.
import { get, post } from './api.js';
import { est, hoje } from './estado.js';
import { $, abrirForm, addDias, br, confirmar, dataHora, diaSemana, esc, fmtMin, on, parseISO, plural, sem, STATUS, toast } from './ui.js';

/**
 * Tela de início (fora do modo TV). Abrir esta rota não cria nada: a reunião só nasce no botão,
 * então recarregar a página, voltar no navegador ou um clique sem querer não abrem reunião.
 */
export async function inicioReuniao(raiz) {
  const [lista, comb] = await Promise.all([get('/reunioes'), get('/combinados')]);
  const aberta = lista.find((r) => r.status === 'em_andamento');
  if (aberta) {
    raiz.innerHTML = `<div class="cabeca"><div><h1>Modo Reunião</h1><div class="sub">Há uma reunião em andamento.</div></div></div>
      <div class="cartao"><h2>Reunião de ${diaSemana(aberta.data)}, ${br(aberta.data)}</h2>
        <p class="suave">Iniciada em ${dataHora(aberta.iniciada_em)}. Retome de onde parou: as decisões e ações já registradas foram mantidas.</p>
        <a class="btn btn-primario" href="#/reuniao/${aberta.id}">Retomar reunião</a></div>`;
    return;
  }
  // No dia da reunião, o painel já pode ter virado para a semana seguinte; a reunião trata de hoje.
  const dia = est.boot.reuniao_dia ?? 2;
  const semana = parseISO(hoje()).getUTCDay() === dia ? hoje() : est.boot.semana;
  const p = await get(`/painel?semana=${semana}`);
  const pendentes = p.resumo.pendentes;
  raiz.innerHTML = `<div class="cabeca"><div><h1>Iniciar reunião</h1><div class="sub">Reunião de ${diaSemana(semana)}, ${br(semana)}, às ${est.boot.reuniao_hora || '10:00'}</div></div></div>
    <div class="cartao"><h2>Antes de começar</h2>
      <ul class="lista-pre">
        <li>${plural(p.itens.length, 'seção será apresentada', 'seções serão apresentadas')}, das que mais precisam de atenção para as que estão em dia.</li>
        <li>${pendentes ? `<b>${plural(pendentes, 'seção ainda não enviou', 'seções ainda não enviaram')}</b> a atualização da semana.` : 'Todas as seções enviaram a atualização da semana.'}</li>
        <li>${plural(p.resumo.pedidos, 'pedido de novo prazo aguarda', 'pedidos de novo prazo aguardam')} decisão.</li>
        <li>${plural(comb.ativos, 'combinado ativo abre', 'combinados ativos abrem')} a reunião.</li>
      </ul>
      <p class="suave pequeno">Ligue o notebook à TV antes de iniciar. Ao começar, a tela passa para o modo de apresentação; use as setas do teclado para avançar.</p>
      <button class="btn btn-primario" id="iniciar-reuniao">Iniciar reunião</button></div>`;
  const botao = $('#iniciar-reuniao', raiz);
  botao.addEventListener('click', async () => {
    botao.disabled = true;
    try {
      const ini = await post('/reunioes/iniciar');
      location.hash = `#/reuniao/${ini.reuniao.id}${ini.mostrar_combinados && !ini.retomada ? '?abertura=1' : ''}`;
    } catch (e) { botao.disabled = false; toast(e.message, 'erro'); }
  });
}

export async function viewReuniao(raiz, { id: idRota, q }) {
  const reuniao = await get(`/reunioes/${idRota}`);
  if (reuniao.status !== 'em_andamento') { location.hash = `#/reunioes/${idRota}`; return; }
  const comAbertura = q?.get('abertura') === '1';
  if (comAbertura) history.replaceState(null, '', `#/reuniao/${idRota}`); // recarregar não repete a abertura
  const S = {
    id: reuniao.id,
    passo: comAbertura ? 'abertura' : 'visao',
    idx: 0,
    tempo: false,
    reuniao: null,
    cartoes: [],
    novas: [],
  };
  const recarregar = async () => {
    const [r, c] = await Promise.all([get(`/reunioes/${S.id}`), get(`/reunioes/${S.id}/cartoes`)]);
    S.reuniao = r;
    S.cartoes = c.cartoes;
    S.idx = Math.min(S.idx, Math.max(0, S.cartoes.length - 1));
  };
  await recarregar();
  const apoio = est.user.perfil === 'apoio';

  const topo = () => `<header class="tv-topo">
      <div><h1>Reunião de ${diaSemana(S.reuniao.data)}, ${br(S.reuniao.data)}</h1>
        <div class="suave">${plural(S.cartoes.length, 'seção', 'seções')} · ${plural(S.reuniao.decisoes.length, 'decisão', 'decisões')} · ${plural(S.novas.length, 'nova ação', 'novas ações')}${apoio ? ' · operado pelo Apoio' : ''}</div></div>
      <div class="tv-passos" role="navigation" aria-label="Seções da reunião">
        <button class="btn btn-fantasma" data-a="visao" title="Visão geral">Visão geral</button>
        ${S.cartoes.map((c, i) => `<button class="tv-passo cor-${c.cor} ${S.passo === 'secao' && S.idx === i ? 'atual' : ''}" data-a="secao" data-i="${i}" aria-label="${esc(c.secao.sigla || c.secao.nome)}: ${c.cor}" title="${esc(c.secao.nome)}"></button>`).join('')}
      </div>
      <div class="linha"><button class="btn btn-fantasma" data-a="sair">Sair sem encerrar</button><button class="btn btn-sec" data-a="encerrar">Encerrar reunião</button></div></header>`;

  const relatoLista = (arr, vazio) => (arr.length ? `<ul>${arr.join('')}</ul>` : `<p class="nada">${vazio}</p>`);
  const li = (t, cls = '') => `<li class="${cls}">${esc(t)}</li>`;

  const abertura = () => {
    const c = S.reuniao.combinados_snapshot;
    return `<div class="tv-palco"><div class="tv-centrado"><div class="suave">Reunião de ${diaSemana(S.reuniao.data)}, ${br(S.reuniao.data)}, às 10h</div>
      <h2>Combinados da reunião</h2>
      ${c.length ? `<ol class="tv-combinados">${c.map((x) => `<li>${esc(x.texto)}</li>`).join('')}</ol>` : '<p class="nada">Nenhum combinado ativo.</p>'}</div></div>
      <footer class="tv-rodape"><span class="tv-dica">Tecla → para começar</span><button class="btn btn-primario" data-a="visao">Iniciar reunião →</button></footer>`;
  };

  const resumoSecao = (c) => {
    const f = [];
    if (!c.enviada) f.push('Atualização pendente');
    if (c.critico) f.push('Impedimento crítico');
    if (c.atrasadas) f.push(plural(c.atrasadas, 'ação atrasada', 'ações atrasadas'));
    if (c.vencendo) f.push(`${plural(c.vencendo, 'vence', 'vencem')} em até 2 dias`);
    if (c.pedidos_pendentes) f.push(plural(c.pedidos_pendentes, 'pedido de prazo', 'pedidos de prazo'));
    if (S.tempo) f.push(`Tempo na semana: ${fmtMin(c.tempo_semana)}`);
    return f.length ? f.join(' · ') : 'Tudo em dia';
  };

  const visao = () => {
    const alertas = S.cartoes.map((c, i) => ({ c, i })).filter((x) => x.c.cor !== 'verde');
    const verdes = S.cartoes.map((c, i) => ({ c, i })).filter((x) => x.c.cor === 'verde');
    return `<div class="tv-palco"><div class="tv-cabeca"><h2>Visão geral</h2><span class="suave">Em ordem de necessidade: primeiro quem precisa de decisão.</span></div>
      ${alertas.length ? `<div class="tv-grade">${alertas.map(({ c, i }) => `<button class="tv-secao cor-${c.cor}" data-a="secao" data-i="${i}">
        <span class="linha" style="justify-content:space-between"><b>${esc(c.secao.nome)}</b>${sem(c.cor)}</span><small>${esc(c.secao.chefe_nome || 'sem chefe')} · ${esc(c.secao.sigla || '')}</small><span>${esc(resumoSecao(c))}</span></button>`).join('')}</div>`
        : '<p class="nada">Nenhuma seção pede atenção.</p>'}
      ${verdes.length ? `<div class="tv-cartao"><div class="tv-verdes"><span>${sem('verde')} <b>No verde: relato oral é opcional.</b></span>
        ${verdes.map(({ c, i }) => `<button class="btn btn-sec" data-a="secao" data-i="${i}">${esc(c.secao.sigla || c.secao.nome)}</button>`).join('')}</div></div>` : ''}
      ${S.reuniao.decisoes.length ? `<div class="tv-decisoes">${S.reuniao.decisoes.map((d) => `<div><b>${esc(d.secao_sigla || 'Geral')}</b> · ${esc(d.texto)}</div>`).join('')}</div>` : ''}</div>
      <footer class="tv-rodape"><div class="linha"><button class="btn btn-sec" data-a="combinados">Ver combinados</button><button class="btn btn-sec" data-a="acao-nova">Nova ação</button><button class="btn btn-sec" data-a="decisao-geral">Decisão geral</button></div>
        <button class="btn btn-primario" data-a="secao" data-i="0" ${S.cartoes.length ? '' : 'disabled'}>Começar pelas seções →</button></footer>`;
  };

  const secao = () => {
    const c = S.cartoes[S.idx];
    if (!c) return '<div class="tv-palco"><p class="nada">Nenhuma seção cadastrada.</p></div>';
    const at = c.atualizacao;
    const feitos = at ? [...at.feito.previstos.map((p) => li(`${p.cumprido ? '✓ ' : 'Não cumprido: '}${p.texto}`, p.cumprido ? 'ok' : 'pend')), ...at.feito.extras.map((t) => li(t))] : [];
    const decs = S.reuniao.decisoes.filter((d) => d.secao_id === c.secao.id);
    return `<div class="tv-palco"><div class="tv-cabeca"><h2>${esc(c.secao.nome)}</h2>${sem(c.cor)}
        <span class="suave">${esc(c.secao.chefe_nome || 'sem chefe')} · ${S.idx + 1} de ${S.cartoes.length}</span></div>
      <div class="tv-blocos">
        <div class="tv-relato">
          <div class="tv-cartao tv-caixa"><h3>Feito</h3>${at ? relatoLista(feitos, 'Nada informado.') : '<p class="nada">Atualização ainda não enviada.</p>'}</div>
          <div class="tv-cartao tv-caixa"><h3>Próximo</h3>${at ? relatoLista(at.proximo.map((t) => li(t)), 'Nada informado.') : '<p class="nada">—</p>'}</div>
          <div class="tv-cartao tv-caixa ${c.critico ? 'critico' : ''}"><h3>Impedimentos${c.critico ? ' · crítico' : ''}</h3>${at ? relatoLista(at.impedimentos.map((t) => li(t)), 'Nenhum impedimento.') : '<p class="nada">—</p>'}</div>
          <div class="tv-cartao tv-caixa"><h3>Apoio necessário</h3>${at?.apoio ? `<p style="margin:0;font-size:1.1rem">${esc(at.apoio)}</p>` : '<p class="nada">Nada informado.</p>'}</div>
        </div>
        <div class="tv-acoes">
          ${c.pedidos.map((p) => `<div class="tv-pedido"><b>Pedido de novo prazo</b><span>${esc(p.acao_titulo)}</span><span class="num">${br(p.prazo_atual)} → <b>${br(p.novo_prazo)}</b></span>
            <span style="color:#e6d9a0">${esc(p.justificativa)}</span>
            <span class="linha"><button class="btn btn-ok" data-a="decidir" data-p="${p.id}" data-v="1">Aprovar</button><button class="btn btn-perigo" data-a="decidir" data-p="${p.id}" data-v="0">Recusar</button></span></div>`).join('')}
          <div class="tv-caixa"><h3>Ações da seção</h3></div>
          ${c.acoes.length ? c.acoes.map((a) => `<div class="tv-acao ${a.atrasada ? 'atrasada' : ''}"><span class="linha1"><b>${esc(a.titulo)}</b><span>${STATUS[a.status]}</span></span>
            <small>Prazo ${br(a.prazo)}${a.atrasada ? ' · atrasada' : ''}${S.tempo ? '' : ''}</small>${S.tempo ? `<span class="tv-tempo">Tempo: ${fmtMin(a.tempo_total)}</span>` : ''}</div>`).join('')
            : '<p class="nada">Nenhuma ação aberta.</p>'}
          ${decs.length ? `<div class="tv-caixa"><h3>Decisões desta seção</h3></div><div class="tv-decisoes">${decs.map((d) => `<div>${esc(d.texto)}</div>`).join('')}</div>` : ''}
        </div>
      </div></div>
      <footer class="tv-rodape"><div class="linha"><button class="btn btn-sec" data-a="ant" ${S.idx === 0 ? 'disabled' : ''}>← Anterior</button>
        <button class="btn btn-sec" data-a="decisao">Registrar decisão</button><button class="btn btn-sec" data-a="acao-nova">Nova ação</button></div>
        <div class="linha"><button class="btn btn-fantasma" data-a="tempo" aria-pressed="${S.tempo}">${S.tempo ? 'Ocultar tempo' : 'Exibir tempo (aparece na TV)'}</button>
        ${S.idx < S.cartoes.length - 1 ? '<button class="btn btn-primario" data-a="prox">Próxima →</button>' : '<button class="btn btn-primario" data-a="encerrar">Encerrar reunião</button>'}</div></footer>`;
  };

  const desenhar = () => {
    raiz.innerHTML = `${topo()}${S.passo === 'abertura' ? abertura() : S.passo === 'secao' ? secao() : visao()}`;
    raiz.querySelector('.tv-passo.atual, [data-a=prox], [data-a=visao].btn-primario, .btn-primario')?.focus({ preventScroll: true });
  };
  const irPara = (passo, idx = S.idx) => { S.passo = passo; S.idx = idx; desenhar(); };
  const secaoAtual = () => (S.passo === 'secao' ? S.cartoes[S.idx] : null);
  const erro = (e) => toast(e.message, 'erro');

  const formAcao = () => {
    const c = secaoAtual();
    abrirForm({
      titulo: c ? `Nova ação para ${c.secao.sigla || c.secao.nome}` : 'Nova ação',
      corpo: `<div class="campo"><label for="na-t">O que precisa ser feito</label><input id="na-t" name="titulo" maxlength="160"></div>
        <div class="campo"><label>Para quem</label><div class="escolha">
          ${c ? `<label><input type="radio" name="destino" value="esta" checked> ${esc(c.secao.sigla || c.secao.nome)}</label>` : ''}
          <label><input type="radio" name="destino" value="todos" ${c ? '' : 'checked'}> Todos os Centros</label>
          <label><input type="radio" name="destino" value="escolher"> Escolher seções</label></div></div>
        <div class="campo oculto" id="na-alvos"><div class="escolha">${S.cartoes.map((x) => `<label><input type="checkbox" name="secao" value="${x.secao.id}"> ${esc(x.secao.sigla || x.secao.nome)}</label>`).join('')}</div></div>
        <div class="dois"><div class="campo"><label for="na-p">Prazo</label><input id="na-p" type="date" name="prazo" min="${hoje()}" value="${addDias(hoje(), 7)}"></div>
        <div class="campo"><label for="na-pr">Prioridade</label><select id="na-pr" name="prioridade"><option value="alta">Alta</option><option value="media" selected>Média</option><option value="baixa">Baixa</option></select></div></div>`,
      rotulo: 'Direcionar ação',
      aoAbrir: (dlg, form) => on(form, 'change', 'input[name=destino]', () => $('#na-alvos', dlg).classList.toggle('oculto', form.destino.value !== 'escolher')),
      aoEnviar: async (d, form) => {
        const alvos = d.destino === 'esta' ? [c.secao.id] : [...form.querySelectorAll('input[name=secao]:checked')].map((x) => Number(x.value));
        const r = await post(`/reunioes/${S.id}/acoes`, { titulo: d.titulo, destino: d.destino === 'todos' ? 'todos' : 'especificos', secoes: alvos, prazo: d.prazo, prioridade: d.prioridade });
        S.novas.push({ titulo: d.titulo, n: r.acoes_criadas });
        toast(`Ação direcionada a ${plural(r.acoes_criadas, 'seção', 'seções')}.`);
        await recarregar();
        desenhar();
      },
    });
  };
  const formDecisao = (geral) => {
    const c = geral ? null : secaoAtual();
    abrirForm({
      titulo: c ? `Decisão: ${c.secao.sigla || c.secao.nome}` : 'Decisão geral',
      corpo: '<div class="campo"><label for="dc-t">O que foi decidido</label><textarea id="dc-t" name="texto" maxlength="600"></textarea></div>',
      rotulo: 'Registrar decisão',
      aoEnviar: async (d) => { await post(`/reunioes/${S.id}/decisoes`, { texto: d.texto, secao_id: c?.secao.id ?? null }); toast('Decisão registrada.'); await recarregar(); desenhar(); },
    });
  };

  on(raiz, 'click', '[data-a]', async (el) => {
    const a = el.dataset.a;
    try {
      if (a === 'visao') irPara('visao');
      else if (a === 'secao') irPara('secao', Number(el.dataset.i ?? 0));
      else if (a === 'prox') irPara('secao', Math.min(S.cartoes.length - 1, S.idx + 1));
      else if (a === 'ant') irPara('secao', Math.max(0, S.idx - 1));
      else if (a === 'combinados') irPara('abertura');
      else if (a === 'tempo') { S.tempo = !S.tempo; desenhar(); }
      else if (a === 'acao-nova') formAcao();
      else if (a === 'decisao') formDecisao(false);
      else if (a === 'decisao-geral') formDecisao(true);
      else if (a === 'sair') location.hash = '#/painel';
      else if (a === 'decidir') {
        await post(`/pedidos-prazo/${el.dataset.p}/decidir`, { aprovar: el.dataset.v === '1', reuniao_id: S.id });
        toast(el.dataset.v === '1' ? 'Novo prazo aprovado.' : 'Pedido recusado.');
        await recarregar();
        desenhar();
      } else if (a === 'encerrar') {
        if (await confirmar({ titulo: 'Encerrar a reunião', texto: 'A ata será montada em rascunho, com as decisões e as novas ações, para revisão antes de enviar aos chefes.', rotulo: 'Encerrar e montar a ata' })) {
          await post(`/reunioes/${S.id}/encerrar`);
          location.hash = `#/reunioes/${S.id}`;
        }
      }
    } catch (e) { erro(e); }
  });

  const teclas = (ev) => {
    if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
    if (ev.key === 'ArrowRight') {
      if (S.passo === 'abertura') irPara('visao');
      else if (S.passo === 'visao' && S.cartoes.length) irPara('secao', 0);
      else if (S.passo === 'secao') irPara('secao', Math.min(S.cartoes.length - 1, S.idx + 1));
    } else if (ev.key === 'ArrowLeft') {
      if (S.passo === 'secao') { if (S.idx === 0) irPara('visao'); else irPara('secao', S.idx - 1); }
    } else if (ev.key === 'Escape' && S.passo !== 'visao') irPara('visao');
  };
  document.addEventListener('keydown', teclas);
  // Reuniões longas têm minutos sem nenhuma chamada ao servidor; um ping mantém a sessão ativa.
  const mantemSessao = setInterval(() => get('/bootstrap').catch(() => {}), 10 * 60 * 1000);
  window.addEventListener('hashchange', () => { document.removeEventListener('keydown', teclas); clearInterval(mantemSessao); }, { once: true });
  desenhar();
}
