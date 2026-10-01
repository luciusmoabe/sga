// Detalhe de uma ação, compartilhado por Diretor, Apoio e Chefe.
import { del, get, patch, post } from './api.js';
import { ehAdmin, ehDiretor, est, podeOperar } from './estado.js';
import { abrirForm, br, dataHora, esc, fmtMin, on, pilulaStatus, PRIO, toast } from './ui.js';

// ---------- Impedimentos (formulários usados também pela atualização semanal e por Minhas ações) ----------
/** Ação em que ainda faz sentido registrar impedimento. */
export const aceitaImpedimento = (a) => !a.encerrada && !a.arquivada && a.status !== 'concluida';

/** `a` precisa de id, titulo e status. `aoConcluir` recarrega a tela de quem chamou. */
export function abrirNovoImpedimento(a, aoConcluir) {
  abrirForm({
    titulo: 'Registrar impedimento',
    corpo: `<p class="suave pequeno">Ação: <b>${esc(a.titulo)}</b></p>
      <div class="campo"><label for="ni-desc">O que está impedindo?</label><textarea id="ni-desc" name="descricao" required maxlength="600"></textarea></div>
      <div class="campo"><label for="ni-apoio">Apoio de que você precisa (opcional)</label><textarea id="ni-apoio" name="apoio" maxlength="600" placeholder="O que o Diretor pode fazer para ajudar?"></textarea></div>
      <div class="escolha"><label><input type="checkbox" name="critico" value="1"> Impedimento crítico (coloca a seção em vermelho)</label></div>
      ${a.status === 'em_andamento' ? '<div class="escolha"><label><input type="checkbox" name="bloquear" value="1"> A ação está bloqueada (o status muda para "Bloqueada")</label></div>'
        : '<p class="suave pequeno">Para marcar a ação como bloqueada, ela precisa estar em andamento.</p>'}`,
    rotulo: 'Registrar impedimento',
    aoEnviar: async (d) => {
      await post(`/acoes/${a.id}/impedimentos`, { descricao: d.descricao, apoio: d.apoio, critico: d.critico === '1', bloquear: d.bloquear === '1' });
      toast('Impedimento registrado.');
      await aoConcluir?.();
    },
  });
}

/** `imp` precisa de id e descricao. Se a ação está bloqueada, oferece retomá-la. */
export function abrirResolverImpedimento(a, imp, aoConcluir) {
  abrirForm({
    titulo: 'Resolver impedimento',
    corpo: `<p class="suave pequeno">Ação: <b>${esc(a.titulo)}</b></p><p>${esc(imp.descricao)}</p>
      <div class="campo"><label for="ri-res">Como foi resolvido? (opcional)</label><textarea id="ri-res" name="resolucao" maxlength="600"></textarea></div>
      ${a.status === 'bloqueada' ? '<div class="escolha"><label><input type="checkbox" name="retomar" value="1" checked> Retomar a ação (volta para "Em andamento")</label></div>' : ''}`,
    rotulo: 'Resolver impedimento',
    aoEnviar: async (d) => {
      await post(`/acoes/${a.id}/impedimentos/${imp.id}/resolver`, { resolucao: d.resolucao, retomar: d.retomar === '1' });
      toast('Impedimento resolvido.');
      await aoConcluir?.();
    },
  });
}

const impedimentoHTML = (i) => `<div class="impedimento ${i.aberto ? '' : 'resolvido'}">
  <div class="linha" style="gap:6px;flex-wrap:wrap;align-items:center">
    <span class="pilula ${i.aberto ? 'st-bloqueada' : 'st-concluida'}">${i.aberto ? 'Aberto' : 'Resolvido'}</span>
    ${i.critico ? '<span class="pilula atraso">Crítico</span>' : ''}
    <span class="suave pequeno">${dataHora(i.criado_em)} · ${esc(i.criado_por_nome || '')}</span>
    ${i.aberto ? `<button type="button" class="btn btn-fantasma btn-mini" data-resolver-imp="${i.id}" style="margin-left:auto">Resolver</button>` : ''}
  </div>
  <div>${esc(i.descricao)}</div>
  ${i.apoio ? `<div class="pequeno"><b>Apoio solicitado:</b> ${esc(i.apoio)}</div>` : ''}
  ${!i.aberto ? `<div class="suave pequeno">Resolvido em ${dataHora(i.resolvido_em)}${i.resolvido_por_nome ? ` por ${esc(i.resolvido_por_nome)}` : ''}${i.resolucao ? `: ${esc(i.resolucao)}` : ''}</div>` : ''}
</div>`;

// ---------- Checklist (apoio visual; quem registra tempo e muda status também mexe aqui) ----------
/** Mesma regra de quem gerencia tempo e status: o chefe da seção (se enxerga a ação, é da sua árvore) e o Administrador. */
const gereChecklist = () => est.user?.perfil === 'chefe' || ehAdmin();
const checklistItemHTML = (it) => `<div class="item previsto" data-checklist-id="${it.id}">
  <label><input type="checkbox" data-marcar-check="${it.id}" ${it.concluido ? 'checked' : ''} ${gereChecklist() ? '' : 'disabled'}>
    <span style="${it.concluido ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(it.texto)}</span></label>
  ${gereChecklist() ? `<button type="button" class="btn btn-fantasma btn-mini" data-excluir-check="${it.id}" aria-label="Excluir item">Excluir</button>` : ''}
</div>`;
/** Badges do topo e bloco do checklist: extraídos para poder atualizar só essas partes do diálogo
 *  (marcar/adicionar/excluir item não fecha e reabre a tela toda). */
const badgesHTML = (a) => `${pilulaStatus(a)}
  ${a.demandada_diretor ? '<span class="pilula diretor">Demandada pelo Diretor</span>' : ''}
  <span class="pilula prio-${a.prioridade}">Prioridade ${PRIO[a.prioridade]}</span>
  <span class="suave pequeno">${esc(a.secao_sigla)} · ${esc(a.secao_nome)}</span>`;
const checklistBlocoHTML = (a) => `
  <h3 style="margin:12px 0 6px">Checklist${a.checklist.length ? ` <span class="suave pequeno">(${a.checklist_feitos}/${a.checklist_total})</span>` : ''}</h3>
  ${a.checklist.length ? `<div class="itens">${a.checklist.map(checklistItemHTML).join('')}</div>` : '<p class="suave pequeno">Nenhum item no checklist.</p>'}
  ${gereChecklist() && !a.encerrada ? `<div class="add-linha"><input id="novo-check" placeholder="Novo item do checklist" maxlength="200" aria-label="Novo item do checklist"><button type="button" class="btn btn-sec" data-add-check>Adicionar</button></div>` : ''}`;

// ---------- Redirecionar para outra seção ----------
/** Ação em aberto pode mudar de seção: Diretor, Apoio e Administrador para qualquer seção ativa;
 *  o chefe, dentro da própria árvore (o servidor confere; `/secoes` já devolve só a árvore dele). */
const aceitaRedirecionar = (a) => !a.encerrada && !a.arquivada && a.status !== 'concluida'
  && (podeOperar() || est.user?.perfil === 'chefe');

async function abrirRedirecionar(a, aoConcluir) {
  const secoes = (await get('/secoes')).filter((s) => s.ativa && s.id !== a.secao_id);
  if (!secoes.length) { toast('Não há outra seção ativa para receber esta ação.', 'erro'); return; }
  const opcoes = secoes.map((s) => `<option value="${s.id}">${'  '.repeat((s.nivel || 1) - 1)}${esc(s.sigla ? `${s.sigla} · ${s.nome}` : s.nome)}</option>`).join('');
  abrirForm({
    titulo: 'Redirecionar ação',
    corpo: `<p class="suave pequeno">Ação: <b>${esc(a.titulo)}</b> · hoje com ${esc(a.secao_sigla || a.secao_nome)}</p>
      <div class="campo"><label for="rd-secao">Nova seção responsável</label><select id="rd-secao" name="secao_id" required><option value="">Escolha a seção</option>${opcoes}</select></div>
      <div class="campo"><label for="rd-motivo">Motivo (opcional)</label><textarea id="rd-motivo" name="motivo" maxlength="600" placeholder="Por que a ação muda de seção?"></textarea></div>
      <p class="suave pequeno">A ação leva consigo o status, o prazo, o tempo registrado, o checklist, os impedimentos e os comentários.</p>`,
    rotulo: 'Redirecionar ação',
    aoEnviar: async (d) => {
      if (!d.secao_id) throw new Error('Escolha a seção que vai receber a ação.');
      const r = await post(`/acoes/${a.id}/redirecionar`, { secao_id: Number(d.secao_id), motivo: d.motivo });
      toast(`Ação redirecionada para ${r.secao_sigla || r.secao_nome}.`);
      await aoConcluir?.();
    },
  });
}

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
    <div class="linha" id="acao-badges" style="margin-bottom:10px;align-items:center;flex-wrap:wrap;gap:8px">${badgesHTML(a)}</div>
    ${`    <div class="linha" style="margin-bottom:10px;align-items:center">
      <label for="sel-prio" class="suave pequeno" style="margin:0"><b>Alterar prioridade:</b></label>
      <select id="sel-prio" data-mudar-prio style="width:auto;padding:3px 8px;font-size:0.84rem;margin-left:6px">
        <option value="alta" ${a.prioridade === 'alta' ? 'selected' : ''}>Alta</option>
        <option value="media" ${a.prioridade === 'media' ? 'selected' : ''}>Média</option>
        <option value="baixa" ${a.prioridade === 'baixa' ? 'selected' : ''}>Baixa</option>
      </select>
    </div>`}
    <p><b>Prazo:</b> <span class="num">${br(a.prazo)}</span>${prazoAlterado ? ` <span class="suave pequeno">(original: ${br(a.prazo_original)})</span>` : ''}</p>
    <p><b>Tempo gasto:</b> <span class="num">${fmtMin(a.tempo_total)}</span></p>
    ${a.lancamentos.length ? `<ul class="pequeno suave" style="margin:0 0 10px;padding-left:18px">${a.lancamentos.map((t) =>
      `<li class="num">${br(t.data)} · ${fmtMin(t.minutos)} · ${esc(t.usuario_nome || '')}</li>`).join('')}</ul>` : ''}
    ${a.pedidos.length ? `<h3 style="margin:10px 0 6px">Pedidos de novo prazo</h3>${a.pedidos.map((p) => `<div class="comentario pequeno">
      ${br(p.prazo_atual)} → <b>${br(p.novo_prazo)}</b> · ${esc(p.status)} <br><span class="suave">${esc(p.justificativa)}</span></div>`).join('')}` : ''}
    <div id="acao-checklist-bloco">${checklistBlocoHTML(a)}</div>
    <h3 style="margin:12px 0 6px">Impedimentos</h3>
    ${a.impedimentos.length ? a.impedimentos.map(impedimentoHTML).join('') : '<p class="suave pequeno">Nenhum impedimento registrado.</p>'}
    ${aceitaImpedimento(a) ? '<button type="button" class="btn btn-sec btn-mini" data-novo-imp>Registrar impedimento</button>' : ''}
    <h3 style="margin:12px 0 6px">Comentários</h3>
    ${a.comentarios.length ? a.comentarios.map((c) => `<div class="comentario"><b>${esc(c.usuario_nome || '')}</b>
      <span class="suave pequeno"> · ${dataHora(c.criado_em)}</span><br>${esc(c.texto)}</div>`).join('') : '<p class="suave pequeno">Nenhum comentário ainda.</p>'}
    ${`<div class="campo" style="margin-top:10px"><label for="novo-coment">Novo comentário</label><textarea id="novo-coment" name="texto" style="min-height:60px"></textarea></div>`}
    ${diretor && a.status === 'concluida' && !a.encerrada ? `<div class="linha"><button type="button" class="btn btn-ok" data-encerrar>Aceitar e encerrar</button>
      <button type="button" class="btn btn-perigo" data-devolver>Devolver para ajuste</button></div>` : ''}
    ${aceitaRedirecionar(a) ? '<button type="button" class="btn btn-sec btn-mini" style="margin-top:12px" data-redirecionar>Redirecionar para outra seção</button>' : ''}
    ${!a.demandada_diretor || ehAdmin() ? `
      <div class="linha" style="margin-top:14px;padding-top:10px;border-top:1px solid var(--line);align-items:center">
        ${a.arquivada
          ? `<button type="button" class="btn btn-sec btn-mini" data-desarquivar>Desarquivar ação</button>`
          : `<button type="button" class="btn btn-sec btn-mini" data-arquivar>Arquivar ação</button>`}

      </div>
    ` : `
      <div class="suave pequeno" style="margin-top:14px;padding-top:8px;border-top:1px solid var(--line)">
        <i>Esta ação foi demandada pelo Diretor e não pode ser excluída nem arquivada pela seção.</i>
      </div>
    `}
    ${a.pode_excluir ? '<button type="button" class="btn btn-perigo" style="margin-top:12px" data-excluir>Excluir ação</button>' : ''}
`;
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
      // Depois de registrar ou resolver, reabre o detalhe já com o histórico novo.
      const recarregar = async () => { dlg.close(); aoMudar?.(); await abrirAcao(a.id, aoMudar); };
      // Atualiza só o topo (contador embutido no selo de status) e o bloco do checklist: marcar, adicionar
      // ou excluir um item não fecha e reabre a tela toda (o resto do diálogo — comentários, impedimentos,
      // rolagem — continua exatamente onde estava).
      const atualizarChecklist = () => {
        dlg.querySelector('#acao-badges').innerHTML = badgesHTML(a);
        dlg.querySelector('#acao-checklist-bloco').innerHTML = checklistBlocoHTML(a);
        aoMudar?.(); // atualiza a lista de quem chamou (ex.: selo na tela de Minhas ações) em segundo plano
      };
      on(dlg, 'click', '[data-add-check]', async () => {
        const campo = dlg.querySelector('#novo-check');
        const t = campo.value.trim();
        if (!t) return;
        try {
          const item = await post(`/acoes/${a.id}/checklist`, { texto: t });
          a.checklist.push(item);
          a.checklist_total++;
          atualizarChecklist();
          dlg.querySelector('#novo-check')?.focus();
        } catch (e) { toast(e.message, 'erro'); }
      });
      on(dlg, 'keydown', '#novo-check', (el, ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); dlg.querySelector('[data-add-check]').click(); }
      });
      on(dlg, 'change', '[data-marcar-check]', async (el) => {
        const id = Number(el.dataset.marcarCheck);
        try {
          const item = await patch(`/acoes/${a.id}/checklist/${id}`, { concluido: el.checked });
          const i = a.checklist.findIndex((x) => x.id === id);
          if (i >= 0) a.checklist[i] = item;
          a.checklist_feitos += el.checked ? 1 : -1;
          atualizarChecklist();
        } catch (e) { toast(e.message, 'erro'); el.checked = !el.checked; }
      });
      on(dlg, 'click', '[data-excluir-check]', async (el) => {
        const id = Number(el.dataset.excluirCheck);
        try {
          await del(`/acoes/${a.id}/checklist/${id}`);
          const i = a.checklist.findIndex((x) => x.id === id);
          if (i >= 0) { if (a.checklist[i].concluido) a.checklist_feitos--; a.checklist.splice(i, 1); }
          a.checklist_total--;
          atualizarChecklist();
        } catch (e) { toast(e.message, 'erro'); }
      });
      on(dlg, 'click', '[data-novo-imp]', () => abrirNovoImpedimento(a, recarregar));
      // Quem redireciona continua vendo a ação (o chefe só move dentro da própria árvore).
      on(dlg, 'click', '[data-redirecionar]', () => abrirRedirecionar(a, recarregar).catch((e) => toast(e.message, 'erro')));
      on(dlg, 'click', '[data-resolver-imp]', (el) => {
        const imp = a.impedimentos.find((i) => i.id === Number(el.dataset.resolverImp));
        if (imp) abrirResolverImpedimento(a, imp, recarregar);
      });
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
