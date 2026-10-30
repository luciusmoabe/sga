// Plataforma: cadastro das empresas. Só o perfil Plataforma entra aqui; ele cria a empresa e o primeiro Diretor e administra a
// situação de cada empresa, mas não vê nenhum dado de negócio dela (ações, seções, reuniões).
import { get, patch, post } from './api.js';
import { abrirForm, confirmar, esc, on, toast, vazio } from './ui.js';

const dataBr = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const enderecoDe = (slug) => `${location.origin}/?empresa=${encodeURIComponent(slug)}`;

/** Sugere o identificador a partir do nome: minúsculas, sem acento, hífens entre as palavras. */
const sugerirSlug = (nome) => nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** Senha provisória legível (sem caracteres ambíguos); a pessoa é obrigada a trocá-la no primeiro acesso. */
function senhaProvisoria() {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return [...bytes].map((b) => alfabeto[b % alfabeto.length]).join('');
}

async function copiar(texto, aviso) {
  try { await navigator.clipboard.writeText(texto); toast(aviso); }
  catch { toast('Não foi possível copiar. Selecione o texto e copie manualmente.', 'erro'); }
}

function mostrarAcesso(r, senha) {
  const e = r.empresa;
  const texto = `Empresa: ${e.nome}\nEndereço: ${enderecoDe(e.slug)}\nDiretor: ${r.diretor.nome}\nE-mail: ${r.diretor.email}\nSenha provisória: ${senha}`;
  abrirForm({
    titulo: 'Empresa criada',
    semEnvio: true,
    cancelar: 'Fechar',
    corpo: `<p>A empresa <b>${esc(e.nome)}</b> está pronta. Passe estes dados ao Diretor por um canal seguro: <b>a senha provisória não será mostrada de novo</b>, e ele é obrigado a trocá-la no primeiro acesso.</p>
      <pre class="acesso-novo" id="acesso-novo">${esc(texto)}</pre>
      <button type="button" class="btn btn-primario" id="copiar-acesso">Copiar os dados de acesso</button>`,
    aoAbrir: (dlg) => dlg.querySelector('#copiar-acesso').addEventListener('click', () => copiar(texto, 'Dados de acesso copiados.')),
  });
}

function formNova(aoCriar) {
  abrirForm({
    titulo: 'Nova empresa',
    rotulo: 'Criar empresa',
    corpo: `<p class="suave">Cria a empresa e a conta do primeiro Diretor, que depois cadastra as seções, os chefes e a equipe pelo próprio Agilis.</p>
      <div class="campo"><label for="emp-nome">Nome da empresa</label><input id="emp-nome" name="nome" maxlength="160" required></div>
      <div class="dois">
        <div class="campo"><label for="emp-sigla">Sigla (opcional)</label><input id="emp-sigla" name="sigla" maxlength="12"></div>
        <div class="campo"><label for="emp-slug">Identificador no endereço</label><input id="emp-slug" name="slug" maxlength="40" required pattern="[a-z0-9]+(-[a-z0-9]+)*" autocapitalize="none" spellcheck="false">
          <div class="dica">Só letras minúsculas, números e hífens. Não muda depois.</div></div>
      </div>
      <div class="campo"><label for="emp-diretor">Nome do Diretor</label><input id="emp-diretor" name="diretor" maxlength="120" required></div>
      <div class="campo"><label for="emp-email">E-mail do Diretor</label><input id="emp-email" name="email" type="email" maxlength="160" required autocomplete="off">
        <div class="dica">Cada e-mail pertence a uma só empresa.</div></div>
      <div class="campo"><label for="emp-senha">Senha provisória</label>
        <div class="senha-gerada"><input id="emp-senha" name="senha" maxlength="128" minlength="8" required autocomplete="off" spellcheck="false"><button type="button" class="btn btn-sec" id="gerar-senha">Gerar</button></div>
        <div class="dica">Mínimo de 8 caracteres. O Diretor troca no primeiro acesso.</div></div>
      <label class="marcar"><input type="checkbox" name="listada" checked> Aparece na lista de empresas da tela de entrada</label>`,
    aoAbrir: (dlg, form) => {
      let slugManual = false;
      form.elements.slug.addEventListener('input', () => { slugManual = true; });
      form.elements.nome.addEventListener('input', () => { if (!slugManual) form.elements.slug.value = sugerirSlug(form.elements.nome.value); });
      dlg.querySelector('#gerar-senha').addEventListener('click', () => { form.elements.senha.value = senhaProvisoria(); });
    },
    aoEnviar: async (d) => {
      const corpo = { nome: d.nome, sigla: d.sigla || null, slug: d.slug, diretor: d.diretor, email: d.email, senha: d.senha, listada_no_login: d.listada === 'on' };
      const r = await post('/plataforma/empresas', corpo);
      aoCriar();
      mostrarAcesso(r, d.senha);
    },
  });
}

function formEditar(e, aoSalvar) {
  abrirForm({
    titulo: 'Editar empresa',
    corpo: `<div class="campo"><label for="emp-nome">Nome da empresa</label><input id="emp-nome" name="nome" maxlength="160" required value="${esc(e.nome)}"></div>
      <div class="campo"><label for="emp-sigla">Sigla (opcional)</label><input id="emp-sigla" name="sigla" maxlength="12" value="${esc(e.sigla || '')}"></div>
      <p class="suave">O identificador <b>${esc(e.slug)}</b> não muda: ele está nos endereços já distribuídos.</p>`,
    aoEnviar: async (d) => { await patch(`/plataforma/empresas/${e.id}`, { nome: d.nome, sigla: d.sigla }); toast('Empresa atualizada.'); aoSalvar(); },
  });
}

export async function empresas(raiz, { refresh }) {
  const lista = await get('/plataforma/empresas');
  raiz.innerHTML = `
    <div class="cabeca"><div><h1>Empresas</h1>
      <div class="sub">Cada empresa tem os seus dados, o seu Diretor e a sua equipe. Aqui você cria empresas e controla o acesso; os dados de trabalho delas não aparecem para a plataforma.</div></div>
      <div class="acoes-topo"><button type="button" class="btn btn-primario" id="nova-empresa">Nova empresa</button></div></div>
    <div class="cartao">${lista.length ? `<table class="tabela-lista"><thead><tr><th>Empresa</th><th>Endereço de acesso</th><th>Contas ativas</th><th>Na lista da entrada</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map((e) => `<tr data-id="${e.id}">
        <td data-rotulo="Empresa"><b>${esc(e.nome)}</b>${e.sigla ? ` <span class="suave">(${esc(e.sigla)})</span>` : ''}<div class="suave pequeno">criada em ${dataBr(e.criada_em)}</div></td>
        <td data-rotulo="Endereço"><code>/?empresa=${esc(e.slug)}</code> <button type="button" class="btn btn-fantasma btn-mini" data-acao="copiar-link">Copiar link</button></td>
        <td data-rotulo="Contas ativas" class="num">${e.usuarios}</td>
        <td data-rotulo="Na lista"><span class="pilula ${e.listada_no_login ? 'st-concluida' : ''}">${e.listada_no_login ? 'Aparece' : 'Só pelo link'}</span></td>
        <td data-rotulo="Situação"><span class="pilula ${e.ativa ? 'st-concluida' : ''}">${e.ativa ? 'Ativa' : 'Desativada'}</span></td>
        <td class="linha" style="gap:4px;justify-content:flex-end;flex-wrap:wrap">
          <button type="button" class="btn btn-fantasma btn-mini" data-acao="editar">Editar</button>
          <button type="button" class="btn btn-fantasma btn-mini" data-acao="lista">${e.listada_no_login ? 'Tirar da lista' : 'Pôr na lista'}</button>
          <button type="button" class="btn ${e.ativa ? 'btn-perigo' : 'btn-fantasma'} btn-mini" data-acao="situacao">${e.ativa ? 'Desativar' : 'Reativar'}</button>
        </td></tr>`).join('')}</tbody></table>`
      : vazio('Nenhuma empresa cadastrada', 'Use "Nova empresa" para criar a primeira.')}</div>`;

  raiz.querySelector('#nova-empresa').addEventListener('click', () => formNova(refresh));
  on(raiz, 'click', '[data-acao]', async (el) => {
    const id = Number(el.closest('[data-id]').dataset.id);
    const e = lista.find((x) => x.id === id);
    try {
      switch (el.dataset.acao) {
        case 'copiar-link': await copiar(enderecoDe(e.slug), 'Link copiado.'); break;
        case 'editar': formEditar(e, refresh); break;
        case 'lista':
          await patch(`/plataforma/empresas/${id}`, { listada_no_login: !e.listada_no_login });
          toast(e.listada_no_login ? 'A empresa saiu da lista da entrada; ela entra pelo link.' : 'A empresa passou a aparecer na lista da entrada.');
          refresh(); break;
        case 'situacao': {
          if (e.ativa && !(await confirmar({ titulo: 'Desativar empresa', texto: `Todas as contas de ${e.nome} perdem o acesso na hora. Os dados ficam guardados e podem ser reativados.`, rotulo: 'Desativar empresa', perigo: true }))) return;
          await patch(`/plataforma/empresas/${id}`, { ativa: !e.ativa });
          toast(e.ativa ? 'Empresa desativada.' : 'Empresa reativada.');
          refresh(); break;
        }
      }
    } catch (ex) { toast(ex.message, 'erro'); }
  });
}
