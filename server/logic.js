// Regras puras do SGC: datas, semana da reunião e semáforo.
// Para testes e demonstrações, defina SGC_NOW (ex.: 2026-09-21T17:00:00) e o "agora" do servidor muda.
import { dataNoFuso, dataValida, instante, parseData, partesNoFuso, somarDias } from '../public/js/datas.js';
import { HORA_FECHAMENTO } from '../public/js/regras.js';
export { FUSO_NEGOCIO } from '../public/js/datas.js';
export { HORA_FECHAMENTO, ORDEM_COR, PRIORIDADES, STATUS, TRANSICOES } from '../public/js/regras.js'; // fonte única, compartilhada com a interface

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
export function semaforo({ enviada, atrasadas, vencendo, critico }) {
  if (atrasadas > 0 || critico) return 'vermelho';
  if (!enviada || vencendo > 0) return 'amarelo';
  return 'verde';
}
export const FREQUENCIAS = ['sempre', 'primeira_do_mes', 'quando_mudarem'];
export const LIMITE_NIVEIS = 3; // Centro (1) > subseção (2) > subseção (3)
export const LIMITE_COMBINADOS = 7;
