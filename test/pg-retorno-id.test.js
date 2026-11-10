// No PostgreSQL o adaptador acrescenta `RETURNING id` aos INSERTs; tabelas sem coluna `id` não podem recebê-lo
// (em produção, `acao_vistas` falhava com "column id does not exist" ao abrir uma ação recebida).
import test from 'node:test';
import assert from 'node:assert/strict';
import { pedeRetornarId } from '../server/db.js';

test('INSERT em tabela com id pede RETURNING id; tabelas de chave composta e INSERT que já retorna, não', () => {
  assert.equal(pedeRetornarId('insert into acao_comentarios (acao_id, texto) values (?, ?)'), true);
  assert.equal(pedeRetornarId('  INSERT INTO usuarios (nome) values (?)'), true);
  for (const tabela of ['config', 'reuniao_participantes', 'acao_vistas']) {
    assert.equal(pedeRetornarId(`insert into ${tabela} (a, b) values (?, ?) on conflict do nothing`), false, tabela);
  }
  assert.equal(pedeRetornarId(`insert into acao_vistas (acao_id, usuario_id, vista_em) values (?,?,?)
      on conflict (acao_id, usuario_id) do update set vista_em = excluded.vista_em where acao_vistas.vista_em < ?`), false);
  assert.equal(pedeRetornarId('insert into acoes (titulo) values (?) returning id'), false);
  assert.equal(pedeRetornarId('select 1'), false);
});
