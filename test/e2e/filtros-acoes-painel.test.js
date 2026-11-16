// "Minhas ações", segunda etapa: painel "Filtros" (Responsável, Origem, Seção, Prazo, Status, Prioridade), contagens por opção,
// etiquetas removíveis, intervalo de datas, "Limpar filtros", foco e acessibilidade.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEFE_CPE, DIRETOR, subir } from './ajuda.js';

const cartoes = (p) => p.$$eval('article.acao h3', (hs) => hs.map((h) => h.textContent));
const botao = (p) => p.$eval('[data-alternar-painel]', (b) => b.textContent.replace(/\s+/g, ' ').trim());
const etiquetas = (p) => p.$$eval('.ma-etiqueta', (es) => es.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
const opcoes = (p, id) => p.$$eval(`#ma-f-${id} option`, (os) => os.map((o) => o.textContent.replace(/\s+/g, ' ').trim()));
const esperarCartoes = (p, n) => p.waitForFunction((x) => document.querySelectorAll('article.acao').length === x, { timeout: 5000 }, n);

test('Painel de filtros: escolhe, mostra as etiquetas e as contagens, filtra por datas e limpa', async (t) => {
  const app = await subir(t); if (!app) return;
  const axe = fs.readFileSync(app.caminhoAxe, 'utf8');
  const ins = app.db.prepare('insert into usuarios (id, nome, email, perfil, secao_id) values (?, ?, ?, ?, ?)');
  await ins.run(31, 'Marina Costa', 'marina@exemplo.invalid', 'membro', 1);
  await ins.run(32, 'Paulo Lima', 'paulo@exemplo.invalid', 'membro', 1);
  const nova = (titulo, prazo, resp, prioridade) => app.api(CHEFE_CPE, 'POST', '/acoes', { titulo, prazo, prioridade, responsavel_id: resp });
  await nova('Revisar o fluxo de pagamentos', '2026-09-24', 31, 'alta');
  await nova('Atualizar o manual interno', '2026-11-20', 31, 'baixa');
  await nova('Conferir os empenhos pendentes', '2026-10-05', 32, 'media');
  await nova('Fechar a conferência do dia', '2026-09-22', 32, 'media'); // vence no dia da reunião (hoje, no teste)
  assert.equal((await app.api(DIRETOR, 'POST', '/diretrizes', { titulo: 'Demanda do Diretor para o CPE', prazo: '2026-10-30', destino: 'especificos', secoes: [1] })).status, 201);

  const abertas = (await app.api(CHEFE_CPE, 'GET', '/acoes?situacao=abertas&secao=1&minhas=1')).dados;
  const concluidas = (await app.api(CHEFE_CPE, 'GET', '/acoes?situacao=concluidas&secao=1&minhas=1')).dados;
  const todas = [...abertas, ...concluidas]; // a aba "Todas ativas" mostra as abertas e as concluídas
  const daMarina = todas.filter((a) => a.responsavel_id === 31);
  assert.equal(daMarina.length, 2);

  const p = await app.abrir(CHEFE_CPE, '#/minhas-acoes');
  await p.waitForSelector('article.acao');
  assert.equal((await cartoes(p)).length, todas.length);
  assert.equal(await botao(p), 'Filtros');
  assert.equal(await p.$eval('#ma-painel', (e) => e.hidden), true, 'o painel começa recolhido');

  // Abre o painel: os seis filtros, cada opção com a contagem.
  await p.click('[data-alternar-painel]');
  assert.equal(await p.$eval('#ma-painel', (e) => e.hidden), false);
  for (const id of ['responsavel', 'origem', 'secao', 'prazo', 'status', 'prioridade']) assert.ok(await p.$(`#ma-f-${id}`), `há o filtro ${id}`);
  const resp = await opcoes(p, 'responsavel');
  assert.ok(resp.includes('Marina Costa (2)'), `Marina tem 2: ${resp.join(' | ')}`);
  assert.ok(resp.includes('Paulo Lima (2)'), `Paulo tem 2: ${resp.join(' | ')}`);
  const origens = await opcoes(p, 'origem');
  const doDiretor = todas.filter((a) => a.demandada_diretor).length;
  assert.ok(doDiretor >= 1);
  assert.ok(origens.includes(`Demandadas pelo Diretor (${doDiretor})`), `origem: o que o Diretor demandou: ${origens.join(' | ')}`);
  assert.ok((await opcoes(p, 'secao')).some((o) => /^IND \(/.test(o)), 'seção: a subseção aparece');
  const prazos = await opcoes(p, 'prazo');
  assert.ok(prazos.some((o) => /^Até a reunião da equipe \(/.test(o)), `prazo com a reunião da equipe: ${prazos.join(' | ')}`);
  assert.ok(prazos.some((o) => /^Até a reunião da organização \(/.test(o)));

  // Responsável: filtra, mostra a etiqueta, o número no botão e o foco continua no campo.
  await p.focus('#ma-f-responsavel'); // uma pessoa foca o campo antes de escolher
  await p.select('#ma-f-responsavel', 'id:31');
  await esperarCartoes(p, 2);
  assert.deepEqual((await cartoes(p)).sort(), daMarina.map((a) => a.titulo).sort());
  assert.equal(await botao(p), 'Filtros (1)');
  assert.deepEqual(await etiquetas(p), ['Responsável: Marina Costa ✕']);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'ma-f-responsavel', 'o foco continua no campo escolhido');
  // As contagens das outras opções passam a considerar o responsável escolhido (as da Marina: 1 alta, 1 baixa).
  const prio = await opcoes(p, 'prioridade');
  assert.ok(prio.includes('Alta (1)') && prio.includes('Baixa (1)'), prio.join(' | '));
  assert.ok(!prio.some((o) => o.startsWith('Média')), 'opção sem nenhuma ação some');

  // Prioridade junto: E entre os filtros.
  await p.select('#ma-f-prioridade', 'alta');
  await esperarCartoes(p, 1);
  assert.equal(await botao(p), 'Filtros (2)');
  assert.deepEqual((await cartoes(p)), ['Revisar o fluxo de pagamentos']);

  // Etiqueta: tirar uma a uma.
  await p.click('[data-remover="prioridade"]');
  await esperarCartoes(p, 2);
  assert.deepEqual(await etiquetas(p), ['Responsável: Marina Costa ✕']);

  // Prazo por datas: aparecem os campos de data; a etiqueta mostra o intervalo.
  await p.select('#ma-f-prazo', 'intervalo');
  await p.waitForSelector('#ma-prazo-de');
  await p.$eval('#ma-prazo-de', (i) => { i.value = '2026-11-01'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForFunction(() => document.querySelectorAll('article.acao').length === 1);
  assert.deepEqual(await cartoes(p), ['Atualizar o manual interno'], 'só a que vence a partir de 01/11');
  assert.ok((await etiquetas(p)).some((e) => /^Prazo: de 01\/11\/2026 a …/.test(e)));

  // Acessibilidade com o painel aberto e filtros aplicados.
  await p.evaluate(axe);
  const violacoes = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
  assert.deepEqual(violacoes, [], 'o painel de filtros não tem violações de acessibilidade');

  // Limpar filtros tira tudo (menos a ordem) e o botão volta ao normal.
  await p.click('[data-limpar]');
  await esperarCartoes(p, todas.length);
  assert.equal(await botao(p), 'Filtros');
  assert.deepEqual(await etiquetas(p), []);
  assert.equal(await p.$('.ma-resultado'), null);
  assert.deepEqual(p.errosDaPagina, []);
});

test('Painel de filtros no celular: abre com o botão, cabe na tela e os campos têm alvo de toque', async (t) => {
  const app = await subir(t); if (!app) return;
  const p = await app.abrir(CHEFE_CPE, '#/minhas-acoes', { largura: 390, altura: 844, celular: true });
  await p.waitForSelector('.ma-filtros');
  await p.click('[data-alternar-painel]');
  await p.waitForSelector('#ma-painel:not([hidden])');
  const m = await p.evaluate(() => ({
    pagina: document.documentElement.scrollWidth, janela: innerWidth,
    campo: document.querySelector('#ma-f-prazo')?.getBoundingClientRect().width ?? 0,
    alturaBotao: document.querySelector('[data-alternar-painel]').getBoundingClientRect().height,
  }));
  assert.ok(m.pagina <= m.janela, `sem rolagem horizontal (${m.pagina} > ${m.janela})`);
  assert.ok(m.campo > 250, 'os campos ocupam a largura');
  assert.ok(m.alturaBotao >= 44, 'botão com alvo de toque de 44 px');
  assert.deepEqual(p.errosDaPagina, []);
});
