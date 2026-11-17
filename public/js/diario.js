// Diário de progresso das ações: regras puras da interface (tipos, filtro por tipo e por tarefa, agrupamento por dia, "há N dias").
// Sem DOM nem rede, com teste em `test/diario-interface.test.js`. O registro em si (servidor) está em `server/rotas-acoes.js`.
import { dataNoFuso, diasEntre, instante, parseData } from './datas.js';

export const TIPOS_DIARIO = [['andamento', 'Andamento'], ['entrega', 'Entrega'], ['impedimento', 'Impedimento'], ['observacao', 'Observação']];
export const rotuloTipo = (tipo) => TIPOS_DIARIO.find(([v]) => v === tipo)?.[1] ?? tipo;

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/**
 * Filtra os registros por tipo e por tarefa. `tarefa`: vazio = todas; "geral" = os que não apontam tarefa nenhuma; "excluida" = os de
 * tarefas que já foram excluídas; um número (texto) = os daquela tarefa.
 * @param {any[]} lista
 * @param {{ tipo?: string, tarefa?: string }} [filtro]
 */
export function filtrarDiario(lista, { tipo = '', tarefa = '' } = {}) {
  return lista.filter((r) => (!tipo || r.tipo === tipo) && (!tarefa
    || (tarefa === 'geral' ? r.tarefa_id == null && !r.tarefa_nome
      : tarefa === 'excluida' ? r.tarefa_id == null && !!r.tarefa_nome
        : String(r.tarefa_id) === String(tarefa))));
}

/** Registros agrupados por dia do trabalho (`data`), mantendo a ordem recebida (mais recente primeiro). */
export function agruparPorDia(lista) {
  const grupos = [];
  for (const r of lista) {
    const g = grupos.at(-1);
    if (g && g.data === r.data) g.registros.push(r); else grupos.push({ data: r.data, registros: [r] });
  }
  return grupos;
}

/** "Hoje", "Ontem" ou "terça, 17/11" (com o ano se não for o de hoje). */
export function rotuloDoDia(data, hoje) {
  const dias = diasEntre(data, hoje);
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  const [a, m, d] = data.split('-');
  return `${DIAS[parseData(data).getUTCDay()]}, ${d}/${m}${a !== hoje.slice(0, 4) ? `/${a}` : ''}`;
}

/** "hoje", "ontem" ou "há 3 dias", para um instante (data e hora do servidor) visto em `hoje` (dia civil da Bahia). */
export function haQuantoTempo(instanteISO, hoje) {
  const dias = diasEntre(dataNoFuso(instante(instanteISO)), hoje);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

/** Corta o texto numa palavra inteira, com reticências, para caber numa linha. */
export function resumir(texto, max = 110) {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  return `${corte.slice(0, Math.max(corte.lastIndexOf(' '), Math.floor(max / 2)))}…`;
}

/** Quantos registros há de cada tipo e de cada tarefa, para os filtros mostrarem só o que existe. */
export function contagens(lista) {
  const porTipo = {}, porTarefa = new Map();
  let geral = 0, excluidas = 0;
  for (const r of lista) {
    porTipo[r.tipo] = (porTipo[r.tipo] ?? 0) + 1;
    if (r.tarefa_id != null) { const x = porTarefa.get(r.tarefa_id) ?? { nome: r.tarefa_nome, n: 0 }; x.n += 1; porTarefa.set(r.tarefa_id, x); }
    else if (r.tarefa_nome) excluidas += 1;
    else geral += 1;
  }
  return { porTipo, porTarefa, geral, excluidas };
}

/** Só endereços http(s) viram link; o resto é texto (nº do SEI, por exemplo). */
export const ehLink = (s) => /^https?:\/\/\S+$/i.test(String(s ?? '').trim());
