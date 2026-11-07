// Agrupa as ações de uma lista pela diretriz de origem. Módulo puro (sem DOM): a tela o usa e os testes o importam.
//
// Uma diretriz "para todos os Centros" vira uma ação por seção, todas com o mesmo título; na lista elas se repetiam,
// uma linha por seção. Aqui elas viram um grupo com um resumo (quantas seções, quantas atrasadas, em que pé está).
// Só entram em grupo as ações de uma mesma diretriz que aparecem em número de 2 ou mais na lista; as demais seguem soltas.

const ORDEM_RESUMO = ['atrasadas', 'bloqueadas', 'emAndamento', 'aFazer', 'concluidas'];

/**
 * @param {Array} lista ações como vêm de GET /api/acoes (já filtradas e ordenadas)
 * @returns {Array<{tipo:'acao', acao:object} | {tipo:'grupo', diretrizId:number, titulo:string, acoes:object[], resumo:object}>}
 *   Mantém a ordem da lista: o grupo fica onde aparece a sua primeira ação.
 */
export function agruparPorDiretriz(lista) {
  const porDiretriz = new Map();
  for (const a of lista) {
    if (a.diretriz_id == null) continue;
    if (!porDiretriz.has(a.diretriz_id)) porDiretriz.set(a.diretriz_id, []);
    porDiretriz.get(a.diretriz_id).push(a);
  }
  const saida = [];
  const jaEmitido = new Set();
  for (const a of lista) {
    const membros = a.diretriz_id == null ? null : porDiretriz.get(a.diretriz_id);
    if (!membros || membros.length < 2) { saida.push({ tipo: 'acao', acao: a }); continue; }
    if (jaEmitido.has(a.diretriz_id)) continue;
    jaEmitido.add(a.diretriz_id);
    saida.push({ tipo: 'grupo', diretrizId: a.diretriz_id, titulo: a.titulo, acoes: membros, resumo: resumirGrupo(membros) });
  }
  return saida;
}

/** Contagens do grupo. Cada ação cai em um só balde, pelo mais urgente: atrasada, bloqueada, em andamento, a fazer, concluída. */
export function resumirGrupo(acoes) {
  const r = { total: acoes.length, atrasadas: 0, bloqueadas: 0, emAndamento: 0, aFazer: 0, concluidas: 0, prazoMin: null, prazoMax: null };
  for (const a of acoes) {
    if (a.status === 'concluida') r.concluidas++;
    else if (a.atrasada) r.atrasadas++;
    else if (a.status === 'bloqueada') r.bloqueadas++;
    else if (a.status === 'em_andamento') r.emAndamento++;
    else r.aFazer++;
    if (a.prazo && (r.prazoMin === null || a.prazo < r.prazoMin)) r.prazoMin = a.prazo;
    if (a.prazo && (r.prazoMax === null || a.prazo > r.prazoMax)) r.prazoMax = a.prazo;
  }
  return r;
}

const ROTULOS = {
  atrasadas: ['atrasada', 'atrasadas'],
  bloqueadas: ['bloqueada', 'bloqueadas'],
  emAndamento: ['em andamento', 'em andamento'],
  aFazer: ['a fazer', 'a fazer'],
  concluidas: ['concluída', 'concluídas'],
};

/** Partes do resumo em ordem de urgência, só as que têm ação: [{chave, n, texto}]. Ex.: { chave: 'atrasadas', n: 2, texto: '2 atrasadas' }. */
export function partesDoResumo(resumo) {
  return ORDEM_RESUMO.filter((k) => resumo[k] > 0).map((k) => {
    const [um, varios] = ROTULOS[k];
    return { chave: k, n: resumo[k], texto: `${resumo[k]} ${resumo[k] === 1 ? um : varios}` };
  });
}
