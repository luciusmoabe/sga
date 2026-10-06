-- PostgreSQL / Supabase: exclui uma sugestão de revisão da conta de teste.
-- Não executado automaticamente. Confira o resultado da consulta abaixo.
-- Preserva a ata, suas versões publicadas, a reunião e a conta do usuário.
-- Se a sugestão foi acolhida, esta exclusão não desfaz a alteração da ata.

SELECT s.id AS sugestao_id, r.data AS data_reuniao, u.email,
       s.tipo, s.texto, s.status, s.criada_em, s.resposta
FROM public.ata_sugestoes s
JOIN public.usuarios u ON u.id = s.usuario_id
JOIN public.reunioes r ON r.id = s.reuniao_id
WHERE lower(trim(u.email)) = 'fulano@pm.ba.gov.br'
ORDER BY s.criada_em DESC, s.id DESC;

-- Execute o bloco abaixo depois de conferir a sugestão.
-- Havendo mais de uma, preencha sugestao_alvo_id com o ID desejado.
BEGIN;

SELECT pg_advisory_xact_lock(7319, 2);

DO $excluir_teste$
DECLARE
  email_alvo constant text := 'fulano@pm.ba.gov.br';
  sugestao_alvo_id integer := NULL; -- Exemplo: 123. NULL exige uma única sugestão.
  usuario_alvo_id integer;
  reuniao_alvo_id integer;
  quantidade integer;
BEGIN
  SELECT count(*), min(id) INTO quantidade, usuario_alvo_id
  FROM public.usuarios WHERE lower(trim(email)) = email_alvo;

  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'Esperada uma conta para %; encontradas: %.', email_alvo, quantidade;
  END IF;

  SELECT count(*), min(s.id), min(s.reuniao_id)
  INTO quantidade, sugestao_alvo_id, reuniao_alvo_id
  FROM public.ata_sugestoes s
  WHERE s.usuario_id = usuario_alvo_id
    AND (sugestao_alvo_id IS NULL OR s.id = sugestao_alvo_id);

  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'Esperada uma sugestão de teste; encontradas: %. Confira a consulta e preencha sugestao_alvo_id.', quantidade;
  END IF;

  -- Mesmas travas usadas pelas alterações de ata na aplicação.
  PERFORM id FROM public.reunioes WHERE id = reuniao_alvo_id FOR UPDATE;
  DELETE FROM public.ata_sugestoes
  WHERE id = sugestao_alvo_id AND usuario_id = usuario_alvo_id;
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'A sugestão mudou durante a operação. Confira os registros novamente.';
  END IF;

  RAISE NOTICE 'Sugestão de teste % excluída da reunião %. Ata e versões preservadas.', sugestao_alvo_id, reuniao_alvo_id;
END;
$excluir_teste$;

COMMIT;
