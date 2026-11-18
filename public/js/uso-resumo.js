// O resumo do uso das telas (versão do Diretor): as linhas que o servidor devolve (tela, perfil, versão, aberturas) viram uma lista por tela,
// da mais aberta para a menos aberta, e a lista das telas que ninguém abriu no período. Puro (sem DOM), com teste em `test/uso-resumo.test.js`.

/**
 * @param {{ tela: string, perfil: string, versao: string, aberturas: number }[]} linhas
 * @param {string[]} conhecidas  as telas que existem para acompanhar (as que ninguém abriu entram em `nuncaAbertas`)
 * @returns {{ telas: { tela: string, total: number, atual: number, nova: number, perfis: Record<string, number> }[], nuncaAbertas: string[], total: number }}
 */
export function resumoDeUso(linhas, conhecidas = []) {
  /** @type {Map<string, { tela: string, total: number, atual: number, nova: number, perfis: Record<string, number> }>} */
  const por = new Map();
  for (const l of linhas) {
    const t = por.get(l.tela) ?? { tela: l.tela, total: 0, atual: 0, nova: 0, perfis: {} };
    t.total += l.aberturas;
    if (l.versao === 'nova') t.nova += l.aberturas; else t.atual += l.aberturas;
    t.perfis[l.perfil] = (t.perfis[l.perfil] ?? 0) + l.aberturas;
    por.set(l.tela, t);
  }
  const telas = [...por.values()].sort((x, y) => y.total - x.total || x.tela.localeCompare(y.tela, 'pt-BR'));
  const nuncaAbertas = conhecidas.filter((c) => !por.has(c)).sort((x, y) => x.localeCompare(y, 'pt-BR'));
  return { telas, nuncaAbertas, total: telas.reduce((s, t) => s + t.total, 0) };
}
