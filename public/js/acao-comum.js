// Detalhe de uma ação, compartilhado por Diretor, Apoio e Chefe.
import { del, get, patch, post } from './api.js';
import { ehDiretor } from './estado.js';
import { abrirForm, br, dataHora, esc, fmtMin, on, pilulaStatus, PRIO, toast } from './ui.js';

export async function abrirAcao(id, aoMudar) {
  const a = await get(`/acoes/${id}`);
  const diretor = ehDiretor();
  const prazoAlterado = a.prazo !== a.prazo_original;
  const corpo = `
    ${a.demandada_diretor ? `
      <div class="banner-origem diretor">
        <span class="banner-origem-icone">🎯</span>
        <div>
          <strong>Demandada pelo Diretor</strong>
          <div class="detalhes">Determinada em ${dataHora(a.demandado_em || a.criada_em)}${a.demandado_por_nome ? ` por ${esc(a.demandado_por_nome)}` : ''}${a.reuniao_semana ? ` · Reunião de ${br(a.reuniao_semana)}` : ''}</div>
        </div>
      </div>` : (a.interna ? `
      <div class="banner-origem">
        <span class="banner-origem-icone">🏢</span>
        <div>
          <strong>Ação interna da seção</strong>
          <div class="detalhes">Criada em ${dataHora(a.criada_em)} · Âmbito interno da seção</div>
        </div>
      </div>` : '')}
    <p>${a.detalhe ? esc(a.detalhe) : '<span class="suave">Sem detalhamento.</span>'}</p>
    <div class="linha" style="margin-bottom:10px;align-items:center;flex-wrap:wrap;gap:8px">
      ${pilulaStatus(a)}
      ${a.demandada_diretor ? '<span class="pilula diretor">Demandada pelo Diretor</span>' : ''}
      <span class="pilula prio-${a.prioridade}">Prioridade ${PRIO[a.prioridade]}</span>
      <span class="suave pequeno">${esc(a.secao_sigla)} · ${esc(a.secao_nome)}</span>
    </div>
    <div class="linha" style="margin-bottom:10px;align-items:center">
      <label for="sel-prio" class="suave pequeno" style="margin:0"><b>Alterar prioridade:</b></label>
      <select id="sel-prio" data-mudar-prio style="width:auto;padding:3px 8px;font-size:0.84rem;margin-left:6px">
        <option value="alta" ${a.prioridade === 'alta' ? 'selected' : ''}>Alta</option>
        <option value="media" ${a.prioridade === 'media' ? 'selected' : ''}>Média</option>
        <option value="baixa" ${a.prioridade === 'baixa' ? 'selected' : ''}>Baixa</option>
      </select>
    </div>
    <p><b>Prazo:</b> <span class="num">${br(a.prazo)}</span>${prazoAlterado ? ` <span class="suave pequeno">(original: ${br(a.prazo_original)})</span>` : ''}</p>
    <p><b>Tempo gasto:</b> <span class="num">${fmtMin(a.tempo_total)}</span></p>
    ${a.lancamentos.length ? `<ul class="pequeno suave" style="margin:0 0 10px;padding-left:18px">${a.lancamentos.map((t) =>
      `<li class="num">${br(t.data)} · ${fmtMin(t.minutos)} · ${esc(t.usuario_nome || '')}</li>`).join('')}</ul>` : ''}
    ${a.pedidos.length ? `<h3 style="margin:10px 0 6px">Pedidos de novo prazo</h3>${a.pedidos.map((p) => `<div class="comentario pequeno">
      ${br(p.prazo_atual)} → <b>${br(p.novo_prazo)}</b> · ${esc(p.status)} <br><span class="suave">${esc(p.justificativa)}</span></div>`).join('')}` : ''}
    <h3 style="margin:12px 0 6px">Comentários</h3>
    ${a.comentarios.length ? a.comentarios.map((c) => `<div class="comentario"><b>${esc(c.usuario_nome || '')}</b>
      <span class="suave pequeno"> · ${dataHora(c.criado_em)}</span><br>${esc(c.texto)}</div>`).join('') : '<p class="suave pequeno">Nenhum comentário ainda.</p>'}
    <div class="campo" style="margin-top:10px"><label for="novo-coment">Novo comentário</label><textarea id="novo-coment" name="texto" style="min-height:60px"></textarea></div>
    ${diretor && a.status === 'concluida' && !a.encerrada ? `<div class="linha"><button type="button" class="btn btn-ok" data-encerrar>Aceitar e encerrar</button>
      <button type="button" class="btn btn-perigo" data-devolver>Devolver para ajuste</button></div>` : ''}
    ${!a.demandada_diretor ? `
      <div class="linha" style="margin-top:14px;padding-top:10px;border-top:1px solid var(--line);align-items:center">
        ${a.arquivada
          ? `<button type="button" class="btn btn-sec btn-mini" data-desarquivar>Desarquivar ação</button>`
          : `<button type="button" class="btn btn-sec btn-mini" data-arquivar>Arquivar ação</button>`}

      </div>
    ` : `
      <div class="suave pequeno" style="margin-top:14px;padding-top:8px;border-top:1px solid var(--line)">
        🔒 <i>Esta ação foi demandada pelo Diretor e não pode ser excluída nem arquivada pela seção.</i>
      </div>
    `}
    ${a.pode_excluir ? '<button type="button" class="btn btn-perigo" style="margin-top:12px" data-excluir>Excluir ação</button>' : ''}`;
  abrirForm({
    titulo: a.titulo,
    corpo,
    rotulo: 'Comentar',
    cancelar: 'Fechar',
    aoEnviar: async (d) => {
      await post(`/acoes/${a.id}/comentarios`, { texto: d.texto });
      toast('Comentário registrado.');
      aoMudar?.();
    },
    aoAbrir: (dlg) => {
      on(dlg, 'change', '[data-mudar-prio]', async (el) => {
        try {
          await patch(`/acoes/${a.id}`, { prioridade: el.value });
          toast(`Prioridade atualizada para ${PRIO[el.value]}.`);
          aoMudar?.();
        } catch (e) { toast(e.message, 'erro'); }
      });
      on(dlg, 'click', '[data-arquivar]', async () => {
        try {
          await post(`/acoes/${a.id}/arquivar`);
          toast('Ação arquivada.');
          dlg.close();
          aoMudar?.();
        } catch (e) { toast(e.message, 'erro'); }
      });
      on(dlg, 'click', '[data-desarquivar]', async () => {
        try {
          await post(`/acoes/${a.id}/desarquivar`);
          toast('Ação desarquivada.');
          dlg.close();
          aoMudar?.();
        } catch (e) { toast(e.message, 'erro'); }
      });
      on(dlg, 'click', '[data-excluir]', async () => {
        if (!confirm(`Deseja realmente excluir a ação "${a.titulo}"? Os comentários, tempos e pedidos de prazo dessa ação também serão excluídos. Esta operação não pode ser desfeita.`)) return;
        try {
          await del(`/acoes/${a.id}`);
          toast('Ação excluída com sucesso.');
          dlg.close();
          aoMudar?.();
        } catch (e) { toast(e.message, 'erro'); }
      });
      on(dlg, 'click', '[data-encerrar]', async () => {
        await post(`/acoes/${a.id}/encerrar`).then(() => { toast('Ação encerrada.'); dlg.close(); aoMudar?.(); }).catch((e) => toast(e.message, 'erro'));
      });
      on(dlg, 'click', '[data-devolver]', () => {
        abrirForm({
          titulo: 'Devolver para ajuste',
          corpo: `<div class="campo"><label for="dev">O que falta para a ação ser aceita?</label><textarea id="dev" name="comentario" required></textarea></div>`,
          rotulo: 'Devolver',
          aoEnviar: async (d) => {
            await post(`/acoes/${a.id}/devolver`, { comentario: d.comentario });
            toast('Ação devolvida ao chefe.');
            dlg.close();
            aoMudar?.();
          },
        });
      });
    },
  });
}
