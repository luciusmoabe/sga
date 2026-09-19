// Utilidades de interface: formatação, diálogos, avisos e o Trilho da Semana.
import { agora, isoDe } from './estado.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export const parseISO = (s) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDias = (s, n) => {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return isoDe(d);
};
export const br = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');
export const brCurto = (s) => (s ? s.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '');
export const dataHora = (s) => {
  if (!s) return '';
  const d = new Date(s);
  return `${br(isoDe(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const diaSemana = (s) => DIAS[parseISO(s).getDay()];
export const fmtMin = (m) => {
  m = Number(m) || 0;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
};
export const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export const STATUS = { a_fazer: 'A fazer', em_andamento: 'Em andamento', bloqueada: 'Bloqueada', concluida: 'Concluída' };
export const PRIO = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
export const COR = { verde: 'Em dia', amarelo: 'Atenção', vermelho: 'Crítico' };
export const ORDEM_COR = { vermelho: 0, amarelo: 1, verde: 2 };
export const porNecessidade = (a, b) => ORDEM_COR[a.cor] - ORDEM_COR[b.cor] || a.secao.id - b.secao.id;

export const sem = (cor) => `<span class="sem sem-${cor}">${COR[cor]}</span>`;
export const pilulaStatus = (a) =>
  `<span class="pilula st-${a.status}">${STATUS[a.status]}</span>` +
  (a.atrasada ? ' <span class="pilula atraso">Atrasada</span>' : '') +
  (a.encerrada ? ' <span class="pilula enc">Encerrada</span>' : '');
export const vazio = (titulo, texto = '') => `<div class="vazio"><b>${esc(titulo)}</b>${esc(texto)}</div>`;

export function toast(msg, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${tipo === 'erro' ? 'erro' : ''}`;
  el.textContent = msg;
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  $('#toasts').append(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 6000 : 3200);
}

/** Abre um diálogo com formulário. `aoEnviar(dados, form)` pode lançar erro: a mensagem aparece no diálogo. */
export function abrirForm({ titulo, corpo, rotulo = 'Salvar', cancelar = 'Cancelar', aoEnviar, perigo = false, aoAbrir, semRodape = false }) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form class="dlg" novalidate><h2>${esc(titulo)}</h2><div class="erro-form oculto" role="alert"></div>${corpo}
    ${semRodape ? '' : `<div class="rodape"><button type="button" class="btn btn-sec" data-fechar>${esc(cancelar)}</button>
    <button class="btn ${perigo ? 'btn-perigo' : 'btn-primario'}" type="submit">${esc(rotulo)}</button></div>`}</form>`;
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  const form = $('form', dlg);
  const erro = $('.erro-form', dlg);
  $('[data-fechar]', dlg)?.addEventListener('click', () => dlg.close());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter;
    if (btn) btn.disabled = true;
    erro.classList.add('oculto');
    try {
      await aoEnviar?.(Object.fromEntries(new FormData(form)), form);
      dlg.close();
    } catch (ex) {
      erro.textContent = ex.message;
      erro.classList.remove('oculto');
      if (btn) btn.disabled = false;
    }
  });
  aoAbrir?.(dlg, form);
  $('input:not([type=hidden]), textarea, select', form)?.focus();
  return dlg;
}

export function confirmar({ titulo, texto, rotulo = 'Confirmar', perigo = false }) {
  return new Promise((resolver) => {
    let ok = false;
    const dlg = abrirForm({ titulo, corpo: `<p>${texto}</p>`, rotulo, perigo, aoEnviar: async () => { ok = true; } });
    dlg.addEventListener('close', () => resolver(ok));
  });
}

/** Delegação de eventos: on(raiz, 'click', '[data-x]', (el, ev) => ...) */
export function on(raiz, tipo, seletor, fn) {
  raiz.addEventListener(tipo, (ev) => {
    const el = ev.target.closest(seletor);
    if (el && raiz.contains(el)) fn(el, ev);
  });
}

/** Trilho da Semana: mostra onde estamos entre uma reunião e a seguinte. */
export function trilho(boot) {
  const semana = boot.semana;
  const diaSemana = boot.reuniao_dia ?? 2;   // dia da semana da reunião (0 = dom … 6 = sáb)
  const horaReuniao = boot.reuniao_hora || '10:00'; // horário da reunião (HH:MM)
  const [hReuniao, mReuniao] = horaReuniao.split(':').map(Number);
  const NOMES_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const NOMES_DIA_COMPLETO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const nomeDia = NOMES_DIA[diaSemana];
  const ts = (dia, hora) => new Date(`${dia}T${hora}:00`).getTime();
  const ini = ts(addDias(semana, -7), horaReuniao);
  const fim = ts(semana, horaReuniao);
  const pos = (t) => Math.min(1, Math.max(0, (t - ini) / (fim - ini)));
  const agoraMs = agora().getTime();
  // Fechamento = dia anterior à reunião, 18h
  const diaAntes = addDias(semana, -1);
  const fechamento = ts(diaAntes, '18:00');
  // Lembrete = 4 dias antes da reunião (ex.: se reunião é terça, lembrete é na sexta anterior)
  const marcos = [
    { t: ini, rot: 'Reunião anterior', sub: `${nomeDia} ${horaReuniao}`, marco: true },
    { t: ts(addDias(semana, -4), '15:00'), rot: 'Lembrete', sub: `${NOMES_DIA[(diaSemana + 3) % 7]} 15h` },
    { t: ts(diaAntes, '09:00'), rot: '', sub: '' },
    { t: fechamento, rot: 'Fechamento', sub: `${NOMES_DIA[diaSemana === 1 ? 0 : diaSemana - 1]} 18h`, marco: true },
    { t: fim, rot: 'Reunião', sub: `${nomeDia} ${horaReuniao}`, marco: true },
  ];
  const falta = (ms) => {
    if (ms < 2 * 3600000) return `${Math.max(1, Math.round(ms / 60000))} min`;
    const h = Math.max(0, Math.round(ms / 3600000));
    const d = Math.floor(h / 24);
    const r = h % 24;
    return d ? `${plural(d, 'dia', 'dias')}${r ? ` e ${r} h` : ''}` : `${h} h`;
  };
  let estado;
  if (agoraMs < fechamento) estado = `Atualizações abertas até ${NOMES_DIA_COMPLETO[(diaSemana + 6) % 7]}, ${br(diaAntes)}, às 18h · faltam ${falta(fechamento - agoraMs)}`;
  else if (agoraMs < fim) estado = `Atualizações fechadas · reunião em ${falta(fim - agoraMs)}`;
  else estado = 'Hoje é dia de reunião';
  const p = pos(agoraMs) * 100;
  return `<section class="trilho" aria-label="Trilho da semana">
    <div class="trilho-topo"><b>Reunião de ${nomeDia}, ${br(semana)}, às ${horaReuniao}</b><span class="suave">${estado}</span></div>
    <div class="trilho-pista" role="img" aria-label="Posição de hoje entre uma reunião e a seguinte">
      <div class="trilho-feito" style="width:${p}%"></div>
      ${marcos.map((m) => `<span class="trilho-ponto ${m.marco ? 'marco' : ''} ${m.t <= agoraMs ? 'passou' : ''}" style="left:${pos(m.t) * 100}%"></span>
        ${m.rot ? `<span class="trilho-rotulo ${pos(m.t) >= 0.99 ? 'fim' : pos(m.t) > 0.05 ? 'meio' : ''}" style="left:${pos(m.t) >= 0.99 ? 100 : Math.min(96, Math.max(4, pos(m.t) * 100))}%"><b>${m.rot}</b>${m.sub}</span>` : ''}`).join('')}
      <span class="trilho-agora" style="left:${Math.min(97, Math.max(3, p))}%">hoje</span>
    </div>
  </section>`;
}

