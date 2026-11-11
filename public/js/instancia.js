// Instância de uma tela de reunião: a interface é uma só e muda apenas a instância, a reunião da organização ou a da equipe da seção
// do chefe. A instância vem do endereço (`?i=equipe`), vale só entre as disponíveis para a pessoa e, quando há mais de uma, a tela
// ganha um seletor no topo.
import { esc } from './ui.js';

export const INSTANCIAS = { organizacao: 'Organização', equipe: 'Minha equipe' };

/** A instância pedida no endereço, se estiver entre as disponíveis; senão, `padrao` (ou a primeira disponível). */
export function instanciaDe(q, disponiveis, padrao) {
  const pedida = q?.get?.('i');
  if (disponiveis.includes(pedida)) return pedida;
  return disponiveis.includes(padrao) ? padrao : disponiveis[0];
}

/** Desenha o seletor (se houver mais de uma instância) e devolve o elemento onde a tela da instância se desenha. */
export function comSeletor(raiz, rota, disponiveis, atual, rotulo = 'Reunião') {
  const seletor = disponiveis.length > 1
    ? `<nav class="seletor-instancia" aria-label="${esc(rotulo)}: escolha a instância">${disponiveis.map((i) =>
      `<a href="#/${rota}?i=${i}"${i === atual ? ' aria-current="page"' : ''}>${esc(INSTANCIAS[i])}</a>`).join('')}</nav>` : '';
  raiz.innerHTML = `${seletor}<div class="instancia-corpo"></div>`;
  return raiz.querySelector('.instancia-corpo');
}
