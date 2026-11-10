// Auxiliares compartilhados pelas rotas: acesso ao banco, relógio de negócio e configuração da reunião.
import { DIA_PADRAO, HORA_PADRAO, HORA_CORTE_PADRAO, agora, cicloDe, ehISO, ehDiaReuniao, hojeISO, refReuniao } from './logic.js';
import { falha, json } from './helpers.js';
import { completarVocabulario } from '../public/js/vocabulario.js';
import { empresaAtual } from './empresa.js';

export function criarContexto(db) {
  const q = async (sql, ...p) => await db.prepare(sql).all(...p);
  const q1 = async (sql, ...p) => await db.prepare(sql).get(...p);
  const run = async (sql, ...p) => await db.prepare(sql).run(...p);
  const agoraISO = () => agora().toISOString();

  const hoje = () => hojeISO();
  /** Lê dia e hora da reunião a partir da config, com fallback para os padrões. */
  const cfgReuniao = async () => {
    const rows = await q('select chave, valor from config where empresa_id = ?', empresaAtual());
    const c = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
    const dia = c.reuniao_dia != null ? Number(c.reuniao_dia) : DIA_PADRAO;
    const hora = c.reuniao_hora || HORA_PADRAO;
    const { intervalo, proxima } = cicloDe(c);
    /** Data da reunião a que as atualizações de agora se referem (`horaCorte` 24 = o dia da reunião inteiro). */
    const referencia = (horaCorte = HORA_CORTE_PADRAO) => refReuniao(agora(), { dia, intervalo, proxima, horaCorte });
    return { dia, hora, intervalo, proxima, referencia, config: c };
  };
  const semanaDe = async (req) => {
    const { dia, referencia } = await cfgReuniao();
    const atual = referencia();
    const s = req.query.semana || atual;
    if (!ehISO(s)) throw falha(400, 'Informe uma data válida para a semana (AAAA-MM-DD).');
    if (s !== atual && !ehDiaReuniao(s, dia)) {
      const historica = await q1('select semana from atualizacoes where semana = ? and empresa_id = ? union select semana from reunioes where semana = ? and empresa_id = ?', s, empresaAtual(), s, empresaAtual());
      if (!historica) throw falha(400, 'A semana deve corresponder ao dia configurado ou a uma semana já registrada.');
    }
    return s;
  };
  const cfg = async () => Object.fromEntries((await q('select chave, valor from config where empresa_id = ?', empresaAtual())).map((r) => [r.chave, r.valor]));

  /** Nomes que a empresa deu aos tipos de unidade e ao topo (o que não foi informado vale o padrão). */
  const vocabularioAtual = async () => completarVocabulario(json((await cfg()).vocabulario, null));

  return { db, q, q1, run, agoraISO, hoje, cfgReuniao, semanaDe, cfg, vocabularioAtual };
}
