// Filtros da tela "Minhas ações": busca por texto, atalhos de atenção (com contagem) e ordenação. Regra pura (sem DOM nem rede),
// com teste em `test/filtro-acoes.test.js`. Tudo roda sobre a lista que a tela já carregou: não muda a API nem nenhuma regra de negócio.
import { somarDias } from './datas.js';

/** Minúsculas e sem acento: "Orçamento" casa com "orcamento". */
export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const emCurso = (a) => a.status !== 'concluida' && !a.encerrada && !a.arquivada;

/**
 * Atalhos de atenção: cada um responde "quais ações pedem isso?". Vários atalhos juntos mostram a UNIÃO (o que tem qualquer um deles).
 * @type {{ id: string, rotulo: string, vale: (a: any, ctx: { hoje: string }) => boolean }[]}
 */
export const ATALHOS = [
  { id: 'atrasadas', rotulo: 'Atrasadas', vale: (a) => !!a.atrasada },
  { id: 'vencem', rotulo: 'Vencem em 7 dias', vale: (a, { hoje }) => emCurso(a) && a.prazo >= hoje && a.prazo <= somarDias(hoje, 7) },
  { id: 'paradas', rotulo: 'Paradas há 7+ dias', vale: (a) => !!a.parada },
  { id: 'impedimento', rotulo: 'Com impedimento', vale: (a) => Number(a.impedimentos_abertos) > 0 },
  { id: 'validar', rotulo: 'Aguardando validação', vale: (a) => !!a.aguardando_validacao },
  { id: 'novas', rotulo: 'Novas', vale: (a) => !!a.nova },
  { id: 'pedido', rotulo: 'Com pedido de prazo', vale: (a) => !!a.pedido_pendente },
];

const palheiro = (a) => normalizar([a.titulo, a.detalhe, a.responsavel_nome, a.secao_sigla, a.secao_nome].filter(Boolean).join(' '));

/** Busca (todas as palavras, em qualquer ordem, no título, detalhe, responsável e seção) E atalhos (qualquer um dos marcados). */
export function aplicarFiltros(lista, { q = '', atalhos = [] } = {}, ctx) {
  const palavras = normalizar(q).split(/\s+/).filter(Boolean);
  const marcados = ATALHOS.filter((t) => atalhos.includes(t.id));
  return lista.filter((a) => (!palavras.length || palavras.every((p) => palheiro(a).includes(p)))
    && (!marcados.length || marcados.some((t) => t.vale(a, ctx))));
}

/** Quantas ações cada atalho mostraria, já respeitando a busca (e não os outros atalhos, para o número não depender da ordem dos cliques). */
export function contarAtalhos(lista, { q = '' } = {}, ctx) {
  const base = aplicarFiltros(lista, { q }, ctx);
  return Object.fromEntries(ATALHOS.map((t) => [t.id, base.filter((a) => t.vale(a, ctx)).length]));
}

export const ORDENS = [
  ['padrao', 'Padrão (atrasadas primeiro)'],
  ['prazo', 'Prazo mais próximo'],
  ['prioridade', 'Prioridade'],
  ['parada', 'Mais tempo sem movimento'],
  ['recentes', 'Mais recentes'],
];
const PESO_PRIORIDADE = { alta: 0, media: 1, baixa: 2 };
const porId = (x, y) => x.id - y.id;

/** Cópia ordenada; "padrão" mantém a ordem do servidor (atrasadas primeiro, depois por prazo). */
export function ordenar(lista, ordem = 'padrao') {
  const copia = [...lista];
  if (ordem === 'prazo') return copia.sort((x, y) => x.prazo.localeCompare(y.prazo) || porId(x, y));
  if (ordem === 'prioridade') return copia.sort((x, y) => (PESO_PRIORIDADE[x.prioridade] ?? 1) - (PESO_PRIORIDADE[y.prioridade] ?? 1) || x.prazo.localeCompare(y.prazo) || porId(x, y));
  if (ordem === 'parada') return copia.sort((x, y) => (x.movimentada_em || x.criada_em || '').localeCompare(y.movimentada_em || y.criada_em || '') || porId(x, y));
  if (ordem === 'recentes') return copia.sort((x, y) => (y.criada_em || '').localeCompare(x.criada_em || '') || -porId(x, y));
  return copia;
}
