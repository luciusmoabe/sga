// Atualiza apenas as seções alimentadas pelos registros da reunião.
const TITULOS = /^(?:\*\*)?(Participantes|Informações(?: e comunicados)?|Decisões|(?:Novas )?[Aa]ções|Pedidos de novo prazo decididos|Impedimentos críticos em aberto):(?:\*\*)?\s*$|^Próxima reunião:/;

export function integrarRegistrosAta(texto, participantes, informacoes) {
  const linhas = String(texto || '').split('\n');
  const remover = (nome) => {
    const inicio = linhas.findIndex(l => nome.test(l.trim()));
    if (inicio < 0) return -1;
    let fim = inicio + 1;
    while (fim < linhas.length && !TITULOS.test(linhas[fim].trim())) fim++;
    linhas.splice(inicio, fim - inicio);
    return inicio;
  };
  const inicio = remover(/^(?:\*\*)?Participantes:(?:\*\*)?$/);
  remover(/^(?:\*\*)?Informações(?: e comunicados)?:(?:\*\*)?$/);
  const presenca = ['Participantes:', ...(participantes.length ? participantes.map(p => `- ${p.nome}${p.secao_nome ? ` (${p.secao_nome})` : ''}`) : ['- Presença não registrada.']), ''];
  // Atas antigas sem a seção recebem os participantes após o título.
  linhas.splice(inicio < 0 ? Math.min(2, linhas.length) : inicio, 0, ...presenca);
  const acoes = linhas.findIndex(l => /^(?:\*\*)?(?:Novas )?[Aa]ções:(?:\*\*)?$/.test(l.trim()));
  let pos = acoes < 0 ? linhas.length : acoes + 1;
  if (acoes >= 0) while (pos < linhas.length && !TITULOS.test(linhas[pos].trim())) pos++;
  const infos = ['Informações:', ...(informacoes.length ? informacoes.map(i => `- ${i.texto}`) : ['- Nenhuma informação registrada.']), ''];
  linhas.splice(pos, 0, ...infos);
  return linhas.join('\n');
}
