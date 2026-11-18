// Trilho da reunião: os rótulos das datas (Reunião anterior, Lembrete, Fechamento, Reunião) não se sobrepõem nem passam da borda do cartão,
// em tela larga e em tela média. O Fechamento fica a pouco mais de um dia da Reunião, e os dois rótulos lado a lado chegaram a se cobrir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEFE_CPE, DIRETOR, subir } from './ajuda.js';

/** Para cada trilho da tela: os retângulos dos rótulos e do cartão. */
const medir = (p) => p.evaluate(() => [...document.querySelectorAll('.trilho:not(.compacto)')].map((t) => {
  const c = t.getBoundingClientRect();
  return {
    cartao: { esq: c.left, dir: c.right },
    rotulos: [...t.querySelectorAll('.trilho-rotulo')].map((r) => { const b = r.getBoundingClientRect(); return { texto: r.innerText.replace(/\s+/g, ' ').trim(), esq: b.left, dir: b.right, topo: b.top, base: b.bottom }; }),
  };
}));
const cruzam = (a, b) => a.esq < b.dir - 0.5 && b.esq < a.dir - 0.5 && a.topo < b.base - 0.5 && b.topo < a.base - 0.5;

test('Trilho: os rótulos das datas não se sobrepõem nem saem do cartão', async (t) => {
  const app = await subir(t); if (!app) return;
  for (const [uid, rota, largura] of [[DIRETOR, '#/painel', 1440], [DIRETOR, '#/painel', 1100], [CHEFE_CPE, '#/inicio', 1440], [CHEFE_CPE, '#/inicio', 1100]]) {
    const p = await app.abrir(uid, rota, { largura });
    await p.waitForSelector('.trilho-rotulo', { timeout: 10000 });
    const trilhos = await medir(p);
    assert.ok(trilhos.length >= 1);
    for (const tr of trilhos) {
      assert.ok(tr.rotulos.length >= 4, 'os quatro rótulos existem');
      for (let i = 0; i < tr.rotulos.length; i += 1) {
        const a = tr.rotulos[i];
        assert.ok(a.esq >= tr.cartao.esq - 1 && a.dir <= tr.cartao.dir + 1, `${uid}@${largura}: "${a.texto}" sai do cartão`);
        for (let j = i + 1; j < tr.rotulos.length; j += 1) {
          assert.equal(cruzam(a, tr.rotulos[j]), false, `${uid}@${largura}: "${a.texto}" cobre "${tr.rotulos[j].texto}"`);
        }
      }
    }
    assert.deepEqual(p.errosDaPagina, []);
    await p.close();
  }
});
