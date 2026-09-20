// Dados FICTÍCIOS para demonstração. Nada aqui é dado real do órgão.
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { openDb, estaVazio } from './db.js';
import { addDays, agora, hojeISO, refTerca } from './logic.js';
import { aplicarMigracoes } from './migrations.js';

export async function seed(db) {
  await aplicarMigracoes(db);
  const hoje = hojeISO();
  const ref = refTerca(agora());
  const ant = addDays(ref, -7);
  const ts = (data, hora = '09:00:00') => `${data}T${hora}`;
  const j = JSON.stringify;

  const secoes = [
    [1, 'Centro de Planejamento Estratégico', 'CPE', 'centro', null, 1],
    [2, 'Centro de Orçamento e Finanças', 'COF', 'centro', null, 2],
    [3, 'Centro de Gestão de Processos', 'CGP', 'centro', null, 3],
    [4, 'Centro de Informações Gerenciais', 'CIG', 'centro', null, 4],
    [5, 'Centro de Convênios e Parcerias', 'CCP', 'centro', null, 5],
    [6, 'Coordenação de Projetos Especiais', 'CPR', 'coordenacao', null, 6],
    [7, 'Seção de Indicadores', 'IND', 'subsecao', 1, 1],
    [8, 'Seção de Mapeamento de Processos', 'MAP', 'subsecao', 3, 1],
    [9, 'Núcleo de Painéis', 'PNL', 'subsecao', 7, 1],
  ];
  const usuarios = [
    [1, 'Diretor (demonstração)', 'diretor', null],
    [2, 'Apoio do Diretor (demonstração)', 'apoio', null],
    [3, 'Ana Ribeiro', 'chefe', 1],
    [4, 'Bruno Tavares', 'chefe', 2],
    [5, 'Carla Menezes', 'chefe', 3],
    [6, 'Daniel Nogueira', 'chefe', 4],
    [7, 'Elisa Prado', 'chefe', 5],
    [8, 'Fábio Amaral', 'chefe', 6],
    [9, 'Gabriela Sena', 'chefe', 7],
  ];

  await db.transaction(async () => {
    const insS = db.prepare('insert into secoes (id,nome,sigla,tipo,pai_id,ordem,criada_em) values (?,?,?,?,?,?,?)');
    for (const s of secoes) await insS.run(...s, ts(addDays(ant, -60)));
    const insU = db.prepare('insert into usuarios (id,nome,email,perfil,secao_id) values (?,?,?,?,?)');
    for (const [id, nome, perfil, secao] of usuarios) {
      const email = `${nome.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(/ /g, '.')}@exemplo.invalid`;
      await insU.run(id, nome, email, perfil, secao);
    }
    const setChefe = db.prepare('update secoes set chefe_id = ? where id = ?');
    for (const [id, , perfil, secao] of usuarios) if (perfil === 'chefe') await setChefe.run(id, secao);

    const insD = db.prepare(
      'insert into diretrizes (titulo,detalhe,destino,prazo,prioridade,criado_por,criado_em) values (?,?,?,?,?,?,?)',
    );
    const insA = db.prepare(
      `insert into acoes (diretriz_id,secao_id,titulo,detalhe,status,prazo,prazo_original,prioridade,interna,encerrada,concluida_em,criada_em)
       values (?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const insT = db.prepare('insert into tempo (acao_id,usuario_id,data,minutos,criado_em) values (?,?,?,?,?)');
    const insCom = db.prepare('insert into acao_comentarios (acao_id,usuario_id,texto,criado_em) values (?,?,?,?)');
    const chefeDe = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7, 6: 8, 7: 9 };

    const diretriz = async (titulo, detalhe, destino, prazoOff, prio, alvos) => {
      const prazo = addDays(hoje, prazoOff);
      const d = (await insD.run(titulo, detalhe, destino, prazo, prio, 1, ts(ant, '11:00:00'))).lastInsertRowid;
      for (const [secaoId, status, minutos, encerrada] of alvos) {
        const concl = status === 'concluida' ? ts(addDays(hoje, -1), '16:00:00') : null;
        const a = (await insA.run(d, secaoId, titulo, detalhe, status, prazo, prazo, prio, 0, encerrada ? 1 : 0, concl, ts(ant, '11:00:00'))).lastInsertRowid;
        await insCom.run(a, 1, 'Ação demandada pelo Diretor.', ts(ant, '11:00:00'));
        if (minutos) await insT.run(a, chefeDe[secaoId], addDays(hoje, -2), minutos, ts(addDays(hoje, -2), '15:00:00'));
      }
      return d;
    };

    await diretriz('Enviar o plano de trabalho do próximo trimestre', 'Usar o modelo padrão do Departamento, com metas, responsáveis e marcos.', 'todos', 10, 'alta', [
      [1, 'em_andamento', 90],
      [2, 'a_fazer', 0],
      [3, 'em_andamento', 60],
      [4, 'concluida', 180],
      [5, 'a_fazer', 0],
      [6, 'em_andamento', 45],
    ]);
    await diretriz('Consolidar a proposta de remanejamento orçamentário', 'Consolidar os saldos por programa e indicar as fontes de cobertura.', 'especificos', -2, 'alta', [
      [2, 'em_andamento', 150],
      [1, 'concluida', 240],
    ]);
    await diretriz('Revisar o fluxo de aprovação de convênios', 'Mapear as etapas atuais e propor a redução de pontos de espera.', 'especificos', 2, 'alta', [[3, 'a_fazer', 0]]);
    await diretriz('Atualizar o cadastro de contatos da seção', 'Conferir nomes, telefones e e-mails institucionais.', 'todos', -6, 'media', [
      [1, 'concluida', 45, 1],
      [2, 'concluida', 40, 1],
      [3, 'concluida', 50, 0],
      [4, 'concluida', 30, 1],
      [5, 'bloqueada', 35],
      [6, 'concluida', 25, 0],
    ]);
    await diretriz('Publicar o painel de indicadores do mês', 'Painel validado com a Seção de Indicadores.', 'especificos', 5, 'media', [[4, 'em_andamento', 120]]);

    // Ações internas de subseções: contam no semáforo do Centro, mas o Diretor só vê o resumo.
    await insA.run(null, 7, 'Padronizar as fichas de indicadores', 'Ação interna do Centro de Planejamento.', 'em_andamento', addDays(hoje, 1), addDays(hoje, 1), 'media', 1, 0, null, ts(ant));
    await insA.run(null, 8, 'Mapear o processo de solicitação de diárias', 'Ação interna do Centro de Gestão de Processos.', 'em_andamento', addDays(hoje, -1), addDays(hoje, -1), 'media', 1, 0, null, ts(ant));

    const pend = await db.prepare('select id, prazo from acoes where secao_id = 5 and status = ?').get('bloqueada');
    await db.prepare(
      `insert into pedidos_prazo (acao_id,usuario_id,prazo_atual,novo_prazo,justificativa,criado_em) values (?,?,?,?,?,?)`,
    ).run(pend.id, 7, pend.prazo, addDays(hoje, 7), 'Aguardamos o retorno de dois órgãos parceiros para concluir a conferência.', ts(addDays(hoje, -1), '10:30:00'));

    const insAt = db.prepare(
      `insert into atualizacoes (secao_id,semana,versao,feito,proximo,impedimentos,critico,apoio,usuario_id,enviada_em) values (?,?,?,?,?,?,?,?,?,?)`,
    );
    const anterior = [
      [1, ['Revisão das metas do PPA com a Assessoria'], ['Fechar o plano de trabalho do trimestre', 'Reunir a equipe de indicadores'], [], ''],
      [2, ['Fechamento do relatório de execução de agosto'], ['Enviar a proposta de remanejamento ao Diretor'], ['Aguardando saldo atualizado do sistema financeiro'], 'Preciso de liberação de acesso ao módulo de saldos.'],
      [3, ['Levantamento dos fluxos de convênios'], ['Revisar o fluxo de aprovação de convênios'], [], ''],
      [4, ['Carga de dados de julho concluída'], ['Publicar o painel de indicadores do mês'], [], ''],
      [5, ['Reunião com três órgãos parceiros'], ['Atualizar o cadastro de contatos'], ['Dois parceiros não responderam ao pedido de dados'], 'Um ofício do Diretor aos parceiros ajudaria.'],
      [6, ['Cronograma do projeto especial validado'], ['Iniciar a etapa de homologação'], [], ''],
    ];
    for (const [secao, extras, prox, imp, apoio] of anterior) {
      await insAt.run(secao, ant, 1, j({ previstos: [], extras }), j(prox), j(imp), 0, apoio, chefeDe[secao], ts(addDays(ant, 6), '15:20:00'));
    }
    await insAt.run(1, ref, 1, j({ previstos: [{ texto: 'Fechar o plano de trabalho do trimestre', cumprido: false }, { texto: 'Reunir a equipe de indicadores', cumprido: true }], extras: ['Apresentação ao gabinete'] }), j(['Enviar o plano de trabalho ao Diretor']), j([]), 0, '', 3, ts(addDays(ref, -2), '14:10:00'));
    await insAt.run(3, ref, 1, j({ previstos: [{ texto: 'Revisar o fluxo de aprovação de convênios', cumprido: false }], extras: ['Reunião com a Procuradoria sobre o fluxo'] }), j(['Concluir a revisão do fluxo']), j(['Sistema de convênios fora do ar desde segunda-feira']), 1, 'Preciso de apoio da TI para restabelecer o sistema.', 5, ts(addDays(ref, -2), '16:40:00'));
    await insAt.run(4, ref, 1, j({ previstos: [{ texto: 'Publicar o painel de indicadores do mês', cumprido: false }], extras: ['Validação dos dados com a Seção de Indicadores'] }), j(['Publicar o painel', 'Iniciar a carga de dados de agosto']), j([]), 0, '', 6, ts(addDays(ref, -3), '09:50:00'));

    const insC = db.prepare('insert into combinados (texto,ordem,ativo,arquivado,criado_por,criado_em,alterado_em) values (?,?,?,?,?,?,?)');
    const combinados = [
      'Celulares no silencioso e fora da mesa.',
      'Seções no verde não precisam de relato oral.',
      'Cada fala traz o que foi entregue, o que vem a seguir e o que trava.',
      'Decisões e prazos são registrados aqui, na hora.',
      'Pedidos de apoio são tratados ao final de cada seção.',
    ];
    for (const [i, t] of combinados.entries()) await insC.run(t, i + 1, 1, 0, 1, ts(addDays(ant, -30)), ts(addDays(ant, -30)));
    await db.prepare('insert into config (chave,valor) values (?,?)').run('combinados_frequencia', 'sempre');

    const rid = (await db
      .prepare(
        `insert into reunioes (data,semana,iniciada_em,encerrada_em,status,combinados_snapshot,ata_texto,enviada_em,criada_por)
         values (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        ant,
        ant,
        ts(ant, '10:04:00'),
        ts(ant, '11:12:00'),
        'enviada',
        j(combinados.map((texto, i) => ({ id: i + 1, texto, ordem: i + 1 }))),
        `ATA DA REUNIÃO SEMANAL (exemplo)\n\nDecisões:\n- [COF] Priorizar a proposta de remanejamento; nova data de entrega definida pelo Diretor.\n- [CCP] Diretor enviará ofício aos parceiros que não responderam.\n\nNovas ações:\n- [Todos os Centros] Enviar o plano de trabalho do próximo trimestre.`,
        ts(ant, '15:00:00'),
        2,
      )).lastInsertRowid;
    const insDec = db.prepare('insert into decisoes (reuniao_id,secao_id,texto,criada_em,criada_por) values (?,?,?,?,?)');
    await insDec.run(rid, 2, 'Priorizar a proposta de remanejamento; nova data de entrega definida pelo Diretor.', ts(ant, '10:30:00'), 2);
    await insDec.run(rid, 5, 'Diretor enviará ofício aos parceiros que não responderam.', ts(ant, '10:50:00'), 2);
    // IDs explícitos não avançam identities PostgreSQL. RESTART participa do
    // rollback desta carga, ao contrário de setval em uma sequência existente.
    if (db.isPg) {
      // Valida as referências adiadas antes do ALTER TABLE, que não admite
      // eventos de constraint pendentes na mesma transação.
      await db.exec('set constraints all immediate');
      for (const tabela of ['secoes', 'usuarios']) {
        const { proximo } = await db.prepare(`select max(id) + 1 as proximo from ${tabela}`).get();
        await db.exec(`alter table ${tabela} alter column id restart with ${proximo}`);
      }
    }
  });
}

export async function semearSeVazio(db) {
  if (await estaVazio(db)) await seed(db);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.env.DATABASE_URL) throw new Error('O seed de demonstração exige DATABASE_URL vazia; use um SQLite isolado.');
  const arquivo = process.env.SGC_DB || 'data/sgc.db';
  if (process.argv.includes('--reset')) {
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(arquivo + ext, { force: true });
  }
  const db = openDb(arquivo);
  await semearSeVazio(db);
  await db.close();
  console.log(`Banco pronto em ${arquivo}`);
}
