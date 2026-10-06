import { get, post } from './api.js';
import { podeOperar } from './estado.js';
import { abrirForm, dataHora, esc, on, toast } from './ui.js';

const TIPOS = { correcao: 'Correção', inclusao: 'Inclusão', supressao: 'Supressão' };
const STATUS = { pendente: 'Pendente', acolhida: 'Acolhida', nao_acolhida: 'Não acolhida' };

export function ligarRevisaoAta(raiz, r) {
  if (r.status !== 'enviada') return;
  const painel = document.createElement('div');
  painel.className = 'cartao nao-imprimir';
  painel.style.marginTop = '16px';
  raiz.append(painel);
  const desenhar = () => {
    painel.innerHTML = `<h2>Sugestões de revisão da ata</h2>
      <p class="suave pequeno">Pedidos de correção, inclusão ou supressão ficam registrados com a resposta da gestão. A ata só muda após revisão pela gestão, e as versões publicadas são preservadas.</p>
      ${r.pode_sugerir ? '<button type="button" class="btn btn-sec" data-sugerir-ata>Sugerir revisão</button>' : !podeOperar() ? '<p class="suave pequeno">Somente chefes e suplentes registrados como presentes podem enviar sugestões.</p>' : ''}
      ${r.sugestoes.length ? r.sugestoes.map((s) => `<article class="item" style="display:block;margin-top:12px"><div class="linha entre"><b>${TIPOS[s.tipo]} · ${esc(s.usuario_nome)}</b><span class="pilula">${STATUS[s.status]}</span></div>
        <p style="white-space:pre-wrap">${esc(s.texto)}</p><small class="suave">${dataHora(s.criada_em)}</small>
        ${s.resposta ? `<p style="white-space:pre-wrap"><b>Resposta:</b> ${esc(s.resposta)}</p><small class="suave">${esc(s.respondida_por_nome || '')} · ${dataHora(s.respondida_em)}</small>` : podeOperar() ? `<button type="button" class="btn btn-sec btn-mini" data-responder-ata="${s.id}">Revisar e responder</button>` : ''}</article>`).join('') : '<p class="suave pequeno">Nenhuma sugestão registrada.</p>'}
      ${r.revisoes.length ? `<details style="margin-top:16px"><summary>Histórico de versões publicadas (${r.revisoes.length})</summary>${r.revisoes.map((v, i) => `<details style="margin:10px 0"><summary>Versão ${r.revisoes.length - i} · ${dataHora(v.criada_em)}${v.criado_por_nome ? ` · ${esc(v.criado_por_nome)}` : ''}</summary><pre style="white-space:pre-wrap;font:inherit">${esc(v.ata_texto)}</pre></details>`).join('')}</details>` : ''}`;
  };
  const recarregar = async () => {
    const nova = await get(`/reunioes/${r.id}`);
    r.sugestoes = nova.sugestoes; r.revisoes = nova.revisoes; r.pode_sugerir = nova.pode_sugerir;
    desenhar();
  };
  on(painel, 'click', '[data-sugerir-ata]', () => abrirForm({
    titulo: 'Sugerir revisão da ata',
    corpo: `<div class="campo"><label for="sa-tipo">Tipo de revisão</label><select id="sa-tipo" name="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div><div class="campo"><label for="sa-texto">Trecho e alteração sugerida</label><textarea id="sa-texto" name="texto" maxlength="2000" required placeholder="Indique o trecho da ata e explique o que precisa mudar."></textarea></div>`,
    rotulo: 'Enviar sugestão',
    aoEnviar: async (d) => { await post(`/reunioes/${r.id}/sugestoes`, d); await recarregar(); toast('Sugestão enviada para revisão.'); },
  }));
  on(painel, 'click', '[data-responder-ata]', (el) => {
    const s = r.sugestoes.find((x) => x.id === Number(el.dataset.responderAta));
    abrirForm({
      titulo: 'Responder à sugestão',
      corpo: `<p style="white-space:pre-wrap">${esc(s.texto)}</p><p class="suave pequeno">Ao acolher, o texto atual do editor da ata será salvo junto com a resposta. Revise o editor antes de confirmar.</p><div class="campo"><label for="sa-status">Resultado</label><select id="sa-status" name="status"><option value="acolhida">Acolhida</option><option value="nao_acolhida">Não acolhida</option></select></div><div class="campo"><label for="sa-resposta">Resposta ao participante</label><textarea id="sa-resposta" name="resposta" maxlength="2000" required></textarea></div>`,
      aoEnviar: async (d) => {
        const area = raiz.querySelector('#ata');
        const dados = { ...d, ...(d.status === 'acolhida' && area ? { ata_texto: area.value, ata_base: r.ata_texto } : {}) };
        await post(`/reunioes/${r.id}/sugestoes/${s.id}/responder`, dados);
        if (dados.ata_texto !== undefined) r.ata_texto = dados.ata_texto.trim().slice(0, 20000);
        await recarregar(); toast('Resposta registrada.');
      },
    });
  });
  desenhar();
  return recarregar;
}
