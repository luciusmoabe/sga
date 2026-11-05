// Vocabulário por empresa: cada empresa dá os seus nomes aos tipos de unidade e ao perfil do topo (o Diretor). Módulo puro,
// compartilhado pelo servidor e pela interface. O que não for informado vale o padrão, que é o vocabulário do órgão atual.
//
// Cada nome tem singular, plural e gênero (m/f): o gênero acerta os artigos ("Todos os Centros", "Todas as Diretorias").
import { ROTULO_PERFIL } from './regras.js';

export const TIPOS_DO_VOCABULARIO = ['centro', 'coordenacao', 'subsecao', 'diretoria_adjunta'];
export const MAX_NOME = 40;
export const NIVEIS_PADRAO = 3;
export const NIVEIS_MIN = 2;
export const NIVEIS_MAX = 6;
/** Tipos que uma empresa pode não usar. O Centro (unidade de primeiro nível) e a Subseção sempre existem. */
export const TIPOS_OPCIONAIS = ['coordenacao', 'diretoria_adjunta'];

export const VOCABULARIO_PADRAO = Object.freeze({
  niveis: NIVEIS_PADRAO, // níveis da árvore de seções (a Diretoria Adjunta conta como um)
  topo: Object.freeze({ nome: 'Diretor', genero: 'm' }),
  tipos: Object.freeze({
    centro: Object.freeze({ singular: 'Centro', plural: 'Centros', genero: 'm', usa: true }),
    coordenacao: Object.freeze({ singular: 'Coordenação', plural: 'Coordenações', genero: 'f', usa: true }),
    subsecao: Object.freeze({ singular: 'Subseção', plural: 'Subseções', genero: 'f', usa: true }),
    diretoria_adjunta: Object.freeze({ singular: 'Diretoria Adjunta', plural: 'Diretorias Adjuntas', genero: 'f', usa: true }),
  }),
});

const limpo = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const genero = (v, padrao) => (v === 'm' || v === 'f' ? v : padrao);

/** Vocabulário completo: o que a empresa informou, com o padrão no que faltar ou vier inválido. Nunca lança. */
export function completarVocabulario(bruto) {
  const b = bruto && typeof bruto === 'object' ? bruto : {};
  const topo = { nome: limpo(b.topo?.nome).slice(0, MAX_NOME) || VOCABULARIO_PADRAO.topo.nome, genero: genero(b.topo?.genero, VOCABULARIO_PADRAO.topo.genero) };
  const tipos = {};
  for (const t of TIPOS_DO_VOCABULARIO) {
    const p = VOCABULARIO_PADRAO.tipos[t], e = b.tipos?.[t] ?? {};
    tipos[t] = {
      singular: limpo(e.singular).slice(0, MAX_NOME) || p.singular, plural: limpo(e.plural).slice(0, MAX_NOME) || p.plural, genero: genero(e.genero, p.genero),
      usa: TIPOS_OPCIONAIS.includes(t) ? e.usa !== false : true,
    };
  }
  const niveis = Number.isInteger(b.niveis) && b.niveis >= NIVEIS_MIN && b.niveis <= NIVEIS_MAX ? b.niveis : NIVEIS_PADRAO;
  return { niveis, topo, tipos };
}

/** Confere o que a pessoa enviou ao salvar: nomes preenchidos, curtos e sem repetição. Lança Error com mensagem em português. */
export function validarVocabulario(bruto) {
  if (!bruto || typeof bruto !== 'object') throw new Error('Informe os nomes.');
  const nomes = [];
  const exigir = (valor, rotulo) => {
    const v = limpo(valor);
    if (!v) throw new Error(`Preencha o nome: ${rotulo}.`);
    if (v.length > MAX_NOME) throw new Error(`O nome "${rotulo}" deve ter até ${MAX_NOME} caracteres.`);
    return v;
  };
  const exigirGenero = (g, rotulo) => {
    if (g !== 'm' && g !== 'f') throw new Error(`Escolha o gênero de "${rotulo}" (masculino ou feminino).`);
    return g;
  };
  const topo = { nome: exigir(bruto.topo?.nome, 'chefe da empresa'), genero: exigirGenero(bruto.topo?.genero, 'chefe da empresa') };
  const tipos = {};
  for (const t of TIPOS_DO_VOCABULARIO) {
    const rotulo = VOCABULARIO_PADRAO.tipos[t].singular;
    const e = bruto.tipos?.[t] ?? {};
    if (e.usa !== undefined && typeof e.usa !== 'boolean') throw new Error(`Informe se a empresa usa "${rotulo}" (sim ou não).`);
    tipos[t] = {
      singular: exigir(e.singular, `${rotulo} (singular)`), plural: exigir(e.plural, `${rotulo} (plural)`), genero: exigirGenero(e.genero, rotulo),
      usa: TIPOS_OPCIONAIS.includes(t) ? e.usa !== false : true,
    };
    nomes.push(tipos[t].singular.toLowerCase());
  }
  if (new Set(nomes).size !== nomes.length) throw new Error('Dois tipos de unidade não podem ter o mesmo nome.');
  const niveis = bruto.niveis === undefined ? NIVEIS_PADRAO : bruto.niveis;
  if (!Number.isInteger(niveis) || niveis < NIVEIS_MIN || niveis > NIVEIS_MAX) throw new Error(`Os níveis da estrutura vão de ${NIVEIS_MIN} a ${NIVEIS_MAX}.`);
  return { niveis, topo, tipos };
}

const artigo = (g, { m, f }) => (g === 'f' ? f : m);

export const nomeTipo = (v, tipo) => v.tipos[tipo].singular;
/** A empresa usa este tipo de unidade? */
export const usaTipo = (v, tipo) => v.tipos[tipo].usa !== false;
export const nomePlural = (v, tipo) => v.tipos[tipo].plural;
/** "Todos os Centros" / "Todas as Diretorias". */
export const todasAs = (v, tipo) => `${artigo(v.tipos[tipo].genero, { m: 'Todos os', f: 'Todas as' })} ${v.tipos[tipo].plural}`;
/** "dos Centros" / "das Diretorias" (para "Ações dos Centros"). */
export const dosPlural = (v, tipo) => `${artigo(v.tipos[tipo].genero, { m: 'dos', f: 'das' })} ${v.tipos[tipo].plural}`;
/** "este Centro" / "esta Diretoria". */
export const esteTipo = (v, tipo) => `${artigo(v.tipos[tipo].genero, { m: 'este', f: 'esta' })} ${v.tipos[tipo].singular}`;
/** "o Centro" / "a Diretoria Adjunta". */
export const oTipo = (v, tipo) => `${artigo(v.tipos[tipo].genero, { m: 'o', f: 'a' })} ${v.tipos[tipo].singular}`;
/** "do Superintendente" / "da Superintendente". */
export const doTopo = (v) => `${artigo(v.topo.genero, { m: 'do', f: 'da' })} ${v.topo.nome}`;
/** "o Superintendente" / "a Superintendente". */
export const oTopo = (v) => `${artigo(v.topo.genero, { m: 'o', f: 'a' })} ${v.topo.nome}`;
/** "O Superintendente" / "A Superintendente" (começo de frase). */
export const OTopo = (v) => `${artigo(v.topo.genero, { m: 'O', f: 'A' })} ${v.topo.nome}`;
/** "ao Superintendente" / "à Superintendente". */
export const aoTopo = (v) => `${artigo(v.topo.genero, { m: 'ao', f: 'à' })} ${v.topo.nome}`;
/** "pelo Superintendente" / "pela Superintendente". */
export const peloTopo = (v) => `${artigo(v.topo.genero, { m: 'pelo', f: 'pela' })} ${v.topo.nome}`;

/** Troca, num texto, as marcas {topo}, {topo:o}, {topo:O}, {topo:do}, {topo:ao} e {topo:pelo} pelo nome do topo da empresa, com o
 *  artigo certo. Serve às mensagens do servidor, escritas uma vez e ajustadas à empresa de quem as recebe. */
export function resolverTopo(texto, v) {
  if (typeof texto !== 'string' || !texto.includes('{topo')) return texto;
  const formas = { o: oTopo, O: OTopo, do: doTopo, ao: aoTopo, pelo: peloTopo };
  return texto.replace(/\{topo(?::(o|O|do|ao|pelo))?\}/g, (_, f) => (f ? formas[f](v) : v.topo.nome));
}

/** Rótulo do perfil: o Diretor e o Apoio acompanham o nome do topo; os demais seguem fixos. */
export function rotuloPerfil(v, perfil) {
  if (perfil === 'diretor') return v.topo.nome;
  if (perfil === 'apoio') return `Apoio ${doTopo(v)}`;
  return ROTULO_PERFIL[perfil] ?? perfil;
}

/** Lista "A, B e C" para mensagens. */
export function listaDe(itens) {
  return itens.length < 2 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;
}
