// Tutorial guiado (public/js/tutorial.js): convite de primeira vez, lições de ponta a ponta, destaque de cada passo,
// nenhuma gravação de dados e acessibilidade com o painel aberto (computador e celular).
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEFE_COF, CHEFE_CPE, DIRETOR, subir } from './ajuda.js';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const painel = (p) => p.evaluate(() => { const e = document.querySelector('.tut'); return e ? { modo: e.dataset.modo, texto: e.innerText, foco: !!document.querySelector('.tut-foco.visivel') } : null; });
/** Repete a leitura quando a página troca de tela no meio dela ("Execution context was destroyed"): o passo do tutorial navega, e a leitura caiu no instante da troca. */
async function tentar(fn) {
  for (let i = 0; ; i += 1) {
    try { return await fn(); } catch (e) {
      if (i >= 5 || !/Execution context was destroyed|detached|Cannot find context|Target closed/i.test(String(e.message))) throw e;
      await pausa(400);
    }
  }
}
const esperarModo = (p, modo) => p.waitForSelector(`.tut[data-modo="${modo}"]`, { timeout: 8000 });

/** Percorre todas as lições do perfil; devolve os passos que ficaram sem destaque (alvo não achado) e os títulos vistos. */
async function percorrerTudo(p) {
  await p.click('#tutorial-guiado');
  await esperarModo(p, 'lista');
  const ids = await p.$$eval('[data-tut="licao"]', (bs) => bs.map((b) => b.dataset.id));
  const semDestaque = [], vistos = [];
  for (const id of ids) {
    await p.click('#tutorial-guiado').catch(() => {}); // já aberto: só devolve o foco
    await p.evaluate((i) => document.querySelector(`.tut [data-tut="licao"][data-id="${i}"]`)?.click(), id);
    for (;;) {
      await tentar(() => p.waitForSelector('.tut[data-modo="passo"]', { timeout: 8000 }));
      await pausa(450);
      const { e, titulo, ultimo } = await tentar(async () => ({
        e: await painel(p),
        titulo: await p.$eval('#tut-titulo', (h) => h.textContent),
        ultimo: await p.$eval('[data-tut="proximo"]', (b) => /Concluir/.test(b.textContent)),
      }));
      vistos.push(`${id}: ${titulo}`);
      if (/ainda não há nada para destacar/.test(e.texto)) semDestaque.push(`${id}: ${titulo}`);
      await tentar(() => p.click('[data-tut="proximo"]'));
      if (ultimo) break;
    }
    await esperarModo(p, 'fim');
    await p.click('[data-tut="lista"]');
    await esperarModo(p, 'lista');
  }
  return { semDestaque, vistos, ids };
}

test('tutorial do Chefe: convite, lições completas, destaque em cada passo e nenhuma gravação', async (t) => {
  const app = await subir(t); if (!app) return;
  const antes = JSON.stringify((await app.api(CHEFE_COF, 'GET', '/acoes')).dados.map((a) => [a.id, a.status, a.prazo, a.movimentada_em]));
  const p = await app.abrir(CHEFE_COF, '#/inicio');
  await esperarModo(p, 'convite'); // primeira vez: convida, sem bloquear a tela
  assert.match((await painel(p)).texto, /Primeira vez por aqui/);
  await p.click('[data-tut="sair"]');
  assert.equal(await painel(p), null, '"Agora não" fecha o convite');
  await p.reload({ waitUntil: 'networkidle0' });
  await pausa(500);
  assert.equal(await painel(p), null, 'o convite não volta');

  const { semDestaque, vistos, ids } = await percorrerTudo(p);
  assert.ok(ids.length >= 6 && vistos.length >= 20, `lições do chefe (vieram ${ids.length} lições, ${vistos.length} passos)`);
  // Quadros que dependem de haver dados (ações novas, a validar) podem não existir nos dados fictícios; o resto precisa ser destacado.
  const faltando = semDestaque.filter((s) => !/Quadros de atenção/.test(s));
  assert.deepEqual(faltando, [], `passos sem destaque: ${faltando.join('; ')}`);
  assert.ok(!ids.includes('direcionar'), 'sem subseções, a lição de direcionar não existe');
  assert.deepEqual(p.errosDaPagina, []);

  // Lição concluída fica marcada e a lista lembra.
  await p.click('[data-tut="sair"]');
  await p.click('#tutorial-guiado');
  await esperarModo(p, 'lista');
  assert.match((await painel(p)).texto, /5 de 5 concluídas|\d+ de \d+ concluídas/);
  assert.ok(await p.$('.tut-marca.feita'));

  // O tutorial só ensina: nada foi gravado.
  const depois = JSON.stringify((await app.api(CHEFE_COF, 'GET', '/acoes')).dados.map((a) => [a.id, a.status, a.prazo, a.movimentada_em]));
  assert.equal(depois, antes);
});

test('tutorial do Diretor: lições da gestão e passo "clique no menu" avança sozinho', async (t) => {
  const app = await subir(t); if (!app) return;
  const p = await app.abrir(DIRETOR, '#/painel');
  await esperarModo(p, 'convite');
  await p.click('[data-tut="lista"]');
  await esperarModo(p, 'lista');
  await p.click('[data-tut="licao"][data-id="comeco"]');
  for (let i = 0; i < 2; i += 1) { await p.waitForSelector('.tut[data-modo="passo"]'); await pausa(300); await p.click('[data-tut="proximo"]'); }
  await p.waitForFunction(() => /Agora é com você/.test(document.querySelector('#tut-titulo')?.textContent || ''));
  await pausa(400);
  assert.ok((await painel(p)).foco, 'o menu Agenda está destacado');
  await p.click('.menu a[data-rota="agenda"]'); // o clique no alvo avança o passo e a Agenda abre
  await p.waitForFunction(() => document.querySelector('#tut-titulo')?.textContent === 'A Agenda');
  assert.match(await p.evaluate(() => location.hash), /#\/agenda/);

  await p.click('[data-tut="lista"]');
  await esperarModo(p, 'lista');
  const ids = await p.$$eval('[data-tut="licao"]', (bs) => bs.map((b) => b.dataset.id));
  assert.deepEqual(ids, ['comeco', 'painel', 'direcionar', 'acompanhar', 'reuniao', 'organizacao']);
  const { semDestaque } = await percorrerTudo(p);
  assert.deepEqual(semDestaque, [], `passos sem destaque: ${semDestaque.join('; ')}`);
  assert.deepEqual(p.errosDaPagina, []);
});

test('tutorial: Esc fecha, e o painel passa no axe no computador e no celular', async (t) => {
  const app = await subir(t); if (!app) return;
  const axe = fs.readFileSync(app.caminhoAxe, 'utf8');
  const auditar = async (p) => { await p.evaluate(axe); return p.evaluate(async () => (await window.axe.run(document.querySelector('.tut'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`)); };

  const pc = await app.abrir(CHEFE_COF, '#/inicio');
  await esperarModo(pc, 'convite');
  assert.deepEqual(await auditar(pc), []);
  await pc.click('[data-tut="lista"]');
  await esperarModo(pc, 'lista');
  assert.deepEqual(await auditar(pc), []);
  await pc.click('[data-tut="licao"][data-id="inicio"]');
  await pc.waitForSelector('.tut[data-modo="passo"]'); await pausa(400);
  assert.deepEqual(await auditar(pc), []);
  await pc.keyboard.press('Escape');
  assert.equal(await painel(pc), null);
  assert.equal(await pc.$('.tut-foco'), null);

  const pm = await app.abrir(CHEFE_COF, '#/inicio', { largura: 390, altura: 844, celular: true });
  await pm.evaluate(() => localStorage.clear());
  await pm.reload({ waitUntil: 'networkidle0' });
  await esperarModo(pm, 'convite');
  await pm.click('[data-tut="lista"]');
  await pm.click('[data-tut="licao"][data-id="acoes"]');
  await pm.waitForSelector('.tut[data-modo="passo"]'); await pausa(500);
  assert.deepEqual(await auditar(pm), []);
  const caixa = await pm.evaluate(() => { const r = document.querySelector('.tut').getBoundingClientRect(); const f = document.querySelector('.tut-foco.visivel')?.getBoundingClientRect(); return { r: [r.left, r.right, r.top, r.bottom], f: f && [f.left, f.right, f.top, f.bottom], l: innerWidth, a: innerHeight }; });
  assert.ok(caixa.r[0] >= 0 && caixa.r[1] <= caixa.l && caixa.r[3] <= caixa.a, 'o painel cabe na tela do celular');
  if (caixa.f) assert.ok(!(caixa.f[0] < caixa.r[1] && caixa.f[1] > caixa.r[0] && caixa.f[2] < caixa.r[3] && caixa.f[3] > caixa.r[2]), 'o painel não cobre o destaque');
});

test('tutorial do Chefe que tem subseções: a lição "Direcionar às subseções" existe e cada passo é destacado', async (t) => {
  const app = await subir(t); if (!app) return;
  const p = await app.abrir(CHEFE_CPE, '#/inicio');
  await esperarModo(p, 'convite');
  await p.click('[data-tut="sair"]'); // "Agora não": o botão Tutorial abre a lista
  const { semDestaque, vistos, ids } = await percorrerTudo(p);
  assert.ok(ids.includes('direcionar'));
  assert.ok(vistos.some((v) => v.startsWith('direcionar: Aceite ao concluir')));
  const faltando = semDestaque.filter((s) => !/Quadros de atenção/.test(s));
  assert.deepEqual(faltando, [], `passos sem destaque: ${faltando.join('; ')}`);
  assert.deepEqual(p.errosDaPagina, []);
});
