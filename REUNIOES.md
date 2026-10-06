# Informações, presença e revisão da ata

Durante a reunião, Diretor, Apoio ou Administrador podem usar **Registrar informação** para incluir comunicados e contexto sem criar ação ou decisão. Esses registros podem ser editados ou excluídos durante a reunião e entram na ata ao encerrá-la.

Use **Presença** para registrar individualmente quem participou, incluindo titular e suplente quando ambos estiverem presentes. A ata guarda os nomes e as seções como estavam no registro de presença. Uma reunião antiga não recebe participantes automaticamente: ter enviado um relato ou ser chefe de uma seção não comprova presença.

Para reuniões passadas, Diretor, Apoio e Administrador podem abrir **Reuniões e atas**, selecionar a reunião e usar **Registrar presença** e **Registrar informação**, mesmo com a ata publicada. Informações também podem ser editadas e excluídas. A presença registrada libera sugestões de revisão dos chefes participantes. Ao salvar, as seções **Participantes** e **Informações** são atualizadas automaticamente na ata, com Informações abaixo de Novas ações. As demais edições do editor são salvas junto dos registros; bases desatualizadas são recusadas e a transação é desfeita. Alterações em atas publicadas preservam as versões anteriores. Os nomes e seções dos participantes já registrados são preservados, inclusive quando a conta fica inativa.

A ordem dos participantes segue a seleção: cada caixa marcada recebe uma numeração. Desmarcar e marcar novamente move a pessoa para o final. A migração 17 mantém a ordem alfabética exibida anteriormente para presenças legadas, pois a ordem original dos cliques não foi armazenada.

Em **Configuração**, a gestão cadastra o texto do cabeçalho e o brasão da unidade, à direita. O brasão da PMBA (`public/imagens/brasao_PMBA.png`, copiado da arte fornecida no projeto) fica à esquerda. O cabeçalho é institucional e vale para a visualização e os PDFs das atas. A imagem enviada é convertida para PNG no navegador, reduzida para até 360 pixels e validada pelo servidor; texto e PNG ficam na tabela `config`. A remoção do brasão direito também é feita nessa tela.

Depois da publicação, chefes e suplentes registrados como participantes encontram **Sugerir revisão** na tela da ata. Podem solicitar correção, inclusão ou supressão. A gestão revisa o editor da ata e usa **Revisar e responder**. Ao acolher a sugestão, o texto do editor e a resposta são salvos na mesma transação. Uma sugestão não acolhida também recebe justificativa. A sugestão fica visível com autor, data, resultado e resposta. Cada alteração efetiva da ata publicada preserva a versão anterior; o histórico fica disponível na mesma tela. Edições concorrentes com uma base desatualizada são recusadas.

# Reunião antecipada

O aplicativo separa **data real** (`reunioes.data`) e **referência semanal / data prevista** (`reunioes.semana`). Uma reunião de terça realizada na segunda usa os relatos da terça, registra a segunda como data real e mantém a terça seguinte como próxima reunião. A antecipação é explicitada na abertura e na ata. Ela não altera o dia regular da configuração, nem os prazos das ações. As ações concluídas são selecionadas pela data de conclusão no fuso da Bahia, nos sete dias que antecedem a referência semanal, independentemente do prazo, arquivamento ou encerramento.

Para uma antecipação planejada, recomenda-se um próximo ajuste específico de agenda: cadastrar uma exceção por referência semanal com data/hora real e prazo de envio dos relatos. O painel, o trilho da semana e os lembretes passariam a exibir essa exceção. A interface deve avisar os chefes antes da reunião e destacar os relatos ainda pendentes, permitindo que a gestão prossiga conscientemente. O encerramento pode congelar os cartões e relatos efetivamente apresentados, para que envios posteriores não alterem o registro daquela sessão.

Também se recomenda alertar quando já existe reunião encerrada para a mesma referência semanal e oferecer uma reunião complementar de forma explícita. Essa regra evita iniciar acidentalmente outra reunião na data originalmente prevista sem bloquear sessões extraordinárias legítimas. A agenda de exceções, o aviso de reunião complementar e o congelamento integral dos cartões são propostas para evolução; não são implementados neste ajuste.

# Demanda do Diretor em ação já cadastrada

Uma ação já cadastrada pode receber ou perder a marcação **Demanda do Diretor** pelo botão **Editar ação**, respeitando a autoria existente (titular também edita as do suplente; Administrador edita qualquer seção). A marcação pode mudar após apresentação em reunião sem alterar o título, o detalhamento ou a ata já publicada. A alteração fica nos comentários do histórico. Ações encerradas e a origem automática de uma diretriz não mudam. Ao marcar uma ação interna, o formulário informa que ela ficará visível ao Diretor; desmarcar a origem não a torna interna novamente.

# Implantação

A versão nova exige as migrações **16 e 17**. SQLite aplica as migrações na inicialização. Para PostgreSQL, configure `SGC_MIGRATION_DATABASE_URL` e execute `npm run migrate -- --postgres` junto da publicação do código novo. Não execute o código antigo após migrar: ele recusa uma versão desconhecida. As tabelas são acessadas pela API Express; RLS e revogações impedem acesso direto pelos papéis públicos do Supabase.
