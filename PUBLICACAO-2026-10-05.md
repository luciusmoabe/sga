# Publicação do Agilis — 05/10/2026

Publicação concluída no projeto Vercel `agilis`, em [agilis-alpha.vercel.app](https://agilis-alpha.vercel.app). Data de referência no fuso `America/Bahia`.

Deployment ativo: `dpl_EXZaHHJkBUbJfAaya43hA1DqsS3P`, [inspeção na Vercel](https://vercel.com/lucius-moabes-projects/agilis/EXZaHHJkBUbJfAaya43hA1DqsS3P). A publicação utilizou uma cópia dos 73 arquivos de execução (`public`, `server`, `certs` e configuração), conferida contra o projeto local. Arquivos de ambiente, dados locais e configurações pessoais ficaram fora do envio.

Manifesto SHA-256: `d1a77be51ed97175f11c7b64658658274899ac861e75bd4dd988591767bc9da2`.

## Banco

A migração **16**, `registros_e_revisao_de_reuniao`, foi aplicada pelo migrador da aplicação ao projeto Supabase `kbepvsnkmehgcnebkijy`, com TLS verificado. O deployment foi construído antes da migração e promovido em seguida.

- Antes e depois: **36 ações**, **2 reuniões**, nenhuma reunião em andamento.
- As quatro tabelas novas existem, têm RLS habilitada e não concedem leitura direta aos papéis `anon` ou `authenticated`.
- A verificação das versões da aplicação passou após a migração.

## Verificações da publicação

| Conferência | Resultado |
| --- | --- |
| Página inicial | HTTP 200 |
| `/api/auth/config` | HTTP 200, modo `supabase` |
| `/api/bootstrap` sem sessão | HTTP 401 |
| Inclusão de informação de reunião sem sessão | HTTP 401, nenhuma alteração |
| Arquivo inexistente | HTTP 404 |
| JavaScript de login, reunião, atas, revisão, ação e seção; CSS | HTTP 200 e conteúdo idêntico ao código testado |
| Deployment resolvido pelo endereço público | Nova versão em estado `READY` |

Antes da publicação passaram **182 testes automatizados** e o ensaio de navegador em 390×844 e 1920×1080, com dados fictícios. Foram exercitados login e olhinho, demanda declarada pela seção, edição do checklist, presença, informações para a ata, conclusão com prazo futuro e revisão da ata publicada. A suíte de integração PostgreSQL em cluster temporário não iniciou neste Windows: ela exige o ambiente Unix documentado em `TESTES_POSTGRESQL.md`. A migração e as permissões foram verificadas no PostgreSQL de produção. O teste remoto não realizou login com senha de usuário nem criou registros de negócio.

## Avisos existentes do Supabase

A consulta aos advisors retornou avisos sobre objetos e configurações que esta publicação não criou. Foram registrados para acompanhamento; não foram alteradas configurações de autenticação ou funções auxiliares fora do escopo.

- **RLS habilitada sem policies:** informativo compatível com a arquitetura atual, que revoga acesso direto e usa a API Express. A proteção das tabelas novas foi confirmada no catálogo. [Referência do aviso](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- **`public.subarvore` sem `search_path` fixo:** o catálogo confirma `SECURITY INVOKER` e ausência de permissão de execução para `anon` e `authenticated`. A fixação do caminho fica para uma migração específica. [Referência do aviso](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
- **`public.rls_auto_enable` com grants de execução:** a função preexistente é `SECURITY DEFINER`, retorna `event_trigger` e fixa `search_path=pg_catalog`. Revisar esses grants em uma manutenção própria. [Aviso para `anon`](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [aviso para `authenticated`](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- **Proteção contra senhas vazadas desabilitada:** configuração existente do Supabase Auth. [Orientações oficiais](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Os detalhes dos ajustes e a proposta de evolução da agenda de reuniões antecipadas estão em [REUNIOES.md](REUNIOES.md). A publicação inicial foi feita pela CLI a partir do código local. O código, a migração 16 e os módulos novos são versionados juntos para manter compatibilidade com o banco nas futuras publicações pela integração Git.
