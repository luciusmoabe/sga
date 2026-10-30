# Multi-empresa

O Agilis nasceu para um órgão só. Este documento registra o plano para atender várias empresas (ou órgãos) no mesmo sistema **sem perder os dados do órgão atual**, que passa a ser a Empresa 1.

## Decisões

1. **Quem cria empresas:** só o administrador da plataforma. Não há autocadastro.
2. **Cada pessoa pertence a uma só empresa.** Um e-mail, um login do Supabase Auth, um usuário. Vários vínculos por pessoa ficam para depois (exigiria ligar vários usuários ao mesmo login em `auth_contas`).
3. **O método é o mesmo para todas:** Diretor, chefes, membros, reunião semanal, semáforo. Variam o nome, o logo, o cabeçalho e o brasão da ata, e o dia e a hora da reunião. Vocabulário configurável fica para depois, se as empresas novas pedirem.
4. **A pessoa escolhe a empresa na tela de entrada** (decisão do proprietário). Endereço único; subdomínio por empresa, só se for preciso.
5. **Uma base compartilhada**, com `empresa_id` nas tabelas, e não uma base por empresa.
6. **Administrador** continua total *dentro* da empresa. A plataforma ganha um perfil próprio, que cria e gerencia empresas mas não lê os dados de negócio delas.

### A escolha da empresa na entrada
- A tela de entrada traz um seletor de empresa (com busca), lembra a última escolha e aceita `?empresa=slug` no endereço. Depois de escolher, mostra o nome e o logo da empresa.
- `GET /api/auth/empresas` é público e lista só as empresas ativas com `listada_no_login = 1`. A empresa que não quiser aparecer na lista deixa o campo em 0 e entra pelo link com o `slug`.
- O login envia `{ empresa, e-mail, senha }`. **O servidor confere** que a conta pertence àquela empresa; a escolha nunca é confiada ao cliente. Erro genérico ("E-mail, senha ou empresa incorretos"), para não revelar a que empresa um e-mail pertence. O limite de tentativas passa a considerar a empresa.
- Como cada e-mail pertence a uma só empresa, a escolha também é uma segunda conferência e já prepara o futuro "uma pessoa em várias empresas".

## Fases (cada uma publicada separada)

| Fase | O que é | Estado |
| --- | --- | --- |
| 0 | Backup, ensaio da migração numa cópia e contagem de registros antes e depois (`scripts/contagem-registros.js`) | script pronto; falta rodar em produção |
| 1 | **Banco, só acrescenta** (migração 22): tabela `empresas`, Empresa 1, `empresa_id` nas tabelas raiz, chaves únicas por empresa ao lado das globais | pronta, ainda não publicada |
| 2 | **Servidor:** todo SQL filtra pela empresa de quem está logado; login com escolha da empresa; **testes de isolamento** (duas empresas, toda rota provada contra acesso cruzado) | a fazer |
| 3 | Plataforma: `npm run empresa:criar` (empresa + primeiro Diretor) e depois a tela "Empresas" | a fazer |
| 4 | Identidade: seletor na entrada, nome e logo na barra, ata por empresa | a fazer |
| 5 | **Contração:** remove o padrão 1 de `empresa_id`, troca as chaves únicas globais pelas por empresa. **Só depois disso pode existir a 2ª empresa.** | a fazer |

## Regras para não perder dados nem derrubar o sistema

- Migração e publicação seguem **expandir → publicar → contrair**: cada passo é aditivo e a versão anterior do código continua funcionando com o banco já migrado (o servidor tolera banco mais novo, ver `MIGRACOES.md`).
- **Tabelas raiz** (levam `empresa_id`): `secoes`, `usuarios`, `diretrizes`, `acoes`, `combinados`, `avisos`, `reunioes`, `atualizacoes`, `config`. As **filhas** (comentários, tempo, tarefas, prazos, pedidos, impedimentos, ciência, decisões, informações, presenças, sugestões e versões da ata) herdam a empresa da ação ou da reunião.
- O padrão `empresa_id = 1` mantém a versão anterior funcionando, porque ela insere sem informar a empresa. Ele sai na Fase 5.
- Duas chaves únicas globais continuam até a Fase 5, porque o código atual depende delas: `config.chave` (`on conflict(chave)`) e "uma reunião em andamento" (`uq_reuniao_em_andamento`). Ao lado delas já existem `uq_config_empresa_chave` e `uq_reuniao_em_andamento_empresa`.
- Antes de cada migração em produção: backup, ensaio numa cópia (um ramo do Supabase) e `node scripts/contagem-registros.js --postgres > antes.txt`; depois, `depois.txt` e `diff`. Nunca na terça da reunião.
- O principal risco é vazamento entre empresas: por isso os testes de isolamento vêm junto da Fase 2, e uma proteção extra no banco (RLS por empresa) fica como evolução.
