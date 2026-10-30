// Rotas de diretrizes, ações e pedidos de novo prazo.
import { subarvore } from './db.js';
import { DIAS_SEM_MOVIMENTO, PERFIS_DE_SECAO, PRIORIDADES, STATUS, TRANSICOES, addDays, br, ehISO, porDataDaTarefa } from './logic.js';
import { falha, h, marks, permit, texto } from './helpers.js';
import { empresaAtual } from './empresa.js';

export function rotasAcoes(app, { db, q, q1, run, agoraISO, hoje }) {
  const deSecao = (user) => PERFIS_DE_SECAO.includes(user.perfil); // chefe ou membro: trabalham numa seção
  // Ações que a pessoa enxerga (e altera, conforme o perfil). O chefe e o membro, a árvore da própria seção; a gestão e a
  // Consulta, as que o Diretor vê; o Administrador, todas. Rotas que gravam usam sempre este escopo.
  // Todo escopo começa pela empresa de quem consulta (`a.empresa_id = ?` é sempre o primeiro marcador do `where`).
  const escopoBase = async (user) => {
    if (user.perfil === 'administrador') return { inner: '1 = 1', params: [] }; // o Administrador consulta tudo, inclusive ações internas
    if (!deSecao(user)) return { inner: '(a.interna = 0 or a.compartilhada = 1)', params: [] };
    const ids = user.secao_id ? await subarvore(db, user.secao_id) : [-1];
    return { inner: `a.secao_id in (${marks(ids)})`, params: ids };
  };
  const daEmpresa = (inner, params) => ({ where: `a.empresa_id = ? and (${inner})`, params: [empresaAtual(), ...params] });
  const visiveisAcoes = async (user) => {
    const b = await escopoBase(user);
    return daEmpresa(b.inner, b.params);
  };
  // Leitura ampliada: o chefe com usuarios.ver_outros_centros também lê, sem alterar, as ações dos outros Centros
  // que o Diretor vê (sem as internas). Vale só para a lista com escopo=todos e para o detalhe.
  const visiveisLeitura = async (user) => {
    const b = await escopoBase(user);
    if (user.perfil !== 'chefe' || !user.ver_outros_centros) return daEmpresa(b.inner, b.params);
    return daEmpresa(`${b.inner} or a.interna = 0 or a.compartilhada = 1`, b.params);
  };
  /** Ação que a pessoa só pode ler: tudo para a Consulta; para o chefe, as de fora da própria árvore. */
  const soLeitura = async (user, lista) => {
    if (user.perfil === 'consulta') return new Set(lista.map((a) => a.id));
    if (user.perfil !== 'chefe' || !user.ver_outros_centros) return new Set();
    const arvore = user.secao_id ? await subarvore(db, user.secao_id) : [];
    return new Set(lista.filter((a) => !arvore.includes(a.secao_id)).map((a) => a.id));
  };
  const SEM_PERMISSOES = {
    pode_editar: false, pode_mudar_prazo: false, pode_mudar_demanda: false, pode_excluir: false,
    pode_executar: false, pode_comentar: false, pode_atribuir: false,
  };
  /** Marca `somente_leitura` e tira as permissões das ações que a pessoa só lê. O membro lê toda a árvore da seção,
   *  mas age só nas ações dele; numa ação de outra pessoa, só mexe (e comenta) onde há tarefa atribuída a ele. */
  const marcarLeitura = async (user, lista) => {
    const ler = await soLeitura(user, lista);
    const comTarefaDele = user.perfil === 'membro' && lista.length
      ? new Set((await q('select distinct acao_id from acao_checklist where responsavel_id = ?', user.id)).map((r) => Number(r.acao_id)))
      : new Set();
    return lista.map((a) => {
      if (ler.has(a.id)) return { ...a, ...SEM_PERMISSOES, somente_leitura: true };
      if (user.perfil === 'membro' && !a.pode_executar) {
        const tem = comTarefaDele.has(a.id);
        return { ...a, ...SEM_PERMISSOES, pode_comentar: tem, somente_leitura: !tem };
      }
      return { ...a, somente_leitura: false };
    });
  };

  // Última movimentação da ação (acoes.movimentada_em): toda gravação bem-sucedida em /api/acoes/:id/... conta
  // (status, prioridade, edição, tempo, comentário, checklist, impedimento, pedido de prazo, redirecionamento,
  // arquivamento, aceite). A data é gravada antes da resposta sair. Ação nova usa a data de criação.
  const movimentou = (id, empresaId) => run('update acoes set movimentada_em = ? where id = ? and empresa_id = ?', agoraISO(), id, empresaId);
  app.use('/api/acoes/:id', (req, res, next) => {
    const id = Number(req.params.id);
    // Abrir o detalhe (ciência de ação recebida) não é andamento da ação.
    if (req.method === 'GET' || req.path === '/vista' || !Number.isSafeInteger(id)) return next();
    const empresaId = req.user.empresa_id;
    const enviar = res.json.bind(res);
    res.json = (corpo) => {
      if (res.statusCode >= 400) return enviar(corpo);
      movimentou(id, empresaId).then(() => enviar(corpo), next);
      return res;
    };
    next();
  });
  const limiteParada = () => addDays(hoje(), -(DIAS_SEM_MOVIMENTO - 1)); // movimentada antes deste dia = parada há 7+ dias

  // ---------- Ações recebidas e ciência (acoes.recebida_em, acao_vistas) ----------
  // A ação "chega" à seção quando vem de fora: direcionada pela gestão (diretriz, seção acrescentada, ação criada
  // para a seção) ou redirecionada. Quem a recebe são os chefes que enxergam a seção (titular e suplente, também
  // os do Centro acima) e, na Diretoria Adjunta, os membros dela. Para cada um, ela é nova até ele abrir o detalhe.
  const secoesRecebidas = async (user) => {
    if (user.perfil === 'chefe' || (user.perfil === 'administrador' && user.secao_id)) return user.secao_id ? subarvore(db, user.secao_id) : [];
    return [];
  };
  const emCurso = (a) => a.status !== 'concluida' && !a.encerrada && !a.arquivada;
  /** Acrescenta `nova` a cada ação da lista, para quem consulta. */
  /** Quando a ação chegou para esta pessoa: para o chefe, quando a seção a recebeu; para o membro, quando o chefe a
   *  atribuiu a ele. Vazio se não chegou para ela. */
  const chegadaPara = (user, a, secoes) => {
    if (user.perfil === 'membro') return a.responsavel_id === user.id ? a.atribuida_em : null;
    return secoes.includes(a.secao_id) ? a.recebida_em : null;
  };
  const marcarNovas = async (user, lista) => {
    const brutas = lista.filter((a) => emCurso(a) && (user.perfil === 'membro' ? a.atribuida_em && a.responsavel_id === user.id : a.recebida_em)); // sem nenhuma, nem consulta a árvore
    const secoes = user.perfil !== 'membro' && brutas.length ? await secoesRecebidas(user) : [];
    const candidatas = brutas.filter((a) => chegadaPara(user, a, secoes)).map((a) => a.id);
    const vistas = candidatas.length
      ? new Map((await q(`select acao_id, vista_em from acao_vistas where usuario_id = ? and acao_id in (${marks(candidatas)})`, user.id, ...candidatas))
        .map((v) => [Number(v.acao_id), v.vista_em]))
      : new Map();
    return lista.map((a) => ({ ...a, nova: candidatas.includes(a.id) && !(vistas.get(a.id) >= chegadaPara(user, a, secoes)) }));
  };
  /** Registra que `user` tomou ciência da ação, se ela chegou para ele. Guarda a primeira vez depois da chegada. */
  const registrarVista = async (user, a) => {
    const chegada = chegadaPara(user, a, user.perfil === 'membro' ? [] : await secoesRecebidas(user));
    if (!chegada) return false;
    await run(`insert into acao_vistas (acao_id, usuario_id, vista_em) values (?,?,?)
      on conflict (acao_id, usuario_id) do update set vista_em = excluded.vista_em where acao_vistas.vista_em < ?`,
    a.id, user.id, agoraISO(), chegada);
    return true;
  };
  /** Quem já tomou ciência da ação desde que ela chegou à seção atual. */
  const vistasDa = (a) => (a.recebida_em
    ? q(`select v.usuario_id, u.nome as usuario_nome, v.vista_em from acao_vistas v join usuarios u on u.id = v.usuario_id
        where v.acao_id = ? and v.vista_em >= ? order by v.vista_em, v.usuario_id`, a.id, a.recebida_em)
    : []);

  const SELECT_ACAO = `select a.*, s.nome as secao_nome, s.sigla as secao_sigla,
      ua.perfil as autor_perfil,
      ua.secao_id as autor_secao_id,
      ur.nome as responsavel_nome,
      ur.perfil as responsavel_perfil,
      uat.nome as atribuido_por_nome,
      uvc.nome as validada_chefe_por_nome,
      us.chefe_id as autor_secao_chefe_id,
      d.criado_por as demandado_por_id,
      ud.nome as demandado_por_nome,
      ud.perfil as demandado_por_perfil,
      coalesce(d.criado_em, a.criada_em) as demandado_em,
      d.reuniao_id,
      r.semana as reuniao_semana,
      coalesce((select sum(minutos) from tempo where acao_id = a.id), 0) as tempo_total,
      exists(select 1 from pedidos_prazo p where p.acao_id = a.id and p.status = 'pendente') as pedido_pendente,
      (select count(*) from impedimentos i where i.acao_id = a.id and i.resolvido_em is null) as impedimentos_abertos,
      exists(select 1 from impedimentos i where i.acao_id = a.id and i.resolvido_em is null and i.critico = 1) as impedimento_critico,
      (select count(*) from acao_checklist c where c.acao_id = a.id) as checklist_total,
      (select count(*) from acao_checklist c where c.acao_id = a.id and c.concluido = 1) as checklist_feitos
    from acoes a
    join secoes s on s.id = a.secao_id
    left join usuarios ua on ua.id = a.criado_por
    left join usuarios ur on ur.id = a.responsavel_id
    left join usuarios uat on uat.id = a.atribuido_por
    left join usuarios uvc on uvc.id = a.validada_chefe_por
    left join secoes us on us.id = ua.secao_id
    left join diretrizes d on d.id = a.diretriz_id
    left join usuarios ud on ud.id = d.criado_por
    left join reunioes r on r.id = d.reuniao_id`;
  /** Validação de quem delegou, depois de a ação ser concluída. Só ações demandadas pelo Diretor (aceite dele) e as que
   *  o chefe atribuiu a outra pessoa (validação do chefe) têm uma; as demais ficam prontas ao serem concluídas.
   *  Em sequência: primeiro o chefe, depois o Diretor. */
  const validacaoDe = (a) => {
    const demandadaDiretor = !!a.demanda_diretor || !!a.diretriz_id || a.demandado_por_perfil === 'diretor';
    // Delegada: atribuída a um membro da equipe por outra pessoa (o chefe). Entre chefes, ou quando a pessoa executa a
    // própria ação, não há quem validar.
    const delegada = !!a.responsavel_id && !!a.atribuido_por && a.responsavel_id !== a.atribuido_por && a.responsavel_perfil === 'membro';
    const concluida = a.status === 'concluida' && !a.encerrada && !a.arquivada;
    let aguardando = null;
    if (concluida && delegada && !a.validada_chefe_em) aguardando = 'chefe';
    else if (concluida && demandadaDiretor) aguardando = 'diretor';
    return { demandada_diretor: demandadaDiretor, delegada, exige_validacao_chefe: delegada, exige_validacao_diretor: demandadaDiretor,
      validada_chefe: !!a.validada_chefe_em, aguardando_validacao: aguardando };
  };
  const acaoOut = (a) => ({
    ...a,
    ...validacaoDe(a),
    interna: !!a.interna,
    compartilhada: !!a.compartilhada,
    encerrada: !!a.encerrada,
    arquivada: !!a.arquivada,
    apresentada: !!a.apresentada_em,
    pedido_pendente: !!a.pedido_pendente,
    impedimentos_abertos: Number(a.impedimentos_abertos || 0),
    impedimento_critico: !!a.impedimento_critico,
    checklist_total: Number(a.checklist_total || 0),
    checklist_feitos: Number(a.checklist_feitos || 0),
    atrasada: a.status !== 'concluida' && !a.encerrada && !a.arquivada && a.prazo < hoje(),
    movimentada_em: a.movimentada_em || a.criada_em,
    // Em curso e sem nenhuma movimentação há DIAS_SEM_MOVIMENTO dias ou mais (ver movimentou).
    parada: a.status !== 'concluida' && !a.encerrada && !a.arquivada && (a.movimentada_em || a.criada_em) < limiteParada(),
    demandado_em: a.demandado_em || a.criada_em,
    demandado_por_nome: a.demandado_por_nome,
    reuniao_semana: a.reuniao_semana,
  });
  const impedimentoOut = (i) => ({ ...i, critico: !!i.critico, aberto: !i.resolvido_em });
  // Tarefa (acao_checklist): data de execução e responsável opcionais; atrasada quando a data passou e não foi feita.
  const checklistOut = (c) => ({ ...c, concluido: !!c.concluido, atrasada: !!c.data && !c.concluido && c.data < hoje() });
  const SELECT_TAREFA = `select c.*, u.nome as responsavel_nome from acao_checklist c left join usuarios u on u.id = c.responsavel_id`;
  const tarefa = async (iid) => checklistOut(await q1(`${SELECT_TAREFA} where c.id = ?`, iid));
  /** Quem pode ser responsável por uma tarefa: as contas ativas vinculadas à seção da ação, às seções acima dela
   *  (o chefe do Centro) e às subseções (titulares, suplentes e, na Diretoria Adjunta, os membros). */
  const responsaveisDa = (a) => q(`with recursive acima(id, pai_id) as (
        select id, pai_id from secoes where id = ? and empresa_id = ? union all select s.id, s.pai_id from secoes s join acima on s.id = acima.pai_id where s.empresa_id = ?
      ), abaixo(id) as (
        select cast(? as integer) union select s.id from secoes s join abaixo on s.pai_id = abaixo.id where s.empresa_id = ?
      )
      select u.id, u.nome, s.sigla as secao_sigla from usuarios u join secoes s on s.id = u.secao_id
      where u.empresa_id = ? and u.ativo = 1 and u.secao_id in (select id from acima union select id from abaixo) order by u.nome, u.id`,
  a.secao_id, empresaAtual(), empresaAtual(), a.secao_id, empresaAtual(), empresaAtual());
  /** Lê data e responsável do corpo (só os campos enviados). `null` ou vazio limpa o campo. */
  const camposDaTarefa = async (a, b) => {
    const campos = {};
    if ('data' in b) {
      if (b.data && !ehISO(b.data)) throw falha(400, 'Informe a data da tarefa no formato AAAA-MM-DD.');
      campos.data = b.data || null;
    }
    if ('responsavel_id' in b) {
      const rid = b.responsavel_id === null || b.responsavel_id === '' ? null : Number(b.responsavel_id);
      if (rid !== null && !(await responsaveisDa(a)).some((u) => u.id === rid)) {
        throw falha(400, 'Escolha como responsável alguém da seção da ação (titular, suplente ou chefe de subseção).');
      }
      campos.responsavel_id = rid;
    }
    return campos;
  };
  /** Quem pode executar uma ação da seção: chefes e membros da seção e das subseções (e, na Diretoria Adjunta, os
   *  Administradores vinculados a ela). É a lista de onde o chefe escolhe o responsável pela ação. */
  const executoresDa = (a) => q(`with recursive abaixo(id) as (
        select cast(? as integer) union select s.id from secoes s join abaixo on s.pai_id = abaixo.id where s.empresa_id = ?
      )
      select u.id, u.nome, u.perfil, s.sigla as secao_sigla from usuarios u join secoes s on s.id = u.secao_id
      where u.empresa_id = ? and u.ativo = 1 and u.perfil in ('chefe', 'membro', 'administrador') and u.secao_id in (select id from abaixo)
      order by u.perfil, u.nome, u.id`, a.secao_id, empresaAtual(), empresaAtual());
  /** Lê o responsável do corpo: `undefined` se não veio, `null` para limpar, ou o id (da seção da ação). */
  const escolherResponsavel = async (secaoId, valor) => {
    if (valor === undefined) return undefined;
    if (valor === null || valor === '') return null;
    const rid = Number(valor);
    if (!Number.isSafeInteger(rid) || !(await executoresDa({ secao_id: secaoId })).some((u) => u.id === rid)) {
      throw falha(400, 'Escolha como responsável alguém da seção da ação (chefe, suplente ou membro da equipe).');
    }
    return rid;
  };
  /** Quem atribui deixa registrado o quê e quando; a pessoa que assume a própria ação não "delega" a si mesma. */
  const atribuicao = (user, rid, quando) => (rid && rid !== user.id ? { atribuido_por: user.id, atribuida_em: quando } : { atribuido_por: null, atribuida_em: null });
  /** Entidade fora da subordinação ao Diretor que demandou a ação (texto livre, até 120 caracteres). */
  const lerDemandanteExterno = (valor) => {
    if (valor === undefined) return undefined;
    if (valor === null) return null;
    if (typeof valor !== 'string') throw falha(400, 'Informe o nome da entidade que demandou a ação.');
    if (!valor.trim()) return '';
    return texto(valor, 120);
  };
  const acaoVisivel = async (user, id, { leitura = false } = {}) => {
    const v = leitura ? await visiveisLeitura(user) : await visiveisAcoes(user);
    const a = await q1(`${SELECT_ACAO} where a.id = ? and ${v.where}`, id, ...v.params);
    if (!a) throw falha(404, 'Ação não encontrada.');
    return a;
  };
  // Quem responde pela ação como autor: o chefe ou suplente, as que ele mesmo criou (o titular, também as do
  // suplente da sua seção); o Diretor e o Apoio, as criadas pela gestão (Diretor, Apoio ou Diretor Adjunto);
  // o Administrador, todas. `a` sempre chega aqui vindo de acaoVisivel(user, ...), já com a visibilidade conferida.
  const ehAutor = (user, a) => {
    if (user.perfil === 'administrador') return true;
    if (['diretor', 'apoio'].includes(user.perfil)) return a.criado_por === user.id || ['diretor', 'apoio', 'administrador'].includes(a.autor_perfil);
    if (user.perfil === 'membro') return !!a.criado_por && a.criado_por === user.id; // o membro responde só pelas que criou
    if (user.perfil !== 'chefe' || !a.criado_por) return false;
    const titularDoSuplente = a.autor_perfil === 'chefe' && a.autor_secao_id === user.secao_id && a.autor_secao_chefe_id === user.id;
    // O chefe responde também pelas que os membros da própria seção criaram.
    const deMembroDaSecao = a.autor_perfil === 'membro' && a.autor_secao_id === user.secao_id;
    return a.criado_por === user.id || titularDoSuplente || deMembroDaSecao;
  };
  /** Quem executa a ação (status, tempo, tarefas, impedimentos): o chefe da seção e o Administrador, sempre; o membro,
   *  só as atribuídas a ele ou criadas por ele. `a` vem de acaoVisivel, já com a visibilidade conferida. */
  const executa = (user, a) => user.perfil === 'administrador'
    || (user.perfil === 'chefe' && !!user.secao_id)
    || (user.perfil === 'membro' && (a.responsavel_id === user.id || a.criado_por === user.id));
  // O autor edita título e detalhamento enquanto a ação não foi apresentada em reunião; o prazo, enquanto ela está
  // em curso (sempre guardando o anterior em acao_prazos); exclui só se ela não foi apresentada nem concluída.
  const permissoes = (user, a) => {
    const autor = ehAutor(user, a);
    const emCurso = !a.encerrada && !a.arquivada && a.status !== 'concluida';
    return {
      pode_editar: autor && !a.encerrada && !a.apresentada_em,
      pode_mudar_prazo: autor && emCurso,
      pode_mudar_demanda: autor && !a.encerrada && !a.diretriz_id,
      pode_excluir: autor && !a.encerrada && a.status !== 'concluida' && !a.apresentada_em,
      pode_executar: executa(user, a) && !a.encerrada,
      pode_comentar: user.perfil !== 'consulta' && (user.perfil !== 'membro' || executa(user, a)),
      // Atribuir a ação a alguém da seção: o chefe e o Administrador, enquanto ela está em curso.
      pode_atribuir: (user.perfil === 'administrador' || (user.perfil === 'chefe' && !!user.secao_id)) && emCurso,
    };
  };
  const NAO_GERE = 'Só quem criou a ação pode editá-la ou excluí-la: o chefe, as que ele (ou o seu suplente) criou; o Diretor e o Diretor Adjunto, as que direcionaram.';
  const chefeGere = (user, acao) => {
    if (executa(user, acao)) return;
    throw falha(403, user.perfil === 'membro'
      ? 'Você altera apenas as ações atribuídas a você ou criadas por você. Fale com o chefe da seção.'
      : 'Somente o chefe da seção responsável pode alterar esta ação.');
  };


  // ---------- Diretrizes e ações ----------
  async function criarDiretriz(user, b, reuniaoId = null) {
    const titulo = texto(b.titulo, 160);
    if (!titulo) throw falha(400, 'Informe o título da ação.');
    if (!ehISO(b.prazo)) throw falha(400, 'Informe o prazo da ação.');
    if (b.prazo < hoje()) throw falha(400, 'O prazo não pode ser anterior a hoje.');
    const prioridade = PRIORIDADES.includes(b.prioridade) ? b.prioridade : 'media';
    const destino = b.destino === 'todos' ? 'todos' : 'especificos';
    let alvos;
    if (destino === 'todos') {
      // "Todos os Centros" não inclui a Diretoria Adjunta, que não é Centro: ela recebe quando escolhida.
      alvos = (await q("select id from secoes where pai_id is null and ativa = 1 and tipo != 'diretoria_adjunta' and empresa_id = ?", empresaAtual())).map((r) => r.id);
    } else {
      const ids = [...new Set((b.secoes || []).map(Number))];
      const validados = [];
      for (const i of ids) {
        if (await q1('select 1 from secoes where id = ? and pai_id is null and ativa = 1 and empresa_id = ?', i, empresaAtual())) validados.push(i);
      }
      alvos = validados;
      if (alvos.length !== ids.length) throw falha(400, 'Só Centros, Coordenação e Diretoria Adjunta ativos podem receber ações do Diretor.');
    }
    if (!alvos.length) throw falha(400, 'Escolha ao menos uma seção para receber a ação.');
    // O Diretor Adjunto (Administrador vinculado à Diretoria Adjunta) não direciona ações para a própria seção:
    // as ações dela ele cria em "Minhas ações".
    if (user.perfil === 'administrador' && user.secao_id && alvos.includes(user.secao_id)) {
      throw falha(400, 'O Diretor Adjunto não direciona ações para a própria seção. Crie essas ações em "Minhas ações".');
    }
    const detalhe = texto(b.detalhe, 2000) || null;
    return await db.transaction(async () => {
      if (reuniaoId !== null) {
        const r = await q1(`select status from reunioes where id = ? and empresa_id = ?${db.isPg ? ' for update' : ''}`, reuniaoId, empresaAtual());
        if (!r) throw falha(404, 'Reunião não encontrada.');
        if (r.status !== 'em_andamento') throw falha(409, 'Esta reunião já foi encerrada.');
      }

      const d = (await run(
        'insert into diretrizes (titulo, detalhe, destino, prazo, prioridade, criado_por, criado_em, reuniao_id, empresa_id) values (?,?,?,?,?,?,?,?,?)',
        titulo, detalhe, destino, b.prazo, prioridade, user.id, agoraISO(), reuniaoId, empresaAtual(),
      )).lastInsertRowid;
      for (const s of alvos) {
        const quando = agoraISO();
        const aId = (await run(
          `insert into acoes (diretriz_id, secao_id, titulo, detalhe, prazo, prazo_original, prioridade, criada_em, criado_por, recebida_em, empresa_id) values (?,?,?,?,?,?,?,?,?,?,?)`,
          d, s, titulo, detalhe, b.prazo, b.prazo, prioridade, quando, user.id, quando, empresaAtual(),
        )).lastInsertRowid;
        await run(
          `insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)`,
          aId, user.id, reuniaoId ? 'Ação demandada pelo Diretor na reunião de acompanhamento.' : 'Ação demandada pelo Diretor.', agoraISO(),
        );
      }
      return { id: d, destino, acoes_criadas: alvos.length };
    });
  }

  app.post('/api/diretrizes', permit('diretor', 'apoio', 'administrador'), h(async (req, res) => {
    res.status(201);
    return await criarDiretriz(req.user, req.body || {});
  }));
  app.get('/api/diretrizes', permit('diretor', 'apoio', 'administrador'), h(async () => {
    const lista = await q(`select d.*, u.nome as criado_por_nome,
         (select count(*) from acoes a where a.diretriz_id = d.id and a.empresa_id = d.empresa_id) total,
         (select count(*) from acoes a where a.diretriz_id = d.id and a.empresa_id = d.empresa_id and a.status = 'concluida') concluidas
       from diretrizes d left join usuarios u on u.id = d.criado_por where d.empresa_id = ? order by d.criado_em desc, d.id desc limit 30`, empresaAtual());
    if (!lista.length) return lista;
    // Seções que têm hoje a ação de cada diretriz (uma ação redirecionada aparece na seção de destino).
    const ids = lista.map((d) => d.id);
    // Com cada seção, a primeira ciência desde que a ação chegou a ela (recebida_em vazio: ação anterior ao registro).
    const secoes = await q(`select a.diretriz_id, s.id, s.sigla, s.nome, a.recebida_em,
        (select v.vista_em from acao_vistas v where v.acao_id = a.id and v.vista_em >= a.recebida_em order by v.vista_em limit 1) as vista_em,
        (select u.nome from acao_vistas v join usuarios u on u.id = v.usuario_id
          where v.acao_id = a.id and v.vista_em >= a.recebida_em order by v.vista_em limit 1) as vista_por
      from acoes a join secoes s on s.id = a.secao_id
      where a.empresa_id = ? and a.diretriz_id in (${marks(ids)}) order by s.ordem, s.id`, empresaAtual(), ...ids);
    return lista.map((d) => ({
      ...d,
      secoes: secoes.filter((s) => s.diretriz_id === d.id).map(({ id, sigla, nome, recebida_em, vista_em, vista_por }) => ({ id, sigla, nome, recebida_em, vista_em, vista_por })),
    }));
  }));

  // Acrescentar seções a um direcionamento já feito: cada seção nova recebe a mesma ação (título, detalhamento,
  // prioridade), ligada à mesma diretriz. As seções que já a receberam não mudam. O prazo é o da diretriz, ou outro
  // informado (necessário quando o da diretriz já passou).
  app.post('/api/diretrizes/:id/secoes', permit('diretor', 'apoio', 'administrador'), h(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body || {};
    const ids = [...new Set((Array.isArray(b.secoes) ? b.secoes : []).map(Number))];
    if (!ids.length) throw falha(400, 'Escolha ao menos uma seção para acrescentar.');
    const out = await db.transaction(async () => {
      const d = await q1(`select * from diretrizes where id = ? and empresa_id = ?${db.isPg ? ' for update' : ''}`, id, empresaAtual());
      if (!d) throw falha(404, 'Direcionamento não encontrado.');
      const prazo = b.prazo || d.prazo;
      if (!ehISO(prazo)) throw falha(400, 'Informe o prazo da ação.');
      if (prazo < hoje()) throw falha(400, 'O prazo desta ação já passou. Informe um novo prazo para as seções acrescentadas.');
      for (const s of ids) {
        if (!(await q1('select 1 from secoes where id = ? and pai_id is null and ativa = 1 and empresa_id = ?', s, empresaAtual()))) {
          throw falha(400, 'Só Centros, Coordenação e Diretoria Adjunta ativos podem receber ações do Diretor.');
        }
      }
      if (req.user.perfil === 'administrador' && req.user.secao_id && ids.includes(req.user.secao_id)) {
        throw falha(400, 'O Diretor Adjunto não direciona ações para a própria seção. Crie essas ações em "Minhas ações".');
      }
      const jaTem = (await q(`select secao_id from acoes where diretriz_id = ? and empresa_id = ? and secao_id in (${marks(ids)})`, id, empresaAtual(), ...ids)).map((r) => r.secao_id);
      if (jaTem.length) throw falha(409, 'Alguma das seções escolhidas já recebeu esta ação. Atualize a tela e escolha outras.');
      for (const s of ids) {
        const quando = agoraISO();
        const aId = (await run(
          `insert into acoes (diretriz_id, secao_id, titulo, detalhe, prazo, prazo_original, prioridade, criada_em, criado_por, recebida_em, empresa_id) values (?,?,?,?,?,?,?,?,?,?,?)`,
          d.id, s, d.titulo, d.detalhe, prazo, prazo, d.prioridade, quando, req.user.id, quando, empresaAtual(),
        )).lastInsertRowid;
        await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)',
          aId, req.user.id, 'Ação demandada pelo Diretor (seção acrescentada ao direcionamento).', agoraISO());
      }
      // "Todos os Centros" deixa de descrever o destino quando entra uma seção a mais: passa a listar as seções.
      if (d.destino === 'todos') await run("update diretrizes set destino = 'especificos' where id = ? and empresa_id = ?", d.id, empresaAtual());
      return { id: d.id, acoes_criadas: ids.length };
    });
    res.status(201);
    return out;
  }));

  const STATUS_OK = new Set(STATUS);

  app.get('/api/acoes', h(async (req) => {
    const v = req.query.escopo === 'todos' ? await visiveisLeitura(req.user) : await visiveisAcoes(req.user);
    const where = [v.where];
    const params = [...v.params];
    const f = req.query;
    if (f.secao) {
      const ids = await subarvore(db, Number(f.secao));
      where.push(`a.secao_id in (${marks(ids)})`);
      params.push(...ids);
    }
    if (STATUS_OK.has(f.status)) { where.push('a.status = ?'); params.push(f.status); }
    if (f.origem === 'externa') where.push('a.demandante_externo is not null'); // demandas de entidades fora da subordinação ao Diretor
    if (ehISO(f.prazo)) { where.push('a.prazo = ?'); params.push(f.prazo); } // usado ao direcionar: ações já planejadas para o mesmo dia
    const sit = f.situacao || 'abertas';
    if (sit === 'arquivadas') {
      where.push('a.arquivada = 1');
    } else {
      where.push('a.arquivada = 0');
      if (sit === 'abertas') where.push(`a.status != 'concluida' and a.encerrada = 0`);
      else if (sit === 'atrasadas') { where.push(`a.status != 'concluida' and a.encerrada = 0 and a.prazo < ?`); params.push(hoje()); }
      else if (sit === 'concluidas') where.push(`a.status = 'concluida' and a.encerrada = 0`);
      else if (sit === 'encerradas') where.push('a.encerrada = 1');
    }
    if (f.q) { where.push('(a.titulo like ? or a.detalhe like ?)'); params.push(`%${f.q}%`, `%${f.q}%`); }
    return marcarLeitura(req.user, await marcarNovas(req.user, (await q(`${SELECT_ACAO} where ${where.join(' and ')}
              order by a.encerrada, case a.status when 'concluida' then 1 else 0 end,
                       case when a.status != 'concluida' and a.prazo < '${hoje()}' then 0 else 1 end, a.prazo, a.id`, ...params))
      .map((a) => ({ ...acaoOut(a), ...permissoes(req.user, a) }))));
  }));

  app.post('/api/acoes', permit('chefe', 'membro', 'diretor', 'apoio', 'administrador'), h(async (req, res) => {
    const b = req.body || {};
    const titulo = texto(b.titulo, 140);
    if (!titulo) throw falha(400, 'Informe o título da ação.');
    if (!ehISO(b.prazo)) throw falha(400, 'Informe o prazo da ação.');
    const prioridade = PRIORIDADES.includes(b.prioridade) ? b.prioridade : 'media';
    const secaoId = deSecao(req.user) ? req.user.secao_id : Number(b.secao_id);
    if (!secaoId) throw falha(400, 'Seção não informada.');
    if (!(await q1('select id from secoes where id = ? and ativa = 1 and empresa_id = ?', secaoId, empresaAtual()))) {
      throw falha(409, 'A seção precisa estar ativa para receber ações.');
    }
    const detalhe = texto(b.detalhe, 2000) || null;
    const interna = b.interna !== undefined ? (b.interna ? 1 : 0) : 0;
    if (b.demanda_diretor !== undefined && typeof b.demanda_diretor !== 'boolean') throw falha(400, 'Informe se a ação é demanda do Diretor.');
    const demanda = b.demanda_diretor === true ? 1 : 0;
    if (demanda && interna) throw falha(400, 'Uma demanda do Diretor deve ser visível na pauta. Desmarque ação interna.');
    const externo = lerDemandanteExterno(b.demandante_externo) ?? null;
    if (externo === '') throw falha(400, 'Informe o nome da entidade que demandou a ação.');
    if (externo && demanda) throw falha(400, 'Uma ação não pode ser, ao mesmo tempo, demanda do Diretor e de entidade externa. Escolha uma origem.');
    if (externo && interna) throw falha(400, 'Uma demanda externa deve ficar visível ao Diretor. Desmarque ação interna.');
    const responsavel = (await escolherResponsavel(secaoId, b.responsavel_id)) ?? null;
    if (responsavel && !['chefe', 'administrador'].includes(req.user.perfil)) throw falha(403, 'Só o chefe da seção atribui ações a outras pessoas.');
    res.status(201);
    // Criada por quem não é da seção (Diretor, Apoio, Administrador sem vínculo com ela): chega como nova.
    const quando = agoraISO();
    const recebida = !deSecao(req.user) && req.user.secao_id !== secaoId ? quando : null;
    const { atribuido_por: atribuidoPor, atribuida_em: atribuidaEm } = atribuicao(req.user, responsavel, quando);
    const id = (await run(
      `insert into acoes (diretriz_id, secao_id, titulo, detalhe, prazo, prazo_original, prioridade, interna, criada_em, criado_por, demanda_diretor, recebida_em,
         responsavel_id, atribuido_por, atribuida_em, demandante_externo, empresa_id)
       values (null, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      secaoId, titulo, detalhe, b.prazo, b.prazo, prioridade, interna, quando, req.user.id, demanda, recebida, responsavel, atribuidoPor, atribuidaEm, externo, empresaAtual(),
    )).lastInsertRowid;
    const nomeResp = responsavel ? (await q1('select nome from usuarios where id = ? and empresa_id = ?', responsavel, empresaAtual())).nome : null;
    await run(
      'insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)',
      id, req.user.id, `Ação criada pela seção (${req.user.nome}).${demanda ? ' Demanda do Diretor informada pela seção.' : ''}${externo ? ` Demanda de ${externo} (fora da subordinação ao Diretor).` : ''}${nomeResp ? ` Atribuída a ${nomeResp}.` : ''}`, agoraISO(),
    );
    return acaoOut(await q1(`${SELECT_ACAO} where a.id = ? and a.empresa_id = ?`, id, empresaAtual()));
  }));

  app.delete('/api/acoes/:id', h(async (req) => {
    try {
      return await db.transaction(async () => {
        const a = await acaoVisivel(req.user, Number(req.params.id));
        if (!ehAutor(req.user, a)) throw falha(403, NAO_GERE);
        if (a.status === 'concluida' || a.encerrada) throw falha(409, 'Ação concluída não pode ser excluída: ela faz parte do histórico da seção. Se quiser tirá-la da lista, arquive.');
        if (a.apresentada_em) throw falha(409, 'Esta ação já foi apresentada em reunião e não pode mais ser excluída. O prazo ainda pode ser alterado.');
        if (await q1('select id from acoes where acao_pai_id=? and empresa_id=?',a.id,empresaAtual())) throw falha(409,'Exclua primeiro as ações derivadas desta ação.');
        await run('delete from tempo where acao_id = ?', a.id);
        await run('delete from acao_comentarios where acao_id = ?', a.id);
        await run('delete from impedimentos where acao_id = ?', a.id);
        await run('delete from acao_checklist where acao_id = ?', a.id);
        await run('delete from acao_prazos where acao_id = ?', a.id);
        await run('delete from pedidos_prazo where acao_id = ?', a.id);
        await run('delete from acao_vistas where acao_id = ?', a.id);
        await run('delete from acoes where id = ? and empresa_id = ?', a.id, empresaAtual());
        return { ok: true, id: a.id };
      });
    } catch(e) {
      if(e.code==='23503' || String(e.code).startsWith('SQLITE_CONSTRAINT')) throw falha(409,'A ação possui vínculos que impedem a exclusão.');
      throw e;
    }
  }));

  app.post('/api/acoes/:id/arquivar', permit('chefe', 'administrador'), h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    await chefeGere(req.user, a);
    if (a.diretriz_id && req.user.perfil !== 'administrador') {
      throw falha(403, 'Ações demandadas pelo Diretor não podem ser arquivadas pela seção.');
    }
    await run('update acoes set arquivada = 1 where id = ? and empresa_id = ?', a.id, empresaAtual());
    await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)',
      a.id, req.user.id, 'Ação arquivada.', agoraISO());
    return acaoOut(await q1(`${SELECT_ACAO} where a.id = ? and a.empresa_id = ?`, a.id, empresaAtual()));
  }));

  app.post('/api/acoes/:id/desarquivar', permit('chefe', 'administrador'), h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    await chefeGere(req.user, a);
    if (!(await q1('select id from secoes where id = ? and ativa = 1 and empresa_id = ?', a.secao_id, empresaAtual()))) {
      throw falha(409, 'Reative a seção antes de desarquivar a ação.');
    }
    await run('update acoes set arquivada = 0 where id = ? and empresa_id = ?', a.id, empresaAtual());
    await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)',
      a.id, req.user.id, 'Ação desarquivada.', agoraISO());
    return acaoOut(await q1(`${SELECT_ACAO} where a.id = ? and a.empresa_id = ?`, a.id, empresaAtual()));
  }));

  app.get('/api/acoes/:id', h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id), { leitura: true });
    // Consultas independentes: em série custariam uma ida ao banco cada (o maior custo desta tela
    // é a rede, não o SQL). As permissões não consultam nada (ver permissoes).
    const [comentarios, lancamentos, pedidos, impedimentos, checklist, prazos, vistas, [{ nova }]] = await Promise.all([
      q(`select c.*, u.nome as usuario_nome from acao_comentarios c left join usuarios u on u.id = c.usuario_id where c.acao_id = ? order by c.id`, a.id),
      q(`select t.*, u.nome as usuario_nome from tempo t left join usuarios u on u.id = t.usuario_id where t.acao_id = ? order by t.data desc, t.id desc`, a.id),
      q('select * from pedidos_prazo where acao_id = ? order by id desc', a.id),
      q(`select i.*, uc.nome as criado_por_nome, ur.nome as resolvido_por_nome from impedimentos i
        left join usuarios uc on uc.id = i.criado_por left join usuarios ur on ur.id = i.resolvido_por
        where i.acao_id = ? order by i.id desc`, a.id),
      q(`${SELECT_TAREFA} where c.acao_id = ?`, a.id).then((l) => l.sort(porDataDaTarefa)),
      q(`select h.*, u.nome as alterado_por_nome from acao_prazos h left join usuarios u on u.id = h.alterado_por
        where h.acao_id = ? order by h.alterado_em, h.id`, a.id),
      vistasDa(a),
      marcarNovas(req.user, [a]),
    ]);
    const [acao] = await marcarLeitura(req.user, [{ ...acaoOut(a), ...permissoes(req.user, a) }]);
    return {
      ...acao,
      nova,
      vistas,
      prazos,
      comentarios,
      lancamentos,
      pedidos,
      impedimentos: impedimentos.map(impedimentoOut),
      checklist: checklist.map((c) => ({
        ...checklistOut(c),
        pode_marcar: !a.encerrada && (acao.pode_executar || (req.user.perfil === 'membro' && !acao.somente_leitura && c.responsavel_id === req.user.id)),
      })),
    };
  }));

  // Ciência de ação recebida: o detalhe chama esta rota quando a ação é nova para quem o abriu. Para quem não
  // recebe a ação (Diretor, Apoio, Administrador sem vínculo com a seção), nada é registrado.
  app.post('/api/acoes/:id/vista', h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    return { ok: true, registrada: await registrarVista(req.user, a) };
  }));

  app.patch('/api/acoes/:id', h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    const b = req.body || {};
    const autor = ehAutor(req.user, a);
    // Status é da execução: o chefe da seção (ou o Administrador). Prioridade: quem executa ou o autor.
    // Título, detalhamento e prazo: só o autor (ver ehAutor e permissoes).
    const edicao = ['titulo', 'detalhe', 'prazo', 'demanda_diretor', 'demandante_externo'].some((k) => k in b);
    if (edicao && !autor) throw falha(403, NAO_GERE);
    if (b.status !== undefined || (b.prioridade !== undefined && !autor)) await chefeGere(req.user, a);
    if (a.encerrada) throw falha(409, 'Esta ação já foi encerrada pelo Diretor.');

    // Atribuir a ação a alguém da seção: o chefe (ou o Administrador), enquanto ela está em curso. Mudar o responsável
    // recomeça a validação do chefe, que depende de quem executa.
    if ('responsavel_id' in b) {
      if (!(req.user.perfil === 'administrador' || (req.user.perfil === 'chefe' && req.user.secao_id))) throw falha(403, 'Só o chefe da seção atribui a ação a outra pessoa.');
      if (a.arquivada || a.status === 'concluida') throw falha(409, 'Só dá para mudar o responsável de uma ação em curso. Reabra a ação antes.');
      const rid = (await escolherResponsavel(a.secao_id, b.responsavel_id)) ?? null;
      if (rid !== (a.responsavel_id ?? null)) {
        const at = atribuicao(req.user, rid, agoraISO());
        await db.transaction(async () => {
          await run('update acoes set responsavel_id = ?, atribuido_por = ?, atribuida_em = ?, validada_chefe_em = null, validada_chefe_por = null where id = ? and empresa_id = ?',
            rid, at.atribuido_por, at.atribuida_em, a.id, empresaAtual());
          const novoNome = rid ? (await q1('select nome from usuarios where id = ? and empresa_id = ?', rid, empresaAtual())).nome : null;
          await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)',
            a.id, req.user.id, `Responsável: ${a.responsavel_nome || 'sem responsável'} → ${novoNome || 'sem responsável'}.`, agoraISO());
        });
      }
    }

    if (edicao) {
      if ('demanda_diretor' in b && typeof b.demanda_diretor !== 'boolean') throw falha(400, 'Informe se a ação é demanda do Diretor.');
      if ('demanda_diretor' in b && a.diretriz_id) throw falha(409, 'A origem desta ação vem de uma diretriz e não pode ser alterada pela marcação.');
      const demanda = 'demanda_diretor' in b ? Number(b.demanda_diretor) : a.demanda_diretor;
      const demandaMudou = demanda !== a.demanda_diretor;
      // Demanda de entidade fora da subordinação ao Diretor: nome livre; `null` remove a marcação.
      if ('demandante_externo' in b && a.diretriz_id) throw falha(409, 'A origem desta ação vem de uma diretriz do Diretor e não pode ser alterada pela marcação.');
      const externoLido = 'demandante_externo' in b ? lerDemandanteExterno(b.demandante_externo) : a.demandante_externo;
      if (externoLido === '') throw falha(400, 'Informe o nome da entidade que demandou a ação.');
      const externo = externoLido || null;
      const externoMudou = externo !== (a.demandante_externo || null);
      if (externo && demanda) throw falha(400, 'Uma ação não pode ser, ao mesmo tempo, demanda do Diretor e de entidade externa. Escolha uma origem.');
      // Marcar a origem torna a ação visível à gestão, conforme explicado no formulário.
      const interna = (demandaMudou && demanda) || (externoMudou && externo) ? 0 : a.interna;
      const titulo = 'titulo' in b ? texto(b.titulo, 160) : a.titulo;
      if (!titulo) throw falha(400, 'O título da ação não pode ficar vazio.');
      const detalhe = 'detalhe' in b ? (texto(b.detalhe, 2000) || null) : a.detalhe;
      const prazo = 'prazo' in b ? b.prazo : a.prazo;
      if (!ehISO(prazo)) throw falha(400, 'Informe o prazo da ação.');
      if (prazo !== a.prazo && prazo < hoje()) throw falha(400, 'O novo prazo não pode ser anterior a hoje.');
      const textoMudou = titulo !== a.titulo || (detalhe || null) !== (a.detalhe || null);
      const prazoMudou = prazo !== a.prazo;
      const pode = permissoes(req.user, a);
      if (textoMudou && !pode.pode_editar) {
        throw falha(409, 'Esta ação já foi apresentada em reunião: o título e o detalhamento não mudam mais. O prazo ainda pode ser alterado.');
      }
      if (prazoMudou && !pode.pode_mudar_prazo) throw falha(409, 'O prazo só muda enquanto a ação está em curso (não concluída nem arquivada).');
      const mudou = [titulo !== a.titulo && 'título', (detalhe || null) !== (a.detalhe || null) && 'detalhamento',
        prazoMudou && `prazo (de ${br(a.prazo)} para ${br(prazo)})`,
        demandaMudou && (demanda ? 'demanda do Diretor sinalizada pela seção' : 'marcação de demanda do Diretor removida'),
        externoMudou && (externo ? `demanda de ${externo} (fora da subordinação ao Diretor)` : 'marcação de demanda externa removida'),
        interna !== a.interna && 'ação passou a ser visível ao Diretor'].filter(Boolean);
      if (mudou.length) {
        await db.transaction(async () => {
          await run('update acoes set titulo = ?, detalhe = ?, prazo = ?, demanda_diretor = ?, interna = ?, demandante_externo = ? where id = ? and empresa_id = ?', titulo, detalhe, prazo, demanda, interna, externo, a.id, empresaAtual());
          // Toda mudança de prazo guarda o anterior; prazo_original continua sendo o primeiro.
          if (prazoMudou) {
            await run(`insert into acao_prazos (acao_id, prazo_anterior, prazo_novo, origem, alterado_em, alterado_por)
              values (?,?,?,'edicao',?,?)`, a.id, a.prazo, prazo, agoraISO(), req.user.id);
          }
          await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)',
            a.id, req.user.id, `Ação editada: ${mudou.join(', ')}.`, agoraISO());
        });
      }
    }

    const p = b.prioridade;
    if (p !== undefined) {
      if (!PRIORIDADES.includes(p)) throw falha(400, 'Prioridade inválida (use alta, media ou baixa).');
      await run('update acoes set prioridade = ? where id = ? and empresa_id = ?', p, a.id, empresaAtual());
    }

    const novo = req.body?.status;
    if (novo !== undefined) {
      if (!STATUS_OK.has(novo)) throw falha(400, 'Status inválido.');
      if (novo !== a.status) {
        if (!TRANSICOES[a.status].includes(novo)) throw falha(409, 'Essa mudança de status não é permitida a partir do status atual.');
        if (novo === 'concluida' && a.tempo_total <= 0) throw falha(422, 'Informe o tempo gasto, em minutos, antes de concluir a ação.');
        await db.transaction(async () => {
          // Mudar o status recomeça a validação do chefe: ela vale para a conclusão que ele viu.
          await run('update acoes set status = ?, concluida_em = ?, validada_chefe_em = null, validada_chefe_por = null where id = ? and empresa_id = ?', novo, novo === 'concluida' ? agoraISO() : null, a.id, empresaAtual());
          // Ação concluída não tem mais o que travar: os impedimentos abertos são encerrados, e o histórico fica.
          if (novo === 'concluida') {
            await run('update impedimentos set resolvido_em = ?, resolvido_por = ?, resolucao = ? where acao_id = ? and resolvido_em is null',
              agoraISO(), req.user.id, 'Ação concluída.', a.id);
          }
          // Voltar para "a fazer" reabre o trabalho do zero: o tempo já registrado não descreve mais o que falta.
          if (novo === 'a_fazer' && a.tempo_total > 0) {
            await run('delete from tempo where acao_id = ?', a.id);
            const h = Math.floor(a.tempo_total / 60), min = a.tempo_total % 60;
            const tempoFmt = h ? `${h} h${min ? ` ${min} min` : ''}` : `${min} min`;
            await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)',
              a.id, req.user.id, `Status voltou para "a fazer": ${tempoFmt} de tempo registrado foram excluídos.`, agoraISO());
          }
        });
      }
    }
    return acaoOut(await q1(`${SELECT_ACAO} where a.id = ? and a.empresa_id = ?`, a.id, empresaAtual()));
  }));

  app.post('/api/acoes/:id/tempo', h(async (req, res) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    await chefeGere(req.user, a);
    if (a.encerrada) throw falha(409, 'Esta ação já foi encerrada pelo Diretor.');
    const minutos = Number(req.body?.minutos);
    if (!Number.isInteger(minutos) || minutos <= 0 || minutos > 1440) throw falha(400, 'Informe o tempo em minutos inteiros, entre 1 e 1440.');
    const data = req.body?.data || hoje();
    if (!ehISO(data) || data > hoje()) throw falha(400, 'A data do lançamento não pode ser futura.');
    await run('insert into tempo (acao_id, usuario_id, data, minutos, criado_em) values (?,?,?,?,?)', a.id, req.user.id, data, minutos, agoraISO());
    res.status(201);
    return acaoOut(await q1(`${SELECT_ACAO} where a.id = ? and a.empresa_id = ?`, a.id, empresaAtual()));
  }));

  app.post('/api/acoes/:id/comentarios', permit('chefe', 'membro', 'diretor', 'apoio', 'administrador'), h(async (req, res) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    const t = texto(req.body?.texto, 1000);
    if (!t) throw falha(400, 'Escreva o comentário.');
    if (req.user.perfil === 'membro' && !executa(req.user, a) && !(await q1('select 1 from acao_checklist where acao_id = ? and responsavel_id = ?', a.id, req.user.id))) {
      throw falha(403, 'Você comenta nas ações atribuídas a você, criadas por você ou que tenham tarefa sua.');
    }
    await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)', a.id, req.user.id, t, agoraISO());
    res.status(201);
    return { ok: true };
  }));

  // O pedido de novo prazo vai ao Diretor e é feito pelo chefe; o membro pede ao chefe, pelos comentários.
  app.post('/api/acoes/:id/pedido-prazo', permit('chefe', 'administrador'), h(async (req, res) => {
    const id = Number(req.params.id);
    await chefeGere(req.user, await acaoVisivel(req.user, id));
    await db.transaction(async () => {
      if (db.isPg) await q1('select id from acoes where id = ? and empresa_id = ? for update', id, empresaAtual());
      const a = await acaoVisivel(req.user, id);
      await chefeGere(req.user, a);
      if (a.arquivada || a.encerrada) throw falha(409, 'Não é possível pedir prazo para uma ação arquivada ou encerrada.');
      const novo = req.body?.novo_prazo;
      const just = texto(req.body?.justificativa, 600);
      if (!ehISO(novo) || novo <= a.prazo) throw falha(400, 'O novo prazo deve ser posterior ao prazo atual.');
      if (!just) throw falha(400, 'Explique o motivo do novo prazo.');
      if (a.pedido_pendente) throw falha(409, 'Já existe um pedido de novo prazo aguardando decisão.');
      await run('insert into pedidos_prazo (acao_id, usuario_id, prazo_atual, novo_prazo, justificativa, criado_em) values (?,?,?,?,?,?)',
        a.id, req.user.id, a.prazo, novo, just, agoraISO());
    });
    res.status(201);
    return { ok: true };
  }));

  // ---------- Impedimentos da ação ----------
  // Histórico com ciclo aberto → resolvido; nunca editado nem excluído (correção = resolver e registrar outro).
  // O chefe age na própria árvore; Diretor, Apoio e Administrador, em qualquer ação que possam ver.
  const perfisImpedimento = permit('chefe', 'membro', 'diretor', 'apoio', 'administrador');
  const podeAgirNoImpedimento = async (user, acao) => { if (deSecao(user)) await chefeGere(user, acao); };

  app.post('/api/acoes/:id/impedimentos', perfisImpedimento, h(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body || {};
    const descricao = texto(b.descricao, 600);
    if (!descricao) throw falha(400, 'Descreva o impedimento.');
    const apoio = texto(b.apoio, 600) || null;
    const critico = b.critico ? 1 : 0;
    const out = await db.transaction(async () => {
      if (db.isPg) await q1('select id from acoes where id = ? and empresa_id = ? for update', id, empresaAtual());
      const a = await acaoVisivel(req.user, id);
      await podeAgirNoImpedimento(req.user, a);
      if (a.encerrada || a.arquivada) throw falha(409, 'Ação arquivada ou encerrada não recebe impedimentos.');
      if (a.status === 'concluida') throw falha(409, 'Uma ação concluída não recebe impedimentos.');
      if (b.bloquear && a.status !== 'bloqueada') {
        if (!TRANSICOES[a.status].includes('bloqueada')) {
          throw falha(409, 'Para bloquear, a ação precisa estar em andamento. Inicie a ação ou registre o impedimento sem bloquear.');
        }
        await run("update acoes set status = 'bloqueada' where id = ? and empresa_id = ?", a.id, empresaAtual());
      }
      const iid = (await run(
        'insert into impedimentos (acao_id, descricao, critico, apoio, criado_em, criado_por) values (?,?,?,?,?,?)',
        a.id, descricao, critico, apoio, agoraISO(), req.user.id,
      )).lastInsertRowid;
      await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)', a.id, req.user.id,
        `Impedimento registrado${critico ? ' (crítico)' : ''}${b.bloquear ? ', ação bloqueada' : ''}: ${descricao}`, agoraISO());
      return {
        impedimento: impedimentoOut(await q1('select * from impedimentos where id = ?', iid)),
        acao: acaoOut(await q1(`${SELECT_ACAO} where a.id = ? and a.empresa_id = ?`, a.id, empresaAtual())),
      };
    });
    res.status(201);
    return out;
  }));

  app.post('/api/acoes/:id/impedimentos/:iid/resolver', perfisImpedimento, h(async (req) => {
    const id = Number(req.params.id);
    const iid = Number(req.params.iid);
    const resolucao = texto(req.body?.resolucao, 600) || null;
    return db.transaction(async () => {
      if (db.isPg) await q1('select id from acoes where id = ? and empresa_id = ? for update', id, empresaAtual());
      const a = await acaoVisivel(req.user, id);
      await podeAgirNoImpedimento(req.user, a);
      const imp = await q1('select * from impedimentos where id = ? and acao_id = ?', iid, a.id);
      if (!imp) throw falha(404, 'Impedimento não encontrado.');
      if (imp.resolvido_em) throw falha(409, 'Este impedimento já foi resolvido.');
      const r = await run('update impedimentos set resolvido_em = ?, resolvido_por = ?, resolucao = ? where id = ? and resolvido_em is null',
        agoraISO(), req.user.id, resolucao, imp.id);
      if (!r.changes) throw falha(409, 'Este impedimento já foi resolvido. Atualize a tela.');
      const retomar = !!req.body?.retomar && a.status === 'bloqueada' && !a.encerrada && !a.arquivada;
      if (retomar) await run("update acoes set status = 'em_andamento' where id = ? and empresa_id = ?", a.id, empresaAtual());
      await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)', a.id, req.user.id,
        `Impedimento resolvido${resolucao ? `: ${resolucao}` : ''}${retomar ? '. Ação retomada (em andamento).' : ''}`, agoraISO());
      return {
        impedimento: impedimentoOut(await q1('select * from impedimentos where id = ?', imp.id)),
        acao: acaoOut(await q1(`${SELECT_ACAO} where a.id = ? and a.empresa_id = ?`, a.id, empresaAtual())),
      };
    });
  }));

  // ---------- Tarefas da ação (tabela acao_checklist) ----------
  // Apoio ao chefe: não mudam o status nem afetam a regra de concluir (que continua exigindo tempo registrado).
  // Cada tarefa pode ter data de execução e responsável (da seção da ação); a lista sai ordenada por data, as sem
  // data no fim. Diferente de impedimentos, podem ser editadas e excluídas livremente.
  // Todas as tarefas para a agenda: as das ações que a pessoa enxerga (mesmo escopo de GET /api/acoes) e, além
  // delas, as atribuídas a ela em ações de outra seção (`acao_visivel: false`: só informação, sem abrir a ação).
  // Ações arquivadas ou encerradas ficam de fora. Só leitura; marcar como feita continua em PATCH .../checklist/:iid.
  app.get('/api/tarefas', h(async (req) => {
    const v = await visiveisAcoes(req.user);
    const lista = await q(`select c.id, c.acao_id, c.texto, c.data, c.concluido, c.responsavel_id, u.nome as responsavel_nome,
        a.titulo as acao_titulo, a.status as acao_status, a.secao_id, s.sigla as secao_sigla, s.nome as secao_nome,
        a.responsavel_id as acao_responsavel_id, a.criado_por as acao_criado_por,
        (${v.where}) as acao_visivel
      from acao_checklist c join acoes a on a.id = c.acao_id join secoes s on s.id = a.secao_id
        left join usuarios u on u.id = c.responsavel_id
      where a.empresa_id = ? and a.arquivada = 0 and a.encerrada = 0 and ((${v.where}) or c.responsavel_id = ?)
      order by c.acao_id, c.ordem, c.id`, ...v.params, empresaAtual(), ...v.params, req.user.id);
    // Quem pode marcar a tarefa como feita: quem executa a ação (o chefe, o Administrador, o membro dono ou autor da
    // ação) e o membro a quem a própria tarefa foi atribuída.
    const marca = (t) => !!t.acao_visivel && (req.user.perfil === 'administrador' || (req.user.perfil === 'chefe' && !!req.user.secao_id)
      || (req.user.perfil === 'membro' && (t.responsavel_id === req.user.id || t.acao_responsavel_id === req.user.id || t.acao_criado_por === req.user.id)));
    return lista.map((t) => ({ ...checklistOut(t), acao_visivel: !!t.acao_visivel, pode_marcar: marca(t) })).sort(porDataDaTarefa);
  }));

  // Quem pode ser o responsável pela ação: chefes, membros e (na Diretoria Adjunta) Administradores da seção e subseções.
  app.get('/api/acoes/:id/executores', permit('chefe', 'administrador'), h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    await chefeGere(req.user, a);
    return executoresDa(a);
  }));

  app.get('/api/acoes/:id/responsaveis', h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    await chefeGere(req.user, a);
    return responsaveisDa(a);
  }));

  app.post('/api/acoes/:id/checklist', h(async (req, res) => {
    const id = Number(req.params.id);
    const t = texto(req.body?.texto, 200);
    if (!t) throw falha(400, 'Escreva a tarefa.');
    const a = await acaoVisivel(req.user, id);
    await chefeGere(req.user, a);
    if (a.encerrada) throw falha(409, 'Esta ação já foi encerrada pelo Diretor.');
    const { data = null, responsavel_id: responsavel = null } = await camposDaTarefa(a, req.body || {});
    const ordem = (await q1('select coalesce(max(ordem), 0) + 1 o from acao_checklist where acao_id = ?', a.id)).o;
    const iid = (await run('insert into acao_checklist (acao_id, texto, ordem, criado_em, criado_por, data, responsavel_id) values (?,?,?,?,?,?,?)',
      a.id, t, ordem, agoraISO(), req.user.id, data, responsavel)).lastInsertRowid;
    res.status(201);
    return tarefa(iid);
  }));

  app.patch('/api/acoes/:id/checklist/:iid', h(async (req) => {
    const id = Number(req.params.id);
    const iid = Number(req.params.iid);
    const a = await acaoVisivel(req.user, id);
    const item = await q1('select * from acao_checklist where id = ? and acao_id = ?', iid, a.id);
    // O membro que não executa a ação, mas tem uma tarefa atribuída nela, marca essa tarefa como feita ou a reabre.
    const soMarcar = req.user.perfil === 'membro' && !executa(req.user, a) && !!item && item.responsavel_id === req.user.id;
    if (!soMarcar) await chefeGere(req.user, a);
    if (a.encerrada) throw falha(409, 'Esta ação já foi encerrada pelo Diretor.');
    if (!item) throw falha(404, 'Tarefa não encontrada.');
    const b = req.body || {};
    if (soMarcar && Object.keys(b).some((k) => k !== 'concluido')) throw falha(403, 'Na tarefa atribuída a você, só dá para marcar como feita ou reabrir. O resto fica com quem executa a ação.');
    if ('texto' in b) {
      const t = texto(b.texto, 200);
      if (!t) throw falha(400, 'A tarefa não pode ficar vazia.');
      await run('update acao_checklist set texto = ? where id = ?', t, iid);
    }
    const campos = await camposDaTarefa(a, b);
    if ('data' in campos) await run('update acao_checklist set data = ? where id = ?', campos.data, iid);
    if ('responsavel_id' in campos) await run('update acao_checklist set responsavel_id = ? where id = ?', campos.responsavel_id, iid);
    if ('concluido' in b) {
      const c = !!b.concluido;
      await run('update acao_checklist set concluido = ?, concluido_em = ?, concluido_por = ? where id = ?',
        c ? 1 : 0, c ? agoraISO() : null, c ? req.user.id : null, iid);
    }
    return tarefa(iid);
  }));

  app.delete('/api/acoes/:id/checklist/:iid', h(async (req) => {
    const id = Number(req.params.id);
    const iid = Number(req.params.iid);
    const a = await acaoVisivel(req.user, id);
    await chefeGere(req.user, a);
    if (a.encerrada) throw falha(409, 'Esta ação já foi encerrada pelo Diretor.');
    const r = await run('delete from acao_checklist where id = ? and acao_id = ?', iid, a.id);
    if (!r.changes) throw falha(404, 'Tarefa não encontrada.');
    return { ok: true };
  }));

  // ---------- Redirecionar a ação para outra seção ----------
  // A ação muda de seção com todo o histórico (tempo, checklist, impedimentos, pedidos e comentários).
  // Diretor, Apoio e Administrador escolhem qualquer seção ativa; o chefe, só seções da própria árvore.
  app.post('/api/acoes/:id/redirecionar', permit('chefe', 'diretor', 'apoio', 'administrador'), h(async (req) => {
    const id = Number(req.params.id);
    const destinoId = Number(req.body?.secao_id);
    const motivo = texto(req.body?.motivo, 600);
    if (!destinoId) throw falha(400, 'Escolha a seção que vai receber a ação.');
    return db.transaction(async () => {
      if (db.isPg) await q1('select id from acoes where id = ? and empresa_id = ? for update', id, empresaAtual());
      const a = await acaoVisivel(req.user, id);
      if (req.user.perfil === 'chefe') await chefeGere(req.user, a);
      if (a.encerrada || a.arquivada) throw falha(409, 'Ação arquivada ou encerrada não pode ser redirecionada.');
      if (a.status === 'concluida') throw falha(409, 'Uma ação concluída não pode ser redirecionada.');
      if (destinoId === a.secao_id) throw falha(400, 'A ação já está nesta seção. Escolha outra seção.');
      const destino = await q1('select id, nome, sigla from secoes where id = ? and ativa = 1 and empresa_id = ?', destinoId, empresaAtual());
      if (!destino) throw falha(409, 'A seção escolhida não existe ou não está ativa.');
      if (req.user.perfil === 'chefe' && !(await subarvore(db, req.user.secao_id)).includes(destino.id)) {
        throw falha(403, 'O chefe só redireciona ações para a própria seção ou para as subseções dela.');
      }
      if (a.diretriz_id && await q1('select 1 from acoes where diretriz_id = ? and secao_id = ? and id != ? and empresa_id = ?', a.diretriz_id, destino.id, a.id, empresaAtual())) {
        throw falha(409, 'A seção escolhida já recebeu esta mesma demanda do Diretor.');
      }
      // Chega à nova seção como nova; quem redireciona dentro da própria árvore já está ciente.
      const quando = agoraISO();
      await run('update acoes set secao_id = ?, recebida_em = ? where id = ? and empresa_id = ?', destino.id, quando, a.id, empresaAtual());
      await registrarVista(req.user, { ...a, secao_id: destino.id, recebida_em: quando });
      await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)', a.id, req.user.id,
        `Ação redirecionada de ${a.secao_sigla || a.secao_nome} para ${destino.sigla || destino.nome}${motivo ? `. Motivo: ${motivo}` : '.'}`, agoraISO());
      return acaoOut(await q1(`${SELECT_ACAO} where a.id = ? and a.empresa_id = ?`, a.id, empresaAtual()));
    });
  }));

  // Aceite do Diretor: só das ações demandadas por ele, e depois da validação do chefe quando a ação foi delegada a um
  // membro. O Administrador age em qualquer etapa.
  app.post('/api/acoes/:id/encerrar', permit('diretor', 'administrador'), h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    if (a.status !== 'concluida') throw falha(409, 'Só é possível encerrar uma ação concluída.');
    if (req.user.perfil === 'diretor') {
      const v = validacaoDe(a);
      if (v.aguardando_validacao === 'chefe') throw falha(409, 'Esta ação ainda aguarda a validação do chefe da seção. O seu aceite vem depois.');
      if (!v.exige_validacao_diretor) throw falha(409, 'Esta ação não foi demandada pelo Diretor: ela fica pronta ao ser concluída e não precisa do seu aceite.');
    }
    await run('update acoes set encerrada = 1 where id = ? and empresa_id = ?', a.id, empresaAtual());
    return { ok: true };
  }));
  // Validação do chefe: a ação que ele atribuiu a um membro só fica pronta (ou segue para o aceite do Diretor, se for
  // demanda dele) depois que o chefe da seção confere o que o membro concluiu.
  app.post('/api/acoes/:id/validar', permit('chefe', 'administrador'), h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    await chefeGere(req.user, a);
    if (!validacaoDe(a).exige_validacao_chefe) throw falha(409, 'Esta ação não foi atribuída a um membro da equipe: não há o que validar.');
    if (a.encerrada || a.status !== 'concluida') throw falha(409, 'Só dá para validar uma ação concluída.');
    if (a.validada_chefe_em) throw falha(409, 'Esta ação já foi validada.');
    await run('update acoes set validada_chefe_em = ?, validada_chefe_por = ? where id = ? and empresa_id = ?', agoraISO(), req.user.id, a.id, empresaAtual());
    await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)', a.id, req.user.id, `Validada pelo chefe (${req.user.nome}).`, agoraISO());
    return acaoOut(await q1(`${SELECT_ACAO} where a.id = ? and a.empresa_id = ?`, a.id, empresaAtual()));
  }));
  // Devolver para ajuste: cada um devolve a etapa que lhe cabe (o chefe, a que aguarda a validação dele; o Diretor, a
  // que aguarda o aceite dele). A ação volta a "em andamento" e a validação recomeça.
  app.post('/api/acoes/:id/devolver', permit('chefe', 'diretor', 'administrador'), h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    const t = texto(req.body?.comentario, 1000);
    if (!t) throw falha(400, 'Explique o que falta para a ação ser aceita.');
    if (a.status !== 'concluida') throw falha(409, 'Só é possível devolver uma ação concluída.');
    const etapa = validacaoDe(a).aguardando_validacao;
    if (req.user.perfil === 'chefe') {
      await chefeGere(req.user, a);
      if (etapa !== 'chefe') throw falha(409, 'Só dá para devolver a ação que aguarda a sua validação.');
    } else if (req.user.perfil === 'diretor' && etapa !== 'diretor') {
      throw falha(409, etapa === 'chefe' ? 'Esta ação ainda aguarda a validação do chefe da seção.' : 'Esta ação não aguarda o aceite do Diretor.');
    }
    await run(`update acoes set status = 'em_andamento', concluida_em = null, encerrada = 0, validada_chefe_em = null, validada_chefe_por = null where id = ? and empresa_id = ?`, a.id, empresaAtual());
    const quem = { administrador: 'o Administrador', diretor: 'o Diretor', chefe: `o chefe (${req.user.nome})` }[req.user.perfil];
    await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)', a.id, req.user.id, `Devolvida pel${quem}: ${t}`, agoraISO());
    return { ok: true };
  }));

  // ---------- Pedidos de novo prazo ----------
  app.get('/api/pedidos-prazo', permit('diretor', 'apoio', 'administrador'), h(async (req) => {
    const st = req.query.status === 'todos' ? null : 'pendente';
    return await q(`select p.*, a.titulo as acao_titulo, a.secao_id, s.nome as secao_nome, s.sigla as secao_sigla, u.nome as usuario_nome
              from pedidos_prazo p join acoes a on a.id = p.acao_id join secoes s on s.id = a.secao_id
              left join usuarios u on u.id = p.usuario_id
              where a.empresa_id = ? and (${req.user.perfil === 'administrador' ? '1 = 1' : 'a.interna = 0 or a.compartilhada = 1'}) ${st ? `and p.status = '${st}' and a.arquivada = 0 and a.encerrada = 0` : ''}
              order by p.criado_em desc`, empresaAtual());
  }));
  app.post('/api/pedidos-prazo/:id/decidir', permit('diretor', 'apoio', 'administrador'), h(async (req) => {
    const id = Number(req.params.id);
    const todas = req.user.perfil === 'administrador'; // vê também as ações internas das subseções
    const filtro = todas ? '1 = 1' : 'a.interna = 0 or a.compartilhada = 1';
    const visivel = await q1(`select p.acao_id from pedidos_prazo p join acoes a on a.id = p.acao_id
      where p.id = ? and a.empresa_id = ? and (${filtro})`, id, empresaAtual());
    if (!visivel) throw falha(404, 'Pedido não encontrado.');
    return db.transaction(async () => {
      // Criar pedido e decidir pedido adquirem a mesma trava, sempre na ação.
      if (db.isPg) await q1('select id from acoes where id = ? and empresa_id = ? for update', visivel.acao_id, empresaAtual());
      const p = await q1(`select p.*, a.arquivada, a.encerrada, a.prazo from pedidos_prazo p join acoes a on a.id = p.acao_id
        where p.id = ? and a.empresa_id = ? and (${filtro})`, id, empresaAtual());
      if (!p) throw falha(404, 'Pedido não encontrado.');
      if (p.arquivada || p.encerrada) throw falha(409, 'Não é possível decidir prazo de uma ação arquivada ou encerrada.');
      if (p.status !== 'pendente') throw falha(409, 'Este pedido já foi decidido.');
      let reuniaoId = null;
      if (req.body?.reuniao_id) {
        const r = await q1(`select id from reunioes where id = ? and status = 'em_andamento' and empresa_id = ?${db.isPg ? ' for update' : ''}`, Number(req.body.reuniao_id), empresaAtual());
        if (!r) throw falha(409, 'A reunião informada não está em andamento.');
        reuniaoId = r.id;
      }
      if (req.user.perfil === 'apoio' && !reuniaoId) {
        throw falha(403, 'Somente o Diretor decide pedidos de prazo; o Apoio pode registrar a decisão durante a reunião.');
      }
      const aprovar = req.body?.aprovar;
      if (typeof aprovar !== 'boolean') throw falha(400, 'Informe se o pedido deve ser aprovado ou recusado.');
      if (aprovar && p.prazo !== p.prazo_atual) throw falha(409, 'O prazo da ação mudou. Recuse este pedido e solicite um novo.');
      const alterado = await run(`update pedidos_prazo set status = ?, decidido_em = ?, decidido_por = ?, reuniao_id = ?
        where id = ? and status = 'pendente'`,
        aprovar ? 'aprovado' : 'recusado', agoraISO(), req.user.id, reuniaoId, p.id);
      if (!alterado.changes) throw falha(409, 'Este pedido já foi decidido. Atualize a tela.');
      await movimentou(p.acao_id, req.user.empresa_id);
      if (aprovar) {
        await run('update acoes set prazo = ? where id = ? and empresa_id = ?', p.novo_prazo, p.acao_id, empresaAtual());
        await run(`insert into acao_prazos (acao_id, prazo_anterior, prazo_novo, origem, pedido_id, alterado_em, alterado_por)
          values (?,?,?,'pedido',?,?,?)`, p.acao_id, p.prazo, p.novo_prazo, p.id, agoraISO(), req.user.id);
      }
      return { ok: true, status: aprovar ? 'aprovado' : 'recusado' };
    });
  }));

  return { criarDiretriz, SELECT_ACAO, acaoOut };
}
