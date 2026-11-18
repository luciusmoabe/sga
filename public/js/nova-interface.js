// Nova interface (proposta de simplificação, fase 1): em vez de 11 a 13 itens de menu, cada perfil abre quatro áreas, e cada área reúne
// as telas que já existem como abas. Nenhuma regra, rota de API ou dado muda: a área só compõe as telas atuais, que continuam
// funcionando pelos endereços de sempre. A escolha de usar a versão nova é de cada pessoa e fica neste navegador.
// Regras puras (sem DOM), com teste em `test/nova-interface.test.js`.

/** Perfis que já têm a versão nova. Os demais seguem com o menu atual até chegar a vez deles. */
export const PERFIS_NOVA_INTERFACE = ['chefe'];

const CHAVE = 'agilis:nova-interface';
export const temNovaInterface = (perfil) => PERFIS_NOVA_INTERFACE.includes(perfil);
export function novaInterfaceLigada() {
  try { return localStorage.getItem(CHAVE) === '1'; } catch { return false; }
}
export function definirNovaInterface(ligada) {
  try { if (ligada) localStorage.setItem(CHAVE, '1'); else localStorage.removeItem(CHAVE); } catch { /* sem armazenamento: vale só até recarregar */ }
}

/**
 * As áreas do chefe de seção. `abas` são nomes de rotas atuais (as telas em `ROTAS`); `rotulo` da aba, quando existe, sobrepõe o título da rota.
 * A primeira aba disponível abre por padrão. Uma aba some se a rota não vale para a pessoa (por exemplo, "Direcionar" sem subseções).
 */
export const AREAS_CHEFE = [
  { id: 'a-hoje', rotulo: 'Hoje', icone: 'inicio', abas: [{ rota: 'inicio' }] },
  { id: 'a-acoes', rotulo: 'Ações', icone: 'minhas-acoes', abas: [
    { rota: 'minhas-acoes', rotulo: 'Minhas ações' }, { rota: 'agenda' }, { rota: 'diario' }, { rota: 'direcionar', rotulo: 'Direcionar' }, { rota: 'acoes-centros' },
  ] },
  { id: 'a-semana', rotulo: 'Semana', icone: 'reunioes', abas: [
    { rota: 'atualizacao', rotulo: 'Atualização' }, { rota: 'atas', rotulo: 'Reuniões e atas' }, { rota: 'combinados' }, { rota: 'reuniao-config', rotulo: 'Ajustes da reunião' },
  ] },
  { id: 'a-equipe', rotulo: 'Equipe', icone: 'equipe', abas: [
    { rota: 'equipe', rotulo: 'Minha equipe' }, { rota: 'gestao', rotulo: 'Painel de gestão' }, { rota: 'produtividade' }, { rota: 'historico' },
  ] },
];

/** Rotas das telas internas que pertencem a uma área, além das abas (ex.: o detalhe de uma reunião da equipe fica na Semana). */
const EXTRAS = { 'a-semana': ['reunioes-equipe', 'reuniao-equipe'] };

/**
 * A área a que uma rota atual pertence (para marcar o menu), ou `null`.
 * @param {typeof AREAS_CHEFE} areas
 * @param {string} rota
 */
export function areaDaRota(areas, rota) {
  const a = areas.find((x) => x.id === rota || x.abas.some((b) => b.rota === rota) || (EXTRAS[x.id] || []).includes(rota));
  return a ? a.id : null;
}

/**
 * Abas de uma área que a pessoa pode abrir. `disponivel(rota)` diz se a rota vale para ela; `titulo(rota)` dá o título padrão da tela.
 * @param {{ abas: { rota: string, rotulo?: string }[] }} area
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

/** O menu e as abas do celular da versão nova: uma entrada por área. */
export const menuNovaInterface = (areas = AREAS_CHEFE) => areas.map((a) => [a.id, a.rotulo]);
