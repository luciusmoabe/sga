import { get, put } from './api.js';
import { esc, toast } from './ui.js';

export function htmlCabecalhoAta(config) {
  return `<div class="ata-cabecalho"><img src="/imagens/brasao_PMBA.png" alt="Brasão da PMBA"><div>${esc(config.ata_cabecalho || '').replace(/\n/g, '<br>')}</div>${config.ata_brasao ? `<img src="${esc(config.ata_brasao)}" alt="Brasão da unidade">` : '<span></span>'}</div>`;
}

export async function carregarCabecalhoAta() { return get('/config'); }

export async function configuracaoAta(raiz) {
  const config = await carregarCabecalhoAta();
  raiz.innerHTML = '<div class="cabeca"><h1>Configuração</h1></div><div class="cartao" id="config-ata"></div>';
  ligarConfiguracaoAta(raiz, config);
}

async function imagemPng(arquivo) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(arquivo.type) || arquivo.size > 5 * 1024 * 1024) throw new Error('Escolha uma imagem PNG, JPEG ou WebP com até 5 MB.');
  const data = await new Promise((ok, fail) => {
    const leitor = new FileReader(); leitor.onload = () => ok(leitor.result); leitor.onerror = () => fail(new Error('Não foi possível ler a imagem.')); leitor.readAsDataURL(arquivo);
  });
  const img = new Image(); img.src = data; await img.decode();
  if (img.naturalWidth > 10000 || img.naturalHeight > 10000) throw new Error('A imagem deve ter até 10.000 pixels por dimensão.');
  const escala = Math.min(1, 360 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * escala)); canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL('image/png');
  if (png.length > 163862) throw new Error('A imagem ficou grande demais. Escolha um brasão mais simples ou menor.');
  return png;
}

export function ligarConfiguracaoAta(raiz, config) {
  const area = raiz.querySelector('#config-ata');
  let brasao = config.ata_brasao || '';
  area.innerHTML = `<h2>Cabeçalho da Ata de Reunião</h2><p class="suave">O brasão da PMBA fica à esquerda e o brasão cadastrado à direita. O cabeçalho aparece na ata e no PDF.</p><form id="form-cabecalho-ata"><div class="campo"><label for="ata-cabecalho-texto">Texto do cabeçalho</label><textarea id="ata-cabecalho-texto" maxlength="1500" rows="6" placeholder="Instituição&#10;Unidade&#10;Ata de Reunião">${esc(config.ata_cabecalho || '')}</textarea></div><div class="campo"><label for="ata-brasao-arquivo">Brasão do lado direito</label><input id="ata-brasao-arquivo" type="file" accept="image/png,image/jpeg,image/webp"><small>PNG, JPEG ou WebP, até 5 MB.</small></div><div class="linha"><button type="button" class="btn btn-sec" data-remover-brasao>Remover brasão da direita</button><button type="submit" class="btn btn-primario">Salvar cabeçalho</button></div><p class="erro-form oculto" role="alert"></p></form><h3>Pré-visualização</h3><div data-previa-cabecalho></div>`;
  const form = area.querySelector('form'), texto = area.querySelector('textarea'), arquivo = area.querySelector('input');
  const erro = area.querySelector('[role=alert]');
  const mostrarErro = e => { erro.textContent = e.message; erro.classList.remove('oculto'); };
  const previa = () => { area.querySelector('[data-previa-cabecalho]').innerHTML = htmlCabecalhoAta({ ata_cabecalho: texto.value, ata_brasao: brasao }); };
  texto.addEventListener('input', previa);
  area.querySelector('[data-remover-brasao]').addEventListener('click', () => { brasao = ''; arquivo.value = ''; previa(); });
  form.addEventListener('submit', async ev => {
    ev.preventDefault(); erro.classList.add('oculto');
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const novo = arquivo.files[0] ? await imagemPng(arquivo.files[0]) : brasao;
      const salva = await put('/config/ata', { ata_cabecalho: texto.value, ata_brasao: novo });
      Object.assign(config, salva); brasao = salva.ata_brasao; arquivo.value = ''; previa(); toast('Cabeçalho da ata salvo.');
    } catch (e) { mostrarErro(e); } finally { btn.disabled = false; }
  });
  previa();
}
