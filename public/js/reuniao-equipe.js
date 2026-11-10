// Reunião do chefe com a equipe da própria seção: lista de reuniões, condução (presença, pauta por pessoa, decisões, nova ação)
// e ata. A reunião do Diretor é outra (reuniao.js, atas.js); esta usa as rotas /api/reunioes-equipe.
import { del, get, patch, post, put } from './api.js';
import { est } from './estado.js';
import { abrirAcao } from './acao-comum.js';
import { baixarPdfAta } from './pdf-ata.js';
import { campoEditorAta, ligarEditorAta } from './ata-editor.js';
import { carregarCabecalhoAta, htmlCabecalhoAta } from './ata-cabecalho.js';
import { renderizarAta } from './atas.js';
import { abrirForm, addDias, br, confirmar, dataHora, diaSemana, esc, on, plural, toast, vazio } from './ui.js';

const ST = { em_andamento: 'Em andamento', rascunho: 'Ata em rascunho', enviada: 'Ata enviada' };
const CLS = { em_andamento: 'st-em_andamento', rascunho: 'st-bloqueada', enviada: 'st-concluida' };
const SITUACAO = { atrasada: ['Atrasada', 'sem-vermelho'], vence: ['Vence logo', 'sem-amarelo'], parada: ['Parada', 'sem-amarelo'], normal: ['', ''] };

const erro = (e) => toast(e.message, 'erro');

// ---------- Lista ----------
export async function reunioesEquipe(raiz) {
  const lista = await get('/reunioes-equipe');
  const chefe = est.user.perfil === 'chefe' && !!est.user.secao_id;
  raiz.innerHTML = `
    <div class="cabeca linha entre" style="align-items:flex-start"><div><h1>${chefe ? 'Reunião da equipe' : 'Atas da equipe'}</h1>
      <div class="sub">${chefe ? 'Reúna a equipe da sua seção: registre a presença, veja a situação das ações de cada pessoa, anote as decisões e envie a ata a quem participou.' : 'As atas das reuniões de que você participou.'}</div></div>
      ${chefe ? '<button type="button" class="btn btn-primario" id="iniciar-reuniao-equipe">Iniciar ou retomar reunião</button>' : ''}</div>
    <div class="cartao">${lista.length ? `<table class="tabela-lista"><thead><tr><th>Data</th><th>Seção</th><th>Situação</th><th>Presentes</th><th>Decisões</th></tr></thead><tbody>
      ${lista.map((r) => `<tr class="clicavel" data-id="${r.id}" tabindex="0"><td><b>${br(r.data)}</b> <span class="suave pequeno">${diaSemana(r.data)}</span></td>
        <td data-rotulo="Seção">${esc(r.secao_sigla || r.secao_nome)}</td>
        <td data-rotulo="Situação"><span class="pilula ${CLS[r.status]}">${ST[r.status]}</span></td>
        <td class="num" data-rotulo="Presentes">${r.presentes}</td><td class="num" data-rotulo="Decisões">${r.decisoes}</td></tr>`).join('')}</tbody></table>`
      : vazio('Nenhuma reunião ainda', chefe ? 'Use "Iniciar reunião" quando for reunir a equipe.' : 'Quando você participar de uma reunião e a ata for enviada, ela aparece aqui.')}</div>`;
  const abrir = (el) => { location.hash = `#/reuniao-equipe/${el.dataset.id}`; };
  on(raiz, 'click', 'tr[data-id]', abrir);
  on(raiz, 'keydown', 'tr[data-id]', (el, ev) => { if (ev.key === 'Enter') abrir(el); });
  raiz.querySelector('#iniciar-reuniao-equipe')?.addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    try { const r = await post('/reunioes-equipe/iniciar'); location.hash = `#/reuniao-equipe/${r.reuniao.id}`; }
    catch (e) { erro(e); ev.currentTarget.disabled = false; }
  });
}

// ---------- Reunião ----------
export async function reuniaoEquipe(raiz, { id, refresh }) {
  if (!id) { location.hash = '#/reunioes-equipe'; return; }
  const r = await get(`/reunioes-equipe/${id}`);
  if (r.status === 'em_andamento' && r.pode_conduzir) return conducao(raiz, r, refresh);
  return ata(raiz, r, refresh);
}

const cabecaHTML = (r, extra = '') => `<div class="cabeca linha entre" style="align-items:flex-start">
  <div><a href="#/reunioes-equipe" class="pequeno nao-imprimir">← ${est.user.perfil === 'membro' ? 'Atas da equipe' : 'Reuniões da equipe'}</a>
    <h1>Reunião da equipe · ${esc(r.secao_sigla || r.secao_nome)}</h1>
    <div class="sub"><span class="pilula ${CLS[r.status]}">${ST[r.status]}</span> · ${br(r.data)} (${diaSemana(r.data)}) · iniciada em ${dataHora(r.iniciada_em)}${r.encerrada_em ? ` · encerrada em ${dataHora(r.encerrada_em)}` : ''}</div></div>
  ${extra}</div>`;

const acaoLinhaHTML = (a) => {
  const [rotulo, cor] = SITUACAO[a.situacao];
  return `<li><button type="button" class="reuniao-acao" data-acao="${a.id}"><span class="reuniao-acao-titulo">${esc(a.titulo)}</span>
    <span class="suave pequeno">${esc(a.secao_sigla || '')} · prazo ${br(a.prazo)}</span>${rotulo ? `<span class="sem ${cor}">${rotulo}</span>` : ''}</button></li>`;
};
const cartaoHTML = (c) => `<details class="cartao reuniao-pessoa${c.presente ? '' : ' ausente'}"${c.abertas && c.presente ? ' open' : ''}>
  <summary><span class="reuniao-pessoa-nome"><b>${esc(c.nome)}</b>${c.usuario_id !== null && !c.presente ? ' <span class="suave pequeno">· ausente</span>' : ''}</span>
    <span class="reuniao-numeros">
      <span title="Ações em aberto"><b>${c.abertas}</b> ${c.abertas === 1 ? 'aberta' : 'abertas'}</span>
      ${c.atrasadas ? `<span class="sem sem-vermelho"><b>${c.atrasadas}</b> ${c.atrasadas === 1 ? 'atrasada' : 'atrasadas'}</span>` : ''}
      ${c.vencem ? `<span class="sem sem-amarelo"><b>${c.vencem}</b> vencem logo</span>` : ''}
      ${c.paradas ? `<span class="sem sem-amarelo"><b>${c.paradas}</b> ${c.paradas === 1 ? 'parada' : 'paradas'}</span>` : ''}
    </span></summary>
  ${c.acoes.length ? `<ul class="reuniao-acoes">${c.acoes.map(acaoLinhaHTML).join('')}</ul>` : '<p class="suave pequeno">Nenhuma ação em aberto.</p>'}
</details>`;

function conducao(raiz, r, refresh) {
  const presentes = r.participantes.filter((p) => p.presente);
  raiz.innerHTML = `${cabecaHTML(r, `<div class="acoes-topo"><button type="button" class="btn btn-sec" id="nova-acao">+ Nova ação</button><button type="button" class="btn btn-primario" id="encerrar">Encerrar reunião</button></div>`)}
    <div class="reuniao-equipe-grade">
      <div class="reuniao-equipe-pauta"><h2>Pauta por pessoa</h2>
        <p class="suave pequeno">Cada cartão mostra as ações atribuídas à pessoa. Toque numa ação para abri-la e atualizá-la na hora.</p>
        ${r.cartoes.map(cartaoHTML).join('')}</div>
      <div class="reuniao-equipe-lado">
        <section class="cartao" aria-labelledby="titulo-presenca"><h2 id="titulo-presenca">Presença</h2>
          <p class="suave pequeno">${plural(presentes.length, 'pessoa presente', 'pessoas presentes')}. Só quem estiver marcado lê a ata.</p>
          <ul class="reuniao-presenca">${r.participantes.map((p) => `<li><label><input type="checkbox" data-presenca="${p.usuario_id}" ${p.presente ? 'checked' : ''}>
            <span>${esc(p.nome)}${p.secao_sigla ? ` <span class="suave pequeno">· ${esc(p.secao_sigla)}</span>` : ''}</span></label></li>`).join('')}</ul></section>
        <section class="cartao" aria-labelledby="titulo-decisoes"><h2 id="titulo-decisoes">Decisões</h2>
          <form id="form-decisao" class="reuniao-decisao-form">
            <div class="campo"><label for="dec-texto">Nova decisão</label><textarea id="dec-texto" name="texto" maxlength="600" rows="2" required placeholder="O que ficou decidido?"></textarea></div>
            <div class="campo"><label for="dec-resp">Responsável (opcional)</label><select id="dec-resp" name="responsavel_id"><option value="">Sem responsável</option>
              ${r.participantes.map((p) => `<option value="${p.usuario_id}">${esc(p.nome)}</option>`).join('')}</select></div>
            <button type="submit" class="btn btn-primario">Registrar decisão</button></form>
          <ul class="reuniao-decisoes" id="lista-decisoes">${r.decisoes.length ? r.decisoes.map((d) => `<li data-decisao="${d.id}"><span>${esc(d.texto)}${d.responsavel_nome ? ` <span class="suave pequeno">· ${esc(d.responsavel_nome)}</span>` : ''}</span>
            <span class="reuniao-decisao-acoes"><button type="button" class="btn btn-fantasma btn-mini" data-editar-decisao>Editar</button><button type="button" class="btn btn-fantasma btn-mini" data-excluir-decisao>Excluir</button></span></li>`).join('')
            : '<li class="suave pequeno">Nenhuma decisão registrada ainda.</li>'}</ul></section>
      </div>
    </div>`;

  on(raiz, 'click', '[data-acao]', (el) => abrirAcao(Number(el.dataset.acao), refresh));

  on(raiz, 'change', '[data-presenca]', async () => {
    const marcados = [...raiz.querySelectorAll('[data-presenca]:checked')].map((c) => Number(c.dataset.presenca));
    try { await put(`/reunioes-equipe/${r.id}/presenca`, { presentes: marcados }); await refresh(); } catch (e) { erro(e); }
  });

  raiz.querySelector('#form-decisao').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.currentTarget;
    try {
      await post(`/reunioes-equipe/${r.id}/decisoes`, { texto: f.texto.value, responsavel_id: f.responsavel_id.value || null });
      toast('Decisão registrada.');
      await refresh();
    } catch (e) { erro(e); }
  });
  const decisaoDe = (el) => r.decisoes.find((d) => d.id === Number(el.closest('[data-decisao]').dataset.decisao));
  on(raiz, 'click', '[data-editar-decisao]', (el) => {
    const d = decisaoDe(el);
    abrirForm({
      titulo: 'Editar decisão',
      corpo: `<div class="campo"><label for="ed-texto">Decisão</label><textarea id="ed-texto" name="texto" maxlength="600" rows="3" required>${esc(d.texto)}</textarea></div>
        <div class="campo"><label for="ed-resp">Responsável</label><select id="ed-resp" name="responsavel_id"><option value="">Sem responsável</option>
          ${r.participantes.map((p) => `<option value="${p.usuario_id}" ${p.usuario_id === d.responsavel_id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>`,
      rotulo: 'Salvar decisão',
      aoEnviar: async (v) => { await patch(`/reunioes-equipe/${r.id}/decisoes/${d.id}`, { texto: v.texto, responsavel_id: v.responsavel_id || null }); toast('Decisão atualizada.'); await refresh(); },
    });
  });
  on(raiz, 'click', '[data-excluir-decisao]', async (el) => {
    const d = decisaoDe(el);
    if (!(await confirmar({ titulo: 'Excluir decisão', texto: `Excluir "${esc(d.texto)}"?`, rotulo: 'Excluir', perigo: true }))) return;
    try { await del(`/reunioes-equipe/${r.id}/decisoes/${d.id}`); await refresh(); } catch (e) { erro(e); }
  });

  raiz.querySelector('#nova-acao').addEventListener('click', () => abrirForm({
    titulo: 'Nova ação da reunião',
    corpo: `<div class="campo"><label for="na-titulo">Título da ação</label><input id="na-titulo" name="titulo" required maxlength="140" placeholder="Ex.: Atualizar a planilha de indicadores"></div>
      <div class="campo"><label for="na-detalhe">Detalhamento (opcional)</label><textarea id="na-detalhe" name="detalhe" maxlength="2000"></textarea></div>
      <div class="dois"><div class="campo"><label for="na-prazo">Prazo</label><input id="na-prazo" type="date" name="prazo" required min="${esc(est.boot.hoje)}" value="${addDias(est.boot.hoje, 7)}"></div>
        <div class="campo"><label for="na-prio">Prioridade</label><select id="na-prio" name="prioridade"><option value="alta">Alta</option><option value="media" selected>Média</option><option value="baixa">Baixa</option></select></div></div>
      <div class="campo"><label for="na-resp">Responsável</label><select id="na-resp" name="responsavel_id"><option value="">Eu mesmo (sem delegar)</option>
        ${r.participantes.filter((p) => p.usuario_id !== est.user.id).map((p) => `<option value="${p.usuario_id}">${esc(p.nome)}</option>`).join('')}</select></div>`,
    rotulo: 'Criar ação',
    aoEnviar: async (d) => {
      await post('/acoes', { secao_id: est.user.secao_id, titulo: d.titulo, detalhe: d.detalhe, prazo: d.prazo, prioridade: d.prioridade,
        ...(d.responsavel_id ? { responsavel_id: Number(d.responsavel_id) } : {}) });
      toast('Ação criada.');
      await refresh();
    },
  }));

  raiz.querySelector('#encerrar').addEventListener('click', async () => {
    if (!(await confirmar({ titulo: 'Encerrar a reunião', texto: 'A ata será montada com a presença, a situação das ações e as decisões. Você poderá revisá-la antes de enviar.', rotulo: 'Encerrar reunião' }))) return;
    try { await post(`/reunioes-equipe/${r.id}/encerrar`); toast('Reunião encerrada. Revise a ata.'); await refresh(); } catch (e) { erro(e); }
  });
}

// ---------- Ata ----------
async function ata(raiz, r, refresh) {
  const cabecalho = await carregarCabecalhoAta();
  const conduz = r.pode_conduzir;
  const editavel = conduz && ['rascunho', 'enviada'].includes(r.status);
  raiz.innerHTML = `${cabecaHTML(r, r.status === 'em_andamento' ? '' : '<div class="acoes-topo"><button type="button" class="btn btn-sec nao-imprimir" id="pdf-ata">Baixar PDF</button></div>')}
    <div class="cartao">
      <h2>Ata</h2>
      ${htmlCabecalhoAta(cabecalho)}
      ${r.status === 'em_andamento' ? '<p class="suave">A ata será montada quando a reunião for encerrada.</p>'
        : editavel ? `${r.status === 'rascunho'
          ? '<div class="info nao-imprimir">A ata foi montada com o que foi registrado na reunião. Revise, ajuste se precisar e envie: só quem esteve presente a lê.</div>'
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
    if (!(await confirmar({ titulo: 'Excluir a ata', texto: 'A reunião, a ata e as decisões registradas serão apagadas e não poderão ser recuperadas. As ações criadas durante a reunião continuam existindo.', rotulo: 'Excluir ata', perigo: true }))) return;
    try { await del(`/reunioes-equipe/${r.id}`); toast('Ata excluída.'); location.hash = '#/reunioes-equipe'; } catch (e) { erro(e); }
  });
  raiz.querySelector('#enviar')?.addEventListener('click', async () => {
    if (!(await confirmar({ titulo: 'Enviar a ata', texto: 'A ata fica disponível para quem esteve presente na reunião. Você ainda poderá corrigi-la depois.', rotulo: 'Enviar aos participantes' }))) return;
    try { await salvar(); await post(`/reunioes-equipe/${r.id}/enviar-ata`); toast('Ata enviada aos participantes.'); await refresh(); } catch (e) { erro(e); }
  });
  raiz.querySelector('#reabrir')?.addEventListener('click', async () => {
    try { await post(`/reunioes-equipe/${r.id}/reabrir`); await refresh(); } catch (e) { erro(e); }
  });
}
