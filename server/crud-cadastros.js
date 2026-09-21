import { falha } from './helpers.js';

export async function editarHierarquia(db, id, dados) {
  const rows = await db.prepare('select id,pai_id,tipo,ativa from secoes').all();
  const atual = rows.find(s=>s.id===id);
  const tipo = dados.tipo ?? atual.tipo;
  const pai = 'pai_id' in dados ? (dados.pai_id === '' || dados.pai_id === null ? null : Number(dados.pai_id)) : atual.pai_id;
  if (!['centro','coordenacao','subsecao'].includes(tipo)) throw falha(400,'Tipo de seção inválido.');
  if (tipo === 'subsecao' && !rows.some(s=>s.id===pai && s.ativa)) throw falha(400,'Escolha uma seção superior ativa.');
  if (tipo !== 'subsecao' && pai !== null) throw falha(400,'Centros e Coordenações ficam no primeiro nível.');
  atual.pai_id=pai; atual.tipo=tipo;
  const mapa=new Map(rows.map(s=>[s.id,s]));
  for (const s of rows) {
    let no=s; const vistos=new Set();
    while(no) {
      if(vistos.has(no.id)) throw falha(400,'Uma seção não pode ficar abaixo de si mesma ou de suas subseções.');
      vistos.add(no.id);
      if(vistos.size>3) throw falha(400,'A estrutura aceita até 3 níveis abaixo do Departamento.');
      no=mapa.get(no.pai_id);
    }
  }
  await db.prepare('update secoes set tipo=?,pai_id=? where id=?').run(tipo,pai,id);
}

export async function excluirCadastro(db, tabela, id) {
  try {
    return await db.transaction(async()=>{
      const row=await db.prepare(`select * from ${tabela} where id=?`).get(id);
      if(!row) throw falha(404,'Cadastro não encontrado.');
      if(tabela==='usuarios') {
        if(row.perfil==='diretor') throw falha(409,'O Diretor não pode ser excluído.');
        const referencias = [
          ['acoes','criado_por','ações criadas'],
          ['diretrizes','criado_por','diretrizes'],
          ['acao_comentarios','usuario_id','comentários'],
          ['tempo','usuario_id','lançamentos de tempo'],
          ['pedidos_prazo','usuario_id','pedidos de prazo'],
          ['pedidos_prazo','decidido_por','decisões de prazo'],
          ['atualizacoes','usuario_id','relatos semanais'],
          ['combinados','criado_por','combinados'],
          ['reunioes','criada_por','reuniões'],
          ['decisoes','criada_por','decisões de reunião'],
        ];
        const historico=[];
        for (const [origem,coluna,rotulo] of referencias) {
          const {n}=await db.prepare(`select count(*) as n from ${origem} where ${coluna}=?`).get(id);
          if(n) historico.push(`${n} ${rotulo}`);
        }
        if(historico.length) throw falha(409,`Usuário possui histórico: ${historico.join('; ')}. Use Desativar para preservar a autoria desses registros.`);
        // Chefia é uma atribuição atual, não um impedimento histórico.
        // Qualquer falha posterior desfaz também esta liberação.
        await db.prepare('update secoes set chefe_id=null where chefe_id=?').run(id);
        await db.prepare('delete from auth_sessoes_senha where conta_id in (select id from auth_contas where usuario_id=?)').run(id);
        await db.prepare('delete from auth_contas where usuario_id=?').run(id);
        await db.prepare('delete from auth_sessoes where identidade_id in (select id from auth_identidades where usuario_id=?)').run(id);
        await db.prepare('delete from auth_identidades where usuario_id=?').run(id);
      }
      await db.prepare(`delete from ${tabela} where id=?`).run(id);
      return {ok:true};
    });
  } catch(e) {
    if(e.code==='23503' || String(e.code).startsWith('SQLITE_CONSTRAINT')) throw falha(409,'Este cadastro possui vínculos ou histórico e não pode ser excluído. Remova as atribuições atuais ou use Desativar para preservar o histórico.');
    throw e;
  }
}
