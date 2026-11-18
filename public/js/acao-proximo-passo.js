// O "próximo passo sugerido" da ficha da ação (versão nova): uma frase que diz o que faz sentido fazer agora, pelo que a ação já mostra.
// Puro (sem DOM nem rede), com teste em `test/acao-proximo-passo.test.js`. Só sugere: não muda status, semáforo, prazo nem nenhuma regra.

/**
 * @param {{ status?: string, encerrada?: boolean, arquivada?: boolean, atrasada?: boolean, parada?: boolean, prazo?: string,
 *   impedimento_critico?: boolean, impedimentos_abertos?: number, pedido_pendente?: boolean, aguardando_validacao?: string | null,
 *   checklist_total?: number, checklist_feitos?: number, tempo_total?: number, pode_executar?: boolean }} a
 * @param {{ leitura?: boolean, hoje?: string }} [contexto]
 * @returns {{ chave: string, texto: string } | null}  `null` quando não há o que sugerir (só leitura, ação encerrada ou arquivada)
 */
export function proximoPasso(a, { leitura = false, hoje = '' } = {}) {
  if (leitura || a.encerrada || a.arquivada) return null;
  if (a.aguardando_validacao) return { chave: 'validacao', texto: 'A ação foi concluída e aguarda validação ou aceite. Quem valida decide no aviso logo abaixo.' };
  if (a.status === 'concluida') return null;
  if (a.impedimento_critico) return { chave: 'critico', texto: 'Há um impedimento crítico aberto. Resolva-o ou peça apoio: enquanto ele estiver aberto, a seção fica em vermelho.' };
  if (a.atrasada) {
    const dias = hoje && a.prazo ? Math.max(1, Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${a.prazo}T12:00:00Z`)) / 86400000)) : 0;
    return { chave: 'atrasada', texto: `A ação está atrasada${dias ? ` há ${dias} dia${dias === 1 ? '' : 's'}` : ''}. Registre o andamento${a.pedido_pendente ? ' e aguarde a resposta ao pedido de novo prazo.' : ' e, se precisar de mais tempo, peça um novo prazo.'}` };
  }
  if (a.pedido_pendente) return { chave: 'pedido', texto: 'Há um pedido de novo prazo aguardando decisão. Enquanto isso, siga registrando o andamento.' };
  if (a.impedimentos_abertos) return { chave: 'impedimento', texto: 'Há um impedimento aberto. Veja se ele já pode ser resolvido ou se precisa de apoio.' };
  if (a.status === 'a_fazer') return { chave: 'comecar', texto: 'A ação ainda não começou. Mude o status para Em andamento e registre o que for fazendo.' };
  const total = a.checklist_total || 0;
  if (total && (a.checklist_feitos || 0) >= total && !(a.tempo_total || 0)) {
    return { chave: 'tempo', texto: 'Todas as tarefas estão feitas. Registre o tempo gasto para poder concluir a ação.' };
  }
  if (total && (a.checklist_feitos || 0) >= total) return { chave: 'concluir', texto: 'Todas as tarefas estão feitas. Se não falta mais nada, conclua a ação.' };
  if (a.parada) return { chave: 'parada', texto: 'Sem movimento há 7 dias ou mais. Registre o andamento ou diga o que está travando.' };
  if (total) return { chave: 'tarefas', texto: `Faltam ${total - (a.checklist_feitos || 0)} de ${total} tarefas. Marque as que já foram feitas e registre o andamento.` };
  return { chave: 'registrar', texto: 'Registre o andamento sempre que houver novidade, para quem acompanha ver o que aconteceu.' };
}
