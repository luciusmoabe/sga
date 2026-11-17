// Diário de progresso pela tela: registrar a partir do cartão, apontar a tarefa (e concluí-la), ver a linha do tempo na ficha,
// filtrar, registrar a partir da própria tarefa, retificar, e o ponto de vista do membro, do Diretor e do celular.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEFE_COF, DIRETOR, esperarTexto, subir } from './ajuda.js';

const MARINA = 31;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const texto = (p, sel = '#conteudo') => p.evaluate((s) => document.querySelector(s).innerText, sel);
const violacoes = (p, axe, raiz = 'document') => p.evaluate(async (js, r) => { eval(js); return (await window.axe.run(r === 'document' ? document : document.querySelector(r), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`); }, axe, raiz);

async function preparar(t) {
  const app = await subir(t); if (!app) return null;
  await app.db.prepare('insert into usuarios (id, nome, email, perfil, secao_id) values (?,?,?,?,?)').run(MARINA, 'Marina Costa', 'marina@exemplo.invalid', 'membro', 2);
  const acao = (await app.api(CHEFE_COF, 'POST', '/acoes', { titulo: 'Manifestar-se sobre o contrato', prazo: '2026-12-31', responsavel_id: MARINA })).dados.id;
  const t1 = (await app.api(CHEFE_COF, 'POST', `/acoes/${acao}/checklist`, { texto: 'Minuta do ofício', responsavel_id: MARINA })).dados.id;
  const t2 = (await app.api(CHEFE_COF, 'POST', `/acoes/${acao}/checklist`, { texto: 'Conferir o empenho' })).dados.id;
  return { app, acao, t1, t2, axe: fs.readFileSync(app.caminhoAxe, 'utf8') };
}
// Envia o formulário de registro (com a ficha aberta por baixo, há dois diálogos: o botão certo é o do que tem o campo de texto).
const enviar = (p) => p.evaluate(() => document.querySelector('#dr-texto').closest('dialog').querySelector('button[type="submit"]').click());
const cartaoDe = (p, titulo) => p.evaluateHandle((t) => [...document.querySelectorAll('article.acao')].find((c) => c.querySelector('h3').textContent === t), titulo);

test('Chefe: registra no cartão apontando a tarefa e concluindo-a; vê o diário na ficha, filtra, registra pela tarefa e retifica', async (t) => {
  const prep = await preparar(t); if (!prep) return;
  const { app, acao, t1, t2, axe } = prep;
  const p = await app.abrir(CHEFE_COF, '#/minhas-acoes');
  await p.waitForSelector('article.acao');

  // 1. Pelo cartão: o botão existe, o formulário abre, a caixa "concluir" só vale com tarefa escolhida e a dica do impedimento aparece.
  const cartao = await cartaoDe(p, 'Manifestar-se sobre o contrato');
  await (await cartao.$('[data-registrar]')).click();
  await p.waitForSelector('dialog[open] #dr-texto');
  assert.equal(await p.$eval('#dr-concluir', (c) => c.disabled), true, 'sem tarefa escolhida, não dá para concluir');
  assert.deepEqual(await p.$$eval('#dr-tarefa option', (os) => os.map((o) => o.textContent)), ['Geral da ação', 'Minuta do ofício', 'Conferir o empenho']);
  await p.select('#dr-tipo', 'impedimento');
  assert.equal(await p.$eval('#dr-dica-imp', (e) => e.classList.contains('oculto')), false, 'dica: o registro só documenta o impedimento');
  await p.select('#dr-tipo', 'entrega');
  assert.equal(await p.$eval('#dr-dica-imp', (e) => e.classList.contains('oculto')), true);

  await p.type('#dr-texto', 'Minuta revisada e enviada ao jurídico.');
  await p.select('#dr-tarefa', String(t1));
  assert.equal(await p.$eval('#dr-concluir', (c) => c.disabled), false, 'com tarefa escolhida, pode concluí-la');
  await p.click('#dr-concluir');
  await p.type('#dr-min', '30');
  await p.type('#dr-ref', 'SEI 052.3010.2026.0005350-55');
  const falhas = await violacoes(p, axe, 'dialog[open]');
  assert.deepEqual(falhas, [], 'o formulário de registro não tem violações de acessibilidade');
  await enviar(p);
  await p.waitForFunction(() => !document.querySelector('dialog[open]'), { timeout: 8000 });

  // O cartão passa a mostrar o último registro; o servidor guardou tudo.
  await esperarTexto(p, 'Último registro hoje · Bruno Tavares');
  assert.match(await texto(p), /Minuta revisada e enviada ao jurídico/);
  const d1 = (await app.api(CHEFE_COF, 'GET', `/acoes/${acao}`)).dados;
  assert.equal(d1.diario.length, 1);
  assert.equal(d1.diario[0].tipo, 'entrega');
  assert.equal(d1.diario[0].tarefa_id, t1);
  assert.equal(d1.tempo_total, 30);
  assert.equal(d1.checklist.find((c) => c.id === t1).concluido, true, 'a tarefa foi concluída pelo registro');

  // 2. Na ficha: a seção abre sozinha com o registro, a tarefa mostra o contador, e o contador leva ao diário filtrado.
  await p.evaluate(() => [...document.querySelectorAll('article.acao')].find((c) => c.querySelector('h3').textContent === 'Manifestar-se sobre o contrato').querySelector('[data-detalhe]').click());
  await p.waitForSelector('dialog[open] #diario-bloco');
  assert.match(await texto(p, 'dialog[open]'), /Diário de progresso \(1\)/);
  assert.equal(await p.$eval('#diario-bloco', (e) => e.closest('details').open), true, 'abre sozinha porque há registros');
  assert.match(await texto(p, '#diario-bloco'), /Entrega/);
  assert.match(await texto(p, '#diario-bloco'), /Tarefa: Minuta do ofício/);
  assert.match(await texto(p, '#diario-bloco'), /SEI 052\.3010\.2026\.0005350-55/);
  assert.match(await texto(p, 'dialog[open] #acao-checklist-bloco'), /1 registro no diário/);

  // 3. Registrar pela própria tarefa: já vem escolhida.
  await p.click('dialog[open] [data-registrar-tarefa]');
  await p.waitForSelector('dialog[open] dialog[open], dialog[open] #dr-texto', { timeout: 4000 }).catch(() => {});
  await p.waitForFunction(() => document.querySelectorAll('dialog[open] #dr-texto').length === 1);
  const escolhida = await p.$eval('#dr-tarefa', (s) => s.options[s.selectedIndex].textContent);
  assert.equal(escolhida, 'Conferir o empenho', 'a tarefa do botão já vem escolhida');
  await p.type('#dr-texto', 'Empenho conferido: falta apenas a nota fiscal.');
  await enviar(p);
  await p.waitForFunction(() => document.querySelector('#diario-bloco') && /Diário de progresso \(2\)/.test(document.querySelector('dialog[open]')?.innerText || ''), { timeout: 8000 });

  // 4. Filtros: por tipo e por tarefa.
  assert.equal((await p.$$('#diario-bloco .diario-item')).length, 2);
  await p.click('[data-diario-tipo="entrega"]');
  assert.equal((await p.$$('#diario-bloco .diario-item')).length, 1);
  assert.match(await texto(p, '#diario-bloco'), /Minuta revisada/);
  await p.click('[data-diario-tipo=""]');
  await p.select('#diario-tarefa', String(t2));
  assert.equal((await p.$$('#diario-bloco .diario-item')).length, 1);
  assert.match(await texto(p, '#diario-bloco'), /Empenho conferido/);
  await p.select('#diario-tarefa', '');

  // 5. A ficha com o diário passa no axe.
  assert.deepEqual(await violacoes(p, axe, 'dialog[open]'), [], 'a ficha com o diário não tem violações de acessibilidade');

  // 6. Retificar: o novo registro aponta o anterior, que fica marcado.
  await p.evaluate(() => [...document.querySelectorAll('#diario-bloco [data-retificar]')].at(-1).click()); // o mais antigo (a entrega)
  await p.waitForSelector('dialog[open] #dr-texto');
  assert.equal(await p.$eval('#dr-texto', (e) => e.closest('dialog').querySelector('h2').textContent), 'Retificar registro');
  assert.match(await p.$eval('#dr-texto', (e) => e.closest('dialog').innerText), /Você está retificando o registro de/);
  await p.type('#dr-texto', 'Correção: a minuta foi enviada à consultoria, não ao jurídico.');
  await enviar(p);
  await p.waitForFunction(() => /Diário de progresso \(3\)/.test(document.querySelector('dialog[open]')?.innerText || ''), { timeout: 8000 });
  assert.equal(await p.$$eval('#diario-bloco .pilula', (ps) => ps.filter((x) => x.textContent.trim() === 'Retificado').length), 1);
  assert.deepEqual(p.errosDaPagina, []);
});

test('Membro e Diretor: o membro executor registra; o Diretor lê o diário mas não vê o botão de registrar', async (t) => {
  const prep = await preparar(t); if (!prep) return;
  const { app, acao } = prep;
  assert.equal((await app.api(MARINA, 'POST', `/acoes/${acao}/diario`, { texto: 'Comecei a levantar os dados.', tipo: 'andamento' })).status, 201);

  const m = await app.abrir(MARINA, '#/minhas-acoes');
  await m.waitForSelector('article.acao');
  assert.ok(await m.$('article.acao [data-registrar]'), 'o membro executor tem o botão no cartão');
  assert.match(await texto(m), /Último registro hoje · Marina Costa/);

  const d = await app.abrir(DIRETOR, `#/acoes?acao=${acao}`);
  await d.waitForSelector('dialog[open] #diario-bloco', { timeout: 10000 });
  assert.match(await texto(d, 'dialog[open]'), /Diário de progresso \(1\)/);
  assert.match(await texto(d, '#diario-bloco'), /Comecei a levantar os dados/);
  assert.equal(await d.$('dialog[open] [data-novo-registro]'), null, 'o Diretor não registra');
  assert.equal(await d.$('dialog[open] [data-registrar-tarefa]'), null);
  assert.deepEqual(d.errosDaPagina, []);
});

test('Celular: o botão e o formulário de registro cabem na tela e têm alvo de toque', async (t) => {
  const prep = await preparar(t); if (!prep) return;
  const { app } = prep;
  const p = await app.abrir(CHEFE_COF, '#/minhas-acoes', { largura: 390, altura: 844, celular: true });
  await p.waitForSelector('article.acao');
  const botao = await p.$('article.acao [data-registrar]');
  assert.ok(botao);
  const m = await p.evaluate(() => ({ pagina: document.documentElement.scrollWidth, janela: innerWidth, botao: document.querySelector('[data-registrar]').getBoundingClientRect().height }));
  assert.ok(m.pagina <= m.janela, `sem rolagem horizontal (${m.pagina} > ${m.janela})`);
  await botao.click();
  await p.waitForSelector('dialog[open] #dr-texto');
  const f = await p.evaluate(() => ({ largura: document.querySelector('dialog[open] form').getBoundingClientRect().width, janela: innerWidth, enviar: document.querySelector('dialog[open] button[type="submit"]').getBoundingClientRect().height }));
  assert.ok(f.largura <= f.janela, 'o formulário cabe na largura da tela');
  assert.ok(f.enviar >= 44, 'botão de enviar com alvo de toque');
  await pausa(100);
  assert.deepEqual(p.errosDaPagina, []);
});

test('Chefe: excluir um registro do diário e excluir uma tarefa que tem registros pedem confirmação e avisam o que sai junto', async (t) => {
  const prep = await preparar(t); if (!prep) return;
  const { app, acao, t1, t2, axe } = prep;
  const r1 = (await app.api(CHEFE_COF, 'POST', `/acoes/${acao}/diario`, { texto: 'Primeiro registro da minuta.', tarefa_id: t1 })).dados.registro.id;
  await app.api(CHEFE_COF, 'POST', `/acoes/${acao}/diario`, { texto: 'Segundo registro da minuta.', tarefa_id: t1 });
  await app.api(CHEFE_COF, 'POST', `/acoes/${acao}/diario`, { texto: 'Registro do empenho.', tarefa_id: t2 });
  const p = await app.abrir(CHEFE_COF, `#/minhas-acoes?acao=${acao}`);
  await p.waitForSelector('dialog[open] #diario-bloco', { timeout: 10000 });
  const confirmarUltimo = () => p.evaluate(() => [...document.querySelectorAll('dialog[open]')].at(-1).querySelector('button[type="submit"]').click());
  const textoUltimo = () => p.evaluate(() => [...document.querySelectorAll('dialog[open]')].at(-1).innerText);

  // 1. Excluir um registro: confirma, e só ele sai.
  await p.click(`[data-excluir-registro="${r1}"]`);
  await p.waitForFunction(() => document.querySelectorAll('dialog[open]').length === 2);
  assert.match(await textoUltimo(), /Excluir o registro do diário/);
  assert.deepEqual(await violacoes(p, axe, 'dialog[open]:last-of-type'), [], 'a confirmação não tem violações de acessibilidade');
  await confirmarUltimo();
  await p.waitForFunction(() => !document.querySelector('#diario-bloco')?.innerText.includes('Primeiro registro da minuta'), { timeout: 8000 });
  assert.equal((await app.api(CHEFE_COF, 'GET', `/acoes/${acao}`)).dados.diario.length, 2);

  // 2. Excluir a tarefa que ainda tem 1 registro: o aviso diz quantos saem junto; cancelar não exclui nada.
  await p.click(`[data-excluir-check="${t1}"]`);
  await p.waitForFunction(() => document.querySelectorAll('dialog[open]').length === 2);
  assert.match(await textoUltimo(), /1 registro no diário de progresso.*esse registro será excluído também/s);
  await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].at(-1).querySelector('[data-fechar]').click());
  await p.waitForFunction(() => document.querySelectorAll('dialog[open]').length === 1);
  assert.equal((await app.api(CHEFE_COF, 'GET', `/acoes/${acao}`)).dados.checklist.length, 2, 'cancelar não exclui a tarefa');
  await p.click(`[data-excluir-check="${t1}"]`);
  await p.waitForFunction(() => document.querySelectorAll('dialog[open]').length === 2);
  await confirmarUltimo();
  await p.waitForFunction(() => document.querySelectorAll('dialog[open] [data-excluir-check]').length === 1, { timeout: 8000 });
  const d = (await app.api(CHEFE_COF, 'GET', `/acoes/${acao}`)).dados;
  assert.deepEqual(d.checklist.map((c) => c.id), [t2]);
  assert.deepEqual(d.diario.map((x) => x.texto), ['Registro do empenho.']);

  assert.deepEqual(p.errosDaPagina, []);
});

test('Meu diário e Diário da seção: períodos, filtros, abrir a ação, e o membro só tem o dele', async (t) => {
  const prep = await preparar(t); if (!prep) return;
  const { app, acao, t1, axe } = prep;
  const acao2 = (await app.api(CHEFE_COF, 'POST', '/acoes', { titulo: 'Preparar a prestação de contas', prazo: '2026-12-31' })).dados.id;
  await app.api(CHEFE_COF, 'POST', `/acoes/${acao}/diario`, { texto: 'Minuta enviada ao jurídico.', tarefa_id: t1, tipo: 'entrega', minutos: 45 });
  await app.api(MARINA, 'POST', `/acoes/${acao}/diario`, { texto: 'Levantei os dados do contrato.' });
  await app.api(CHEFE_COF, 'POST', `/acoes/${acao2}/diario`, { texto: 'Reuni os comprovantes.', tipo: 'observacao' });

  const p = await app.abrir(CHEFE_COF, '#/diario');
  await p.waitForSelector('#conteudo .diario-item');
  assert.equal((await p.$$('#conteudo .diario-item')).length, 2, 'só o que o chefe registrou');
  assert.doesNotMatch(await texto(p), /Levantei os dados/);
  assert.match(await texto(p), /Tarefa: Minuta do ofício/);
  assert.deepEqual(await violacoes(p, axe, '#conteudo'), [], 'Meu diário não tem violações de acessibilidade');

  // Diário da seção: de todos; o filtro por pessoa aparece e filtra.
  await p.click('[data-escopo="secao"]');
  await p.waitForFunction(() => document.querySelectorAll('#conteudo .diario-item').length === 3, { timeout: 8000 });
  assert.match(await texto(p), /Levantei os dados do contrato/);
  await p.select('#dt-pessoa', String(MARINA));
  assert.equal((await p.$$('#conteudo .diario-item')).length, 1);
  await p.select('#dt-pessoa', '');
  await p.select('#dt-tipo', 'entrega');
  assert.equal((await p.$$('#conteudo .diario-item')).length, 1);
  await p.click('#dt-limpar');
  assert.equal((await p.$$('#conteudo .diario-item')).length, 3);
  assert.deepEqual(await violacoes(p, axe, '#conteudo'), [], 'Diário da seção não tem violações de acessibilidade');

  // Período livre: pede as datas e recarrega.
  await p.select('#dt-periodo', 'livre');
  await p.waitForSelector('#dt-de');
  assert.equal((await p.$$('#conteudo .diario-item')).length, 3);

  // Abrir a ação pelo registro.
  await p.click('#conteudo [data-abrir]');
  await p.waitForSelector('dialog[open] #diario-bloco', { timeout: 10000 });
  assert.deepEqual(p.errosDaPagina, []);

  // O membro só tem o próprio diário.
  const m = await app.abrir(MARINA, '#/diario');
  await m.waitForSelector('#conteudo .diario-item');
  assert.equal((await m.$$('#conteudo .diario-item')).length, 1);
  assert.equal(await m.$('[data-escopo]'), null, 'o membro não tem o diário da seção');
  assert.deepEqual(m.errosDaPagina, []);
});
