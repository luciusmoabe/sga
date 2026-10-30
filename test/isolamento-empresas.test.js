// Multi-empresa, fase 2: duas empresas no mesmo banco e nenhum dado passa de uma para a outra, nem por leitura nem por
// gravação, nem conhecendo o número do registro. Roda com a rede de segurança de SQL ligada (ver server/empresa.js).
process.env.SGC_NOW = '2026-09-19T10:00:00';
process.env.SGC_LINT_EMPRESA = '1';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

const PRAZO = '2026-12-31';

async function duasEmpresas(t) {
  const db = openDb(':memory:');
  await seed(db);
  const A = { id: 1, diretor: 1, apoio: 2, chefeCpe: 3, chefeCof: 4, admin: 10, cpe: 1, cof: 2 };
  // Empresa B, com nomes que nenhum dado da A tem.
  await db.prepare("insert into empresas (nome, sigla, slug, criada_em) values ('Empresa ZB', 'ZB', 'zb', '2026-09-01')").run();
  const B = { id: 2 };
  const secao = async (nome, sigla, tipo, pai, ordem) => (await db.prepare('insert into secoes (nome, sigla, tipo, pai_id, ordem, criada_em, empresa_id) values (?,?,?,?,?,?,2)')
    .run(nome, sigla, tipo, pai, ordem, '2026-09-01T00:00:00')).lastInsertRowid;
  const usuario = async (nome, perfil, secaoId = null) => (await db.prepare('insert into usuarios (nome, email, perfil, secao_id, empresa_id) values (?,?,?,?,2)')
    .run(`${nome} ZB`, `${nome.toLowerCase().replace(/ /g, '.')}@zb.invalid`, perfil, secaoId)).lastInsertRowid;
  B.alfa = await secao('Centro Alfa ZB', 'ZBA', 'centro', null, 1);
  B.sub = await secao('Subseção Sigma ZB', 'ZBS', 'subsecao', B.alfa, 1);
  B.beta = await secao('Centro Beta ZB', 'ZBB', 'centro', null, 2);
  B.diretor = await usuario('Diretor', 'diretor');
  B.apoio = await usuario('Apoio', 'apoio');
  B.admin = await usuario('Administrador', 'administrador');
  B.consulta = await usuario('Consulta', 'consulta');
  B.chefeAlfa = await usuario('Chefe Alfa', 'chefe', B.alfa);
  B.chefeBeta = await usuario('Chefe Beta', 'chefe', B.beta);
  B.membro = await usuario('Membro Alfa', 'membro', B.alfa);
  await db.prepare('update secoes set chefe_id = ? where id = ?').run(B.chefeAlfa, B.alfa);
  await db.prepare('update secoes set chefe_id = ? where id = ?').run(B.chefeBeta, B.beta);

  const server = createApp(db, { auth: { mode: 'demo' } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((ok) => server.close(ok)); await db.close(); });
  const call = async (uid, method, caminho, body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api${caminho}`, {
      method, headers: { 'x-user-id': String(uid), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  const ok = async (resposta, status = 200) => { assert.equal(resposta.status, status, JSON.stringify(resposta.data)); return resposta.data; };

  // Dados da B, criados pela própria API (o que também prova que a B funciona).
  const dir = await ok(await call(B.diretor, 'POST', '/diretrizes', { titulo: 'Diretriz ZB', prazo: PRAZO, destino: 'todos' }), 201);
  assert.equal(dir.acoes_criadas, 2, 'todos os Centros da B, e só eles');
  B.acaoAlfa = (await db.prepare('select id from acoes where empresa_id = 2 and secao_id = ?').get(B.alfa)).id;
  B.acaoBeta = (await db.prepare('select id from acoes where empresa_id = 2 and secao_id = ?').get(B.beta)).id;
  B.acaoPropria = (await ok(await call(B.chefeAlfa, 'POST', '/acoes', { titulo: 'Ação própria ZB', prazo: PRAZO }), 201)).id;
  await ok(await call(B.chefeAlfa, 'PATCH', `/acoes/${B.acaoAlfa}`, { status: 'em_andamento' }));
  await ok(await call(B.chefeAlfa, 'POST', `/acoes/${B.acaoAlfa}/tempo`, { minutos: 30 }), 201);
  await ok(await call(B.chefeAlfa, 'POST', `/acoes/${B.acaoAlfa}/comentarios`, { texto: 'Comentário ZB' }), 201);
  B.tarefa = (await ok(await call(B.chefeAlfa, 'POST', `/acoes/${B.acaoAlfa}/checklist`, { texto: 'Tarefa ZB' }), 201)).id;
  await ok(await call(B.chefeAlfa, 'POST', `/acoes/${B.acaoAlfa}/impedimentos`, { descricao: 'Impedimento ZB', critico: true }), 201);
  await ok(await call(B.chefeAlfa, 'POST', `/acoes/${B.acaoAlfa}/pedido-prazo`, { novo_prazo: '2027-01-31', justificativa: 'Motivo ZB' }), 201);
  B.pedido = (await db.prepare('select p.id from pedidos_prazo p join acoes a on a.id = p.acao_id where a.empresa_id = 2').get()).id;
  B.aviso = (await ok(await call(B.diretor, 'POST', '/avisos', { texto: 'Aviso ZB', data_fim: '2026-12-31' }), 201)).aviso.id;
  B.combinado = (await ok(await call(B.diretor, 'POST', '/combinados', { texto: 'Combinado ZB' }), 201)).combinado.id;
  await ok(await call(B.diretor, 'PUT', '/config', { combinados_frequencia: 'sempre', reuniao_hora: '15:00' }));
  await ok(await call(B.chefeAlfa, 'PUT', '/atualizacao', { observacoes: 'Observação ZB' }));
  B.reuniao = (await ok(await call(B.diretor, 'POST', '/reunioes/iniciar'), 201)).reuniao.id;
  await ok(await call(B.diretor, 'POST', `/reunioes/${B.reuniao}/decisoes`, { texto: 'Decisão ZB', secao_id: B.alfa }), 201);
  // A empresa A também tem reunião em andamento ao mesmo tempo (uma por empresa).
  A.reuniao = (await ok(await call(A.diretor, 'POST', '/reunioes/iniciar'), 201)).reuniao.id;
  A.acao = (await db.prepare('select id from acoes where empresa_id = 1 and secao_id = 1 order by id limit 1').get()).id;
  A.acaoCof = (await db.prepare('select id from acoes where empresa_id = 1 and secao_id = 2 order by id limit 1').get()).id;
  A.aviso = (await ok(await call(A.diretor, 'POST', '/avisos', { texto: 'Aviso da A', data_fim: '2026-12-31' }), 201)).aviso.id;
  A.combinado = (await ok(await call(A.diretor, 'POST', '/combinados', { texto: 'Combinado da A' }), 201)).combinado.id;
  return { db, call, ok, A, B };
}

/** Textos que identificam os dados de uma empresa, para procurar nas respostas da outra. */
async function marcadores(db, empresa) {
  const consultas = [
    'select nome v from secoes where empresa_id = ?', 'select sigla v from secoes where empresa_id = ?',
    'select nome v from usuarios where empresa_id = ?', 'select email v from usuarios where empresa_id = ?',
    'select titulo v from acoes where empresa_id = ?', 'select titulo v from diretrizes where empresa_id = ?',
    'select texto v from combinados where empresa_id = ?', 'select texto v from avisos where empresa_id = ?',
  ];
  const textos = new Set();
  for (const sql of consultas) for (const l of await db.prepare(sql).all(empresa)) if (l.v) textos.add(l.v);
  return [...textos];
}
const vaza = (dados, alheios, proprios) => {
  const json = JSON.stringify(dados);
  return alheios.filter((m) => !proprios.includes(m) && json.includes(JSON.stringify(m)));
};

const LEITURAS = [
  '/bootstrap', '/secoes', '/usuarios', '/equipe', '/acoes?escopo=todos&situacao=abertas', '/acoes?escopo=todos&situacao=concluidas',
  '/acoes?escopo=todos&situacao=arquivadas', '/acoes?situacao=abertas', '/tarefas', '/diretrizes', '/pedidos-prazo?status=todos', '/painel', '/pauta',
  '/reunioes', '/combinados?todos=1&arquivados=1', '/config', '/avisos', '/avisos/atual', '/atualizacao', '/historico',
];

test('as leituras de cada empresa nunca trazem dados da outra', async (t) => {
  const { db, call, A, B } = await duasEmpresas(t);
  const deA = await marcadores(db, 1);
  const deB = await marcadores(db, 2);
  assert.ok(deA.length > 20 && deB.length > 10, 'há dados nas duas empresas');
  const usuariosA = [A.diretor, A.apoio, A.chefeCpe, A.chefeCof, A.admin];
  const usuariosB = [B.diretor, B.apoio, B.chefeAlfa, B.chefeBeta, B.membro, B.consulta, B.admin];
  let respostas = 0;
  for (const [uid, alheios, proprios] of [...usuariosA.map((u) => [u, deB, deA]), ...usuariosB.map((u) => [u, deA, deB])]) {
    for (const caminho of LEITURAS) {
      const r = await call(uid, 'GET', caminho);
      assert.ok(r.status < 500, `${uid} ${caminho}: ${r.status} ${JSON.stringify(r.data)}`);
      assert.deepEqual(vaza(r.data, alheios, proprios), [], `usuário ${uid} em ${caminho} recebeu dado de outra empresa`);
      respostas++;
    }
  }
  assert.ok(respostas > 200);
  // Dentro de cada empresa, o que é dela aparece.
  assert.deepEqual((await call(B.diretor, 'GET', '/painel')).data.itens.map((i) => i.secao.id).sort((a, b) => a - b), [B.alfa, B.beta]);
  assert.deepEqual((await call(A.diretor, 'GET', '/painel')).data.itens.map((i) => i.secao.id).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual((await call(B.admin, 'GET', '/secoes')).data.map((s) => s.id).sort((a, b) => a - b), [B.alfa, B.sub, B.beta]);
  assert.equal((await call(B.diretor, 'GET', '/usuarios')).data.length, 7);
  assert.equal((await call(B.consulta, 'GET', '/acoes?escopo=todos')).data.length, 3, 'a Consulta da B lê as ações dos Centros da B');
});

test('conhecer o número de um registro da outra empresa não dá acesso a ele', async (t) => {
  const { db, call, A, B } = await duasEmpresas(t);
  const acao = A.acao;
  // Leituras por número: 404.
  for (const caminho of [`/acoes/${acao}`, `/acoes/${acao}/executores`, `/acoes/${acao}/responsaveis`, `/reunioes/${A.reuniao}`, `/reunioes/${A.reuniao}/cartoes`,
    `/reunioes/${A.reuniao}/candidatos`, `/secoes/${A.cpe}/detalhe`]) {
    for (const uid of [B.diretor, B.admin]) assert.ok([403, 404].includes((await call(uid, 'GET', caminho)).status), `${uid} GET ${caminho}`);
  }
  assert.equal((await call(B.chefeAlfa, 'GET', `/acoes/${acao}`)).status, 404);
  assert.equal((await call(B.consulta, 'GET', `/acoes/${acao}`)).status, 404);
  // Gravações por número: 404 ou recusa, e nada muda.
  const antes = {
    acao: await db.prepare('select * from acoes where id = ?').get(acao),
    secao: await db.prepare('select * from secoes where id = ?').get(1),
    usuario: await db.prepare('select * from usuarios where id = ?').get(A.chefeCpe),
    aviso: await db.prepare('select * from avisos where id = ?').get(A.aviso),
    combinado: await db.prepare('select * from combinados where id = ?').get(A.combinado),
    reuniao: await db.prepare('select * from reunioes where id = ?').get(A.reuniao),
    config: await db.prepare('select * from config where empresa_id = 1 order by chave').all(),
    totais: await db.prepare('select (select count(*) from acao_comentarios) c, (select count(*) from tempo) t, (select count(*) from acao_checklist) k, (select count(*) from impedimentos) i, (select count(*) from decisoes) d, (select count(*) from acoes where empresa_id = 1) a').get(),
  };
  const tentativas = [
    ['PATCH', `/acoes/${acao}`, { titulo: 'invadida', status: 'em_andamento' }],
    ['DELETE', `/acoes/${acao}`], ['POST', `/acoes/${acao}/arquivar`, {}], ['POST', `/acoes/${acao}/desarquivar`, {}],
    ['POST', `/acoes/${acao}/tempo`, { minutos: 10 }], ['POST', `/acoes/${acao}/comentarios`, { texto: 'invasor' }],
    ['POST', `/acoes/${acao}/vista`, {}], ['POST', `/acoes/${acao}/checklist`, { texto: 'invasor' }],
    ['POST', `/acoes/${acao}/impedimentos`, { descricao: 'invasor' }], ['POST', `/acoes/${acao}/pedido-prazo`, { novo_prazo: '2030-01-01', justificativa: 'x' }],
    ['POST', `/acoes/${acao}/redirecionar`, { secao_id: B.beta, motivo: 'x' }], ['POST', `/acoes/${acao}/encerrar`, {}],
    ['POST', `/acoes/${acao}/validar`, {}], ['POST', `/acoes/${acao}/devolver`, { comentario: 'x' }],
    ['PATCH', `/secoes/${A.cpe}`, { nome: 'Invadida', ativa: false, chefe_id: B.chefeAlfa }], ['DELETE', `/secoes/${A.cpe}`],
    ['PATCH', `/usuarios/${A.chefeCpe}`, { nome: 'Invadido', ativo: false }], ['DELETE', `/usuarios/${A.chefeCpe}`],
    ['PATCH', `/usuarios/${A.chefeCpe}/login`, { senha: 'senha-nova-123' }],
    ['PATCH', `/avisos/${A.aviso}`, { texto: 'invadido', ativo: false }], ['DELETE', `/avisos/${A.aviso}`],
    ['PATCH', `/combinados/${A.combinado}`, { texto: 'invadido', arquivado: true }],
    ['POST', `/reunioes/${A.reuniao}/decisoes`, { texto: 'invasor' }], ['POST', `/reunioes/${A.reuniao}/encerrar`, {}],
    ['POST', `/reunioes/${A.reuniao}/reabrir`, {}], ['PUT', `/reunioes/${A.reuniao}/ata`, { ata_texto: 'invadida' }], ['DELETE', `/reunioes/${A.reuniao}`, {}],
    ['POST', `/reunioes/${A.reuniao}/enviar-ata`, {}], ['PUT', `/reunioes/${A.reuniao}/participantes`, { usuarios: [B.chefeAlfa] }],
    ['POST', `/reunioes/${A.reuniao}/informacoes`, { texto: 'invasor' }], ['POST', `/reunioes/${A.reuniao}/acoes`, { titulo: 'x', prazo: PRAZO, destino: 'todos' }],
    ['POST', '/diretrizes/999999/secoes', { secoes: [B.beta] }], ['DELETE', `/atualizacoes/${(await db.prepare('select id from atualizacoes where empresa_id = 1 limit 1').get()).id}`],
  ];
  for (const uid of [B.diretor, B.admin, B.apoio, B.chefeAlfa]) {
    for (const [metodo, caminho, corpo] of tentativas) {
      const r = await call(uid, metodo, caminho, corpo);
      assert.ok([400, 403, 404, 409].includes(r.status), `${uid} ${metodo} ${caminho}: ${r.status} ${JSON.stringify(r.data)}`);
    }
  }
  assert.deepEqual(await db.prepare('select * from acoes where id = ?').get(acao), antes.acao);
  assert.deepEqual(await db.prepare('select * from secoes where id = ?').get(1), antes.secao);
  assert.deepEqual(await db.prepare('select * from usuarios where id = ?').get(A.chefeCpe), antes.usuario);
  assert.deepEqual(await db.prepare('select * from avisos where id = ?').get(A.aviso), antes.aviso);
  assert.deepEqual(await db.prepare('select * from combinados where id = ?').get(A.combinado), antes.combinado);
  assert.deepEqual(await db.prepare('select * from reunioes where id = ?').get(A.reuniao), antes.reuniao);
  assert.deepEqual(await db.prepare('select * from config where empresa_id = 1 order by chave').all(), antes.config);
  assert.deepEqual(await db.prepare('select (select count(*) from acao_comentarios) c, (select count(*) from tempo) t, (select count(*) from acao_checklist) k, (select count(*) from impedimentos) i, (select count(*) from decisoes) d, (select count(*) from acoes where empresa_id = 1) a').get(), antes.totais,
    'nenhum registro da A foi criado, alterado ou apagado');
});

test('apontar para seções, usuários e reuniões da outra empresa é recusado ao criar e ao editar', async (t) => {
  const { db, call, A, B } = await duasEmpresas(t);
  const cria = async (uid, corpo) => call(uid, 'POST', '/acoes', corpo);
  // Diretriz para Centro da outra empresa
  assert.equal((await call(B.diretor, 'POST', '/diretrizes', { titulo: 'x', prazo: PRAZO, destino: 'especificos', secoes: [A.cpe] })).status, 400);
  assert.equal((await call(B.admin, 'POST', '/diretrizes', { titulo: 'x', prazo: PRAZO, destino: 'especificos', secoes: [B.alfa, A.cof] })).status, 400);
  // Ação em seção da outra empresa
  assert.equal((await cria(B.diretor, { titulo: 'x', prazo: PRAZO, secao_id: A.cpe })).status, 409);
  assert.equal((await cria(B.admin, { titulo: 'x', prazo: PRAZO, secao_id: A.cof })).status, 409);
  // Responsável de outra empresa
  assert.equal((await cria(B.chefeAlfa, { titulo: 'x', prazo: PRAZO, responsavel_id: A.chefeCpe })).status, 400);
  assert.equal((await call(B.chefeAlfa, 'PATCH', `/acoes/${B.acaoAlfa}`, { responsavel_id: A.chefeCpe })).status, 400);
  // Tarefa com responsável de outra empresa
  assert.equal((await call(B.chefeAlfa, 'PATCH', `/acoes/${B.acaoAlfa}/checklist/${B.tarefa}`, { responsavel_id: A.chefeCpe })).status, 400);
  // Redirecionar para seção da outra empresa
  assert.equal((await call(B.diretor, 'POST', `/acoes/${B.acaoAlfa}/redirecionar`, { secao_id: A.cpe, motivo: 'x' })).status, 409);
  // Estrutura: pai, chefe e vínculos de outra empresa
  assert.equal((await call(B.diretor, 'POST', '/secoes', { nome: 'Sub ZB', tipo: 'subsecao', pai_id: A.cpe })).status, 400);
  assert.equal((await call(B.diretor, 'PATCH', `/secoes/${B.beta}`, { chefe_id: A.chefeCpe })).status, 400);
  assert.equal((await call(B.diretor, 'PATCH', `/secoes/${B.sub}`, { pai_id: A.cpe })).status, 400);
  assert.equal((await call(B.diretor, 'PATCH', `/usuarios/${B.chefeBeta}`, { secao_id: A.cof })).status, 400);
  assert.equal((await call(B.diretor, 'PATCH', `/usuarios/${B.membro}`, { secao_id: A.cpe })).status, 400);
  // Decisão e participantes com referências da outra empresa
  assert.equal((await call(B.diretor, 'POST', `/reunioes/${B.reuniao}/decisoes`, { texto: 'x', secao_id: A.cpe })).status, 400);
  assert.equal((await call(B.diretor, 'PUT', `/reunioes/${B.reuniao}/participantes`, { usuarios: [A.chefeCpe] })).status, 400);
  // Pedido de prazo da outra empresa
  assert.equal((await call(B.diretor, 'POST', `/pedidos-prazo/${(await db.prepare('select p.id from pedidos_prazo p join acoes a on a.id = p.acao_id where a.empresa_id = 1 limit 1').get() ?? { id: 999999 }).id}/decidir`, { aprovar: true })).status, 404);
  // Decidir pedido da B apontando para reunião da A
  assert.equal((await call(B.diretor, 'POST', `/pedidos-prazo/${B.pedido}/decidir`, { aprovar: true, reuniao_id: A.reuniao })).status, 409);
  // Nada disso deixou rastro
  assert.equal((await db.prepare('select count(*) n from acoes where empresa_id = 2').get()).n, 3);
  assert.equal((await db.prepare("select count(*) n from acoes a join secoes s on s.id = a.secao_id where a.empresa_id != s.empresa_id").get()).n, 0, 'nenhuma ação em seção de outra empresa');
  assert.equal((await db.prepare('select count(*) n from usuarios u join secoes s on s.id = u.secao_id where u.empresa_id != s.empresa_id').get()).n, 0);
  assert.equal((await db.prepare('select count(*) n from secoes s join secoes p on p.id = s.pai_id where s.empresa_id != p.empresa_id').get()).n, 0);
});

test('configuração, avisos, combinados, reunião em andamento e direcionamentos são independentes por empresa', async (t) => {
  const { db, call, ok, A, B } = await duasEmpresas(t);
  const cfgA = (await call(A.diretor, 'GET', '/config')).data;
  const cfgB = (await call(B.diretor, 'GET', '/config')).data;
  assert.equal(cfgB.reuniao_hora, '15:00');
  assert.notEqual(cfgA.reuniao_hora, '15:00');
  await ok(await call(A.diretor, 'PUT', '/config', { combinados_frequencia: 'quando_mudarem', reuniao_hora: '09:30' }));
  assert.equal((await call(B.diretor, 'GET', '/config')).data.reuniao_hora, '15:00', 'mudar a A não muda a B');
  assert.equal((await call(B.diretor, 'GET', '/config')).data.combinados_frequencia, 'sempre');
  // Cabeçalho da ata por empresa
  await ok(await call(B.diretor, 'PUT', '/config/ata', { ata_cabecalho: 'Cabeçalho ZB', ata_brasao: '' }));
  assert.equal((await call(A.diretor, 'GET', '/config')).data.ata_cabecalho ?? '', (cfgA.ata_cabecalho ?? ''));
  assert.equal((await call(B.diretor, 'GET', '/config')).data.ata_cabecalho, 'Cabeçalho ZB');
  // Avisos: cada um vê o seu
  assert.equal((await call(B.chefeAlfa, 'GET', '/avisos/atual')).data.aviso.texto, 'Aviso ZB');
  assert.equal((await call(A.chefeCpe, 'GET', '/avisos/atual')).data.aviso.texto, 'Aviso da A');
  // Combinados
  assert.deepEqual((await call(B.diretor, 'GET', '/combinados')).data.itens.map((c) => c.texto), ['Combinado ZB']);
  assert.ok((await call(A.diretor, 'GET', '/combinados')).data.itens.every((c) => c.texto !== 'Combinado ZB'));
  // Reunião: uma em andamento por empresa; encerrar a da B não encerra a da A
  assert.equal((await call(B.diretor, 'POST', '/reunioes/iniciar')).data.retomada, true);
  await ok(await call(B.diretor, 'POST', `/reunioes/${B.reuniao}/encerrar`, {}));
  assert.equal((await db.prepare('select status from reunioes where id = ?').get(A.reuniao)).status, 'em_andamento');
  assert.equal((await call(A.diretor, 'POST', '/reunioes/iniciar')).data.retomada, true);
  // Ata da B só com dados da B
  const ata = (await db.prepare('select ata_texto from reunioes where id = ?').get(B.reuniao)).ata_texto;
  assert.ok(ata.includes('Decisão ZB') && ata.includes('ZBA'));
  assert.ok(!ata.includes('CPE') && !ata.includes('Diretor (demonstração)'));
  // "Todos os Centros" da A não chega à B, e o contrário
  const antesB = (await db.prepare('select count(*) n from acoes where empresa_id = 2').get()).n;
  await ok(await call(A.diretor, 'POST', '/diretrizes', { titulo: 'Diretriz da A', prazo: PRAZO, destino: 'todos' }), 201);
  assert.equal((await db.prepare('select count(*) n from acoes where empresa_id = 2').get()).n, antesB);
  const depoisA = (await db.prepare('select count(*) n from acoes where empresa_id = 1').get()).n;
  await ok(await call(B.diretor, 'POST', '/diretrizes', { titulo: 'Outra ZB', prazo: PRAZO, destino: 'todos' }), 201);
  assert.equal((await db.prepare('select count(*) n from acoes where empresa_id = 1').get()).n, depoisA);
  // Acrescentar seções: só da própria empresa
  const dirB = (await call(B.diretor, 'GET', '/diretrizes')).data[0];
  assert.equal((await call(B.diretor, 'POST', `/diretrizes/${dirB.id}/secoes`, { secoes: [A.cpe] })).status, 400);
  // Quadro de equipe e estrutura ficam na empresa
  assert.deepEqual((await call(B.chefeAlfa, 'GET', '/equipe')).data.map((m) => m.id), [B.membro]);
  assert.ok((await call(A.admin, 'GET', '/usuarios')).data.every((u) => u.id <= 10));
});

test('a rede de segurança acusa consulta a tabela raiz sem empresa', async () => {
  const { semFiltroDeEmpresa } = await import('../server/empresa.js');
  assert.deepEqual(semFiltroDeEmpresa('select * from acoes where id = ?'), ['acoes']);
  assert.deepEqual(semFiltroDeEmpresa('update secoes set nome = ? where id = ?'), ['secoes']);
  assert.deepEqual(semFiltroDeEmpresa('select * from acoes a join secoes s on s.id = a.secao_id where a.empresa_id = ? and a.id in (select id from acoes)'), ['acoes', 'acoes'], 'cada tabela raiz precisa do seu filtro');
  assert.equal(semFiltroDeEmpresa('select * from acoes where id = ? and empresa_id = ?'), null);
  assert.equal(semFiltroDeEmpresa("select * from tempo t join acoes a on a.id = t.acao_id where t.acao_id = ?"), null, 'junção por chave primária parte de linha já filtrada');
  assert.equal(semFiltroDeEmpresa("select id /*global*/ from usuarios where lower(email) = ?"), null);
  assert.equal(semFiltroDeEmpresa("select 'from acoes' x from tempo"), null, 'texto entre aspas não conta');
});

test('o brasão da esquerda da ata é opcional e próprio de cada empresa', async (t) => {
  const { call, ok, A, B } = await duasEmpresas(t);
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const antesA = (await call(A.diretor, 'GET', '/config')).data;
  assert.equal(antesA.ata_brasao_esq, undefined, 'a Empresa 1 ainda não escolheu (o cliente usa o brasão antigo)');
  await ok(await call(B.diretor, 'PUT', '/config/ata', { ata_cabecalho: 'ZB', ata_brasao: '', ata_brasao_esq: PNG }));
  assert.equal((await call(B.diretor, 'GET', '/config')).data.ata_brasao_esq, PNG);
  assert.equal((await call(A.diretor, 'GET', '/config')).data.ata_brasao_esq, undefined);
  // Sem informar o brasão da esquerda, o salvo não muda; vazio remove.
  await ok(await call(B.diretor, 'PUT', '/config/ata', { ata_cabecalho: 'ZB 2', ata_brasao: '' }));
  assert.equal((await call(B.diretor, 'GET', '/config')).data.ata_brasao_esq, PNG);
  await ok(await call(B.diretor, 'PUT', '/config/ata', { ata_cabecalho: 'ZB 2', ata_brasao: '', ata_brasao_esq: '' }));
  assert.equal((await call(B.diretor, 'GET', '/config')).data.ata_brasao_esq, '');
  assert.equal((await call(B.diretor, 'PUT', '/config/ata', { ata_cabecalho: 'x', ata_brasao: '', ata_brasao_esq: 'data:image/png;base64,AAAA' })).status, 400);
  assert.equal((await call(B.diretor, 'PUT', '/config/ata', { ata_cabecalho: 'x', ata_brasao: '', ata_brasao_esq: 5 })).status, 400);
});
