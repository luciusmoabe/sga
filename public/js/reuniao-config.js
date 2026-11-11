// Configuração da reunião: a tela é uma só e muda a instância. Para a organização é a rotina (periodicidade, dia, horário, próxima data) e o
// cabeçalho da ata da instituição; para a equipe, os mesmos dois blocos, da seção do chefe.
import { del, get, put } from './api.js';
import { est } from './estado.js';
import { agendaComoBoot, agendaComoConfig } from './agenda-equipe.js';
import { ligarConfiguracaoAta } from './ata-cabecalho.js';
import { ligarReuniao, painelReuniao } from './config-reuniao.js';
import { comSeletor, instanciaDe } from './instancia.js';
import { confirmar, toast } from './ui.js';

/** Quem configura a reunião da organização: a gestão e quem recebeu o acesso à Configuração. */
export const configuraOrganizacao = () => ['diretor', 'apoio', 'administrador'].includes(est.user.perfil) || !!est.user.acesso_configuracao;
/** Quem configura a reunião da própria equipe: o chefe (titular ou suplente) de uma seção. */
export const configuraEquipe = () => est.user.perfil === 'chefe' && !!est.user.secao_id;

export async function configReuniao(raiz, { q, refresh }) {
  const disponiveis = [configuraOrganizacao() && 'organizacao', configuraEquipe() && 'equipe'].filter(Boolean);
  const atual = instanciaDe(q, disponiveis, configuraEquipe() ? 'equipe' : 'organizacao');
  const corpo = comSeletor(raiz, 'reuniao-config', disponiveis, atual, 'Configuração da reunião');
  const equipe = atual === 'equipe';

  const [config, cabecalho] = equipe
    ? await Promise.all([get('/reunioes-equipe/agenda'), get('/reunioes-equipe/cabecalho')])
    : [await get('/config'), null];
  const agenda = equipe ? agendaComoConfig(config) : config;
  const boot = equipe ? agendaComoBoot(config) : est.boot;
  const propria = equipe ? config.propria : true;

  corpo.innerHTML = `<div class="cabeca"><div><h1>Configuração da reunião</h1>
      <div class="sub">${equipe
    ? (propria ? 'A sua seção tem a própria agenda.' : 'A sua seção ainda segue a agenda da instituição. Ao salvar, passa a ter a sua.')
    : 'A rotina das reuniões e o cabeçalho das atas da instituição.'}</div></div></div>
    ${painelReuniao(agenda, boot, {
    visivel: true,
    titulo: equipe ? 'Reunião da equipe' : 'Reunião da organização',
    descricao: equipe ? 'Defina a periodicidade, o dia e o horário da reunião com a sua equipe. É independente da reunião da instituição.'
      : 'Defina a periodicidade, o dia e o horário de acompanhamento.',
  })}
    <div class="cartao" id="config-ata" style="margin-top:16px"></div>
    ${equipe && cabecalho?.propria ? '<div class="linha" style="margin-top:12px"><button type="button" class="btn btn-fantasma" id="usar-instituicao">Voltar a usar o cabeçalho da instituição</button></div>' : ''}`;

  if (equipe) {
    ligarReuniao(corpo, agenda, refresh, { boot, salvar: (c) => put('/reunioes-equipe/agenda', c), aoSalvar: async () => {} });
    ligarConfiguracaoAta(corpo, cabecalho, {
      titulo: 'Cabeçalho da ata da sua seção',
      descricao: `${cabecalho.propria ? 'A sua seção tem um cabeçalho próprio.' : 'A sua seção ainda usa o cabeçalho da instituição. Ao salvar, passa a ter o seu.'} Vale para as atas das reuniões da equipe, na tela e no PDF. O brasão da esquerda costuma ser o da instituição e o da direita, o da sua seção; cada um é opcional.`,
      salvar: (dados) => put('/reunioes-equipe/cabecalho', dados),
    });
    corpo.querySelector('#usar-instituicao')?.addEventListener('click', async () => {
      if (!(await confirmar({ titulo: 'Voltar ao cabeçalho da instituição', texto: 'O cabeçalho próprio da sua seção será apagado e as atas passam a usar o da instituição.', rotulo: 'Voltar ao da instituição' }))) return;
      try { await del('/reunioes-equipe/cabecalho'); toast('A seção voltou a usar o cabeçalho da instituição.'); refresh(); } catch (e) { toast(e.message, 'erro'); }
    });
  } else {
    ligarReuniao(corpo, config, refresh);
    ligarConfiguracaoAta(corpo, config);
  }
}
