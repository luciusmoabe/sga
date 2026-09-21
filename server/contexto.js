// Auxiliares compartilhados pelas rotas: acesso ao banco, relógio de negócio e configuração da reunião.
import { DIA_PADRAO, HORA_PADRAO, HORA_CORTE_PADRAO, agora, ehISO, ehDiaReuniao, hojeISO, refDiaReuniao } from './logic.js';
import { falha } from './helpers.js';

export function criarContexto(db) {
  const q = async (sql, ...p) => await db.prepare(sql).all(...p);
  const q1 = async (sql, ...p) => await db.prepare(sql).get(...p);
  const run = async (sql, ...p) => await db.prepare(sql).run(...p);
  const agoraISO = () => agora().toISOString();

  const hoje = () => hojeISO();
  /** Lê dia e hora da reunião a partir da config, com fallback para os padrões. */
  const cfgReuniao = async () => {
    const rows = await q('select chave, valor from config');
    const c = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
    const dia = c.reuniao_dia != null ? Number(c.reuniao_dia) : DIA_PADRAO;
    const hora = c.reuniao_hora || HORA_PADRAO;
    return { dia, hora, config: c };
  };
  const semanaDe = async (req) => {
    const { dia } = await cfgReuniao();
    const s = req.query.semana || refDiaReuniao(agora(), dia, HORA_CORTE_PADRAO);
    if (!ehISO(s)) throw falha(400, 'Informe uma data válida para a semana (AAAA-MM-DD).');
    if (!ehDiaReuniao(s, dia)) {
      const historica = await q1('select semana from atualizacoes where semana = ? union select semana from reunioes where semana = ?', s, s);
      if (!historica) throw falha(400, 'A semana deve corresponder ao dia configurado ou a uma semana já registrada.');
    }
    return s;
  };
  const cfg = async () => Object.fromEntries((await q('select chave, valor from config')).map((r) => [r.chave, r.valor]));

  return { db, q, q1, run, agoraISO, hoje, cfgReuniao, semanaDe, cfg };
}
