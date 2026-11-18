// Nova interface, fase 1 (chefe e Diretor): quatro áreas no menu, as telas atuais como abas, os endereços antigos levando à área, a opção de
// experimentar e voltar, o celular e a acessibilidade. As regras e os dados são os mesmos: só a navegação muda.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEFE_COF, CHEFE_CPE, DIRETOR, subir } from './ajuda.js';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const violacoes = (p, axe) => p.evaluate(async (js) => { eval(js); return (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`); }, axe);
const hash = (p) => p.evaluate(() => location.hash);
const abas = (p) => p.$$eval('.abas-area a', (as) => as.map((a) => a.textContent.trim()));
const ativa = (p) => p.$eval('.abas-area a[aria-current="page"]', (a) => a.textContent.trim());
const areaAtiva = (p) => p.$eval('.menu a[aria-current="page"]', (a) => a.dataset.rota);
const esperarHash = (p, re) => p.waitForFunction((s) => new RegExp(s).test(location.hash), { timeout: 10000 }, re.source);

/** Abre o chefe já com a versão nova ligada (a escolha fica no navegador, como no uso real). */
async function abrirNova(app, rota = '#/a-hoje', opcoes, uid = CHEFE_COF) {
  const p = await app.abrir(uid, rota.startsWith('#/a-p') ? '#/painel' : '#/inicio', opcoes);
  await p.waitForSelector('.menu a');
  await p.evaluate(() => localStorage.setItem('agilis:nova-interface', '1'));
  await p.evaluate((r) => { location.hash = r; }, rota);
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('.menu a');
  return p;
}

test('Experimentar e voltar: o botão alterna entre o menu atual e o de quatro áreas, e a Consulta ainda não a tem', async (t) => {
  const app = await subir(t); if (!app) return;
  const p = await app.abrir(CHEFE_COF, '#/inicio');
  await p.waitForSelector('#alternar-interface');
  assert.equal(await p.$eval('#alternar-interface', (b) => b.textContent), 'Experimentar a versão nova');
  assert.ok((await p.$$('.menu a')).length >= 10, 'o menu atual tem muitos itens');

  await p.click('#alternar-interface');
  await esperarHash(p, /#\/a-hoje/);
  await p.waitForSelector('.menu a[data-rota="a-hoje"]');
  assert.deepEqual(await p.$$eval('.menu a', (as) => as.map((a) => a.dataset.rota)), ['a-hoje', 'a-acoes', 'a-semana', 'a-equipe']);
  assert.equal(await p.$eval('#alternar-interface', (b) => b.textContent), 'Voltar à versão atual');
  assert.equal(await areaAtiva(p), 'a-hoje');

  await p.click('#alternar-interface');
  await esperarHash(p, /#\/inicio/);
  await p.waitForSelector('.menu a[data-rota="gestao"]');
  assert.ok((await p.$$('.menu a')).length >= 10, 'voltou ao menu atual');

  // A Consulta ainda não tem a versão nova: sem o botão.
  await app.db.prepare('insert into usuarios (id, nome, email, perfil) values (?,?,?,?)').run(32, 'Cida Consulta', 'cida@exemplo.invalid', 'consulta');
  const m = await app.abrir(32, '#/acoes-centros');
  await m.waitForSelector('.menu a');
  assert.equal(await m.$('#alternar-interface'), null, 'a Consulta ainda não tem a versão nova');
  const d = await app.abrir(DIRETOR, '#/painel');
  await d.waitForSelector('#alternar-interface');
  assert.equal(await d.$eval('#alternar-interface', (b) => b.textContent), 'Experimentar a versão nova', 'o Diretor tem');
  assert.deepEqual(p.errosDaPagina, []);
});

test('As quatro áreas abrem as telas de sempre em abas, e o endereço antigo leva à área', async (t) => {
  const app = await subir(t); if (!app) return;
  const p = await abrirNova(app);
  assert.match(await p.$eval('#conteudo', (e) => e.innerText), /atualização da semana/, 'Hoje abre com a atualização da semana');
  assert.equal(await p.$('.abas-area'), null, 'Hoje tem uma tela só, sem abas');

  await p.click('.menu a[data-rota="a-acoes"]');
  await p.waitForSelector('.abas-area');
  assert.equal(await areaAtiva(p), 'a-acoes');
  assert.deepEqual((await abas(p)).slice(0, 3), ['Minhas ações', 'Agenda', 'Diário']);
  assert.equal(await ativa(p), 'Minhas ações');
  await p.waitForSelector('#conteudo h1');
  assert.match(await p.$eval('#conteudo', (e) => e.innerText), /Minhas ações/);

  await p.click('.abas-area a[href="#/a-acoes?t=diario"]');
  await esperarHash(p, /t=diario/);
  await p.waitForFunction(() => /Meu diário|Diário da seção/.test(document.querySelector('#conteudo')?.innerText || ''), { timeout: 10000 });
  assert.equal(await ativa(p), 'Diário');

  await p.click('.menu a[data-rota="a-semana"]');
  await p.waitForFunction(() => document.querySelector('.abas-area a[aria-current="page"]')?.textContent.trim() === 'Atualização', { timeout: 10000 });
  assert.deepEqual(await abas(p), ['Atualização', 'Atualizações enviadas', 'Reuniões e atas', 'Combinados', 'Ajustes da reunião']);
  assert.equal(await areaAtiva(p), 'a-semana');

  await p.click('.menu a[data-rota="a-equipe"]');
  await p.waitForFunction(() => document.querySelector('.abas-area a[aria-current="page"]')?.textContent.trim() === 'Painel de gestão', { timeout: 10000 });
  assert.deepEqual(await abas(p), ['Painel de gestão', 'Minha equipe', 'Produtividade']);

  // O endereço de uma tela atual leva à mesma tela dentro da área, com os parâmetros (a instância da equipe).
  await p.evaluate(() => { location.hash = '#/combinados?i=equipe'; });
  await esperarHash(p, /#\/a-semana\?.*t=combinados/);
  assert.match(await hash(p), /i=equipe/);
  assert.equal(await ativa(p), 'Combinados');
  assert.equal(await areaAtiva(p), 'a-semana');
  await p.evaluate(() => { location.hash = '#/gestao'; });
  await esperarHash(p, /#\/a-equipe\?t=gestao/);
  assert.equal(await ativa(p), 'Painel de gestão');
  assert.deepEqual(p.errosDaPagina, []);
});

test('Link de uma ação abre a ficha dentro da área Ações; com a versão atual, nada disso aparece', async (t) => {
  const app = await subir(t); if (!app) return;
  const acao = (await app.api(CHEFE_COF, 'POST', '/acoes', { titulo: 'Ação da versão nova', prazo: '2026-12-31' })).dados.id;
  const p = await abrirNova(app, `#/acao/${acao}`);
  await p.waitForSelector('dialog[open]', { timeout: 10000 });
  assert.match(await hash(p), new RegExp(`#/a-acoes\\?.*acao=${acao}`));
  assert.match(await p.$eval('dialog[open]', (d) => d.innerText), /Ação da versão nova/);

  // Versão atual: as rotas novas não valem e o chefe volta ao Início.
  await p.evaluate(() => localStorage.removeItem('agilis:nova-interface'));
  await p.evaluate(() => { location.hash = '#/a-semana'; });
  await p.reload({ waitUntil: 'networkidle0' });
  await esperarHash(p, /#\/inicio/);
  assert.equal(await p.$('.abas-area'), null);
});

test('Celular: quatro abas inferiores, abas da área com rolagem própria e acessibilidade', async (t) => {
  const app = await subir(t); if (!app) return;
  const axe = fs.readFileSync(app.caminhoAxe, 'utf8');
  const m = await abrirNova(app, '#/a-semana', { celular: true, largura: 390, altura: 844 });
  await m.waitForSelector('.abas-movel a');
  assert.deepEqual(await m.$$eval('.abas-movel a', (as) => as.map((a) => a.dataset.rota)), ['a-hoje', 'a-acoes', 'a-semana', 'a-equipe']);
  assert.equal(await m.$eval('.abas-movel a[aria-current="page"]', (a) => a.dataset.rota), 'a-semana');
  assert.equal(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'a página não rola na horizontal');
  assert.deepEqual(await violacoes(m, axe), [], 'Semana no celular não tem violações de acessibilidade');
  await m.close();

  const p = await abrirNova(app, '#/a-equipe');
  await p.waitForSelector('.abas-area');
  assert.deepEqual(await violacoes(p, axe), [], 'Equipe não tem violações de acessibilidade');
  await pausa(100);
  assert.deepEqual(p.errosDaPagina, []);
});

test('Tela Hoje do chefe: o resumo do painel de gestão substitui os quatro números e as próximas ações', async (t) => {
  const app = await subir(t); if (!app) return;
  // Versão atual: o Início de sempre.
  const antes = await app.abrir(CHEFE_COF, '#/inicio');
  await antes.waitForSelector('#sua-semana-titulo', { timeout: 10000 });
  assert.equal(await antes.$('#hoje-at-t'), null, 'a versão atual não tem o cartão novo');
  assert.match(await antes.$eval('#conteudo', (e) => e.innerText), /Próximas ações/);
  assert.equal(await antes.$('#hoje-equipe'), null);
  await antes.close();

  const p = await abrirNova(app, '#/a-hoje');
  await p.waitForSelector('#hoje-equipe', { timeout: 10000 });
  const texto = await p.$eval('#conteudo', (e) => e.innerText);
  assert.match(texto, /Como está a equipe/);
  assert.match(texto, /Falta enviar a atualização da semana/, 'o cartão principal é a atualização');
  assert.match(texto, /Próxima reunião/, 'e a próxima reunião, com o que vence antes dela');
  assert.doesNotMatch(texto, /Sua semana/, 'o checklist "Sua semana" foi substituído por esses dois cartões');
  assert.equal(await p.$eval('#hoje-at-t', (e) => e.closest('section').querySelector('a.btn-primario').textContent), 'Conferir e enviar');
  assert.doesNotMatch(texto, /Próximas ações/, 'a lista de ações fica na área Ações');
  assert.equal(await p.$('#hoje-equipe a[href="#/gestao"]') !== null, true, 'leva ao painel de gestão completo');
  // O link do resumo abre o painel de gestão dentro da área Equipe.
  await p.click('#hoje-equipe a[href="#/gestao"]');
  await esperarHash(p, /#\/a-equipe\?t=gestao/);
  assert.equal(await ativa(p), 'Painel de gestão');
  assert.deepEqual(p.errosDaPagina, []);
});

test('Diretor: quatro áreas, Reunião em destaque, abas das telas de sempre e endereços antigos levando à área', async (t) => {
  const app = await subir(t); if (!app) return;
  const axe = fs.readFileSync(app.caminhoAxe, 'utf8');
  const p = await abrirNova(app, '#/a-painel', undefined, DIRETOR);
  assert.deepEqual(await p.$$eval('.menu a', (as) => as.map((a) => a.dataset.rota)), ['a-painel', 'a-acoes', 'a-reuniao', 'a-config']);
  assert.equal(await p.$eval('.menu a[data-rota="a-reuniao"]', (a) => a.classList.contains('destaque')), true, 'Reunião em destaque, como o Iniciar reunião era');
  assert.equal(await areaAtiva(p), 'a-painel');
  assert.deepEqual(await abas(p), ['Painel da semana', 'Produtividade']);
  assert.match(await p.$eval('#conteudo', (e) => e.innerText), /Painel da semana/);
  assert.deepEqual(await violacoes(p, axe), [], 'o Painel do Diretor não tem violações de acessibilidade');

  await p.click('.menu a[data-rota="a-acoes"]');
  await p.waitForFunction(() => document.querySelector('.abas-area a[aria-current="page"]')?.textContent.trim() === 'Todas as ações', { timeout: 10000 });
  assert.deepEqual(await abas(p), ['Todas as ações', 'Direcionar', 'Pedidos de prazo', 'Agenda']);

  await p.click('.menu a[data-rota="a-reuniao"]');
  await p.waitForFunction(() => document.querySelector('.abas-area a[aria-current="page"]')?.textContent.trim() === 'Iniciar reunião', { timeout: 10000 });
  assert.deepEqual(await abas(p), ['Iniciar reunião', 'Pauta', 'Combinados', 'Reuniões e atas', 'Ajustes da reunião']);
  assert.deepEqual(await violacoes(p, axe), [], 'a área Reunião não tem violações de acessibilidade');

  await p.click('.menu a[data-rota="a-config"]');
  await p.waitForFunction(() => document.querySelector('.abas-area a[aria-current="page"]')?.textContent.trim() === 'Estrutura e acessos', { timeout: 10000 });
  assert.deepEqual(await abas(p), ['Estrutura e acessos', 'Avisos', 'Uso das telas']);

  // Endereços antigos levam à área; o que tem número (um Centro, uma reunião) abre como sempre.
  await p.evaluate(() => { location.hash = '#/prazos'; });
  await esperarHash(p, /#\/a-acoes\?t=prazos/);
  assert.equal(await areaAtiva(p), 'a-acoes');
  await p.evaluate(() => { location.hash = '#/centro/1'; });
  await p.waitForFunction(() => /#\/centro\/1/.test(location.hash), { timeout: 5000 });
  await p.waitForFunction(() => document.querySelector('.menu a[aria-current="page"]')?.dataset.rota === 'a-painel', { timeout: 10000 });
  assert.deepEqual(p.errosDaPagina, []);

  // Voltar à versão atual devolve o menu completo.
  await p.click('#alternar-interface');
  await esperarHash(p, /#\/painel/);
  await p.waitForSelector('.menu a[data-rota="produtividade"]');
  assert.ok((await p.$$('.menu a')).length >= 10);
});

test('Ficha da ação na versão nova: situação, tarefas e uma só linha do tempo, com um botão Registrar que pergunta o tipo', async (t) => {
  const app = await subir(t); if (!app) return;
  const axe = fs.readFileSync(app.caminhoAxe, 'utf8');
  await app.db.prepare('insert into usuarios (id, nome, email, perfil, secao_id) values (?,?,?,?,?)').run(31, 'Marina Costa', 'marina@exemplo.invalid', 'membro', 2);
  const acao = (await app.api(CHEFE_COF, 'POST', '/acoes', { titulo: 'Manifestar-se sobre o contrato', prazo: '2026-12-31', responsavel_id: 31 })).dados.id;
  const t1 = (await app.api(CHEFE_COF, 'POST', `/acoes/${acao}/checklist`, { texto: 'Minuta do ofício' })).dados.id;
  await app.api(CHEFE_COF, 'POST', `/acoes/${acao}/diario`, { texto: 'Minuta enviada ao jurídico.', tarefa_id: t1, tipo: 'entrega', minutos: 30 });
  await app.api(CHEFE_COF, 'POST', `/acoes/${acao}/impedimentos`, { descricao: 'Falta o número do processo no SEI.', critico: true });
  await app.api(CHEFE_COF, 'POST', `/acoes/${acao}/pontos-atencao`, { descricao: 'Prazo apertado com o jurídico.' });
  await app.api(CHEFE_COF, 'POST', `/acoes/${acao}/comentarios`, { texto: 'Podemos antecipar a reunião com o jurídico?' });

  // Versão atual: a ficha de sempre, com as seções separadas.
  const antes = await app.abrir(CHEFE_COF, `#/minhas-acoes?acao=${acao}`);
  await antes.waitForSelector('dialog[open] #diario-bloco', { timeout: 10000 });
  assert.equal(await antes.$('dialog[open] #linha-tempo'), null);
  await antes.close();

  const p = await abrirNova(app, `#/a-acoes?t=minhas-acoes&acao=${acao}`);
  await p.waitForSelector('dialog[open] #linha-tempo', { timeout: 10000 });
  assert.equal(await p.$('dialog[open] #diario-bloco'), null, 'não há mais o bloco de diário separado');
  const titulos = await p.$$eval('dialog[open] h3', (hs) => hs.map((h) => h.textContent.replace(/\s+/g, ' ').trim()));
  assert.ok(titulos.indexOf('Mais detalhes') < titulos.findIndex((x) => x.startsWith('Tarefas')), 'detalhes antes das tarefas');
  assert.ok(titulos.findIndex((x) => x.startsWith('Tarefas')) < titulos.indexOf('Linha do tempo'), 'tarefas antes da linha do tempo');
  assert.equal(titulos.filter((x) => /^(Impedimentos|Pontos de atenção|Comentários|Diário de progresso)/.test(x)).length, 0, 'sem as quatro seções antigas');

  // Uma só lista com as quatro fontes, e os filtros por fonte.
  const d0 = (await app.api(CHEFE_COF, 'GET', `/acoes/${acao}`)).dados;
  assert.equal((await p.$$('#lt-bloco .diario-item, #lt-bloco .impedimento, #lt-bloco .comentario')).length, d0.diario.length + d0.impedimentos.length + d0.pontos_atencao.length + d0.comentarios.length, 'todas as fontes numa só lista');
  const lista = await p.$eval('#lt-bloco', (e) => e.innerText);
  for (const trecho of ['Minuta enviada ao jurídico', 'Falta o número do processo', 'Prazo apertado', 'Podemos antecipar a reunião']) assert.match(lista, new RegExp(trecho));
  assert.deepEqual(await violacoes(p, axe), [], 'a ficha nova não tem violações de acessibilidade');
  await p.click('[data-lt-fonte="comentario"]');
  assert.equal((await p.$$('#lt-bloco .comentario')).length, d0.comentarios.length);
  assert.equal((await p.$$('#lt-bloco .impedimento')).length, 0);
  await p.click('[data-lt-fonte=""]');
  await p.select('#lt-tarefa', String(t1));
  assert.equal((await p.$$('#lt-bloco .diario-item')).length, 1, 'escolher a tarefa mostra só os registros dela');
  await p.select('#lt-tarefa', '');

  // O botão Registrar pergunta o tipo e abre o formulário certo.
  await p.click('[data-registrar-escolher]');
  await p.waitForSelector('[data-escolha="impedimento"]');
  assert.deepEqual(await p.$$eval('[data-escolha]', (bs) => bs.map((b) => b.dataset.escolha)), ['registro', 'impedimento', 'ponto', 'comentario']);
  await p.click('[data-escolha="registro"]');
  await p.waitForSelector('dialog[open] #dr-texto');
  await p.type('#dr-texto', 'Segundo registro pela linha do tempo.');
  await p.evaluate(() => document.querySelector('#dr-texto').closest('dialog').querySelector('button[type="submit"]').click());
  await p.waitForFunction(() => document.querySelector('dialog[open] #lt-bloco')?.innerText.includes('Segundo registro pela linha do tempo.'), { timeout: 10000 });
  assert.equal((await app.api(CHEFE_COF, 'GET', `/acoes/${acao}`)).dados.diario.length, 2);
  await pausa(600);
  assert.equal(await p.evaluate(() => document.querySelectorAll('dialog[open]').length), 1, 'depois de registrar, há uma só ficha aberta (não duas empilhadas)');

  await p.click('[data-registrar-escolher]');
  await p.waitForSelector('[data-escolha="impedimento"]');
  await p.click('[data-escolha="impedimento"]');
  await p.waitForSelector('dialog[open] [name="descricao"], dialog[open] #imp-desc', { timeout: 8000 });
  assert.ok(await p.$('dialog[open] form'), 'o formulário de impedimento abriu');
  await p.keyboard.press('Escape');
  await pausa(500);

  await p.click('[data-registrar-escolher]');
  await p.waitForSelector('[data-escolha="comentario"]');
  await p.click('[data-escolha="comentario"]');
  await p.waitForFunction(() => document.activeElement?.id === 'novo-coment', { timeout: 5000 });
  assert.deepEqual(p.errosDaPagina, []);

  // Excluir um registro e resolver um impedimento continuam funcionando dentro da linha do tempo.
  await p.click('[data-excluir-registro]');
  await p.waitForFunction(() => document.querySelectorAll('dialog[open]').length === 2);
  await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].at(-1).querySelector('button[type="submit"]').click());
  await p.waitForFunction(() => document.querySelector('dialog[open] #lt-bloco') && document.querySelectorAll('dialog[open] #lt-bloco .diario-item').length === 1, { timeout: 10000 });
  assert.equal((await app.api(CHEFE_COF, 'GET', `/acoes/${acao}`)).dados.diario.length, 1);
  assert.deepEqual(p.errosDaPagina, []);
});

test('Painel do Diretor: ele vê o que pede a sua decisão e inicia a reunião a um clique', async (t) => {
  const app = await subir(t); if (!app) return;
  const acao = (await app.api(CHEFE_COF, 'POST', '/acoes', { titulo: 'Ação com trava', prazo: '2026-12-31' })).dados.id;
  await app.api(CHEFE_COF, 'POST', `/acoes/${acao}/impedimentos`, { descricao: 'Falta autorização de acesso.', critico: true });
  const p = await abrirNova(app, '#/a-painel', undefined, DIRETOR);
  await p.waitForSelector('#decisao-t', { timeout: 10000 });
  const bloco = await p.$eval('.decisao-painel', (e) => e.innerText);
  assert.match(bloco, /pede a sua decisão|pedem a sua decisão/);
  assert.match(bloco, /impedimento crítico aberto/);
  assert.equal(await p.$eval('.acoes-topo a.btn-primario', (a) => a.textContent), 'Iniciar reunião');
  await p.click('.decisao-painel a[href^="#/centro/"]');
  await p.waitForFunction(() => /#\/centro\/\d+/.test(location.hash), { timeout: 8000 });
  assert.deepEqual(p.errosDaPagina, []);
});

test('Membro: a versão nova tem Meu dia (ações, agenda e diário) e Atas', async (t) => {
  const app = await subir(t); if (!app) return;
  const axe = fs.readFileSync(app.caminhoAxe, 'utf8');
  await app.db.prepare('insert into usuarios (id, nome, email, perfil, secao_id) values (?,?,?,?,?)').run(31, 'Marina Costa', 'marina@exemplo.invalid', 'membro', 2);
  const p = await abrirNova(app, '#/a-meudia', undefined, 31);
  await p.waitForSelector('.abas-area', { timeout: 10000 });
  assert.deepEqual(await p.$$eval('.menu a', (as) => as.map((a) => a.dataset.rota)), ['a-meudia', 'a-atas']);
  assert.deepEqual(await abas(p), ['Minhas ações', 'Agenda', 'Meu diário']);
  assert.equal(await areaAtiva(p), 'a-meudia');
  await p.click('.menu a[data-rota="a-atas"]');
  await p.waitForFunction(() => document.querySelector('.menu a[aria-current="page"]')?.dataset.rota === 'a-atas', { timeout: 10000 });
  assert.deepEqual(await violacoes(p, axe), [], 'Atas do membro não tem violações de acessibilidade');
  // O endereço antigo leva à área, e o botão devolve o menu de sempre.
  await p.evaluate(() => { location.hash = '#/agenda'; });
  await esperarHash(p, /#\/a-meudia\?.*t=agenda/);
  await p.click('#alternar-interface');
  await esperarHash(p, /#\/minhas-acoes/);
  await p.waitForSelector('.menu a[data-rota="agenda"]');
  assert.deepEqual(p.errosDaPagina, []);
});

test('Nova ação: um só botão nas áreas de ações, que abre o formulário certo para cada perfil', async (t) => {
  const app = await subir(t); if (!app) return;
  // Chefe sem subseções: abre direto o formulário da seção. O botão antigo da lista não aparece mais.
  const p = await abrirNova(app, '#/a-acoes');
  await p.waitForSelector('#nova-acao-global', { timeout: 10000 });
  assert.equal(await p.$('#btn-nova-acao'), null, 'a lista não tem mais um segundo botão de nova ação');
  assert.equal(await p.$eval('#nova-acao-global', (b) => b.textContent), '+ Nova ação');
  await p.click('#nova-acao-global');
  await p.waitForSelector('dialog[open] #na-titulo');
  assert.equal(await p.$eval('dialog[open] h2', (h) => h.textContent), 'Nova ação da seção');
  await p.type('#na-titulo', 'Ação criada pelo botão único');
  await p.evaluate(() => document.querySelector('#na-titulo').closest('dialog').querySelector('button[type="submit"]').click());
  await p.waitForFunction(() => !document.querySelector('dialog[open]'), { timeout: 8000 });
  await p.waitForFunction(() => document.querySelector('#conteudo')?.innerText.includes('Ação criada pelo botão único'), { timeout: 10000 });
  assert.equal((await app.api(CHEFE_COF, 'GET', '/acoes')).dados.some((a) => a.titulo === 'Ação criada pelo botão único'), true);
  // Também em Semana não há o botão (não é uma área de ações).
  await p.click('.menu a[data-rota="a-semana"]');
  await p.waitForFunction(() => document.querySelector('.abas-area a[aria-current="page"]')?.textContent.trim() === 'Atualização', { timeout: 10000 });
  assert.equal(await p.$('#nova-acao-global'), null);
  await p.close();

  // Chefe com subseções: pergunta para quem é a ação. "Para uma subseção" leva à tela Direcionar.
  const c = await abrirNova(app, '#/a-acoes', undefined, CHEFE_CPE);
  await c.waitForSelector('#nova-acao-global', { timeout: 10000 });
  await c.click('#nova-acao-global');
  await c.waitForSelector('[data-nova-para="subsecao"]');
  assert.deepEqual(await c.$$eval('[data-nova-para]', (bs) => bs.map((b) => b.dataset.novaPara)), ['secao', 'subsecao']);
  await c.click('[data-nova-para="subsecao"]');
  await esperarHash(c, /#\/a-acoes\?.*t=direcionar/);
  await c.waitForSelector('#form-dir', { timeout: 10000 });
  await c.click('#nova-acao-global');
  await c.waitForSelector('[data-nova-para="secao"]');
  await c.click('[data-nova-para="secao"]');
  await c.waitForSelector('dialog[open] #na-titulo');
  await c.close();

  // Diretor: o botão leva à tela Direcionar, que é o formulário dele.
  const d = await abrirNova(app, '#/a-acoes', undefined, DIRETOR);
  await d.waitForSelector('#nova-acao-global', { timeout: 10000 });
  await d.click('#nova-acao-global');
  await esperarHash(d, /#\/a-acoes\?.*t=direcionar/);
  await d.waitForSelector('#form-dir', { timeout: 10000 });
  assert.deepEqual(d.errosDaPagina, []);
});

test('Ficha da ação na versão nova: próximo passo sugerido e pedido de novo prazo a partir da Situação', async (t) => {
  const app = await subir(t); if (!app) return;
  const acao = (await app.api(CHEFE_COF, 'POST', '/acoes', { titulo: 'Ação sem tarefas', prazo: '2026-12-31' })).dados.id;
  const demandada = (await app.api(DIRETOR, 'GET', '/acoes')).dados.find((a) => a.demandada_diretor && a.secao_id === 2);
  const p = await abrirNova(app, `#/a-acoes?t=minhas-acoes&acao=${acao}`);
  await p.waitForSelector('dialog[open] .situacao-passo', { timeout: 10000 });
  assert.match(await p.$eval('.situacao-passo', (e) => e.innerText), /Próximo passo:/);
  assert.ok(await p.$('.situacao-passo [data-registrar-escolher]'), 'o botão Registrar também fica na Situação');
  assert.equal(await p.$('.situacao-passo [data-pedir-prazo]'), null, 'ação criada pelo chefe: ele altera o prazo, não precisa pedir');
  assert.match(await p.$eval('.situacao-passo', (e) => e.innerText), /Alterar prazo/);
  await p.click('.situacao-passo [data-registrar-escolher]');
  await p.waitForSelector('[data-escolha="registro"]');
  await p.keyboard.press('Escape');

  // Ação demandada pelo Diretor: o chefe não altera o prazo, pede um novo, pela própria Situação.
  assert.ok(demandada, 'os dados de exemplo têm uma ação do COF demandada pelo Diretor');
  await p.close();
  const q = await abrirNova(app, `#/a-acoes?t=minhas-acoes&acao=${demandada.id}`);
  await q.waitForSelector('dialog[open] [data-pedir-prazo]', { timeout: 10000 });
  await q.click('dialog[open] [data-pedir-prazo]');
  await q.waitForSelector('dialog[open] #np');
  await q.type('#jp', 'Aguardando o retorno do jurídico.');
  await q.evaluate(() => document.querySelector('#np').closest('dialog').querySelector('button[type="submit"]').click());
  await q.waitForFunction(() => document.querySelectorAll('dialog[open]').length === 1 && !document.querySelector('dialog[open] [data-pedir-prazo]'), { timeout: 10000 });
  assert.equal((await app.api(CHEFE_COF, 'GET', `/acoes/${demandada.id}`)).dados.pedidos.length >= 1, true, 'o pedido foi enviado');
  assert.match(await q.$eval('.situacao-passo', (e) => e.innerText), /pedido de novo prazo/, 'e o próximo passo passa a falar do pedido');
  assert.deepEqual(q.errosDaPagina, []);
});
