# Visão geral

## Propósito

O Departamento de Planejamento, Orçamento e Gestão é dividido em Centros e uma Coordenação, cada um com um chefe. Toda terça-feira, às 10h, o Diretor se reúne com esses chefes. O sistema existe para que essa reunião seja conduzida com dados atualizados: o que foi feito, o que vem a seguir, o que está atrasado ou travado e o que foi decidido.

O projeto nasceu como protótipo com dados fictícios, para validar o fluxo com o Diretor. Hoje também suporta várias empresas (órgãos) no mesmo sistema, com a empresa original como Empresa 1 (ver [MULTIEMPRESA.md](../MULTIEMPRESA.md)).

## Ciclo semanal

A semana vai de **terça a segunda**. O fechamento é na **segunda, 18h**.

1. **Durante a semana**, o Diretor (ou o Apoio) direciona ações às seções, sempre com prazo. Os chefes executam: mudam o status, registram tempo em minutos, criam tarefas, registram impedimentos e comentam.
2. **Até a segunda, 18h**, cada chefe envia a **atualização semanal**. O relato é montado pelo servidor a partir das ações da seção e das subseções; o chefe acrescenta observações e envia.
3. **Na terça**, o Diretor ou o Apoio abre o **Modo Reunião** na TV: combinados, visão geral das seções em ordem de necessidade (vermelhas primeiro) e uma tela por seção, com ações, pedidos de prazo e decisões ao vivo.
4. **Ao encerrar**, o sistema gera a **ata em rascunho**. Ela é revisada, editada e enviada (nesta versão, "enviar" libera a leitura dentro do sistema).

## Semáforo

Cada unidade de acompanhamento recebe uma cor, com forma e texto (nunca só cor):

| Cor | Quando |
| --- | --- |
| Vermelho | Há ação atrasada, ou impedimento crítico aberto em ação em curso |
| Amarelo | A atualização não foi enviada, ou há ação vencendo em até 2 dias |
| Verde | Todo o resto |

A cor de uma seção considera as subseções (vale a pior). Os limiares ainda precisam ser validados com o Diretor.

## Perfis

| Perfil | Resumo |
| --- | --- |
| Diretor | Direciona ações, decide prazos, conduz a reunião, gere estrutura e contas de Chefe e Apoio |
| Apoio do Diretor | Quase igual ao Diretor, sem Estrutura; decide prazos apenas dentro de reunião em andamento |
| Chefe de seção | Vê e age na própria seção e nas subordinadas; envia a atualização semanal. Pode haver um suplente com os mesmos poderes |
| Membro da equipe | Lê tudo da própria seção e age só no que é dele (atribuído ou criado por ele) |
| Consulta | Só lê as ações das unidades |
| Administrador | Acesso total dentro da empresa, inclusive contas, perfis e estrutura |
| Plataforma | Administra as empresas; não lê dados de negócio |

Detalhes de permissões em [regras-de-negocio.md](regras-de-negocio.md) e [api.md](api.md).

## Telas principais

- **Painel** (gestão): semáforo por unidade, com detalhe de cada seção.
- **Direcionar ação** e **Ações**: criação e acompanhamento, com filtros.
- **Pedidos de prazo**: decisão do Diretor (ou do Apoio, em reunião).
- **Início**, **Minha atualização**, **Minhas ações**, **Histórico** (chefe).
- **Agenda**: calendário mensal com ações (pelo prazo) e tarefas (pela data); todos os perfis.
- **Combinados**, **Reuniões e atas**, **Modo Reunião**.
- **Produtividade**: indicadores das unidades.
- **Estrutura / Contas / Configuração**: seções, pessoas, vocabulário, cabeçalho da ata.
- **Quadro de avisos** no Início do chefe.
- **Empresas** (perfil Plataforma).

No celular (até 760 px) o sistema vira um app instalável, com abas inferiores e a folha "Mais".

## Limites conhecidos

- Sem e-mail nem lembretes; "enviar ata" apenas libera a leitura no sistema.
- Sem fechamento automático da segunda 18h: o chefe ainda consegue enviar correção depois.
- Sem anotações privadas do Diretor.
- O Modo Reunião não foi validado com TV/HDMI reais nem em navegadores além do Chromium.
- A validação com o projeto Supabase real depende do roteiro de [HOMOLOGACAO.md](../HOMOLOGACAO.md).
- Não crie a 2ª empresa antes de a migração 23 estar aplicada em produção.
