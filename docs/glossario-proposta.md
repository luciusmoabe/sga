# Glossário do Agilis (aprovado)

Princípio: **um nome para cada coisa, em toda a interface**. Esta proposta lista cada conceito, o nome que sugiro, o que ele significa e os nomes que passariam a ser evitados. **Aprovado e aplicado:** a troca foi feita de uma vez na interface, nos textos do servidor, no tutorial e no guia, e `test/glossario.test.js` reprova se um nome antigo reaparecer. Os nomes de código (`relatoHTML`, `itensDoRelato`, `relato.js`, `reuniao_informacoes`) continuam como estão. As atas antigas, com o título "Informações", continuam sendo lidas; as novas saem com "Informes".

Os nomes de tipo de unidade e do topo ("Diretor", "Centro") continuam vindo do vocabulário de cada empresa e não entram aqui.

## A semana e a reunião

| Nome proposto | O que é | Evitar | Observação |
|---|---|---|---|
| **Atualização semanal** | O que o chefe envia antes da reunião: ações concluídas, atrasadas, programadas, impedimentos e observações. Tem versão (reenviar cria nova versão). | "relato", "relato semanal", "atualização" sozinha, "texto livre" | Hoje a tela chama "Minha atualização" e o texto interno fala em "relato" (75 ocorrências). O usuário só deve ver "atualização". |
| **Atualizações enviadas** | A lista do que o chefe já enviou. | "Histórico" | Já adotado na versão nova (aba da Semana). |
| **Pauta** | O que será tratado na reunião, montado **antes** dela. | usar "pauta" para a versão impressa do painel | O botão "Versão para impressão" do painel passa a se chamar **Pauta impressa**. |
| **Informe** | Comunicado dado **durante** a reunião (hoje "Informações e comunicados"). | "informações", "comunicados" | Mais curto e não se confunde com "aviso". |
| **Decisão** | O que o Diretor decide **na** reunião. Fica registrada na reunião. | "deliberação" | Sem mudança. |
| **Combinado** | Compromisso assumido entre pessoas ou seções que vale **por mais de uma reunião** e é acompanhado até ser cumprido. | usar "decisão" para algo que continua em aberto | Sem mudança no nome; só a definição, para separar de "decisão". |
| **Ata** | O registro escrito da reunião, feito **depois** dela. | "relatório da reunião" | Sem mudança. |
| **Aviso** | Mensagem do Diretor que aparece no Início do chefe, com período de vigência. | "comunicado", "recado" | Só este sentido. |
| **Notificação** | O alerta que chega ao celular (push), como o lembrete de sexta. | "Avisos no celular", "lembrete" para a notificação | Hoje "avisos" tem 3 sentidos (banner, notificação e lembrete). |

## As ações

| Nome proposto | O que é | Evitar | Observação |
|---|---|---|---|
| **Ação** | O que precisa ser feito, com prazo, responsável e status. | "demanda" como sinônimo de ação | "Demanda" fica só para a **origem** (veja abaixo). |
| **Tarefa** | Parte de uma ação, com data e responsável opcionais. | "item", "checklist" | Sem mudança. |
| **Responsável** | Quem executa a ação. | "executor", "dono" | Uma pessoa por ação. |
| **Direcionar** | O ato de enviar uma ação a outra seção. | "demandar", "atribuir à seção" | A tela e o botão já se chamam assim. |
| **Demandada por** | A origem de uma ação direcionada (o Diretor, a seção acima ou uma entidade externa). | "diretriz" para o usuário | "Diretriz" é termo interno de um conjunto de ações direcionadas juntas; some da interface. |
| **Pedido de novo prazo** | O pedido do chefe ao Diretor para mudar o prazo de uma ação demandada. | "prorrogação", "solicitação de prazo" | Sem mudança. |
| **Sem movimento** | Ação sem nenhum registro há 7 dias ou mais. Só informa. | "parada" | "Parada" parece status; não é. |

## O que acontece numa ação

| Nome proposto | O que é | Evitar | Observação |
|---|---|---|---|
| **Registro** | Cada item da linha do tempo: andamento, entrega, observação. | "diário" para o item, "lançamento" | O **item** é "registro". |
| **Linha do tempo** | A lista de tudo o que aconteceu numa ação, na ficha. | "histórico" da ação | Já adotado na versão nova. |
| **Diário** | A tela que reúne os registros de várias ações: "Meu diário" e "Diário da seção". | "diário de progresso" na interface | Só o nome da tela. |
| **Impedimento** | Algo que **trava** a ação. Só o impedimento **crítico** aberto deixa a seção vermelha. | usar para o que não trava | Sem mudança. |
| **Ponto de atenção** | Algo que merece atenção **sem travar** a ação. | "alerta", "observação" para isso | Sem mudança. |
| **Comentário** | Conversa sobre a ação. | "recado" | Sem mudança. |
| **Tempo gasto** | Minutos trabalhados na ação, em soma. | "esforço" (que é a **estimativa**) | "Esforço" fica só para a estimativa (pequeno, médio, grande). |

## Pontos de decisão (todos aprovados)

1. "Relato" some da interface e vira "atualização".
2. "Informe" no lugar de "Informações e comunicados".
3. "Notificação" no lugar de "Avisos no celular".
4. "Sem movimento" no lugar de "parada".
5. "Pauta impressa" no lugar de "Versão para impressão".
