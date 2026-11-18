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

/**
 * Sugestão de texto para as observações do relato semanal, tirada dos registros da semana: primeiro as entregas, depois os impedimentos,
 * os andamentos e as observações (em cada grupo, o mais recente antes), uma linha por registro, até caber em `max` caracteres. Registro de ação
 * interna (que não aparece para a gestão) nunca entra. Quem envia revê e edita o texto antes.
 * @param {any[]} registros
 * @param {{ max?: number }} [opcoes]
 */
export function destaquesParaRelato(registros, { max = 600 } = {}) {
  const ordemTipo = { entrega: 0, impedimento: 1, andamento: 2, observacao: 3 };
  const lista = registros.filter((r) => !(r.interna && !r.compartilhada))
    .sort((x, y) => (ordemTipo[x.tipo] ?? 9) - (ordemTipo[y.tipo] ?? 9) || (x.data === y.data ? y.id - x.id : x.data < y.data ? 1 : -1));
  const linhas = [];
  let tamanho = 0;
  for (const r of lista) {
    const linha = `- ${resumir(r.acao_titulo, 50)}: ${resumir(r.texto, 90)}`;
    const novo = tamanho + (linhas.length ? 1 : 0) + linha.length;
    if (novo > max) { if (!linhas.length) linhas.push(resumir(linha, max)); break; }
    linhas.push(linha);
    tamanho = novo;
  }
  return linhas.join('\n');
}

/**
 * Ações em andamento sem registro no diário há `dias` dias ou mais (ou que nunca tiveram), para um lembrete suave. Só informa: não muda
 * status, semáforo nem a regra de "parada".
 * @param {any[]} acoes  ações com `status` e `ultimo_registro_em` (como GET /acoes devolve)
 * @param {string} hoje  dia civil de hoje (AAAA-MM-DD)
 */
export function semRegistroRecente(acoes, hoje, dias = 7) {
  return acoes.filter((a) => a.status === 'em_andamento' && (!a.ultimo_registro_em || diasEntre(dataNoFuso(instante(a.ultimo_registro_em)), hoje) >= dias));
}

/** Só endereços http(s) viram link; o resto é texto (nº do SEI, por exemplo). */
export const ehLink = (s) => /^https?:\/\/\S+$/i.test(String(s ?? '').trim());

/**
 * Filtros da tela "Meu diário" / "Diário da seção", sobre os registros do período: pessoa (id do autor), ação (id) e tipo.
 * @param {any[]} lista
 * @param {{ pessoa?: string, acao?: string, tipo?: string }} [filtro]
 */
export function filtrarRegistros(lista, { pessoa = '', acao = '', tipo = '' } = {}) {
  return lista.filter((r) => (!pessoa || String(r.autor_id) === String(pessoa)) && (!acao || String(r.acao_id) === String(acao)) && (!tipo || r.tipo === tipo));
}

/** As opções de pessoa e de ação que existem nos registros (para os filtros só mostrarem o que há), em ordem alfabética, com a contagem. */
export function opcoesDosRegistros(lista) {
  const pessoas = new Map(), acoes = new Map();
  for (const r of lista) {
    if (r.autor_id != null) { const p = pessoas.get(r.autor_id) ?? { id: r.autor_id, nome: r.autor_nome || 'Sem nome', n: 0 }; p.n += 1; pessoas.set(r.autor_id, p); }
    const a = acoes.get(r.acao_id) ?? { id: r.acao_id, nome: r.acao_titulo, n: 0 }; a.n += 1; acoes.set(r.acao_id, a);
  }
  const ordem = (x, y) => x.nome.localeCompare(y.nome, 'pt-BR');
  return { pessoas: [...pessoas.values()].sort(ordem), acoes: [...acoes.values()].sort(ordem) };
}

const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const horas = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')} min` : ''}` : `${min} min`);

/**
 * Texto do resumo do período para copiar e colar (relato, e-mail, SEI): um bloco por dia, um item por registro, do dia mais antigo ao mais recente.
 * @param {any[]} registros  registros já filtrados (mais recente primeiro, como a API devolve)
 * @param {{ de: string, ate: string, titulo?: string, comAutor?: boolean }} periodo
 */
export function resumoParaCopiar(registros, { de, ate, titulo = 'Diário de progresso', comAutor = false }) {
  const total = registros.reduce((s, r) => s + (r.minutos || 0), 0);
  const cab = `${titulo} — ${dm(de)} a ${dm(ate)}`;
  if (!registros.length) return `${cab}\nNenhum registro no período.`;
  const dias = agruparPorDia([...registros].sort((x, y) => (x.data === y.data ? x.id - y.id : x.data < y.data ? -1 : 1)));
  const linhas = [cab, `${registros.length} registro${registros.length === 1 ? '' : 's'}${total ? ` · ${horas(total)} lançados` : ''}`];
  for (const g of dias) {
    linhas.push('', dm(g.data));
    for (const r of g.registros) {
      const onde = `${r.acao_titulo}${r.tarefa_nome ? ` (tarefa: ${r.tarefa_nome})` : ''}`;
      const extra = [rotuloTipo(r.tipo), comAutor && r.autor_nome ? r.autor_nome : '', r.minutos ? horas(r.minutos) : '', r.referencia ? `ref. ${r.referencia}` : ''].filter(Boolean).join(' · ');
      linhas.push(`- ${onde}: ${String(r.texto).replace(/\s+/g, ' ').trim()} [${extra}]`);
    }
  }
  return linhas.join('\n');
}
