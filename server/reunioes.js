import { FREQUENCIAS, HORA_PADRAO, LIMITE_COMBINADOS, addDays, agora, br, parseISO, refDiaReuniao } from './logic.js';
import { cartoesReuniao, falha, h, json, permit, texto } from './helpers.js';

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const PRIO = { alta: 'alta', media: 'média', baixa: 'baixa' };

export function rotasReunioes(app, { db, q, q1, run, hoje, agoraISO, criarDiretriz, cfg }) {
  const gestao = permit('diretor', 'apoio');
  const fmt = (r) => (r ? { ...r, combinados_snapshot: json(r.combinados_snapshot, []) } : null);
  const avisoLimite = () => {
    const n = q1('select count(*) n from combinados where ativo = 1 and arquivado = 0').n;
    return n > LIMITE_COMBINADOS
      ? `Há ${n} combinados ativos. Recomendamos de 5 a ${LIMITE_COMBINADOS} para que a abertura da reunião continue rápida.`
      : null;
  };
  /** Lê dia e hora da reunião a partir da config salva, com fallback para os padrões. */
  const cfgAoVivo = () => {
    const c = cfg();
    return {
      dia: c.reuniao_dia != null ? Number(c.reuniao_dia) : 2,
      hora: c.reuniao_hora || HORA_PADRAO,
    };
  };


  // ---------- Combinados da reunião ----------
  app.get('/api/combinados', h((req) => {
    const gere = req.user.perfil !== 'chefe';
    const inativos = gere && req.query.todos === '1';
    const arquivados = gere && req.query.arquivados === '1';
    const itens = q(
      `select * from combinados where 1 = 1 ${arquivados ? '' : 'and arquivado = 0'} ${inativos || arquivados ? '' : 'and ativo = 1'} order by arquivado, ordem, id`,
    ).map((c) => ({ ...c, ativo: !!c.ativo, arquivado: !!c.arquivado }));
    return { itens, ativos: q1('select count(*) n from combinados where ativo = 1 and arquivado = 0').n, limite: LIMITE_COMBINADOS, aviso: avisoLimite() };
  }));
  app.post('/api/combinados', gestao, h((req, res) => {
    const t = texto(req.body?.texto, 240);
    if (!t) throw falha(400, 'Escreva o combinado.');
    const ordem = q1('select coalesce(max(ordem), 0) + 1 o from combinados').o;
    const id = run('insert into combinados (texto, ordem, ativo, arquivado, criado_por, criado_em, alterado_em) values (?,?,?,?,?,?,?)',
      t, ordem, 1, 0, req.user.id, agoraISO(), agoraISO()).lastInsertRowid;
    res.status(201);
    return { combinado: q1('select * from combinados where id = ?', id), aviso: avisoLimite() };
  }));
  app.patch('/api/combinados/:id', gestao, h((req) => {
    const id = Number(req.params.id);
    const c = q1('select * from combinados where id = ?', id);
    if (!c) throw falha(404, 'Combinado não encontrado.');
    const b = req.body || {};
    if ('texto' in b) {
      const t = texto(b.texto, 240);
      if (!t) throw falha(400, 'O combinado não pode ficar vazio.');
      run('update combinados set texto = ? where id = ?', t, id);
    }
    if ('ativo' in b) run('update combinados set ativo = ? where id = ?', b.ativo ? 1 : 0, id);
    if ('arquivado' in b) run('update combinados set arquivado = ?, ativo = case when ? = 1 then 0 else ativo end where id = ?', b.arquivado ? 1 : 0, b.arquivado ? 1 : 0, id);
    if (b.mover === 'cima' || b.mover === 'baixo') {
      const lista = q('select id from combinados where arquivado = 0 order by ordem, id');
      lista.forEach((r, i) => run('update combinados set ordem = ? where id = ?', i + 1, r.id));
      const i = lista.findIndex((r) => r.id === id);
      const j = b.mover === 'cima' ? i - 1 : i + 1;
      if (i >= 0 && j >= 0 && j < lista.length) {
        run('update combinados set ordem = ? where id = ?', j + 1, id);
        run('update combinados set ordem = ? where id = ?', i + 1, lista[j].id);
      }
    }
    run('update combinados set alterado_em = ? where id = ?', agoraISO(), id);
    const novo = q1('select * from combinados where id = ?', id);
    return { combinado: { ...novo, ativo: !!novo.ativo, arquivado: !!novo.arquivado }, aviso: avisoLimite() };
  }));
  app.get('/api/config', h(() => cfg()));
  app.put('/api/config', gestao, h((req) => {
    const f = req.body?.combinados_frequencia;
    if (!FREQUENCIAS.includes(f)) throw falha(400, 'Escolha quando os combinados aparecem: sempre, na primeira reunião do mês ou quando mudarem.');
    run('insert into config (chave, valor) values (?, ?) on conflict(chave) do update set valor = excluded.valor', 'combinados_frequencia', f);

    // Dia da semana da reunião (0 = domingo … 6 = sábado)
    if (req.body?.reuniao_dia != null) {
      const dia = Number(req.body.reuniao_dia);
      if (!Number.isInteger(dia) || dia < 0 || dia > 6) throw falha(400, 'O dia da reunião deve ser um número entre 0 (domingo) e 6 (sábado).');
      run('insert into config (chave, valor) values (?, ?) on conflict(chave) do update set valor = excluded.valor', 'reuniao_dia', String(dia));
    }

    // Horário de início da reunião (HH:MM)
    if (req.body?.reuniao_hora != null) {
      const hora = String(req.body.reuniao_hora).trim();
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw falha(400, 'O horário da reunião deve estar no formato HH:MM (ex.: 10:00).');
      run('insert into config (chave, valor) values (?, ?) on conflict(chave) do update set valor = excluded.valor', 'reuniao_hora', hora);
    }

    return cfg();
  }));

  // ---------- Reunião ----------
  const mostrarCombinados = () => {
    const freq = cfg().combinados_frequencia || 'sempre';
    if (freq === 'sempre') return true;
    const ultima = q1('select iniciada_em from reunioes order by iniciada_em desc limit 1');
    if (freq === 'primeira_do_mes') return !q1('select 1 from reunioes where substr(data, 1, 7) = ?', hoje().slice(0, 7));
    const alterado = q1('select max(alterado_em) m from combinados').m;
    return !ultima || (alterado && alterado > ultima.iniciada_em);
  };

  app.post('/api/reunioes/iniciar', gestao, h((req, res) => {
    const aberta = q1(`select * from reunioes where status = 'em_andamento' order by id desc limit 1`);
    if (aberta) return { reuniao: fmt(aberta), retomada: true, mostrar_combinados: false };
    const mostrar = mostrarCombinados();
    const snapshot = q('select id, texto, ordem from combinados where ativo = 1 and arquivado = 0 order by ordem, id');
    const { dia } = cfgAoVivo();
    const id = run(
      `insert into reunioes (data, semana, iniciada_em, status, combinados_snapshot, criada_por) values (?,?,?,?,?,?)`,
      hoje(), refDiaReuniao(agora(), dia), agoraISO(), 'em_andamento', JSON.stringify(snapshot), req.user.id,
    ).lastInsertRowid;
    res.status(201);
    return { reuniao: fmt(q1('select * from reunioes where id = ?', id)), retomada: false, mostrar_combinados: mostrar };
  }));

  app.get('/api/reunioes', h((req) => {
    const gere = req.user.perfil !== 'chefe';
    return q(
      `select r.id, r.data, r.semana, r.status, r.iniciada_em, r.encerrada_em, r.enviada_em,
         (select count(*) from decisoes d where d.reuniao_id = r.id) decisoes,
         (select count(*) from diretrizes g where g.reuniao_id = r.id) novas_acoes
       from reunioes r ${gere ? '' : `where r.status = 'enviada'`} order by r.data desc, r.id desc limit 40`,
    );
  }));

  const reuniaoOuErro = (id) => {
    const r = q1('select * from reunioes where id = ?', Number(id));
    if (!r) throw falha(404, 'Reunião não encontrada.');
    return r;
  };
  const emAndamento = (r) => {
    if (r.status !== 'em_andamento') throw falha(409, 'Esta reunião já foi encerrada.');
  };

  app.get('/api/reunioes/:id', h((req) => {
    const r = reuniaoOuErro(req.params.id);
    if (req.user.perfil === 'chefe') {
      if (r.status !== 'enviada') throw falha(404, 'Reunião não encontrada.');
      return { id: r.id, data: r.data, status: r.status, ata_texto: r.ata_texto, combinados_snapshot: json(r.combinados_snapshot, []) };
    }
    return {
      ...fmt(r),
      decisoes: q(`select d.*, s.sigla secao_sigla, s.nome secao_nome from decisoes d left join secoes s on s.id = d.secao_id where d.reuniao_id = ? order by d.id`, r.id),
      novas_acoes: q(`select g.*, (select count(*) from acoes a where a.diretriz_id = g.id) total_acoes from diretrizes g where g.reuniao_id = ? order by g.id`, r.id),
      pedidos_decididos: q(
        `select p.*, a.titulo acao_titulo, s.sigla secao_sigla from pedidos_prazo p join acoes a on a.id = p.acao_id join secoes s on s.id = a.secao_id where p.reuniao_id = ? order by p.decidido_em`, r.id),
    };
  }));

  app.get('/api/reunioes/:id/cartoes', gestao, h((req) => {
    const r = reuniaoOuErro(req.params.id);
    return { reuniao: fmt(r), cartoes: cartoesReuniao(db, r.semana, hoje()) };
  }));

  app.post('/api/reunioes/:id/decisoes', gestao, h((req, res) => {
    const r = reuniaoOuErro(req.params.id);
    emAndamento(r);
    const t = texto(req.body?.texto, 600);
    if (!t) throw falha(400, 'Escreva a decisão.');
    let secaoId = null;
    if (req.body?.secao_id) {
      secaoId = q1('select id from secoes where id = ?', Number(req.body.secao_id))?.id;
      if (!secaoId) throw falha(400, 'Seção inválida.');
    }
    run('insert into decisoes (reuniao_id, secao_id, texto, criada_em, criada_por) values (?,?,?,?,?)', r.id, secaoId, t, agoraISO(), req.user.id);
    res.status(201);
    return { ok: true };
  }));
  app.delete('/api/reunioes/:id/decisoes/:decisaoId', gestao, h((req) => {
    const r = reuniaoOuErro(req.params.id);
    emAndamento(r);
    run('delete from decisoes where id = ? and reuniao_id = ?', Number(req.params.decisaoId), r.id);
    return { ok: true };
  }));

  app.post('/api/reunioes/:id/acoes', gestao, h((req, res) => {
    const r = reuniaoOuErro(req.params.id);
    emAndamento(r);
    res.status(201);
    return criarDiretriz(req.user, req.body || {}, r.id);
  }));

  function gerarAta(r) {
    const { dia, hora } = cfgAoVivo();
    const d = parseISO(r.data);
    const linhas = [`ATA DA REUNIÃO SEMANAL — ${br(r.data)} (${DIAS[d.getDay()]})`, ''];
    const comb = json(r.combinados_snapshot, []);
    if (comb.length) {
      linhas.push('Combinados vigentes:');
      comb.forEach((c, i) => linhas.push(`${i + 1}. ${c.texto}`));
      linhas.push('');
    }
    const dec = q(`select d.texto, s.sigla from decisoes d left join secoes s on s.id = d.secao_id where d.reuniao_id = ? order by d.id`, r.id);
    linhas.push('Decisões:');
    if (dec.length) dec.forEach((x) => linhas.push(`- [${x.sigla || 'Geral'}] ${x.texto}`));
    else linhas.push('- Nenhuma decisão registrada.');
    linhas.push('');
    const novas = q(`select g.*, (select count(*) from acoes a where a.diretriz_id = g.id) n from diretrizes g where g.reuniao_id = ? order by g.id`, r.id);
    linhas.push('Novas ações:');
    if (novas.length) {
      novas.forEach((g) => {
        const alvo = g.destino === 'todos' ? 'Todos os Centros' : q(`select s.sigla from acoes a join secoes s on s.id = a.secao_id where a.diretriz_id = ?`, g.id).map((s) => s.sigla).join(', ');
        linhas.push(`- [${alvo}] ${g.titulo} — prazo ${br(g.prazo)} — prioridade ${PRIO[g.prioridade] || g.prioridade}`);
      });
    } else linhas.push('- Nenhuma ação nova.');
    linhas.push('');
    const ped = q(`select p.*, a.titulo, s.sigla from pedidos_prazo p join acoes a on a.id = p.acao_id join secoes s on s.id = a.secao_id where p.reuniao_id = ? order by p.decidido_em`, r.id);
    if (ped.length) {
      linhas.push('Pedidos de novo prazo decididos:');
      ped.forEach((p) => linhas.push(`- [${p.sigla}] "${p.titulo}": novo prazo ${br(p.novo_prazo)} ${p.status === 'aprovado' ? 'aprovado' : 'recusado'}.`));
      linhas.push('');
    }
    const proximaData = addDays(r.semana, 7);
    linhas.push(`Próxima reunião: ${DIAS[dia]}, ${br(proximaData)}, às ${hora}.`);
    return linhas.join('\n');
  }

  app.post('/api/reunioes/:id/encerrar', gestao, h((req) => {
    const r = reuniaoOuErro(req.params.id);
    emAndamento(r);
    run(`update reunioes set status = 'rascunho', encerrada_em = ?, ata_texto = ? where id = ?`, agoraISO(), gerarAta(r), r.id);
    return fmt(q1('select * from reunioes where id = ?', r.id));
  }));
  app.post('/api/reunioes/:id/reabrir', gestao, h((req) => {
    const r = reuniaoOuErro(req.params.id);
    if (r.status !== 'rascunho') throw falha(409, 'Só é possível reabrir uma reunião cuja ata ainda está em rascunho.');
    if (q1(`select 1 from reunioes where status = 'em_andamento'`)) throw falha(409, 'Já existe outra reunião em andamento.');
    run(`update reunioes set status = 'em_andamento', encerrada_em = null where id = ?`, r.id);
    return fmt(q1('select * from reunioes where id = ?', r.id));
  }));
  app.put('/api/reunioes/:id/ata', gestao, h((req) => {
    const r = reuniaoOuErro(req.params.id);
    if (r.status !== 'rascunho') throw falha(409, 'A ata só pode ser editada enquanto está em rascunho.');
    const t = texto(req.body?.ata_texto, 20000);
    if (!t) throw falha(400, 'A ata não pode ficar vazia.');
    run('update reunioes set ata_texto = ? where id = ?', t, r.id);
    return fmt(q1('select * from reunioes where id = ?', r.id));
  }));
  app.post('/api/reunioes/:id/enviar-ata', gestao, h((req) => {
    const r = reuniaoOuErro(req.params.id);
    if (r.status !== 'rascunho') throw falha(409, 'A ata precisa estar em rascunho para ser enviada.');
    // Protótipo: não há envio de e-mail. A ata passa a ficar visível aos chefes na tela "Atas".
    run(`update reunioes set status = 'enviada', enviada_em = ? where id = ?`, agoraISO(), r.id);
    return fmt(q1('select * from reunioes where id = ?', r.id));
  }));
}
