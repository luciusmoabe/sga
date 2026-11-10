// Reunião do chefe com a equipe da própria seção, com a mesma estrutura da reunião do Diretor (reuniao.js, atas.js):
//   - lista das atas, agrupadas pelo tipo da unidade (Diretoria Adjunta, Centros, Coordenações, Subseções);
//   - Modo Reunião (tela cheia, setas do teclado): visão geral e um cartão por pessoa, presença, decisões, informações,
//     ações criadas ao vivo e data da próxima reunião;
//   - ata: montada ao encerrar, revisada em rascunho e enviada a quem participou.
import { del, get, patch, post, put } from './api.js';
import { est } from './estado.js';
import { abrirAcao } from './acao-comum.js';
import { baixarPdfAta } from './pdf-ata.js';
import { campoEditorAta, ligarEditorAta } from './ata-editor.js';
import { carregarCabecalhoAta, htmlCabecalhoAta } from './ata-cabecalho.js';
import { renderizarAta } from './atas.js';
import { nomePlural, nomeTipo } from './vocab.js';
import { abrirForm, addDias, br, confirmar, dataHora, diaSemana, esc, on, plural, sem, STATUS, toast, vazio } from './ui.js';
import { DIAS_SEM_MOVIMENTO } from './regras.js';

const ST = { em_andamento: 'Em andamento', rascunho: 'Ata em rascunho', enviada: 'Ata enviada' };
const CLS = { em_andamento: 'st-em_andamento', rascunho: 'st-bloqueada', enviada: 'st-concluida' };
const ORDEM_TIPOS = ['diretoria_adjunta', 'centro', 'coordenacao', 'subsecao'];
const erro = (e) => toast(e.message, 'erro');

// ---------- Lista (e histórico de uma reunião) ----------
export async function reunioesEquipe(raiz, { id, refresh }) {
  if (id) return detalhe(raiz, { id, refresh });
  const lista = await get('/reunioes-equipe');
  const chefe = est.user.perfil === 'chefe' && !!est.user.secao_id;
  // Agrupadas por nível do organograma: o tipo da unidade que fez a reunião, na ordem Diretoria, Centros, Coordenações e Subseções.
  const tipos = [...ORDEM_TIPOS, ...new Set(lista.map((r) => r.secao_tipo).filter((t) => !ORDEM_TIPOS.includes(t)))];
  const grupos = tipos.map((tipo) => ({ tipo, itens: lista.filter((r) => r.secao_tipo === tipo) })).filter((g) => g.itens.length);
  const tituloDe = (tipo) => (tipo === 'diretoria_adjunta' ? nomeTipo(tipo) : nomePlural(tipo));
  const tabela = (itens) => `<table class="tabela-lista"><thead><tr><th>Data</th><th>Unidade</th><th>Situação</th><th>Presentes</th><th>Decisões</th></tr></thead><tbody>
    ${itens.map((r) => `<tr class="clicavel" data-id="${r.id}" tabindex="0"><td><b>${br(r.data)}</b> <span class="suave pequeno">${diaSemana(r.data)}</span></td>
      <td data-rotulo="Unidade">${esc(r.secao_sigla || r.secao_nome)}${r.conduzida ? ' <span class="estrutura-selo">Sua reunião</span>' : ''}</td>
      <td data-rotulo="Situação"><span class="pilula ${CLS[r.status]}">${ST[r.status]}</span></td>
      <td class="num" data-rotulo="Presentes">${r.presentes}</td><td class="num" data-rotulo="Decisões">${r.decisoes}</td></tr>`).join('')}</tbody></table>`;
  raiz.innerHTML = `
    <div class="cabeca linha entre" style="align-items:flex-start"><div><h1>${chefe ? 'Reuniões e atas da equipe' : 'Atas da equipe'}</h1>
      <div class="sub">${chefe ? 'Reúna a equipe da sua seção no Modo Reunião e guarde a ata. Você também lê as atas das subseções abaixo da sua.' : 'As atas das reuniões de que você participou.'}</div></div>
      ${chefe ? '<button type="button" class="btn btn-primario" id="iniciar-reuniao-equipe">Iniciar ou retomar reunião</button>' : ''}</div>
    ${grupos.length ? grupos.map((g) => `<section class="cartao" aria-labelledby="grupo-${g.tipo}"><h2 id="grupo-${g.tipo}">${esc(tituloDe(g.tipo))} <span class="suave pequeno">· ${plural(g.itens.length, 'reunião', 'reuniões')}</span></h2>${tabela(g.itens)}</section>`).join('')
      : `<div class="cartao">${vazio('Nenhuma reunião ainda', chefe ? 'Use "Iniciar reunião" quando for reunir a equipe.' : 'Quando você participar de uma reunião e a ata for enviada, ela aparece aqui.')}</div>`}`;
  const abrir = (el) => {
    const r = lista.find((x) => x.id === Number(el.dataset.id));
    location.hash = r?.status === 'em_andamento' && r.conduzida ? `#/reuniao-equipe/${r.id}` : `#/reunioes-equipe/${el.dataset.id}`;
  };
  on(raiz, 'click', 'tr[data-id]', abrir);
  on(raiz, 'keydown', 'tr[data-id]', (el, ev) => { if (ev.key === 'Enter') abrir(el); });
  raiz.querySelector('#iniciar-reuniao-equipe')?.addEventListener('click', async (ev) => {
    const botao = ev.currentTarget;
    botao.disabled = true;
    try { const r = await post('/reunioes-equipe/iniciar'); location.hash = `#/reuniao-equipe/${r.reuniao.id}`; }
    catch (e) { erro(e); botao.disabled = false; }
  });
}

// ---------- Registros e ata de uma reunião ----------
const listaHTML = (arr, f) => (arr.length ? `<ul>${arr.map((x) => `<li>${f(x)}</li>`).join('')}</ul>` : '<p class="suave pequeno">Nenhum registro.</p>');

async function detalhe(raiz, { id, refresh }) {
  const [r, cabecalho] = await Promise.all([get(`/reunioes-equipe/${id}`), carregarCabecalhoAta()]);
  const conduz = r.pode_conduzir;
  const editavel = conduz && ['rascunho', 'enviada'].includes(r.status);
  const topo = conduz && r.status === 'em_andamento' ? `<a class="btn btn-primario" href="#/reuniao-equipe/${r.id}">Voltar ao Modo Reunião</a>`
    : r.status === 'em_andamento' ? '' : '<button type="button" class="btn btn-sec nao-imprimir" id="pdf-ata">Baixar PDF</button>';
  raiz.innerHTML = `
    <div class="cabeca linha entre" style="align-items:flex-start">
      <div><a href="#/reunioes-equipe" class="pequeno nao-imprimir">← ${est.user.perfil === 'membro' ? 'Atas da equipe' : 'Reuniões e atas da equipe'}</a>
        <h1>Reunião da equipe · ${esc(r.secao_sigla || r.secao_nome)}</h1>
        <div class="sub"><span class="pilula ${CLS[r.status]}">${ST[r.status]}</span> · ${br(r.data)} (${diaSemana(r.data)}) · iniciada em ${dataHora(r.iniciada_em)}${r.encerrada_em ? ` · encerrada em ${dataHora(r.encerrada_em)}` : ''}</div></div>
      <div class="acoes-topo">${topo}</div></div>
    <div class="dois reuniao-registros nao-imprimir" style="align-items:start">
      <div class="cartao"><h2>Participantes</h2>${listaHTML(r.participantes.filter((p) => p.presente), (p) => `${esc(p.nome)}${p.secao_sigla ? ` · ${esc(p.secao_sigla)}` : ''}`)}</div>
      <div class="cartao"><h2>Decisões</h2>${listaHTML(r.decisoes, (d) => `${esc(d.texto)}${d.responsavel_nome ? ` <span class="suave pequeno">· ${esc(d.responsavel_nome)}</span>` : ''}`)}</div>
      <div class="cartao"><h2>Novas ações</h2>${listaHTML(r.novas_acoes, (a) => `${esc(a.titulo)} <span class="suave pequeno">· ${esc(a.responsavel_nome || 'sem responsável')} · prazo ${br(a.prazo)}</span>`)}</div>
      <div class="cartao"><h2>Informações e comunicados</h2>${listaHTML(r.informacoes, (i) => esc(i.texto))}</div>
    </div>
    <div class="espaco nao-imprimir"></div>
    <div class="cartao">
      <h2>Ata</h2>
      ${r.status === 'em_andamento' ? '' : htmlCabecalhoAta(cabecalho)}
      ${r.status === 'em_andamento' ? '<p class="suave">A ata será montada quando a reunião for encerrada.</p>'
        : editavel ? `${r.status === 'rascunho'
          ? '<div class="info nao-imprimir">A ata foi montada com o que foi registrado na reunião. Revise, ajuste se precisar e envie: só quem esteve presente a lê (e os chefes das unidades acima da sua).</div>'
          : `<p class="suave pequeno nao-imprimir">Enviada em ${dataHora(r.enviada_em)}. As correções valem para todos assim que você salvar.</p>`}
          ${campoEditorAta(r.ata_texto)}
          <details class="nao-imprimir"><summary>Pré-visualização de leitura</summary><div class="ata" id="ata-previa">${renderizarAta(r.ata_texto)}</div></details>
          <div class="linha nao-imprimir" style="margin-top:10px;flex-wrap:wrap;gap:8px"><button class="btn btn-sec" id="salvar">${r.status === 'enviada' ? 'Salvar alterações' : 'Salvar rascunho'}</button>
            ${r.status === 'rascunho' ? '<button class="btn btn-primario" id="enviar">Enviar aos participantes</button><button class="btn btn-fantasma" id="reabrir">Reabrir a reunião</button>' : ''}
            <button class="btn btn-perigo" id="excluir">Excluir ata</button></div>`
          : `<div class="ata">${renderizarAta(r.ata_texto)}</div><p class="suave pequeno">Enviada em ${dataHora(r.enviada_em)}.</p>`}
    </div>`;

  raiz.querySelector('#pdf-ata')?.addEventListener('click', async (ev) => {
    const botao = ev.currentTarget;
    botao.disabled = true;
    try { await baixarPdfAta(raiz.querySelector('#ata')?.value ?? r.ata_texto, { dataReuniao: r.data, cabecalho }); }
    catch (e) { erro(e); } finally { botao.disabled = false; }
  });
  if (!editavel) return;

  const editor = await ligarEditorAta(raiz, (t) => { raiz.querySelector('#ata-previa').innerHTML = renderizarAta(t); });
  const salvar = async () => { const s = await put(`/reunioes-equipe/${r.id}/ata`, { ata_texto: editor.texto(), ata_base: r.ata_texto }); r.ata_texto = s.ata_texto; };
  raiz.querySelector('#salvar').addEventListener('click', async () => { try { await salvar(); toast(r.status === 'enviada' ? 'Alterações salvas.' : 'Rascunho salvo.'); } catch (e) { erro(e); } });
  raiz.querySelector('#excluir').addEventListener('click', async () => {
    if (!(await confirmar({ titulo: 'Excluir a ata', texto: 'A reunião, a ata e os registros feitos nela serão apagados e não poderão ser recuperados. As ações criadas durante a reunião continuam existindo.', rotulo: 'Excluir ata', perigo: true }))) return;
    try { await del(`/reunioes-equipe/${r.id}`); toast('Ata excluída.'); location.hash = '#/reunioes-equipe'; } catch (e) { erro(e); }
  });
  raiz.querySelector('#enviar')?.addEventListener('click', async () => {
    if (!(await confirmar({ titulo: 'Enviar a ata', texto: 'A ata fica disponível para quem esteve presente e para os chefes das unidades acima da sua. Você ainda poderá corrigi-la depois.', rotulo: 'Enviar aos participantes' }))) return;
    try { await salvar(); await post(`/reunioes-equipe/${r.id}/enviar-ata`); toast('Ata enviada aos participantes.'); await refresh(); } catch (e) { erro(e); }
  });
  raiz.querySelector('#reabrir')?.addEventListener('click', async () => {
    try { await post(`/reunioes-equipe/${r.id}/reabrir`); location.hash = `#/reuniao-equipe/${r.id}`; } catch (e) { erro(e); }
  });
}

// ---------- Modo Reunião ----------
export async function viewReuniaoEquipe(raiz, { id: idRota }) {
  const inicial = await get(`/reunioes-equipe/${idRota}`);
  if (inicial.status !== 'em_andamento' || !inicial.pode_conduzir) { location.hash = `#/reunioes-equipe/${idRota}`; return; }
  const S = { id: inicial.id, passo: 'visao', idx: 0, reuniao: inicial, cartoes: inicial.cartoes, novas: [] };
  const recarregar = async () => {
    S.reuniao = await get(`/reunioes-equipe/${S.id}`);
    S.cartoes = S.reuniao.cartoes;
    S.idx = Math.min(S.idx, Math.max(0, S.cartoes.length - 1));
  };
  const presentes = () => S.reuniao.participantes.filter((p) => p.presente);

  const topo = () => `<header class="tv-topo">
      <div><h1>Reunião da equipe · ${esc(S.reuniao.secao_sigla || S.reuniao.secao_nome)}</h1>
        <div class="suave">${diaSemana(S.reuniao.data)}, ${br(S.reuniao.data)} · ${plural(presentes().length, 'presente', 'presentes')} · ${plural(S.reuniao.decisoes.length, 'decisão', 'decisões')} · ${plural(S.novas.length, 'nova ação', 'novas ações')}</div></div>
      <div class="tv-passos" role="navigation" aria-label="Pessoas da reunião">
        <button class="btn btn-fantasma" data-a="visao" title="Visão geral">Visão geral</button>
        ${S.cartoes.map((c, i) => `<button class="tv-passo cor-${c.cor} ${S.passo === 'pessoa' && S.idx === i ? 'atual' : ''}" data-a="pessoa" data-i="${i}" aria-label="${esc(c.nome)}: ${c.cor}" title="${esc(c.nome)}"></button>`).join('')}
      </div>
      <div class="linha"><button class="btn btn-sec" data-a="presenca">Presença (${presentes().length})</button><button class="btn btn-sec" data-a="informacao">Registrar informação</button>
        <button class="btn btn-sec" data-a="proxima">${S.reuniao.proxima_em ? `Próxima: ${br(S.reuniao.proxima_em).slice(0, 5)}` : 'Próxima reunião'}</button>
        <button class="btn btn-fantasma" data-a="sair">Sair sem encerrar</button><button class="btn btn-sec" data-a="encerrar">Encerrar reunião</button></div>${registros()}</header>`;
  const registros = () => (S.reuniao.informacoes.length ? `<details class="tv-cartao tv-informacoes"><summary>Informações e comunicados (${S.reuniao.informacoes.length})</summary>
      ${S.reuniao.informacoes.map((i) => `<div class="tv-decisao"><span style="white-space:pre-wrap">${esc(i.texto)}</span><span class="tv-decisao-acoes"><button type="button" class="btn btn-fantasma btn-mini" data-editar-info="${i.id}">Editar</button><button type="button" class="btn btn-fantasma btn-mini" data-excluir-info="${i.id}">Excluir</button></span></div>`).join('')}</details>` : '');

  const li = (t, cls = '') => `<li class="${cls}">${esc(t)}</li>`;
  const lista = (arr, vazioTxt) => (arr.length ? `<ul>${arr.join('')}</ul>` : `<p class="nada">${vazioTxt}</p>`);
  const resumo = (c) => {
    const f = [];
    if (c.impedimentos.some((i) => i.critico)) f.push('Impedimento crítico');
    if (c.atrasadas) f.push(plural(c.atrasadas, 'ação atrasada', 'ações atrasadas'));
    if (c.vencem) f.push(`${plural(c.vencem, 'vence', 'vencem')} em até 2 dias`);
    if (c.paradas) f.push(`${plural(c.paradas, 'ação', 'ações')} sem atualização há ${DIAS_SEM_MOVIMENTO}+ dias`);
    return f.length ? f.join(' · ') : (c.abertas ? `${plural(c.abertas, 'ação em dia', 'ações em dia')}` : 'Nenhuma ação em aberto');
  };

  const visao = () => {
    const pedem = S.cartoes.map((c, i) => ({ c, i })).filter((x) => x.c.presente && x.c.cor !== 'verde');
    const verdes = S.cartoes.map((c, i) => ({ c, i })).filter((x) => x.c.presente && x.c.cor === 'verde');
    const ausentes = S.cartoes.filter((c) => !c.presente);
    const gerais = S.reuniao.decisoes.filter((d) => !d.responsavel_id);
    return `<div class="tv-palco"><div class="tv-cabeca"><h2>Visão geral</h2><span class="suave">Em ordem de necessidade: primeiro quem precisa de atenção.</span></div>
      ${pedem.length ? `<div class="tv-grade">${pedem.map(({ c, i }) => `<button class="tv-secao cor-${c.cor}" data-a="pessoa" data-i="${i}">
        <span class="linha" style="justify-content:space-between"><b>${esc(c.nome)}</b>${sem(c.cor)}</span><small>${esc(c.secao_sigla || 'Reunião')}</small><span>${esc(resumo(c))}</span></button>`).join('')}</div>`
        : '<p class="nada">Ninguém pede atenção agora.</p>'}
      ${verdes.length ? `<div class="tv-cartao"><div class="tv-verdes"><span>${sem('verde')} <b>No verde: relato oral é opcional.</b></span>
        ${verdes.map(({ c, i }) => `<button class="btn btn-sec" data-a="pessoa" data-i="${i}">${esc(c.nome)}</button>`).join('')}</div></div>` : ''}
      ${ausentes.length ? `<p class="nada">Ausentes: ${ausentes.map((c) => esc(c.nome)).join(', ')}. Marque a presença para incluí-los.</p>` : ''}
      ${gerais.length ? `<div class="tv-decisoes">${gerais.map((d) => `<div><b>Geral</b> · ${esc(d.texto)}</div>`).join('')}</div>` : ''}</div>
      <footer class="tv-rodape"><div class="linha"><button class="btn btn-sec" data-a="acao-nova">Nova ação</button><button class="btn btn-sec" data-a="decisao-geral">Decisão geral</button></div>
        <button class="btn btn-primario" data-a="pessoa" data-i="0" ${S.cartoes.length ? '' : 'disabled'}>Começar pelas pessoas →</button></footer>`;
  };

  const pessoa = () => {
    const c = S.cartoes[S.idx];
    if (!c) return '<div class="tv-palco"><p class="nada">Ninguém na reunião.</p></div>';
    const decs = c.usuario_id ? S.reuniao.decisoes.filter((d) => d.responsavel_id === c.usuario_id) : [];
    return `<div class="tv-palco"><div class="tv-cabeca"><h2>${esc(c.nome)}</h2>${sem(c.cor)}
        <span class="suave">${c.presente ? '' : 'ausente · '}${S.idx + 1} de ${S.cartoes.length}</span></div>
      <div class="tv-blocos">
        <div class="tv-relato">
          <div class="tv-cartao tv-caixa"><h3>Feito</h3>${lista(c.feitas.map((a) => li(`${a.titulo} · concluída em ${dataHora(a.concluida_em)}`)), 'Nada concluído desde a reunião anterior.')}</div>
          <div class="tv-cartao tv-caixa"><h3>Próximo</h3>${lista(c.proximas.map((a) => li(`${a.titulo} · prazo ${br(a.prazo)}`)), 'Nada com prazo nos próximos 7 dias.')}</div>
          <div class="tv-cartao tv-caixa ${c.impedimentos.some((i) => i.critico) ? 'critico' : ''}"><h3>Impedimentos${c.impedimentos.some((i) => i.critico) ? ' · crítico' : ''}</h3>
            ${lista(c.impedimentos.map((i) => li(`${i.critico ? 'CRÍTICO · ' : ''}${i.acao_titulo}: ${i.descricao}`, i.critico ? 'pend' : '')), 'Nenhum impedimento.')}</div>
          <div class="tv-cartao tv-caixa"><h3>Apoio necessário</h3>${c.apoios.length ? c.apoios.map((a) => `<p style="margin:0 0 6px;font-size:1.1rem">${esc(a.acao_titulo)}: ${esc(a.apoio)}</p>`).join('') : '<p class="nada">Nada informado.</p>'}</div>
        </div>
        <div class="tv-acoes">
          <div class="tv-caixa"><h3>${c.usuario_id ? `Ações de ${esc(c.nome.split(' ')[0])}` : 'Ações sem responsável'}</h3></div>
          ${c.acoes.length ? c.acoes.map((a) => `<button type="button" class="tv-acao ${a.situacao === 'atrasada' ? 'atrasada' : ''}" data-abrir-acao="${a.id}"><span class="linha1"><b>${esc(a.titulo)}</b><span>${STATUS[a.status]}</span></span>
            <small>${esc(a.secao_sigla || '')} · prazo ${br(a.prazo)}${a.situacao === 'atrasada' ? ' · atrasada' : a.situacao === 'parada' ? ' · sem atualização' : ''}</small></button>`).join('') : '<p class="nada">Nenhuma ação em aberto.</p>'}
          ${decs.length ? `<div class="tv-caixa"><h3>Decisões sobre ${esc(c.nome.split(' ')[0])}</h3></div><div class="tv-decisoes">${decs.map((d) => `<div class="tv-decisao"><span>${esc(d.texto)}</span>
            <span class="tv-decisao-acoes"><button type="button" class="btn btn-fantasma btn-mini" data-editar-dec="${d.id}">Editar</button><button type="button" class="btn btn-fantasma btn-mini" data-excluir-dec="${d.id}">Excluir</button></span></div>`).join('')}</div>` : ''}
        </div>
      </div></div>
      <footer class="tv-rodape"><div class="linha"><button class="btn btn-sec" data-a="ant" ${S.idx === 0 ? 'disabled' : ''}>← Anterior</button>
        <button class="btn btn-sec" data-a="decisao">Registrar decisão</button><button class="btn btn-sec" data-a="acao-nova">Nova ação</button></div>
        <div class="linha">${S.idx < S.cartoes.length - 1 ? '<button class="btn btn-primario" data-a="prox">Próxima →</button>' : '<button class="btn btn-primario" data-a="encerrar">Encerrar reunião</button>'}</div></footer>`;
  };

  const desenhar = () => {
    raiz.innerHTML = `${topo()}${S.passo === 'pessoa' ? pessoa() : visao()}`;
    raiz.querySelector('.tv-passo.atual, [data-a=prox], .btn-primario')?.focus({ preventScroll: true });
  };
  const irPara = (passo, idx = S.idx) => { S.passo = passo; S.idx = idx; desenhar(); };
  const atual = () => (S.passo === 'pessoa' ? S.cartoes[S.idx] : null);
  const depois = async (msg) => { if (msg) toast(msg); await recarregar(); desenhar(); };

  const formInformacao = (info = null) => abrirForm({
    titulo: info ? 'Editar informação' : 'Informação ou comunicado para a ata',
    corpo: `<p class="suave pequeno">Registre informes, contexto ou assuntos discutidos. Este texto fará parte da ata.</p><div class="campo"><label for="ri-texto">Informação</label><textarea id="ri-texto" name="texto" maxlength="2000" required>${esc(info?.texto || '')}</textarea></div>`,
    aoEnviar: async (d) => {
      if (info) await patch(`/reunioes-equipe/${S.id}/informacoes/${info.id}`, { texto: d.texto });
      else await post(`/reunioes-equipe/${S.id}/informacoes`, { texto: d.texto });
      await depois('Informação registrada.');
    },
  });
  const formPresenca = () => abrirForm({
    titulo: 'Quem participou da reunião?',
    corpo: `<p class="suave pequeno">Marque quem está presente. Só quem estiver marcado lê a ata.</p><div class="escolha">${S.reuniao.participantes.map((p) => `<label><input type="checkbox" name="participante" value="${p.usuario_id}" ${p.presente ? 'checked' : ''}> ${esc(p.nome)}${p.secao_sigla ? ` · ${esc(p.secao_sigla)}` : ''}</label>`).join('')}</div>`,
    rotulo: 'Salvar presença',
    aoEnviar: async (d, form) => {
      await put(`/reunioes-equipe/${S.id}/presenca`, { presentes: [...form.querySelectorAll('input[name=participante]:checked')].map((x) => Number(x.value)) });
      await depois('Presença registrada.');
    },
  });
  const formProxima = () => abrirForm({
    titulo: 'Data da próxima reunião',
    corpo: `<p class="suave pequeno">A data aparece no fim da ata. Deixe em branco se ainda não foi marcada.</p><div class="campo"><label for="pr-data">Próxima reunião</label><input id="pr-data" type="date" name="proxima_em" min="${esc(S.reuniao.data)}" value="${esc(S.reuniao.proxima_em || '')}"></div>`,
    rotulo: 'Salvar data',
    aoEnviar: async (d) => { await patch(`/reunioes-equipe/${S.id}`, { proxima_em: d.proxima_em || '' }); await depois('Data da próxima reunião registrada.'); },
  });
  const formDecisao = (geral) => {
    const c = geral ? null : atual();
    abrirForm({
      titulo: c ? `Decisão: ${c.nome}` : 'Decisão geral',
      corpo: '<div class="campo"><label for="dc-t">O que foi decidido</label><textarea id="dc-t" name="texto" maxlength="600" required></textarea></div>',
      rotulo: 'Registrar decisão',
      aoEnviar: async (d) => { await post(`/reunioes-equipe/${S.id}/decisoes`, { texto: d.texto, responsavel_id: c?.usuario_id ?? null }); await depois('Decisão registrada.'); },
    });
  };
  const formDecisaoEditar = (d) => abrirForm({
    titulo: 'Editar decisão',
    corpo: `<div class="campo"><label for="dc-t">O que foi decidido</label><textarea id="dc-t" name="texto" maxlength="600" required>${esc(d.texto)}</textarea></div>`,
    rotulo: 'Salvar',
    aoEnviar: async (v) => { await patch(`/reunioes-equipe/${S.id}/decisoes/${d.id}`, { texto: v.texto }); await depois('Decisão atualizada.'); },
  });
  const formAcao = () => {
    const c = atual();
    abrirForm({
      titulo: c ? `Nova ação para ${c.nome}` : 'Nova ação',
      corpo: `<div class="campo"><label for="na-t">O que precisa ser feito</label><input id="na-t" name="titulo" maxlength="140" required></div>
        <div class="campo"><label for="na-d">Detalhamento (opcional)</label><textarea id="na-d" name="detalhe" maxlength="2000"></textarea></div>
        <div class="dois"><div class="campo"><label for="na-p">Prazo</label><input id="na-p" type="date" name="prazo" required min="${esc(est.boot.hoje)}" value="${addDias(est.boot.hoje, 7)}"></div>
          <div class="campo"><label for="na-pr">Prioridade</label><select id="na-pr" name="prioridade"><option value="alta">Alta</option><option value="media" selected>Média</option><option value="baixa">Baixa</option></select></div></div>
        <div class="campo"><label for="na-r">Responsável</label><select id="na-r" name="responsavel_id"><option value="">Eu mesmo (sem delegar)</option>
          ${S.reuniao.participantes.filter((p) => p.usuario_id !== est.user.id).map((p) => `<option value="${p.usuario_id}" ${c && p.usuario_id === c.usuario_id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>`,
      rotulo: 'Criar ação',
      aoEnviar: async (d) => {
        const a = await post('/acoes', { secao_id: est.user.secao_id, titulo: d.titulo, detalhe: d.detalhe, prazo: d.prazo, prioridade: d.prioridade, ...(d.responsavel_id ? { responsavel_id: Number(d.responsavel_id) } : {}) });
        await post(`/reunioes-equipe/${S.id}/acoes`, { acao_id: a.id });
        S.novas.push({ titulo: d.titulo });
        await depois('Ação criada.');
      },
    });
  };

  // Ações e decisões são editadas ao vivo, sem sair da reunião: a ação abre o mesmo diálogo do resto do app.
  on(raiz, 'click', '[data-abrir-acao]', (el) => { abrirAcao(Number(el.dataset.abrirAcao), async () => { await recarregar(); desenhar(); }).catch(erro); });
  on(raiz, 'click', '[data-editar-dec]', (el) => { const d = S.reuniao.decisoes.find((x) => x.id === Number(el.dataset.editarDec)); if (d) formDecisaoEditar(d); });
  on(raiz, 'click', '[data-editar-info]', (el) => { const i = S.reuniao.informacoes.find((x) => x.id === Number(el.dataset.editarInfo)); if (i) formInformacao(i); });
  on(raiz, 'click', '[data-excluir-info]', async (el) => {
    if (!(await confirmar({ titulo: 'Excluir informação', texto: 'Esta informação deixará de fazer parte da reunião e da ata.', rotulo: 'Excluir', perigo: true }))) return;
    try { await del(`/reunioes-equipe/${S.id}/informacoes/${el.dataset.excluirInfo}`); await depois(); } catch (e) { erro(e); }
  });
  on(raiz, 'click', '[data-excluir-dec]', async (el) => {
    if (!(await confirmar({ titulo: 'Excluir decisão', texto: 'Isso apaga esta decisão registrada na reunião.', rotulo: 'Excluir decisão', perigo: true }))) return;
    try { await del(`/reunioes-equipe/${S.id}/decisoes/${el.dataset.excluirDec}`); await depois('Decisão excluída.'); } catch (e) { erro(e); }
  });

  on(raiz, 'click', '[data-a]', async (el) => {
    const a = el.dataset.a;
    try {
      if (a === 'visao') irPara('visao');
      else if (a === 'pessoa') irPara('pessoa', Number(el.dataset.i ?? 0));
      else if (a === 'prox') irPara('pessoa', Math.min(S.cartoes.length - 1, S.idx + 1));
      else if (a === 'ant') irPara('pessoa', Math.max(0, S.idx - 1));
      else if (a === 'acao-nova') formAcao();
      else if (a === 'informacao') formInformacao();
      else if (a === 'presenca') formPresenca();
      else if (a === 'proxima') formProxima();
      else if (a === 'decisao') formDecisao(false);
      else if (a === 'decisao-geral') formDecisao(true);
      else if (a === 'sair') location.hash = '#/reunioes-equipe';
      else if (a === 'encerrar') {
        if (await confirmar({ titulo: 'Encerrar a reunião', texto: `A ata será montada com a presença, a situação das ações, as decisões, as novas ações e as informações.${presentes().length > 1 ? '' : ' Ninguém além de você está marcado como presente: registre a presença para que a equipe leia a ata.'}`, rotulo: 'Encerrar e montar a ata' })) {
          await post(`/reunioes-equipe/${S.id}/encerrar`);
          location.hash = `#/reunioes-equipe/${S.id}`;
        }
      }
    } catch (e) { erro(e); }
  });

  const teclas = (ev) => {
    if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
    if (ev.key === 'ArrowRight') {
      if (S.passo === 'visao' && S.cartoes.length) irPara('pessoa', 0);
      else if (S.passo === 'pessoa') irPara('pessoa', Math.min(S.cartoes.length - 1, S.idx + 1));
    } else if (ev.key === 'ArrowLeft') {
      if (S.passo === 'pessoa') { if (S.idx === 0) irPara('visao'); else irPara('pessoa', S.idx - 1); }
    } else if (ev.key === 'Escape' && S.passo !== 'visao') irPara('visao');
  };
  document.addEventListener('keydown', teclas);
  // Reuniões longas têm minutos sem nenhuma chamada ao servidor; um ping mantém a sessão ativa.
  const mantemSessao = setInterval(() => get('/bootstrap').catch(() => {}), 10 * 60 * 1000);
  window.addEventListener('hashchange', () => { document.removeEventListener('keydown', teclas); clearInterval(mantemSessao); }, { once: true });
  desenhar();
}
