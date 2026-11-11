// Injeção de HTML: grava uma carga maliciosa em TODO campo de texto que um usuário consegue preencher, percorre as telas e
// confere que nada virou HTML. A CSP (script-src 'self') já impediria a execução de um onerror inline; este teste pega a falha
// antes, no que importa: o texto do usuário tem de aparecer como texto, nunca como marcação.
//
// A carga fecha o atributo/elemento em que cair e cria elementos-isca (`<i id=xss-i>`, `<img src=x onerror=1>`). Se qualquer isca
// existir no DOM, algum lugar da interface colocou texto de usuário sem escapar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEFE_COF, DIRETOR, subir } from './ajuda.js';

const ISCA = '"><i id=xss-i></i><img src=x onerror=1>';
const CURTA = '"><i id=xss-i>'; // para campos de poucos caracteres (sigla)
const ADMIN = 10;

/** Cria os dados com a carga em cada campo. Devolve o que deu certo, para o teste não passar em branco. */
async function semear(app) {
  const feitos = [];
  const tentar = async (rotulo, uid, metodo, caminho, corpo) => {
    const r = await app.api(uid, metodo, caminho, corpo);
    if (r.status >= 200 && r.status < 300) feitos.push(rotulo);
    else console.log(`  (não semeado: ${rotulo} → ${r.status} ${JSON.stringify(r.dados).slice(0, 90)})`);
    return r;
  };
  const prazo = '2026-10-30';

  await tentar('nome e sigla de seção', DIRETOR, 'PATCH', '/secoes/2', { nome: ISCA, sigla: CURTA });
  await tentar('nome de usuário', DIRETOR, 'PATCH', '/usuarios/4', { nome: ISCA });
  await tentar('diretriz', DIRETOR, 'POST', '/diretrizes', { titulo: ISCA, detalhe: ISCA, destino: 'todos', prazo, prioridade: 'alta' });
  await tentar('combinado', DIRETOR, 'POST', '/combinados', { texto: ISCA });
  await tentar('aviso', DIRETOR, 'POST', '/avisos', { texto: ISCA, data_fim: '2026-12-31' });

  const { dados: acoes } = await app.api(CHEFE_COF, 'GET', '/acoes');
  const alvo = acoes[0];
  await tentar('comentário', CHEFE_COF, 'POST', `/acoes/${alvo.id}/comentarios`, { texto: ISCA });
  await tentar('tarefa', CHEFE_COF, 'POST', `/acoes/${alvo.id}/checklist`, { texto: ISCA });
  await tentar('impedimento', CHEFE_COF, 'POST', `/acoes/${alvo.id}/impedimentos`, { descricao: ISCA, critico: true, apoio: ISCA });
  await tentar('pedido de prazo', CHEFE_COF, 'POST', `/acoes/${alvo.id}/pedido-prazo`, { novo_prazo: '2026-12-01', justificativa: ISCA });
  const criada = await tentar('ação própria', CHEFE_COF, 'POST', '/acoes', { titulo: ISCA, detalhe: ISCA, prazo, demandante_externo: ISCA.slice(0, 40) });
  await tentar('atualização semanal', CHEFE_COF, 'PUT', '/atualizacao', { semana: '2026-09-22', observacoes: ISCA });

  const ini = await tentar('reunião', DIRETOR, 'POST', '/reunioes/iniciar', {});
  const reuniao = ini.dados?.id ?? ini.dados?.reuniao?.id;
  if (reuniao) {
    await tentar('decisão', DIRETOR, 'POST', `/reunioes/${reuniao}/decisoes`, { texto: ISCA, secao_id: 2 });
    await tentar('informação', DIRETOR, 'POST', `/reunioes/${reuniao}/informacoes`, { texto: ISCA });
    await tentar('encerrar', DIRETOR, 'POST', `/reunioes/${reuniao}/encerrar`, {});
    await tentar('ata', DIRETOR, 'PUT', `/reunioes/${reuniao}/ata`, { ata_texto: `${ISCA}\n\n- ${ISCA}\n\n**${ISCA}**` });
  }
  return { feitos, alvo, criada: criada.dados, reuniao };
}

/** O DOM tem alguma isca? Devolve as descrições do que foi injetado. */
const injetado = (p) => p.evaluate(() => {
  const achados = [];
  if (document.querySelector('#xss-i')) achados.push('elemento #xss-i');
  if (document.querySelector('img[src="x"]')) achados.push('img[src=x]');
  for (const e of document.querySelectorAll('[onerror],[onload],[onfocus],[onclick]')) if (!e.dataset?.legitimo) achados.push(`atributo de evento em <${e.tagName.toLowerCase()}>`);
  return achados;
});

test('injeção de HTML: texto de usuário aparece como texto em todas as telas', async (t) => {
  const app = await subir(t); if (!app) return;
  const { feitos, alvo, criada, reuniao } = await semear(app);
  assert.ok(feitos.length >= 14, `o teste precisa ter semeado a maioria dos campos (semeou ${feitos.length}: ${feitos.join(', ')})`);

  const visitas = [
    [DIRETOR, ['painel', 'centro/2', 'centro/1', 'direcionar', 'acoes', 'prazos', 'combinados', 'reunioes', `reunioes/${reuniao}`, 'agenda', 'produtividade', 'avisos', 'estrutura', 'reuniao-config', 'configuracao', 'pauta']],
    [CHEFE_COF, ['inicio', 'minhas-acoes', 'atualizacao', 'equipe', 'historico', 'atas', 'agenda', 'produtividade', 'combinados']],
    [ADMIN, ['painel', 'acoes', 'estrutura']],
  ];
  const problemas = [];
  let viuCargaComoTexto = false;
  for (const [uid, telas] of visitas) {
    for (const tela of telas) {
      const p = await app.abrir(uid, `#/${tela}`);
      await new Promise((r) => setTimeout(r, 350));
      const achados = await injetado(p);
      if (achados.length) problemas.push(`${uid}@${tela}: ${achados.join(', ')}`);
      if (await p.evaluate(() => document.body.innerText.includes('<i id=xss-i>'))) viuCargaComoTexto = true;
      await p.close();
    }
  }
  // A ficha de uma ação (diálogo) mostra comentários, tarefas, impedimentos, pedidos e detalhes.
  for (const id of [alvo.id, criada?.id].filter(Boolean)) {
    for (const uid of [CHEFE_COF, DIRETOR]) {
      const p = await app.abrir(uid, `#/acao/${id}`);
      await p.waitForSelector('dialog[open]').catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
      const achados = await injetado(p);
      if (achados.length) problemas.push(`${uid}@ficha ${id}: ${achados.join(', ')}`);
      await p.close();
    }
  }
  // A tela de entrada da demonstração lista os nomes das contas e das seções.
  const entrada = await (async () => { const pg = await app.abrir('', ''); await new Promise((r) => setTimeout(r, 400)); const a = await injetado(pg); await pg.close(); return a; })();
  if (entrada.length) problemas.push(`entrada: ${entrada.join(', ')}`);

  assert.ok(viuCargaComoTexto, 'a carga tem de aparecer ao menos uma vez como texto visível (senão o teste não está olhando onde deveria)');
  assert.deepEqual(problemas, [], `HTML injetado em:\n  ${problemas.join('\n  ')}`);
});
