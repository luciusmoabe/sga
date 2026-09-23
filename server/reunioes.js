import { FREQUENCIAS, HORA_PADRAO, LIMITE_COMBINADOS, addDays, agora, br, ehDiaReuniao, parseISO, refDiaReuniao } from './logic.js';
import { cartoesReuniao, falha, h, json, permit, texto } from './helpers.js';

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const PRIO = { alta: 'alta', media: 'média', baixa: 'baixa' };

export function rotasReunioes(app, { db, q, q1, run, hoje, agoraISO, criarDiretriz, cfg }) {
  const gestao = permit('diretor', 'apoio', 'administrador');
  const fmt = (r) => (r ? { ...r, combinados_snapshot: json(r.combinados_snapshot, []) } : null);
  const avisoLimite = async () => {
    const n = (await q1('select count(*) n from combinados where ativo = 1 and arquivado = 0'))?.n ?? 0;
    return n > LIMITE_COMBINADOS
      ? `Há ${n} combinados ativos. Recomendamos de 5 a ${LIMITE_COMBINADOS} para que a abertura da reunião continue rápida.`
      : null;
  };
  /** Lê dia e hora da reunião a partir da config salva, com fallback para os padrões. */
  const cfgAoVivo = async () => {
    const c = await cfg();
    return {
      dia: c.reuniao_dia != null ? Number(c.reuniao_dia) : 2,
      hora: c.reuniao_hora || HORA_PADRAO,
    };
  };

  // Serializa abertura/reabertura e mutações da reunião entre instâncias.
  // A trava de linha também coordena decisões de prazo feitas em app.js.
  const travarCiclo = async () => {
    if (db.isPg) await q1('select pg_advisory_xact_lock(7319, 2)');
  };
  const comReuniao = (id, fn) => db.transaction(async () => {
    await travarCiclo();
    const r = await q1(`select * from reunioes where id = ?${db.isPg ? ' for update' : ''}`, Number(id));
    if (!r) throw falha(404, 'Reunião não encontrada.');
    return fn(r);
  });

  // ---------- Combinados da reunião ----------
  app.get('/api/combinados', h(async (req) => {
    const gere = req.user.perfil !== 'chefe';
    const inativos = gere && req.query.todos === '1';
    const arquivados = gere && req.query.arquivados === '1';
    const itens = (await q(
      `select * from combinados where 1 = 1 ${arquivados ? '' : 'and arquivado = 0'} ${inativos || arquivados ? '' : 'and ativo = 1'} order by arquivado, ordem, id`,
    )).map((c) => ({ ...c, ativo: !!c.ativo, arquivado: !!c.arquivado }));
    const ativosRow = await q1('select count(*) n from combinados where ativo = 1 and arquivado = 0');
    return { itens, ativos: ativosRow?.n ?? 0, limite: LIMITE_COMBINADOS, aviso: await avisoLimite() };
  }));

  app.post('/api/combinados', gestao, h(async (req, res) => {
    const t = texto(req.body?.texto, 240);
    if (!t) throw falha(400, 'Escreva o combinado.');
    const ordem = ((await q1('select coalesce(max(ordem), 0) + 1 o from combinados'))?.o) ?? 1;
    const id = (await run('insert into combinados (texto, ordem, ativo, arquivado, criado_por, criado_em, alterado_em) values (?,?,?,?,?,?,?)',
      t, ordem, 1, 0, req.user.id, agoraISO(), agoraISO())).lastInsertRowid;
    res.status(201);
    return { combinado: await q1('select * from combinados where id = ?', id), aviso: await avisoLimite() };
  }));

  app.patch('/api/combinados/:id', gestao, h(async (req) => {
    const id = Number(req.params.id);
    const c = await q1('select * from combinados where id = ?', id);
    if (!c) throw falha(404, 'Combinado não encontrado.');
    const b = req.body || {};
    if ('texto' in b) {
      const t = texto(b.texto, 240);
      if (!t) throw falha(400, 'O combinado não pode ficar vazio.');
      await run('update combinados set texto = ? where id = ?', t, id);
    }
    if ('ativo' in b) await run('update combinados set ativo = ? where id = ?', b.ativo ? 1 : 0, id);
    if ('arquivado' in b) await run('update combinados set arquivado = ?, ativo = case when ? = 1 then 0 else ativo end where id = ?', b.arquivado ? 1 : 0, b.arquivado ? 1 : 0, id);
    if (b.mover === 'cima' || b.mover === 'baixo') {
      const lista = await q('select id from combinados where arquivado = 0 order by ordem, id');
      for (let i = 0; i < lista.length; i++) {
        await run('update combinados set ordem = ? where id = ?', i + 1, lista[i].id);
      }
      const i = lista.findIndex((r) => r.id === id);
      const j = b.mover === 'cima' ? i - 1 : i + 1;
      if (i >= 0 && j >= 0 && j < lista.length) {
        await run('update combinados set ordem = ? where id = ?', j + 1, id);
        await run('update combinados set ordem = ? where id = ?', i + 1, lista[j].id);
      }
    }
    await run('update combinados set alterado_em = ? where id = ?', agoraISO(), id);
    const novo = await q1('select * from combinados where id = ?', id);
    return { combinado: { ...novo, ativo: !!novo.ativo, arquivado: !!novo.arquivado }, aviso: await avisoLimite() };
  }));

  app.get('/api/config', h(async () => await cfg()));
  app.put('/api/config', gestao, h(async (req) => {
    const f = req.body?.combinados_frequencia;
    if (!FREQUENCIAS.includes(f)) throw falha(400, 'Escolha quando os combinados aparecem: sempre, na primeira reunião do mês ou quando mudarem.');
    const valores = [['combinados_frequencia', f]];
    if (req.body?.reuniao_dia != null) {
      const valor = req.body.reuniao_dia;
      const dia = Number(valor);
      if (!['string', 'number'].includes(typeof valor) || String(valor).trim() === '' || !Number.isInteger(dia) || dia < 0 || dia > 6) {
        throw falha(400, 'O dia da reunião deve ser um número entre 0 (domingo) e 6 (sábado).');
      }
      valores.push(['reuniao_dia', String(dia)]);
    }
    if (req.body?.reuniao_hora != null) {
      const hora = String(req.body.reuniao_hora).trim();
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw falha(400, 'O horário da reunião deve estar no formato HH:MM (ex.: 10:00).');
      valores.push(['reuniao_hora', hora]);
    }
    return db.transaction(async () => {
      // Ordem fixa das chaves para serializar mudanças concorrentes no PostgreSQL.
      for (const [chave, valor] of valores) {
        await run('insert into config (chave, valor) values (?, ?) on conflict(chave) do update set valor = excluded.valor', chave, valor);
      }
      return cfg();
    });
  }));

  // ---------- Reunião ----------
  const mostrarCombinados = async () => {
    const configObj = await cfg();
    const freq = configObj.combinados_frequencia || 'sempre';
    if (freq === 'sempre') return true;
    const ultima = await q1('select iniciada_em from reunioes order by iniciada_em desc limit 1');
    if (freq === 'primeira_do_mes') return !(await q1('select 1 from reunioes where substr(data, 1, 7) = ?', hoje().slice(0, 7)));
    const alterado = (await q1('select max(alterado_em) m from combinados'))?.m;
    return !ultima || (alterado && alterado > ultima.iniciada_em);
  };

  app.post('/api/reunioes/iniciar', gestao, h(async (req, res) => {
    return db.transaction(async () => {
      await travarCiclo();
      const aberta = await q1(`select * from reunioes where status = 'em_andamento' order by id desc limit 1`);
      if (aberta) return { reuniao: fmt(aberta), retomada: true, mostrar_combinados: false };
      const mostrar = await mostrarCombinados();
      const snapshot = await q('select id, texto, ordem from combinados where ativo = 1 and arquivado = 0 order by ordem, id');
      const { dia } = await cfgAoVivo();
      // Iniciada no próprio dia da reunião, ela trata das atualizações de hoje, mesmo depois do corte do meio-dia
      // (que só serve para o painel virar para a semana seguinte). Em outro dia, vale a próxima reunião.
      const semana = ehDiaReuniao(hoje(), dia) ? hoje() : refDiaReuniao(agora(), dia);
      const id = (await run(
        `insert into reunioes (data, semana, iniciada_em, status, combinados_snapshot, criada_por) values (?,?,?,?,?,?)`,
        hoje(), semana, agoraISO(), 'em_andamento', JSON.stringify(snapshot), req.user.id,
      )).lastInsertRowid;
      res.status(201);
      return { reuniao: fmt(await q1('select * from reunioes where id = ?', id)), retomada: false, mostrar_combinados: mostrar };
    });
  }));

  app.get('/api/reunioes', h(async (req) => {
    const gere = req.user.perfil !== 'chefe';
    return await q(
      `select r.id, r.data, r.semana, r.status, r.iniciada_em, r.encerrada_em, r.enviada_em,
         (select count(*) from decisoes d where d.reuniao_id = r.id) decisoes,
         (select count(*) from diretrizes g where g.reuniao_id = r.id) novas_acoes
       from reunioes r ${gere ? '' : `where r.status = 'enviada'`} order by r.data desc, r.id desc limit 40`,
    );
  }));

  const reuniaoOuErro = async (id) => {
    const r = await q1('select * from reunioes where id = ?', Number(id));
    if (!r) throw falha(404, 'Reunião não encontrada.');
    return r;
  };
  const emAndamento = (r) => {
    if (r.status !== 'em_andamento') throw falha(409, 'Esta reunião já foi encerrada.');
  };

  app.get('/api/reunioes/:id', h(async (req) => {
    const r = await reuniaoOuErro(req.params.id);
    if (req.user.perfil === 'chefe') {
      if (r.status !== 'enviada') throw falha(404, 'Reunião não encontrada.');
      return { id: r.id, data: r.data, status: r.status, ata_texto: r.ata_texto, combinados_snapshot: json(r.combinados_snapshot, []) };
    }
    return {
      ...fmt(r),
      decisoes: await q(`select d.*, s.sigla secao_sigla, s.nome secao_nome from decisoes d left join secoes s on s.id = d.secao_id where d.reuniao_id = ? order by d.id`, r.id),
      novas_acoes: await q(`select g.*, (select count(*) from acoes a where a.diretriz_id = g.id) total_acoes from diretrizes g where g.reuniao_id = ? order by g.id`, r.id),
      pedidos_decididos: await q(
        `select p.*, a.titulo acao_titulo, s.sigla secao_sigla from pedidos_prazo p join acoes a on a.id = p.acao_id join secoes s on s.id = a.secao_id where p.reuniao_id = ? and (a.interna = 0 or a.compartilhada = 1) order by p.decidido_em`, r.id),
    };
  }));

  app.get('/api/reunioes/:id/cartoes', gestao, h(async (req) => {
    const r = await reuniaoOuErro(req.params.id);
    return { reuniao: fmt(r), cartoes: await cartoesReuniao(db, r.semana, hoje()) };
  }));

  app.post('/api/reunioes/:id/decisoes', gestao, h(async (req, res) => {
    return comReuniao(req.params.id, async (r) => {
      emAndamento(r);
      const t = texto(req.body?.texto, 600);
      if (!t) throw falha(400, 'Escreva a decisão.');
      let secaoId = null;
      if (req.body?.secao_id) {
        secaoId = (await q1('select id from secoes where id = ?', Number(req.body.secao_id)))?.id;
        if (!secaoId) throw falha(400, 'Seção inválida.');
      }
      await run('insert into decisoes (reuniao_id, secao_id, texto, criada_em, criada_por) values (?,?,?,?,?)', r.id, secaoId, t, agoraISO(), req.user.id);
      res.status(201);
      return { ok: true };
    });
  }));
  app.delete('/api/reunioes/:id/decisoes/:decisaoId', gestao, h(async (req) => {
    return comReuniao(req.params.id, async (r) => {
      emAndamento(r);
      await run('delete from decisoes where id = ? and reuniao_id = ?', Number(req.params.decisaoId), r.id);
      return { ok: true };
    });
  }));

  app.post('/api/reunioes/:id/acoes', gestao, h(async (req, res) => {
    const resultado = await criarDiretriz(req.user, req.body || {}, Number(req.params.id));
    res.status(201);
    return resultado;
  }));

  async function gerarAta(r) {
    const { dia, hora } = await cfgAoVivo();
    const d = parseISO(r.data);
    const linhas = [`ATA DA REUNIÃO SEMANAL — ${br(r.data)} (${DIAS[d.getUTCDay()]})`, ''];
    const comb = json(r.combinados_snapshot, []);
    if (comb.length) {
      linhas.push('Combinados vigentes:');
      comb.forEach((c, i) => linhas.push(`${i + 1}. ${c.texto}`));
      linhas.push('');
    }
    const dec = await q(`select d.texto, s.sigla from decisoes d left join secoes s on s.id = d.secao_id where d.reuniao_id = ? order by d.id`, r.id);
    linhas.push('Decisões:');
    if (dec.length) dec.forEach((x) => linhas.push(`- [${x.sigla || 'Geral'}] ${x.texto}`));
    else linhas.push('- Nenhuma decisão registrada.');
    linhas.push('');
    const novas = await q(`select g.*, (select count(*) from acoes a where a.diretriz_id = g.id) n from diretrizes g where g.reuniao_id = ? order by g.id`, r.id);
    linhas.push('Novas ações:');
    if (novas.length) {
      for (const g of novas) {
        let alvo;
        if (g.destino === 'todos') {
          alvo = 'Todos os Centros';
        } else {
          const secoesAcao = await q(`select s.sigla from acoes a join secoes s on s.id = a.secao_id where a.diretriz_id = ?`, g.id);
          alvo = secoesAcao.map((s) => s.sigla).join(', ');
        }
        linhas.push(`- [${alvo}] ${g.titulo} — prazo ${br(g.prazo)} — prioridade ${PRIO[g.prioridade] || g.prioridade}`);
      }
    } else linhas.push('- Nenhuma ação nova.');
    linhas.push('');
    const ped = await q(`select p.*, a.titulo, s.sigla from pedidos_prazo p join acoes a on a.id = p.acao_id join secoes s on s.id = a.secao_id where p.reuniao_id = ? and (a.interna = 0 or a.compartilhada = 1) order by p.decidido_em`, r.id);
    if (ped.length) {
      linhas.push('Pedidos de novo prazo decididos:');
      ped.forEach((p) => linhas.push(`- [${p.sigla}] "${p.titulo}": novo prazo ${br(p.novo_prazo)} ${p.status === 'aprovado' ? 'aprovado' : 'recusado'}.`));
      linhas.push('');
    }
    // Impedimentos críticos ainda abertos (só de ações visíveis ao Diretor): ficam registrados na ata para a próxima reunião.
    const criticos = await q(`select i.descricao, i.apoio, a.titulo, s.sigla from impedimentos i join acoes a on a.id = i.acao_id
      join secoes s on s.id = a.secao_id where i.resolvido_em is null and i.critico = 1 and a.status != 'concluida'
        and a.arquivada = 0 and a.encerrada = 0 and (a.interna = 0 or a.compartilhada = 1) order by s.ordem, s.id, i.id`);
    if (criticos.length) {
      linhas.push('Impedimentos críticos em aberto:');
      criticos.forEach((c) => linhas.push(`- [${c.sigla}] "${c.titulo}": ${c.descricao}${c.apoio ? ` (apoio solicitado: ${c.apoio})` : ''}`));
      linhas.push('');
    }
    const proximaData = addDays(r.semana, 7);
    linhas.push(`Próxima reunião: ${DIAS[dia]}, ${br(proximaData)}, às ${hora}.`);
    return linhas.join('\n');
  }

  app.post('/api/reunioes/:id/encerrar', gestao, h(async (req) => {
    return comReuniao(req.params.id, async (r) => {
      emAndamento(r);
      const ataTexto = await gerarAta(r);
      await run(`update reunioes set status = 'rascunho', encerrada_em = ?, ata_texto = ? where id = ?`, agoraISO(), ataTexto, r.id);
      return fmt(await q1('select * from reunioes where id = ?', r.id));
    });
  }));
  app.post('/api/reunioes/:id/reabrir', gestao, h(async (req) => {
    return comReuniao(req.params.id, async (r) => {
      if (r.status !== 'rascunho') throw falha(409, 'Só é possível reabrir uma reunião cuja ata ainda está em rascunho.');
      if (await q1(`select 1 from reunioes where status = 'em_andamento'`)) throw falha(409, 'Já existe outra reunião em andamento.');
      await run(`update reunioes set status = 'em_andamento', encerrada_em = null where id = ?`, r.id);
      return fmt(await q1('select * from reunioes where id = ?', r.id));
    });
  }));
  app.put('/api/reunioes/:id/ata', gestao, h(async (req) => {
    return comReuniao(req.params.id, async (r) => {
      if (r.status === 'em_andamento') throw falha(409, 'A ata só existe depois que a reunião é encerrada.');
      const t = texto(req.body?.ata_texto, 20000);
      if (!t) throw falha(400, 'A ata não pode ficar vazia.');
      await run('update reunioes set ata_texto = ? where id = ?', t, r.id);
      return fmt(await q1('select * from reunioes where id = ?', r.id));
    });
  }));
  // Exclui a reunião e a ata. Ações criadas na reunião permanecem: só perdem o vínculo com ela.
  app.delete('/api/reunioes/:id', gestao, h(async (req) => {
    return comReuniao(req.params.id, async (r) => {
      if (r.status === 'em_andamento') throw falha(409, 'Encerre a reunião antes de excluir a ata.');
      await run('delete from decisoes where reuniao_id = ?', r.id);
      await run('update diretrizes set reuniao_id = null where reuniao_id = ?', r.id);
      await run('update pedidos_prazo set reuniao_id = null where reuniao_id = ?', r.id);
      await run('delete from reunioes where id = ?', r.id);
      return { ok: true, id: r.id };
    });
  }));
  app.post('/api/reunioes/:id/enviar-ata', gestao, h(async (req) => {
    return comReuniao(req.params.id, async (r) => {
      if (r.status !== 'rascunho') throw falha(409, 'A ata precisa estar em rascunho para ser enviada.');
      // Protótipo: não há envio de e-mail. A ata passa a ficar visível aos chefes na tela "Atas".
      await run(`update reunioes set status = 'enviada', enviada_em = ? where id = ?`, agoraISO(), r.id);
      return fmt(await q1('select * from reunioes where id = ?', r.id));
    });
  }));
}
