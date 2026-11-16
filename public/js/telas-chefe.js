// Telas do chefe de seção: início, atualização semanal, ações e histórico.
import { aoTopo, doTopo, oTopo, peloTopo } from './vocab.js';
import { del, get, patch, post, put } from './api.js';
import { abrirAlterarReuniao } from './reuniao-data.js';
import { agendaComoBoot } from './agenda-equipe.js';
import { agora, est } from './estado.js';
import {
  $, abrirForm, addDias, br, brCurto, confirmar, dataHora, diaSemana, esc, fmtMin, on, pilulaStatus, plural, PRIO, seloNova, STATUS, tempoRestante, textoEtapa, toast, trilho, vazio,
} from './ui.js';
import { aceitarAcao, abrirAcao, abrirEditarAcao, abrirNovoImpedimento, aceitaImpedimento, devolverAcao, lerOrigem, ligarOrigem, origemCamposHTML, validarAcao } from './acao-comum.js';
import { HORA_FECHAMENTO, TRANSICOES } from './regras.js';
import { nomeDaReuniao, reuniaoDaAcao } from './reuniao-da-acao.js';
import { ATALHOS, ORDENS, aplicarFiltros, contarAtalhos, ordenar } from './filtro-acoes.js';
import { dataNoFuso, diasEntre, instante } from './datas.js';
import { relatoHTML } from './telas-diretor.js';

const semSecao = (raiz) => {
  raiz.innerHTML = `<div class="cabeca"><h1>Sem seção atribuída</h1></div><div class="cartao">${vazio(
    'Você ainda não está vinculado a uma seção', `Peça ${aoTopo()} para atribuí-lo a uma seção na tela Estrutura.`)}</div>`;
};

// ---------- Precisa de atenção ----------
/** Dias desde a última movimentação da ação (status, tempo, checklist, impedimento, comentário, prazo). */
const diasSemMovimento = (a) => diasEntre(dataNoFuso(instante(a.movimentada_em || a.criada_em)), est.boot.hoje);
const seloParada = (a) => (a.parada ? `<span class="pilula atencao-selo" title="Atualize o status ou registre o andamento">Sem atualização há ${diasSemMovimento(a)} dias</span>` : '');

/** Selos do cartão da ação: só os três mais importantes ficam à vista; o resto abre em "+N", para o cartão não virar um mural de etiquetas. */
const selosDaAcao = (a) => {
  const itens = [
    [a.nova ? 0 : null, seloNova(a)],
    [a.atrasada ? 1 : null, '<span class="pilula atraso">Atrasada</span>'],
    [a.impedimento_critico ? 2 : null, '<span class="pilula atraso">Impedimento crítico</span>'],
    [a.aguardando_validacao ? 3 : null, `<span class="pilula validacao">${esc(textoEtapa(a))}</span>`],
    [a.parada ? 4 : null, seloParada(a)],
    [5, `<span class="pilula prio-${a.prioridade}">Prioridade ${PRIO[a.prioridade].toLowerCase()}</span>`],
    [a.demandada_diretor ? 6 : null, `<span class="pilula diretor" title="Ações demandadas ${peloTopo()} não podem ser arquivadas nem excluídas pela seção">Demandada ${peloTopo()}</span>`],
    [a.demandada_chefe ? 6 : null, `<span class="pilula diretor" title="Ação direcionada pelo chefe da seção acima: quem a recebe não a arquiva nem a exclui">Demandada por ${esc(a.demandado_por_nome || 'o chefe da seção acima')}</span>`],
    [a.demandante_externo ? 7 : null, `<span class="pilula externa" title="Demanda de entidade fora da subordinação ${aoTopo()}">Demanda externa: ${esc(a.demandante_externo)}</span>`],
    [!a.impedimento_critico && a.impedimentos_abertos ? 8 : null, '<span class="pilula st-bloqueada">Impedimento aberto</span>'],
    [a.pedido_pendente ? 9 : null, '<span class="pilula">Pedido de prazo enviado</span>'],
    [a.checklist_total ? 10 : null, `<span class="pilula" title="Tarefas feitas">☑ ${a.checklist_feitos}/${a.checklist_total}</span>`],
    [a.responsavel_nome ? 11 : null, `<span class="pilula" title="Responsável pela execução">Responsável: ${esc(a.responsavel_nome)}</span>`],
    [a.arquivada ? 12 : null, '<span class="pilula enc">Arquivada</span>'],
    [a.apresentada ? 13 : null, '<span class="pilula" title="Título e detalhamento não mudam mais; o prazo pode ser alterado">Apresentada em reunião</span>'],
  ].filter(([peso, html]) => peso !== null && html).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const MAX = 3;
  if (itens.length <= MAX + 1) return itens.join(' ');
  return `${itens.slice(0, MAX).join(' ')}<details class="selos-mais"><summary class="pilula" title="Mostrar os demais selos">+${itens.length - MAX}</summary><div class="selos-resto">${itens.slice(MAX).join(' ')}</div></details>`;
};

/** Dia da semana e data de uma reunião: "segunda, 23/11". O Início tem a reunião da organização (a do Diretor) e a da equipe;
 *  "a reunião" sozinha confundia, e a data pode ter sido alterada (Alterar a data). */
const diaEData = (data) => `${diaSemana(data)}, ${brCurto(data)}`;
/** Contexto que decide em qual reunião cada ação é tratada (ver `reuniao-da-acao.js`). */
const contextoDeReuniao = (semana, agendaEquipe) => ({ semana, semanaEquipe: agendaEquipe?.semana ?? null, hoje: est.boot.hoje, usuarioId: est.user.id, secaoId: est.user.secao_id });

/** Ações em aberto que pedem um gesto do chefe, cada uma pelo motivo mais urgente: atrasada, sem atualização
 *  há DIAS_SEM_MOVIMENTO dias ou mais, ou com prazo até o dia da reunião em que ela será tratada (a da organização ou a da equipe). */
function itensAtencao(abertas, ctx) {
  const hoje = est.boot.hoje;
  const motivo = (a) => {
    if (a.atrasada) return { ordem: 0, texto: `Atrasada desde ${br(a.prazo)}`, classe: 'ruim' };
    if (a.parada) return { ordem: 1, texto: `Sem atualização há ${diasSemMovimento(a)} dias`, classe: 'atencao' };
    const r = reuniaoDaAcao(a, ctx);
    if (a.prazo >= hoje && a.prazo <= r.data) return { ordem: 2, texto: `Vence em ${br(a.prazo)}, até a reunião ${nomeDaReuniao(r)} (${diaEData(r.data)})`, classe: 'atencao' };
    return null;
  };
  return abertas.map((a) => ({ a, m: motivo(a) })).filter((x) => x.m)
    .sort((x, y) => x.m.ordem - y.m.ordem || x.a.prazo.localeCompare(y.a.prazo));
}

/** Botões rápidos: os passos de status permitidos (sem voltar para "a fazer", que apaga o tempo), tempo e detalhe. */
const botoesRapidos = (a) => {
  const passos = { a_fazer: [['em_andamento', 'Iniciar']], em_andamento: [['concluida', 'Concluir'], ['bloqueada', 'Bloquear']], bloqueada: [['em_andamento', 'Retomar']] }[a.status] || [];
  return `${passos.filter(([s]) => TRANSICOES[a.status].includes(s) && (s !== 'concluida' || a.tempo_total > 0))
    .map(([s, rotulo]) => `<button type="button" class="btn btn-sec btn-mini" data-rapido-status="${s}">${rotulo}</button>`).join('')}
    <button type="button" class="btn btn-fantasma btn-mini" data-rapido-tempo>Registrar tempo</button>
    <button type="button" class="btn btn-fantasma btn-mini" data-rapido-abrir>Abrir</button>`;
};

function quadroAtencaoHTML(abertas, ctx) {
  const itens = itensAtencao(abertas, ctx);
  const MAX = 6;
  return `<aside class="atencao-quadro" aria-labelledby="atencao-titulo">
    <p class="atencao-sobre">Um momento para atualizar</p>
    <h2 id="atencao-titulo">Precisa de atenção</h2>
    ${itens.length ? `<p class="atencao-lead">Estas ações estão atrasadas, vencem até a reunião em que serão tratadas (${ctx.semanaEquipe ? `a da equipe, ${diaEData(ctx.semanaEquipe)}, ou a da organização, ${diaEData(ctx.semana)}` : `a da organização, ${diaEData(ctx.semana)}`}) ou estão há algum tempo sem andamento registrado. Atualizar o status mantém ${oTopo()} a par antes da reunião.</p>
      <ul class="atencao-lista">${itens.slice(0, MAX).map(({ a, m }) => `<li data-atencao="${a.id}">
        <div class="atencao-item-titulo">${esc(a.titulo)}</div>
        <div class="pequeno"><span class="${m.classe}">${m.texto}</span> · ${pilulaStatus(a)}</div>
        <div class="atencao-botoes">${botoesRapidos(a)}</div></li>`).join('')}</ul>
      ${itens.length > MAX ? `<p class="pequeno"><a href="#/minhas-acoes">E mais ${itens.length - MAX} em Minhas ações</a></p>` : ''}`
      : '<p class="atencao-lead">Tudo em dia. Nenhuma ação precisa da sua atenção agora.</p>'}
  </aside>`;
}

/** Liga os botões do quadro; `acoes` é a lista usada para desenhá-lo e `aoMudar` recarrega a tela. */
function ligarAtencao(raiz, acoes, aoMudar) {
  const acaoDe = (el) => acoes.find((a) => a.id === Number(el.closest('[data-atencao]').dataset.atencao));
  on(raiz, 'click', '[data-rapido-status]', async (el) => {
    try {
      await patch(`/acoes/${acaoDe(el).id}`, { status: el.dataset.rapidoStatus });
      toast(`Status atualizado para "${STATUS[el.dataset.rapidoStatus]}".`);
      await aoMudar();
    } catch (e) { toast(e.message, 'erro'); }
  });
  on(raiz, 'click', '[data-rapido-tempo]', (el) => {
    const a = acaoDe(el);
    abrirForm({
      titulo: 'Registrar tempo',
      corpo: `<p class="suave pequeno">Ação: <b>${esc(a.titulo)}</b></p>
        <div class="campo"><label for="rt-min">Minutos gastos</label><input id="rt-min" name="minutos" type="number" min="1" max="1440" step="1" inputmode="numeric" required></div>`,
      rotulo: 'Registrar tempo',
      aoEnviar: async (d) => {
        await post(`/acoes/${a.id}/tempo`, { minutos: Number(d.minutos) });
        toast('Tempo registrado.');
        await aoMudar();
      },
    });
  });
  on(raiz, 'click', '[data-rapido-abrir]', (el) => abrirAcao(acaoDe(el).id, aoMudar).catch((e) => toast(e.message, 'erro')));
}

// ---------- Chegaram para você ----------
/** Ações direcionadas ou redirecionadas para a seção que esta pessoa ainda não abriu. Some ao abrir cada uma. */
function quadroNovasHTML(abertas) {
  const novas = abertas.filter((a) => a.nova).sort((x, y) => y.recebida_em.localeCompare(x.recebida_em));
  if (!novas.length) return '';
  return `<section class="cartao novas-quadro" aria-labelledby="novas-titulo">
    <div class="linha entre"><h2 id="novas-titulo">Chegaram para você</h2><span class="pilula nova">${plural(novas.length, 'ação nova', 'ações novas')}</span></div>
    <p class="suave pequeno" style="margin:2px 0 10px">Ações direcionadas à seção que você ainda não abriu. Abra cada uma para ver o que foi pedido; quem direcionou fica sabendo que você já viu.</p>
    <ul class="novas-lista">${novas.map((a) => `<li><button type="button" class="novas-item" data-acao="${a.id}">
      <span class="novas-item-titulo">${esc(a.titulo)}</span>
      <span class="pequeno suave">${a.secao_id !== est.user.secao_id ? `${esc(a.secao_sigla)} · ` : ''}Recebida em ${dataHora(a.recebida_em)}${a.demandado_por_nome ? ` · de ${esc(a.demandado_por_nome)}` : ''} · prazo <span class="num">${br(a.prazo)}</span></span>
    </button></li>`).join('')}</ul>
  </section>
  <div class="espaco"></div>`;
}

// ---------- Aguardando sua validação ----------
/** Ações concluídas que esperam o chefe: as que ele atribuiu a membros (valida) e as que ele direcionou às subseções (aceita); em
 *  qualquer caso, ele pode devolver para ajuste dizendo o que falta. */
function quadroValidarHTML(lista) {
  if (!lista.length) return '';
  return `<section class="cartao novas-quadro validar-quadro" aria-labelledby="validar-titulo">
    <div class="linha entre"><h2 id="validar-titulo">Aguardando sua validação</h2><span class="pilula validacao">${plural(lista.length, 'ação', 'ações')}</span></div>
    <p class="suave pequeno" style="margin:2px 0 10px">Ações que você atribuiu a membros da equipe ou direcionou às subseções e que foram concluídas. Valide ou aceite, ou devolva para ajuste dizendo o que falta.</p>
    <ul class="novas-lista">${lista.map((a) => `<li data-validar-item="${a.id}"><div class="novas-item novas-item-estatico">
      <span class="novas-item-titulo">${esc(a.titulo)}</span>
      <span class="pequeno suave">Concluída por ${esc(a.responsavel_nome || (a.aguardando_validacao === 'demandante' ? `${a.secao_sigla || a.secao_nome}` : 'um membro da equipe'))}${a.concluida_em ? ` em ${dataHora(a.concluida_em)}` : ''} · prazo <span class="num">${br(a.prazo)}</span></span>
      <span class="atencao-botoes">${a.aguardando_validacao === 'demandante' ? '<button type="button" class="btn btn-ok btn-mini" data-aceitar-q>Aceitar e encerrar</button>' : '<button type="button" class="btn btn-ok btn-mini" data-validar-q>Validar</button>'}
        <button type="button" class="btn btn-fantasma btn-mini" data-devolver-q>Devolver para ajuste</button>
        <button type="button" class="btn btn-fantasma btn-mini" data-abrir-q>Abrir</button></span></div></li>`).join('')}</ul>
  </section>
  <div class="espaco"></div>`;
}

// ---------- Sua semana ----------
/** O que falta fazer antes da reunião, num só lugar: cada item mostra se está em dia e leva ao que resolve. O de cima é o que vence primeiro. */
function suaSemanaHTML({ up, semana, abertas, aValidar, atrasadas, ctx }) {
  const veespera = addDias(semana, -1);
  const fechamento = instante(`${veespera}T${String(HORA_FECHAMENTO).padStart(2, '0')}:00:00`).getTime();
  const agoraMs = agora().getTime();
  const novas = abertas.filter((a) => a.nova).length;
  // Cada ação conta para a reunião em que será tratada (a da organização ou a da equipe).
  const antes = abertas.filter((a) => !a.atrasada).map((a) => ({ a, r: reuniaoDaAcao(a, ctx) })).filter(({ a, r }) => a.prazo < r.data);
  const deTipo = (tipo) => antes.filter(({ r }) => r.tipo === tipo).length;
  const antesDaReuniao = antes.length;
  const textoAntes = [['organizacao', semana], ['equipe', ctx.semanaEquipe]].filter(([tipo]) => deTipo(tipo))
    .map(([tipo, data]) => `${plural(deTipo(tipo), 'ação vence', 'ações vencem')} antes da reunião ${nomeDaReuniao({ tipo })} (${diaEData(data)})`).join(' · ');
  const prazo = `${diaSemana(veespera)}, ${br(veespera)}, às ${HORA_FECHAMENTO}h`;
  const itens = [
    { feito: !!up.atual,
      texto: up.atual ? `Atualização enviada em ${dataHora(up.atual.enviada_em)}${up.atual.usuario_nome && up.atual.usuario_nome !== est.user.nome ? ` por ${esc(up.atual.usuario_nome)}` : ''}`
        : agoraMs < fechamento ? `Enviar a atualização da semana (até ${prazo})` : 'Enviar a atualização da semana (o prazo regular terminou; ainda dá para enviar)',
      link: '#/atualizacao', rotulo: up.atual ? 'Enviar correção' : 'Registrar atualização', principal: !up.atual },
    { feito: !atrasadas, texto: atrasadas ? `${plural(atrasadas, 'ação atrasada', 'ações atrasadas')} para resolver` : 'Nenhuma ação atrasada', link: '#/minhas-acoes', rotulo: 'Ver ações' },
    { feito: !novas, texto: novas ? `${plural(novas, 'ação nova', 'ações novas')} ainda não aberta${novas === 1 ? '' : 's'}` : 'Nenhuma ação nova por abrir', link: '#/minhas-acoes', rotulo: 'Abrir' },
    { feito: !aValidar.length, texto: aValidar.length ? `${plural(aValidar.length, 'ação concluída', 'ações concluídas')} pela equipe para validar` : 'Nada aguardando a sua validação', link: '#/minhas-acoes', rotulo: 'Validar' },
    { feito: !antesDaReuniao, texto: antesDaReuniao ? textoAntes : 'Nada vence antes da reunião', link: '#/minhas-acoes', rotulo: 'Ver ações' },
  ];
  const emDia = itens.filter((i) => i.feito).length;
  const classe = !up.atual && agoraMs >= fechamento ? ' encerrado' : !up.atual && fechamento - agoraMs < 24 * 3600000 ? ' urgente' : '';
  const prazoTexto = up.atual ? '' : agoraMs < fechamento ? ` · o prazo termina em ${tempoRestante(fechamento - agoraMs)}` : ' · prazo regular encerrado';
  return `<section class="cartao sua-semana${classe}" aria-labelledby="sua-semana-titulo">
    <div class="linha entre"><h2 id="sua-semana-titulo">Sua semana</h2><span class="suave pequeno">${emDia} de ${itens.length} em dia${prazoTexto}</span></div>
    <ul class="semana-lista">${itens.map((i) => `<li class="${i.feito ? 'feito' : 'pendente'}">
      <span class="semana-marca" aria-hidden="true">${i.feito ? '✓' : ''}</span>
      <span class="semana-texto">${i.texto}<span class="sr-only">${i.feito ? ' — em dia.' : ' — pendente.'}</span></span>
      ${i.feito && !i.principal && i.rotulo !== 'Enviar correção' ? '' : `<a class="btn ${i.principal ? 'btn-primario' : 'btn-fantasma'} btn-mini" href="${i.link}">${i.rotulo}</a>`}</li>`).join('')}</ul>
  </section>`;
}

// ---------- Início ----------
/** Lembrete da atualização para a reunião do chefe da seção acima: enviada (e quando) ou pendente, com o prazo. */
function relatoEquipeHTML(d) {
  const enviada = !!d.atual;
  const prazo = `${br(addDias(d.semana, -1))}, às ${HORA_FECHAMENTO}h`;
  const vencido = !enviada && agora().getTime() > instante(d.fechamento).getTime();
  return `<section class="cartao" aria-label="Atualização para a reunião da equipe"><div class="linha entre" style="align-items:center;gap:12px;flex-wrap:wrap">
    <div><b>Atualização para a reunião da equipe${d.pai?.sigla ? ` (${esc(d.pai.sigla)})` : ''}</b><div class="suave pequeno">${enviada
      ? `Enviada em ${dataHora(d.atual.enviada_em)}.` : vencido ? `O prazo regular terminou (${prazo}); você ainda pode enviar até a reunião.` : `Prazo: ${prazo}.`}</div></div>
    <a class="btn ${enviada ? 'btn-sec' : 'btn-primario'}" href="#/atualizacao?i=equipe">${enviada ? 'Rever ou corrigir' : 'Enviar atualização'}</a></div></section>
  <div class="espaco"></div>`;
}

export async function inicio(raiz, { refresh }) {
  if (!est.user.secao_id) return semSecao(raiz);
  const semana = est.boot.semana;
  // Só a seção do usuário (e as subordinadas): para o Administrador da Diretoria Adjunta, restringe à própria seção.
  const [up, abertas, { aviso }, concluidas, agendaEquipe, relatoEquipe] = await Promise.all([
    get(`/atualizacao?semana=${semana}&resumo=1`), get(`/acoes?situacao=abertas&secao=${est.user.secao_id}&minhas=1`), get('/avisos/atual'),
    est.boot.acoes_a_validar ? get(`/acoes?situacao=concluidas&secao=${est.user.secao_id}`) : [],
    // A reunião da equipe tem agenda própria, com o mesmo trilho da reunião da instituição (só para o chefe da seção).
    est.user.perfil === 'chefe' ? get('/reunioes-equipe/agenda').catch(() => null) : null,
    // A seção que tem chefe acima relata também para a reunião dele (resumo: só o que já foi enviado).
    est.user.perfil === 'chefe' && est.boot.secao?.tipo === 'subsecao' ? get('/reunioes-equipe/atualizacao?resumo=1').catch(() => null) : null,
  ]);
  const ctx = contextoDeReuniao(semana, agendaEquipe);
  const aValidar = concluidas.filter((a) => a.aguardando_validacao === 'chefe' || (a.aguardando_validacao === 'demandante' && a.pode_aceitar_demanda));
  const atrasadas = abertas.filter((a) => a.atrasada).length;
  const vencendo = abertas.filter((a) => !a.atrasada && a.prazo <= addDias(est.boot.hoje, 2)).length;
  const pedidos = abertas.filter((a) => a.pedido_pendente).length;
  raiz.innerHTML = `
    <div class="cabeca"><div><h1>${esc(est.boot.secao?.nome || 'Minha seção')}</h1><div class="sub">Olá, ${esc(est.user.nome)}. Aqui está o que precisa da sua atenção.</div></div></div>
    ${agendaEquipe ? trilho(agendaComoBoot(agendaEquipe)) : ''}
    ${relatoEquipe?.aplicavel ? relatoEquipeHTML(relatoEquipe) : ''}
    ${aviso ? `<div class="aviso-banner"><p class="aviso-banner-tag">Aviso</p><p class="aviso-banner-texto">${esc(aviso.texto)}</p></div>` : ''}
    ${quadroNovasHTML(abertas)}
    ${quadroValidarHTML(aValidar)}
    <div class="inicio-grade"><div class="inicio-principal">
    ${suaSemanaHTML({ up, semana, abertas, aValidar, atrasadas, ctx })}
    <div class="espaco"></div>
    <div class="grade" style="grid-template-columns:repeat(4,1fr)">
      <div class="cartao"><div class="suave pequeno">Ações abertas</div><div style="font-family:var(--head);font-weight:650;font-size:2rem" class="num">${abertas.length}</div></div>
      <div class="cartao"><div class="suave pequeno">Atrasadas</div><div style="font-family:var(--head);font-weight:650;font-size:2rem;color:${atrasadas ? 'var(--vermelho)' : 'inherit'}" class="num">${atrasadas}</div></div>
      <div class="cartao"><div class="suave pequeno">Vencem em até 2 dias</div><div style="font-family:var(--head);font-weight:650;font-size:2rem;color:${vencendo ? 'var(--amarelo)' : 'inherit'}" class="num">${vencendo}</div></div>
      <div class="cartao"><div class="suave pequeno">Pedidos de prazo</div><div style="font-family:var(--head);font-weight:650;font-size:2rem" class="num">${pedidos}</div></div>
    </div>
    <div class="espaco"></div>
    <div class="cartao"><div class="linha entre"><h2>Próximas ações</h2><a href="#/minhas-acoes">Ver todas</a></div>
      ${abertas.length ? `<table><tbody>${abertas.slice(0, 4).map((a) => `<tr class="clicavel" data-acao="${a.id}" tabindex="0">
        <td><b>${esc(a.titulo)}</b>${a.demandada_diretor ? `<div class="suave pequeno" style="color:var(--verde);margin-top:2px">Demandada ${peloTopo()} em ${br(a.demandado_em || a.criada_em)}</div>` : a.demandada_chefe ? `<div class="suave pequeno" style="color:var(--verde);margin-top:2px">Demandada por ${esc(a.demandado_por_nome || 'o chefe da seção acima')} em ${br(a.demandado_em || a.criada_em)}</div>` : ''}</td>
        <td class="num">${br(a.prazo)}</td><td>${pilulaStatus(a)}</td></tr>`).join('')}</tbody></table>`
        : vazio('Nenhuma ação em aberto', `Quando ${oTopo()} direcionar algo, aparecerá aqui.`)}</div>
    </div>${quadroAtencaoHTML(abertas, ctx)}</div>`;
  ligarAtencao(raiz, abertas, refresh);
  if (agendaEquipe) {
    on(raiz, 'click', '[data-alterar-reuniao]', () => abrirAlterarReuniao(agendaComoBoot(agendaEquipe), () => refresh(), { salvar: (corpo) => put('/reunioes-equipe/agenda', corpo) }));
  }
  const abrir = (el) => abrirAcao(el.dataset.acao, refresh).catch((e) => toast(e.message, 'erro'));
  on(raiz, 'click', 'tr[data-acao], .novas-item[data-acao]', abrir);
  const itemDe = (el) => aValidar.find((a) => a.id === Number(el.closest('[data-validar-item]').dataset.validarItem));
  on(raiz, 'click', '[data-validar-q]', async (el) => { try { await validarAcao(itemDe(el).id); await refresh(); } catch (e) { toast(e.message, 'erro'); } });
  on(raiz, 'click', '[data-aceitar-q]', async (el) => { try { await aceitarAcao(itemDe(el).id); await refresh(); } catch (e) { toast(e.message, 'erro'); } });
  on(raiz, 'click', '[data-devolver-q]', (el) => devolverAcao(itemDe(el), refresh));
  on(raiz, 'click', '[data-abrir-q]', (el) => abrirAcao(itemDe(el).id, refresh).catch((e) => toast(e.message, 'erro')));
  on(raiz, 'keydown', 'tr[data-acao]', (el, ev) => { if (ev.key === 'Enter') abrir(el); });
}

// ---------- Minhas ações ----------
export async function minhasAcoes(raiz) {
  if (!est.user.secao_id) return semSecao(raiz);
  // Só a seção do usuário (e as subordinadas). Para o chefe é o mesmo que ele já enxerga; para o Administrador
  // da Diretoria Adjunta, que enxerga todas as seções, restringe a tela à própria seção.
  // `minhas=1`: junto com a seção, as ações atribuídas a mim que estão na seção-mãe (fora da minha árvore).
  const daSecao = `&secao=${est.user.secao_id}&minhas=1`;
  const buscar = () => Promise.all([
    get(`/acoes?situacao=abertas${daSecao}`),
    get(`/acoes?situacao=concluidas${daSecao}`),
    get(`/acoes?situacao=arquivadas${daSecao}`),
  ]);
  let [abertasT, conclT, arqT] = await buscar();
  // O membro vê, na aba "Minhas", as ações atribuídas a ele ou criadas por ele (as que ele executa) e, em outra aba, as
  // da seção só para leitura. O chefe vê todas as da seção.
  const ehMembro = est.user.perfil === 'membro';
  let escopo = 'minhas';
  const doEscopo = (l) => (ehMembro ? l.filter((a) => (escopo === 'minhas') === !!a.pode_executar) : l);
  const temMais = (a) => (ehMembro ? !!(a.pode_editar || a.pode_mudar_prazo || a.pode_excluir) : ((!a.demandada_diretor && !a.demandada_chefe) || a.pode_editar || a.pode_mudar_prazo));
  let aba = 'ativas';
  // Filtros desta tela: busca, atalhos de atenção e ordenação, sobre o que já foi carregado (ver `filtro-acoes.js`). Ficam só na
  // memória; a ordem escolhida é lembrada neste navegador.
  const CHAVE_ORDEM = 'agilis:ordem-acoes';
  const lerOrdem = () => { try { const v = localStorage.getItem(CHAVE_ORDEM); return ORDENS.some(([k]) => k === v) ? v : 'padrao'; } catch { return 'padrao'; } };
  const filtro = { q: '', atalhos: [], ordem: lerOrdem() };
  const ctxFiltro = { hoje: est.boot.hoje };
  const filtrando = () => !!filtro.q.trim() || filtro.atalhos.length > 0;
  let adiar = null; // a busca redesenha com um pequeno atraso, enquanto a pessoa digita
  let ordemAberta = false; // no celular, a ordenação fica atrás do botão "Ordenar"

  const renderizar = () => {
    const abertas = doEscopo(abertasT), concl = doEscopo(conclT), arq = doEscopo(arqT), todasAtivas = [...abertas, ...concl];
    const f = (l) => aplicarFiltros(l, filtro, ctxFiltro);
    const abertasF = f(abertas), conclF = f(concl), arqF = f(arq), ativasF = [...abertasF, ...conclF];
    // Guarda os minutos digitados e o foco, para que atualizar um cartão não apague o que está em outro.
    const digitado = new Map([...raiz.querySelectorAll('[data-min]')].filter((i) => i.value).map((i) => [i.closest('[data-id]').dataset.id, i.value]));
    const foco = raiz.contains(document.activeElement) ? document.activeElement.closest('[data-id]')?.dataset.id : null;
    // O mesmo para os controles de filtro: a busca mantém o foco e o cursor, os atalhos e a ordem mantêm o foco.
    const ativo = raiz.contains(document.activeElement) ? document.activeElement : null;
    const focoFiltro = !ativo ? null : (ativo.id === 'ma-busca' || ativo.id === 'ma-ordem') ? `#${ativo.id}`
      : ativo.dataset?.atalho ? `[data-atalho="${ativo.dataset.atalho}"]` : ativo.dataset?.limpar !== undefined ? '[data-limpar]'
        : ativo.dataset?.alternarOrdem !== undefined ? '[data-alternar-ordem]' : null;
    const selecao = ativo?.id === 'ma-busca' ? [ativo.selectionStart, ativo.selectionEnd] : null;
    const brutaDaAba = aba === 'abertas' ? abertas : aba === 'concluidas' ? concl : aba === 'arquivadas' ? arq : todasAtivas;
    const lista = ordenar(f(brutaDaAba), filtro.ordem);
    const contagens = contarAtalhos(brutaDaAba, filtro, ctxFiltro);
    const chips = ATALHOS.filter((t) => contagens[t.id] || filtro.atalhos.includes(t.id));

    raiz.innerHTML = `
      <div class="cabeca linha entre" style="align-items:flex-start">
        <div>
          <h1>Minhas ações</h1>
          <div class="sub">${plural(abertas.length, 'ação aberta', 'ações abertas')}${concl.length ? ` · ${plural(concl.length, 'concluída', 'concluídas')}` : ''}${arq.length ? ` · ${plural(arq.length, 'arquivada', 'arquivadas')}` : ''}</div>
        </div>
        <button class="btn btn-primario" id="btn-nova-acao">+ Nova ação</button>
      </div>
      ${ehMembro ? `<div class="segmento" role="group" aria-label="Quais ações" style="margin-top:10px">
        <button type="button" data-escopo-ac="minhas" aria-pressed="${escopo === 'minhas'}">Minhas</button>
        <button type="button" data-escopo-ac="secao" aria-pressed="${escopo === 'secao'}">Da seção (só leitura)</button></div>` : ''}
      <div class="linha abas-lista" style="margin:10px 0 16px;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn ${aba === 'ativas' ? 'btn-sec' : 'btn-fantasma'} btn-mini" data-aba="ativas">Todas ativas (${ativasF.length})</button>
        <button type="button" class="btn ${aba === 'abertas' ? 'btn-sec' : 'btn-fantasma'} btn-mini" data-aba="abertas">Abertas (${abertasF.length})</button>
        <button type="button" class="btn ${aba === 'concluidas' ? 'btn-sec' : 'btn-fantasma'} btn-mini" data-aba="concluidas">Concluídas (${conclF.length})</button>
        <button type="button" class="btn ${aba === 'arquivadas' ? 'btn-sec' : 'btn-fantasma'} btn-mini" data-aba="arquivadas">Arquivadas (${arqF.length})</button>
      </div>
      <div class="ma-filtros${ordemAberta ? ' abertos' : ''}" role="search" aria-label="Filtrar e ordenar as ações">
        <div class="ma-busca"><label class="sr" for="ma-busca">Buscar nas ações</label>
          <input id="ma-busca" type="search" value="${esc(filtro.q)}" placeholder="Buscar nas ações" title="Busca no título, no detalhe, no responsável e na seção; use várias palavras para refinar" autocomplete="off" enterkeyhint="search"></div>
        <button type="button" class="btn btn-sec ma-alternar" data-alternar-ordem aria-expanded="${ordemAberta}" aria-controls="ma-ordem-campo">Ordenar</button>
        <div class="ma-ordem" id="ma-ordem-campo"><label for="ma-ordem">Ordenar por</label>
          <select id="ma-ordem">${ORDENS.map(([v, r]) => `<option value="${v}"${filtro.ordem === v ? ' selected' : ''}>${r}</option>`).join('')}</select></div>
      </div>
      ${chips.length ? `<div class="ma-atalhos" role="group" aria-label="Atalhos de atenção (mostra as ações que tenham qualquer um dos marcados)"><span class="ma-atalhos-rotulo">Atenção</span>${chips.map((t) =>
        `<button type="button" class="ma-chip" data-atalho="${t.id}" aria-pressed="${filtro.atalhos.includes(t.id)}">${t.rotulo} <b class="num">${contagens[t.id]}</b></button>`).join('')}</div>` : ''}
      ${filtrando() ? `<p class="ma-resultado suave pequeno" role="status">Mostrando <b>${lista.length}</b> de ${brutaDaAba.length}. <button type="button" class="btn btn-fantasma btn-mini" data-limpar>Limpar filtros</button></p>` : ''}
      ${lista.length ? lista.map((a) => `<article class="cartao acao${a.atrasada ? ' atrasada' : ''}" data-id="${a.id}">
        <header class="acao-topo">
          <div>
            <h3>${esc(a.titulo)}</h3>
            <div class="acao-meta">Prazo <b class="num">${br(a.prazo)}</b> · ${esc(a.secao_sigla)}${a.interna ? ' · ação interna' : ''}${a.demandada_diretor || a.demandada_chefe ? ` · demandada em ${br(a.demandado_em || a.criada_em)}` : ''}</div>
          </div>
          <div class="acao-selos">${selosDaAcao(a)}
          </div>
        </header>
        ${a.detalhe ? `<p class="acao-detalhe">${esc(a.detalhe)}</p>` : ''}
        ${!a.arquivada && a.pode_executar ? `
          <div class="segmento" role="group" aria-label="Status da ação">${Object.entries(STATUS).map(([k, v]) =>
            `<button type="button" data-status="${k}" aria-pressed="${a.status === k}" ${a.status !== k && !TRANSICOES[a.status].includes(k) ? 'disabled' : ''}>${v}</button>`).join('')}</div>
          <div class="tempo-linha"><span>Tempo gasto <b class="num">${fmtMin(a.tempo_total)}</b></span>
            <input type="number" min="1" max="1440" step="1" inputmode="numeric" placeholder="minutos" aria-label="Minutos gastos" data-min>
            <button type="button" class="btn btn-sec btn-mini" data-tempo aria-label="Registrar tempo gasto">Registrar</button></div>
        ` : ''}
        <footer class="acao-rodape">
          <button type="button" class="btn btn-fantasma btn-mini" data-detalhe>Detalhes e histórico</button>
          ${!ehMembro && !a.arquivada && a.status !== 'concluida' && !a.pedido_pendente && !a.pode_mudar_prazo ? '<button type="button" class="btn btn-fantasma btn-mini" data-prazo>Pedir novo prazo</button>' : ''}
          ${aceitaImpedimento(a) && a.pode_executar ? '<button type="button" class="btn btn-fantasma btn-mini" data-impedimento>Impedimento</button>' : ''}
          ${a.aguardando_validacao === 'chefe' && a.pode_executar && !ehMembro ? '<button type="button" class="btn btn-ok btn-mini" data-validar>Validar</button><button type="button" class="btn btn-fantasma btn-mini" data-devolver>Devolver</button>' : ''}
          ${a.pode_aceitar_demanda ? '<button type="button" class="btn btn-ok btn-mini" data-aceitar>Aceitar e encerrar</button><button type="button" class="btn btn-fantasma btn-mini" data-devolver>Devolver</button>' : ''}
          ${temMais(a) ? `<details class="mais"><summary class="btn btn-fantasma btn-mini">Mais</summary>
            <div class="mais-itens">
              ${a.pode_editar || a.pode_mudar_demanda ? '<button type="button" class="btn btn-sec btn-mini" data-editar>Editar</button>' : a.pode_mudar_prazo ? '<button type="button" class="btn btn-sec btn-mini" data-editar>Alterar prazo</button>' : ''}
              ${a.demandada_diretor || a.demandada_chefe || ehMembro ? '' : a.arquivada ? '<button type="button" class="btn btn-sec btn-mini" data-desarquivar>Desarquivar</button>' : '<button type="button" class="btn btn-sec btn-mini" data-arquivar>Arquivar</button>'}
              ${a.pode_excluir ? '<button type="button" class="btn btn-sec btn-mini perigo-texto" data-excluir>Excluir ação</button>' : ''}
            </div></details>` : ''}
        </footer>
      </article>`).join('') : `<div class="cartao">${filtrando() && brutaDaAba.length ? vazio('Nenhuma ação com esses filtros', 'Tente outra busca ou limpe os filtros.') : vazio('Nenhuma ação nesta visão', aba === 'arquivadas' ? 'Nenhuma ação arquivada.' : ehMembro && escopo === 'minhas' ? 'Quando o chefe atribuir uma ação a você, ou você criar uma, ela aparecerá aqui.' : `Quando ${oTopo()} ou você criarem ações, elas aparecerão aqui.`)}</div>`}`;
    for (const [id, v] of digitado) { const i = raiz.querySelector(`[data-id="${id}"] [data-min]`); if (i) i.value = v; }
    if (foco) raiz.querySelector(`[data-id="${foco}"] [data-min]`)?.focus({ preventScroll: true });
    if (focoFiltro) {
      const alvo = raiz.querySelector(focoFiltro) ?? (focoFiltro === '[data-limpar]' ? raiz.querySelector('#ma-busca') : null); // "Limpar" some ao limpar
      alvo?.focus({ preventScroll: true });
      if (selecao && alvo?.setSelectionRange) alvo.setSelectionRange(selecao[0], selecao[1]);
    }
  };

  // Recarrega só os dados desta tela: a aba escolhida e os campos em edição continuam como estavam.
  const recarregar = async () => {
    [abertasT, conclT, arqT] = await buscar();
    renderizar();
  };

  renderizar();

  const acaoDe = (el) => {
    const id = Number(el.closest('[data-id]').dataset.id);
    return [...abertasT, ...conclT, ...arqT].find((a) => a.id === id);
  };
  const erro = (e) => toast(e.message, 'erro');

  on(raiz, 'click', '[data-aba]', (el) => {
    aba = el.dataset.aba;
    renderizar();
  });
  on(raiz, 'click', '[data-escopo-ac]', (el) => { escopo = el.dataset.escopoAc; renderizar(); });
  // Filtros: a busca redesenha com um pequeno atraso (e devolve o foco e o cursor); atalhos, ordem e "Limpar", na hora.
  on(raiz, 'input', '#ma-busca', (el, ev) => {
    filtro.q = el.value;
    if (ev.isComposing) return; // acentos e teclados com composição
    clearTimeout(adiar);
    adiar = setTimeout(renderizar, 150);
  });
  on(raiz, 'keydown', '#ma-busca', (el, ev) => {
    if (ev.key === 'Escape' && el.value) { ev.preventDefault(); clearTimeout(adiar); filtro.q = ''; renderizar(); }
  });
  on(raiz, 'change', '#ma-ordem', (el) => {
    filtro.ordem = el.value;
    try { localStorage.setItem(CHAVE_ORDEM, el.value); } catch { /* segue sem lembrar */ }
    renderizar();
  });
  on(raiz, 'click', '[data-atalho]', (el) => {
    const id = el.dataset.atalho;
    filtro.atalhos = filtro.atalhos.includes(id) ? filtro.atalhos.filter((x) => x !== id) : [...filtro.atalhos, id];
    renderizar();
  });
  on(raiz, 'click', '[data-alternar-ordem]', () => { ordemAberta = !ordemAberta; renderizar(); });
  on(raiz, 'click', '[data-limpar]', () => { clearTimeout(adiar); filtro.q = ''; filtro.atalhos = []; renderizar(); });
  on(raiz, 'click', '[data-validar]', async (el) => { try { await validarAcao(acaoDe(el).id); await recarregar(); } catch (e) { erro(e); } });
  on(raiz, 'click', '[data-aceitar]', async (el) => { try { await aceitarAcao(acaoDe(el).id); await recarregar(); } catch (e) { erro(e); } });
  on(raiz, 'click', '[data-devolver]', (el) => devolverAcao(acaoDe(el), recarregar));

  on(raiz, 'click', '[data-impedimento]', (el) => abrirNovoImpedimento(acaoDe(el), recarregar));
  on(raiz, 'click', '[data-editar]', (el) => abrirEditarAcao(acaoDe(el), recarregar));

  on(raiz, 'click', '[data-arquivar]', async (el) => {
    const a = acaoDe(el);
    try {
      await post(`/acoes/${a.id}/arquivar`);
      toast('Ação arquivada.');
      await recarregar();
    } catch (e) { erro(e); }
  });

  on(raiz, 'click', '[data-desarquivar]', async (el) => {
    const a = acaoDe(el);
    try {
      await post(`/acoes/${a.id}/desarquivar`);
      toast('Ação desarquivada.');
      await recarregar();
    } catch (e) { erro(e); }
  });

  on(raiz, 'click', '[data-excluir]', async (el) => {
    const a = acaoDe(el);
    const ok = await confirmar({
      titulo: 'Excluir ação',
      texto: `A ação <b>${esc(a.titulo)}</b> será excluída para sempre, com o tempo e os comentários registrados. Se quiser só tirá-la da lista, use Arquivar.`,
      rotulo: 'Excluir ação', perigo: true,
    });
    if (!ok) return;
    try {
      await del(`/acoes/${a.id}`);
      toast('Ação excluída.');
      await recarregar();
    } catch (e) { erro(e); }
  });

  on(raiz, 'click', '#btn-nova-acao', async () => {
    // O chefe já cria a ação atribuída a um membro da equipe; o membro cria só para si.
    const podeAtribuir = ['chefe', 'administrador'].includes(est.user.perfil);
    const equipe = podeAtribuir ? (await get('/equipe').catch(() => [])).filter((m) => m.ativo) : [];
    abrirForm({
      titulo: 'Nova ação da seção',
      corpo: `
        <div class="campo"><label for="na-titulo">Título da ação</label><input id="na-titulo" name="titulo" required maxlength="140" placeholder="Ex.: Mapear processos internos"></div>
        <div class="campo"><label for="na-detalhe">Detalhamento (opcional)</label><textarea id="na-detalhe" name="detalhe" placeholder="Orientações e contexto"></textarea></div>
        <div class="grade" style="grid-template-columns:1fr 1fr;gap:12px">
          <div class="campo"><label for="na-prazo">Prazo</label><input id="na-prazo" type="date" name="prazo" required min="${est.boot.hoje}" value="${addDias(est.boot.hoje, 7)}"></div>
          <div class="campo"><label for="na-prio">Prioridade</label><select id="na-prio" name="prioridade"><option value="alta">Alta</option><option value="media" selected>Média</option><option value="baixa">Baixa</option></select></div>
        </div>
        <div class="campo"><label for="na-esf">Esforço estimado (opcional)</label><select id="na-esf" name="esforco"><option value="">Não estimado</option><option value="pequena">Pequeno</option><option value="media">Médio</option><option value="grande">Grande</option></select><div class="dica">Pesa a entrega nos indicadores de produtividade. Sem estimativa, vale médio.</div></div>
        ${equipe.length ? `<div class="campo"><label for="na-resp">Responsável pela execução</label>
          <select id="na-resp" name="responsavel_id"><option value="">Eu mesmo (sem delegar)</option>${equipe.map((m) => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')}</select>
          <div class="dica">Ao concluir, a ação de um membro da equipe aguarda a sua validação.</div></div>` : ''}
        <div class="campo"><label>De onde veio esta demanda?</label><div class="dica" style="margin-bottom:6px">Deixe em branco se foi uma decisão da própria seção.</div>${origemCamposHTML()}</div>
        ${est.user.perfil === 'chefe' ? `<div class="escolha" style="margin-top:8px"><label><input type="checkbox" name="interna" value="1"> Ação interna da subseção (não exibida na pauta executiva ${doTopo()})</label></div>` : ''}`,
      rotulo: 'Criar ação',
      aoAbrir: (dlg) => ligarOrigem(dlg),
      aoEnviar: async (d) => {
        const origem = lerOrigem(d);
        await post('/acoes', {
          secao_id: est.user.secao_id, // o chefe e o membro sempre criam na própria seção; o Administrador informa qual
          titulo: d.titulo,
          detalhe: d.detalhe,
          prazo: d.prazo,
          prioridade: d.prioridade,
          interna: d.interna === '1',
          ...(d.esforco ? { esforco: d.esforco } : {}),
          ...origem,
          ...(d.responsavel_id ? { responsavel_id: Number(d.responsavel_id) } : {}),
        });
        toast('Ação criada com sucesso.');
        recarregar().catch(erro);
      },
    });
  });

  on(raiz, 'click', '[data-status]', async (el) => {
    const a = acaoDe(el);
    if (el.getAttribute('aria-pressed') === 'true') return;
    if (el.dataset.status === 'a_fazer' && a.tempo_total > 0) {
      const ok = await confirmar({
        titulo: 'Voltar para "a fazer"',
        texto: `O tempo já registrado nesta ação (<b>${fmtMin(a.tempo_total)}</b>) será excluído, porque a ação recomeça do zero.`,
        rotulo: 'Voltar e excluir o tempo', perigo: true,
      });
      if (!ok) return;
    }
    try { await patch(`/acoes/${a.id}`, { status: el.dataset.status }); toast(`Status: ${STATUS[el.dataset.status]}.`); await recarregar(); }
    catch (e) {
      erro(e);
      if (e.status === 422) $('[data-min]', el.closest('[data-id]')).focus();
    }
  });

  on(raiz, 'click', '[data-tempo]', async (el) => {
    const a = acaoDe(el);
    const inp = $('[data-min]', el.closest('[data-id]'));
    try { await post(`/acoes/${a.id}/tempo`, { minutos: Number(inp.value) }); toast('Tempo registrado.'); await recarregar(); } catch (e) { erro(e); inp.focus(); }
  });
  on(raiz, 'keydown', '[data-min]', (el, ev) => { if (ev.key === 'Enter') $('[data-tempo]', el.closest('[data-id]')).click(); });
  on(raiz, 'click', '[data-detalhe]', (el) => abrirAcao(acaoDe(el).id, recarregar).catch(erro));
  on(raiz, 'click', '[data-prazo]', (el) => {
    const a = acaoDe(el);
    abrirForm({
      titulo: 'Pedir novo prazo',
      corpo: `<p class="suave">${esc(a.titulo)}<br>Prazo atual: <b>${br(a.prazo)}</b></p>
        <div class="campo"><label for="np">Novo prazo</label><input id="np" type="date" name="novo_prazo" min="${addDias(a.prazo, 1)}" value="${addDias(a.prazo, 7)}"></div>
        <div class="campo"><label for="jp">Motivo</label><textarea id="jp" name="justificativa" placeholder="Explique o que justifica o novo prazo"></textarea></div>`,
      rotulo: 'Enviar pedido',
      aoEnviar: async (d) => { await post(`/acoes/${a.id}/pedido-prazo`, d); toast(`Pedido enviado ${aoTopo()}.`); recarregar().catch(erro); },
    });
  });
}

// ---------- Histórico ----------
export async function historico(raiz) {
  if (!est.user.secao_id) return semSecao(raiz);
  const h = await get('/historico');
  raiz.innerHTML = `
    <div class="cabeca"><div><h1>Histórico</h1><div class="sub">Suas atualizações semanais, da mais recente para a mais antiga.</div></div></div>
    ${h.length ? h.map((x, i) => `<details class="cartao" ${i === 0 ? 'open' : ''}><summary><b>Reunião de ${br(x.semana)}</b> <span class="suave pequeno">· enviada em ${dataHora(x.enviada_em)}</span></summary>
      <div style="padding-top:12px">${relatoHTML(x)}</div></details>`).join('') : `<div class="cartao">${vazio('Nenhuma atualização enviada', 'Depois da primeira atualização, o histórico aparece aqui.')}</div>`}`;
}
