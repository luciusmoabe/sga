// Telas únicas de Combinados, Atas e Atualização: cada uma é a mesma para a organização e para a equipe da seção, e muda só a instância
// (ver `instancia.js`). O que cada instância desenha continua nos módulos de sempre; aqui só se escolhe a instância e se põe o seletor.
import { est } from './estado.js';
import { atas } from './atas.js';
import { atualizacao } from './atualizacao.js';
import { combinados } from './combinados.js';
import { comSeletor, instanciaDe } from './instancia.js';
import { combinadosEquipe, reunioesEquipe } from './reuniao-equipe.js';

const temEquipe = () => est.user.perfil === 'chefe' && !!est.user.secao_id;

/** Combinados: a organização (todos os perfis de gestão e o chefe) e a equipe da seção (o chefe). */
export async function combinadosUnico(raiz, p) {
  const disponiveis = ['organizacao', temEquipe() && 'equipe'].filter(Boolean);
  const atual = instanciaDe(p.q, disponiveis, 'organizacao');
  const corpo = comSeletor(raiz, 'combinados', disponiveis, atual);
  return atual === 'equipe' ? combinadosEquipe(corpo, p) : combinados(corpo, p);
}

/** Reuniões e atas do chefe e do membro: as atas da organização e as da equipe. O membro só participa da reunião da equipe. */
export async function atasUnico(raiz, p) {
  if (p.id) return p.q.get('i') === 'equipe' || est.user.perfil === 'membro' ? reunioesEquipe(raiz, p) : atas(raiz, p);
  const disponiveis = est.user.perfil === 'membro' ? ['equipe'] : ['organizacao', temEquipe() && 'equipe'].filter(Boolean);
  const atual = instanciaDe(p.q, disponiveis, 'organizacao');
  const corpo = comSeletor(raiz, 'atas', disponiveis, atual);
  return atual === 'equipe' ? reunioesEquipe(corpo, p) : atas(corpo, p);
}

/** Atualização semanal: para a reunião da organização e, na seção que tem chefe acima, também para a reunião dele. */
export async function atualizacaoUnica(raiz, p) {
  const disponiveis = ['organizacao', est.user.perfil === 'chefe' && est.boot?.secao?.tipo === 'subsecao' && 'equipe'].filter(Boolean);
  const atual = instanciaDe(p.q, disponiveis, 'organizacao');
  const corpo = comSeletor(raiz, 'atualizacao', disponiveis, atual, 'Atualização');
  return atual === 'equipe'
    ? atualizacao(corpo, p, { base: '/reunioes-equipe/atualizacao', destino: 'Para a reunião da equipe' })
    : atualizacao(corpo, p);
}
