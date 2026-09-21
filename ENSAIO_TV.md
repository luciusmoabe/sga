# Ensaio do Modo Reunião na TV

Roteiro para testar o Agilis na sala, com o notebook e a TV reais, antes da primeira reunião. Leva cerca de 30 minutos, com duas pessoas: uma no notebook e outra sentada no lugar mais distante da TV.

Use dados fictícios. Não leve dados reais para este ensaio.

## Antes de ir à sala

1. No notebook, na pasta do projeto, prepare a demonstração com a data da reunião (PowerShell):

   ```powershell
   $env:SGC_AUTH_MODE = "demo"; $env:DATABASE_URL = ""; $env:SGC_NOW = "2026-09-22T09:30:00"
   npm run seed
   npm start
   ```

   Abra http://127.0.0.1:3000 e confirme que a tela de entrada aparece. Mantenha essa janela do terminal aberta.
2. Anote o modelo da TV, a resolução em que ela aparece no Windows e o navegador que será usado na reunião (o sistema só foi verificado no Edge e no Chromium).
3. Leve o cabo HDMI e, se houver, um adaptador para o notebook.

## Na sala

### Ligação e tela

- [ ] TV e notebook conectados; modo "Duplicar" ou "Somente segunda tela" escolhido, com resolução 1920x1080 (ou a nativa da TV).
- [ ] Suspensão de tela, protetor de tela e notificações desligados no notebook (Windows: Configurações > Sistema > Energia; Foco e notificações).
- [ ] Navegador em tela cheia (F11), zoom em 100% (Ctrl+0).
- [ ] Entrar como **Diretor (demonstração)** e clicar em **Iniciar reunião** no menu. A tela de conferência deve aparecer sem abrir a reunião; só o botão **Iniciar reunião** cria.

### Legibilidade (peça a quem está sentado no fundo da sala)

- [ ] Ler em voz alta o título de cada tela, o nome dos Centros e os prazos das ações.
- [ ] Ler os textos menores: os rótulos "Feito", "Próximo", "Impedimentos", "Apoio necessário", "Ações da seção", o subtítulo da Visão geral e a dica "Tecla → para começar".
- [ ] Distinguir os marcadores do topo: quadrado (crítico), triângulo (atenção) e círculo (em dia). Perguntar se a diferença aparece sem depender da cor.
- [ ] Verificar se o vermelho, o amarelo e o verde se distinguem com a luz da sala acesa e apagada, e se algum fica lavado ou brilhante demais.
- [ ] Verificar o contraste do texto cinza-esverdeado sobre o fundo escuro (nomes dos chefes, "Nada informado").

Se algum texto não for lido do fundo da sala, anote qual e a distância. É com isso que se ajustam os tamanhos.

### Condução da reunião

Percorra este roteiro como numa reunião real.

1. [ ] Abertura com os combinados: aparecem e cabem na tela?
2. [ ] Tecla **→** avança até a Visão geral e depois para a primeira seção; **←** volta; **Esc** volta à Visão geral. As setas não funcionam com uma janela de formulário aberta (é o esperado).
3. [ ] Em uma seção com pedido de novo prazo, **Aprovar** e **Recusar** funcionam e o resultado aparece na hora.
4. [ ] **Registrar decisão** e **Nova ação**: a janela é legível, dá para digitar sem o mouse e o texto digitado aparece grande o bastante.
5. [ ] **Exibir tempo (aparece na TV)** mostra e oculta o tempo gasto. Deve começar oculto.
6. [ ] Percorrer todas as seções (6 na demonstração). Anotar o tempo por seção e se algum conteúdo fica cortado ou exige rolagem.
7. [ ] **Sair sem encerrar**, voltar por **Iniciar reunião** e **Retomar reunião**: a reunião continua de onde estava, com as decisões e ações registradas.
8. [ ] **Encerrar reunião**: a ata é montada em rascunho. Revisar, editar e **Enviar aos chefes**.

### Falhas e plano B

- [ ] Recarregar a página (F5) no meio da reunião: a reunião é retomada, sem repetir a abertura.
- [ ] Desconectar e reconectar o cabo HDMI: a imagem volta sem perder o estado.
- [ ] Abrir **Painel da semana > Versão para impressão** e imprimir (ou salvar em PDF): serve de plano B se a TV falhar.
- [ ] Deixar o sistema aberto por 10 minutos sem tocar e confirmar que a tela não apaga nem pede novo login.

## O que registrar

| Item | Resultado (OK / ajustar) | Observação |
| --- | --- | --- |
| TV e resolução usadas | | |
| Textos ilegíveis do fundo da sala | | |
| Marcadores distinguíveis sem cor | | |
| Cores com a luz acesa e apagada | | |
| Setas do teclado e Esc | | |
| Janelas de decisão e nova ação | | |
| Tempo por seção | | |
| Cortes ou rolagem inesperada | | |
| Retomada após F5 e após cabo HDMI | | |
| Plano B impresso | | |

Guarde uma foto da TV com cada tela principal (abertura, Visão geral, uma seção) para comparar depois dos ajustes.

## Depois do ensaio

Envie as anotações. Ajustes de tamanho, cor e disposição são rápidos e ficam no arquivo `public/estilo.css`, na seção "Modo Reunião (TV)".
