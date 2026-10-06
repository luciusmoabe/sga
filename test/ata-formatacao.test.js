import test from 'node:test';
import assert from 'node:assert/strict';
import { blocosDaAta, segmentosInline } from '../public/js/ata-marcacao.js';
import { deltaDaAta, textoDaAta } from '../public/js/ata-documento.js';

test('negrito e itálico combinados são interpretados da mesma forma para leitura e PDF', () => {
  assert.deepEqual(segmentosInline('***Ambos*** **Forte *misto* forte**'), [
    { texto: 'Ambos', negrito: true, italico: true }, { texto: ' ', negrito: false, italico: false },
    { texto: 'Forte ', negrito: true, italico: false }, { texto: 'misto', negrito: true, italico: true },
    { texto: ' forte', negrito: true, italico: false },
  ]);
  assert.deepEqual(segmentosInline('**A*****B****C*').map(s => [s.texto, s.negrito, s.italico]), [['A', true, false], ['B', true, true], ['C', false, true]]);
});

test('editor carrega atas antigas e preserva linhas, parágrafos e formatos existentes', () => {
  const ata = 'ATA DA REUNIÃO\n\nInformações:\n- **Primeiro**\n- *Segundo*\n\n1. Item um\n2. ***Item dois***\n\nPróxima reunião: 13/10/2026.';
  assert.equal(textoDaAta(deltaDaAta(ata)), ata);
  assert.deepEqual(deltaDaAta('Texto simples').ops, [{ insert: 'Texto simples' }, { insert: '\n' }]);
});

test('listas do documento visual são salvas com numeração sequencial e podem alternar tipo', () => {
  const delta = { ops: [{ insert: 'Primeiro' }, { insert: '\n', attributes: { list: 'ordered' } },
    { insert: 'Segundo' }, { insert: '\n', attributes: { list: 'ordered' } },
    { insert: 'Marcador' }, { insert: '\n', attributes: { list: 'bullet' } },
    { insert: 'Recomeço' }, { insert: '\n', attributes: { list: 'ordered' } }] };
  const ata = textoDaAta(delta);
  assert.equal(ata, '1. Primeiro\n2. Segundo\n- Marcador\n1. Recomeço');
  assert.deepEqual(blocosDaAta(ata).map(b => b.tipo), ['ol', 'ul', 'ol']);
  assert.deepEqual(deltaDaAta(ata), delta);
});

test('asteriscos literais e parágrafos que começam com marcadores não viram formatação acidental', () => {
  const delta = { ops: [{ insert: '*literal* e C:\\Documentos\n- Parágrafo literal\n1. Também parágrafo\n' }] };
  const ata = textoDaAta(delta);
  const blocos = blocosDaAta(ata);
  assert.ok(blocos.every(b => b.tipo === 'p'));
  const textos = deltaDaAta(ata).ops.map(o => o.insert).join('');
  assert.equal(textos, delta.ops[0].insert);
  assert.ok(deltaDaAta(ata).ops.every(o => !o.attributes));
});

test('o conversor mantém HTML como texto e descarta objetos de mídia não suportados', () => {
  const delta = { ops: [{ insert: '<script>alert(1)</script>', attributes: { bold: true, italic: true } },
    { insert: { image: 'https://exemplo.test/imagem.png' } }, { insert: '\n' }] };
  const ata = textoDaAta(delta);
  assert.deepEqual(segmentosInline(ata), [{ texto: '<script>alert(1)</script>', negrito: true, italico: true }]);
  assert.doesNotMatch(ata, /imagem\.png/);
  assert.equal(segmentosInline('Marcação **incompleta').map(s => s.texto).join(''), 'Marcação **incompleta');
});
