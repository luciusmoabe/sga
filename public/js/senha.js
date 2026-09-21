// Troca da própria senha: tela obrigatória no primeiro acesso (senha inicial provisória) e diálogo voluntário.
import { post } from './api.js';
import { TAM_SENHA } from './regras.js';
import { abrirForm, toast } from './ui.js';

const CAMPOS = `
  <div class="campo"><label for="sn-atual">Senha atual</label><input id="sn-atual" name="senha_atual" type="password" autocomplete="current-password" maxlength="1024" required></div>
  <div class="campo"><label for="sn-nova">Nova senha</label><input id="sn-nova" name="senha_nova" type="password" autocomplete="new-password" minlength="${TAM_SENHA.min}" maxlength="${TAM_SENHA.max}" required>
    <div class="dica">De ${TAM_SENHA.min} a ${TAM_SENHA.max} caracteres. Use uma senha que só você conheça.</div></div>
  <div class="campo"><label for="sn-confirma">Repita a nova senha</label><input id="sn-confirma" name="confirmacao" type="password" autocomplete="new-password" maxlength="${TAM_SENHA.max}" required></div>`;

/** Valida no navegador o que a API também valida, para o erro aparecer sem ida ao servidor. */
function conferir(d) {
  if (!d.senha_atual) throw new Error('Informe a senha atual.');
  if (d.senha_nova.length < TAM_SENHA.min) throw new Error(`A nova senha deve ter ao menos ${TAM_SENHA.min} caracteres.`);
  if (d.senha_nova !== d.confirmacao) throw new Error('A confirmação não é igual à nova senha. Digite as duas de novo.');
  if (d.senha_nova === d.senha_atual) throw new Error('A nova senha precisa ser diferente da atual.');
}

async function enviar(d) {
  conferir(d);
  await post('/auth/trocar-senha', { senha_atual: d.senha_atual, senha_nova: d.senha_nova });
}

/** Tela cheia, sem menu: é a única coisa que a pessoa pode fazer até trocar a senha inicial. */
export function telaTrocaSenha(app, { aoConcluir, aoSair }) {
  document.body.classList.remove('tv');
  app.innerHTML = `<div class="entrada"><div class="entrada-caixa"><h1>Agilis</h1>
    <p class="lema">Crie a sua senha para continuar.</p>
    <div class="info" role="status">Você entrou com uma senha provisória, definida por quem cadastrou a sua conta. Crie agora uma senha só sua: ela não fica visível para mais ninguém.</div>
    <form id="form-troca" novalidate>${CAMPOS}
      <p id="troca-erro" role="alert" aria-live="polite"></p>
      <button class="btn btn-primario" type="submit">Salvar nova senha</button>
      <button class="btn btn-fantasma" type="button" id="troca-sair">Sair</button>
    </form></div></div>`;
  const form = app.querySelector('#form-troca');
  const erro = app.querySelector('#troca-erro');
  app.querySelector('#troca-sair').addEventListener('click', () => aoSair());
  app.querySelector('#sn-atual').focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const botao = form.querySelector('button[type=submit]');
    if (botao.disabled) return;
    botao.disabled = true;
    erro.textContent = '';
    const dados = Object.fromEntries(new FormData(form));
    try {
      await enviar(dados);
      toast('Senha alterada. Bem-vindo ao Agilis.');
      await aoConcluir();
    } catch (ex) {
      erro.textContent = ex.message;
      for (const c of form.querySelectorAll('input')) c.value = '';
      app.querySelector('#sn-atual').focus();
      botao.disabled = false;
    }
  });
}

/** Troca voluntária, pelo menu do usuário. As demais sessões da conta são encerradas. */
export function abrirTrocaSenha() {
  abrirForm({
    titulo: 'Alterar senha',
    corpo: `${CAMPOS}<p class="suave pequeno">Ao salvar, as suas outras sessões abertas em outros aparelhos serão encerradas.</p>`,
    rotulo: 'Salvar nova senha',
    aoEnviar: async (d, form) => {
      try { await enviar(d); toast('Senha alterada.'); }
      finally { for (const c of form.querySelectorAll('input[type=password]')) c.value = ''; }
    },
  });
}
