// Uso das telas (Diretor e Administrador): quantas vezes cada tela foi aberta no período, em que versão da interface e por quais perfis, e quais
// telas ninguém abriu. É a base para decidir o que simplificar ou retirar. A contagem é anônima: o servidor soma aberturas por tela, perfil e versão,
// sem guardar quem abriu. Dados de GET /api/uso; só leitura.
import { get } from './api.js';
import { est } from './estado.js';
import { $, addDias, br, esc, on, vazio } from './ui.js';
import { resumoDeUso } from './uso-resumo.js';

const PERIODOS = [['7', 'Últimos 7 dias'], ['28', 'Últimos 28 dias'], ['90', 'Últimos 90 dias']];
const PERFIL = { diretor: 'Diretor', apoio: 'Apoio', chefe: 'Chefe', membro: 'Membro', consulta: 'Consulta', administrador: 'Administrador' };

/** `telas`: as telas que existem para acompanhar ({ tela, titulo }), vindas da casca (main.js). */
export async function usoTelas(raiz, _params, { telas }) {
  const hoje = est.boot.hoje;
  let dias = '28';
  const titulo = (t) => telas.find((x) => x.tela === t)?.titulo || t;

  const desenhar = async () => {
    const r = await get(`/uso?de=${addDias(hoje, -(Number(dias) - 1))}&ate=${hoje}`);
    const s = resumoDeUso(r.linhas, telas.map((x) => x.tela));
    const max = s.telas[0]?.total || 1;
    raiz.innerHTML = `
      <div class="cabeca"><div><h1>Uso das telas</h1>
        <p class="suave">Quantas vezes cada tela foi aberta, em que versão da interface e por quais perfis. A contagem é anônima: não mostra quem abriu.</p></div></div>
      <div class="cartao"><div class="campo" style="max-width:240px;margin:0"><label for="uso-periodo">Período</label>
        <select id="uso-periodo">${PERIODOS.map(([v, rot]) => `<option value="${v}" ${v === dias ? 'selected' : ''}>${rot}</option>`).join('')}</select></div>
        <p class="suave pequeno" style="margin:10px 0 0">${r.desde ? `Contando desde ${br(r.desde)}.` : 'Ainda não há registros.'} ${s.total ? `${s.total} aberturas no período.` : ''}</p></div>
      ${s.telas.length ? `<div class="tabela-rolagem"><table class="tabela-lista"><thead><tr><th>Tela</th><th>Aberturas</th><th>Versão atual</th><th>Versão nova</th><th>Quem abre</th></tr></thead><tbody>
        ${s.telas.map((t) => `<tr><td data-rotulo="Tela"><b>${esc(titulo(t.tela))}</b></td>
          <td data-rotulo="Aberturas"><span class="num">${t.total}</span> <span class="uso-barra" aria-hidden="true"><i style="width:${Math.max(2, Math.round((t.total / max) * 100))}%"></i></span></td>
          <td data-rotulo="Versão atual" class="num">${t.atual}</td><td data-rotulo="Versão nova" class="num">${t.nova}</td>
          <td data-rotulo="Quem abre">${Object.entries(t.perfis).sort((a, b) => b[1] - a[1]).map(([p, n]) => `<span class="pilula">${esc(PERFIL[p] || p)} <b class="num">${n}</b></span>`).join(' ')}</td></tr>`).join('')}
        </tbody></table></div>` : `<div class="cartao">${vazio('Nenhuma abertura registrada neste período', 'A contagem começa quando as pessoas usam o sistema depois desta atualização.')}</div>`}
      ${s.nuncaAbertas.length && r.desde ? `<section class="cartao" aria-labelledby="uso-nunca-t"><h2 id="uso-nunca-t">Ninguém abriu neste período</h2>
        <p class="suave pequeno">Telas que existem, mas não foram abertas. Antes de retirar uma, confira se ela é de uso raro de propósito (por exemplo, a configuração).</p>
        <p>${[...new Set(s.nuncaAbertas.map(titulo))].map((t) => `<span class="pilula">${esc(t)}</span>`).join(' ')}</p></section>` : ''}`;
  };
  on(raiz, 'change', '#uso-periodo', async (el) => { dias = el.value; await desenhar(); $('#uso-periodo', raiz)?.focus(); });
  await desenhar();
}
