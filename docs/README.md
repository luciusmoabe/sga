# Documentação do SGC / Agilis

Sistema para gerir e acompanhar a produtividade semanal dos Centros do Departamento de Planejamento, Orçamento e Gestão. O uso principal é a reunião presencial de terça-feira, 10h, do Diretor com os chefes de seção, com TV por HDMI na sala.

Esta pasta reúne a documentação geral. Os documentos que já existiam na raiz continuam valendo e são citados onde aprofundam um assunto.

## Por onde começar

| Quero… | Leia |
| --- | --- |
| Entender o que o sistema faz e para quem | [visao-geral.md](visao-geral.md) |
| Usar o sistema (por perfil) | [guia-do-usuario.md](guia-do-usuario.md) |
| Entender as regras de negócio | [regras-de-negocio.md](regras-de-negocio.md) |
| Entender como o código é organizado | [arquitetura.md](arquitetura.md) |
| Consultar as rotas da API | [api.md](api.md) |
| Consultar tabelas e migrações | [banco-de-dados.md](banco-de-dados.md) |
| Instalar, configurar, publicar e testar | [operacao.md](operacao.md) |
| Ver o significado dos termos | [glossario.md](glossario.md) |

## Documentos da raiz do repositório

| Arquivo | Assunto |
| --- | --- |
| [README.md](../README.md) | Como rodar, comandos e limites conhecidos |
| [CLAUDE.md](../CLAUDE.md) | Instruções para quem desenvolve (com o Claude Code); a fonte mais detalhada das regras |
| [AUTENTICACAO.md](../AUTENTICACAO.md) | Login por e-mail e senha com Supabase Auth |
| [HOMOLOGACAO.md](../HOMOLOGACAO.md) | Roteiro de homologação com o Supabase real |
| [MIGRACOES.md](../MIGRACOES.md) | Como as migrações do banco funcionam |
| [TESTES_POSTGRESQL.md](../TESTES_POSTGRESQL.md) | Testes de integração com PostgreSQL descartável |
| [VERCEL.md](../VERCEL.md) | Implantação na Vercel |
| [MULTIEMPRESA.md](../MULTIEMPRESA.md) | Plano e decisões do suporte a várias empresas |
| [REUNIOES.md](../REUNIOES.md) | Presença, informações e revisão da ata |
| [ENSAIO_TV.md](../ENSAIO_TV.md) | Roteiro de ensaio do Modo Reunião na TV |
| [ESTABILIZACAO.md](../ESTABILIZACAO.md) | Andamento das correções de estabilização |
| [PUBLICACAO-2026-10-05.md](../PUBLICACAO-2026-10-05.md) | Registro de uma publicação |

## Convenções do projeto

- Idioma do produto, da interface, dos commits e dos comentários: português do Brasil. Nomes de código (tabelas, colunas, funções) também são em português.
- Datas em ISO (`AAAA-MM-DD`) no banco e na API; na tela, formatadas com `br()`.
- Erros de API: `{ "erro": "mensagem em português" }` com o status HTTP adequado.
- Dados de exemplo são fictícios. Não inclua dados reais do Departamento no repositório.
