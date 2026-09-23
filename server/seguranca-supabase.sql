-- Gerado de server/seguranca-supabase.js. Escopo: objetos Agilis no schema public.
begin;
do $seguranca$
declare tabela text; papel text; colunas text; sequencia text;
begin
  foreach tabela in array array['secoes', 'usuarios', 'diretrizes', 'acoes', 'acao_comentarios', 'tempo', 'pedidos_prazo', 'atualizacoes', 'combinados', 'config', 'reunioes', 'decisoes', 'impedimentos', 'schema_migrations', 'auth_identidades', 'auth_sessoes', 'auth_fluxos', 'auth_contas', 'auth_sessoes_senha', 'auth_tentativas'] loop
    if to_regclass(format('public.%I', tabela)) is null then continue; end if;
    execute format('alter table public.%I enable row level security', tabela);
    select string_agg(format('%I', column_name), ', ') into colunas from information_schema.columns
      where table_schema = 'public' and table_name = tabela;
    execute format('revoke all on table public.%I from public', tabela);
    execute format('revoke select (%s), insert (%s), update (%s), references (%s) on public.%I from public',
      colunas, colunas, colunas, colunas, tabela);
    foreach papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = papel) then
        execute format('revoke all on table public.%I from %I', tabela, papel);
        execute format('revoke select (%s), insert (%s), update (%s), references (%s) on public.%I from %I',
          colunas, colunas, colunas, colunas, tabela, papel);
      end if;
    end loop;
    if exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = tabela and column_name = 'id') then
      sequencia := pg_get_serial_sequence(format('public.%I', tabela), 'id');
      if sequencia is not null then
        execute format('revoke all on sequence %s from public', sequencia);
        foreach papel in array array['anon', 'authenticated'] loop
          if exists (select 1 from pg_roles where rolname = papel) then
            execute format('revoke all on sequence %s from %I', sequencia, papel);
          end if;
        end loop;
      end if;
    end if;
  end loop;
  if to_regprocedure('public.subarvore(integer)') is not null then
    revoke execute on function public.subarvore(integer) from public;
    foreach papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = papel) then
        execute format('revoke execute on function public.subarvore(integer) from %I', papel);
      end if;
    end loop;
  end if;
end $seguranca$;
commit;
