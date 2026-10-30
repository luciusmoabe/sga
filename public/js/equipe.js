// Minha equipe: o chefe cadastra, consulta e desativa os membros da equipe da própria seção (e das subseções).
// O membro lê as ações da seção e executa só as que o chefe atribuiu a ele ou que ele criou; a validação do que ele conclui é do chefe.
import { get, patch, post } from './api.js';
import { est } from './estado.js';
import { TAM_SENHA } from './regras.js';
import { abrirForm, confirmar, esc, on, plural, toast, vazio } from './ui.js';

const situacao = (m) => (!m.ativo ? '<span class="pilula enc">Inativo</span>'
  : m.trocar_senha ? '<span class="pilula" title="Ainda vai criar a própria senha no primeiro acesso">Aguardando o 1º acesso</span>'
    : '<span class="pilula st-concluida">Ativo</span>');

export async function equipe(raiz, { refresh }) {
  if (!est.user.secao_id) {
    raiz.innerHTML = `<div class="cabeca"><h1>Minha equipe</h1></div><div class="cartao">${vazio(
      'Você ainda não está vinculado a uma seção', 'Peça ao Diretor para atribuí-lo a uma seção.')}</div>`;
    return;
  }
  const lista = await get('/equipe');
  const ativos = lista.filter((m) => m.ativo).length;
  raiz.innerHTML = `
    <div class="cabeca linha entre" style="align-items:flex-start">
      <div><h1>Minha equipe</h1>
        <div class="sub">${plural(ativos, 'membro ativo', 'membros ativos')}${lista.length > ativos ? ` · ${plural(lista.length - ativos, 'inativo', 'inativos')}` : ''}. Eles leem as ações da seção e executam as que você atribui a eles.</div></div>
      <button type="button" class="btn btn-primario" id="btn-novo-membro">+ Novo membro</button>
    </div>
    ${lista.length ? `<div class="cartao"><div class="tabela-rolagem"><table class="tabela-lista">
      <thead><tr><th>Nome</th><th>E-mail</th><th>Ações abertas</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map((m) => `<tr data-id="${m.id}">
        <td><b>${esc(m.nome)}</b>${m.secao_id !== est.user.secao_id ? ` <span class="pilula" title="Subseção">${esc(m.secao_sigla)}</span>` : ''}</td>
        <td data-rotulo="E-mail">${esc(m.email || '')}</td>
        <td class="num" data-rotulo="Ações abertas">${m.acoes_abertas}</td>
        <td data-rotulo="Situação">${situacao(m)}</td>
        <td><div class="linha" style="gap:6px;flex-wrap:wrap">${m.ativo
    ? '<button type="button" class="btn btn-fantasma btn-mini" data-senha>Redefinir senha</button><button type="button" class="btn btn-fantasma btn-mini" data-desativar>Desativar</button>'
    : '<button type="button" class="btn btn-sec btn-mini" data-reativar>Reativar</button>'}</div></td></tr>`).join('')}
      </tbody></table></div></div>`
    : `<div class="cartao">${vazio('Nenhum membro na equipe', 'Cadastre as pessoas da sua equipe para atribuir ações a elas.')}</div>`}`;

  const membroDe = (el) => lista.find((m) => m.id === Number(el.closest('[data-id]').dataset.id));
  const erro = (e) => toast(e.message, 'erro');

  on(raiz, 'click', '#btn-novo-membro', () => abrirForm({
    titulo: 'Novo membro da equipe',
    corpo: `<div class="campo"><label for="nm-nome">Nome</label><input id="nm-nome" name="nome" required maxlength="120" autocomplete="off"></div>
      <div class="campo"><label for="nm-email">E-mail de login</label><input id="nm-email" name="email" type="email" required maxlength="160" autocomplete="off"></div>
      <div class="campo"><label for="nm-senha">Senha inicial</label><input id="nm-senha" name="senha" type="password" required minlength="${TAM_SENHA.min}" maxlength="${TAM_SENHA.max}" autocomplete="new-password">
        <div class="dica">De ${TAM_SENHA.min} a ${TAM_SENHA.max} caracteres. É provisória: a pessoa cria a própria senha no primeiro acesso. Entregue-a diretamente a ela.</div></div>
      <p class="suave pequeno">O membro lê as ações da sua seção e executa só as que você atribuir a ele ou que ele criar. Não vê relatos, reuniões nem atas.</p>`,
    rotulo: 'Criar membro e login',
    aoEnviar: async (d, form) => {
      try { await post('/equipe', { nome: d.nome, email: d.email, senha: d.senha }); } finally { form.querySelector('[name="senha"]').value = ''; d.senha = ''; }
      toast('Membro cadastrado. Entregue a senha provisória a ele.');
      await refresh();
    },
  }));

  on(raiz, 'click', '[data-senha]', (el) => {
    const m = membroDe(el);
    abrirForm({
      titulo: `Redefinir a senha de ${m.nome}`,
      corpo: `<div class="campo"><label for="rs-senha">Nova senha provisória</label><input id="rs-senha" name="senha" type="password" required minlength="${TAM_SENHA.min}" maxlength="${TAM_SENHA.max}" autocomplete="new-password"></div>
        <p class="suave pequeno">As sessões abertas dele serão encerradas e ele criará a própria senha no próximo acesso. Entregue a nova senha diretamente a ele.</p>`,
      rotulo: 'Redefinir senha',
      aoEnviar: async (d, form) => {
        try { await patch(`/usuarios/${m.id}/login`, { senha: d.senha }); } finally { form.querySelector('[name="senha"]').value = ''; d.senha = ''; }
        toast('Senha redefinida.');
        await refresh();
      },
    });
  });

  on(raiz, 'click', '[data-desativar]', async (el) => {
    const m = membroDe(el);
    const ok = await confirmar({
      titulo: 'Desativar membro',
      texto: `${esc(m.nome)} perde o acesso agora.${m.acoes_abertas ? ` As ${m.acoes_abertas === 1 ? 'ação' : `${m.acoes_abertas} ações`} abertas atribuídas a ele continuam com o nome dele até você atribuí-las a outra pessoa.` : ''}`,
      rotulo: 'Desativar', perigo: true,
    });
    if (!ok) return;
    try { await patch(`/equipe/${m.id}`, { ativo: false }); toast('Membro desativado.'); await refresh(); } catch (e) { erro(e); }
  });
  on(raiz, 'click', '[data-reativar]', async (el) => {
    try { await patch(`/equipe/${membroDe(el).id}`, { ativo: true }); toast('Membro reativado.'); await refresh(); } catch (e) { erro(e); }
  });
}
