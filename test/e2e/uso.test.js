// Uso das telas pela interface: cada abertura é contada uma vez (inclusive dentro das áreas da versão nova), recarregar a mesma tela não conta de novo,
// e o Diretor vê o relatório. A contagem é anônima e não atrapalha a navegação.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEFE_COF, DIRETOR, subir } from './ajuda.js';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const violacoes = (p, axe) => p.evaluate(async (js) => { eval(js); return (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`); }, axe);
/** Espera o aviso de abertura chegar ao servidor (ele é enviado sem esperar resposta) e devolve a contagem pedida. */
async function contagem(app, tela, perfil, versao, minimo = 1) {
  for (let i = 0; i < 40; i += 1) {
    const l = (await app.api(DIRETOR, 'GET', '/uso')).dados.linhas.find((x) => x.tela === tela && x.perfil === perfil && x.versao === versao);
    if (l && l.aberturas >= minimo) return l.aberturas;
    await pausa(150);
  }
  return 0;
}

test('Cada abertura de tela é contada uma vez, na versão certa, e recarregar a mesma tela não conta de novo', async (t) => {
  const app = await subir(t); if (!app) return;
  const p = await app.abrir(CHEFE_COF, '#/agenda');
  await p.waitForSelector('#cal-grade', { timeout: 10000 });
  assert.equal(await contagem(app, 'agenda', 'chefe', 'atual'), 1);
  // Gravar algo e recarregar a mesma tela não é uma nova abertura.
  await p.evaluate(() => { location.hash = '#/agenda?x=1'; });
  await pausa(800);
  assert.equal(await contagem(app, 'agenda', 'chefe', 'atual'), 1, 'a mesma tela, de novo, não soma');
  // Outra tela soma; voltar a uma tela já vista soma de novo (é uma nova abertura).
  await p.evaluate(() => { location.hash = '#/minhas-acoes'; });
  await p.waitForSelector('article.acao, .vazio', { timeout: 10000 });
  assert.equal(await contagem(app, 'minhas-acoes', 'chefe', 'atual'), 1);
  await p.evaluate(() => { location.hash = '#/agenda'; });
  assert.equal(await contagem(app, 'agenda', 'chefe', 'atual', 2), 2);

  // Versão nova: o que se conta é a tela de dentro da área (a aba), com a versão "nova", e o Hoje conta como o Início.
  await p.evaluate(() => localStorage.setItem('agilis:nova-interface', '1'));
  await p.reload({ waitUntil: 'networkidle0' }); // recarregar a página é uma nova abertura
  await p.waitForSelector('.abas-area', { timeout: 10000 });
  assert.equal(await contagem(app, 'agenda', 'chefe', 'nova'), 1);
  await p.evaluate(() => { location.hash = '#/a-acoes?t=diario'; });
  await p.waitForFunction(() => document.querySelector('.abas-area a[aria-current="page"]')?.textContent.trim() === 'Diário', { timeout: 10000 });
  assert.equal(await contagem(app, 'diario', 'chefe', 'nova'), 1);
  await p.evaluate(() => { location.hash = '#/a-hoje'; });
  await p.waitForSelector('#hoje-at-t', { timeout: 10000 });
  assert.equal(await contagem(app, 'inicio', 'chefe', 'nova'), 1);
  const telas = (await app.api(DIRETOR, 'GET', '/uso')).dados.linhas.map((l) => l.tela);
  assert.equal(telas.some((x) => x.startsWith('a-')), false, 'as áreas não entram na contagem, só as telas');
  assert.deepEqual(p.errosDaPagina, []);
});

test('Relatório do Diretor: lista as telas por abertura, separa as versões e aponta as que ninguém abriu; o chefe não o vê', async (t) => {
  const app = await subir(t); if (!app) return;
  const axe = fs.readFileSync(app.caminhoAxe, 'utf8');
  const c = await app.abrir(CHEFE_COF, '#/agenda');
  await c.waitForSelector('#cal-grade', { timeout: 10000 });
  await contagem(app, 'agenda', 'chefe', 'atual');
  await c.evaluate(() => { location.hash = '#/uso'; });
  await pausa(500);
  assert.match(await c.evaluate(() => location.hash), /#\/inicio/, 'o chefe é levado de volta ao início');

  const p = await app.abrir(DIRETOR, '#/painel');
  await p.waitForSelector('.grade', { timeout: 10000 });
  // Num monitor de 900 px de altura o fim do menu fica sob o quadro da conta (o menu rola); o clique vai direto no link.
  await p.evaluate(() => document.querySelector('.menu a[data-rota="uso"]').click());
  await p.waitForSelector('.tabela-lista', { timeout: 10000 });
  const texto = await p.$eval('#conteudo', (e) => e.innerText);
  assert.match(texto, /Agenda/);
  assert.match(texto, /Chefe\s+1/, 'quem abriu aparece só como perfil');
  assert.match(texto, /Ninguém abriu neste período/);
  assert.match(texto, /Contando desde/);
  assert.deepEqual(await violacoes(p, axe), [], 'o relatório não tem violações de acessibilidade');
  await p.select('#uso-periodo', '7');
  await p.waitForFunction(() => document.activeElement?.id === 'uso-periodo', { timeout: 5000 });
  assert.deepEqual(p.errosDaPagina, []);
});
