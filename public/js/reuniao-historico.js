import { get, post, put, patch, del } from './api.js';
import { podeOperar } from './estado.js';
import { abrirForm, confirmar, esc, on, toast } from './ui.js';

export function ligarRegistrosHistoricos(raiz, r) {
  if (!podeOperar() || !['rascunho', 'enviada'].includes(r.status)) return;
  const presenca = raiz.querySelector('[data-presenca-historica]');
  const informacoes = raiz.querySelector('[data-informacoes-historicas]');
  const aviso = '<p class="suave pequeno">Os registros ficam salvos nesta reunião. Para incluí-los no texto da ata e no PDF, revise o editor da ata e salve as alterações.</p>';
  const desenhar = () => {
    presenca.innerHTML = `<h2>Participantes</h2>${r.participantes.length ? `<ul>${r.participantes.map(p => `<li>${esc(p.nome)}${p.secao_nome ? ` · ${esc(p.secao_nome)}` : ''}</li>`).join('')}</ul>` : '<p class="suave pequeno">Nenhuma presença registrada.</p>'}<button type="button" class="btn btn-sec" data-presenca>Registrar presença</button>${aviso}`;
    informacoes.innerHTML = `<h2>Informações e comunicados</h2>${r.informacoes.map(i => `<article class="item" style="display:block"><p style="white-space:pre-wrap">${esc(i.texto)}</p><div class="linha"><button type="button" class="btn btn-sec btn-mini" data-editar-info="${i.id}">Editar</button><button type="button" class="btn btn-fantasma btn-mini" data-excluir-info="${i.id}">Excluir</button></div></article>`).join('') || '<p class="suave pequeno">Nenhuma informação registrada.</p>'}<button type="button" class="btn btn-sec" data-nova-info>Registrar informação</button>${aviso}`;
  };
  const recarregar = async () => {
    const nova = await get(`/reunioes/${r.id}`);
    r.participantes = nova.participantes;
    r.informacoes = nova.informacoes;
    desenhar();
  };
  on(presenca, 'click', '[data-presenca]', async () => {
    try {
      const candidatos = await get(`/reunioes/${r.id}/candidatos`);
      const pessoas = [...candidatos];
      // Mantém participantes já registrados mesmo que sua conta esteja inativa.
      for (const p of r.participantes) if (!pessoas.some(u => u.id === p.usuario_id)) pessoas.push({ ...p, id: p.usuario_id });
      const presentes = new Set(r.participantes.map(p => p.usuario_id));
      abrirForm({
        titulo: 'Quem participou da reunião?',
        corpo: `<p>Marque quem participou, incluindo titulares e suplentes. Chefes presentes poderão sugerir revisões da ata publicada.</p><div class="escolha">${pessoas.map(u => `<label><input type="checkbox" name="participante" value="${u.id}" ${presentes.has(u.id) ? 'checked' : ''}> ${esc(u.nome)}${u.secao_nome ? ` · ${esc(u.secao_nome)}` : ''}</label>`).join('')}</div>`,
        rotulo: 'Salvar presença',
        aoEnviar: async (d, form) => {
          await put(`/reunioes/${r.id}/participantes`, { usuarios: [...form.querySelectorAll('input[name=participante]:checked')].map(el => Number(el.value)) });
          await recarregar(); toast('Presença registrada.');
        },
      });
    } catch (e) { toast(e.message, 'erro'); }
  });
  const formInformacao = (info) => abrirForm({
    titulo: info ? 'Editar informação' : 'Registrar informação',
    corpo: `<div class="campo"><label for="historico-info">Informação relativa à reunião</label><textarea id="historico-info" name="texto" maxlength="2000" required>${esc(info?.texto || '')}</textarea></div>`,
    rotulo: info ? 'Salvar informação' : 'Registrar informação',
    aoEnviar: async d => {
      if (info) await patch(`/reunioes/${r.id}/informacoes/${info.id}`, d);
      else await post(`/reunioes/${r.id}/informacoes`, d);
      await recarregar(); toast('Informação salva.');
    },
  });
  on(informacoes, 'click', '[data-nova-info]', () => formInformacao());
  on(informacoes, 'click', '[data-editar-info]', el => formInformacao(r.informacoes.find(i => i.id === Number(el.dataset.editarInfo))));
  on(informacoes, 'click', '[data-excluir-info]', async el => {
    try {
      if (!await confirmar({ titulo: 'Excluir informação', texto: 'Excluir este registro da reunião?', rotulo: 'Excluir informação', perigo: true })) return;
      await del(`/reunioes/${r.id}/informacoes/${el.dataset.excluirInfo}`);
      await recarregar(); toast('Informação excluída.');
    } catch (e) { toast(e.message, 'erro'); }
  });
  desenhar();
}
