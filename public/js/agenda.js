// Agenda semanal: ações organizadas por dia de prazo, de terça a segunda (o mesmo ciclo de negócio usado
// no Painel e no relato semanal). Não é uma tela nova de dados: tudo já vem de GET /acoes, que já filtra
// pelo que cada perfil pode ver (o Chefe só a própria árvore; Diretor e Apoio, tudo que não é interno;
// Administrador, tudo). Aqui só se reorganiza por data em vez de por lista. Pensada para celular: dias
// empilhados verticalmente (o padrão de agenda dos calendários de telefone), não uma grade de 7 colunas.
// Para o Chefe é a própria agenda; para Diretor, Apoio e Administrador, a agenda de todas as seções —
// por isso a seção aparece em destaque (selo), não como texto secundário.
import { get } from './api.js';
import { est } from './estado.js';
import { $, addDias, br, esc, on, parseISO, pilulaStatus, plural, sem, toast, vazio } from './ui.js';
import { abrirAcao } from './acao-comum.js';

const DIAS_COMPLETO = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const nomeDiaCompleto = (d) => DIAS_COMPLETO[parseISO(d).getUTCDay()];

// `comPrazo`: mostra a data do prazo junto do título. Nos cartões de dia a data já está no cabeçalho da
// seção (repeti-la seria ruído); no bloco "Atrasadas", que reúne dias diferentes, ela é a informação que falta.
const linhaAcao = (a, { comPrazo = false } = {}) => `<button type="button" class="agenda-item" data-abrir="${a.id}">
  <span class="agenda-item-titulo"><span class="pilula" title="Seção responsável">${esc(a.secao_sigla)}</span> ${esc(a.titulo)}
    ${comPrazo ? `<span class="suave pequeno">deveria terminar em ${br(a.prazo)}</span>` : ''}</span>
  <span class="agenda-item-selos">${pilulaStatus(a)}</span>
</button>`;

/** Cor do dia: vermelho se há algo já atrasado ali; amarelo se hoje/próximos 2 dias têm ação aberta;
 *  verde se está tudo concluído; sem destaque se são ações abertas mas ainda longe do prazo. */
function corDoDia(dia, acoesDoDia, hoje) {
  if (!acoesDoDia.length) return null;
  if (acoesDoDia.some((a) => a.atrasada)) return 'vermelho';
  const proximo = dia >= hoje && dia <= addDias(hoje, 2);
  if (proximo && acoesDoDia.some((a) => a.status !== 'concluida')) return 'amarelo';
  if (acoesDoDia.every((a) => a.status === 'concluida')) return 'verde';
  return null;
}

export async function agenda(raiz, { q, refresh }) {
  const gestao = est.user.perfil !== 'chefe'; // Diretor, Apoio e Administrador veem a agenda de todas as seções
  if (!gestao && !est.user.secao_id) {
    raiz.innerHTML = `<div class="cabeca"><h1>Agenda</h1></div><div class="cartao">${vazio(
      'Você ainda não está vinculado a uma seção', 'Peça ao Diretor para atribuí-lo a uma seção na tela Estrutura.')}</div>`;
    return;
  }
  // A semana da agenda segue a mesma referência (terça) usada no Painel: navega independente da semana
  // "oficial" da próxima reunião, mas com a mesma unidade de tempo do resto do sistema.
  const semana = q.get('semana') || est.boot.semana;
  const hoje = est.boot.hoje;
  const dias = Array.from({ length: 7 }, (_, i) => addDias(semana, i));

  const [abertas, concluidas] = await Promise.all([get('/acoes?situacao=abertas'), get('/acoes?situacao=concluidas')]);
  const todas = [...abertas, ...concluidas];
  const atrasadas = abertas.filter((a) => a.atrasada).sort((x, y) => (x.prazo < y.prazo ? -1 : 1));
  const porDia = new Map(dias.map((d) => [d, todas.filter((a) => a.prazo === d)]));

  raiz.innerHTML = `
    <div class="cabeca">
      <div><h1>Agenda</h1><div class="sub">${gestao ? 'Ações de todas as seções por prazo, de terça a segunda' : 'Suas ações por prazo, de terça a segunda'}</div></div>
      <div class="acoes-topo">
        <a class="btn btn-sec" href="#/agenda?semana=${addDias(semana, -7)}" aria-label="Semana anterior">←</a>
        <a class="btn btn-sec" href="#/agenda?semana=${est.boot.semana}">Semana atual</a>
        <a class="btn btn-sec" href="#/agenda?semana=${addDias(semana, 7)}" aria-label="Próxima semana">→</a>
      </div>
    </div>
    ${atrasadas.length ? `<div class="cartao agenda-atrasadas">
      <h2>${sem('vermelho')} ${plural(atrasadas.length, 'ação atrasada', 'ações atrasadas')}</h2>
      <div class="agenda-lista">${atrasadas.map((a) => linhaAcao(a, { comPrazo: true })).join('')}</div>
    </div>` : ''}
    <div class="agenda-dias">
      ${dias.map((d) => {
        const itens = (porDia.get(d) || []).sort((x, y) => (x.status === 'concluida') - (y.status === 'concluida'));
        const cor = corDoDia(d, itens, hoje);
        return `<section class="cartao agenda-dia ${d === hoje ? 'agenda-hoje' : ''}">
          <header class="agenda-dia-cabeca">
            <div><b>${nomeDiaCompleto(d)}</b> <span class="suave">${br(d)}</span>${d === hoje ? ' <span class="pilula">Hoje</span>' : ''}</div>
            ${cor ? sem(cor) : itens.length ? '<span class="suave pequeno">Sem pendência</span>' : ''}
          </header>
          ${itens.length ? `<div class="agenda-lista">${itens.map(linhaAcao).join('')}</div>` : '<p class="suave pequeno">Nada previsto.</p>'}
        </section>`;
      }).join('')}
    </div>`;

  const abrir = (el) => abrirAcao(el.dataset.abrir, refresh).catch((e) => toast(e.message, 'erro'));
  on(raiz, 'click', '[data-abrir]', abrir);
}
