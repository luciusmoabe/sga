// Formatação simples da ata (negrito, itálico, listas): `ata_texto` continua sendo salvo como texto
// puro (sem HTML), com uma marcação leve inspirada em markdown. `blocosDaAta` e `segmentosInline` são a
// análise compartilhada entre a renderização em HTML (`atas.js`) e a montagem do PDF (`pdf-ata.js`), para
// as duas lerem a marcação do mesmo jeito. Compatível com atas antigas: sem marcação, vira parágrafo.

/** Divide o texto em blocos: parágrafo ({ tipo: 'p', texto }) ou lista ({ tipo: 'ul' | 'ol', itens }). */
export function ehTituloAta(texto) {
  return /^ATA\s+DA\s+REUNIÃO\b/i.test(segmentosInline(texto).map(s => s.texto).join('').trim());
}

// Os títulos estruturais seguem o modelo mesmo quando vêm dos registros sem marcação.
export function segmentosDaLinhaAta(linha) {
  const segmentos = segmentosInline(linha);
  const texto = segmentos.map(s => s.texto).join('');
  const secao = /^(Participantes|Decisões|(?:Novas )?[Aa]ções|Informações(?: e comunicados)?|Pedidos de novo prazo decididos|Impedimentos críticos em aberto):?\s*$/.test(texto.trim());
  const proxima = /^Próxima reunião:/.exec(texto);
  if (secao) return segmentos.map(s => ({ ...s, negrito: true }));
  if (!proxima) return segmentos;
  let restantes = proxima[0].length;
  return segmentos.flatMap(s => {
    if (!restantes) return [s];
    const n = Math.min(restantes, s.texto.length); restantes -= n;
    return [{ ...s, texto: s.texto.slice(0, n), negrito: true }, ...(n < s.texto.length ? [{ ...s, texto: s.texto.slice(n) }] : [])];
  });
}

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
  const texto = String(linha ?? '');
  const analisar = (inicio, marcador = '', negrito = false, italico = false, profundidade = 0) => {
    const segmentos = [];
    const adicionar = (t, n = negrito, i = italico) => {
      if (!t) return;
      const ultimo = segmentos.at(-1);
      if (ultimo?.negrito === n && ultimo.italico === i) ultimo.texto += t;
      else segmentos.push({ texto: t, negrito: n, italico: i });
    };
    let pos = inicio;
    while (pos < texto.length) {
      if (texto[pos] === '\\' && (/[\\*\-]/.test(texto[pos + 1] || '') || (pos === 0 && /^\d+[.)]\s/.test(texto.slice(pos + 1))))) {
        adicionar(texto[pos + 1]); pos += 2; continue;
      }
      if (marcador && texto.startsWith(marcador, pos)) return { segmentos, pos: pos + marcador.length, fechou: true };
      if (texto[pos] === '*' && profundidade < 8) {
        const marca = texto.startsWith('***', pos) ? '***' : texto.startsWith('**', pos) ? '**' : '*';
        const parte = analisar(pos + marca.length, marca, negrito || marca.length > 1, italico || marca.length !== 2, profundidade + 1);
        if (parte.fechou && parte.segmentos.length) {
          parte.segmentos.forEach(s => adicionar(s.texto, s.negrito, s.italico));
          pos = parte.pos; continue;
        }
        adicionar(marca); pos += marca.length; continue;
      }
      adicionar(texto[pos++]);
    }
    return { segmentos, pos, fechou: false };
  };
  return analisar(0).segmentos;
}
