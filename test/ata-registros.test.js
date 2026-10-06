import test from 'node:test';
import assert from 'node:assert/strict';
import { integrarRegistrosAta } from '../server/ata-registros.js';
import { ehTituloAta } from '../public/js/ata-marcacao.js';
import { deltaDaAta, textoDaAta } from '../public/js/ata-documento.js';

test('registros entram em ata antiga com seções em negrito sem apagar a próxima reunião', () => {
  const original = '**ATA DA REUNIÃO SEMANAL — 05/10/2026 (segunda-feira)**\n\n**Decisões:**\n- Decisão original.\n\n**Novas ações:**\n- Ação original.\n\n**Próxima reunião:** terça-feira, 13/10/2026, às 16:00.';
  const pessoas = [{ nome: 'Zeta', secao_nome: 'Centro' }, { nome: 'Alfa' }];
  const infos = [{ texto: 'Primeira informação' }, { texto: 'Segunda informação' }];
  const nova = integrarRegistrosAta(original, pessoas, infos);
  assert.match(nova, /Participantes:\n- Zeta \(Centro\)\n- Alfa/);
  assert.ok(nova.indexOf('Informações:') > nova.indexOf('**Novas ações:**'));
  assert.ok(nova.indexOf('Informações:') < nova.indexOf('**Próxima reunião:**'));
  assert.match(nova, /Decisão original/);
  assert.match(nova, /Ação original/);
  assert.equal(integrarRegistrosAta(nova, pessoas, infos), nova);
});

test('seções sem dois-pontos e com negrito fora do dois-pontos não são duplicadas', () => {
  const antiga = 'ATA DA REUNIÃO SEMANAL\n\n**Participantes**\n- Antigo\n\n**Decisões**:\n- Decisão\n\n**Ações**:\n- Ação\n\n**Informações**:\n- Antiga\n\n**Próxima reunião:** amanhã.';
  const nova = integrarRegistrosAta(antiga, [{ nome: 'Novo' }], [{ texto: 'Nova' }]);
  assert.doesNotMatch(nova, /Antigo|Antiga/);
  assert.equal(nova.match(/Participantes/g).length, 1);
  assert.equal(nova.match(/Informações/g).length, 1);
  assert.match(nova, /\*\*Próxima reunião:\*\* amanhã/);
});

test('título da ata fica centralizado no documento visual e mantém texto ao salvar', () => {
  const texto = '**ATA\u00a0DA\u00a0REUNIÃO\u00a0SEMANAL — 05/10/2026 (segunda-feira)**\n\nDecisões:\n- Exemplo';
  assert.equal(ehTituloAta(texto.split('\n')[0]), true);
  assert.equal(ehTituloAta('Decisões:'), false);
  const delta = deltaDaAta(texto);
  assert.equal(delta.ops.find(op => op.insert === '\n').attributes.align, 'center');
  assert.equal(textoDaAta(delta), texto.replace('Decisões:', '**Decisões:**'));
});
