// Alterar a data da próxima reunião sem sair do Início: quem gere reuniões muda a data prevista, a linha do tempo
// do Início e os avisos passam a contar dela, e as reuniões seguintes continuam a cada 7 ou 14 dias.
import { get, put } from './api.js';
import { atualizarSessao } from './estado.js';
import { abrirForm, br, esc, toast } from './ui.js';

const NOMES_DIA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** `opcoes.salvar(corpo)` grava a agenda (por padrão, a da instituição em `/config`); para a seção, em `/reunioes-equipe/agenda`. */
export function abrirAlterarReuniao(boot, aoSalvar, opcoes = {}) {
  const salvar = opcoes.salvar || (async (corpo) => { await put('/config', corpo); atualizarSessao(await get('/bootstrap')); });
  const intervalo = boot.reuniao_intervalo === 14 ? 14 : 7;
  const marcada = !!boot.reuniao_proxima;
  abrirForm({
    titulo: 'Alterar a data da próxima reunião',
    corpo: `<p class="suave pequeno">Hoje a próxima reunião está prevista para <b>${br(boot.semana)}</b>. As seguintes continuam ${intervalo === 14 ? 'a cada 15 dias (quinzenal)' : 'toda semana'}, a partir da nova data, no dia da semana configurado (${NOMES_DIA[boot.reuniao_dia ?? 2]}).</p>
      <div class="campo"><label for="ar-data">Nova data</label><input id="ar-data" type="date" name="data" required min="${esc(boot.hoje)}" value="${esc(boot.semana)}"></div>
      ${marcada ? '<div class="campo"><div class="escolha"><label><input type="checkbox" name="voltar"> Descartar a data marcada e voltar ao dia da semana configurado</label></div></div>' : ''}
      <p class="suave pequeno">O prazo de fechamento dos relatos passa a ser o dia anterior à nova data, às 18h.</p>`,
    rotulo: 'Salvar data',
    aoEnviar: async (d) => {
      const corpo = { combinados_frequencia: boot.config?.combinados_frequencia || 'sempre' };
      if (d.voltar) corpo.reuniao_proxima = null;
      else if (d.data === boot.semana) { toast('A data não foi alterada.'); return; }
      else corpo.reuniao_proxima = d.data;
      await salvar(corpo);
      toast('Data da reunião atualizada.');
      await aoSalvar?.();
    },
  });
}
