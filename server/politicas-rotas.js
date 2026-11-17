// Políticas de rota por perfil restrito, num só lugar. Cada uma é uma lista FECHADA: o que não está aqui responde 403 ao perfil,
// mesmo que a rota (atual ou futura) não confira o perfil. Quem pode o quê dentro de cada ação continua nas rotas
// (`executa`, `ehAutor`, `permissoes` em rotas-acoes.js). `test/politicas-rotas.test.js` lista o que cada perfil alcança em toda
// rota registrada: ao criar rota nova, o teste mostra se ela ficou aberta a algum perfil restrito e exige revisão consciente.
//
// Formato: [método, expressão do caminho dentro de /api]. Método '*' vale para qualquer um.
// Entrar, sair e trocar a senha são atendidos antes (instalarAuth) e não passam por aqui.

const CONSULTA = [
  ['GET', /^\/bootstrap$/], ['GET', /^\/acoes$/], ['GET', /^\/acoes\/\d+$/], ['GET', /^\/tarefas$/],
];

// Plataforma: administra as empresas e não toca em dados de negócio.
const PLATAFORMA = [
  ['GET', /^\/bootstrap$/], ['*', /^\/plataforma\//],
];

// Membro da equipe: lê as ações e tarefas da sua seção e age só no que é dele.
const MEMBRO = [
  ['GET', /^\/(bootstrap|secoes|tarefas|avisos\/atual)$/],
  ['GET', /^\/reunioes-equipe(\/\d+)?$/], // as atas das reuniões da equipe de que participou
  ['POST', /^\/reunioes-equipe\/\d+\/sugestoes$/], // e a sugestão de revisão dessas atas
  ['GET', /^\/acoes(\/\d+(\/(responsaveis|executores))?)?$/],
  ['POST', /^\/acoes$/],
  ['PATCH', /^\/acoes\/\d+$/],
  ['DELETE', /^\/acoes\/\d+$/],
  ['POST', /^\/acoes\/\d+\/(tempo|comentarios|vista|checklist|impedimentos|impedimentos\/\d+\/resolver|pontos-atencao|diario)$/],
  ['PATCH', /^\/acoes\/\d+\/(checklist|pontos-atencao)\/\d+$/],
  ['DELETE', /^\/acoes\/\d+\/checklist\/\d+$/],
];

export const POLITICAS = {
  consulta: { rotas: CONSULTA, negado: 'O perfil Consulta só permite ler as ações das unidades.' },
  plataforma: { rotas: PLATAFORMA, negado: 'O perfil Plataforma só administra as empresas.' },
  membro: { rotas: MEMBRO, negado: 'O seu perfil de membro da equipe não dá acesso a esta função. Fale com o chefe da seção.' },
};

/** `null` se o perfil não tem lista fechada; senão, se a rota está liberada a ele. */
export function liberadaParaPerfil(perfil, metodo, caminho) {
  const p = POLITICAS[perfil];
  if (!p) return null;
  return p.rotas.some(([m, rota]) => (m === '*' || m === metodo) && rota.test(caminho));
}
