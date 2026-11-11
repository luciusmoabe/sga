// Avisos no celular (Web Push): o usuário ativa no aparelho e o servidor envia direto ao navegador, sem e-mail.
//
// Como funciona: o navegador do aparelho cria uma "assinatura" (endpoint + chaves) e a entrega aqui; para avisar, o servidor
// cifra a mensagem com essas chaves e a entrega ao serviço do navegador (FCM, Apple, Mozilla), que a leva ao aparelho. As
// chaves VAPID identificam este servidor perante esses serviços. Ficam só no ambiente do servidor (a pública vai ao navegador).
//
// Configuração (todas obrigatórias para ativar; veja docs/operacao.md):
//   SGC_VAPID_PUBLIC_KEY, SGC_VAPID_PRIVATE_KEY  (gere com `npm run push:chaves`)
//   SGC_VAPID_SUBJECT  (mailto:contato@orgao.gov.br ou https://endereco-do-sistema)
import webpush from 'web-push';
import { falha, h, permit } from './helpers.js';
import { empresaAtual } from './empresa.js';

const MAX_APARELHOS = 5; // por pessoa: o mais antigo sai quando passa disso
export const PERFIS_COM_AVISO = ['diretor', 'apoio', 'chefe', 'administrador'];

/** Lê a configuração VAPID do ambiente. `ativo` só é verdadeiro com as três variáveis preenchidas. */
export function configurarPush(env = process.env) {
  const publica = (env.SGC_VAPID_PUBLIC_KEY || '').trim();
  const privada = (env.SGC_VAPID_PRIVATE_KEY || '').trim();
  const assunto = (env.SGC_VAPID_SUBJECT || '').trim();
  return { ativo: !!(publica && privada && assunto), publica, privada, assunto };
}

/** Gera um par de chaves VAPID (comando `npm run push:chaves`). */
export const gerarChaves = () => webpush.generateVAPIDKeys();

const agora = () => new Date().toISOString();
const base64url = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max && /^[A-Za-z0-9_-]+={0,2}$/.test(v);

/** Valida a assinatura que o navegador entrega (PushSubscription.toJSON()). Devolve os campos limpos ou lança 400. */
export function validarAssinatura(s) {
  const endpoint = s?.endpoint;
  let url;
  try { url = new URL(endpoint); } catch { /* cai na recusa abaixo */ }
  if (!url || url.protocol !== 'https:' || String(endpoint).length > 1000) throw falha(400, 'Assinatura de aviso inválida: endereço do aparelho ausente ou inseguro.');
  if (!base64url(s?.keys?.p256dh, 200) || !base64url(s?.keys?.auth, 100)) throw falha(400, 'Assinatura de aviso inválida: chaves ausentes.');
  return { endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth };
}

/**
 * Canal de envio por push, no formato que o motor de lembretes espera. `enviar` entrega a mensagem a todos os aparelhos da
 * pessoa e devolve QUANTOS receberam (0 = a pessoa não ativou os avisos; o motor então não marca o lembrete como enviado).
 * Assinatura que o serviço informa como encerrada (404/410) é removida. `emissor` existe para os testes.
 */
export function canalPush(db, config, { emissor = webpush.sendNotification.bind(webpush) } = {}) {
  return {
    nome: 'push',
    real: true,
    exigeEmail: false,
    async enviar({ usuario, titulo, corpo, url, empresa }) {
      const emp = empresa ?? empresaAtual();
      const aparelhos = await db.prepare('select id, endpoint, p256dh, auth from push_assinaturas where usuario_id = ? and empresa_id = ?').all(usuario, emp);
      const mensagem = JSON.stringify({ titulo, corpo, url: url || '/' });
      let entregues = 0;
      for (const a of aparelhos) {
        try {
          await emissor({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, mensagem,
            { TTL: 6 * 3600, urgency: 'normal', vapidDetails: { subject: config.assunto, publicKey: config.publica, privateKey: config.privada } });
          entregues++;
          await db.prepare('update push_assinaturas set ultimo_envio_em = ? where id = ?').run(agora(), a.id);
        } catch (e) {
          if (e?.statusCode === 404 || e?.statusCode === 410) await db.prepare('delete from push_assinaturas where id = ?').run(a.id); // aparelho desinstalou ou revogou
          else console.error(JSON.stringify({ nivel: 'erro', push: 'envio', usuario, status: e?.statusCode ?? null, mensagem: String(e?.message || e).slice(0, 160) }));
        }
      }
      return entregues;
    },
  };
}

/** Rotas de quem ativa os avisos no próprio aparelho. Só perfis que recebem avisos; os demais já ficam fora pelas listas fechadas. */
export function rotasPush(app, { db, emissor } = {}) {
  const config = () => configurarPush();

  app.get('/api/push/config', permit(...PERFIS_COM_AVISO), h(async (req) => {
    const c = config();
    if (!c.ativo) return { disponivel: false };
    const endpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint : '';
    const ativo = endpoint
      ? !!(await db.prepare('select 1 from push_assinaturas where endpoint = ? and usuario_id = ? and empresa_id = ?').get(endpoint, req.user.id, empresaAtual()))
      : false;
    return { disponivel: true, chavePublica: c.publica, ativo };
  }));

  app.post('/api/push/assinar', permit(...PERFIS_COM_AVISO), h(async (req, res) => {
    if (!config().ativo) throw falha(409, 'Os avisos no celular ainda não foram configurados neste sistema.');
    const s = validarAssinatura(req.body?.assinatura);
    const agente = String(req.get('user-agent') || '').slice(0, 200);
    await db.transaction(async () => {
      const existente = await db.prepare('select id from push_assinaturas where endpoint = ?').get(s.endpoint);
      if (existente) {
        // O mesmo aparelho passa a avisar quem ativou por último.
        await db.prepare('update push_assinaturas set usuario_id = ?, empresa_id = ?, p256dh = ?, auth = ?, agente = ? where id = ?')
          .run(req.user.id, empresaAtual(), s.p256dh, s.auth, agente, existente.id);
      } else {
        await db.prepare('insert into push_assinaturas (empresa_id, usuario_id, endpoint, p256dh, auth, agente, criada_em) values (?, ?, ?, ?, ?, ?, ?)')
          .run(empresaAtual(), req.user.id, s.endpoint, s.p256dh, s.auth, agente, agora());
      }
      const todos = await db.prepare('select id from push_assinaturas where usuario_id = ? and empresa_id = ? order by id desc').all(req.user.id, empresaAtual());
      for (const velho of todos.slice(MAX_APARELHOS)) await db.prepare('delete from push_assinaturas where id = ?').run(velho.id);
    });
    res.status(201);
    return { ok: true };
  }));

  app.post('/api/push/cancelar', permit(...PERFIS_COM_AVISO), h(async (req) => {
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== 'string' || !endpoint) throw falha(400, 'Informe o aparelho a desativar.');
    await db.prepare('delete from push_assinaturas where endpoint = ? and usuario_id = ? and empresa_id = ?').run(endpoint, req.user.id, empresaAtual());
    return { ok: true };
  }));

  // Aviso de teste para os aparelhos da própria pessoa: confirma que tudo chega antes de confiar nos lembretes.
  app.post('/api/push/teste', permit(...PERFIS_COM_AVISO), h(async (req) => {
    const c = config();
    if (!c.ativo) throw falha(409, 'Os avisos no celular ainda não foram configurados neste sistema.');
    const entregues = await canalPush(db, c, { emissor }).enviar({
      usuario: req.user.id, titulo: 'Agilis', corpo: 'Teste: os avisos estão funcionando neste aparelho.', url: '/',
    });
    if (!entregues) throw falha(409, 'Nenhum aparelho seu está com os avisos ativados. Ative os avisos neste aparelho e tente de novo.');
    return { ok: true, entregues };
  }));
}
