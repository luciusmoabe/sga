// Regras de negócio compartilhadas entre o servidor (server/logic.js) e a interface.
// Fonte única: mudar aqui muda a API e a tela juntas. Sem dependências do DOM nem do Node.

export const STATUS = ['a_fazer', 'em_andamento', 'bloqueada', 'concluida'];

/** Mudanças de status permitidas a partir de cada status. */
export const TRANSICOES = {
  a_fazer: ['em_andamento'],
  em_andamento: ['bloqueada', 'concluida', 'a_fazer'],
  bloqueada: ['em_andamento'],
  concluida: ['em_andamento'],
};

export const PRIORIDADES = ['alta', 'media', 'baixa'];

/** Perfis de acesso. O Administrador tem acesso total: faz tudo o que o Diretor, o Apoio e o Chefe fazem e gerencia contas e estrutura. */
export const PERFIS = ['diretor', 'apoio', 'chefe', 'administrador'];
export const ROTULO_PERFIL = { diretor: 'Diretor', apoio: 'Apoio do Diretor', chefe: 'Chefe de seção', administrador: 'Administrador' };
export const TAM_SENHA = { min: 12, max: 128 };

/** Tipos de seção. A Diretoria Adjunta fica no primeiro nível, sem chefe nem subseções; no resto é acompanhada como
 *  as demais seções (ações, Painel, relato e reunião). Quem é dela tem o perfil Administrador. */
export const DIRETORIA_ADJUNTA = 'diretoria_adjunta';
export const TIPOS_SECAO = ['centro', 'coordenacao', 'subsecao', DIRETORIA_ADJUNTA];
export const ROTULO_TIPO = { centro: 'Centro', coordenacao: 'Coordenação', subsecao: 'Subseção', [DIRETORIA_ADJUNTA]: 'Diretoria Adjunta' };

/** Ação em curso sem nenhuma movimentação (status, tempo, checklist, impedimento, comentário, prazo) há este número
 *  de dias ou mais aparece como "sem atualização" para o chefe e na contagem do Diretor. Não muda o semáforo. */
export const DIAS_SEM_MOVIMENTO = 7;

/** Hora (no fuso de negócio) em que a semana fecha, no dia anterior à reunião. */
export const HORA_FECHAMENTO = 18;

/** Semáforo: quanto menor, mais urgente. */
export const ORDEM_COR = { vermelho: 0, amarelo: 1, verde: 2 };

/** Comparador para listar seções por necessidade: vermelhas primeiro, depois amarelas e verdes. */
export const porNecessidade = (a, b) => ORDEM_COR[a.cor] - ORDEM_COR[b.cor] || a.secao.id - b.secao.id;
