// Nova interface (proposta de simplificação, fase 1): em vez de 11 a 13 itens de menu, cada perfil abre quatro áreas, e cada área reúne
// as telas que já existem como abas. Nenhuma regra, rota de API ou dado muda: a área só compõe as telas atuais, que continuam
// funcionando pelos endereços de sempre. A escolha de usar a versão nova é de cada pessoa e fica neste navegador.
// Regras puras (sem DOM), com teste em `test/nova-interface.test.js`.

/** Perfis que já têm a versão nova. Os demais seguem com o menu atual até chegar a vez deles. */
export const PERFIS_NOVA_INTERFACE = ['chefe', 'diretor', 'apoio', 'membro'];

const CHAVE = 'agilis:nova-interface';
export const temNovaInterface = (perfil) => PERFIS_NOVA_INTERFACE.includes(perfil);
export function novaInterfaceLigada() {
  try { return localStorage.getItem(CHAVE) === '1'; } catch { return false; }
}
export function definirNovaInterface(ligada) {
  try { if (ligada) localStorage.setItem(CHAVE, '1'); else localStorage.removeItem(CHAVE); } catch { /* sem armazenamento: vale só até recarregar */ }
}

/**
 * Uma área reúne telas atuais como abas. `abas` são nomes de rotas (as telas em `ROTAS` de main.js); `rotulo` da aba, quando existe,
 * sobrepõe o título da rota. A primeira aba disponível abre por padrão, e uma aba some se a rota não vale para a pessoa (por exemplo,
 * "Direcionar" para o chefe sem subseções). `extras` são rotas internas que pertencem à área sem serem abas (o detalhe de uma reunião).
 * `destaque` pinta o item do menu (o Modo Reunião do Diretor).
 * @typedef {{ id: string, rotulo: string, icone: string, abas: { rota: string, rotulo?: string }[], extras?: string[], destaque?: boolean }} Area
 */

/** @type {Area[]} */
export const AREAS_CHEFE = [
  { id: 'a-hoje', rotulo: 'Hoje', icone: 'inicio', abas: [{ rota: 'hoje' }] },
  { id: 'a-acoes', rotulo: 'Ações', icone: 'minhas-acoes', abas: [
    { rota: 'minhas-acoes', rotulo: 'Minhas ações' }, { rota: 'agenda' }, { rota: 'diario' }, { rota: 'direcionar', rotulo: 'Direcionar' }, { rota: 'acoes-centros' },
  ] },
  { id: 'a-semana', rotulo: 'Semana', icone: 'reunioes', extras: ['reunioes-equipe', 'reuniao-equipe'], abas: [
    { rota: 'atualizacao', rotulo: 'Atualização' }, { rota: 'atas', rotulo: 'Reuniões e atas' }, { rota: 'combinados' }, { rota: 'reuniao-config', rotulo: 'Ajustes da reunião' },
  ] },
  { id: 'a-equipe', rotulo: 'Equipe', icone: 'equipe', abas: [
    { rota: 'equipe', rotulo: 'Minha equipe' }, { rota: 'gestao', rotulo: 'Painel de gestão' }, { rota: 'produtividade' }, { rota: 'historico' },
  ] },
];

/** O Diretor e o Apoio: acompanham, direcionam e conduzem a reunião. O Apoio vê o que o perfil dele já alcança hoje. */
/** @type {Area[]} */
export const AREAS_GESTAO = [
  { id: 'a-painel', rotulo: 'Painel', icone: 'painel', extras: ['centro'], abas: [{ rota: 'painel', rotulo: 'Painel da semana' }, { rota: 'produtividade' }] },
  { id: 'a-acoes', rotulo: 'Ações', icone: 'minhas-acoes', abas: [
    { rota: 'acoes', rotulo: 'Todas as ações' }, { rota: 'direcionar', rotulo: 'Direcionar' }, { rota: 'prazos', rotulo: 'Pedidos de prazo' }, { rota: 'agenda' },
  ] },
  { id: 'a-reuniao', rotulo: 'Reunião', icone: 'reuniao', destaque: true, abas: [
    { rota: 'reuniao', rotulo: 'Iniciar reunião' }, { rota: 'pauta' }, { rota: 'combinados' }, { rota: 'reunioes', rotulo: 'Reuniões e atas' }, { rota: 'reuniao-config', rotulo: 'Ajustes da reunião' },
  ] },
];

/** O membro da equipe: o que ele executa e as atas. A agenda e o diário dele ficam dentro de "Meu dia". */
/** @type {Area[]} */
export const AREAS_MEMBRO = [
  { id: 'a-meudia', rotulo: 'Meu dia', icone: 'minhas-acoes', abas: [{ rota: 'minhas-acoes', rotulo: 'Minhas ações' }, { rota: 'agenda' }, { rota: 'diario', rotulo: 'Meu diário' }] },
  { id: 'a-atas', rotulo: 'Atas', icone: 'reunioes', abas: [{ rota: 'atas', rotulo: 'Atas' }], extras: ['reunioes-equipe', 'reuniao-equipe'] },
];

/** A área de Configuração: Diretor, Apoio e o chefe a quem o Diretor deu acesso (Estrutura e Avisos ficam aqui, fora do caminho diário). */
/** @type {Area} */
export const AREA_CONFIGURACAO = { id: 'a-config', rotulo: 'Configuração', icone: 'estrutura', abas: [{ rota: 'estrutura', rotulo: 'Estrutura e acessos' }, { rota: 'avisos' }] };

/**
 * As áreas do perfil, na ordem do menu. O chefe com acesso à configuração ganha também a área "Configuração".
 * @param {string} perfil
 * @param {{ acessoConfiguracao?: boolean }} [opcoes]
 * @returns {Area[]}
 */
export function areasDoPerfil(perfil, { acessoConfiguracao = false } = {}) {
  if (perfil === 'chefe') return acessoConfiguracao ? [...AREAS_CHEFE, AREA_CONFIGURACAO] : AREAS_CHEFE;
  if (perfil === 'diretor' || perfil === 'apoio') return [...AREAS_GESTAO, AREA_CONFIGURACAO];
  if (perfil === 'membro') return AREAS_MEMBRO;
  return [];
}

/** Todas as áreas que existem (para registrar uma rota por área), sem repetir o `id`. */
export const TODAS_AS_AREAS = [...AREAS_CHEFE, ...AREAS_GESTAO, ...AREAS_MEMBRO, AREA_CONFIGURACAO].filter((a, i, l) => l.findIndex((b) => b.id === a.id) === i);

/**
 * A área a que uma rota atual pertence (para marcar o menu), ou `null`.
 * @param {Area[]} areas
 * @param {string} rota
 */
export function areaDaRota(areas, rota) {
  const a = areas.find((x) => x.id === rota || x.abas.some((b) => b.rota === rota) || (x.extras || []).includes(rota));
  return a ? a.id : null;
}

/**
 * Abas de uma área que a pessoa pode abrir. `disponivel(rota)` diz se a rota vale para ela; `titulo(rota)` dá o título padrão da tela.
 * @param {Area} area
 * @param {(rota: string) => boolean} disponivel
 * @param {(rota: string) => string} titulo
 */
export function abasDaArea(area, disponivel, titulo) {
  return area.abas.filter((b) => disponivel(b.rota)).map((b) => ({ rota: b.rota, rotulo: b.rotulo || titulo(b.rota) }));
}

/** A aba aberta: a pedida em `?t=` se existir entre as disponíveis; senão a primeira. */
export function abaAtiva(abas, pedida) {
  return abas.find((b) => b.rota === pedida) || abas[0] || null;
}

/**
 * O menu (e as abas do celular) da versão nova: uma entrada por área, `[id, rótulo, 'destaque'?]`.
 * @param {Area[]} areas
 */
export const menuNovaInterface = (areas) => areas.map((a) => (a.destaque ? [a.id, a.rotulo, 'destaque'] : [a.id, a.rotulo]));

/** Para onde a pessoa vai ao entrar na versão nova. */
export const casaNovaInterface = (perfil) => (perfil === 'chefe' ? '#/a-hoje' : perfil === 'membro' ? '#/a-meudia' : '#/a-painel');
