# Estabilização do SGC/Agilis

Branch: `codex/estabilizacao-sgc`.

## Primeira entrega — persistência PostgreSQL e tratamento de falhas

- [x] Registrar a referência: 18 testes existentes aprovados.
- [x] Vincular consultas ao cliente que abriu a transação PostgreSQL.
- [x] Isolar o contexto de transações simultâneas e consultas externas.
- [x] Garantir rollback e liberação do cliente em caso de erro; descartar o cliente se o rollback falhar.
- [x] Rejeitar transações aninhadas explicitamente, sem adquirir outra conexão.
- [x] Corrigir a comparação do pai nas consultas de criação e reordenação de seções.
- [x] Encaminhar falhas assíncronas na identificação do usuário ao tratamento de erros da API.
- [x] Propagar falhas de carregamento inicial das seções e eliminar a inicialização duplicada sem espera.
- [x] Executar 26 testes, incluindo oito novos casos de regressão.

O adaptador PostgreSQL usa contexto assíncrono por transação. A execução de cada consulta escolhe o cliente da transação ativa. Na segunda entrega, a inicialização passou a verificar a conexão com `select 1`, pois a árvore de seções deixou de usar cache local.

### Evidência e limites

Comando: `npm test`.

- 18 testes originais de integração da API aprovados.
- 6 testes do adaptador PostgreSQL aprovados: confirmação, rollback, isolamento concorrente, descarte de conexão, erro de inicialização e transação aninhada.
- 2 testes adicionais de API aprovados: falha de identificação e estrutura com pais nulos/não nulos.

Os testes PostgreSQL usam um pool instrumentado, sem conexão externa. Eles verificam o encaminhamento das consultas e os comandos de controle, mas não substituem a integração com um servidor PostgreSQL real. O teste de estrutura usa SQLite e rejeita a sintaxe incompatível identificada; não certifica todas as consultas PostgreSQL.

Nenhum banco existente foi alterado. Não houve implantação ou mudança de permissões no Supabase. O modo de demonstração continua sem autenticação real.

## Segunda entrega — SQLite, privacidade, arquivamento e datas

- [x] Serializar transações SQLite e operações externas, inclusive leituras, na conexão local.
- [x] Padronizar `db.transaction(callback)` como Promise nos dois bancos; todas as consultas e a carga de demonstração devem ser aguardadas.
- [x] Garantir rollback do seed e impedir sua execução por CLI com `DATABASE_URL` preenchida antes de qualquer exclusão local.
- [x] Consultar a hierarquia diretamente no banco, removendo o cache por instância das permissões.
- [x] Ocultar pedidos internos na pauta, cartões, detalhes de reunião e geração de novas atas.
- [x] Recusar decisões de pedidos não visíveis, preservando a exceção de compartilhamento explícito.
- [x] Retirar ações arquivadas e seus pedidos dos indicadores/listas operacionais, preservando histórico e tempo registrado.
- [x] Permitir desativar seções com ações apenas arquivadas; exigir reativação antes de restaurar ou criar ações.
- [x] Rejeitar datas inexistentes, incluindo fevereiro e anos bissextos.
- [x] Executar 36 testes com sucesso e verificar o CLI de seed em arquivo temporário.

A fila SQLite protege as operações na mesma conexão da aplicação. Isso não substitui as futuras constraints e validações transacionais de negócio contra disputas entre requisições ou processos. A consulta da árvore é atualizada a cada uso; o custo adicional deverá ser medido na etapa de desempenho.

Atas já persistidas não foram reescritas. Se houver atas antigas com conteúdo interno indevido, será necessário revisar os dados em uma etapa própria, preservando a trilha de auditoria.

A validação PostgreSQL continua usando pool simulado. Não foram encontrados PostgreSQL, `psql` ou Docker instalados no ambiente. Nenhum banco remoto foi acessado. As alterações continuam locais, sem implantação.

## Terceira entrega — concorrência de pedidos/atualizações e semáforo

- [x] Revalidar pedidos dentro da transação antes de inserir, evitando duplicidades por chamadas simultâneas na API.
- [x] Usar a mesma trava de ação (`FOR UPDATE`) nos fluxos de criar/decidir pedidos em PostgreSQL; SQLite usa sua fila transacional.
- [x] Atualizar decisões apenas enquanto o pedido estiver pendente e confirmar o prazo na mesma transação.
- [x] Validar `aprovar` como booleano, sem interpretar a string `"false"` como aprovação.
- [x] Impedir aprovação de pedido baseado em prazo antigo; permitir recusá-lo para liberar um novo pedido.
- [x] Validar e travar a reunião informada ao decidir por delegação; uma reunião encerrada gera conflito.
- [x] Serializar a escolha da versão semanal por seção; a resposta retorna o conteúdo salvo pela própria chamada.
- [x] Propagar impedimentos críticos da última atualização das subseções ao Centro, mantendo o indicador de envio do próprio Centro.
- [x] Executar 41 testes com sucesso.

Novos testes exercitam oito pedidos simultâneos (um criado e sete conflitos), duas decisões concorrentes (uma aceita), seis atualizações com versões distintas, rollback após falha de gravação do prazo, validação de decisão e propagação/resolução do impedimento da subseção.

Limites: a concorrência foi exercitada na API com SQLite em memória. As travas PostgreSQL ainda exigem validação com banco real e múltiplas conexões. Unicidade por constraints, migrações e concorrência do ciclo de reuniões continuam pendentes; estas alterações não certificam toda operação concorrente do sistema.

## Quarta entrega — migrações versionadas e ciclo de reuniões

- [x] Adicionar migrador incremental com registro de versões e rollback de todas as alterações pendentes em caso de falha.
- [x] Exigir destino explícito no CLI e uma variável própria para migração PostgreSQL.
- [x] Verificar a versão PostgreSQL na inicialização, sem DDL automático; aplicar migrações antes do uso de SQLite.
- [x] Substituir a alteração silenciosa da coluna de arquivamento por migração rastreável.
- [x] Impor unicidade de pedido pendente por ação e de reunião em andamento por índices parciais.
- [x] Recusar migração de dados duplicados com diagnóstico e sem excluí-los.
- [x] Serializar abertura/reabertura; proteger decisões, ações, encerramento, revisão e envio da ata por transações e travas.
- [x] Validar que ações/decisões concorrentes ao encerramento entram na ata ou são recusadas.
- [x] Executar 52 testes com sucesso e verificar o CLI em SQLite temporário.

O procedimento está em `MIGRACOES.md`. A implantação PostgreSQL agora exige migração prévia; a versão não inicia com migrações pendentes. Não foi aplicado DDL a bancos existentes do usuário nem a serviços remotos. PostgreSQL real e testes entre instâncias continuam pendentes, assim como o alinhamento das demais constraints e das exclusões em cascata.

O push do commit anterior foi adiado pelo usuário. Esta entrega permanece local e sem novo commit.

## Quinta entrega — calendário, fuso e configuração atômica

- [x] Compartilhar o calendário de `America/Bahia` entre API e interface, sem depender do fuso do servidor/navegador.
- [x] Interpretar `SGC_NOW` e timestamps antigos sem offset no fuso de Bahia; preservar timestamps com offset explícito.
- [x] Validar toda a configuração antes de gravar e salvar as chaves na mesma transação.
- [x] Atualizar o bootstrap completo após configuração e recarregá-lo nas navegações (respeitando o cache de cinco segundos existente).
- [x] Preservar a consulta de semanas registradas antes da mudança do dia da reunião.
- [x] Corrigir os textos fixos de terça-feira e o fechamento no sábado para reuniões de domingo.
- [x] Informar na interface que correções continuam disponíveis após o prazo regular.
- [x] Executar 57 testes com sucesso, incluindo processos com `TZ=UTC`, `America/Los_Angeles` e `Asia/Tokyo`.

O corte da referência semanal permanece às 12h no dia configurado, inclusive para reuniões agendadas à tarde. Essa regra ainda precisa de definição de produto; não foi alterada silenciosamente. O fechamento continua informativo, sem bloqueio de correções no backend. A leitura de semanas antigas foi preservada, mas a edição continua seguindo o dia atualmente configurado.

Os testes verificam funções de apresentação e calendário, além da API. A inspeção visual em navegador não foi executada porque a ferramenta de controle de navegador não está disponível nesta sessão. Dados antigos não foram reescritos; timestamps sem offset são interpretados como horários locais de Bahia.

## Sexta entrega — integração PostgreSQL real

- [x] Criar `npm run test:postgres` com cluster descartável, conexão por socket local e bancos independentes por cenário.
- [x] Validar migrações concorrentes, rollback de DDL, diagnóstico de duplicidades e índices únicos em PostgreSQL 17.9.
- [x] Exercitar duas instâncias da API com pools independentes: pedidos, decisões, versões semanais e ciclo de reuniões.
- [x] Provocar falha real de escrita via trigger e confirmar rollback integral da decisão/prazo.
- [x] Confirmar que ações/decisões concorrentes ao encerramento entram na ata ou são recusadas e que o envio preserva a ata publicada.
- [x] Corrigir identities de seções e usuários após os IDs explícitos da carga fictícia; validar constraints adiadas antes de reiniciar as identities na mesma transação.
- [x] Passar nos 11 cenários PostgreSQL (12 testes contando o agrupador) e nos 57 testes de regressão.

Reprodução e limites em `TESTES_POSTGRESQL.md`. O ambiente foi local e descartável; bancos existentes e Supabase não foram alterados. Os binários PostgreSQL ficam fora das dependências da aplicação. As APIs são instâncias no mesmo processo Node, com pools independentes; múltiplos processos, TLS, RLS e permissões remotas não foram certificados. Alterações seguem locais, sem novo commit ou push.

## Sétima entrega — integridade referencial entre bancos

- [x] Adicionar migração 3, sem alterar as versões anteriores, para as diferenças de FKs identificadas nos esquemas.
- [x] Exigir chefe existente no SQLite, com FK adiada até o commit, como PostgreSQL.
- [x] Substituir quatro cascatas PostgreSQL por exclusão explícita, mantendo o comportamento da API e a proteção existente no SQLite.
- [x] Preservar registros, índices, views e triggers na reconstrução SQLite; validar referências antes do commit e reativar FKs após sucesso/falha.
- [x] Testar migração legada, referências órfãs, rollback de DDL, reabertura de arquivo e consultas externas durante a reconstrução.
- [x] Comparar destinos e ações de todas as FKs SQLite/PostgreSQL e testar exclusões diretas e pela API.
- [x] Passar nos 63 testes de regressão e nos 15 cenários PostgreSQL (16 testes com o agrupador).

Procedimento e impacto sobre scripts externos em `MIGRACOES.md`. Nenhum banco existente do usuário foi migrado. Novas regras de domínio e novos vínculos ausentes em ambos os esquemas permanecem fora desta entrega; as diferenças identificadas entre as FKs existentes foram alinhadas. Alterações seguem locais, sem novo commit ou push.

## Oitava entrega — acesso institucional e permissões

- [x] Integrar Microsoft Entra ID, escolhido pelo usuário, com código de autorização, PKCE, state, nonce e verificação criptográfica dos ID tokens.
- [x] Vincular Tenant ID + Object ID a usuário local por comando administrativo, sem criar permissões por e-mail ou claims do navegador.
- [x] Persistir sessões por hash, usar cookie HttpOnly/Secure e exigir Origin + CSRF em mutações; revogar sessão no logout.
- [x] Remover confiança em `x-user-id` no modo institucional; exigir demo explícita apenas fora de produção e escutar demo em loopback.
- [x] Adicionar migração 4 com tabelas privadas de autenticação, RLS e revogação de grants públicos PostgreSQL, inclusive por coluna/sequência/função.
- [x] Corrigir exportador e SQL de carga: destino vazio, transação integral, sem truncamento ou concessão pública e sem exportar sessões/vínculos.
- [x] Exigir TLS PostgreSQL verificado e permitir CA oficial configurável.
- [x] Atualizar entrada da interface e impedir que respostas da sessão anterior repovoem cache/CSRF.
- [x] Validar 73 testes gerais e 19 cenários PostgreSQL (21 testes com agrupadores).

Configuração e operação em `AUTENTICACAO.md`. Node mínimo atualizado para 22.12 para a biblioteca de validação de tokens. Registro real no Entra, Tenant/Client IDs, segredo no ambiente seguro, URL pública e vínculos administrativos ainda precisam ser configurados para homologação. O login real com MFA e a inspeção visual não foram realizados; a ferramenta de navegador não estava disponível. A autorização de perfil/propriedade existente nas rotas foi preservada; não houve reescrita completa dessa camada. Não foram alterados serviços remotos, dados do usuário ou permissões efetivas do Supabase. Alterações permanecem locais, sem commit ou push.

## Nona entrega — preparação da homologação institucional

- [x] Adicionar `npm run check:auth`, diagnóstico local sem conexão ao banco, alteração de ambiente ou exposição de segredos.
- [x] Adicionar opção explícita `--online` para comparar a descoberta pública Microsoft com os endpoints esperados.
- [x] Testar configurações ausentes/inválidas, restrição ao endpoint oficial, respostas divergentes e sigilo dos erros.
- [x] Documentar resultados esperados para login, MFA, perfis, acesso negado, revogação e expiração.

O diagnóstico local confirmou ausência de `SGC_PUBLIC_ORIGIN`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` e `ENTRA_CLIENT_SECRET`. Nenhuma consulta ao tenant real ou alteração administrativa foi realizada. A continuação da homologação exige o registro institucional e essas configurações; o segredo deve ficar no ambiente seguro, não na conversa. Suíte geral atualizada para 77 testes. PostgreSQL e suas migrações não foram alterados nesta entrega.

## Décima entrega — versionamento, cabeçalhos de segurança e continuidade do trabalho na interface

- [x] Inicializar o repositório git (branch `main`) com o estado das nove entregas anteriores; `.env.example` deixou de ser ignorado.
- [x] Atualizar `better-sqlite3` para 12.x, que instala sem compilação no Node 24/Windows; a suíte voltou a rodar aqui.
- [x] Enviar CSP restritiva, `nosniff`, `X-Frame-Options`, `Permissions-Policy` e HSTS (só com HTTPS); ativar `trust proxy` na Vercel ou por `SGC_TRUST_PROXY`, para o limite de login enxergar o IP real.
- [x] Hospedar Manrope e DM Sans em `public/fontes`; nenhuma URL externa em HTML ou CSS.
- [x] Migração 7: sessão deslizante (1 h de inatividade, teto de 8 h); Modo Reunião renova a sessão a cada 10 minutos.
- [x] Interface: aviso de sessão expirada com retorno à tela anterior; rascunho da atualização semanal em `sessionStorage`; Minhas ações recarrega só os dados (mantém a aba e os minutos digitados); exclusão de ação usa o diálogo padrão.
- [x] 102 testes gerais aprovados. Verificação no Edge (CDP), com servidor em modo demo: fontes locais carregadas, zero violações de CSP no console, aba e minutos preservados, rascunho recuperado após recarregar, telas do chefe (390 px) e do Diretor (1920x1080) conferidas visualmente.

Limites: os testes de PostgreSQL real (`npm run test:postgres`) não foram executados aqui (sem binários); as expectativas de versão em `test/postgres/integracao.test.js` foram atualizadas, mas a migração 7 em PostgreSQL ainda precisa ser confirmada nesse ambiente. A expiração real de sessão na interface (aviso e retorno) foi verificada só por leitura do código e pelos testes de servidor. O ensaio na TV/HDMI real continua pendente.

## Próximas entregas

1. Ampliar a integração para implantação com múltiplos processos, conexão de produção e cópia isolada dos dados reais quando houver ambiente destinado a isso.
2. Avaliar novas constraints de domínio e vínculos ainda ausentes nos dois esquemas, com diagnóstico dos dados legados.
3. Homologar Entra ID com contas institucionais, revisar permissões efetivas do Supabase e ampliar a auditoria de autorização das rotas.
4. Formalizar o corte da semana, fechamento e exceções para correções.
5. Corrigir atualização de estado, proteção de formulários e concorrência de respostas na interface.
6. Validar jornadas em navegador, desempenho, implantação, backup e restauração.

## Decisões de produto pendentes

- Provedor definido: Supabase Auth (e-mail e senha), substituindo a integração Entra ID inicial. Configuração do projeto e vínculos pendentes.
- Política de correções após o fechamento semanal.
- Momento de mudança da semana de referência para reuniões com horário configurável.
- Efeito da falta de atualização de uma subseção no semáforo do Centro.

Essas decisões não bloqueiam as correções técnicas independentes. A liberação para dados reais depende de identidade validada, acesso restrito, operações atômicas e restauração comprovada.
