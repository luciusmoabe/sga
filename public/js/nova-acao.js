// O botão "Nova ação" da versão nova: uma só porta para criar ação. Pergunta para quem a ação vai e abre o formulário certo, que já existe:
// o da seção (chefe, membro e o Administrador vinculado a uma seção) ou a tela Direcionar (Diretor, Apoio, Administrador e o chefe que tem
// subseções). Quem só tem um caminho vai direto a ele. Nenhuma regra de criação muda.
import { est } from './estado.js';
import { abrirForm, esc, on } from './ui.js';
import { abrirNovaAcaoDaSecao } from './acao-comum.js';

/** Quem vê o botão "Nova ação". */
export const podeCriarAcao = (perfil) => ['chefe', 'membro', 'diretor', 'apoio', 'administrador'].includes(perfil);

/** Os caminhos de criação que a pessoa tem: a ação da própria seção e/ou direcionar a outras seções ou subseções. */
export function caminhosDeCriacao(u, boot) {
  const daSecao = ['chefe', 'membro'].includes(u.perfil) || (u.perfil === 'administrador' && !!u.secao_id);
  const direciona = ['diretor', 'apoio', 'administrador'].includes(u.perfil) || (u.perfil === 'chefe' && !!boot?.secao?.tem_subsecoes);
  return { secao: daSecao, direcionar: direciona };
}

/** `aoCriar` recarrega a tela de quem chamou depois que a ação é criada. */
export function abrirNovaAcao({ aoCriar }) {
  const u = est.user;
  const c = caminhosDeCriacao(u, est.boot);
  const irParaDirecionar = () => { location.hash = '#/a-acoes?t=direcionar'; };
  if (c.secao && !c.direcionar) { abrirNovaAcaoDaSecao(aoCriar); return; }
  if (!c.secao) { irParaDirecionar(); return; }
  // Dois caminhos (o chefe com subseções, o Administrador de uma Diretoria Adjunta): pergunta para quem é a ação.
  const subsecoes = u.perfil === 'chefe';
  const opcoes = [
    ['secao', 'Para a minha seção', 'Eu mesmo ou alguém da minha equipe executa.'],
    [subsecoes ? 'subsecao' : 'direcionar', subsecoes ? 'Para uma subseção' : 'Para outra seção', subsecoes ? 'Direciono a uma ou a todas as subseções. Quando concluírem, eu aceito ou devolvo.' : 'Direciono a uma ou a várias seções.'],
  ];
  abrirForm({
    titulo: 'Nova ação',
    corpo: `<p class="suave pequeno">Para quem é a ação?</p><div class="lt-escolha">${opcoes.map(([id, rotulo, dica]) =>
      `<button type="button" class="btn btn-sec" data-nova-para="${id}"><b>${esc(rotulo)}</b><span class="suave pequeno">${esc(dica)}</span></button>`).join('')}</div>`,
    semEnvio: true, cancelar: 'Fechar',
    aoAbrir: (d) => on(d, 'click', '[data-nova-para]', (el) => {
      d.close();
      if (el.dataset.novaPara === 'secao') abrirNovaAcaoDaSecao(aoCriar); else irParaDirecionar();
    }),
  });
}
