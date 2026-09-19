# SGC — protótipo

Sistema de acompanhamento semanal dos Centros do Departamento de Planejamento, Orçamento e Gestão.
Apoia a reunião presencial de terça-feira, 10h, entre o Diretor e os chefes de seção.

Este é um **protótipo com dados fictícios**, feito para validar o fluxo com o Diretor antes de construir a versão definitiva. Não use dados reais nele.

## Como rodar

Requisitos: Node.js 18 ou superior (testado em Node 22).

```bash
npm install
npm start
```

Abra http://localhost:3000. Na primeira execução o banco (`data/sgc.db`, SQLite) é criado com dados fictícios.

| Comando | O que faz |
| --- | --- |
| `npm start` | Sobe o servidor (porta 3000; mude com `PORT=3100 npm start`) |
| `npm run dev` | Igual, reiniciando ao alterar arquivos do servidor |
| `npm run seed` | Apaga o banco e recria os dados fictícios |
| `npm test` | Roda os testes da API (16 testes, banco em memória) |

Variáveis de ambiente: `PORT`, `SGC_DB` (caminho do arquivo SQLite) e `SGC_NOW` (data e hora "de mentira", útil para demonstrar o fechamento de segunda 18h ou a terça da reunião, por exemplo `SGC_NOW=2026-09-22T09:30:00 npm start`; para os dados de exemplo fazerem sentido, use `npm run seed` com a mesma variável).

## Como explorar

Na tela de entrada não há senha: escolha um perfil.

- **Diretor**: Painel da semana (semáforo por seção), Direcionar ação (para todos os Centros ou seções específicas, com prazo), Ações, Pedidos de novo prazo, Combinados, Reuniões e atas, Estrutura (criar seções e subseções, atribuir chefes) e o **Modo Reunião**.
- **Apoio do Diretor**: o mesmo do Diretor, exceto Estrutura. Pode conduzir o Modo Reunião.
- **Chefe de seção**: Início, Minha atualização (feito, próximo, impedimentos, apoio), Minhas ações (status e tempo gasto em minutos), Histórico, Combinados e Atas.

### Modo Reunião (para a TV)

Pelo menu "Iniciar reunião". Pensado para o notebook ligado por HDMI à TV da sala.

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

- Sem autenticação real (perfil escolhido na entrada; o servidor confia no cabeçalho `x-user-id`).
- Sem e-mail nem lembretes. "Enviar ata" apenas libera a leitura no sistema.
- O chefe não tem tela própria para gerir subseções e ações internas (a estrutura existe no banco e é criada pelo Diretor).
- Sem trava automática do envio após segunda 18h (o chefe ainda consegue enviar correção).
- Sem relatórios, gráficos históricos ou anotações privadas do Diretor.
- Não foi testado com TV/HDMI reais nem em navegadores além do Chromium; a interface foi verificada em telas de 1920x1080, 1440x900 e 390 px de largura.

## Estrutura do código

```
server/   API Express + SQLite (better-sqlite3)
  app.js       rotas de seções, usuários, ações, atualizações, painel, pauta
  reunioes.js  combinados, reuniões, decisões, ata
  logic.js     regras puras: semana, fechamento, semáforo
  db.js        esquema e consultas de árvore
  seed.js      dados fictícios
public/   interface (JavaScript puro, sem build)
  js/          uma tela por arquivo; main.js faz roteamento por hash
  estilo.css   sistema visual, modo TV e impressão
test/     testes da API
```

Para continuar o desenvolvimento com o Claude Code, abra esta pasta e leia o `CLAUDE.md`.
