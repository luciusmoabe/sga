// Configuração › Reunião: resumo do que está valendo, formulário (periodicidade, dia, horário e data da próxima reunião) e uma
// prévia das próximas reuniões que se atualiza enquanto a pessoa mexe nos campos.
import { get, put } from './api.js';
import { atualizarSessao, est } from './estado.js';
import { HORA_FECHAMENTO } from './regras.js';
import { parseData, somarDias } from './datas.js';
import { br, esc, toast } from './ui.js';

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const diaDe = (data) => parseData(data).getUTCDay();

/** O dia da semana `dia` mais próximo de `data` (até 3 dias de distância): mantém o ritmo depois de uma reunião adiada ou adiantada. */
const maisProximo = (data, dia) => {
  let d = (((dia - diaDe(data)) % 7) + 7) % 7;
  if (d > 3) d -= 7;
  return somarDias(data, d);
};
/** A primeira data em `dia` a partir de `data` (inclusive). */
const aPartirDe = (data, dia) => somarDias(data, (((dia - diaDe(data)) % 7) + 7) % 7);
/** A série a partir da próxima reunião: a data marcada e as seguintes, a cada `intervalo` dias, no dia configurado. */
export function serieDeReunioes(primeira, dia, intervalo, n = 5) {
  const lista = [primeira];
  while (lista.length < n) lista.push(maisProximo(somarDias(lista.at(-1), intervalo), dia));
  return lista;
}

const resumoHTML = (boot) => {
  const intervalo = boot.reuniao_intervalo === 14 ? 14 : 7;
  const veespera = somarDias(boot.semana, -1);
  return `<div class="estrutura-resumo" aria-label="Situação atual da reunião">
    <div><strong>${br(boot.semana).slice(0, 5)}</strong><span>Próxima reunião · ${DIAS[diaDe(boot.semana)]}, ${esc(boot.reuniao_hora || '10:00')}</span></div>
    <div><strong>${intervalo === 14 ? 'Quinzenal' : 'Semanal'}</strong><span>Periodicidade</span></div>
    <div><strong>${br(veespera).slice(0, 5)}</strong><span>Fim do prazo dos relatos · ${HORA_FECHAMENTO}h</span></div>
  </div>`;
};

const itemHTML = (data, i, { dia, hora, alterada }) => {
  const [, m, d] = data.split('-');
  const veespera = somarDias(data, -1);
  return `<li class="reuniao-item${i === 0 ? ' proxima' : ''}">
    <span class="reuniao-data" aria-hidden="true"><b>${Number(d)}</b>${MESES[Number(m) - 1]}</span>
    <span class="reuniao-texto"><strong>${maiuscula(DIAS[diaDe(data)])}, ${br(data)}</strong>
      <span class="suave">${esc(hora)} · relatos até ${br(veespera).slice(0, 5)}, ${HORA_FECHAMENTO}h</span></span>
    ${i === 0 ? '<span class="estrutura-selo">Próxima</span>' : ''}${i === 0 && alterada ? '<span class="estrutura-selo" title="Fora do dia da semana configurado">Data alterada</span>' : ''}
  </li>`;
};

export function painelReuniao(config, boot) {
  const dia = config.reuniao_dia != null ? Number(config.reuniao_dia) : 2;
  const intervalo = Number(config.reuniao_intervalo) === 14 ? 14 : 7;
  const hora = config.reuniao_hora || '10:00';
  const opcoesDia = [[1, 'Segunda-feira'], [2, 'Terça-feira'], [3, 'Quarta-feira'], [4, 'Quinta-feira'], [5, 'Sexta-feira']]
    .map(([v, n]) => `<option value="${v}" ${dia === v ? 'selected' : ''}>${n}</option>`).join('');
  return `<section id="estrutura-reuniao" class="estrutura-painel" aria-labelledby="titulo-reuniao" hidden>
    <div class="estrutura-barra"><div><h2 id="titulo-reuniao">Reunião</h2><p class="suave">Defina a periodicidade, o dia e o horário de acompanhamento.</p></div></div>
    ${resumoHTML(boot)}
    <div class="reuniao-layout">
      <form id="form-reuniao" class="reuniao-cartao" novalidate aria-labelledby="titulo-rotina">
        <h3 id="titulo-rotina">Rotina das reuniões</h3>
        <div class="campo">
          <span class="rotulo" id="rot-periodicidade">Periodicidade</span>
          <div class="segmentado" role="radiogroup" aria-labelledby="rot-periodicidade">
            <label><input type="radio" name="reuniao_intervalo" value="7" ${intervalo === 7 ? 'checked' : ''}><span>Semanal</span></label>
            <label><input type="radio" name="reuniao_intervalo" value="14" ${intervalo === 14 ? 'checked' : ''}><span>Quinzenal</span></label>
          </div>
          <div class="dica">Quinzenal: uma reunião a cada 15 dias, sempre no mesmo dia da semana.</div>
        </div>
        <div class="reuniao-dupla">
          <div class="campo"><label for="r-dia">Dia da semana</label><select id="r-dia" name="reuniao_dia">${opcoesDia}</select></div>
          <div class="campo"><label for="r-hora">Horário de início</label><input id="r-hora" type="time" name="reuniao_hora" value="${esc(hora)}" required></div>
        </div>
        <div class="campo">
          <label for="r-proxima">Data da próxima reunião</label>
          <input id="r-proxima" type="date" name="reuniao_proxima" min="${esc(boot.hoje)}" value="${esc(boot.semana)}">
          <div class="dica">Mude para adiantar ou adiar só a próxima: as seguintes continuam a partir dela.${boot.reuniao_proxima ? ' <button type="button" class="btn btn-fantasma btn-mini" id="r-voltar">Voltar ao dia da semana</button>' : ''}</div>
        </div>
        <div class="erro-form oculto" role="alert" id="erro-reuniao"></div>
        <div class="reuniao-rodape"><span class="suave pequeno" id="aviso-previa" role="status"></span><button class="btn btn-primario" type="submit" id="btn-salvar-reuniao">Salvar alterações</button></div>
      </form>
      <aside class="reuniao-cartao" aria-labelledby="titulo-previa">
        <h3 id="titulo-previa">Próximas reuniões</h3>
        <p class="suave pequeno" id="previa-nota">O prazo dos relatos termina no dia anterior, às ${HORA_FECHAMENTO}h.</p>
        <ol class="reuniao-lista" id="previa-lista"></ol>
      </aside>
    </div>
  </section>`;
}

/** Liga o formulário: prévia ao vivo, salvar e "voltar ao dia da semana". */
export function ligarReuniao(raiz, config, refresh) {
  const form = raiz.querySelector('#form-reuniao');
  if (!form) return;
  const boot = est.boot;
  const lista = raiz.querySelector('#previa-lista');
  const aviso = raiz.querySelector('#aviso-previa');
  const diaSalvo = config.reuniao_dia != null ? Number(config.reuniao_dia) : 2;
  const intervaloSalvo = Number(config.reuniao_intervalo) === 14 ? 14 : 7;
  const horaSalva = config.reuniao_hora || '10:00';
  let dataMexida = false;

  const valores = () => ({
    dia: Number(form.reuniao_dia.value), intervalo: Number(form.reuniao_intervalo.value),
    hora: form.reuniao_hora.value || horaSalva, data: form.reuniao_proxima.value,
  });
  const desenhar = () => {
    const v = valores();
    const primeira = v.data && v.data >= boot.hoje ? v.data : boot.semana;
    lista.innerHTML = serieDeReunioes(primeira, v.dia, v.intervalo).map((d, i) => itemHTML(d, i, { dia: v.dia, hora: v.hora, alterada: diaDe(d) !== v.dia })).join('');
    const mudou = v.dia !== diaSalvo || v.intervalo !== intervaloSalvo || v.hora !== horaSalva || v.data !== boot.semana;
    aviso.textContent = mudou ? 'Alterações ainda não salvas' : '';
  };
  form.reuniao_proxima.addEventListener('input', () => { dataMexida = true; desenhar(); });
  form.reuniao_dia.addEventListener('change', () => {
    // Trocar o dia, sem mexer na data, leva a próxima reunião ao primeiro dia escolhido a partir de hoje.
    if (!dataMexida) form.reuniao_proxima.value = aPartirDe(boot.hoje, Number(form.reuniao_dia.value));
    desenhar();
  });
  form.addEventListener('change', desenhar);
  form.reuniao_hora.addEventListener('input', desenhar);
  desenhar();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = raiz.querySelector('#btn-salvar-reuniao');
    const erroEl = raiz.querySelector('#erro-reuniao');
    erroEl.classList.add('oculto');
    btn.disabled = true;
    try {
      const v = valores();
      await put('/config', {
        combinados_frequencia: config.combinados_frequencia || 'sempre',
        reuniao_dia: v.dia, reuniao_hora: v.hora, reuniao_intervalo: v.intervalo,
        // Só envia a data se foi mudada; sem mudança, vale a que o servidor já guarda (ou o dia da semana).
        ...(v.data && v.data !== boot.semana ? { reuniao_proxima: v.data } : {}),
      });
      atualizarSessao(await get('/bootstrap'));
      toast('Configuração da reunião salva.');
      refresh();
    } catch (ex) {
      erroEl.textContent = ex.message;
      erroEl.classList.remove('oculto');
      btn.disabled = false;
    }
  });

  raiz.querySelector('#r-voltar')?.addEventListener('click', async () => {
    try {
      await put('/config', { combinados_frequencia: config.combinados_frequencia || 'sempre', reuniao_proxima: null });
      atualizarSessao(await get('/bootstrap'));
      toast('A reunião voltou ao dia da semana configurado.');
      refresh();
    } catch (ex) { toast(ex.message, 'erro'); }
  });
}
