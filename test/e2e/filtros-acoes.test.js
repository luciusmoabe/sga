// "Minhas ações": busca, atalhos de atenção com contagem, ordenação lembrada, estado vazio, acessibilidade e celular.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEFE_COF, subir } from './ajuda.js';

const titulos = (p) => p.$$eval('article.acao h3', (hs) => hs.map((h) => h.textContent));
const chip = (p, id) => p.$eval(`[data-atalho="${id}"]`, (b) => ({ texto: b.textContent.replace(/\s+/g, ' ').trim(), pressionado: b.getAttribute('aria-pressed') }));
const resultado = (p) => p.$eval('.ma-resultado', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);

test('Minhas ações: busca, atalhos com contagem, limpar, ordenação lembrada e estado vazio', async (t) => {
  const app = await subir(t); if (!app) return;
  const axe = fs.readFileSync(app.caminhoAxe, 'utf8');
  const todas = (await app.api(CHEFE_COF, 'GET', '/acoes?situacao=abertas')).dados;
  assert.equal(todas.length, 2, 'o chefe do COF começa com 2 ações abertas (dados de demonstração)');
  const atrasadas = todas.filter((a) => a.atrasada).length;
  const novas = todas.filter((a) => a.nova).length;

  const p = await app.abrir(CHEFE_COF, '#/minhas-acoes');
  await p.waitForSelector('article.acao');
  assert.equal((await titulos(p)).length, 2);
  assert.equal(await resultado(p), null, 'sem filtro, não há linha de resultado');
  // Atalhos só aparecem para o que existe, com a contagem.
  assert.match((await chip(p, 'atrasadas')).texto, new RegExp(`Atrasadas ${atrasadas}`));
  assert.match((await chip(p, 'novas')).texto, new RegExp(`Novas ${novas}`));
  assert.equal(await p.$('[data-atalho="impedimento"]'), null, 'sem impedimento, sem atalho');

  // Busca digitada: o foco e o texto inteiro sobrevivem aos redesenhos; "plano" acha uma ação, sem acento ou maiúscula.
  await p.click('#ma-busca');
  await p.keyboard.type('PLANO', { delay: 60 });
  await p.waitForFunction(() => document.querySelectorAll('article.acao').length === 1, { timeout: 4000 });
  assert.equal(await p.evaluate(() => document.activeElement.id), 'ma-busca', 'a busca continua com o foco');
  assert.equal(await p.$eval('#ma-busca', (i) => i.value), 'PLANO', 'o texto digitado não se perde');
  assert.match((await titulos(p))[0], /plano de trabalho/i);
  assert.match(await resultado(p), /Mostrando 1 de 2/);
  assert.match(await p.$eval('[data-aba="ativas"]', (b) => b.textContent), /Todas ativas \(1\)/, 'as abas mostram a contagem filtrada');

  // Sem resultado: mensagem própria, com como sair.
  await p.keyboard.type('zzz');
  await p.waitForFunction(() => document.querySelectorAll('article.acao').length === 0, { timeout: 4000 });
  assert.match(await p.evaluate(() => document.querySelector('#conteudo').innerText), /Nenhuma ação com esses filtros/);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'ma-busca');

  // Esc limpa a busca.
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => document.querySelectorAll('article.acao').length === 2, { timeout: 4000 });
  assert.equal(await p.$eval('#ma-busca', (i) => i.value), '');

  // Atalho: marca, filtra, mostra "Limpar filtros" e passa no axe com o estado marcado.
  await p.click('[data-atalho="atrasadas"]');
  await p.waitForFunction(() => document.querySelectorAll('article.acao').length === 1);
  assert.equal((await chip(p, 'atrasadas')).pressionado, 'true');
  assert.equal(await p.evaluate(() => document.activeElement.dataset.atalho), 'atrasadas', 'o foco volta ao atalho');
  await p.evaluate(axe);
  const violacoes = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
  assert.deepEqual(violacoes, [], 'Minhas ações com filtros sem violações de acessibilidade');
  await p.click('[data-limpar]');
  await p.waitForFunction(() => document.querySelectorAll('article.acao').length === 2);
  assert.equal(await resultado(p), null);

  // A ordem escolhida é lembrada neste navegador.
  const esperada = [...todas].sort((x, y) => y.criada_em.localeCompare(x.criada_em) || y.id - x.id).map((a) => a.titulo);
  await p.select('#ma-ordem', 'recentes');
  await p.waitForFunction((n) => document.querySelectorAll('article.acao').length === n, {}, 2);
  assert.deepEqual(await titulos(p), esperada, 'mais recentes primeiro');
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('article.acao');
  assert.equal(await p.$eval('#ma-ordem', (s) => s.value), 'recentes');
  assert.deepEqual(await titulos(p), esperada);
  assert.deepEqual(p.errosDaPagina, []);
});

test('Minhas ações no celular: a barra de filtros cabe na tela e os atalhos rolam na horizontal', async (t) => {
  const app = await subir(t); if (!app) return;
  const p = await app.abrir(CHEFE_COF, '#/minhas-acoes', { largura: 390, altura: 844, celular: true });
  await p.waitForSelector('.ma-filtros');
  const medidas = await p.evaluate(() => ({ pagina: document.documentElement.scrollWidth, janela: innerWidth, busca: document.querySelector('#ma-busca').getBoundingClientRect().width, chip: document.querySelector('.ma-chip')?.getBoundingClientRect().height ?? 0 }));
  assert.ok(medidas.pagina <= medidas.janela, `sem rolagem horizontal da página (${medidas.pagina} > ${medidas.janela})`);
  assert.ok(medidas.busca > 250, 'a busca ocupa a largura');
  assert.ok(medidas.chip >= 44, 'alvo de toque de 44 px ou mais');
  // No celular, a ordenação e os filtros ficam atrás do botão "Filtros": recolhidos por padrão, abrem e fecham.
  assert.equal(await p.$eval('#ma-ordem', (e) => getComputedStyle(e).display === 'none' || getComputedStyle(e.closest('.ma-ordem')).display === 'none'), true, 'a ordem da barra some no celular');
  assert.equal(await p.$eval('#ma-painel', (e) => e.hidden), true, 'painel recolhido por padrão');
  await p.click('[data-alternar-painel]');
  assert.equal(await p.$eval('[data-alternar-painel]', (b) => b.getAttribute('aria-expanded')), 'true');
  assert.equal(await p.$eval('#ma-painel', (e) => e.hidden), false, 'painel aberto');
  assert.notEqual(await p.$eval('#ma-ordem-painel', (e) => getComputedStyle(e.closest('.ma-ordem-painel')).display), 'none', 'a ordenação passa a estar no painel');
  assert.equal(await p.evaluate(() => document.activeElement.dataset.alternarPainel !== undefined), true, 'o foco fica no botão');
  const pc = await app.abrir(CHEFE_COF, '#/minhas-acoes');
  await pc.waitForSelector('.ma-filtros');
  assert.equal(await pc.$eval('#ma-ordem', (e) => getComputedStyle(e.closest('.ma-ordem')).display), 'block', 'no computador, a ordenação fica sempre à vista na barra');
  assert.equal(await pc.$eval('#ma-ordem-painel', (e) => getComputedStyle(e.closest('.ma-ordem-painel')).display), 'none', 'e não se repete no painel');
  assert.deepEqual(p.errosDaPagina, []);
});
