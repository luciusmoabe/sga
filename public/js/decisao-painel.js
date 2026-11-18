// O que pede a decisão do Diretor antes da reunião, tirado do Painel da semana (versão nova). Puro (sem DOM), com teste em
// `test/decisao-painel.test.js`. Só lê o que o painel já traz: não muda semáforo, pedido nem prazo.

/**
 * Os pontos que pedem decisão: cada seção com impedimento crítico aberto (um ponto por seção, mais graves primeiro) e, em um só ponto, os pedidos
 * de novo prazo aguardando resposta.
 * @param {{ secao: { id: number, nome: string, sigla?: string }, impedimentos_criticos?: number, pedidos_pendentes?: number }[]} itens  as unidades do painel
 * @param {string} semana  a data da reunião (AAAA-MM-DD), para o endereço do detalhe
 * @returns {{ chave: 'critico' | 'pedidos', n: number, secao?: string, href: string, rotulo: string }[]}
 */
export function pontosParaDecidir(itens, semana) {
  const criticos = itens.filter((i) => (i.impedimentos_criticos || 0) > 0)
    .sort((x, y) => (y.impedimentos_criticos || 0) - (x.impedimentos_criticos || 0) || x.secao.nome.localeCompare(y.secao.nome, 'pt-BR'))
    .map((i) => ({ chave: /** @type {const} */ ('critico'), n: i.impedimentos_criticos || 0, secao: i.secao.nome, href: `#/centro/${i.secao.id}?semana=${semana}`, rotulo: 'Ver detalhe' }));
  const pedidos = itens.reduce((n, i) => n + (i.pedidos_pendentes || 0), 0);
  return [...criticos, ...(pedidos ? [{ chave: /** @type {const} */ ('pedidos'), n: pedidos, href: '#/prazos', rotulo: 'Responder' }] : [])];
}
