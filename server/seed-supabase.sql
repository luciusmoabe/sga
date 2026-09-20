-- Script de carga de dados para Supabase PostgreSQL

-- Desabilitar RLS para que o backend/API gerencie as permissões
alter table if exists secoes disable row level security;
grant all on secoes to anon, authenticated, service_role;
alter table if exists usuarios disable row level security;
grant all on usuarios to anon, authenticated, service_role;
alter table if exists diretrizes disable row level security;
grant all on diretrizes to anon, authenticated, service_role;
alter table if exists acoes disable row level security;
grant all on acoes to anon, authenticated, service_role;
alter table if exists acao_comentarios disable row level security;
grant all on acao_comentarios to anon, authenticated, service_role;
alter table if exists tempo disable row level security;
grant all on tempo to anon, authenticated, service_role;
alter table if exists pedidos_prazo disable row level security;
grant all on pedidos_prazo to anon, authenticated, service_role;
alter table if exists atualizacoes disable row level security;
grant all on atualizacoes to anon, authenticated, service_role;
alter table if exists combinados disable row level security;
grant all on combinados to anon, authenticated, service_role;
alter table if exists config disable row level security;
grant all on config to anon, authenticated, service_role;
alter table if exists reunioes disable row level security;
grant all on reunioes to anon, authenticated, service_role;
alter table if exists decisoes disable row level security;
grant all on decisoes to anon, authenticated, service_role;

-- Limpar dados anteriores caso existam
truncate table decisoes cascade;
truncate table reunioes cascade;
truncate table config cascade;
truncate table combinados cascade;
truncate table atualizacoes cascade;
truncate table pedidos_prazo cascade;
truncate table tempo cascade;
truncate table acao_comentarios cascade;
truncate table acoes cascade;
truncate table diretrizes cascade;
truncate table usuarios cascade;
truncate table secoes cascade;

begin;
set constraints all deferred;

-- Tabela secoes (9 registros)
insert into secoes (id, nome, sigla, tipo, pai_id, ordem, ativa, chefe_id, criada_em) values (1, 'Centro de Planejamento e Gestão', 'CPG', 'centro', NULL, 1, 1, 3, '2026-07-17T09:00:00');
insert into secoes (id, nome, sigla, tipo, pai_id, ordem, ativa, chefe_id, criada_em) values (2, 'Centro de Planejamento Orçamentário e Financeiro', 'CPOF', 'centro', NULL, 2, 1, 4, '2026-07-17T09:00:00');
insert into secoes (id, nome, sigla, tipo, pai_id, ordem, ativa, chefe_id, criada_em) values (3, 'Centro de Monitoramento e Avaliação', 'CMA', 'centro', NULL, 3, 1, 5, '2026-07-17T09:00:00');
insert into secoes (id, nome, sigla, tipo, pai_id, ordem, ativa, chefe_id, criada_em) values (4, 'Centro de Captação de Recursos', 'CCR', 'centro', NULL, 4, 1, 6, '2026-07-17T09:00:00');
insert into secoes (id, nome, sigla, tipo, pai_id, ordem, ativa, chefe_id, criada_em) values (5, 'Centro Corporativo de Projetos', 'CCP', 'centro', NULL, 5, 1, 7, '2026-07-17T09:00:00');
insert into secoes (id, nome, sigla, tipo, pai_id, ordem, ativa, chefe_id, criada_em) values (6, 'Coordenação de Apoio Administrativo', 'CAA', 'coordenacao', NULL, 6, 1, 8, '2026-07-17T09:00:00');
insert into secoes (id, nome, sigla, tipo, pai_id, ordem, ativa, chefe_id, criada_em) values (7, 'Seção de Indicadores', 'IND', 'subsecao', 1, 1, 1, 9, '2026-07-17T09:00:00');
insert into secoes (id, nome, sigla, tipo, pai_id, ordem, ativa, chefe_id, criada_em) values (8, 'Seção de Mapeamento de Processos', 'MAP', 'subsecao', 3, 1, 1, NULL, '2026-07-17T09:00:00');
insert into secoes (id, nome, sigla, tipo, pai_id, ordem, ativa, chefe_id, criada_em) values (9, 'Núcleo de Painéis', 'PNL', 'subsecao', 7, 1, 1, NULL, '2026-07-17T09:00:00');

-- Tabela usuarios (9 registros)
insert into usuarios (id, nome, email, perfil, secao_id, ativo) values (1, 'Diretor (demonstração)', 'diretor.demonstracao@exemplo.invalid', 'diretor', NULL, 1);
insert into usuarios (id, nome, email, perfil, secao_id, ativo) values (2, 'Apoio do Diretor (demonstração)', 'apoio.do.diretor.demonstracao@exemplo.invalid', 'apoio', NULL, 1);
insert into usuarios (id, nome, email, perfil, secao_id, ativo) values (3, 'Ana Ribeiro', 'ana.ribeiro@exemplo.invalid', 'chefe', 1, 1);
insert into usuarios (id, nome, email, perfil, secao_id, ativo) values (4, 'Bruno Tavares', 'bruno.tavares@exemplo.invalid', 'chefe', 2, 1);
insert into usuarios (id, nome, email, perfil, secao_id, ativo) values (5, 'Carla Menezes', 'carla.menezes@exemplo.invalid', 'chefe', 3, 1);
insert into usuarios (id, nome, email, perfil, secao_id, ativo) values (6, 'Daniel Nogueira', 'daniel.nogueira@exemplo.invalid', 'chefe', 4, 1);
insert into usuarios (id, nome, email, perfil, secao_id, ativo) values (7, 'Elisa Prado', 'elisa.prado@exemplo.invalid', 'chefe', 5, 1);
insert into usuarios (id, nome, email, perfil, secao_id, ativo) values (8, 'Fábio Amaral', 'fabio.amaral@exemplo.invalid', 'chefe', 6, 1);
insert into usuarios (id, nome, email, perfil, secao_id, ativo) values (9, 'Gabriela Sena', 'gabriela.sena@exemplo.invalid', 'chefe', 7, 1);

-- Tabela diretrizes (6 registros)
insert into diretrizes (id, titulo, detalhe, destino, prazo, prioridade, criado_por, criado_em, reuniao_id) values (1, 'Enviar o plano de trabalho do próximo trimestre', 'Usar o modelo padrão do Departamento, com metas, responsáveis e marcos.', 'todos', '2026-09-29', 'alta', 1, '2026-09-15T11:00:00', NULL);
insert into diretrizes (id, titulo, detalhe, destino, prazo, prioridade, criado_por, criado_em, reuniao_id) values (2, 'Consolidar a proposta de remanejamento orçamentário', 'Consolidar os saldos por programa e indicar as fontes de cobertura.', 'especificos', '2026-09-17', 'alta', 1, '2026-09-15T11:00:00', NULL);
insert into diretrizes (id, titulo, detalhe, destino, prazo, prioridade, criado_por, criado_em, reuniao_id) values (3, 'Revisar o fluxo de aprovação de convênios', 'Mapear as etapas atuais e propor a redução de pontos de espera.', 'especificos', '2026-09-21', 'alta', 1, '2026-09-15T11:00:00', NULL);
insert into diretrizes (id, titulo, detalhe, destino, prazo, prioridade, criado_por, criado_em, reuniao_id) values (4, 'Atualizar o cadastro de contatos da seção', 'Conferir nomes, telefones e e-mails institucionais.', 'todos', '2026-09-13', 'media', 1, '2026-09-15T11:00:00', NULL);
insert into diretrizes (id, titulo, detalhe, destino, prazo, prioridade, criado_por, criado_em, reuniao_id) values (5, 'Publicar o painel de indicadores do mês', 'Painel validado com a Seção de Indicadores.', 'especificos', '2026-09-24', 'media', 1, '2026-09-15T11:00:00', NULL);
insert into diretrizes (id, titulo, detalhe, destino, prazo, prioridade, criado_por, criado_em, reuniao_id) values (6, 'Proposta de ajustes para a portaria 026', 'dsdsdsd', 'todos', '2026-09-26', 'media', 1, '2026-09-19T19:49:50.497Z', NULL);

-- Tabela acoes (25 registros)
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (1, 1, 1, NULL, 'Enviar o plano de trabalho do próximo trimestre', 'Usar o modelo padrão do Departamento, com metas, responsáveis e marcos.', 'em_andamento', '2026-09-29', '2026-09-29', 'alta', 0, 0, 0, NULL, '2026-09-15T11:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (2, 1, 2, NULL, 'Enviar o plano de trabalho do próximo trimestre', 'Usar o modelo padrão do Departamento, com metas, responsáveis e marcos.', 'a_fazer', '2026-09-29', '2026-09-29', 'alta', 0, 0, 0, NULL, '2026-09-15T11:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (3, 1, 3, NULL, 'Enviar o plano de trabalho do próximo trimestre', 'Usar o modelo padrão do Departamento, com metas, responsáveis e marcos.', 'em_andamento', '2026-09-29', '2026-09-29', 'alta', 0, 0, 0, NULL, '2026-09-15T11:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (4, 1, 4, NULL, 'Enviar o plano de trabalho do próximo trimestre', 'Usar o modelo padrão do Departamento, com metas, responsáveis e marcos.', 'concluida', '2026-09-29', '2026-09-29', 'alta', 0, 0, 0, '2026-09-18T16:00:00', '2026-09-15T11:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (5, 1, 5, NULL, 'Enviar o plano de trabalho do próximo trimestre', 'Usar o modelo padrão do Departamento, com metas, responsáveis e marcos.', 'a_fazer', '2026-09-29', '2026-09-29', 'alta', 0, 0, 0, NULL, '2026-09-15T11:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (6, 1, 6, NULL, 'Enviar o plano de trabalho do próximo trimestre', 'Usar o modelo padrão do Departamento, com metas, responsáveis e marcos.', 'em_andamento', '2026-09-29', '2026-09-29', 'alta', 0, 0, 0, NULL, '2026-09-15T11:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (7, 2, 2, NULL, 'Consolidar a proposta de remanejamento orçamentário', 'Consolidar os saldos por programa e indicar as fontes de cobertura.', 'em_andamento', '2026-09-17', '2026-09-17', 'alta', 0, 0, 0, NULL, '2026-09-15T11:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (8, 2, 1, NULL, 'Consolidar a proposta de remanejamento orçamentário', 'Consolidar os saldos por programa e indicar as fontes de cobertura.', 'concluida', '2026-09-17', '2026-09-17', 'alta', 0, 0, 0, '2026-09-18T16:00:00', '2026-09-15T11:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (9, 3, 3, NULL, 'Revisar o fluxo de aprovação de convênios', 'Mapear as etapas atuais e propor a redução de pontos de espera.', 'a_fazer', '2026-09-21', '2026-09-21', 'alta', 0, 0, 0, NULL, '2026-09-15T11:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (10, 4, 1, NULL, 'Atualizar o cadastro de contatos da seção', 'Conferir nomes, telefones e e-mails institucionais.', 'concluida', '2026-09-13', '2026-09-13', 'media', 0, 0, 1, '2026-09-18T16:00:00', '2026-09-15T11:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (11, 4, 2, NULL, 'Atualizar o cadastro de contatos da seção', 'Conferir nomes, telefones e e-mails institucionais.', 'concluida', '2026-09-13', '2026-09-13', 'media', 0, 0, 1, '2026-09-18T16:00:00', '2026-09-15T11:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (12, 4, 3, NULL, 'Atualizar o cadastro de contatos da seção', 'Conferir nomes, telefones e e-mails institucionais.', 'concluida', '2026-09-13', '2026-09-13', 'media', 0, 0, 0, '2026-09-18T16:00:00', '2026-09-15T11:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (13, 4, 4, NULL, 'Atualizar o cadastro de contatos da seção', 'Conferir nomes, telefones e e-mails institucionais.', 'concluida', '2026-09-13', '2026-09-13', 'media', 0, 0, 1, '2026-09-18T16:00:00', '2026-09-15T11:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (14, 4, 5, NULL, 'Atualizar o cadastro de contatos da seção', 'Conferir nomes, telefones e e-mails institucionais.', 'bloqueada', '2026-09-13', '2026-09-13', 'media', 0, 0, 0, NULL, '2026-09-15T11:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (15, 4, 6, NULL, 'Atualizar o cadastro de contatos da seção', 'Conferir nomes, telefones e e-mails institucionais.', 'concluida', '2026-09-13', '2026-09-13', 'media', 0, 0, 0, '2026-09-18T16:00:00', '2026-09-15T11:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (16, 5, 4, NULL, 'Publicar o painel de indicadores do mês', 'Painel validado com a Seção de Indicadores.', 'em_andamento', '2026-09-24', '2026-09-24', 'media', 0, 0, 0, NULL, '2026-09-15T11:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (17, NULL, 7, NULL, 'Padronizar as fichas de indicadores', 'Ação interna do Centro de Planejamento.', 'em_andamento', '2026-09-20', '2026-09-20', 'media', 1, 0, 0, NULL, '2026-09-15T09:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (18, NULL, 8, NULL, 'Mapear o processo de solicitação de diárias', 'Ação interna do Centro de Gestão de Processos.', 'em_andamento', '2026-09-18', '2026-09-18', 'media', 1, 0, 0, NULL, '2026-09-15T09:00:00', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (19, 6, 1, NULL, 'Proposta de ajustes para a portaria 026', 'dsdsdsd', 'a_fazer', '2026-09-26', '2026-09-26', 'media', 0, 0, 0, NULL, '2026-09-19T19:49:50.498Z', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (20, 6, 2, NULL, 'Proposta de ajustes para a portaria 026', 'dsdsdsd', 'a_fazer', '2026-09-26', '2026-09-26', 'media', 0, 0, 0, NULL, '2026-09-19T19:49:50.498Z', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (21, 6, 3, NULL, 'Proposta de ajustes para a portaria 026', 'dsdsdsd', 'a_fazer', '2026-09-26', '2026-09-26', 'media', 0, 0, 0, NULL, '2026-09-19T19:49:50.498Z', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (22, 6, 4, NULL, 'Proposta de ajustes para a portaria 026', 'dsdsdsd', 'a_fazer', '2026-09-26', '2026-09-26', 'media', 0, 0, 0, NULL, '2026-09-19T19:49:50.498Z', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (23, 6, 5, NULL, 'Proposta de ajustes para a portaria 026', 'dsdsdsd', 'a_fazer', '2026-09-26', '2026-09-26', 'media', 0, 0, 0, NULL, '2026-09-19T19:49:50.498Z', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (24, 6, 6, NULL, 'Proposta de ajustes para a portaria 026', 'dsdsdsd', 'a_fazer', '2026-09-26', '2026-09-26', 'media', 0, 0, 0, NULL, '2026-09-19T19:49:50.498Z', 0);
insert into acoes (id, diretriz_id, secao_id, acao_pai_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, compartilhada, encerrada, concluida_em, criada_em, arquivada) values (25, NULL, 1, NULL, 'Acao Teste do Chefe', NULL, 'a_fazer', '2026-09-26', '2026-09-26', 'alta', 0, 0, 0, NULL, '2026-09-19T20:19:02.354Z', 0);

-- Tabela acao_comentarios (25 registros)
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (1, 1, 1, 'Ação demandada pelo Diretor.', '2026-09-15T11:00:00');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (2, 2, 1, 'Ação demandada pelo Diretor.', '2026-09-15T11:00:00');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (3, 3, 1, 'Ação demandada pelo Diretor.', '2026-09-15T11:00:00');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (4, 4, 1, 'Ação demandada pelo Diretor.', '2026-09-15T11:00:00');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (5, 5, 1, 'Ação demandada pelo Diretor.', '2026-09-15T11:00:00');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (6, 6, 1, 'Ação demandada pelo Diretor.', '2026-09-15T11:00:00');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (7, 7, 1, 'Ação demandada pelo Diretor.', '2026-09-15T11:00:00');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (8, 8, 1, 'Ação demandada pelo Diretor.', '2026-09-15T11:00:00');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (9, 9, 1, 'Ação demandada pelo Diretor.', '2026-09-15T11:00:00');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (10, 10, 1, 'Ação demandada pelo Diretor.', '2026-09-15T11:00:00');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (11, 11, 1, 'Ação demandada pelo Diretor.', '2026-09-15T11:00:00');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (12, 12, 1, 'Ação demandada pelo Diretor.', '2026-09-15T11:00:00');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (13, 13, 1, 'Ação demandada pelo Diretor.', '2026-09-15T11:00:00');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (14, 14, 1, 'Ação demandada pelo Diretor.', '2026-09-15T11:00:00');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (15, 15, 1, 'Ação demandada pelo Diretor.', '2026-09-15T11:00:00');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (16, 16, 1, 'Ação demandada pelo Diretor.', '2026-09-15T11:00:00');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (17, 19, 1, 'Ação demandada pelo Diretor.', '2026-09-19T19:49:50.497Z');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (18, 20, 1, 'Ação demandada pelo Diretor.', '2026-09-19T19:49:50.497Z');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (19, 21, 1, 'Ação demandada pelo Diretor.', '2026-09-19T19:49:50.497Z');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (20, 22, 1, 'Ação demandada pelo Diretor.', '2026-09-19T19:49:50.497Z');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (21, 23, 1, 'Ação demandada pelo Diretor.', '2026-09-19T19:49:50.497Z');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (22, 24, 1, 'Ação demandada pelo Diretor.', '2026-09-19T19:49:50.497Z');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (23, 25, 3, 'Ação criada pela seção (Ana Ribeiro).', '2026-09-19T20:19:02.357Z');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (24, 25, 3, 'Ação arquivada.', '2026-09-19T20:20:50.537Z');
insert into acao_comentarios (id, acao_id, usuario_id, texto, criado_em) values (25, 25, 3, 'Ação desarquivada.', '2026-09-19T20:25:17.644Z');

-- Tabela tempo (13 registros)
insert into tempo (id, acao_id, usuario_id, data, minutos, criado_em) values (1, 1, 3, '2026-09-17', 90, '2026-09-17T15:00:00');
insert into tempo (id, acao_id, usuario_id, data, minutos, criado_em) values (2, 3, 5, '2026-09-17', 60, '2026-09-17T15:00:00');
insert into tempo (id, acao_id, usuario_id, data, minutos, criado_em) values (3, 4, 6, '2026-09-17', 180, '2026-09-17T15:00:00');
insert into tempo (id, acao_id, usuario_id, data, minutos, criado_em) values (4, 6, 8, '2026-09-17', 45, '2026-09-17T15:00:00');
insert into tempo (id, acao_id, usuario_id, data, minutos, criado_em) values (5, 7, 4, '2026-09-17', 150, '2026-09-17T15:00:00');
insert into tempo (id, acao_id, usuario_id, data, minutos, criado_em) values (6, 8, 3, '2026-09-17', 240, '2026-09-17T15:00:00');
insert into tempo (id, acao_id, usuario_id, data, minutos, criado_em) values (7, 10, 3, '2026-09-17', 45, '2026-09-17T15:00:00');
insert into tempo (id, acao_id, usuario_id, data, minutos, criado_em) values (8, 11, 4, '2026-09-17', 40, '2026-09-17T15:00:00');
insert into tempo (id, acao_id, usuario_id, data, minutos, criado_em) values (9, 12, 5, '2026-09-17', 50, '2026-09-17T15:00:00');
insert into tempo (id, acao_id, usuario_id, data, minutos, criado_em) values (10, 13, 6, '2026-09-17', 30, '2026-09-17T15:00:00');
insert into tempo (id, acao_id, usuario_id, data, minutos, criado_em) values (11, 14, 7, '2026-09-17', 35, '2026-09-17T15:00:00');
insert into tempo (id, acao_id, usuario_id, data, minutos, criado_em) values (12, 15, 8, '2026-09-17', 25, '2026-09-17T15:00:00');
insert into tempo (id, acao_id, usuario_id, data, minutos, criado_em) values (13, 16, 6, '2026-09-17', 120, '2026-09-17T15:00:00');

-- Tabela pedidos_prazo (1 registros)
insert into pedidos_prazo (id, acao_id, usuario_id, prazo_atual, novo_prazo, justificativa, status, criado_em, decidido_em, decidido_por, reuniao_id) values (1, 14, 7, '2026-09-13', '2026-09-26', 'Aguardamos o retorno de dois órgãos parceiros para concluir a conferência.', 'pendente', '2026-09-18T10:30:00', NULL, NULL, NULL);

-- Tabela atualizacoes (9 registros)
insert into atualizacoes (id, secao_id, semana, versao, feito, proximo, impedimentos, critico, apoio, usuario_id, enviada_em) values (1, 1, '2026-09-15', 1, '{"previstos":[],"extras":["Revisão das metas do PPA com a Assessoria"]}', '["Fechar o plano de trabalho do trimestre","Reunir a equipe de indicadores"]', '[]', 0, '', 3, '2026-09-21T15:20:00');
insert into atualizacoes (id, secao_id, semana, versao, feito, proximo, impedimentos, critico, apoio, usuario_id, enviada_em) values (2, 2, '2026-09-15', 1, '{"previstos":[],"extras":["Fechamento do relatório de execução de agosto"]}', '["Enviar a proposta de remanejamento ao Diretor"]', '["Aguardando saldo atualizado do sistema financeiro"]', 0, 'Preciso de liberação de acesso ao módulo de saldos.', 4, '2026-09-21T15:20:00');
insert into atualizacoes (id, secao_id, semana, versao, feito, proximo, impedimentos, critico, apoio, usuario_id, enviada_em) values (3, 3, '2026-09-15', 1, '{"previstos":[],"extras":["Levantamento dos fluxos de convênios"]}', '["Revisar o fluxo de aprovação de convênios"]', '[]', 0, '', 5, '2026-09-21T15:20:00');
insert into atualizacoes (id, secao_id, semana, versao, feito, proximo, impedimentos, critico, apoio, usuario_id, enviada_em) values (4, 4, '2026-09-15', 1, '{"previstos":[],"extras":["Carga de dados de julho concluída"]}', '["Publicar o painel de indicadores do mês"]', '[]', 0, '', 6, '2026-09-21T15:20:00');
insert into atualizacoes (id, secao_id, semana, versao, feito, proximo, impedimentos, critico, apoio, usuario_id, enviada_em) values (5, 5, '2026-09-15', 1, '{"previstos":[],"extras":["Reunião com três órgãos parceiros"]}', '["Atualizar o cadastro de contatos"]', '["Dois parceiros não responderam ao pedido de dados"]', 0, 'Um ofício do Diretor aos parceiros ajudaria.', 7, '2026-09-21T15:20:00');
insert into atualizacoes (id, secao_id, semana, versao, feito, proximo, impedimentos, critico, apoio, usuario_id, enviada_em) values (6, 6, '2026-09-15', 1, '{"previstos":[],"extras":["Cronograma do projeto especial validado"]}', '["Iniciar a etapa de homologação"]', '[]', 0, '', 8, '2026-09-21T15:20:00');
insert into atualizacoes (id, secao_id, semana, versao, feito, proximo, impedimentos, critico, apoio, usuario_id, enviada_em) values (7, 1, '2026-09-22', 1, '{"previstos":[{"texto":"Fechar o plano de trabalho do trimestre","cumprido":false},{"texto":"Reunir a equipe de indicadores","cumprido":true}],"extras":["Apresentação ao gabinete"]}', '["Enviar o plano de trabalho ao Diretor"]', '[]', 0, '', 3, '2026-09-20T14:10:00');
insert into atualizacoes (id, secao_id, semana, versao, feito, proximo, impedimentos, critico, apoio, usuario_id, enviada_em) values (8, 3, '2026-09-22', 1, '{"previstos":[{"texto":"Revisar o fluxo de aprovação de convênios","cumprido":false}],"extras":["Reunião com a Procuradoria sobre o fluxo"]}', '["Concluir a revisão do fluxo"]', '["Sistema de convênios fora do ar desde segunda-feira"]', 1, 'Preciso de apoio da TI para restabelecer o sistema.', 5, '2026-09-20T16:40:00');
insert into atualizacoes (id, secao_id, semana, versao, feito, proximo, impedimentos, critico, apoio, usuario_id, enviada_em) values (9, 4, '2026-09-22', 1, '{"previstos":[{"texto":"Publicar o painel de indicadores do mês","cumprido":false}],"extras":["Validação dos dados com a Seção de Indicadores"]}', '["Publicar o painel","Iniciar a carga de dados de agosto"]', '[]', 0, '', 6, '2026-09-19T09:50:00');

-- Tabela combinados (5 registros)
insert into combinados (id, texto, ordem, ativo, arquivado, criado_por, criado_em, alterado_em) values (1, 'Celulares no silencioso e fora da mesa.', 1, 1, 0, 1, '2026-08-16T09:00:00', '2026-08-16T09:00:00');
insert into combinados (id, texto, ordem, ativo, arquivado, criado_por, criado_em, alterado_em) values (2, 'Seções no verde não precisam de relato oral.', 2, 1, 0, 1, '2026-08-16T09:00:00', '2026-08-16T09:00:00');
insert into combinados (id, texto, ordem, ativo, arquivado, criado_por, criado_em, alterado_em) values (3, 'Cada fala traz o que foi entregue, o que vem a seguir e o que trava.', 3, 1, 0, 1, '2026-08-16T09:00:00', '2026-08-16T09:00:00');
insert into combinados (id, texto, ordem, ativo, arquivado, criado_por, criado_em, alterado_em) values (4, 'Decisões e prazos são registrados aqui, na hora.', 4, 1, 0, 1, '2026-08-16T09:00:00', '2026-08-16T09:00:00');
insert into combinados (id, texto, ordem, ativo, arquivado, criado_por, criado_em, alterado_em) values (5, 'Pedidos de apoio são tratados ao final de cada seção.', 5, 1, 0, 1, '2026-08-16T09:00:00', '2026-08-16T09:00:00');

-- Tabela config (3 registros)
insert into config (chave, valor) values ('combinados_frequencia', 'sempre');
insert into config (chave, valor) values ('reuniao_dia', '2');
insert into config (chave, valor) values ('reuniao_hora', '10:00');

-- Tabela reunioes (3 registros)
insert into reunioes (id, data, semana, iniciada_em, encerrada_em, status, combinados_snapshot, ata_texto, enviada_em, criada_por) values (1, '2026-09-15', '2026-09-15', '2026-09-15T10:04:00', '2026-09-15T11:12:00', 'enviada', '[{"id":1,"texto":"Celulares no silencioso e fora da mesa.","ordem":1},{"id":2,"texto":"Seções no verde não precisam de relato oral.","ordem":2},{"id":3,"texto":"Cada fala traz o que foi entregue, o que vem a seguir e o que trava.","ordem":3},{"id":4,"texto":"Decisões e prazos são registrados aqui, na hora.","ordem":4},{"id":5,"texto":"Pedidos de apoio são tratados ao final de cada seção.","ordem":5}]', 'ATA DA REUNIÃO SEMANAL (exemplo)

Decisões:
- [COF] Priorizar a proposta de remanejamento; nova data de entrega definida pelo Diretor.
- [CCP] Diretor enviará ofício aos parceiros que não responderam.

Novas ações:
- [Todos os Centros] Enviar o plano de trabalho do próximo trimestre.', '2026-09-15T15:00:00', 2);
insert into reunioes (id, data, semana, iniciada_em, encerrada_em, status, combinados_snapshot, ata_texto, enviada_em, criada_por) values (2, '2026-09-19', '2026-09-22', '2026-09-19T17:55:27.982Z', '2026-09-19T19:22:42.694Z', 'rascunho', '[{"id":1,"texto":"Celulares no silencioso e fora da mesa.","ordem":1},{"id":2,"texto":"Seções no verde não precisam de relato oral.","ordem":2},{"id":3,"texto":"Cada fala traz o que foi entregue, o que vem a seguir e o que trava.","ordem":3},{"id":4,"texto":"Decisões e prazos são registrados aqui, na hora.","ordem":4},{"id":5,"texto":"Pedidos de apoio são tratados ao final de cada seção.","ordem":5}]', 'ATA DA REUNIÃO SEMANAL — 19/09/2026 (sábado)

Combinados vigentes:
1. Celulares no silencioso e fora da mesa.
2. Seções no verde não precisam de relato oral.
3. Cada fala traz o que foi entregue, o que vem a seguir e o que trava.
4. Decisões e prazos são registrados aqui, na hora.
5. Pedidos de apoio são tratados ao final de cada seção.

Decisões:
- Nenhuma decisão registrada.

Novas ações:
- Nenhuma ação nova.

Próxima reunião: terça-feira, 29/09/2026, às 10:00.', NULL, 2);
insert into reunioes (id, data, semana, iniciada_em, encerrada_em, status, combinados_snapshot, ata_texto, enviada_em, criada_por) values (3, '2026-09-19', '2026-09-22', '2026-09-19T19:52:58.064Z', NULL, 'em_andamento', '[{"id":1,"texto":"Celulares no silencioso e fora da mesa.","ordem":1},{"id":2,"texto":"Seções no verde não precisam de relato oral.","ordem":2},{"id":3,"texto":"Cada fala traz o que foi entregue, o que vem a seguir e o que trava.","ordem":3},{"id":4,"texto":"Decisões e prazos são registrados aqui, na hora.","ordem":4},{"id":5,"texto":"Pedidos de apoio são tratados ao final de cada seção.","ordem":5}]', NULL, NULL, 1);

-- Tabela decisoes (2 registros)
insert into decisoes (id, reuniao_id, secao_id, texto, criada_em, criada_por) values (1, 1, 2, 'Priorizar a proposta de remanejamento; nova data de entrega definida pelo Diretor.', '2026-09-15T10:30:00', 2);
insert into decisoes (id, reuniao_id, secao_id, texto, criada_em, criada_por) values (2, 1, 5, 'Diretor enviará ofício aos parceiros que não responderam.', '2026-09-15T10:50:00', 2);

commit;

-- Atualizar sequências das chaves primárias
select setval(pg_get_serial_sequence('secoes', 'id'), coalesce(max(id), 1)) from secoes;
select setval(pg_get_serial_sequence('usuarios', 'id'), coalesce(max(id), 1)) from usuarios;
select setval(pg_get_serial_sequence('diretrizes', 'id'), coalesce(max(id), 1)) from diretrizes;
select setval(pg_get_serial_sequence('acoes', 'id'), coalesce(max(id), 1)) from acoes;
select setval(pg_get_serial_sequence('acao_comentarios', 'id'), coalesce(max(id), 1)) from acao_comentarios;
select setval(pg_get_serial_sequence('tempo', 'id'), coalesce(max(id), 1)) from tempo;
select setval(pg_get_serial_sequence('pedidos_prazo', 'id'), coalesce(max(id), 1)) from pedidos_prazo;
select setval(pg_get_serial_sequence('atualizacoes', 'id'), coalesce(max(id), 1)) from atualizacoes;
select setval(pg_get_serial_sequence('combinados', 'id'), coalesce(max(id), 1)) from combinados;
select setval(pg_get_serial_sequence('reunioes', 'id'), coalesce(max(id), 1)) from reunioes;
select setval(pg_get_serial_sequence('decisoes', 'id'), coalesce(max(id), 1)) from decisoes;
