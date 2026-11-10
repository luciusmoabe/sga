// Regras puras do SGC: datas, semana da reunião e semáforo.
// Para testes e demonstrações, defina SGC_NOW (ex.: 2026-09-21T17:00:00) e o "agora" do servidor muda.
import { dataNoFuso, dataValida, instante, parseData, partesNoFuso, somarDias } from '../public/js/datas.js';
import { HORA_FECHAMENTO } from '../public/js/regras.js';
export { FUSO_NEGOCIO } from '../public/js/datas.js';
export { ESFORCOS, ESFORCO_PADRAO, PESO_ESFORCO, DIAS_SEM_MOVIMENTO, DIRETORIA_ADJUNTA, TIPOS_DE_ACOMPANHAMENTO, TIPOS_DE_DIRETRIZ_GERAL, ehUnidadeDeAcompanhamento, HORA_FECHAMENTO, ORDEM_COR, PERFIS, PERFIS_DE_SECAO, porDataDaTarefa, TIPOS_SECAO, PRIORIDADES, ROTULO_PERFIL, STATUS, TAM_SENHA, TRANSICOES } from '../public/js/regras.js'; // fonte única, compartilhada com a interface

export const pad = (n) => String(n).padStart(2, '0');
export const iso = dataNoFuso;
export const parseISO = parseData;
export const addDays = somarDias;
export const agora = () => (process.env.SGC_NOW ? instante(process.env.SGC_NOW) : new Date());
export const hojeISO = () => iso(agora());
export const ehISO = dataValida;
export const ehTerca = (s) => ehISO(s) && parseISO(s).getUTCDay() === 2;
export const br = (s) => (s ? s.split('-').reverse().join('/') : '');

/** Padrões para o dia/hora da reunião quando não há config salva. */
export const DIA_PADRAO = 2;         // terça-feira (0 = domingo … 6 = sábado)
export const HORA_PADRAO = '10:00';  // horário de início exibido na ata e no trilho
export const HORA_CORTE_PADRAO = 12; // até esta hora, na própria terça, ainda vale a reunião do dia

/**
 * Data da próxima reunião à qual as atualizações de hoje se referem.
 * - `diaSemana`: 0 (dom) a 6 (sáb). Padrão: terça (2).
 * - `horaCorte`: até esta hora, no próprio dia da reunião, ainda vale a reunião corrente.
 *
 * Mantém compatibilidade retroativa: sem argumentos, funciona como a antiga refTerca().
 */
export function refDiaReuniao(now = agora(), diaSemana = DIA_PADRAO, horaCorte = HORA_CORTE_PADRAO) {
  const data = dataNoFuso(now);
  let diff = (diaSemana - parseISO(data).getUTCDay() + 7) % 7;
  if (diff === 0 && Number(partesNoFuso(now).hour) >= horaCorte) diff = 7;
  return addDays(data, diff);
}

/** Periodicidade da reunião, em dias: semanal (padrão) ou quinzenal. */
export const INTERVALOS_REUNIAO = [7, 14];
export const INTERVALO_PADRAO = 7;

/** Lê a periodicidade e a data da próxima reunião (alterada pelo Diretor) da config salva. */
export function cicloDe(c = {}) {
  const intervalo = Number(c.reuniao_intervalo) === 14 ? 14 : INTERVALO_PADRAO;
  const proxima = ehISO(c.reuniao_proxima) ? c.reuniao_proxima : null;
  return { intervalo, proxima };
}

/** O dia da reunião (0-6) mais próximo de `data`, a até 3 dias de distância. Mantém o ritmo depois de uma reunião adiantada ou adiada. */
const diaMaisProximo = (data, dia) => {
  let diff = (((dia - parseISO(data).getUTCDay()) % 7) + 7) % 7;
  if (diff > 3) diff -= 7;
  return addDays(data, diff);
};

/**
 * Data da reunião à qual as atualizações de agora se referem, considerando a periodicidade e a data da próxima reunião.
 * - Sem `proxima`, vale o dia da semana configurado (comportamento semanal de sempre).
 * - Com `proxima`, ela é a próxima reunião; depois que passa, as seguintes vêm a cada `intervalo` dias, no dia da semana configurado.
 * - `horaCorte`: até esta hora, na própria data da reunião, ainda vale a reunião do dia (24 = o dia inteiro).
 */
export function refReuniao(now = agora(), { dia = DIA_PADRAO, intervalo = INTERVALO_PADRAO, proxima = null, horaCorte = HORA_CORTE_PADRAO } = {}) {
  if (!proxima) return refDiaReuniao(now, dia, horaCorte);
  const hoje = dataNoFuso(now);
  const hora = Number(partesNoFuso(now).hour);
  let m = proxima;
  for (let i = 0; i < 400 && (hoje > m || (hoje === m && hora >= horaCorte)); i++) m = diaMaisProximo(addDays(m, intervalo), dia);
  return m;
}

/** Reunião anterior à de `semana` (início do trilho e das janelas do relato). */
export const reuniaoAnterior = (semana, { dia = DIA_PADRAO, intervalo = INTERVALO_PADRAO } = {}) => diaMaisProximo(addDays(semana, -intervalo), dia);

/** Reunião seguinte à de `semana`. */
export const reuniaoSeguinte = (semana, { dia = DIA_PADRAO, intervalo = INTERVALO_PADRAO } = {}) => diaMaisProximo(addDays(semana, intervalo), dia);

/**
 * Verifica se a string ISO corresponde ao dia configurado para a reunião.
 */
export const ehDiaReuniao = (s, diaSemana = DIA_PADRAO) => ehISO(s) && parseISO(s).getUTCDay() === diaSemana;

/**
 * Terça-feira da reunião à qual as atualizações de hoje se referem.
 * A semana vai de terça a segunda; o fechamento é segunda, 18h.
 * Na própria terça, até 12h ainda é a reunião do dia; depois disso, vale a da terça seguinte.
 *
 * @deprecated Use refDiaReuniao() para suporte à configuração dinâmica.
 */
export function refTerca(now = agora()) {
  return refDiaReuniao(now, DIA_PADRAO, HORA_CORTE_PADRAO);
}

/**
 * Fechamento da semana: dia anterior à reunião, às 18h.
 * - `semana`: data ISO do dia da reunião.
 */
export const fechamentoDe = (semana) => `${addDays(semana, -1)}T${pad(HORA_FECHAMENTO)}:00:00`;

/** Semáforo (regra 5 do plano; limiares a validar com o Diretor). */
export const atualizacaoPendente = (enviada, semana, now = agora()) =>
  !enviada && now > instante(fechamentoDe(semana));

export function semaforo({ enviada, pendente = !enviada, atrasadas, vencendo, critico }) {
  if (atrasadas > 0 || critico) return 'vermelho';
  if (pendente || vencendo > 0) return 'amarelo';
  return 'verde';
}
export const FREQUENCIAS = ['sempre', 'primeira_do_mes', 'quando_mudarem'];
export const LIMITE_NIVEIS = 3; // Centro (1) > subseção (2) > subseção (3)
export const LIMITE_COMBINADOS = 7;
