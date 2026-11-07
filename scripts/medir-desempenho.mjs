// Mede o tempo e o tamanho das respostas principais com N ações fictícias num banco em memória: `npm run medir -- 20000`.
// Não toca em nenhum banco real. Serve para decidir com números (e não por palpite) quando paginar ou criar índices.
process.env.SGC_NOW = '2026-09-22T09:30:00';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

const N = Number(process.argv[2] || 20000);
const db = openDb(':memory:');
await seed(db);
const server = createApp(db, { auth: { mode: 'demo' } }).listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api`;
const api = async (uid, caminho) => { const t0 = performance.now(); const r = await fetch(base + caminho, { headers: { 'x-user-id': String(uid) } }); const corpo = await r.text(); return { ms: Math.round(performance.now() - t0), kb: Math.round(corpo.length / 1024), status: r.status }; };

const secoes = (await db.prepare("select id from secoes where tipo in ('centro','coordenacao','subsecao')").all()).map((s) => s.id);
const ins = db.prepare(`insert into acoes (secao_id, titulo, detalhe, status, prazo, prazo_original, prioridade, interna, criada_em, criado_por, empresa_id)
  values (?, ?, ?, ?, ?, ?, 'media', 0, '2026-08-01T09:00:00', 1, 1)`);
const t0 = performance.now();
await db.transaction(async () => {
  for (let i = 0; i < N; i++) {
    const status = ['a_fazer', 'em_andamento', 'concluida', 'bloqueada'][i % 4];
    const dia = 1 + (i % 28);
    const prazo = `2026-${i % 3 === 0 ? '08' : i % 3 === 1 ? '09' : '10'}-${String(dia).padStart(2, '0')}`;
    await ins.run(secoes[i % secoes.length], `Ação de carga ${i}`, 'Detalhe '.repeat(8), status, prazo, prazo);
  }
});
console.log(`${N} ações criadas em ${Math.round(performance.now() - t0)} ms (${secoes.length} seções)`);

const rotas = [[1, '/bootstrap'], [1, '/painel'], [1, '/acoes'], [1, '/acoes?situacao=abertas'], [1, '/acoes?q=carga%20123'], [1, '/pauta'], [4, '/bootstrap'], [4, '/acoes'], [4, '/tarefas'], [1, '/produtividade?de=2026-08-01&ate=2026-09-22']];
for (const [uid, r] of rotas) {
  const medidas = []; for (let i = 0; i < 3; i++) medidas.push(await api(uid, r));
  const m = medidas.sort((a, b) => a.ms - b.ms)[1];
  console.log(`${String(uid).padStart(2)} ${r.padEnd(44)} ${String(m.ms).padStart(6)} ms  ${String(m.kb).padStart(6)} KB  ${m.status}`);
}
server.close(); await db.close(); process.exit(0);
