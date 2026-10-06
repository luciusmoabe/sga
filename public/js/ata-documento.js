// Conversão entre o documento visual e a marcação textual já usada pelas atas e pelo PDF.
import { blocosDaAta, segmentosInline, ehTituloAta } from './ata-marcacao.js';

export function deltaDaAta(texto) {
  const ops = [];
  const linha = (t, lista) => {
    for (const s of segmentosInline(t)) {
      const attributes = { ...(s.negrito ? { bold: true } : {}), ...(s.italico ? { italic: true } : {}) };
      ops.push({ insert: s.texto, ...(Object.keys(attributes).length ? { attributes } : {}) });
    }
    ops.push({ insert: '\n', ...(lista ? { attributes: { list: lista } } : ehTituloAta(t) ? { attributes: { align: 'center' } } : {}) });
  };
  for (const b of blocosDaAta(texto)) {
    if (b.tipo === 'p') linha(b.texto);
    else b.itens.forEach(t => linha(t, b.tipo === 'ol' ? 'ordered' : 'bullet'));
  }
  return { ops };
}

export function textoDaAta(delta) {
  const linhas = [];
  let trechos = [], numero = 0;
  const adicionar = (texto, attributes) => {
    if (!texto) return;
    const n = !!attributes?.bold, i = !!attributes?.italic;
    const ultimo = trechos.at(-1);
    if (ultimo?.negrito === n && ultimo.italico === i) ultimo.texto += texto;
    else trechos.push({ texto, negrito: n, italico: i });
  };
  const fechar = (lista) => {
    let texto = trechos.map(s => {
      const escapado = s.texto.replace(/[\\*]/g, '\\$&');
      const marca = s.negrito && s.italico ? '***' : s.negrito ? '**' : s.italico ? '*' : '';
      return marca ? escapado.replace(/^(\s*)(.*?)(\s*)$/, (_, a, t, b) => t ? `${a}${marca}${t}${marca}${b}` : escapado) : escapado;
    }).join('');
    if (lista === 'ordered') texto = `${++numero}. ${texto}`;
    else {
      numero = 0;
      if (lista === 'bullet') texto = `- ${texto}`;
      else if (/^[-*]\s|^\d+[.)]\s/.test(texto)) texto = '\\' + texto;
    }
    linhas.push(texto); trechos = [];
  };
  for (const op of delta?.ops || []) {
    if (typeof op.insert !== 'string') continue;
    const partes = op.insert.split('\n');
    partes.forEach((t, i) => { adicionar(t, op.attributes); if (i < partes.length - 1) fechar(op.attributes?.list); });
  }
  if (trechos.length) fechar();
  return linhas.join('\n');
}
