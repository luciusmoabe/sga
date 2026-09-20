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

## Próximas entregas

1. Preparar PostgreSQL isolado e executar integração real, incluindo falhas no meio de operações compostas.
2. Introduzir migrações e constraints, alinhar os esquemas e proteger o ciclo de reuniões contra concorrência.
3. Implementar identidade validada e autorização centralizada; verificar a exposição efetiva do Supabase e corrigir seus scripts/permissões.
4. Definir fuso e configuração da reunião; formalizar fechamento e exceções.
5. Corrigir atualização de estado, proteção de formulários e concorrência de respostas na interface.
6. Validar jornadas em navegador, desempenho, implantação, backup e restauração.

## Decisões de produto pendentes

- Provedor institucional de autenticação.
- Política de correções após o fechamento semanal.
- Momento de mudança da semana de referência para reuniões com horário configurável.
- Efeito da falta de atualização de uma subseção no semáforo do Centro.

Essas decisões não bloqueiam as correções técnicas independentes. A liberação para dados reais depende de identidade validada, acesso restrito, operações atômicas e restauração comprovada.
