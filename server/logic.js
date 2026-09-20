// Regras puras do SGC: datas, semana da reunião e semáforo.
// Para testes e demonstrações, defina SGC_NOW (ex.: 2026-09-21T17:00:00) e o "agora" do servidor muda.

export const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s, n) => {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const agora = () => (process.env.SGC_NOW ? new Date(process.env.SGC_NOW) : new Date());
export const hojeISO = () => iso(agora());
export const ehISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parseISO(s)) === s;
export const ehTerca = (s) => ehISO(s) && parseISO(s).getDay() === 2;
export const br = (s) => (s ? s.split('-').reverse().join('/') : '');

/** Padrões para o dia/hora da reunião quando não há config salva. */
export const DIA_PADRAO = 2;         // terça-feira (0 = domingo … 6 = sábado)
export const HORA_PADRAO = '10:00';  // horário de início exibido na ata e no trilho
export const HORA_CORTE_PADRAO = 12; // até esta hora, na própria terça, ainda vale a reunião do dia
export const HORA_FECHAMENTO = 18;   // hora do fechamento (dia anterior à reunião)

/**
 * Data da próxima reunião à qual as atualizações de hoje se referem.
 * - `diaSemana`: 0 (dom) a 6 (sáb). Padrão: terça (2).
 * - `horaCorte`: até esta hora, no próprio dia da reunião, ainda vale a reunião corrente.
 *
 * Mantém compatibilidade retroativa: sem argumentos, funciona como a antiga refTerca().
 */
export function refDiaReuniao(now = agora(), diaSemana = DIA_PADRAO, horaCorte = HORA_CORTE_PADRAO) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let diff = (diaSemana - d.getDay() + 7) % 7;
  if (diff === 0 && now.getHours() >= horaCorte) diff = 7;
  d.setDate(d.getDate() + diff);
  return iso(d);
}

/**
 * Verifica se a string ISO corresponde ao dia configurado para a reunião.
 */
export const ehDiaReuniao = (s, diaSemana = DIA_PADRAO) => ehISO(s) && parseISO(s).getDay() === diaSemana;

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
export const ORDEM_COR = { vermelho: 0, amarelo: 1, verde: 2 };

export const STATUS = ['a_fazer', 'em_andamento', 'bloqueada', 'concluida'];
export const TRANSICOES = {
  a_fazer: ['em_andamento'],
  em_andamento: ['bloqueada', 'concluida', 'a_fazer'],
  bloqueada: ['em_andamento'],
  concluida: ['em_andamento'],
};
export const PRIORIDADES = ['alta', 'media', 'baixa'];
export const FREQUENCIAS = ['sempre', 'primeira_do_mes', 'quando_mudarem'];
export const LIMITE_NIVEIS = 3; // Centro (1) > subseção (2) > subseção (3)
export const LIMITE_COMBINADOS = 7;
