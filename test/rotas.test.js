// Inventário das rotas da API. Falha se uma rota for perdida, duplicada ou incluída sem entrar aqui,
// o que protege refatorações do servidor. Rota nova também precisa de teste de perfil e propriedade (CLAUDE.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

const ESPERADAS = [
  'DELETE /api/acoes/:id',
  'DELETE /api/reunioes/:id/decisoes/:decisaoId',
  'DELETE /api/secoes/:id',
  'DELETE /api/usuarios/:id',
  'GET /api/acoes',
  'GET /api/acoes/:id',
  'GET /api/atualizacao',
  'GET /api/auth/config',
  'GET /api/bootstrap',
  'GET /api/combinados',
  'GET /api/config',
  'GET /api/diretrizes',
  'GET /api/historico',
  'GET /api/painel',
  'GET /api/pauta',
  'GET /api/pedidos-prazo',
  'GET /api/reunioes',
  'GET /api/reunioes/:id',
  'GET /api/reunioes/:id/cartoes',
  'GET /api/secoes',
  'GET /api/secoes/:id/detalhe',
  'GET /api/usuarios',
  'GET /api/usuarios-demo',
  'PATCH /api/acoes/:id',
  'PATCH /api/combinados/:id',
  'PATCH /api/secoes/:id',
  'PATCH /api/usuarios/:id',
  'PATCH /api/usuarios/:id/login',
  'POST /api/acoes',
  'POST /api/acoes/:id/arquivar',
  'POST /api/acoes/:id/comentarios',
  'POST /api/acoes/:id/desarquivar',
  'POST /api/acoes/:id/devolver',
  'POST /api/acoes/:id/encerrar',
  'POST /api/acoes/:id/impedimentos',
  'POST /api/acoes/:id/impedimentos/:iid/resolver',
  'POST /api/acoes/:id/pedido-prazo',
  'POST /api/acoes/:id/tempo',
  'POST /api/combinados',
  'POST /api/diretrizes',
  'POST /api/pedidos-prazo/:id/decidir',
  'POST /api/reunioes/:id/acoes',
  'POST /api/reunioes/:id/decisoes',
  'POST /api/reunioes/:id/encerrar',
  'POST /api/reunioes/:id/enviar-ata',
  'POST /api/reunioes/:id/reabrir',
  'POST /api/reunioes/iniciar',
  'POST /api/secoes',
  'POST /api/usuarios',
  'POST /api/usuarios/acesso',
  'POST /api/usuarios/chefes',
  'DELETE /api/reunioes/:id',
  'PUT /api/atualizacao',
  'PUT /api/config',
  'PUT /api/reunioes/:id/ata',
];

test('a API expõe exatamente as rotas esperadas, sem duplicidade', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const app = createApp(db, { auth: { mode: 'demo' } });
  const rotas = app._router.stack
    .flatMap((camada) => (camada.route ? Object.keys(camada.route.methods).map((m) => `${m.toUpperCase()} ${camada.route.path}`) : []))
    .sort();
  assert.deepEqual(rotas, [...ESPERADAS].sort());
  assert.equal(new Set(rotas).size, rotas.length, 'há rota registrada duas vezes');
});
