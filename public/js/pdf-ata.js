// Gera o PDF da ata inteiramente no navegador: só o texto do campo da ata, nada mais da tela.
// window.print() não permite margem, papel e rodapé com numeração de página controlados pela página (o
// CSS de impressão do navegador não tem esse alcance); por isso usamos jsPDF, vendorizado localmente em
// public/js/vendor (sem CDN, licença MIT) e carregado só quando o botão "Baixar PDF" é clicado, para não
// pesar o carregamento do app para quem não usa o recurso.
import { blocosDaAta, segmentosInline } from './ata-marcacao.js';
import { br } from './ui.js';

const MARGEM_ESQ = 25; // mm (2,5 cm), pedido do Diretor
const MARGEM = 20;     // mm (2 cm nas demais margens)
const FONTE = 'helvetica';
const TAM_TEXTO = 11;
const TAM_RODAPE = 8.5;
const ALTURA_LINHA = 5.6; // mm, ~1.4x o corpo de 11pt
const RECUO_LISTA = 6;    // mm, do marcador até o texto do item

let carregando;
function carregarJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  carregando ??= new Promise((resolver, rejeitar) => {
    const s = document.createElement('script');
    s.src = '/js/vendor/jspdf.umd.min.js';
    s.onload = () => (window.jspdf?.jsPDF ? resolver(window.jspdf.jsPDF) : rejeitar(new Error('Gerador de PDF indisponível.')));
    s.onerror = () => rejeitar(new Error('Não foi possível carregar o gerador de PDF.'));
    document.head.appendChild(s);
  });
  return carregando;
}

function fonteDoTrecho(negrito, italico) {
  if (negrito && italico) return 'bolditalic';
  if (negrito) return 'bold';
  if (italico) return 'italic';
  return 'normal';
}

/** Escreve um parágrafo (lista de trechos com estilo) a partir de (x, y), quebrando linha por largura e
 *  trocando de página quando o texto passa do limite inferior. Devolve o y logo abaixo do parágrafo. */
function escreverParagrafo(doc, segmentos, x, y, larguraDisponivel, limiteInferior) {
  const palavras = [];
  for (const seg of segmentos) {
    for (const parte of seg.texto.split(/(\s+)/).filter((p) => p !== '')) {
      palavras.push({ texto: parte, negrito: seg.negrito, italico: seg.italico });
    }
  }
  if (!palavras.length) return y + ALTURA_LINHA; // linha em branco: só abre espaço

  let cursorX = x;
  let linhaVazia = true;
  const novaLinha = () => {
    cursorX = x;
    y += ALTURA_LINHA;
    linhaVazia = true;
    if (y > limiteInferior) { doc.addPage(); y = MARGEM; }
  };
  for (const p of palavras) {
    if (/^\s+$/.test(p.texto)) {
      if (!linhaVazia) { doc.setFont(FONTE, 'normal'); cursorX += doc.getTextWidth(' '); }
      continue;
    }
    doc.setFont(FONTE, fonteDoTrecho(p.negrito, p.italico));
    const largura = doc.getTextWidth(p.texto);
    if (!linhaVazia && cursorX + largura > x + larguraDisponivel) novaLinha();
    doc.text(p.texto, cursorX, y);
    cursorX += largura;
    linhaVazia = false;
  }
  y += ALTURA_LINHA;
  if (y > limiteInferior) { doc.addPage(); y = MARGEM; }
  return y;
}

/** Monta e baixa o PDF da ata (`ataTexto`, na mesma marcação leve usada na tela). `dataReuniao` (ISO)
 *  é opcional e só aparece no rodapé e no nome do arquivo. */
export async function baixarPdfAta(ataTexto, { dataReuniao, cabecalho = {} } = {}) {
  const jsPDF = await carregarJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
  const larguraDisponivel = larguraPagina - MARGEM_ESQ - MARGEM;
  const limiteInferior = alturaPagina - MARGEM - 6; // reserva espaço pro rodapé não colidir com o texto

  doc.setFontSize(TAM_TEXTO);
  doc.setTextColor(20, 30, 24);
  let y = MARGEM;
  const pmba = new Image(); pmba.src = '/imagens/brasao_PMBA.png';
  await pmba.decode();
  const brasoes = [{ imagem: pmba, x: MARGEM_ESQ }];
  if (cabecalho.ata_brasao) {
    const direita = new Image(); direita.src = cabecalho.ata_brasao; await direita.decode();
    brasoes.push({ imagem: direita, x: larguraPagina - MARGEM - 22 });
  }
  for (const { imagem, x } of brasoes) {
    const escala = Math.min(22 / imagem.naturalWidth, 28 / imagem.naturalHeight);
    const w = imagem.naturalWidth * escala, h = imagem.naturalHeight * escala;
    doc.addImage(imagem, 'PNG', x + (22 - w) / 2, y, w, h);
  }
  doc.setFont(FONTE, 'bold'); doc.setFontSize(10);
  const linhasCabecalho = doc.splitTextToSize(cabecalho.ata_cabecalho || '', larguraDisponivel - 54);
  if (linhasCabecalho.length) doc.text(linhasCabecalho, MARGEM_ESQ + larguraDisponivel / 2, y + 4, { align: 'center' });
  y += Math.max(28, linhasCabecalho.length * 4.1) + 10;
  doc.setFont(FONTE, 'normal'); doc.setFontSize(TAM_TEXTO);
  for (const b of blocosDaAta(ataTexto)) {
    if (b.tipo === 'p') {
      y = escreverParagrafo(doc, segmentosInline(b.texto), MARGEM_ESQ, y, larguraDisponivel, limiteInferior);
    } else {
      b.itens.forEach((item, i) => {
        doc.setFont(FONTE, 'normal');
        doc.text(b.tipo === 'ul' ? '•' : `${i + 1}.`, MARGEM_ESQ, y);
        y = escreverParagrafo(doc, segmentosInline(item), MARGEM_ESQ + RECUO_LISTA, y, larguraDisponivel - RECUO_LISTA, limiteInferior);
      });
    }
    y += 1.5; // respiro entre parágrafos e listas
  }

  // Rodapé em todas as páginas: numeração e a reunião a que a ata se refere, só depois de saber o total.
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(200, 208, 200);
    doc.line(MARGEM_ESQ, alturaPagina - MARGEM + 2, larguraPagina - MARGEM, alturaPagina - MARGEM + 2);
    doc.setFont(FONTE, 'normal');
    doc.setFontSize(TAM_RODAPE);
    doc.setTextColor(110, 120, 112);
    if (dataReuniao) doc.text(`Ata da reunião de ${br(dataReuniao)} · Agilis`, MARGEM_ESQ, alturaPagina - MARGEM + 6);
    doc.text(`Página ${i} de ${total}`, larguraPagina - MARGEM, alturaPagina - MARGEM + 6, { align: 'right' });
  }

  doc.save(dataReuniao ? `ata-${dataReuniao}.pdf` : 'ata.pdf');
}
