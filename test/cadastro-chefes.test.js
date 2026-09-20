import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { administradorAuth, cadastrarChefe } from '../server/cadastro-chefes.js';
const config={supabaseUrl:'https://projeto.supabase.co'};
const subject='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const dados={nome:'Chefe novo',email:'NOVO@example.org',senha:'Senha longa de teste',secao_id:1};
async function ambiente(t) {
 const db=openDb(':memory:'); await seed(db); t.after(()=>db.close());
 await db.prepare('update secoes set chefe_id=null where id=1').run();
 return db;
}
test('cadastro: cria vínculo, perfil fixo e seção sem persistir senha',async t=>{
 const db=await ambiente(t);
 const u=await cadastrarChefe(db,config,{criar:async(email,senha)=>{assert.equal(email,'novo@example.org');assert.equal(senha,dados.senha);return subject;}}, {...dados,perfil:'diretor'});
 assert.equal(u.perfil,'chefe'); assert.equal(u.senha,undefined);
 assert.equal((await db.prepare('select chefe_id from secoes where id=1').get()).chefe_id,u.id);
 assert.equal((await db.prepare('select subject from auth_contas where usuario_id=?').get(u.id)).subject,subject);
});
test('cadastro: valida seção, duplicidade e senha antes de chamar Supabase',async t=>{
 const db=await ambiente(t); const admin={criar:()=>assert.fail('Não deve criar')};
 for(const d of [{...dados,senha:'curta'},{...dados,secao_id:9999},{...dados,email:'invalido'}]) await assert.rejects(cadastrarChefe(db,config,admin,d),{status:400});
 await db.prepare('update secoes set chefe_id=3 where id=1').run();
 await assert.rejects(cadastrarChefe(db,config,admin,dados),{status:409});
});
test('cadastro: disputa pela seção desfaz cadastro e remove somente nova conta',async t=>{
 const db=await ambiente(t);let removida;
 await assert.rejects(cadastrarChefe(db,config,{criar:async()=>{await db.prepare('update secoes set chefe_id=3 where id=1').run();return subject;},remover:async id=>{removida=id;}},dados),{status:409});
 assert.equal(removida,subject);
 assert.equal(await db.prepare('select id from usuarios where email=?').get('novo@example.org'),undefined);
});
test('admin: chave restrita ao servidor, confirmação e erros sanitizados',async()=>{
 await assert.rejects(administradorAuth(config,{env:{}}).criar(dados.email,dados.senha),{status:503});
 const admin=administradorAuth(config,{env:{SUPABASE_SERVICE_ROLE_KEY:'segredo'},fetchImpl:async(url,options)=>{
 assert.equal(url,config.supabaseUrl+'/auth/v1/admin/users');
 assert.equal(options.headers.authorization,'Bearer segredo');
 assert.equal(JSON.parse(options.body).email_confirm,true);
 return new Response(JSON.stringify({id:subject}));
 }});
 assert.equal(await admin.criar(dados.email,dados.senha),subject);
});

test('cadastro HTTP: somente Diretor pode criar; mantém CSRF e origem obrigatórios',async t=>{
 const { once }=await import('node:events');
 const { createApp }=await import('../server/app.js');
 const { hash }=await import('../server/auth.js');
 const db=await ambiente(t);
 const auth={...config,mode:'supabase',origin:'https://agilis.example',secure:true};
 let chamadas=0;
 const server=createApp(db,{auth,adminAuth:{criar:async()=>{chamadas++;return subject;}}}).listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url=`http://127.0.0.1:${server.address().port}/api/usuarios/chefes`;
 const call=(headers={})=>fetch(url,{method:'POST',headers:{'content-type':'application/json',origin:auth.origin,...headers},body:JSON.stringify(dados)});
 assert.equal((await call()).status,401);
 for (const id of [1,2,3]) {
  const conta=(await db.prepare('insert into auth_contas(usuario_id,projeto,subject) values (?,?,?)').run(id,config.supabaseUrl,`conta-${id}`)).lastInsertRowid;
  const token=String(id).repeat(43);
  await db.prepare('insert into auth_sessoes_senha(id,conta_id,csrf,expira_em) values (?,?,?,?)').run(hash(token),conta,'csrf-teste',Math.floor(Date.now()/1000)+3600);
  const headers={cookie:`__Host-sgc_senha=${token}`,'x-csrf-token':'csrf-teste'};
  if(id!==1) assert.equal((await call(headers)).status,403);
  else {
   assert.equal((await call({...headers,'x-csrf-token':''})).status,403);
   assert.equal((await call({...headers,origin:'https://outro.example'})).status,403);
   const r=await call(headers);assert.equal(r.status,201); assert.equal((await r.json()).perfil,'chefe');
  }
 }
 assert.equal(chamadas,1);
});

test('cadastro: substituição explícita retira seção do chefe antigo e preserva usuário',async t=>{
 const db=await ambiente(t);
 await db.prepare('update secoes set chefe_id=3 where id=1').run();
 await db.prepare('update usuarios set secao_id=1 where id=3').run();
 const novo=await cadastrarChefe(db,config,{criar:async()=>subject},{...dados,substituir_chefe_id:3});
 assert.equal((await db.prepare('select chefe_id from secoes where id=1').get()).chefe_id,novo.id);
 const antigo=await db.prepare('select ativo,secao_id from usuarios where id=3').get();
 assert.equal(antigo.ativo,1);assert.equal(antigo.secao_id,null);
});
test('cadastro: confirmação antiga não autoriza substituir outro chefe',async t=>{
 const db=await ambiente(t);
 await db.prepare('update secoes set chefe_id=4 where id=1').run();
 await assert.rejects(cadastrarChefe(db,config,{criar:()=>assert.fail('Não criar')},{...dados,substituir_chefe_id:3}),{status:409});
});
