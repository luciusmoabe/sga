-- Diagnóstico SOMENTE LEITURA de um banco Agilis já existente (Supabase > SQL Editor > colar e executar).
--
-- Não altera nada: só consulta o catálogo e conta linhas. Não mostra nomes, e-mails, textos nem ids de pessoas,
-- apenas contagens, nomes de tabelas e o estado da estrutura. O resultado pode ser compartilhado.
-- Cada linha traz a seção, o item verificado e o resultado; "(tabela ausente)" significa que a tabela não existe.
-- Use antes de migrar, para decidir o procedimento (veja HOMOLOGACAO.md, etapa 3).

with consultas (ordem, secao, item, tabela, consulta) as (values
  -- Estrutura e versão
  (10, '1. Ambiente', 'PostgreSQL', null,
    'select version() as v'),
  (11, '1. Ambiente', 'Papel desta conexão (o SQL Editor usa o dono do banco)', null,
    'select current_user || '' | bypassrls='' || (select rolbypassrls::text from pg_roles where rolname = current_user) as v'),
  (20, '2. Migrações', 'Versões aplicadas (o código atual espera 1 a 8)', 'public.schema_migrations',
    'select coalesce(string_agg(id::text, '', '' order by id), ''nenhuma'') as v from public.schema_migrations'),
  (30, '3. Tabelas', 'Tabelas do esquema public e nº de linhas', null,
    'select coalesce(string_agg(t.table_name || '' = '' || (xpath(''/row/c/text()'', query_to_xml(format(''select count(*) as c from %I.%I'', t.table_schema, t.table_name), false, true, '''')))[1]::text, '', '' order by t.table_name), ''nenhuma'') as v from information_schema.tables t where t.table_schema = ''public'' and t.table_type = ''BASE TABLE'''),

  -- Usuários e perfis (regra do sistema: sempre haver um Diretor ativo)
  (40, '4. Usuários', 'Colunas de usuarios', 'public.usuarios',
    'select string_agg(column_name, '', '' order by ordinal_position) as v from information_schema.columns where table_schema = ''public'' and table_name = ''usuarios'''),
  (41, '4. Usuários', 'Restrição de perfil (a versão 8 acrescenta administrador)', 'public.usuarios',
    'select coalesce(string_agg(pg_get_constraintdef(c.oid), '' | ''), ''nenhuma'') as v from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace where n.nspname = ''public'' and t.relname = ''usuarios'' and c.contype = ''c'''),
  (42, '4. Usuários', 'Usuários por perfil', 'public.usuarios',
    'select coalesce(string_agg(perfil || '': '' || n, ''; '' order by perfil), ''(vazio)'') as v from (select perfil, count(*) n from public.usuarios group by perfil) t'),
  (43, '4. Usuários', 'Diretores ativos', 'public.usuarios',
    'select count(*)::text as v from public.usuarios where perfil = ''diretor'' and ativo = 1'),
  (44, '4. Usuários', 'Sem e-mail cadastrado', 'public.usuarios',
    'select count(*)::text as v from public.usuarios where email is null or trim(email) = '''''),
  (45, '4. Usuários', 'E-mails repetidos (ignorando maiúsculas)', 'public.usuarios',
    'select count(*)::text as v from (select lower(email) from public.usuarios where email is not null group by 1 having count(*) > 1) t'),
  (46, '4. Usuários', 'Seções com chefe que não existe', 'public.usuarios',
    'select count(*)::text as v from public.secoes s left join public.usuarios u on u.id = s.chefe_id where s.chefe_id is not null and u.id is null'),

  -- Contas de login
  (50, '5. Login', 'Contas vinculadas (auth_contas)', 'public.auth_contas',
    'select count(*)::text as v from public.auth_contas'),
  (51, '5. Login', 'Sessões gravadas (auth_sessoes_senha)', 'public.auth_sessoes_senha',
    'select count(*)::text as v from public.auth_sessoes_senha'),
  (52, '5. Login', 'Usuários no Supabase Auth (confirmados / total)', 'auth.users',
    'select count(*) filter (where email_confirmed_at is not null)::text || '' de '' || count(*)::text as v from auth.users'),

  -- Dados que podem impedir a migração (versão 2 cria índices únicos)
  (60, '6. Bloqueios de migração', 'Ações com mais de um pedido de prazo pendente', 'public.pedidos_prazo',
    'select count(*)::text as v from (select acao_id from public.pedidos_prazo where status = ''pendente'' group by acao_id having count(*) > 1) t'),
  (61, '6. Bloqueios de migração', 'Reuniões em andamento (só pode haver 1)', 'public.reunioes',
    'select count(*)::text as v from public.reunioes where status = ''em_andamento'''),
  (62, '6. Bloqueios de migração', 'Índices únicos já criados', null,
    'select coalesce(string_agg(indexname, '', ''), ''nenhum'') as v from pg_indexes where schemaname = ''public'' and indexname in (''uq_pedido_pendente_acao'', ''uq_reuniao_em_andamento'')'),

  -- Volume de dados (para saber se há dados de piloto ou reais)
  (70, '7. Volume', 'Ações (total)', 'public.acoes', 'select count(*)::text as v from public.acoes'),
  (71, '7. Volume', 'Atualizações semanais (total)', 'public.atualizacoes', 'select count(*)::text as v from public.atualizacoes'),
  (72, '7. Volume', 'Reuniões (total) e a mais recente', 'public.reunioes',
    'select count(*)::text || '' | mais recente: '' || coalesce(max(data), ''nenhuma'') as v from public.reunioes'),
  (73, '7. Volume', 'Registros de tempo (total)', 'public.tempo', 'select count(*)::text as v from public.tempo'),

  -- Segurança (as migrações 4 a 8 ligam RLS e revogam o acesso direto de anon/authenticated)
  (80, '8. Segurança', 'Tabelas com RLS ligada / total', null,
    'select count(*) filter (where c.relrowsecurity)::text || '' de '' || count(*)::text as v from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relkind = ''r'''),
  (81, '8. Segurança', 'Permissões de anon/authenticated nas tabelas public', null,
    'select coalesce(string_agg(distinct grantee || '': '' || privilege_type, '', ''), ''nenhuma'') as v from information_schema.role_table_grants where table_schema = ''public'' and grantee in (''anon'', ''authenticated'')'),
  (82, '8. Segurança', 'Tabelas cujo dono não é o papel desta conexão', null,
    'select coalesce(string_agg(tablename || '' ('' || tableowner || '')'', '', ''), ''nenhuma'') as v from pg_tables where schemaname = ''public'' and tableowner <> current_user')
)
select secao as "Seção", item as "Item",
       case when tabela is not null and to_regclass(tabela) is null then '(tabela ausente)'
            else coalesce((xpath('/row/v/text()', query_to_xml(consulta, false, true, '')))[1]::text, '(sem valor)')
       end as "Resultado"
from consultas
order by ordem;
