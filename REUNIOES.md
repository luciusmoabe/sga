# Informações, presença e revisão da ata

Durante a reunião, Diretor, Apoio ou Administrador podem usar **Registrar informação** para incluir comunicados e contexto sem criar ação ou decisão. Esses registros podem ser editados ou excluídos durante a reunião e entram na ata ao encerrá-la.

Use **Presença** para registrar individualmente quem participou, incluindo titular e suplente quando ambos estiverem presentes. A ata guarda os nomes e as seções como estavam no registro de presença. Uma reunião antiga não recebe participantes automaticamente: ter enviado um relato ou ser chefe de uma seção não comprova presença.

Depois da publicação, chefes e suplentes registrados como participantes encontram **Sugerir revisão** na tela da ata. Podem solicitar correção, inclusão ou supressão. A gestão revisa o editor da ata e usa **Revisar e responder**. Ao acolher a sugestão, o texto do editor e a resposta são salvos na mesma transação. Uma sugestão não acolhida também recebe justificativa. A sugestão fica visível com autor, data, resultado e resposta. Cada alteração efetiva da ata publicada preserva a versão anterior; o histórico fica disponível na mesma tela. Edições concorrentes com uma base desatualizada são recusadas.

# Reunião antecipada

O aplicativo separa **data real** (`reunioes.data`) e **referência semanal / data prevista** (`reunioes.semana`). Uma reunião de terça realizada na segunda usa os relatos da terça, registra a segunda como data real e mantém a terça seguinte como próxima reunião. A antecipação é explicitada na abertura e na ata. Ela não altera o dia regular da configuração, nem os prazos das ações. As ações concluídas são selecionadas pela data de conclusão no fuso da Bahia, nos sete dias que antecedem a referência semanal, independentemente do prazo, arquivamento ou encerramento.

Para uma antecipação planejada, recomenda-se um próximo ajuste específico de agenda: cadastrar uma exceção por referência semanal com data/hora real e prazo de envio dos relatos. O painel, o trilho da semana e os lembretes passariam a exibir essa exceção. A interface deve avisar os chefes antes da reunião e destacar os relatos ainda pendentes, permitindo que a gestão prossiga conscientemente. O encerramento pode congelar os cartões e relatos efetivamente apresentados, para que envios posteriores não alterem o registro daquela sessão.

Também se recomenda alertar quando já existe reunião encerrada para a mesma referência semanal e oferecer uma reunião complementar de forma explícita. Essa regra evita iniciar acidentalmente outra reunião na data originalmente prevista sem bloquear sessões extraordinárias legítimas. A agenda de exceções, o aviso de reunião complementar e o congelamento integral dos cartões são propostas para evolução; não são implementados neste ajuste.

# Implantação

A versão nova exige a migração **16**. SQLite aplica a migração na inicialização. Para PostgreSQL, configure `SGC_MIGRATION_DATABASE_URL` e execute `npm run migrate -- --postgres` junto da publicação do código novo. Não execute o código antigo após migrar: ele recusa uma versão desconhecida. As tabelas novas são acessadas pela API Express; RLS e revogações impedem acesso direto pelos papéis públicos do Supabase.
