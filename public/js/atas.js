// Reuniões e atas: histórico para Diretor e Apoio, leitura das atas enviadas para os chefes.
import { get, post, put } from './api.js';
import { est } from './estado.js';
import { br, confirmar, dataHora, diaSemana, esc, on, plural, toast, vazio } from './ui.js';

const ST = { em_andamento: 'Em andamento', rascunho: 'Ata em rascunho', enviada: 'Ata enviada' };
const cls = { em_andamento: 'st-em_andamento', rascunho: 'st-bloqueada', enviada: 'st-concluida' };

export async function reunioes(raiz) {
  const lista = await get('/reunioes');
  raiz.innerHTML = `
    <div class="cabeca"><div><h1>Reuniões e atas</h1><div class="sub">Histórico das reuniões semanais. A ata guarda os combinados que estavam valendo naquela data.</div></div>
      <div class="acoes-topo"><a class="btn btn-primario" href="#/reuniao">Iniciar ou retomar reunião</a></div></div>
    <div class="cartao">${lista.length ? `<table><thead><tr><th>Data</th><th>Situação</th><th>Decisões</th><th>Novas ações</th></tr></thead><tbody>
      ${lista.map((r) => `<tr class="clicavel" data-id="${r.id}" tabindex="0"><td><b>${br(r.data)}</b> <span class="suave pequeno">${diaSemana(r.data)}</span></td>
        <td><span class="pilula ${cls[r.status]}">${ST[r.status]}</span></td><td class="num">${r.decisoes}</td><td class="num">${r.novas_acoes}</td></tr>`).join('')}</tbody></table>`
      : vazio('Nenhuma reunião registrada', 'Use "Iniciar reunião" no dia agendado.')}</div>`;
  const abrir = (el) => { location.hash = `#/reunioes/${el.dataset.id}`; };
  on(raiz, 'click', 'tr[data-id]', abrir);
  on(raiz, 'keydown', 'tr[data-id]', (el, ev) => { if (ev.key === 'Enter') abrir(el); });
}

export async function reuniaoDetalhe(raiz, { id, refresh }) {
  const r = await get(`/reunioes/${id}`);
  const lista = (arr, f) => (arr.length ? `<ul>${arr.map((x) => `<li>${f(x)}</li>`).join('')}</ul>` : '<p class="suave pequeno">Nenhum registro.</p>');
  raiz.innerHTML = `
    <div class="cabeca"><div><a href="#/reunioes" class="pequeno">← Reuniões e atas</a><h1>Reunião de ${br(r.data)}</h1>
      <div class="sub"><span class="pilula ${cls[r.status]}">${ST[r.status]}</span> · iniciada em ${dataHora(r.iniciada_em)}${r.encerrada_em ? ` · encerrada em ${dataHora(r.encerrada_em)}` : ''}</div></div>
      ${r.status === 'em_andamento' ? '<div class="acoes-topo"><a class="btn btn-primario" href="#/reuniao/${r.id}">Voltar ao Modo Reunião</a></div>' : ''}</div>
    <div class="dois" style="align-items:start">
      <div class="cartao"><h2>Combinados vigentes</h2>${lista(r.combinados_snapshot, (c) => esc(c.texto))}</div>
      <div class="cartao"><h2>Decisões</h2>${lista(r.decisoes, (d) => `<b>${esc(d.secao_sigla || 'Geral')}</b> · ${esc(d.texto)}`)}</div>
      <div class="cartao"><h2>Novas ações</h2>${lista(r.novas_acoes, (g) => `${esc(g.titulo)} <span class="suave pequeno">· ${g.destino === 'todos' ? 'todos os Centros' : plural(g.total_acoes, 'seção', 'seções')} · prazo ${br(g.prazo)}</span>`)}</div>
      <div class="cartao"><h2>Pedidos de prazo decididos</h2>${lista(r.pedidos_decididos, (p) => `<b>${esc(p.secao_sigla)}</b> · ${esc(p.acao_titulo)}: ${br(p.novo_prazo)} ${p.status}`)}</div>
    </div>
    <div class="espaco"></div>
    <div class="cartao"><h2>Ata</h2>
      ${r.status === 'rascunho' ? `<div class="info">A ata foi montada a partir do que foi registrado na reunião. Revise, ajuste se precisar e envie aos chefes. Nesta versão do protótipo, "enviar" libera a leitura na tela Atas; não há e-mail.</div>
        <textarea class="ata-edicao" id="ata" aria-label="Texto da ata">${esc(r.ata_texto || '')}</textarea>
        <div class="linha" style="margin-top:10px"><button class="btn btn-sec" id="salvar">Salvar rascunho</button><button class="btn btn-primario" id="enviar">Enviar aos chefes</button>
        <button class="btn btn-fantasma" id="reabrir">Reabrir a reunião</button></div>`
      : r.status === 'enviada' ? `<div class="ata">${esc(r.ata_texto)}</div><p class="suave pequeno">Enviada em ${dataHora(r.enviada_em)}.</p>`
      : '<p class="suave">A ata será montada quando a reunião for encerrada.</p>'}</div>`;
  if (r.status !== 'rascunho') return;
  const erro = (e) => toast(e.message, 'erro');
  const texto = () => raiz.querySelector('#ata').value;
  raiz.querySelector('#salvar').addEventListener('click', async () => { try { await put(`/reunioes/${id}/ata`, { ata_texto: texto() }); toast('Rascunho salvo.'); } catch (e) { erro(e); } });
  raiz.querySelector('#enviar').addEventListener('click', async () => {
    if (!(await confirmar({ titulo: 'Enviar a ata', texto: 'Depois de enviada, a ata fica disponível para todos os chefes e não pode mais ser editada.', rotulo: 'Enviar aos chefes' }))) return;
    try { await put(`/reunioes/${id}/ata`, { ata_texto: texto() }); await post(`/reunioes/${id}/enviar-ata`); toast('Ata enviada aos chefes.'); refresh(); } catch (e) { erro(e); }
  });
  raiz.querySelector('#reabrir').addEventListener('click', async () => {
    try { await post(`/reunioes/${id}/reabrir`); location.hash = `#/reuniao/${id}`; } catch (e) { erro(e); }
  });
}

// Chefes: atas enviadas
export async function atas(raiz, { id }) {
  if (id) {
    const r = await get(`/reunioes/${id}`);
    raiz.innerHTML = `<div class="cabeca"><div><a href="#/atas" class="pequeno">← Atas</a><h1>Ata de ${br(r.data)}</h1></div></div>
      <div class="ata">${esc(r.ata_texto)}</div>`;
    return;
  }
  const lista = await get('/reunioes');
  raiz.innerHTML = `<div class="cabeca"><div><h1>Atas</h1><div class="sub">Decisões e novas ações de cada reunião semanal, ${esc(est.user.nome.split(' ')[0])}.</div></div></div>
    <div class="cartao">${lista.length ? `<table><tbody>${lista.map((r) => `<tr class="clicavel" data-id="${r.id}" tabindex="0"><td><b>Reunião de ${br(r.data)}</b></td>
      <td class="suave">${r.decisoes} decisões · ${r.novas_acoes} novas ações</td></tr>`).join('')}</tbody></table>`
      : vazio('Nenhuma ata enviada ainda', 'Depois de cada reunião, a ata revisada aparece aqui.')}</div>`;
  const abrir = (el) => { location.hash = `#/atas/${el.dataset.id}`; };
  on(raiz, 'click', 'tr[data-id]', abrir);
  on(raiz, 'keydown', 'tr[data-id]', (el, ev) => { if (ev.key === 'Enter') abrir(el); });
}
