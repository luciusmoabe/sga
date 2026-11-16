// Em qual reunião cada ação do chefe será tratada: a da organização (a do Diretor) ou a da equipe dele. Só orienta os alertas do
// Início do chefe ("Precisa de atenção" e "Sua semana"); o relato semanal ao Diretor continua levando todas as ações da unidade,
// na data da organização. Regra pura (sem DOM nem rede), com teste em `test/reuniao-da-acao.test.js`.
//
// O critério é a ORIGEM da cobrança, não a pessoa responsável:
//   - demandada pelo Diretor ou por entidade externa                     → organização, quem quer que execute;
//   - tratada com a equipe (interna, atribuída a outra pessoa, de uma
//     subseção ou direcionada pelo chefe às subseções)                   → equipe;
//   - as duas coisas (demanda do Diretor delegada à equipe)              → a mais próxima das duas, porque a equipe se prepara
//                                                                          antes de levar o assunto ao Diretor;
//   - o resto (trabalho da própria unidade, sem responsável a quem delegar) → organização;
//   - sem reunião de equipe (chefe sem equipe nem subseções)             → organização.

/** @typedef {{ tipo: 'organizacao' | 'equipe', data: string }} ReuniaoDaAcao */

/**
 * @param {object} a ação (campos de `GET /api/acoes`)
 * @param {{ semana: string, semanaEquipe?: string | null, hoje: string, usuarioId: number, secaoId?: number | null }} ctx
 *   `semana`: data da reunião da organização; `semanaEquipe`: a da equipe (vazio se o chefe não tem equipe).
 * @returns {ReuniaoDaAcao}
 */
export function reuniaoDaAcao(a, { semana, semanaEquipe, hoje, usuarioId, secaoId }) {
  /** @type {ReuniaoDaAcao} */
  const organizacao = { tipo: 'organizacao', data: semana };
  if (!semanaEquipe) return organizacao;
  /** @type {ReuniaoDaAcao} */
  const equipe = { tipo: 'equipe', data: semanaEquipe };
  const doDiretor = !!a.demandada_diretor || !!a.demandante_externo;
  const naEquipe = !!a.interna || !!a.demandada_chefe || (secaoId != null && a.secao_id !== secaoId)
    || (a.responsavel_id != null && a.responsavel_id !== usuarioId);
  if (doDiretor && naEquipe) {
    const proximas = [organizacao, equipe].filter((r) => r.data >= hoje).sort((x, y) => x.data.localeCompare(y.data));
    return proximas[0] ?? organizacao;
  }
  return naEquipe ? equipe : organizacao;
}

/** "da organização" ou "da equipe", para completar "reunião ...". */
export const nomeDaReuniao = (r) => (r.tipo === 'equipe' ? 'da equipe' : 'da organização');
