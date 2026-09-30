// Formatação simples da ata (negrito, itálico, listas): `ata_texto` continua sendo salvo como texto
// puro (sem HTML), com uma marcação leve inspirada em markdown. `blocosDaAta` e `segmentosInline` são a
// análise compartilhada entre a renderização em HTML (`atas.js`) e a montagem do PDF (`pdf-ata.js`), para
// as duas lerem a marcação do mesmo jeito. Compatível com atas antigas: sem marcação, vira parágrafo.

/** Divide o texto em blocos: parágrafo ({ tipo: 'p', texto }) ou lista ({ tipo: 'ul' | 'ol', itens }). */
export function blocosDaAta(texto) {
  const linhas = String(texto ?? '').split('\n');
  const blocos = [];
  let lista = null;
  const fecharLista = () => { if (lista) { blocos.push(lista); lista = null; } };
  for (const linha of linhas) {
    const marcador = /^[-*]\s+(.*)$/.exec(linha);
    const numerado = /^\d+[.)]\s+(.*)$/.exec(linha);
    if (marcador) {
      if (lista?.tipo !== 'ul') { fecharLista(); lista = { tipo: 'ul', itens: [] }; }
      lista.itens.push(marcador[1]);
    } else if (numerado) {
      if (lista?.tipo !== 'ol') { fecharLista(); lista = { tipo: 'ol', itens: [] }; }
      lista.itens.push(numerado[1]);
    } else {
      fecharLista();
      blocos.push({ tipo: 'p', texto: linha });
    }
  }
  fecharLista();
  return blocos;
}

// Quebra uma linha em trechos { texto, negrito, italico }, pela mesma marcação (**negrito**, *itálico*);
// o PDF usa isso para trocar a fonte por trecho (não entende HTML como o navegador).
export function segmentosInline(linha) {
  const brutos = [];
  let pos = 0;
  const reNegrito = /\*\*(.+?)\*\*/g;
  let m;
  while ((m = reNegrito.exec(linha))) {
    if (m.index > pos) brutos.push({ texto: linha.slice(pos, m.index), negrito: false });
    brutos.push({ texto: m[1], negrito: true });
    pos = m.index + m[0].length;
  }
  if (pos < linha.length) brutos.push({ texto: linha.slice(pos), negrito: false });
  const finais = [];
  for (const parte of brutos) {
    if (parte.negrito) { finais.push({ texto: parte.texto, negrito: true, italico: false }); continue; }
    let p2 = 0;
    const reItalico = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g;
    let m2;
    while ((m2 = reItalico.exec(parte.texto))) {
      if (m2.index > p2) finais.push({ texto: parte.texto.slice(p2, m2.index), negrito: false, italico: false });
      finais.push({ texto: m2[1], negrito: false, italico: true });
      p2 = m2.index + m2[0].length;
    }
    if (p2 < parte.texto.length) finais.push({ texto: parte.texto.slice(p2), negrito: false, italico: false });
  }
  return finais.filter((s) => s.texto !== '');
}
