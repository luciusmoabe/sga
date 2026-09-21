-- Agilis / Supabase PostgreSQL
-- ATENÇÃO: remove TODAS as ações, inclusive concluídas, encerradas e arquivadas,
-- e TODOS os comentários, lançamentos de tempo e pedidos de prazo associados.
-- Faça backup antes de executar e suspenda o uso do app durante a limpeza.
-- Execute o arquivo inteiro no SQL Editor do projeto correto, como administrador.
--
-- Preserva usuários, logins, seções, diretrizes, reuniões, atas, atualizações
-- semanais, decisões, combinados, configurações e migrações.
-- Atas e atualizações antigas podem continuar mencionando ações removidas.
-- Não reutiliza IDs e não remove dependências desconhecidas por CASCADE.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

truncate table
  public.acao_comentarios,
  public.tempo,
  public.pedidos_prazo,
  public.acoes
continue identity restrict;

select
  (select count(*) from public.acoes) as acoes_restantes,
  (select count(*) from public.acao_comentarios) as comentarios_restantes,
  (select count(*) from public.tempo) as tempos_restantes,
  (select count(*) from public.pedidos_prazo) as pedidos_restantes;

commit;
