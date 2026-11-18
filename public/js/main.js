// Ponto de entrada: entrada simulada, casca da aplicação e roteamento por hash.
import { PERFIL_DA_EMPRESA, dosPlural, nomeTipo } from './vocab.js';
import { empresaLembrada, empresasDaEntrada, entrar, entrarSenha, get, lembrarEmpresa, sair, sessao, limparSessao, modoAuth, versao } from './api.js';
import { atualizarSessao, est } from './estado.js';
import { $, esc, faixaPendente, on, trilho, toast } from './ui.js';
import { acoes, centro, direcionar, painel, pauta, prazos } from './telas-diretor.js';
import { historico, inicio, minhasAcoes } from './telas-chefe.js';
import { agenda } from './agenda.js';
import { gestao } from './gestao.js';
import { diarioTela } from './diario-tela.js';
import { abrirNovaAcao, podeCriarAcao } from './nova-acao.js';
import { PERFIS_NOVA_INTERFACE, TODAS_AS_AREAS, abaAtiva, abasDaArea, areaDaRota, areasDoPerfil, casaNovaInterface, definirNovaInterface, menuNovaInterface, novaInterfaceLigada, temNovaInterface } from './nova-interface.js';
import { combinados } from './combinados.js';
import { estrutura } from './estrutura.js';
import { configuracaoAta } from './ata-cabecalho.js';
import { reuniaoDetalhe, reunioes } from './atas.js';
import { inicioReuniao, viewReuniao } from './reuniao.js';
import { reunioesEquipe, viewReuniaoEquipe } from './reuniao-equipe.js';
import { combinadosUnico, atasUnico, atualizacaoUnica } from './reunioes-instancia.js';
import { configReuniao, configuraEquipe, configuraOrganizacao } from './reuniao-config.js';
import { avisos } from './avisos.js';
import { empresas } from './plataforma.js';
import { produtividade } from './produtividade.js';
import { equipe } from './equipe.js';
import { acoesDosCentros, lePorTodosOsCentros } from './consulta.js';
import { DIRETORIA_ADJUNTA } from './regras.js';
import { abrirAlterarReuniao } from './reuniao-data.js';
import { abrirTrocaSenha, telaTrocaSenha } from './senha.js';
import { abrirAcao, acaoEstaAberta, tirarAcaoDaUrl } from './acao-comum.js';
import { abrirTutorial, convidarSeNovo, temTutorial } from './tutorial.js';
import { abrirAvisosNoCelular, esquecerAvisosAoSair, iniciarLembretesDoApp, pararLembretesDoApp, recebeAvisos, restaurarAvisos } from './push.js';

const GESTAO = ['diretor', 'apoio', 'administrador'];
const LISTA_DE_ACOES = { chefe: 'minhas-acoes', membro: 'minhas-acoes', consulta: 'acoes-centros', diretor: 'acoes', apoio: 'acoes', administrador: 'acoes' };
const LEITURA = ['diretor', 'apoio', 'administrador']; // telas de acompanhamento que o Administrador também consulta
const TODOS = ['diretor', 'apoio', 'chefe', 'administrador'];
const ROTAS = {
  painel: { f: painel, perfis: LEITURA, trilho: true, titulo: 'Painel da semana' },
  centro: { f: centro, perfis: LEITURA, get titulo() { return nomeTipo('centro'); } },
  // O chefe que tem subseções ativas abaixo direciona ações a elas (quem demandou aceita ou devolve o que for concluído).
  direcionar: { f: direcionar, perfis: [...GESTAO, 'chefe'], titulo: 'Direcionar ação', exige: () => est.user.perfil !== 'chefe' || !!est.boot?.secao?.tem_subsecoes },
  acoes: { f: acoes, perfis: LEITURA, titulo: 'Ações' },
  prazos: { f: prazos, perfis: LEITURA, titulo: 'Pedidos de prazo' },
  pauta: { f: pauta, perfis: LEITURA, titulo: 'Pauta' },
  // O Apoio só abre a Configuração completa se o Diretor ou o Administrador assinalou o acesso; sem isso, só a da ata.
  estrutura: { f: (raiz, p) => (est.user.perfil === 'apoio' && !est.user.acesso_configuracao ? configuracaoAta(raiz) : estrutura(raiz, p)), perfis: ['diretor', 'apoio', 'chefe', 'administrador'], titulo: 'Configuração', exige: () => est.user.perfil !== 'chefe' || !!est.user.acesso_configuracao },
  configuracao: { f: (raiz, p) => (est.user.perfil === 'apoio' && !est.user.acesso_configuracao ? configReuniao(raiz, p) : estrutura(raiz, p)), perfis: GESTAO, titulo: 'Configuração' },
  avisos: { f: avisos, perfis: ['diretor', 'administrador'], titulo: 'Avisos' },
  combinados: { f: combinadosUnico, perfis: TODOS, titulo: 'Combinados' },
  // Reuniões e atas, configuração da reunião e atualização semanal: uma tela só para a organização e para a equipe da seção (`?i=equipe`).
  atas: { f: atasUnico, perfis: ['chefe', 'membro'], titulo: 'Reuniões e atas' },
  'reuniao-config': { f: configReuniao, perfis: ['diretor', 'apoio', 'administrador', 'chefe'], exige: () => configuraOrganizacao() || configuraEquipe(), titulo: 'Configuração da reunião' },
  // A ata e o Modo Reunião da equipe (o detalhe de uma reunião da equipe); a lista é `#/atas?i=equipe`.
  'reunioes-equipe': { f: (raiz, p) => (p.id ? reunioesEquipe(raiz, p) : location.replace('#/atas?i=equipe')), perfis: ['chefe', 'membro'], titulo: 'Reunião da equipe' },
  'reuniao-equipe': { f: viewReuniaoEquipe, perfis: ['chefe'], tv: (p) => !!p.id, titulo: 'Modo Reunião da equipe' },
  reunioes: { f: (r, p) => (p.id ? reuniaoDetalhe(r, p) : reunioes(r, p)), perfis: LEITURA, titulo: 'Reuniões e atas' },
  // Sem id: tela comum de início (nada é criado ao abrir a rota). Com id: Modo Reunião em tela cheia.
  reuniao: { f: (r, p) => (p.id ? viewReuniao(r, p) : inicioReuniao(r, p)), perfis: GESTAO, tv: (p) => !!p.id, titulo: 'Modo Reunião' },
  // Painel de gestão do chefe: radar do dia, fluxo, entregas por semana, carga da equipe e pontos de conversa (só leitura).
  gestao: { f: gestao, perfis: ['chefe'], titulo: 'Painel de gestão' },
  inicio: { f: inicio, perfis: ['chefe', 'administrador'], trilho: true, titulo: 'Início' },
  // Versão nova: a tela Hoje do chefe (o mesmo código do Início, em variante; ver `inicio` em telas-chefe.js).
  hoje: { f: inicio, perfis: ['chefe'], trilho: true, titulo: 'Hoje' },
  // Link neutro de uma ação (`#/acao/ID`, o que o botão "Copiar link da ação" gera): cada perfil o leva à sua lista, com a ficha aberta.
  acao: { f: (raiz, { id }) => { raiz.innerHTML = '<p class="suave">Abrindo a ação…</p>'; location.replace(`#/${LISTA_DE_ACOES[est.user.perfil] || 'acoes'}?acao=${Number(id) || 0}`); }, perfis: [...TODOS, 'consulta', 'membro'], titulo: 'Ação' },
  agenda: { f: agenda, perfis: [...TODOS, 'consulta', 'membro'], trilho: true, titulo: 'Agenda' },
  // Meu diário (e, para o chefe, Diário da seção): os registros do diário de progresso por dia, com filtros (só leitura).
  diario: { f: diarioTela, perfis: ['chefe', 'administrador', 'membro'], titulo: 'Diário' },
  // Leitura das ações de todos os Centros: perfil Consulta e chefe com a permissão (a tela confere a permissão).
  'acoes-centros': { f: acoesDosCentros, perfis: ['consulta', 'chefe'], get titulo() { return `Ações ${dosPlural('centro')}`; } },
  // O Administrador da Diretoria Adjunta envia o relato da própria seção, como um chefe.
  atualizacao: { f: atualizacaoUnica, perfis: ['chefe', 'administrador'], trilho: true, titulo: 'Minha atualização' },
  'minhas-acoes': { f: minhasAcoes, perfis: ['chefe', 'administrador', 'membro'], trilho: true, titulo: 'Minhas ações' },
  // O chefe (e o Administrador vinculado a uma seção) cadastra e desativa os membros da equipe da própria seção.
  equipe: { f: equipe, perfis: ['chefe', 'administrador'], titulo: 'Minha equipe' },
  historico: { f: historico, perfis: ['chefe'], titulo: 'Histórico' },
  // Indicadores das unidades (o chefe vê a própria unidade; o Diretor e o Administrador, também as pessoas).
  produtividade: { f: produtividade, perfis: ['diretor', 'apoio', 'administrador', 'chefe'], titulo: 'Produtividade' },
  // Perfil Plataforma: cria e administra as empresas (não vê dados de negócio).
  empresas: { f: empresas, perfis: ['plataforma'], titulo: 'Empresas' },
};

// ---------- Nova interface (fase 1): quatro áreas, cada uma com as telas atuais em abas ----------
// A área é só uma moldura: escolhe a aba (`?t=`), desenha a barra de abas e entrega o resto à tela de sempre, com os mesmos parâmetros.
// As rotas antigas continuam valendo (links, tutorial, ficha da ação); o menu apenas marca a área a que elas pertencem.
const novaAtiva = () => !!est.user && temNovaInterface(est.user.perfil) && novaInterfaceLigada();
const rotaDisponivel = (rota) => { const d = ROTAS[rota]; return !!d && d.perfis.includes(est.user.perfil) && (!d.exige || !!d.exige()); };
const abasAtuais = (area) => abasDaArea(area, rotaDisponivel, (r) => ROTAS[r].titulo);
/** As áreas de quem está usando (o chefe com acesso à configuração ganha a área Configuração). */
const areasAtuais = () => areasDoPerfil(est.user.perfil, { acessoConfiguracao: !!est.user.acesso_configuracao });
const areaDoPerfil = (id) => areasAtuais().find((a) => a.id === id);
function rotaDeArea(id) {
  return {
    perfis: PERFIS_NOVA_INTERFACE,
    get titulo() { return areaDoPerfil(id)?.rotulo || 'Agilis'; },
    // O trilho (reunião, prazo) acompanha a tela interna que está aberta.
    get trilho() { const area = areaDoPerfil(id); const a = area && abaAtiva(abasAtuais(area), lerRota().q.get('t')); return !!(a && ROTAS[a.rota].trilho); },
    exige: () => { const area = areaDoPerfil(id); return novaAtiva() && !!area && abasAtuais(area).length > 0; },
    f: async (raiz, { q, refresh }) => {
      const area = areaDoPerfil(id);
      const abas = abasAtuais(area);
      const ativa = abaAtiva(abas, q.get('t'));
      // O botão "Nova ação" fica nas áreas de ações: uma só porta para criar, que pergunta para quem é e abre o formulário certo.
      const botaoNova = ['a-acoes', 'a-meudia'].includes(id) && podeCriarAcao(est.user.perfil) ? '<button type="button" class="btn btn-primario" id="nova-acao-global">+ Nova ação</button>' : '';
      const nav = abas.length > 1 ? `<nav class="abas-area" aria-label="${esc(area.rotulo)}">${abas.map((b) => `<a href="#/${area.id}?t=${b.rota}" ${b === ativa ? 'aria-current="page"' : ''}>${esc(b.rotulo)}</a>`).join('')}</nav>` : '';
      raiz.innerHTML = `${nav || botaoNova ? `<div class="area-cab">${nav}${botaoNova}</div>` : ''}<div id="area-corpo"></div>`;
      if (botaoNova) on(raiz, 'click', '#nova-acao-global', () => abrirNovaAcao({ aoCriar: refresh }));
      // A tela interna recebe os mesmos parâmetros (`?i=equipe`, `?acao=ID`), sem o `t`, que é só da área.
      await ROTAS[ativa.rota].f($('#area-corpo', raiz), { id: undefined, q, refresh });
    },
  };
}
for (const area of TODAS_AS_AREAS) ROTAS[area.id] = rotaDeArea(area.id);
/** Com a versão nova ligada, o endereço de uma tela atual (`#/atualizacao?i=equipe`) leva à mesma tela dentro da sua área (`#/a-semana?t=atualizacao&i=equipe`). */
function enderecoNaAreaNova(rota, id, q) {
  if (id) return null; // uma reunião, uma ata ou um Centro em particular abre como sempre
  if (rota === 'inicio' && est.user.perfil === 'chefe') return '#/a-hoje'; // o Início do chefe é a tela Hoje da versão nova
  const area = areasAtuais().find((a) => a.abas.some((b) => b.rota === rota));
  if (!area || !rotaDisponivel(rota)) return null;
  const params = new URLSearchParams(q);
  if (area.abas.length > 1) params.set('t', rota);
  const s = params.toString();
  return `#/${area.id}${s ? `?${s}` : ''}`;
}

// Ícones do menu: SVG embutido (sem fonte de ícones nem CDN de terceiros), um traço simples por rota.
// `stroke="currentColor"` acompanha a cor do link (normal, hover, selecionado) sem CSS à parte.
const ICONES = {
  painel: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="2.5" width="6" height="6" rx="1.2"/><rect x="11.5" y="2.5" width="6" height="6" rx="1.2"/><rect x="2.5" y="11.5" width="6" height="6" rx="1.2"/><rect x="11.5" y="11.5" width="6" height="6" rx="1.2"/></svg>',
  diario: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 2.5h9a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-9z"/><line x1="7.5" y1="2.5" x2="7.5" y2="17.5"/><line x1="10" y1="7" x2="13" y2="7"/><line x1="10" y1="10" x2="13" y2="10"/></svg>',
  agenda: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="4" width="15" height="13" rx="1.5"/><line x1="2.5" y1="8" x2="17.5" y2="8"/><line x1="6" y1="2" x2="6" y2="5.5"/><line x1="14" y1="2" x2="14" y2="5.5"/></svg>',
  reuniao: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="3.5" width="16" height="10.5" rx="1.5"/><line x1="7" y1="17.5" x2="13" y2="17.5"/><line x1="10" y1="14" x2="10" y2="17.5"/><path d="M8.3 6.3v5l4.4-2.5-4.4-2.5z" fill="currentColor" stroke="none"/></svg>',
  direcionar: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="10" x2="16" y2="10"/><polyline points="11,5 16,10 11,15"/></svg>',
  'acoes-centros': '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 10s3-5.5 8.5-5.5S18.5 10 18.5 10s-3 5.5-8.5 5.5S1.5 10 1.5 10z"/><circle cx="10" cy="10" r="2.5"/></svg>',
  equipe: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="2.6"/><path d="M2 16.5c0-2.8 2.2-4.6 5-4.6s5 1.8 5 4.6"/><circle cx="14.2" cy="8" r="2"/><path d="M14.5 12c2 .2 3.5 1.6 3.5 3.8"/></svg>',
  acoes: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2.5,5 4,6.5 6.5,3.5"/><line x1="9" y1="5" x2="17.5" y2="5"/><polyline points="2.5,11 4,12.5 6.5,9.5"/><line x1="9" y1="11" x2="17.5" y2="11"/><line x1="2.5" y1="16" x2="17.5" y2="16"/></svg>',
  prazos: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10.5" r="7"/><polyline points="10,6.5 10,10.5 13,12.5"/></svg>',
  combinados: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="2.5" x2="5" y2="17.5"/><path d="M5 3.5h9l-2.3 3 2.3 3H5"/></svg>',
  reunioes: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.5h7l3.5 3.5v11.5H5z"/><path d="M12 2.5v3.5h3.5"/><line x1="7.5" y1="10" x2="14" y2="10"/><line x1="7.5" y1="13.5" x2="14" y2="13.5"/></svg>',
  estrutura: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="4" r="2"/><circle cx="4.5" cy="15" r="2"/><circle cx="15.5" cy="15" r="2"/><line x1="10" y1="6" x2="10" y2="10"/><line x1="10" y1="10" x2="4.5" y2="13"/><line x1="10" y1="10" x2="15.5" y2="13"/></svg>',
  gestao: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14a7 7 0 1 1 14 0"/><line x1="10" y1="14" x2="13.5" y2="8.5"/><circle cx="10" cy="14" r="1" fill="currentColor"/><line x1="3" y1="17" x2="17" y2="17"/></svg>',
  inicio: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 10 3l7 6.5"/><path d="M5 8.5v8h10v-8"/></svg>',
  atualizacao: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 3.5 16 7l-9 9-4 1 1-4z"/></svg>',
  'minhas-acoes': '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2.5,5 4,6.5 6.5,3.5"/><line x1="9" y1="5" x2="17.5" y2="5"/><polyline points="2.5,11 4,12.5 6.5,9.5"/><line x1="9" y1="11" x2="17.5" y2="11"/><line x1="2.5" y1="16" x2="17.5" y2="16"/></svg>',
  historico: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6"/><polyline points="2.5,3.5 3.5,6.5 6.5,5.5"/><polyline points="10,7 10,10.3 12.5,11.8"/></svg>',
  atas: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.5h7l3.5 3.5v11.5H5z"/><path d="M12 2.5v3.5h3.5"/><line x1="7.5" y1="10" x2="14" y2="10"/><line x1="7.5" y1="13.5" x2="14" y2="13.5"/></svg>',
  'reuniao-config': '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="17" y2="6"/><line x1="3" y1="14" x2="17" y2="14"/><circle cx="7" cy="6" r="2" fill="var(--card, #fff)"/><circle cx="13" cy="14" r="2" fill="var(--card, #fff)"/></svg>',
  produtividade: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="17" x2="17" y2="17"/><rect x="4.5" y="10" width="3" height="7"/><rect x="8.5" y="6" width="3" height="11"/><rect x="12.5" y="3" width="3" height="14"/></svg>',
  empresas: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 17.5v-12l7-2v14"/><path d="M10.5 8.5h6v9"/><line x1="6" y1="7.5" x2="8" y2="7.5"/><line x1="6" y1="10.5" x2="8" y2="10.5"/><line x1="6" y1="13.5" x2="8" y2="13.5"/><line x1="2.5" y1="17.5" x2="17.5" y2="17.5"/></svg>',
  avisos: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3c-2.5 0-4 2-4 4.5V11l-1.5 2.5h11L14 11V7.5C14 5 12.5 3 10 3z"/><path d="M8 15.5a2 2 0 0 0 4 0"/></svg>',
};

// Os ícones da versão nova são os das telas que cada área reúne.
for (const a of TODAS_AS_AREAS) ICONES[a.id] = ICONES[a.icone];

const MENU_GESTAO = [
  ['reuniao', 'Iniciar reunião', 'destaque'],
  ['#Acompanhamento'],
  ['painel', 'Painel da semana'],
  ['agenda', 'Agenda'],
  ['produtividade', 'Produtividade'],
  ['#Ações'],
  ['direcionar', 'Direcionar ação'],
  ['acoes', 'Ações'],
  ['prazos', 'Pedidos de prazo'],
  ['#Reunião'],
  ['combinados', 'Combinados'],
  ['reunioes', 'Reuniões e atas'],
  ['#Organização', 'diretor'],
  ['estrutura', 'Configuração', '', 'diretor'],
  ['configuracao', 'Configuração', '', 'apoio'],
  ['avisos', 'Avisos', '', 'diretor'],
];
const MENU_CHEFE = [
  ['#Hoje'],
  ['inicio', 'Início'],
  ['gestao', 'Painel de gestão'],
  ['agenda', 'Agenda'],
  ['#Meu trabalho'],
  ['minhas-acoes', 'Minhas ações'],
  ['diario', 'Diário'],
  ['direcionar', 'Direcionar ação'],
  ['atualizacao', 'Minha atualização'],
  ['equipe', 'Minha equipe'],
  ['#Acompanhamento'],
  ['produtividade', 'Produtividade'],
  ['historico', 'Histórico'],
  ['#Reunião'],
  ['combinados', 'Combinados'],
  ['atas', 'Reuniões e atas'],
  ['reuniao-config', 'Configuração da reunião'],
];
// Membro da equipe: lê as ações da sua seção e executa as que o chefe atribuiu a ele (ou que ele criou).
const MENU_MEMBRO = [['#Minha seção'], ['minhas-acoes', 'Minhas ações'], ['diario', 'Meu diário'], ['agenda', 'Agenda'], ['atas', 'Atas']];
// Consulta: só lê as ações dos Centros.
// Plataforma: cria e administra as empresas.
const MENU_PLATAFORMA = [['#Plataforma'], ['empresas', 'Empresas']];
const menuConsulta = () => [['#Consulta'], ['acoes-centros', `Ações ${dosPlural('centro')}`], ['agenda', 'Agenda']];
// O Administrador tem acesso total às abas de Configuração.
const MENU_ADMIN = MENU_GESTAO.map((m) => (m[0] === '#Organização' ? ['#Administração'] : m[0] === 'estrutura' ? ['estrutura', 'Configuração'] : m[0] === 'avisos' ? ['avisos', 'Avisos'] : m));
const PERFIL = PERFIL_DA_EMPRESA;
// O suplente (segundo Chefe da seção, marcado pelo servidor em `user.suplente`) aparece como "Suplente de seção", e não como "Chefe de seção".
const rotuloDoPerfil = (u) => (u.suplente ? 'Suplente de seção' : PERFIL[u.perfil]);
// Selos do menu, com a contagem que vem no bootstrap: pedidos de prazo pendentes (gestão) e ações recebidas
// que a pessoa ainda não abriu (chefe e Diretoria Adjunta).
const SELOS = { prazos: [['pedidos_pendentes'], 'pedidos de prazo pendentes'], 'minhas-acoes': [['acoes_novas', 'acoes_a_validar'], 'ações novas ou aguardando a sua validação'] };
// A área Ações da versão nova carrega o selo da tela principal de cada perfil: ações novas do chefe, pedidos de prazo da gestão.
Object.defineProperty(SELOS, 'a-acoes', { get: () => (est.user?.perfil === 'chefe' ? SELOS['minhas-acoes'] : SELOS.prazos) });
SELOS['a-meudia'] = SELOS['minhas-acoes'];
const selo = (rota) => (SELOS[rota] ? `<span class="selo oculto" data-selo="${rota}" title="${SELOS[rota][1]}"></span>` : '');
const app = document.getElementById('app');

function lerRota() {
  const h = (location.hash || '#/').slice(2);
  const [caminho, qs] = h.split('?');
  const [rota, id] = caminho.split('/');
  return { rota, id, q: new URLSearchParams(qs || '') };
}
// Início da seção também é a tela de entrada do Administrador da Diretoria Adjunta (mesma tela do chefe).
const casaDe = () => (est.user.perfil === 'plataforma' ? '#/empresas' : est.user.perfil === 'consulta' ? '#/acoes-centros' : est.user.perfil === 'membro' ? (novaAtiva() ? casaNovaInterface('membro') : '#/minhas-acoes')
  : novaAtiva() ? casaNovaInterface(est.user.perfil) : est.user.perfil === 'chefe' || (est.user.perfil === 'administrador' && est.boot?.secao?.tipo === DIRETORIA_ADJUNTA) ? '#/inicio' : '#/painel');


// O bootstrap (usuário, semana, selo) muda pouco: reaproveitá-lo poupa uma ida ao servidor a cada troca de tela.
// É refeito depois de 30 s, de qualquer gravação, de novo login ou troca de usuário.
const VALIDADE_BOOT_MS = 30_000;
let boot = { em: 0, mutacoes: -1, geracao: -1 };
async function carregarSessao() {
  const fresco = est.boot && est.user && boot.geracao === sessao.geracao && boot.mutacoes === versao.mutacoes && Date.now() - boot.em < VALIDADE_BOOT_MS;
  if (fresco) return;
  const geracao = sessao.geracao, mutacoes = versao.mutacoes;
  atualizarSessao(await get('/bootstrap'));
  boot = { em: Date.now(), mutacoes, geracao };
}

// Tela para onde voltar depois de um novo login causado por sessão expirada.
let retorno = null;

/** Empresa escolhida na demonstração: a do endereço (`?empresa=slug`), a lembrada do último acesso ou a única que existe. */
const empresaDoEndereco = () => (new URLSearchParams(location.search).get('empresa') || '').trim().toLowerCase().slice(0, 60);
function escolherEmpresa({ empresas, escolhida }) {
  const pedida = empresaDoEndereco();
  if (pedida && escolhida) return escolhida.slug;
  const lembrada = empresaLembrada();
  if (empresas.some((e) => e.slug === lembrada)) return lembrada;
  return empresas.length === 1 ? empresas[0].slug : '';
}

async function telaEntrada({ expirada = false } = {}) {
  document.body.classList.remove('tv');
  if (!expirada) retorno = null;
  if (await modoAuth() === 'supabase') {
    app.innerHTML = `<div class="entrada"><div class="entrada-caixa estreita">
      <img src="/imagens/logo-agilis.png" alt="Agilis" class="entrada-logo">
      <p class="entrada-tag">Acompanhamento semanal</p>
      <h1>Bem-vindo ao Agilis</h1>
      <p class="lema">Entre com seu e-mail e senha.</p>
      ${expirada ? '<div class="info" role="status">Sua sessão expirou. Entre novamente para continuar de onde parou; rascunhos não enviados foram mantidos.</div>' : ''}
      <form id="login-senha">
        <div class="campo"><label for="login-email">E-mail</label>
        <input id="login-email" name="email" type="email" autocomplete="username" maxlength="254" required></div>
        <div class="campo"><label for="login-password">Senha</label>
        <div class="senha-com-olho"><input id="login-password" name="senha" type="password" autocomplete="current-password" maxlength="1024" required>
        <button type="button" class="senha-olho" id="mostrar-senha" aria-label="Mostrar senha" aria-controls="login-password" aria-pressed="false" title="Mostrar senha"><svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>
        <p id="login-erro" role="alert" aria-live="polite"></p>
        <button class="btn btn-primario btn-entrar" type="submit">Entrar <span aria-hidden="true">→</span></button>
      </form><p class="login-ajuda">Para solicitar acesso ou redefinir sua senha, contate o administrador do Agilis.</p>
      </div></div>`;
    const form = $('#login-senha');
    $('#mostrar-senha').addEventListener('click', (e) => {
      const campo = $('#login-password');
      const mostrar = campo.type === 'password';
      campo.type = mostrar ? 'text' : 'password';
      e.currentTarget.setAttribute('aria-pressed', String(mostrar));
      e.currentTarget.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
      e.currentTarget.title = mostrar ? 'Ocultar senha' : 'Mostrar senha';
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const botao = form.querySelector('button[type=submit]');
      if (botao.disabled) return;
      botao.disabled = true;
      botao.textContent = 'Entrando…';
      const erro = form.querySelector('#login-erro');
      erro.textContent = '';
      try {
        // O órgão é descoberto pela conta: só e-mail e senha.
        await entrarSenha(form.elements.email.value, form.elements.senha.value);
        form.elements.senha.value = '';
        est.user = null;
        location.hash = retorno || '#/';
        retorno = null;
        await render();
      } catch (err) {
        form.elements.senha.value = '';
        erro.textContent = err.message;
        form.elements.senha.focus();
      } finally { botao.disabled = false; botao.textContent = 'Entrar'; }
    });
    return;
  }
  const lista = await empresasDaEntrada(empresaDoEndereco()).catch(() => ({ empresas: [], escolhida: null }));
  const pedidaDemo = escolherEmpresa(lista);
  const demo = await fetch(`/api/usuarios-demo${pedidaDemo ? `?empresa=${encodeURIComponent(pedidaDemo)}` : ''}`).then((r) => r.json());
  const us = demo.usuarios;
  const slugDemo = demo.empresa || pedidaDemo;
  const nomeDemo = lista.empresas.find((e) => e.slug === slugDemo)?.nome || lista.escolhida?.nome || '';
  const trocaEmpresa = lista.empresas.length > 1
    ? `<div class="grupo-titulo">Empresa</div><div class="perfis">${[...lista.empresas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((e) => `<button class="perfil${e.slug === slugDemo ? ' ativo' : ''}" data-empresa="${esc(e.slug)}" aria-pressed="${e.slug === slugDemo}"><b>${esc(e.nome)}</b></button>`).join('')}</div>` : '';
  const card = (u) => `<button class="perfil" data-u="${u.id}"><b>${esc(u.nome)}</b><span>${['chefe', 'membro'].includes(u.perfil) ? esc(u.secao_nome || 'Sem seção atribuída') : PERFIL[u.perfil]}</span></button>`;
  app.innerHTML = `<div class="entrada"><div class="entrada-caixa">
    <img src="/imagens/logo-agilis.png" alt="Agilis" class="entrada-logo">
    <p class="entrada-tag">Protótipo de demonstração</p>
    <h1>Bem-vindo ao Agilis</h1>
    <p class="lema">Acompanhamento semanal${nomeDemo ? ` — ${esc(nomeDemo)}` : ''}.</p>
    <div class="info">Protótipo com dados fictícios. Escolha um perfil para explorar; não há senha nesta versão.</div>
    ${trocaEmpresa}
    ${us.length ? '' : '<div class="info">Esta empresa ainda não tem usuários cadastrados.</div>'}
    ${us.length ? `<div class="grupo-titulo">Diretor e Apoio</div><div class="perfis">${us.filter((u) => !['chefe', 'membro'].includes(u.perfil)).map(card).join('')}</div>
    <div class="grupo-titulo">Chefes de seção</div><div class="perfis">${us.filter((u) => u.perfil === 'chefe').map(card).join('')}</div>` : ''}
    ${us.some((u) => u.perfil === 'membro') ? `<div class="grupo-titulo">Membros da equipe</div><div class="perfis">${us.filter((u) => u.perfil === 'membro').map(card).join('')}</div>` : ''}</div></div>`;
}

// Delegação única no contêiner #app: vale para a tela de entrada, sem acumular ouvintes.
on(app, 'click', '[data-empresa]', async (el) => {
  if (sessao.userId) return;
  lembrarEmpresa(el.dataset.empresa);
  await telaEntrada();
});
on(app, 'click', '[data-u]', async (el) => {
  if (sessao.userId) return;
  entrar(el.dataset.u);
  location.hash = '#/';
  await render();
});

// ---------- Instalar como aplicativo ----------
// O navegador dispara este evento quando o Agilis cumpre os requisitos de instalação (manifesto + service
// worker). Guardamos o evento para oferecer o botão só quando a instalação for realmente possível.
const rodandoComoApp = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
let promptInstalar = null;
const atualizarBotaoInstalar = () => {
  const botao = $('#instalar-app');
  botao?.classList.toggle('oculto', !promptInstalar || rodandoComoApp());
};
window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  promptInstalar = ev;
  atualizarBotaoInstalar();
});
window.addEventListener('appinstalled', () => {
  promptInstalar = null;
  atualizarBotaoInstalar();
  toast('Agilis instalado. Você já pode abri-lo como um aplicativo.');
});
on(app, 'click', '#instalar-app', async () => {
  if (!promptInstalar) return;
  promptInstalar.prompt();
  await promptInstalar.userChoice;
  promptInstalar = null;
  atualizarBotaoInstalar();
});

function casca() {
  const u = est.user;
  // Quem é da Diretoria Adjunta (Administrador vinculado a ela) cria e acompanha as ações da seção e envia o relato semanal.
  const daDiretoriaAdjunta = u.perfil === 'administrador' && est.boot?.secao?.tipo === DIRETORIA_ADJUNTA;
  // O chefe com a permissão do Diretor ganha "Ações dos Centros", logo abaixo das próprias ações.
  const chefe = lePorTodosOsCentros() ? MENU_CHEFE.flatMap((m) => (m[0] === 'minhas-acoes' ? [m, ['acoes-centros', `Ações ${dosPlural('centro')}`]] : [m])) : MENU_CHEFE;
  const base = u.perfil === 'chefe' ? (u.acesso_configuracao ? [...chefe, ['#Administração'], ['estrutura', 'Configuração']] : chefe) : u.perfil === 'administrador' ? MENU_ADMIN : u.perfil === 'consulta' ? menuConsulta() : u.perfil === 'membro' ? MENU_MEMBRO : u.perfil === 'plataforma' ? MENU_PLATAFORMA : MENU_GESTAO;
  const menuAntigo = [...(daDiretoriaAdjunta ? [[`#${est.boot.secao.sigla || 'Diretoria Adjunta'}`], ['inicio', 'Início da seção'], ['minhas-acoes', 'Minhas ações'], ['equipe', 'Minha equipe'], ['atualizacao', 'Minha atualização']] : []), ...base]
    .filter((m) => !m[3] || m[3] === u.perfil).filter((m) => !(m[0].startsWith('#') && m[1] && m[1] !== u.perfil))
    .filter((m) => !(m[0] === 'direcionar' && u.perfil === 'chefe' && !est.boot?.secao?.tem_subsecoes)); // o chefe só direciona se tem subseções
  const menu = novaAtiva() ? menuNovaInterface(areasAtuais()) : menuAntigo;
  app.innerHTML = `<div class="app${menuRecolhido() ? ' menu-recolhido' : ''}"><aside class="lateral">
    <div class="marca"><div class="marca-bloco"><img src="/imagens/logo-agilis.png" alt="Agilis" class="marca-logo"><img src="/imagens/favicon-32.png" alt="Agilis" class="marca-icone" width="32" height="32">${est.boot?.empresa ? `<div class="marca-empresa" title="${esc(est.boot.empresa.nome)}">${esc(est.boot.empresa.sigla || est.boot.empresa.nome)}</div>` : ''}</div><button type="button" class="menu-recolher" id="menu-recolher" aria-controls="menu-principal" aria-expanded="true" aria-label="Recolher menu" title="Recolher menu"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="12.5,4.5 7,10 12.5,15.5"/></svg></button></div>
    <nav class="menu" id="menu-principal" aria-label="Principal">${menu.map((m) => m[0].startsWith('#')
      ? `<div class="grupo"><b>${esc(m[0].slice(1))}</b></div>`
      : `<a href="#/${m[0]}" data-rota="${m[0]}" class="${m[2] === 'destaque' ? 'destaque' : ''}"><span class="menu-rotulo">${ICONES[m[0]] || ''}<span class="menu-texto">${esc(m[1])}</span></span>${selo(m[0])}</a>`).join('')}</nav>
    <div class="usuario"><button type="button" class="usuario-mini" id="usuario-mini" aria-label="${esc(iniciais(u.nome))}, expandir o menu para ver a conta" title="Expandir o menu">${esc(iniciais(u.nome))}</button><div class="usuario-detalhe"><b>${esc(u.nome)}</b>${rotuloDoPerfil(u)}${est.boot?.secao?.tipo === DIRETORIA_ADJUNTA ? ` · ${esc(est.boot.secao.sigla || est.boot.secao.nome)}` : ''}<br><span class="usuario-acoes">${temTutorial(u.perfil) ? '<button class="btn btn-fantasma btn-mini" id="tutorial-guiado">Tutorial</button>' : ''}${recebeAvisos(u.perfil) ? '<button class="btn btn-fantasma btn-mini" id="avisos-celular">Avisos no celular</button>' : ''}${sessao.modo === 'demo' ? '' : '<button class="btn btn-fantasma btn-mini" id="alterar-senha">Alterar senha</button>'}${temNovaInterface(u.perfil) ? `<button class="btn btn-fantasma btn-mini" id="alternar-interface">${novaAtiva() ? 'Voltar à versão atual' : 'Experimentar a versão nova'}</button>` : ''}<button class="btn btn-fantasma btn-mini" id="sair">${sessao.modo === 'demo' ? 'Trocar usuário' : 'Sair'}</button></span>
      <button class="btn btn-fantasma btn-mini oculto" id="instalar-app" style="margin-top:6px">Instalar aplicativo</button></div></div></aside>
    <main class="principal"><div id="trilho"></div><div id="conteudo"></div></main>
    ${cascaMovel(u, menu)}</div>`;
  atualizarBotaoInstalar();
  ligarMenuRetratil();
  document.title = est.boot?.empresa ? `Agilis · ${est.boot.empresa.sigla || est.boot.empresa.nome}` : 'Agilis';
  $('#alterar-senha')?.addEventListener('click', () => abrirTrocaSenha());
  $('#avisos-celular')?.addEventListener('click', () => abrirAvisosNoCelular(u.id));
  $('#tutorial-guiado')?.addEventListener('click', (ev) => abrirTutorial(ev.currentTarget));
  $('#alternar-interface')?.addEventListener('click', () => alternarInterface());
  iniciarLembretesDoApp(u.perfil); // lembretes da semana enquanto o app estiver aberto (sem agendador)
  if (recebeAvisos(u.perfil)) restaurarAvisos(u.id); // se a pessoa já ativou neste aparelho, religa em silêncio
  $('#sair').addEventListener('click', async () => {
    try { pararLembretesDoApp(); await esquecerAvisosAoSair(); await sair(); est.user = null; est.boot = null; location.hash = '#/'; render(); }
    catch (e) { toast(e.message); }
  });
  ligarCascaMovel();
}

// ---------- Celular (até 760 px): barra de topo, abas inferiores e folha "Mais" ----------
// No computador estes elementos ficam escondidos e a lateral continua igual. As abas trazem as telas mais usadas
// de cada perfil, ao alcance do polegar; "Mais" reúne o resto do menu e a conta.
const ABAS_MOVEL = {
  chefe: [['inicio', 'Início'], ['minhas-acoes', 'Ações'], ['atualizacao', 'Atualização'], ['agenda', 'Agenda']],
  gestao: [['painel', 'Painel'], ['agenda', 'Agenda'], ['acoes', 'Ações'], ['prazos', 'Prazos']],
  consulta: [['acoes-centros', 'Ações'], ['agenda', 'Agenda']],
  membro: [['minhas-acoes', 'Ações'], ['agenda', 'Agenda']],
  plataforma: [['empresas', 'Empresas']],
};
const ICONE_MAIS = '<svg viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="4.5" cy="10" r="1.2"/><circle cx="10" cy="10" r="1.2"/><circle cx="15.5" cy="10" r="1.2"/></svg>';
// Iniciais do primeiro e do último nome, sem parênteses, partículas nem posto/graduação
// ("Ten Cel PM Lucius Moabe" → LM, "Diretor (demonstração)" → DD, "Ana Ribeiro" → AR).
const NAO_NOME = new Set(['sd', 'cb', 'sgt', 'subten', 'st', 'ten', 'cap', 'maj', 'cel', 'gen', 'asp', 'al', 'pm', 'bm', 'dr', 'dra', 'sr', 'sra']);
const iniciais = (nome) => {
  const partes = nome.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter((p) => p.length > 2 && !NAO_NOME.has(p.toLowerCase()));
  const escolhidas = partes.length > 1 ? [partes[0], partes.at(-1)] : partes;
  return escolhidas.map((p) => p[0]).join('').toUpperCase() || nome.trim()[0]?.toUpperCase() || '?';
};

function cascaMovel(u, menu) {
  const abas = novaAtiva() ? menuNovaInterface(areasAtuais()) : ABAS_MOVEL[['chefe', 'consulta', 'membro', 'plataforma'].includes(u.perfil) ? u.perfil : 'gestao'];
  const rotuloPerfil = `${rotuloDoPerfil(u)}${est.boot?.secao ? ` · ${esc(est.boot.secao.sigla || est.boot.secao.nome)}` : ''}`;
  return `<header class="topo-movel">
      <img src="/imagens/logo-agilis.png" alt="Agilis" class="topo-movel-logo">
      <button type="button" class="topo-movel-conta" data-abrir-mais aria-label="${esc(iniciais(u.nome))}, conta e mais opções">${esc(iniciais(u.nome))}</button>
    </header>
    <nav class="abas-movel" aria-label="Navegação principal">
      ${abas.map(([rota, rotulo]) => `<a href="#/${rota}" data-rota="${rota}">${ICONES[rota] || ''}<span>${rotulo}</span>${selo(rota)}</a>`).join('')}
      <button type="button" data-abrir-mais data-aba-mais>${ICONE_MAIS}<span>Mais</span></button>
    </nav>
    <dialog class="folha-mais" aria-label="Mais opções">
      <div class="folha-alca" aria-hidden="true"></div>
      <div class="folha-conta"><span class="topo-movel-conta" aria-hidden="true">${esc(iniciais(u.nome))}</span>
        <div><b>${esc(u.nome)}</b><div class="suave pequeno">${rotuloPerfil}</div></div></div>
      <nav class="folha-menu" aria-label="Todas as telas">${menu.map((m) => m[0].startsWith('#')
        ? `<div class="folha-grupo">${esc(m[0].slice(1))}</div>`
        : `<a href="#/${m[0]}" data-rota="${m[0]}">${ICONES[m[0]] || ''}<span>${esc(m[1])}</span>${selo(m[0])}</a>`).join('')}</nav>
      <div class="folha-acoes">
        ${sessao.modo === 'demo' ? '' : '<button type="button" class="btn btn-sec" data-conta="senha">Alterar senha</button>'}
        ${temTutorial(u.perfil) ? '<button type="button" class="btn btn-sec" data-conta="tutorial">Tutorial guiado</button>' : ''}
        ${recebeAvisos(u.perfil) ? '<button type="button" class="btn btn-sec" data-conta="avisos">Avisos no celular</button>' : ''}
        ${temNovaInterface(u.perfil) ? `<button type="button" class="btn btn-sec" data-conta="interface">${novaAtiva() ? 'Voltar à versão atual' : 'Experimentar a versão nova'}</button>` : ''}
        <button type="button" class="btn btn-sec oculto" data-conta="instalar">Instalar aplicativo</button>
        <button type="button" class="btn btn-sec" data-conta="sair">${sessao.modo === 'demo' ? 'Trocar usuário' : 'Sair'}</button>
        <button type="button" class="btn btn-fantasma" data-fechar-mais>Fechar</button>
      </div>
    </dialog>`;
}

// ---------- Menu retrátil (computador) ----------
// A lateral recolhe para uma coluna de ícones (rótulos só para leitor de tela, com dica ao passar o mouse). O estado fica neste
// navegador (localStorage, com try/catch); no celular a lateral não existe e o recolhimento não se aplica.
const CHAVE_MENU = 'agilis:menu';
const menuRecolhido = () => { try { return localStorage.getItem(CHAVE_MENU) === 'recolhido'; } catch { return false; } };
function ligarMenuRetratil() {
  const raiz = $('.app'), botao = $('#menu-recolher');
  if (!raiz || !botao) return;
  const aplicar = (recolhido, { gravar = true } = {}) => {
    raiz.classList.toggle('menu-recolhido', recolhido);
    botao.setAttribute('aria-expanded', String(!recolhido));
    botao.setAttribute('aria-label', recolhido ? 'Expandir menu' : 'Recolher menu');
    botao.title = recolhido ? 'Expandir menu' : 'Recolher menu';
    for (const a of raiz.querySelectorAll('.menu a')) { if (recolhido) a.title = a.textContent.trim(); else a.removeAttribute('title'); }
    if (gravar) { try { localStorage.setItem(CHAVE_MENU, recolhido ? 'recolhido' : 'aberto'); } catch { /* segue sem lembrar */ } }
  };
  aplicar(raiz.classList.contains('menu-recolhido'), { gravar: false });
  botao.addEventListener('click', () => aplicar(!raiz.classList.contains('menu-recolhido')));
  $('#usuario-mini')?.addEventListener('click', () => { aplicar(false); botao.focus(); });
}

function ligarCascaMovel() {
  const folha = $('.folha-mais');
  if (!folha) return;
  const fechar = () => folha.open && folha.close();
  // Ouvintes nos próprios botões (recriados com a casca), para não se acumularem em `app` a cada troca de perfil.
  for (const b of app.querySelectorAll('[data-abrir-mais]')) {
    b.addEventListener('click', () => {
      $('[data-conta="instalar"]', folha)?.classList.toggle('oculto', !promptInstalar);
      if (!folha.open) folha.showModal();
    });
  }
  folha.addEventListener('click', (ev) => {
    if (ev.target === folha || ev.target.closest('[data-fechar-mais], .folha-menu a')) fechar(); // toque fora da folha ou num link
  });
  on(folha, 'click', '[data-conta="senha"]', () => { fechar(); abrirTrocaSenha(); });
  on(folha, 'click', '[data-conta="instalar"]', () => { fechar(); $('#instalar-app')?.click(); });
  on(folha, 'click', '[data-conta="tutorial"]', () => { fechar(); abrirTutorial(document.querySelector('.topo-movel-conta')); });
  on(folha, 'click', '[data-conta="interface"]', () => { fechar(); alternarInterface(); });
  on(folha, 'click', '[data-conta="avisos"]', () => { fechar(); $('#avisos-celular')?.click(); });
  on(folha, 'click', '[data-conta="sair"]', () => { fechar(); $('#sair').click(); });
}

// As contagens vêm no bootstrap: não há requisição própria para os selos.
function atualizarSelo() {
  for (const s of document.querySelectorAll('[data-selo]')) {
    const n = SELOS[s.dataset.selo][0].reduce((total, chave) => total + (est.boot?.[chave] ?? 0), 0);
    s.textContent = n;
    s.classList.toggle('oculto', !n);
  }
}

/** Liga ou desliga a versão nova para esta pessoa (neste navegador) e volta à tela de entrada da versão escolhida. */
function alternarInterface() {
  definirNovaInterface(!novaInterfaceLigada());
  location.hash = casaDe();
  render();
}

let gen = 0;
// Barra fina de progresso enquanto a próxima tela carrega (aparece só se demorar mais de ~150 ms).
export async function render() {
  const minha = gen + 1;
  document.body.classList.add('carregando');
  try { await renderizar(); } finally { if (minha === gen) document.body.classList.remove('carregando'); }
}
async function renderizar() {
  const minha = ++gen;
  try {
    const modo = await modoAuth();
    if (minha !== gen) return;
    // Quem abre o link de uma ação sem ter entrado volta a ela depois de entrar.
    if (!est.user && /^#\/acao\/\d+/.test(location.hash) && !retorno) retorno = location.hash;
    if (modo === 'demo' && !sessao.userId) return await telaEntrada();
    await carregarSessao();
    if (minha !== gen) return;
    // Senha inicial provisória: nada funciona até a pessoa criar a própria.
    if (est.user.trocar_senha) return telaTrocaSenha(app, { aoConcluir: async () => { est.user = null; est.boot = null; location.hash = '#/'; await render(); }, aoSair: async () => { try { await sair(); } catch { /* segue */ } est.user = null; est.boot = null; location.hash = '#/'; render(); } });
    const { rota, id, q } = lerRota();
    const def = ROTAS[rota];
    if (!def || !def.perfis.includes(est.user.perfil) || (def.exige && !def.exige())) { location.hash = casaDe(); return; }
    if (novaAtiva()) { const destino = enderecoNaAreaNova(rota, id, q); if (destino) { location.replace(destino); return; } }
    document.title = `${def.titulo} · Agilis`;
    const refresh = async () => { const y = window.scrollY; await render(); window.scrollTo(0, y); };
    if (def.tv?.({ id })) {
      document.body.classList.add('tv');
      app.innerHTML = '<div class="tv-app" id="tv"></div>';
      await def.f($('#tv'), { id, q, refresh });
      return;
    }
    document.body.classList.remove('tv');
    // A casca muda com o perfil e com a consulta aos outros Centros (o menu ganha "Ações dos Centros").
    const chaveCasca = `${est.user.perfil}:${lePorTodosOsCentros() ? 1 : 0}:${est.boot?.secao?.tem_subsecoes ? 1 : 0}:${novaAtiva() ? 'n' : 'a'}`;
    if (!$('.app') || $('.app')?.dataset.perfil !== chaveCasca) { casca(); $('.app').dataset.perfil = chaveCasca; }
    const areaAtual = novaAtiva() ? areaDaRota(areasAtuais(), rota) : null;
    for (const a of document.querySelectorAll('.menu a, .abas-movel a, .folha-menu a')) {
      const ativa = (areaAtual ? a.dataset.rota === areaAtual : false) || a.dataset.rota === rota || (rota === 'centro' && a.dataset.rota === 'painel') || (rota === 'pauta' && a.dataset.rota === 'painel') || (['reunioes-equipe', 'reuniao-equipe'].includes(rota) && a.dataset.rota === 'atas');
      if (ativa) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    // No celular, a aba "Mais" fica marcada quando a tela atual não tem aba própria.
    $('[data-aba-mais]')?.classList.toggle('ativa', !document.querySelector('.abas-movel a[aria-current]'));
    // O trilho completo (com a pista) só no Início e no Painel; nas demais telas, uma linha.
    $('#trilho').innerHTML = def.trilho ? trilho(est.user.perfil === 'chefe' ? { ...est.boot, rotulo_trilho: 'Reunião da organização' } : est.boot, { compacto: rota !== 'painel' && rota !== 'inicio' && rota !== 'a-hoje' }) + faixaPendente(est.boot, rota) : '';
    if (!$('#trilho').dataset.ligado) {
      $('#trilho').dataset.ligado = '1';
      on($('#trilho'), 'click', '[data-alterar-reuniao]', () => abrirAlterarReuniao(est.boot, () => refresh()));
    }
    const conteudo = $('#conteudo');
    const novo = document.createElement('div');
    novo.id = 'conteudo';
    await def.f(novo, { id, q, refresh });
    if (minha !== gen) return;
    conteudo.replaceWith(novo);
    atualizarSelo();
    convidarSeNovo(); // primeira vez da pessoa: oferece o tutorial guiado (uma vez, sem bloquear a tela)
    // Endereço com `?acao=ID` (link compartilhado ou página recarregada): abre a ficha, a menos que já esteja aberta.
    const idAcao = Number(q.get('acao'));
    if (idAcao && !acaoEstaAberta()) abrirAcao(idAcao, refresh).catch((e) => { toast(e.message, 'erro'); tirarAcaoDaUrl(); });
  } catch (e) {
    if (minha !== gen) return;
    if (e.status === 401) {
      const eraLogado = !!est.user;
      if (eraLogado && !retorno) retorno = location.hash;
      limparSessao(); est.user = null; est.boot = null;
      return telaEntrada({ expirada: eraLogado });
    }
    if (e.dados?.trocar_senha) { est.user = null; est.boot = null; return render(); }
    const alvo = $('#conteudo') || app;
    alvo.innerHTML = `<div class="cartao"><h2>Não foi possível abrir esta tela</h2><p>${esc(e.message)}</p><a class="btn btn-sec" href="${est.user ? casaDe() : '#/'}">Voltar ao início</a></div>`;
    console.error(e);
  }
}

window.addEventListener('hashchange', () => render());
// Uma tela que só recarrega os próprios dados (sem render) também mantém os selos do menu em dia.
window.addEventListener('sgc:selos', () => { if (est.user) carregarSessao().then(atualizarSelo).catch(() => { /* fica para a próxima tela */ }); });
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* segue sem instalação; a navegação comum continua funcionando */ });
