// Glossário do Agilis (docs/glossario-proposta.md, aprovado): um nome para cada coisa na interface, nos textos do servidor e no guia.
// O teste procura os nomes antigos e reprova se algum voltar. Os nomes de código (relatoHTML, itensDoRelato, `relato.js`, `reuniao_informacoes`) não contam:
// só o texto que alguém lê. As atas antigas continuam sendo lidas com o título de antes (`Informações`), por isso dois arquivos ficam de fora.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const lista = async (dir, ok = () => true) => (await readdir(join(RAIZ, dir))).filter(ok).map((f) => `${dir}/${f}`);
const ARQUIVOS = [
  ...await lista('public/js', (f) => f.endsWith('.js')),
  ...await lista('server', (f) => f.endsWith('.js') && !/^relato|-relato\.js$/.test(f)),
  'docs/guia-do-usuario.md', 'docs/tutorial.md', 'docs/regras-de-negocio.md', 'scripts/guia/conteudo.mjs',
];
// Quem lê o título antigo de atas já gravadas.
const LE_ATA_ANTIGA = new Set(['public/js/ata-marcacao.js', 'server/ata-registros.js']);

const PROIBIDOS = [
  [/\b(?:O|o|do|no|um|este|os|dos|nos) relatos?\b/, '"relato" some da interface: use "atualização"'],
  [/\brelatos? semanais?\b/i, '"relato semanal" é "atualização semanal"'],
  [/\brelato oral\b/, '"relato oral" é "apresentação oral"'],
  [/[Aa]visos no celular/, '"Avisos no celular" é "Notificações no celular"'],
  [/Versão para impressão/, '"Versão para impressão" é "Pauta impressa"'],
  [/Informações e comunicados/, '"Informações e comunicados" é "Informes"', true],
  [/\bações? paradas?\b/, '"ação parada" é "ação sem movimento"'],
  [/<th>Paradas<\/th>/, '"Paradas" é "Sem movimento"'],
  [/paradas? há 7/, '"paradas há 7+ dias" é "sem movimento há 7+ dias"'],
  [/\(atrasada, parada, carga alta\)/, '"parada" é "sem movimento" nos sinais da carga'],
];

test('os nomes antigos do glossário não aparecem nos textos da interface, do servidor e do guia', async () => {
  const achados = [];
  for (const arq of ARQUIVOS) {
    const linhas = (await readFile(join(RAIZ, arq), 'utf8')).split(/\r?\n/);
    linhas.forEach((linha, i) => {
      for (const [rx, regra, soAta] of PROIBIDOS) {
        if (soAta && LE_ATA_ANTIGA.has(arq)) continue;
        if (rx.test(linha)) achados.push(`${arq}:${i + 1}: ${regra}\n    ${linha.trim().slice(0, 140)}`);
      }
    });
  }
  assert.deepEqual(achados, [], `nomes fora do glossário:\n${achados.join('\n')}`);
});

test('o título novo das atas é "Informes", e as atas antigas, com "Informações", ainda são reconhecidas', async () => {
  const { aplicarRegistros } = await import('../server/ata-registros.js').catch(() => ({}));
  void aplicarRegistros; // o comportamento está em test/ata-registros.test.js; aqui só a presença dos dois títulos nos leitores
  for (const arq of ['public/js/ata-marcacao.js', 'server/ata-registros.js']) {
    const s = await readFile(join(RAIZ, arq), 'utf8');
    assert.match(s, /Informes/, `${arq} reconhece o título novo`);
    assert.match(s, /Informações/, `${arq} ainda reconhece o título de antes`);
  }
});
