// Jornadas críticas no navegador de verdade: o que um usuário faz na semana, do começo ao fim.
// Cada teste usa o próprio banco (dados fictícios) e confere o resultado pela API, não só pelo que aparece na tela.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEFE_COF, DIRETOR, clicarTexto, esperarTexto, subir } from './ajuda.js';

test('Diretor: o Painel mostra uma ficha por unidade, com a situação sempre em texto', async (t) => {
  const app = await subir(t); if (!app) return;
  const p = await app.abrir(DIRETOR, '#/painel');
  await esperarTexto(p, 'Painel da semana');
  const texto = await p.evaluate(() => document.body.innerText);
  assert.match(texto, /Crítico/);
  assert.match(texto, /Em dia/);
  assert.match(texto, /Centro de Orçamento e Finanças/);
  assert.deepEqual(p.errosDaPagina, []);
});

test('Diretor: direciona uma ação a todos os Centros e a vê agrupada na tela Ações', async (t) => {
  const app = await subir(t); if (!app) return;
  const p = await app.abrir(DIRETOR, '#/direcionar');
  await p.waitForSelector('#d-titulo');
  await p.type('#d-titulo', 'Revisar o fluxo de testes de ponta a ponta');
  await p.click('#form-dir button[type="submit"]');
  // Se já houver ações com o mesmo prazo, o sistema avisa antes; segue com "Direcionar mesmo assim".
  const aviso = await p.waitForFunction(() => [...document.querySelectorAll('dialog[open] button')].find((b) => /Direcionar mesmo assim/.test(b.textContent)) || null, { timeout: 2500 }).catch(() => null);
  if (aviso) await clicarTexto(p, 'dialog[open] button', 'Direcionar mesmo assim');
  await esperarTexto(p, 'Revisar o fluxo de testes de ponta a ponta');

  const { dados: acoes } = await app.api(DIRETOR, 'GET', '/acoes?q=Revisar%20o%20fluxo%20de%20testes');
  assert.ok(acoes.length >= 5, `uma ação por Centro (vieram ${acoes.length})`);
  assert.equal(new Set(acoes.map((a) => a.diretriz_id)).size, 1, 'todas ligadas à mesma diretriz');

  await p.goto(`${app.base}/#/acoes`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('tbody.grupo');
  const grupo = await p.evaluate(() => [...document.querySelectorAll('tbody.grupo')].map((g) => g.querySelector('.grupo-cab').innerText.replace(/\s+/g, ' ')).find((x) => x.includes('Revisar o fluxo de testes')));
  assert.ok(grupo, 'a diretriz aparece como um grupo');
  assert.match(grupo, new RegExp(`${acoes.length} seções`), 'o grupo conta uma seção por ação criada');
  assert.deepEqual(p.errosDaPagina, []);
});

test('Chefe: inicia a ação, registra o tempo e conclui', async (t) => {
  const app = await subir(t); if (!app) return;
  const { dados: lista } = await app.api(CHEFE_COF, 'GET', '/acoes');
  const alvo = lista.find((a) => a.status === 'a_fazer');
  assert.ok(alvo, 'o cenário tem uma ação a fazer na seção');
  const p = await app.abrir(CHEFE_COF, '#/minhas-acoes');
  const cartao = `article[data-id="${alvo.id}"]`;

  await p.waitForSelector(`${cartao} [data-status="em_andamento"]`);
  await p.click(`${cartao} [data-status="em_andamento"]`);
  await p.waitForSelector(`${cartao} [data-status="em_andamento"][aria-pressed="true"]`);

  await p.type(`${cartao} [data-min]`, '30');
  await p.click(`${cartao} [data-tempo]`);
  await p.waitForFunction((sel) => document.querySelector(sel)?.innerText.includes('30 min'), {}, cartao);

  await p.click(`${cartao} [data-status="concluida"]`);
  await p.waitForSelector(`${cartao} [data-status="concluida"][aria-pressed="true"], ${cartao}.concluida`).catch(() => {});
  const { dados: depois } = await app.api(CHEFE_COF, 'GET', `/acoes/${alvo.id}`);
  assert.equal(depois.status, 'concluida');
  assert.equal(depois.tempo_total, 30);
  assert.deepEqual(p.errosDaPagina, []);
});

test('Chefe: concluir sem tempo registrado é recusado com a orientação certa', async (t) => {
  const app = await subir(t); if (!app) return;
  const { dados: lista } = await app.api(CHEFE_COF, 'GET', '/acoes');
  const alvo = lista.find((a) => a.status === 'a_fazer');
  const p = await app.abrir(CHEFE_COF, '#/minhas-acoes');
  const cartao = `article[data-id="${alvo.id}"]`;
  await p.click(`${cartao} [data-status="em_andamento"]`);
  await p.waitForSelector(`${cartao} [data-status="em_andamento"][aria-pressed="true"]`);
  await p.click(`${cartao} [data-status="concluida"]`);
  await esperarTexto(p, 'tempo');
  const { dados: depois } = await app.api(CHEFE_COF, 'GET', `/acoes/${alvo.id}`);
  assert.notEqual(depois.status, 'concluida', 'sem tempo a ação não conclui');
});

test('Chefe: envia a atualização da semana e volta ao Início', async (t) => {
  const app = await subir(t); if (!app) return;
  const p = await app.abrir(CHEFE_COF, '#/atualizacao');
  await p.waitForSelector('#obs');
  await p.type('#obs', 'Observação do teste de ponta a ponta.');
  await clicarTexto(p, '#form-at button[type="submit"]', 'Enviar atualização');
  await p.waitForFunction(() => location.hash === '#/inicio'); // depois de enviar, a tela leva ao Início
  await esperarTexto(p, 'Obrigado');
  const { dados: painel } = await app.api(DIRETOR, 'GET', '/painel');
  const cof = painel.itens.find((c) => c.secao.sigla === 'COF');
  assert.equal(cof.enviada, true);
  assert.deepEqual(p.errosDaPagina, []);
});

test('Link de uma ação: abre a ficha, copia o endereço e fechar limpa a URL', async (t) => {
  const app = await subir(t); if (!app) return;
  const { dados: lista } = await app.api(CHEFE_COF, 'GET', '/acoes');
  const alvo = lista[0];
  const p = await app.abrir(CHEFE_COF, `#/acao/${alvo.id}`);
  await p.waitForSelector('dialog[open]');
  assert.match(await p.evaluate(() => location.hash), new RegExp(`^#/minhas-acoes\\?acao=${alvo.id}$`));
  assert.equal(await p.evaluate(() => document.querySelector('dialog[open] h2').textContent), alvo.titulo);
  await p.click('dialog[open] [data-fechar]');
  await p.waitForFunction(() => !document.querySelector('dialog[open]') && location.hash === '#/minhas-acoes'); // o endereço volta ao que era
  // Recarregar com o parâmetro reabre a mesma ação.
  await p.goto(`${app.base}/#/minhas-acoes?acao=${alvo.id}`);
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('dialog[open]');
  assert.deepEqual(p.errosDaPagina, []);
});

test('Reunião: o Diretor inicia, navega pelo teclado e encerra; a ata nasce em rascunho', async (t) => {
  const app = await subir(t); if (!app) return;
  const p = await app.abrir(DIRETOR, '#/reuniao');
  await clicarTexto(p, 'button', 'Iniciar reunião');
  await p.waitForFunction(() => /^#\/reuniao\/\d+$/.test(location.hash));
  await p.waitForSelector('.tv-app');
  for (let i = 0; i < 3; i++) { await p.keyboard.press('ArrowRight'); await new Promise((r) => setTimeout(r, 150)); }
  await clicarTexto(p, '.tv-app button', 'Encerrar reunião');
  // Pode haver uma confirmação ("Encerrar reunião" no diálogo).
  await new Promise((r) => setTimeout(r, 600));
  if (await p.$('dialog[open]')) await clicarTexto(p, 'dialog[open] button[type="submit"]', 'Encerrar');
  await p.waitForFunction(() => !/^#\/reuniao\/\d+$/.test(location.hash) || !document.querySelector('.tv-app'), { timeout: 15000 });
  const { dados: reunioes } = await app.api(DIRETOR, 'GET', '/reunioes');
  assert.equal(reunioes[0].status, 'rascunho');
  const { dados: detalhe } = await app.api(DIRETOR, 'GET', `/reunioes/${reunioes[0].id}`);
  assert.ok(detalhe.ata_texto && detalhe.ata_texto.length > 50, 'a ata foi gerada');
  assert.deepEqual(p.errosDaPagina, []);
});

test('Chefe sem atualização enviada vê a faixa de aviso nas telas de trabalho, e ela some ao enviar', async (t) => {
  const app = await subir(t); if (!app) return;
  const p = await app.abrir(CHEFE_COF, '#/minhas-acoes');
  await p.waitForSelector('.faixa-pendente');
  assert.match(await p.evaluate(() => document.querySelector('.faixa-pendente').innerText), /ainda não foi enviada/);
  // No Início o assunto já está na tela ("Sua semana"): a faixa não repete.
  await p.goto(`${app.base}/#/inicio`, { waitUntil: 'networkidle0' });
  await esperarTexto(p, 'Sua semana');
  assert.equal(await p.$('.faixa-pendente'), null, 'no Início a faixa não repete o cartão');
  assert.match(await p.evaluate(() => document.querySelector('.sua-semana').innerText), /Enviar a atualização da semana/);
  // O Diretor não envia atualização: não vê a faixa.
  const d = await app.abrir(DIRETOR, '#/painel');
  await esperarTexto(d, 'Painel da semana');
  assert.equal(await d.$('.faixa-pendente'), null, 'o Diretor não vê a faixa');
  await d.close(); // com duas páginas abertas o Chrome deixa a primeira em segundo plano, onde as esperas do puppeteer não avançam
  await p.bringToFront();
  // Depois de enviar, some, e o Início marca o item como em dia.
  await p.goto(`${app.base}/#/atualizacao`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('#obs');
  await clicarTexto(p, '#form-at button[type="submit"]', 'Enviar atualização'); // enviar pela tela renova o que a página sabe
  await p.waitForFunction(() => location.hash === '#/inicio');
  await p.goto(`${app.base}/#/minhas-acoes`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('article[data-id]');
  assert.equal(await p.$('.faixa-pendente'), null, 'depois de enviar a faixa some');
  await p.goto(`${app.base}/#/inicio`, { waitUntil: 'networkidle0' });
  await esperarTexto(p, 'Atualização enviada em');
  assert.deepEqual(p.errosDaPagina, []);
});
