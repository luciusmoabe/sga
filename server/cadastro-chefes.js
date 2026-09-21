import { GUID } from './auth.js';
import { falha } from './helpers.js';
import { TAM_SENHA } from './logic.js';

export function administradorAuth(config, { env = process.env, fetchImpl = fetch } = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const consultar = async (caminho, method, body) => {
    if (!key) throw falha(503, 'Cadastro indisponível: configure SUPABASE_SERVICE_ROLE_KEY no servidor.');
    let r;
    try {
      r = await fetchImpl(`${config.supabaseUrl}/auth/v1/admin/users${caminho}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw falha(503, 'Não foi possível confirmar a criação da conta. Confira o cadastro no Supabase antes de tentar novamente.'); }
    if (!r.ok) {
      if (r.status === 422 || r.status === 409) throw falha(409, 'E-mail já cadastrado ou senha recusada pela política do projeto.');
      throw falha(503, 'Cadastro indisponível. Confira a configuração administrativa do Supabase.');
    }
    if (method === 'DELETE') return;
    const u = await r.json().catch(() => null);
    if (!GUID.test(u?.id)) throw falha(503, 'Resposta de cadastro inválida. Confira a conta no Supabase.');
    return u.id;
  };
  return {
    criar: (email, senha) => consultar('', 'POST', { email, password: senha, email_confirm: true }),
    atualizar: (id, dados) => consultar(`/${id}`, 'PUT', dados),
    remover: id => consultar(`/${id}`, 'DELETE'),
  };
}

// `permitidos` limita os perfis que quem chama pode criar: o Diretor cria Chefe e Apoio; o Administrador também cria Diretor;
// o Administrador só nasce pelo comando do servidor (server/criar-administrador.js). A senha informada é provisória:
// a pessoa é obrigada a trocá-la no primeiro acesso.
export async function cadastrarChefe(db, config, admin, dados, perfil = 'chefe', { permitidos = ['chefe', 'apoio'] } = {}) {
  if (!permitidos.includes(perfil)) {
    throw falha(400, permitidos.includes('diretor') ? 'Escolha Diretor, Apoio do Diretor ou Chefe de seção.' : 'Escolha Chefe ou Apoio.');
  }
  const nome = typeof dados.nome === 'string' ? dados.nome.trim() : '';
  const email = typeof dados.email === 'string' ? dados.email.trim().toLowerCase() : '';
  const senha = dados.senha;
  const secaoId = perfil === 'chefe' ? Number(dados.secao_id) : null;
  if (!nome || nome.length > 120) throw falha(400, 'Informe um nome com até 120 caracteres.');
  if (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw falha(400, 'Informe um e-mail válido.');
  if (typeof senha !== 'string' || senha.length < TAM_SENHA.min || senha.length > TAM_SENHA.max) throw falha(400, `A senha inicial deve ter entre ${TAM_SENHA.min} e ${TAM_SENHA.max} caracteres.`);
  if (perfil === 'chefe' && (!Number.isSafeInteger(secaoId) || secaoId < 1)) throw falha(400, 'Escolha uma seção.');
  const anterior = dados.substituir_chefe_id == null ? null : Number(dados.substituir_chefe_id);
  if (anterior !== null && (!Number.isSafeInteger(anterior) || anterior < 1)) throw falha(400, 'Confirmação de substituição inválida.');
  const validar = async () => {
    if (perfil === 'chefe') {
    const s = await db.prepare('select id, ativa, chefe_id from secoes where id = ?').get(secaoId);
    if (!s?.ativa) throw falha(400, 'Escolha uma seção ativa.');
    if ((s.chefe_id ?? null) !== anterior) throw falha(409, 'A chefia da seção mudou ou precisa de confirmação. Atualize a página e confirme a substituição.');
    }
    if (await db.prepare('select id from usuarios where lower(email) = ?').get(email)) throw falha(409, 'E-mail já cadastrado no Agilis.');
  };
  await validar();
  const subject = await admin.criar(email, senha);
  if (!GUID.test(subject)) throw falha(503, 'Identificador de conta inválido.');
  try {
    return await db.transaction(async () => {
      await validar();
      const id = (await db.prepare('insert into usuarios (nome,email,perfil,secao_id,trocar_senha) values (?,?,?,?,1)').run(nome,email,perfil,secaoId)).lastInsertRowid;
      if (perfil === 'chefe') {
      const alteracao = anterior === null
        ? await db.prepare('update secoes set chefe_id = ? where id = ? and ativa = 1 and chefe_id is null').run(id,secaoId)
        : await db.prepare('update secoes set chefe_id = ? where id = ? and ativa = 1 and chefe_id = ?').run(id,secaoId,anterior);
      if (alteracao.changes !== 1) throw falha(409, 'A seção foi alterada por outra operação. Atualize a página.');
      if (anterior !== null) await db.prepare('update usuarios set secao_id = null where id = ? and secao_id = ?').run(anterior,secaoId);
      }
      await db.prepare('insert into auth_contas (usuario_id,projeto,subject) values (?,?,?)').run(id,config.supabaseUrl,subject);
      return { id, nome, email, perfil, secao_id: secaoId, ativo: 1, trocar_senha: 1 };
    });
  } catch (err) {
    try { await admin.remover(subject); }
    catch { throw falha(503, 'Cadastro local não concluído. Uma conta sem acesso ao Agilis permaneceu no Supabase; solicite a revisão administrativa antes de repetir.'); }
    throw err;
  }
}
