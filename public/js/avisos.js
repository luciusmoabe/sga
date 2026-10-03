// Quadro de avisos: cadastro para Diretor e Administrador. Mostra uma mensagem na tela Início do chefe e
// da Diretoria Adjunta, só dentro da janela de vigência (data_inicio a data_fim); no máximo uma por vez.
import { del, get, patch, post } from './api.js';
import { est } from './estado.js';
import { abrirForm, br, confirmar, esc, on, toast, vazio } from './ui.js';

const situacao = (a) => {
  if (!a.ativo) return { texto: 'Desativado', classe: '' };
  if (a.vigente) return { texto: 'Vigente', classe: 'st-concluida' };
  if (a.data_inicio > est.boot.hoje) return { texto: 'Agendado', classe: 'st-em_andamento' };
  return { texto: 'Encerrado', classe: '' };
};

const formAviso = (aviso, aoSalvar) => {
  const hoje = est.boot.hoje;
  abrirForm({
    titulo: aviso ? 'Editar aviso' : 'Novo aviso',
    corpo: `<div class="campo"><label for="av-texto">Mensagem</label><textarea id="av-texto" name="texto" maxlength="300" required>${esc(aviso?.texto || '')}</textarea></div>
      <div class="dois">
        <div class="campo"><label for="av-inicio">Aparece a partir de</label><input id="av-inicio" type="date" name="data_inicio" value="${aviso?.data_inicio || hoje}"></div>
        <div class="campo"><label for="av-fim">Até quando</label><input id="av-fim" type="date" name="data_fim" required min="${hoje}" value="${aviso?.data_fim || hoje}"></div>
      </div>`,
    rotulo: aviso ? 'Salvar' : 'Cadastrar aviso',
    aoEnviar: async (d) => {
      const corpo = { texto: d.texto, data_inicio: d.data_inicio, data_fim: d.data_fim };
      if (aviso) await patch(`/avisos/${aviso.id}`, corpo); else await post('/avisos', corpo);
      toast(aviso ? 'Aviso atualizado.' : 'Aviso cadastrado.');
      aoSalvar();
    },
  });
};

export async function avisos(raiz, { refresh }) {
  const lista = await get('/avisos');
  raiz.innerHTML = `
    <div class="cabeca"><div><h1>Avisos</h1>
      <div class="sub">Mensagem em destaque na tela Início do chefe e da Diretoria Adjunta, dentro da janela de datas escolhida. Só uma aparece por vez: a vigente mais recente.</div></div>
      <div class="acoes-topo"><button type="button" class="btn btn-primario" id="novo-aviso">Novo aviso</button></div></div>
    <div class="cartao">${lista.length ? `<table><thead><tr><th>Mensagem</th><th>De</th><th>Até</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map((a) => { const s = situacao(a); return `<tr data-id="${a.id}">
        <td>${esc(a.texto)}</td><td class="num">${br(a.data_inicio)}</td><td class="num">${br(a.data_fim)}</td>
        <td><span class="pilula ${s.classe}">${s.texto}</span></td>
        <td class="linha" style="gap:4px;justify-content:flex-end">
          <button type="button" class="btn btn-fantasma btn-mini" data-acao="editar">Editar</button>
          <button type="button" class="btn btn-fantasma btn-mini" data-acao="alternar">${a.ativo ? 'Desativar' : 'Ativar'}</button>
          <button type="button" class="btn btn-perigo btn-mini" data-acao="excluir">Excluir</button>
        </td></tr>`; }).join('')}</tbody></table>`
      : vazio('Nenhum aviso cadastrado', 'Use "Novo aviso" para publicar uma mensagem na tela Início.')}</div>`;

  raiz.querySelector('#novo-aviso').addEventListener('click', () => formAviso(null, refresh));
  on(raiz, 'click', '[data-acao]', async (el) => {
    const id = el.closest('[data-id]').dataset.id;
    const a = lista.find((x) => x.id === Number(id));
    const acao = el.dataset.acao;
    try {
      if (acao === 'editar') formAviso(a, refresh);
      else if (acao === 'alternar') { await patch(`/avisos/${id}`, { ativo: !a.ativo }); toast(a.ativo ? 'Aviso desativado.' : 'Aviso ativado.'); refresh(); }
      else if (acao === 'excluir') {
        const ok = await confirmar({ titulo: 'Excluir aviso', texto: 'O aviso será apagado e não poderá ser recuperado.', rotulo: 'Excluir aviso', perigo: true });
        if (!ok) return;
        await del(`/avisos/${id}`);
        toast('Aviso excluído.');
        refresh();
      }
    } catch (e) { toast(e.message, 'erro'); }
  });
}
