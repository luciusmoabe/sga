import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
async function ambiente(t) {
 const db=openDb(':memory:'); await seed(db);
 const server=createApp(db,{auth:{mode:'demo'}}).listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(r=>server.close(r));await db.close();});
 const call=async(method,path,body,user=1)=>{
  const r=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{'content-type':'application/json','x-user-id':String(user)},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};
 };return {db,call};
}
test('CRUD: seção e usuário sem histórico podem ser criados, editados, listados e excluídos',async t=>{
 const {call}=await ambiente(t);
 const s=await call('POST','/secoes',{nome:'Nova',tipo:'centro'});assert.equal(s.status,201);
 const sid=s.data.id;
 assert.equal((await call('PATCH',`/secoes/${sid}`,{nome:'Editada',sigla:'ed',tipo:'coordenacao',pai_id:null})).status,200);
 const u=await call('POST','/usuarios',{nome:'Novo',perfil:'chefe',email:'novo@example.org'});assert.equal(u.status,201);
 assert.equal((await call('PATCH',`/usuarios/${u.data.id}`,{nome:'Chefe editado',secao_id:sid})).status,200);
 assert.equal((await call('DELETE',`/secoes/${sid}`)).status,409);
 assert.equal((await call('PATCH',`/usuarios/${u.data.id}`,{perfil:'apoio',secao_id:null})).status,200);
 assert.equal((await call('GET','/usuarios')).data.find(x=>x.id===u.data.id).nome,'Chefe editado');
 assert.equal((await call('DELETE',`/usuarios/${u.data.id}`)).status,200);
 assert.equal((await call('DELETE',`/secoes/${sid}`)).status,200);
 assert.equal((await call('DELETE',`/secoes/${sid}`)).status,404);
});
test('CRUD: hierarquia recusa ciclos, profundidade excessiva e desfaz edição inválida',async t=>{
 const {call}=await ambiente(t);
 const a=(await call('POST','/secoes',{nome:'Raiz',tipo:'centro'})).data.id;
 const b=(await call('POST','/secoes',{nome:'Filha',tipo:'subsecao',pai_id:a})).data.id;
 const c=(await call('POST','/secoes',{nome:'Neta',tipo:'subsecao',pai_id:b})).data.id;
 assert.equal((await call('PATCH',`/secoes/${a}`,{nome:'Não persistir',tipo:'subsecao',pai_id:c})).status,400);
 assert.equal((await call('GET','/secoes')).data.find(x=>x.id===a).nome,'Raiz');
 const d=(await call('POST','/secoes',{nome:'Outra',tipo:'centro'})).data.id;
 assert.equal((await call('PATCH',`/secoes/${d}`,{tipo:'subsecao',pai_id:c})).status,400);
 assert.equal((await call('PATCH',`/secoes/${c}`,{tipo:'centro',pai_id:null})).status,200);
});
test('CRUD: Diretor protegido, perfis não autorizados bloqueados e falhas são atômicas',async t=>{
 const {call,db}=await ambiente(t);
 assert.equal((await call('DELETE','/usuarios/1')).status,409);
 assert.equal((await call('PATCH','/usuarios/1',{ativo:false})).status,400);
 assert.equal((await call('PATCH','/usuarios/3',{perfil:'diretor'})).status,400);
 for(const user of [2,3]) for(const path of ['/usuarios/3','/secoes/1']) assert.equal((await call('DELETE',path,null,user)).status,403);
 const antigo=(await db.prepare('select nome from usuarios where id=3').get()).nome;
 assert.equal((await call('PATCH','/usuarios/3',{nome:'Não persistir',secao_id:99999})).status,400);
 assert.equal((await db.prepare('select nome from usuarios where id=3').get()).nome,antigo);
 assert.equal((await call('DELETE','/secoes/1')).status,409);
});

test('exclusão de ações: gestão exclui ações do Diretor e Apoio, mas não as do Chefe',async t=>{
 const {call,db}=await ambiente(t);
 for(const autor of [1,2]) for(const executor of [1,2]) {
  const nova=await call('POST','/acoes',{titulo:'Excluir gestão',secao_id:1,prazo:'2030-01-01'},autor);
  assert.equal(nova.status,201);
  assert.equal((await call('GET',`/acoes/${nova.data.id}`,null,executor)).data.pode_excluir,true);
  assert.equal((await call('DELETE',`/acoes/${nova.data.id}`,null,executor)).status,200);
 }
 const chefe=await call('POST','/acoes',{titulo:'Da seção',prazo:'2030-01-01'},3);
 for(const executor of [1,2]) assert.equal((await call('DELETE',`/acoes/${chefe.data.id}`,null,executor)).status,403);
 assert.ok(await db.prepare('select id from acoes where id=?').get(chefe.data.id));
 const demandada=(await db.prepare('select id from acoes where diretriz_id is not null limit 1').get()).id;
 await db.prepare('update acoes set criado_por=1 where id=?').run(demandada);
 assert.equal((await call('DELETE',`/acoes/${demandada}`,null,3)).status,403);
 assert.equal((await call('DELETE',`/acoes/${demandada}`,null,2)).status,200);
});
test('exclusão de ações: dependências impedem remoção sem apagar comentários',async t=>{
 const {call,db}=await ambiente(t);
 const a=(await call('POST','/acoes',{titulo:'Pai',secao_id:1,prazo:'2030-01-01'})).data;
 const b=(await call('POST','/acoes',{titulo:'Filha',secao_id:1,prazo:'2030-01-01'})).data;
 await db.prepare('update acoes set acao_pai_id=? where id=?').run(a.id,b.id);
 assert.equal((await call('DELETE',`/acoes/${a.id}`)).status,409);
 assert.ok(await db.prepare('select id from acao_comentarios where acao_id=?').get(a.id));
});

test('exclusão de usuário libera chefia e revoga vínculo sem excluir seção',async t=>{
 const {call,db}=await ambiente(t);
 const s=(await call('POST','/secoes',{nome:'Seção piloto',tipo:'centro'})).data;
 const u=(await call('POST','/usuarios',{nome:'Chefe piloto',perfil:'chefe'})).data;
 await call('PATCH',`/usuarios/${u.id}`,{secao_id:s.id});
 const conta=(await db.prepare('insert into auth_contas(usuario_id,projeto,subject) values (?,?,?)').run(u.id,'https://projeto.supabase.co','cccccccc-cccc-4ccc-8ccc-cccccccccccc')).lastInsertRowid;
 await db.prepare('insert into auth_sessoes_senha(id,conta_id,csrf,expira_em) values (?,?,?,?)').run('sessao-teste',conta,'csrf',2000000000);
 assert.equal((await call('DELETE',`/usuarios/${u.id}`)).status,200);
 assert.equal((await db.prepare('select chefe_id from secoes where id=?').get(s.id)).chefe_id,null);
 assert.equal((await db.prepare('select count(*) n from auth_contas where id=?').get(conta)).n,0);
 assert.equal((await db.prepare('select count(*) n from auth_sessoes_senha where conta_id=?').get(conta)).n,0);
});
test('histórico impede exclusão com motivo específico e preserva chefia',async t=>{
 const {call,db}=await ambiente(t);
 const s=(await call('POST','/secoes',{nome:'Histórico piloto',tipo:'centro'})).data;
 const u=(await call('POST','/usuarios',{nome:'Chefe histórico',perfil:'chefe'})).data;
 await call('PATCH',`/usuarios/${u.id}`,{secao_id:s.id});
 await db.prepare("insert into combinados(texto,criado_por,criado_em,alterado_em) values ('Preservar',?,'2026-09-21','2026-09-21')").run(u.id);
 const r=await call('DELETE',`/usuarios/${u.id}`);
 assert.equal(r.status,409);assert.match(r.data.erro,/1 combinados/);
 assert.equal((await db.prepare('select chefe_id from secoes where id=?').get(s.id)).chefe_id,u.id);
});
