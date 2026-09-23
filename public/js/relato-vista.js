// Como o relato semanal enviado é exibido ao Diretor, ao Apoio e ao Administrador: a cópia do formato 2
// (blocos montados das ações) ou o formato antigo (listas de texto). As telas leem a mesma forma nos dois casos.
import { br, dataHora } from './ui.js';

const dia = (iso) => dataHora(iso).slice(0, 10);

/** Itens do relato para exibição. `impedimentosVivos` (opcional) troca os impedimentos da cópia pelos que estão
 *  abertos agora: o quadro da reunião mostra o estado de hoje, e feito/próximo continuam como foram reportados.
 *  Devolve null quando não há relato. */
export function itensDoRelato(at, impedimentosVivos = null) {
  if (!at) return null;
  const snap = at.feito?.snapshot;
  if (snap?.formato === 2) {
    const imps = impedimentosVivos ?? snap.impedimentos;
    return {
      formato: 2,
      feitos: snap.concluidas.map((a) => ({ texto: a.titulo, detalhe: `${a.secao_sigla} · concluída em ${dia(a.concluida_em)}` })),
      atrasadas: snap.atrasadas.map((a) => ({ texto: a.titulo, detalhe: `${a.secao_sigla} · prazo ${br(a.prazo)}` })),
      proximo: snap.programadas.map((a) => ({ texto: a.titulo, detalhe: `${a.secao_sigla} · prazo ${br(a.prazo)}` })),
      impedimentos: imps.map((i) => ({ texto: `${i.acao_titulo}: ${i.descricao}`, critico: !!i.critico })),
      apoios: imps.filter((i) => i.apoio).map((i) => `${i.acao_titulo}: ${i.apoio}`),
      observacoes: snap.observacoes || '',
      internas: snap.internas,
    };
  }
  return {
    formato: 1,
    feitos: [
      ...(at.feito?.previstos || []).map((p) => ({ texto: `${p.texto} (${p.cumprido ? 'cumprido' : 'não cumprido'})` })),
      ...(at.feito?.extras || []).map((texto) => ({ texto })),
    ],
    atrasadas: [],
    proximo: (at.proximo || []).map((texto) => ({ texto })),
    impedimentos: (at.impedimentos || []).map((texto) => ({ texto, critico: !!at.critico })),
    apoios: at.apoio ? [at.apoio] : [],
    observacoes: '',
    internas: null,
  };
}

/** Só contagem dos itens internos das subseções, como manda a regra das ações internas. */
export function resumoInternas(internas) {
  if (!internas) return '';
  const partes = [['concluidas', 'concluída', 'concluídas'], ['atrasadas', 'atrasada', 'atrasadas'],
    ['programadas', 'programada', 'programadas'], ['impedimentos', 'impedimento', 'impedimentos']]
    .filter(([k]) => internas[k] > 0).map(([k, um, varios]) => `${internas[k]} ${internas[k] === 1 ? um : varios}`);
  return partes.length ? `Itens internos das subseções (só contagem): ${partes.join(', ')}.` : '';
}
