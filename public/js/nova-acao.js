// O botão "Nova ação" da versão nova: uma só porta para criar ação. Pergunta para quem a ação vai e abre o formulário certo, que já existe:
// o da seção (chefe e membro) ou a tela Direcionar (Diretor, Apoio e o chefe que tem subseções). Nenhuma regra de criação muda.
import { est } from './estado.js';
import { abrirForm, esc, on } from './ui.js';
import { abrirNovaAcaoDaSecao } from './acao-comum.js';

/** Quem vê o botão "Nova ação". */
export const podeCriarAcao = (perfil) => ['chefe', 'membro', 'diretor', 'apoio'].includes(perfil);

/** `aoCriar` recarrega a tela de quem chamou depois que a ação é criada. */
export function abrirNovaAcao({ aoCriar }) {
  const u = est.user;
  // O Diretor e o Apoio direcionam às seções: a tela Direcionar é o formulário deles.
  if (['diretor', 'apoio', 'administrador'].includes(u.perfil)) { location.hash = '#/a-acoes?t=direcionar'; return; }
  const temSubsecoes = u.perfil === 'chefe' && !!est.boot?.secao?.tem_subsecoes;
  if (!temSubsecoes) { abrirNovaAcaoDaSecao(aoCriar); return; }
  // O chefe com subseções escolhe: ação da própria seção ou ação direcionada a uma subseção.
  const opcoes = [
    ['secao', 'Para a minha seção', 'Eu mesmo ou alguém da minha equipe executa.'],
    ['subsecao', 'Para uma subseção', 'Direciono a uma ou a todas as subseções. Quando concluírem, eu aceito ou devolvo.'],
  ];
  abrirForm({
    titulo: 'Nova ação',
    corpo: `<p class="suave pequeno">Para quem é a ação?</p><div class="lt-escolha">${opcoes.map(([id, rotulo, dica]) =>
      `<button type="button" class="btn btn-sec" data-nova-para="${id}"><b>${esc(rotulo)}</b><span class="suave pequeno">${esc(dica)}</span></button>`).join('')}</div>`,
    semEnvio: true, cancelar: 'Fechar',
    aoAbrir: (d) => on(d, 'click', '[data-nova-para]', (el) => {
      d.close();
      if (el.dataset.novaPara === 'secao') abrirNovaAcaoDaSecao(aoCriar); else location.hash = '#/a-acoes?t=direcionar';
    }),
  });
}
