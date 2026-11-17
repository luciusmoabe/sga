// Política de rotas dos perfis com lista fechada (server/politicas-rotas.js): para TODA rota registrada, o que Consulta, Plataforma e
// Membro alcançam. Quem cria uma rota nova e vê este teste falhar decide, de propósito, se ela fica aberta a esses perfis
// (acrescenta a linha em ESPERADO) ou fechada (corrige a expressão da lista, se ela a abriu por descuido).
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { POLITICAS, liberadaParaPerfil } from '../server/politicas-rotas.js';

/** Todas as rotas registradas, com os parâmetros trocados por um número. */
function rotasRegistradas(app) {
  const out = new Set();
  for (const camada of app._router.stack) {
    if (!camada.route) continue;
    const caminho = camada.route.path;
    assert.equal(typeof caminho, 'string', 'rota com caminho que não é texto: a política não consegue avaliá-la');
    for (const metodo of Object.keys(camada.route.methods)) out.add(`${metodo.toUpperCase()} ${caminho.replace(/:\w+/g, '1')}`);
  }
  return [...out].sort();
}

const ESPERADO = {
  consulta: ['GET /api/acoes', 'GET /api/acoes/1', 'GET /api/bootstrap', 'GET /api/tarefas'],
  membro: [
    'DELETE /api/acoes/1', 'DELETE /api/acoes/1/checklist/1', 'DELETE /api/acoes/1/diario/1',
    'GET /api/acoes', 'GET /api/acoes/1', 'GET /api/acoes/1/executores', 'GET /api/acoes/1/responsaveis',
    'GET /api/avisos/atual', 'GET /api/bootstrap', 'GET /api/diario', 'GET /api/reunioes-equipe', 'GET /api/reunioes-equipe/1', 'GET /api/secoes', 'GET /api/tarefas',
    'PATCH /api/acoes/1', 'PATCH /api/acoes/1/checklist/1', 'PATCH /api/acoes/1/pontos-atencao/1',
    'POST /api/acoes', 'POST /api/acoes/1/checklist', 'POST /api/acoes/1/comentarios', 'POST /api/acoes/1/diario', 'POST /api/acoes/1/impedimentos',
    'POST /api/acoes/1/impedimentos/1/resolver', 'POST /api/acoes/1/pontos-atencao', 'POST /api/acoes/1/tempo', 'POST /api/acoes/1/vista',
    'POST /api/reunioes-equipe/1/sugestoes',
  ],
};
// Plataforma: o bootstrap e toda rota /api/plataforma/* (conferido no próprio teste, pois a lista cresce com a administração de empresas).

test('política de rotas: o que cada perfil restrito alcança em toda rota registrada', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const app = createApp(db, { auth: { mode: 'demo' } });
  const rotas = rotasRegistradas(app).filter((r) => r.split(' ')[1].startsWith('/api/'));
  assert.ok(rotas.length > 100, `rotas encontradas: ${rotas.length}`);
  const alcance = (perfil) => rotas.filter((r) => {
    const [metodo, caminho] = r.split(' ');
    return liberadaParaPerfil(perfil, metodo, caminho.slice('/api'.length));
  });

  assert.deepEqual(alcance('consulta'), ESPERADO.consulta);
  const plataforma = alcance('plataforma');
  assert.ok(plataforma.includes('GET /api/bootstrap') && plataforma.every((r) => r === 'GET /api/bootstrap' || r.split(' ')[1].startsWith('/api/plataforma/')));
  assert.ok(plataforma.length > 1);
  assert.deepEqual(alcance('membro'), ESPERADO.membro, 'rotas liberadas ao membro');
});

test('política de rotas: toda regra das listas corresponde a uma rota registrada (sem regra velha ou com erro de digitação)', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const rotas = rotasRegistradas(createApp(db, { auth: { mode: 'demo' } })).filter((r) => r.split(' ')[1].startsWith('/api/'));
  const orfas = [];
  for (const [perfil, { rotas: lista }] of Object.entries(POLITICAS)) {
    for (const [metodo, rota] of lista) {
      const casa = rotas.some((r) => {
        const [m, caminho] = r.split(' ');
        return (metodo === '*' || metodo === m) && rota.test(caminho.slice('/api'.length));
      });
      if (!casa) orfas.push(`${perfil}: ${metodo} ${rota}`);
    }
  }
  assert.deepEqual(orfas, []);
});

test('política de rotas: perfis sem lista fechada não são afetados', () => {
  for (const perfil of ['diretor', 'chefe', 'apoio', 'administrador', undefined]) assert.equal(liberadaParaPerfil(perfil, 'GET', '/qualquer'), null);
});
