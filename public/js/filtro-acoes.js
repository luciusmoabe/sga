// Filtros da tela "Minhas ações": busca por texto, atalhos de atenção (com contagem), filtros por Responsável, Origem, Seção, Prazo,
// Status e Prioridade (cada opção com a contagem, considerando os outros filtros) e ordenação. Regra pura (sem DOM nem rede), com teste
// em `test/filtro-acoes.test.js`. Tudo roda sobre a lista que a tela já carregou: não muda a API nem nenhuma regra de negócio.
import { parseData, somarDias } from './datas.js';

/** Minúsculas e sem acento: "Orçamento" casa com "orcamento". */
export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const emCurso = (a) => a.status !== 'concluida' && !a.encerrada && !a.arquivada;
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
/** "terça, 17/11" */
export const diaEData = (data) => { const [, m, d] = data.split('-'); return `${DIAS[parseData(data).getUTCDay()]}, ${d}/${m}`; };

/**
 * Atalhos de atenção: cada um responde "quais ações pedem isso?". Vários atalhos juntos mostram a UNIÃO (o que tem qualquer um deles).
 * @type {{ id: string, rotulo: string, vale: (a: any, ctx: any) => boolean }[]}
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

/** As facetas com seleção única (cada uma é um campo no painel "Filtros"). */
export const FACETAS = ['responsavel', 'origem', 'secao', 'prazo', 'status', 'prioridade'];
export const ROTULO_FACETA = { responsavel: 'Responsável', origem: 'Origem', secao: 'Seção', prazo: 'Prazo', status: 'Status', prioridade: 'Prioridade' };
export const FILTRO_VAZIO = () => ({ q: '', atalhos: [], responsavel: '', origem: '', secao: '', prazo: '', prazoDe: '', prazoAte: '', status: '', prioridade: '' });

/** Quantas facetas estão ativas (para o número do botão "Filtros"). */
export const contarAtivos = (filtro) => FACETAS.filter((f) => filtro[f]).length;

const PREDICADO = {
  responsavel: (v, a, ctx) => (v === 'eu' ? a.responsavel_id === ctx.usuarioId : v === 'sem' ? a.responsavel_id == null
    : v.startsWith('id:') ? a.responsavel_id === Number(v.slice(3)) : true),
  origem: (v, a, ctx) => ({
    diretor: !!a.demandada_diretor,
    externa: !!a.demandante_externo,
    chefe: !!a.demandada_chefe && a.demandado_por_secao_id !== ctx.secaoId, // direcionada pelo chefe da seção acima
    minhas_demandas: !!a.demandada_chefe && a.demandado_por_secao_id === ctx.secaoId, // direcionada por mim às subseções
    interna: !!a.interna,
    criadas: a.criado_por === ctx.usuarioId,
  })[v] ?? true,
  secao: (v, a) => String(a.secao_id) === String(v),
  prazo: (v, a, ctx, f) => {
    if (v === 'hoje') return emCurso(a) && a.prazo === ctx.hoje;
    if (v === 'reuniao_equipe') return !!ctx.semanaEquipe && emCurso(a) && a.prazo >= ctx.hoje && a.prazo <= ctx.semanaEquipe;
    if (v === 'reuniao_org') return !!ctx.semana && emCurso(a) && a.prazo >= ctx.hoje && a.prazo <= ctx.semana;
    if (v === 'mes') return a.prazo.slice(0, 7) === ctx.hoje.slice(0, 7);
    if (v === 'intervalo') return (!f.prazoDe || a.prazo >= f.prazoDe) && (!f.prazoAte || a.prazo <= f.prazoAte);
    return true;
  },
  status: (v, a) => a.status === v,
  prioridade: (v, a) => a.prioridade === v,
};

const palheiro = (a) => normalizar([a.titulo, a.detalhe, a.responsavel_nome, a.secao_sigla, a.secao_nome].filter(Boolean).join(' '));

/**
 * Busca (todas as palavras, em qualquer ordem, no título, detalhe, responsável e seção) E atalhos (qualquer um dos marcados) E cada
 * faceta escolhida. `ignorar` deixa de fora uma faceta (ou `'atalhos'`), para contar "quantas teria se eu escolhesse esta opção".
 * @param {any[]} lista
 * @param {Partial<ReturnType<typeof FILTRO_VAZIO>>} filtro
 * @param {any} ctx `{ hoje, usuarioId?, secaoId?, semana?, semanaEquipe? }`
 * @param {{ ignorar?: string | null }} [opcoes]
 */
export function aplicarFiltros(lista, filtro = {}, ctx = {}, { ignorar = null } = {}) {
  const f = { ...FILTRO_VAZIO(), ...filtro };
  const palavras = normalizar(f.q).split(/\s+/).filter(Boolean);
  const marcados = ignorar === 'atalhos' ? [] : ATALHOS.filter((t) => f.atalhos.includes(t.id));
  const facetas = FACETAS.filter((nome) => f[nome] && nome !== ignorar);
  return lista.filter((a) => (!palavras.length || palavras.every((p) => palheiro(a).includes(p)))
    && (!marcados.length || marcados.some((t) => t.vale(a, ctx)))
    && facetas.every((nome) => PREDICADO[nome](f[nome], a, ctx, f)));
}

/** Quantas ações cada atalho mostraria, já respeitando a busca e as facetas (e não os outros atalhos, para o número não depender da ordem dos cliques). */
export function contarAtalhos(lista, filtro = {}, ctx = {}) {
  const base = aplicarFiltros(lista, filtro, ctx, { ignorar: 'atalhos' });
  return Object.fromEntries(ATALHOS.map((t) => [t.id, base.filter((a) => t.vale(a, ctx)).length]));
}

const ORIGENS = (ctx) => [
  ['diretor', ctx.rotuloDiretor || 'Demandadas pelo Diretor'],
  ['externa', 'Demanda de entidade externa'],
  ['chefe', 'Direcionadas pelo chefe da seção acima'],
  ['minhas_demandas', 'Direcionadas por mim às subseções'],
  ['interna', 'Ações internas'],
  ['criadas', 'Criadas por mim'],
];
const STATUS = [['a_fazer', 'A fazer'], ['em_andamento', 'Em andamento'], ['bloqueada', 'Bloqueada'], ['concluida', 'Concluída']];
const PRIORIDADES = [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']];

/** Valores possíveis de uma faceta, tirados do que existe em `universo`, cada um com a contagem (considerando os outros filtros). */
export function opcoesDe(universo, faceta, filtro = {}, ctx = {}) {
  const f = { ...FILTRO_VAZIO(), ...filtro };
  const base = aplicarFiltros(universo, f, ctx, { ignorar: faceta });
  const conta = (valor) => aplicarFiltros(base, { ...FILTRO_VAZIO(), [faceta]: valor, prazoDe: f.prazoDe, prazoAte: f.prazoAte }, ctx).length;
  let valores = [];
  if (faceta === 'responsavel') {
    const pessoas = new Map();
    for (const a of universo) if (a.responsavel_id != null && a.responsavel_id !== ctx.usuarioId) pessoas.set(a.responsavel_id, a.responsavel_nome || 'Conta removida');
    valores = [['eu', 'Comigo'], ['sem', 'Sem responsável'], ...[...pessoas].sort((x, y) => x[1].localeCompare(y[1])).map(([id, nome]) => [`id:${id}`, nome])];
  } else if (faceta === 'origem') valores = ORIGENS(ctx);
  else if (faceta === 'secao') {
    const secoes = new Map(universo.map((a) => [a.secao_id, a.secao_sigla || a.secao_nome || `Seção ${a.secao_id}`]));
    valores = secoes.size > 1 ? [...secoes].sort((x, y) => x[1].localeCompare(y[1])).map(([id, nome]) => [String(id), nome]) : []; // com uma só seção, o filtro não faz sentido
  } else if (faceta === 'prazo') {
    valores = [['hoje', 'Vencem hoje'],
      ...(ctx.semanaEquipe ? [['reuniao_equipe', `Até a reunião da equipe (${diaEData(ctx.semanaEquipe)})`]] : []),
      ...(ctx.semana ? [['reuniao_org', `Até a reunião da organização (${diaEData(ctx.semana)})`]] : []),
      ['mes', 'Neste mês'], ['intervalo', 'Escolher datas…']];
  } else if (faceta === 'status') valores = STATUS;
  else if (faceta === 'prioridade') valores = PRIORIDADES;
  return valores.map(([valor, rotulo]) => ({ valor, rotulo, n: conta(valor) }));
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
