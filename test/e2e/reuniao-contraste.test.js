// Modo Reunião (fundo escuro): a ficha da ação e os formulários abertos por cima têm de continuar legíveis (contraste mínimo do WCAG AA),
// nas duas versões da ficha. Os diálogos do modo TV trocam as cores-base por uma paleta escura (`.tv dialog` em estilo.css).
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DIRETOR, CHEFE_COF, clicarTexto, subir } from './ajuda.js';

test('Modo Reunião: a ficha da ação, antiga e nova, não tem texto ilegível sobre o fundo escuro', async (t) => {
  const app = await subir(t); if (!app) return;
  const axe = fs.readFileSync(app.caminhoAxe, 'utf8');
  const acao = (await app.api(CHEFE_COF, 'POST', '/acoes', { titulo: 'Integração da API ao Barramento', prazo: '2026-12-31', detalhe: 'Demanda originada por SEI' })).dados.id;
  await app.api(CHEFE_COF, 'POST', `/acoes/${acao}/checklist`, { texto: 'Uso da funcionalidade de requisição externa em homologação', data: '2026-12-07' });
  await app.api(CHEFE_COF, 'PATCH', `/acoes/${acao}`, { status: 'em_andamento' });
  await app.api(CHEFE_COF, 'POST', `/acoes/${acao}/impedimentos`, { descricao: 'Deliberação', gravidade: 'critico', apoio: 'Agendar reunião' });
  const p = await app.abrir(DIRETOR, '#/reuniao');
  await clicarTexto(p, 'button', 'Iniciar reunião');
  await p.waitForSelector('.tv-app');
  for (const nova of ['0', '1']) {
    await p.evaluate(async (id, n) => {
      localStorage.setItem('agilis:nova-interface', n);
      (await import('/js/acao-comum.js')).abrirAcao(id);
    }, acao, nova);
    await p.waitForSelector('dialog[open] h2', { timeout: 10000 });
    const falhas = await p.evaluate(async (js) => {
      eval(js);
      const r = await window.axe.run(document.querySelector('dialog[open]'), { runOnly: ['color-contrast'] });
      return r.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')}: ${n.any[0]?.message}`));
    }, axe);
    assert.deepEqual(falhas, [], `contraste da ficha no Modo Reunião (versão nova da interface: ${nova === '1'})`);
    await p.evaluate(() => document.querySelector('dialog[open] [data-fechar]')?.click());
    await p.waitForFunction(() => !document.querySelector('dialog[open]'), { timeout: 5000 });
  }
});
