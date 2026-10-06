-- PostgreSQL / Supabase. Exclui a reuniao, a ata e suas decisoes.
-- Preserva acoes, diretrizes e pedidos de prazo.
-- Aborta se nao houver exatamente uma reuniao ou se ela estiver em andamento.
BEGIN;

SELECT pg_advisory_xact_lock(7319, 2);

DO $$
DECLARE
  alvo record;
  quantidade integer := 0;
  reuniao_alvo_id integer;
  status_alvo text;
BEGIN
  FOR alvo IN
    SELECT id, status FROM public.reunioes
    WHERE data = '2026-10-02'
    FOR UPDATE
  LOOP
    quantidade := quantidade + 1;
    reuniao_alvo_id := alvo.id;
    status_alvo := alvo.status;
  END LOOP;

  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'Esperada uma reuniao em 02/10/2026; encontradas: %.', quantidade;
  END IF;

  IF status_alvo = 'em_andamento' THEN
    RAISE EXCEPTION 'Encerre a reuniao % antes de exclui-la.', reuniao_alvo_id;
  END IF;

  DELETE FROM public.decisoes WHERE reuniao_id = reuniao_alvo_id;
  UPDATE public.diretrizes SET reuniao_id = NULL WHERE reuniao_id = reuniao_alvo_id;
  UPDATE public.pedidos_prazo SET reuniao_id = NULL WHERE reuniao_id = reuniao_alvo_id;
  DELETE FROM public.reunioes WHERE id = reuniao_alvo_id;

  RAISE NOTICE 'Reuniao % de 02/10/2026 excluida.', reuniao_alvo_id;
END;
$$;

COMMIT;
