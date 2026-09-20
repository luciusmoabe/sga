// Calendário compartilhado pela API e pela interface, independente do fuso da máquina.
export const FUSO_NEGOCIO = 'America/Bahia';
const formato = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_NEGOCIO, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
export const partesNoFuso = (data) => Object.fromEntries(
  formato.formatToParts(data).filter(p => p.type !== 'literal').map(p => [p.type, p.value]),
);
export const dataNoFuso = (data) => {
  const p = partesNoFuso(data);
  return `${p.year}-${p.month}-${p.day}`;
};

// Datas civis usam UTC apenas como representação para a aritmética do calendário.
export const parseData = (data) => new Date(`${data.slice(0, 10)}T12:00:00Z`);
export const dataValida = (data) => {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const d = parseData(data);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data;
};
export const somarDias = (data, dias) => {
  const d = parseData(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Valores sem offset (incluindo registros antigos) representam o horário de Bahia. */
export function instante(valor) {
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(valor)) return new Date(valor);
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?)?$/.exec(valor);
  if (!m || !dataValida(m[1]) || +(m[2] || 0) > 23 || +(m[3] || 0) > 59 || +(m[4] || 0) > 59) {
    throw new Error('Data e hora inválidas.');
  }
  const civil = `${m[1]}T${m[2] || '00'}:${m[3] || '00'}:${m[4] || '00'}`;
  const alvo = Date.parse(`${civil}${m[5] || ''}Z`);
  let candidato = alvo;
  for (let i = 0; i < 3; i++) {
    const p = partesNoFuso(new Date(candidato));
    const representado = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`) + (alvo % 1000);
    const diferenca = alvo - representado;
    if (!diferenca) return new Date(candidato);
    candidato += diferenca;
  }
  throw new Error('Horário inexistente no fuso de negócio.');
}
