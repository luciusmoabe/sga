import { deltaDaAta, textoDaAta } from './ata-documento.js';
import { esc } from './ui.js';

let carregando;
function carregarEditor() {
  carregando ??= Promise.all([
    new Promise((ok, fail) => {
      if (window.Quill) { ok(); return; }
      const script = document.createElement('script'); script.src = '/js/vendor/quill-2.0.3.js';
      script.onload = ok; script.onerror = () => fail(new Error('Não foi possível carregar o editor da ata.'));
      document.head.append(script);
    }),
    new Promise((ok, fail) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/js/vendor/quill-2.0.3.snow.css';
      css.onload = ok; css.onerror = () => fail(new Error('Não foi possível carregar a formatação da ata.'));
      document.head.append(css);
    }),
  ]).catch(e => { carregando = null; throw e; });
  return carregando;
}

export const campoEditorAta = (texto) => `<div class="ata-editor nao-imprimir">
  <div id="ata-ferramentas" class="ata-ferramentas" role="toolbar" aria-label="Formatação da ata">
    <span class="ql-formats"><button type="button" class="ql-bold" title="Negrito (Ctrl+B)" aria-label="Negrito"></button><button type="button" class="ql-italic" title="Itálico (Ctrl+I)" aria-label="Itálico"></button></span>
    <span class="ql-formats"><button type="button" class="ql-list" value="bullet" title="Lista com marcadores" aria-label="Lista com marcadores"></button><button type="button" class="ql-list" value="ordered" title="Lista numerada" aria-label="Lista numerada"></button></span>
    <span class="ql-formats"><button type="button" class="ql-clean" title="Remover formatação" aria-label="Remover formatação"></button></span>
    <span class="ql-formats"><button type="button" class="ql-undo" title="Desfazer (Ctrl+Z)" aria-label="Desfazer">↶</button><button type="button" class="ql-redo" title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer">↷</button></span>
  </div><div id="ata-visual"></div>
  <textarea hidden class="oculto" id="ata" aria-label="Texto da ata">${esc(texto || '')}</textarea>
  <p class="suave pequeno">Selecione o texto e use os botões para formatar. A aparência será mantida na ata publicada e no PDF.</p>
</div>`;

export async function ligarEditorAta(raiz, atualizarPrevia) {
  await carregarEditor();
  const area = raiz.querySelector('#ata');
  const quill = new window.Quill(raiz.querySelector('#ata-visual'), {
    theme: 'snow', formats: ['bold', 'italic', 'list', 'align'],
    modules: { toolbar: { container: raiz.querySelector('#ata-ferramentas'), handlers: {
      undo() { this.quill.history.undo(); }, redo() { this.quill.history.redo(); },
    } }, history: { userOnly: true } },
  });
  quill.root.setAttribute('role', 'textbox'); quill.root.setAttribute('aria-multiline', 'true');
  quill.root.setAttribute('aria-label', 'Texto da ata'); quill.root.setAttribute('spellcheck', 'true');
  quill.setContents(deltaDaAta(area.value), 'silent'); quill.history.clear();
  quill.on('text-change', () => {
    area.value = textoDaAta(quill.getContents());
    atualizarPrevia(area.value);
  });
  return { definirTexto(texto) {
    area.value = texto;
    quill.setContents(deltaDaAta(texto), 'silent');
    quill.history.clear(); atualizarPrevia(texto);
  }, texto() {
    if (area.value.length > 20000) throw new Error('A ata ultrapassou o limite de 20.000 caracteres. Reduza o texto antes de salvar.');
    return area.value;
  } };
}
