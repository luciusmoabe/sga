# SGC — protótipo

Sistema de acompanhamento semanal dos Centros do Departamento de Planejamento, Orçamento e Gestão.
Apoia a reunião presencial de terça-feira, 10h, entre o Diretor e os chefes de seção.

Este é um **protótipo com dados fictícios**, feito para validar o fluxo com o Diretor antes de construir a versão definitiva. Não use dados reais nele.

## Como rodar

Requisitos: Node.js 22.12 ou superior (testado em Node 24.11.1).

```bash
npm install
SGC_AUTH_MODE=demo DATABASE_URL="" npm start
```

Abra http://127.0.0.1:3000. Nesse modo local, o banco (`data/sgc.db`, SQLite) é criado com dados fictícios. O modo demo escuta apenas loopback e é recusado com `NODE_ENV=production` ou na Vercel.

O modo padrão usa Supabase Auth (e-mail e senha) e exige configuração institucional antes de iniciar. Veja [AUTENTICACAO.md](AUTENTICACAO.md) para configurar o projeto, migrar e vincular contas. As credenciais de demonstração não funcionam nesse modo.

| Comando | O que faz |
| --- | --- |
| `npm start` | Sobe o servidor (porta 3000; mude com `PORT=3100 npm start`) |
| `npm run dev` | Igual, reiniciando ao alterar arquivos do servidor |
| `npm run seed` | Apaga o banco e recria os dados fictícios |
| `npm run migrate -- --sqlite CAMINHO` | Aplica migrações ao arquivo SQLite indicado |
| `npm run migrate -- --postgres` | Aplica migrações usando `SGC_MIGRATION_DATABASE_URL` explícita |
| `npm run check:auth` | Verifica configuração Supabase sem exibir a chave; `-- --online` consulta as configurações públicas do projeto |
| `npm test` | Roda os testes de regras, API e concorrência SQLite em memória, além do adaptador PostgreSQL com pool simulado |
| `npm run test:postgres` | Cria PostgreSQL temporário e valida migrações, rollback e concorrência entre duas APIs; requer binários locais ([instruções](TESTES_POSTGRESQL.md)) |

Com `DATABASE_URL` preenchida, a aplicação usa PostgreSQL e o comando de seed é recusado. Para uma demonstração SQLite isolada, use `DATABASE_URL="" SGC_DB=/tmp/sgc-demo.db npm run seed` e inicie com as mesmas variáveis e `SGC_AUTH_MODE=demo`. O seed aguarda o commit completo antes de terminar. No modo institucional não há carga fictícia automática.

PostgreSQL precisa estar migrado antes de iniciar esta versão; SQLite aplica as migrações ao iniciar. Consulte [MIGRACOES.md](MIGRACOES.md) para provisionamento, verificação de duplicidades e procedimento de atualização.

Variáveis de ambiente: `PORT`, `SGC_DB` (caminho do arquivo SQLite) e `SGC_NOW` (data e hora "de mentira", útil para demonstrar o fechamento de segunda 18h ou a terça da reunião, por exemplo `SGC_NOW=2026-09-22T09:30:00 npm start`; para os dados de exemplo fazerem sentido, use `npm run seed` com a mesma variável).

## Calendário e fuso

A API e a interface usam `America/Bahia` para datas operacionais e horários. `SGC_NOW=2026-09-22T10:00:00` significa 10h na Bahia, mesmo em servidor UTC; valores com `Z` ou offset explícito representam o instante indicado. Timestamps antigos sem offset também são interpretados como horários de Bahia. Datas civis (`AAAA-MM-DD`) não mudam conforme o fuso do navegador.

A configuração do dia/horário é gravada integralmente ou desfeita em caso de erro. Consultas de semanas já registradas continuam disponíveis após mudar o dia da reunião. O corte semanal permanece às 12h no dia configurado, e o prazo regular segue no dia anterior às 18h; a política de corte para reuniões à tarde e as exceções de fechamento ainda precisam de validação. Correções após o prazo continuam permitidas nesta versão.

## Como explorar

Na tela de entrada não há senha: escolha um perfil.

- **Diretor**: Painel da semana (semáforo por seção), Direcionar ação (para todos os Centros ou seções específicas, com prazo), Ações, Pedidos de novo prazo, Combinados, Reuniões e atas, Estrutura (criar seções e subseções, atribuir chefes) e o **Modo Reunião**.
- **Apoio do Diretor**: o mesmo do Diretor, exceto Estrutura. Pode conduzir o Modo Reunião.
- **Chefe de seção**: Início, Minha atualização (feito, próximo, impedimentos, apoio), Minhas ações (status e tempo gasto em minutos), Histórico, Combinados e Atas.

### Modo Reunião (para a TV)

Pelo menu "Iniciar reunião", que abre uma tela de conferência (seções sem atualização, pedidos de prazo, combinados) e só cria a reunião no botão **Iniciar reunião**; recarregar a página ou voltar no navegador não abre reunião nova, e uma reunião em andamento é retomada pelo botão **Retomar reunião**. Pensado para o notebook ligado por HDMI à TV da sala.

1. Abertura com os **Combinados da reunião** (conforme a frequência configurada).
2. Visão geral das seções, em ordem de necessidade (vermelhas primeiro).
3. Uma tela por seção: relato, ações, pedido de novo prazo (aprovar ou recusar na hora), decisões e novas ações.
4. Encerrar monta a **ata em rascunho**, que é revisada e "enviada" (nesta versão, apenas libera a leitura na tela Atas).

Teclas: seta direita avança, seta esquerda volta. Há também a "Versão para impressão" da pauta (plano B se a TV falhar).

## Regras principais já implementadas

- Semana vai de terça a segunda; atualizações fecham na segunda, 18h. O semáforo é: vermelho (ação atrasada ou impedimento crítico), amarelo (atualização pendente ou ação vencendo em até 2 dias), verde (o resto).
- Ação concluída exige tempo registrado maior que zero minutos.
- Mudança de prazo só por pedido; o Diretor decide (o Apoio decide apenas dentro de uma reunião em andamento).
- Subseções: até 3 níveis. Ações internas de uma subseção não aparecem para Diretor e Apoio, só um resumo numérico.
- Combinados nunca são excluídos, apenas arquivados; cada reunião guarda uma cópia do que estava valendo.

## Limites conhecidos desta versão

- Login Supabase Auth (e-mail e senha) implementado e testado com provedor simulado; a validação no projeto Supabase real e a inspeção visual da nova entrada ainda estão pendentes. A escolha de perfil por `x-user-id` só existe no modo demo local explícito.
- Sem e-mail nem lembretes. "Enviar ata" apenas libera a leitura no sistema.
- O chefe não tem tela própria para gerir subseções e ações internas (a estrutura existe no banco e é criada pelo Diretor).
- Sem trava automática do envio após segunda 18h (o chefe ainda consegue enviar correção).
- Sem relatórios, gráficos históricos ou anotações privadas do Diretor.
- Não foi testado com TV/HDMI reais nem em navegadores além do Chromium; a interface foi verificada em telas de 1920x1080, 1440x900 e 390 px de largura.

## Estrutura do código

```
server/   API Express + SQLite (better-sqlite3) ou PostgreSQL (pg)
  app.js       monta o Express e registra as rotas
  rotas-estrutura.js  seções e usuários
  rotas-acoes.js      diretrizes, ações e pedidos de prazo
  rotas-semana.js     sessão, atualização semanal, painel, pauta
  contexto.js  auxiliares comuns das rotas (banco, relógio, configuração)
  reunioes.js  combinados, reuniões, decisões, ata
  logic.js     regras puras: semana, fechamento, semáforo
  db.js        esquema e consultas de árvore
  migrations.js migrações incrementais e verificação da versão
  migrate.js   comando de migração com destino explícito
  seed.js      dados fictícios
public/   interface (JavaScript puro, sem build)
  js/          uma tela por arquivo; main.js faz roteamento por hash
  js/regras.js status, transições, prioridades e ordem do semáforo, compartilhados com o servidor
  estilo.css   sistema visual, modo TV e impressão
test/     testes da API
```

Para continuar o desenvolvimento com o Claude Code, abra esta pasta e leia o `CLAUDE.md`.

O andamento das correções e as limitações da validação estão em [ESTABILIZACAO.md](ESTABILIZACAO.md).
O roteiro para testar o Modo Reunião na TV da sala está em [ENSAIO_TV.md](ENSAIO_TV.md).
