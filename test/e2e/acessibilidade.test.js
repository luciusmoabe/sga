// Acessibilidade automática (axe-core, WCAG 2.0/2.1 A e AA) nas telas principais, no computador e no celular.
// O axe acha cerca de um terço dos problemas possíveis: isto é uma rede de proteção contra regressões, não um laudo.
//
// Regra do teste: nenhuma violação nova. `CONHECIDAS` guarda o que já existia quando o teste foi criado (regra do axe + tela),
// para ser corrigido aos poucos; toda violação que não esteja ali derruba o teste. Ao corrigir uma, remova-a da lista.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEFE_COF, DIRETOR, subir } from './ajuda.js';

const TELAS_DIRETOR = ['painel', 'direcionar', 'acoes', 'prazos', 'combinados', 'reunioes', 'agenda', 'produtividade', 'avisos', 'estrutura', 'reuniao'];
const TELAS_CHEFE = ['inicio', 'minhas-acoes', 'atualizacao', 'agenda', 'equipe', 'historico', 'combinados'];

// "regra@tela": violações que já existiam. Preenchida depois da primeira execução (veja a mensagem de falha do teste).
const CONHECIDAS = new Set([
]);

async function auditar(app, p) {
  await p.evaluate(fs.readFileSync(app.caminhoAxe, 'utf8')); // injeta o axe direto no contexto da página (a CSP do sistema não é afrouxada)
  return p.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return r.violations.map((v) => ({ regra: v.id, impacto: v.impact, nos: v.nodes.length, exemplo: v.nodes[0]?.target?.join(' ') }));
  });
}

async function percorrer(t, uid, telas, opcoes, rotulo) {
  const app = await subir(t); if (!app) return;
  const novas = [], conhecidas = [];
  for (const tela of telas) {
    const p = await app.abrir(uid, `#/${tela}`, opcoes);
    await new Promise((r) => setTimeout(r, 400)); // deixa a tela terminar de montar
    for (const v of await auditar(app, p)) {
      const chave = `${v.regra}@${tela}`;
      (CONHECIDAS.has(chave) ? conhecidas : novas).push({ chave, ...v });
    }
    await p.close();
  }
  if (conhecidas.length) t.diagnostic(`${rotulo}: ${conhecidas.length} violações conhecidas ainda por corrigir`);
  const linhas = novas.map((v) => `  '${v.chave}', // ${v.impacto}, ${v.nos} elemento(s), ex.: ${v.exemplo}`);
  assert.equal(novas.length, 0, `${rotulo}: violações de acessibilidade não previstas:\n${linhas.join('\n')}`);
}

test('acessibilidade: telas do Diretor no computador', async (t) => percorrer(t, DIRETOR, TELAS_DIRETOR, {}, 'Diretor (computador)'));
test('acessibilidade: telas do Chefe no computador', async (t) => percorrer(t, CHEFE_COF, TELAS_CHEFE, {}, 'Chefe (computador)'));
test('acessibilidade: telas do Chefe no celular', async (t) => percorrer(t, CHEFE_COF, TELAS_CHEFE, { largura: 390, altura: 844, celular: true }, 'Chefe (celular)'));
