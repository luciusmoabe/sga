// Telas do Diretor e do Apoio: painel, Centro, direcionar ação, ações, prazos e pauta impressa.
import { get, post } from './api.js';
import { ehAdmin, ehDiretor, est, hoje } from './estado.js';
import {
  $, addDias, br, dataHora, diaSemana, esc, fmtMin, on, pilulaStatus, plural, porNecessidade, PRIO, sem, STATUS, toast, vazio,
} from './ui.js';
import { abrirAcao } from './acao-comum.js';

const NOMES_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const nomeDiaReuniao = () => NOMES_DIA[est.boot?.reuniao_dia ?? 2];
const horaReuniao = () => est.boot?.reuniao_hora || '10:00';

/** Relato de uma atualização semanal (feito, próximo, impedimentos, apoio). */
export function relatoHTML(at) {
  if (!at) return '<p class="suave">Nenhuma atualização enviada para esta semana.</p>';
  const lista = (arr) => (arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="suave pequeno">Nada informado.</p>');
  const feitos = [...at.feito.previstos.map((p) => `${p.texto} (${p.cumprido ? 'cumprido' : 'não cumprido'})`), ...at.feito.extras];
  return `<div class="dois">
    <div><h3>Feito</h3>${lista(feitos)}</div>
    <div><h3>Próximo</h3>${lista(at.proximo)}</div>
    <div><h3>Impedimentos ${at.critico ? '<span class="sem sem-vermelho">Crítico</span>' : ''}</h3>${lista(at.impedimentos)}</div>
    <div><h3>Apoio necessário</h3>${at.apoio ? `<p>${esc(at.apoio)}</p>` : '<p class="suave pequeno">Nada informado.</p>'}</div>
  </div><p class="suave pequeno">Enviada em ${dataHora(at.enviada_em)} · versão ${at.versao}</p>`;
}

function navSemana(rota, semana) {
  return `<a class="btn btn-sec" href="#/${rota}?semana=${addDias(semana, -7)}" aria-label="Semana anterior">←</a>
    <a class="btn btn-sec" href="#/${rota}?semana=${est.boot.semana}">Semana atual</a>
    <a class="btn btn-sec" href="#/${rota}?semana=${addDias(semana, 7)}" aria-label="Próxima semana">→</a>`;
}

// ---------- Painel da semana ----------
export async function painel(raiz, { q }) {
  const semana = q.get('semana') || est.boot.semana;
  const d = await get(`/painel?semana=${semana}`);
  const itens = [...d.itens].sort(porNecessidade);
  const r = d.resumo;
  const pct = (n) => (itens.length ? (n / itens.length) * 100 : 0);
  raiz.innerHTML = `
    <div class="cabeca">
      <div><h1>Painel da semana</h1><div class="sub">Reunião de ${nomeDiaReuniao()}, ${br(semana)} · ${plural(itens.length, 'seção', 'seções')} acompanhadas</div></div>
      <div class="acoes-topo">${navSemana('painel', semana)}<a class="btn btn-sec" href="#/pauta?semana=${semana}">Versão para impressão</a></div>
    </div>
    <div class="cartao">
      <div class="regua" role="img" aria-label="Distribuição do semáforo: ${r.vermelho} críticas, ${r.amarelo} em atenção, ${r.verde} em dia">
        <i class="r-vermelho" style="width:${pct(r.vermelho)}%"></i><i class="r-amarelo" style="width:${pct(r.amarelo)}%"></i><i class="r-verde" style="width:${pct(r.verde)}%"></i></div>
      <div class="legenda">
        <span>${sem('vermelho')} <b class="num">${r.vermelho}</b></span><span>${sem('amarelo')} <b class="num">${r.amarelo}</b></span><span>${sem('verde')} <b class="num">${r.verde}</b></span>
        <span class="suave">·</span><span><b class="num">${r.pendentes}</b> sem atualização</span>
        <span><b class="num">${r.pedidos}</b> ${r.pedidos === 1 ? 'pedido' : 'pedidos'} de novo prazo</span>
      </div>
    </div>
    <div class="espaco"></div>
    <div class="grade">${itens.map((i) => {
      const fatos = [
        i.enviada ? `<span>Atualização enviada em ${dataHora(i.enviada_em)}</span>` : '<span class="atencao">Atualização pendente</span>',
        i.critico ? '<span class="ruim">Impedimento crítico informado</span>' : '',
        i.atrasadas ? `<span class="ruim">${plural(i.atrasadas, 'ação atrasada', 'ações atrasadas')}</span>` : '',
        i.vencendo ? `<span class="atencao">${plural(i.vencendo, 'ação vence', 'ações vencem')} em até 2 dias</span>` : '',
        i.atrasadas_internas ? `<span class="suave">Resumo: ${i.atrasadas_internas} atrasada(s) em subseções (detalhe é da seção)</span>` : '',
        i.pedidos_pendentes ? `<span class="atencao">${plural(i.pedidos_pendentes, 'pedido de novo prazo', 'pedidos de novo prazo')}</span>` : '',
        `<span class="suave num">Tempo registrado na semana: ${fmtMin(i.tempo_semana)}</span>`,
      ].join('');
      return `<article class="cartao centro cor-${i.cor}">
        <div class="linha entre"><h3>${esc(i.secao.nome)}</h3>${sem(i.cor)}</div>
        <div class="meta">${esc(i.secao.sigla || '')} · ${esc(i.secao.chefe_nome || 'sem chefe atribuído')}${i.subsecoes ? ` · ${plural(i.subsecoes, 'subseção', 'subseções')}` : ''}</div>
        <div class="fatos">${fatos}</div>
        <div><a class="btn btn-sec btn-mini" href="#/centro/${i.secao.id}?semana=${semana}">Ver relato e ações</a></div>
      </article>`;
    }).join('')}</div>`;
}

// ---------- Detalhe do Centro ----------
export async function centro(raiz, { id, q, refresh }) {
  const semana = q.get('semana') || est.boot.semana;
  const d = await get(`/secoes/${id}/detalhe?semana=${semana}`);
  const it = d.item;
  const atual = d.historico.find((h) => h.semana === semana) || null;
  const anteriores = d.historico.filter((h) => h.semana !== semana);
  raiz.innerHTML = `
    <div class="cabeca">
      <div><a href="#/painel?semana=${semana}" class="pequeno">← Painel da semana</a>
        <h1>${esc(it.secao.nome)}</h1>
        <div class="sub">${esc(it.secao.sigla || '')} · ${esc(it.secao.chefe_nome || 'sem chefe atribuído')} · reunião de ${nomeDiaReuniao()}, ${br(semana)}</div></div>
      <div class="acoes-topo">${sem(it.cor)}</div>
    </div>
    <div class="cartao"><h2>Relato da semana</h2>${relatoHTML(atual)}</div>
    <div class="cartao"><div class="linha entre"><h2>Ações abertas e recentes</h2>
      <span class="suave num">Tempo total registrado: <b>${fmtMin(d.tempo_total)}</b></span></div>
      ${d.acoes.length ? `<div class="tabela-rolagem"><table><thead><tr><th>Ação</th><th>Prazo</th><th>Situação</th><th>Tempo</th></tr></thead><tbody>
      ${d.acoes.map((a) => `<tr class="clicavel" data-acao="${a.id}" tabindex="0"><td><b>${esc(a.titulo)}</b><br><span class="suave pequeno">${esc(a.secao_sigla)} · prioridade ${PRIO[a.prioridade].toLowerCase()}</span></td>
        <td class="num">${br(a.prazo)}</td><td>${pilulaStatus(a)}</td><td class="num">${fmtMin(a.tempo_total)}</td></tr>`).join('')}</tbody></table></div>`
        : vazio('Nenhuma ação em aberto', 'As ações direcionadas a este Centro aparecerão aqui.')}
      <p class="suave pequeno" style="margin-top:10px">${d.acoes_internas_visiveis ? 'Como Administrador, você vê também as ações internas das subseções.' : 'Ações internas das subseções não aparecem aqui: o Diretor vê só o resumo, salvo se o chefe compartilhar.'}</p></div>
    <div class="cartao"><h2>Semanas anteriores</h2>${anteriores.length ? anteriores.map((h) => `<details style="margin-bottom:8px"><summary><b>Reunião de ${br(h.semana)}</b>
      <span class="suave pequeno"> · enviada em ${dataHora(h.enviada_em)}</span></summary><div style="padding-top:10px">${relatoHTML(h)}</div></details>`).join('')
      : '<p class="suave">Ainda não há histórico.</p>'}</div>`;
  const abrir = (el) => abrirAcao(el.dataset.acao, refresh).catch((e) => toast(e.message, 'erro'));
  on(raiz, 'click', 'tr[data-acao]', abrir);
  on(raiz, 'keydown', 'tr[data-acao]', (el, ev) => { if (ev.key === 'Enter') abrir(el); });
}

// ---------- Direcionar ação ----------
export async function direcionar(raiz, { refresh }) {
  const [secoes, dirs] = await Promise.all([get('/secoes'), get('/diretrizes')]);
  const centros = secoes.filter((s) => !s.pai_id && s.ativa);
  raiz.innerHTML = `
    <div class="cabeca"><div><h1>Direcionar ação</h1><div class="sub">Para todos os Centros, quando o assunto é comum, ou para seções específicas. Todo pedido tem prazo.</div></div></div>
    <div class="dois" style="align-items:start">
      <form class="cartao" id="form-dir" novalidate>
        <div class="erro-form oculto" role="alert"></div>
        <div class="campo"><label for="d-titulo">O que precisa ser feito</label><input id="d-titulo" name="titulo" maxlength="160" placeholder="Ex.: Enviar o relatório de execução do trimestre" required></div>
        <div class="campo"><label for="d-detalhe">Detalhes (opcional)</label><textarea id="d-detalhe" name="detalhe" placeholder="Formato esperado, referências, quem acionar…"></textarea></div>
        <div class="campo"><label>Para quem</label>
          <div class="escolha"><label><input type="radio" name="destino" value="todos" checked> Todos os Centros</label>
          <label><input type="radio" name="destino" value="especificos"> Escolher seções</label></div></div>
        <div class="campo oculto" id="alvos"><div class="escolha">${centros.map((c) => `<label><input type="checkbox" name="secao" value="${c.id}"> ${esc(c.sigla || c.nome)}</label>`).join('')}</div>
          <div class="dica">Cada seção escolhida recebe a sua própria ação, com acompanhamento individual.</div></div>
        <div class="dois">
          <div class="campo"><label for="d-prazo">Prazo</label><input id="d-prazo" type="date" name="prazo" min="${hoje()}" value="${addDias(hoje(), 7)}" required></div>
          <div class="campo"><label for="d-prio">Prioridade</label><select id="d-prio" name="prioridade"><option value="alta">Alta</option><option value="media" selected>Média</option><option value="baixa">Baixa</option></select></div>
        </div>
        <button class="btn btn-primario" type="submit">Direcionar ação</button>
      </form>
      <div class="cartao"><h2>Últimas ações direcionadas</h2>
        ${dirs.length ? dirs.slice(0, 8).map((x) => `<div style="margin-bottom:14px"><div class="linha entre"><b>${esc(x.titulo)}</b><span class="pilula prio-${x.prioridade}">${PRIO[x.prioridade]}</span></div>
          <div class="suave pequeno">${x.destino === 'todos' ? 'Todos os Centros' : plural(x.total, 'seção', 'seções')} · prazo ${br(x.prazo)} · criada por ${esc(x.criado_por_nome || '')}</div>
          <div class="linha"><div class="progresso" style="flex:1"><i style="width:${x.total ? (x.concluidas / x.total) * 100 : 0}%"></i></div><span class="pequeno num">${x.concluidas}/${x.total} concluídas</span></div></div>`).join('')
          : vazio('Nenhuma ação direcionada ainda', 'Use o formulário ao lado para criar a primeira.')}
      </div>
    </div>`;
  const form = $('#form-dir', raiz);
  on(form, 'change', 'input[name=destino]', () => $('#alvos', raiz).classList.toggle('oculto', form.destino.value !== 'especificos'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = $('.erro-form', form);
    erro.classList.add('oculto');
    const corpo = {
      titulo: form.titulo.value, detalhe: form.detalhe.value, destino: form.destino.value, prazo: form.prazo.value, prioridade: form.prioridade.value,
      secoes: [...form.querySelectorAll('input[name=secao]:checked')].map((c) => Number(c.value)),
    };
    try {
      const r = await post('/diretrizes', corpo);
      toast(`Ação direcionada a ${plural(r.acoes_criadas, 'seção', 'seções')}.`);
      refresh();
    } catch (ex) {
      erro.textContent = ex.message;
      erro.classList.remove('oculto');
    }
  });
}

// ---------- Ações ----------
export async function acoes(raiz, _p) {
  const secoes = (await get('/secoes')).filter((s) => !s.pai_id && s.ativa);
  raiz.innerHTML = `
    <div class="cabeca"><div><h1>Ações</h1><div class="sub">Todas as ações direcionadas aos Centros. Clique numa linha para ver o detalhe.</div></div></div>
    <div class="cartao"><div class="linha" style="margin-bottom:12px">
      <div style="min-width:170px"><label for="f-secao">Seção</label><select id="f-secao"><option value="">Todas</option>${secoes.map((s) => `<option value="${s.id}">${esc(s.sigla || s.nome)}</option>`).join('')}</select></div>
      <div style="min-width:170px"><label for="f-sit">Situação</label><select id="f-sit"><option value="abertas">Abertas</option><option value="atrasadas">Atrasadas</option><option value="concluidas">Concluídas (aguardando aceite)</option><option value="encerradas">Encerradas</option></select></div>
      <div style="min-width:170px"><label for="f-status">Status</label><select id="f-status"><option value="">Qualquer</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div style="flex:1;min-width:200px"><label for="f-q">Buscar</label><input id="f-q" type="search" placeholder="Título ou detalhe"></div></div>
      <div class="tabela-rolagem" id="lista-acoes"></div></div>`;
  const carregar = async () => {
    const p = new URLSearchParams();
    for (const [k, id] of [['secao', 'f-secao'], ['situacao', 'f-sit'], ['status', 'f-status'], ['q', 'f-q']]) if ($(`#${id}`, raiz).value) p.set(k, $(`#${id}`, raiz).value);
    const lista = await get(`/acoes?${p}`);
    $('#lista-acoes', raiz).innerHTML = lista.length ? `<table><thead><tr><th>Ação</th><th>Seção</th><th>Prazo</th><th>Situação</th><th>Tempo</th></tr></thead><tbody>
      ${lista.map((a) => `<tr class="clicavel" data-acao="${a.id}" tabindex="0"><td><b>${esc(a.titulo)}</b> ${a.demandada_diretor ? '<span class="pilula diretor">Diretriz</span> ' : ''}<span class="pilula prio-${a.prioridade}">${PRIO[a.prioridade]}</span></td>
        <td>${esc(a.secao_sigla)}</td><td class="num">${br(a.prazo)}</td><td>${pilulaStatus(a)}${a.pedido_pendente ? ' <span class="pilula">Pediu novo prazo</span>' : ''}</td>
        <td class="num">${fmtMin(a.tempo_total)}</td></tr>`).join('')}</tbody></table>` : vazio('Nenhuma ação encontrada', 'Ajuste os filtros ou direcione uma nova ação.');
  };
  for (const id of ['f-secao', 'f-sit', 'f-status']) $(`#${id}`, raiz).addEventListener('change', carregar);
  let t;
  $('#f-q', raiz).addEventListener('input', () => { clearTimeout(t); t = setTimeout(carregar, 250); });
  const abrir = (el) => abrirAcao(el.dataset.acao, () => { carregar(); }).catch((e) => toast(e.message, 'erro'));
  on(raiz, 'click', 'tr[data-acao]', abrir);
  on(raiz, 'keydown', 'tr[data-acao]', (el, ev) => { if (ev.key === 'Enter') abrir(el); });
  await carregar();
}

// ---------- Pedidos de novo prazo ----------
export async function prazos(raiz, { refresh }) {
  const lista = await get('/pedidos-prazo');
  const diretor = ehDiretor();
  raiz.innerHTML = `
    <div class="cabeca"><div><h1>Pedidos de novo prazo</h1><div class="sub">${lista.length ? plural(lista.length, 'pedido aguarda', 'pedidos aguardam') + ' decisão' : 'Nenhum pedido pendente'}</div></div></div>
    ${diretor ? '' : ehAdmin() ? '<div class="info">Você consulta os pedidos de prazo. A decisão é do Diretor.</div>' : '<div class="info">Somente o Diretor decide pedidos de prazo. Durante a reunião, o Apoio pode registrar a decisão no Modo Reunião.</div>'}
    ${lista.length ? lista.map((p) => `<div class="cartao"><div class="linha entre"><h3>${esc(p.acao_titulo)}</h3><span class="pilula">${esc(p.secao_sigla)}</span></div>
      <p class="suave" style="margin:4px 0 8px">Pedido de ${esc(p.usuario_nome || '')} em ${dataHora(p.criado_em)}</p>
      <p><b class="num">${br(p.prazo_atual)}</b> → <b class="num">${br(p.novo_prazo)}</b></p><p>${esc(p.justificativa)}</p>
      ${diretor ? `<div class="linha"><button class="btn btn-ok" data-decidir="${p.id}" data-aprovar="1">Aprovar novo prazo</button><button class="btn btn-perigo" data-decidir="${p.id}" data-aprovar="0">Recusar</button></div>` : ''}</div>`).join('')
      : `<div class="cartao">${vazio('Tudo em dia', 'Quando um chefe pedir novo prazo, o pedido aparece aqui.')}</div>`}`;
  on(raiz, 'click', '[data-decidir]', async (el) => {
    try {
      const r = await post(`/pedidos-prazo/${el.dataset.decidir}/decidir`, { aprovar: el.dataset.aprovar === '1' });
      toast(r.status === 'aprovado' ? 'Novo prazo aprovado.' : 'Pedido recusado.');
      refresh();
    } catch (e) { toast(e.message, 'erro'); }
  });
}

// ---------- Pauta para impressão (plano B da TV) ----------
export async function pauta(raiz, { q }) {
  const semana = q.get('semana') || est.boot.semana;
  const d = await get(`/pauta?semana=${semana}`);
  const lista = (arr) => (arr.length ? `<ul style="margin:2px 0 6px;padding-left:18px">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="suave"> nada informado</span>');
  raiz.innerHTML = `
    <div class="cabeca"><div><a href="#/painel?semana=${semana}" class="pequeno nao-imprimir">← Painel da semana</a>
      <h1>Pauta da reunião de ${diaSemana(semana)}, ${br(semana)}</h1><div class="sub">Versão para impressão, em ordem de necessidade. Tempo registrado e ações internas não constam.</div></div>
      <div class="acoes-topo"><button class="btn btn-primario" id="imprimir">Imprimir</button></div></div>
    <div class="pauta">${d.cartoes.map((c) => {
      const at = c.atualizacao;
      const feitos = at ? [...at.feito.previstos.map((p) => `${p.texto} (${p.cumprido ? 'cumprido' : 'não cumprido'})`), ...at.feito.extras] : [];
      return `<section class="secao-pauta" style="border-left-color:var(--${c.cor === 'verde' ? 'verde' : c.cor === 'amarelo' ? 'amarelo' : 'vermelho'})">
        <div class="linha entre"><h3>${esc(c.secao.nome)} (${esc(c.secao.sigla || '')})</h3>${sem(c.cor)}</div>
        ${at ? `<div><b>Feito:</b>${lista(feitos)}<b>Próximo:</b>${lista(at.proximo)}<b>Impedimentos${at.critico ? ' (crítico)' : ''}:</b>${lista(at.impedimentos)}
          ${at.apoio ? `<b>Apoio necessário:</b> ${esc(at.apoio)}` : ''}</div>` : '<p class="suave">Atualização pendente.</p>'}
        ${c.acoes.filter((a) => a.status !== 'concluida').length ? `<div><b>Ações abertas:</b>${lista(c.acoes.filter((a) => a.status !== 'concluida').map((a) => `${a.titulo} — prazo ${br(a.prazo)}${a.atrasada ? ' (atrasada)' : ''}`))}</div>` : ''}
        ${c.pedidos.length ? `<div><b>Pedidos de novo prazo:</b>${lista(c.pedidos.map((p) => `${p.acao_titulo}: ${br(p.prazo_atual)} → ${br(p.novo_prazo)}`))}</div>` : ''}
      </section>`;
    }).join('')}</div>`;
  $('#imprimir', raiz).addEventListener('click', () => window.print());
}
