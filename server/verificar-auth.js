import { pathToFileURL } from 'node:url';
import { configurarAuth } from './auth.js';

/** Diagnóstico sem consultar banco, autenticar usuários ou exibir credenciais. */
export async function verificarAuth(env = process.env, { online = false, fetchImpl = fetch } = {}) {
  const resultados = [];
  const registrar = (ok, item, detalhe) => resultados.push({ ok, item, detalhe });
  const chave = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  const presentes = { SGC_PUBLIC_ORIGIN: env.SGC_PUBLIC_ORIGIN, SUPABASE_URL: env.SUPABASE_URL, 'SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY': chave };
  for (const [campo, valor] of Object.entries(presentes)) registrar(Boolean(valor), campo, valor ? 'Presente; valor não exibido.' : 'Configuração ausente.');
  const institucional = !env.SGC_AUTH_MODE || env.SGC_AUTH_MODE === 'supabase';
  registrar(institucional, 'Modo institucional', institucional ? 'Supabase Auth selecionado.' : 'A homologação institucional exige SGC_AUTH_MODE=supabase.');
  let config;
  if (Object.values(presentes).every(Boolean) && institucional) {
    try {
      config = configurarAuth(env);
      registrar(true, 'Formato da configuração', 'Chave pública e origens válidas.');
    } catch {
      registrar(false, 'Formato da configuração', 'Confira a chave publishable/anon, as origens HTTPS sem caminho e a configuração do ambiente.');
    }
  }
  let descoberta = false;
  if (online && config) {
    try {
      // Só consulta as configurações públicas do projeto; envia apenas a chave pública, nunca token de sessão ou conteúdo do banco.
      const resposta = await fetchImpl(`${config.supabaseUrl}/auth/v1/settings`, {
        redirect: 'error', signal: AbortSignal.timeout(8000), headers: { accept: 'application/json', apikey: config.key },
      });
      if (!resposta.ok) throw new Error('Consulta indisponível.');
      const dados = await resposta.json();
      descoberta = typeof dados.external === 'object' && dados.external !== null;
      registrar(descoberta, 'Configurações do Supabase Auth', descoberta ? 'Projeto respondeu com configurações de autenticação.' : 'Resposta diferente do esperado; revise a URL do projeto antes de homologar.');
    } catch {
      registrar(false, 'Configurações do Supabase Auth', 'Consulta indisponível ou resposta inválida. Confira a URL do projeto, a rede e tente novamente.');
    }
  }
  return {
    ok: resultados.every(r => r.ok) && Boolean(config) && (!online || descoberta),
    resultados,
    callback: config ? config.origin : null,
    limites: 'Esta verificação não comprova registro da aplicação, validade da chave, vínculos, migrações, MFA ou login real.',
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--online')) {
    console.error('Uso: npm run check:auth [-- --online]');
    process.exitCode = 1;
  } else {
    const relatorio = await verificarAuth(process.env, { online: args[0] === '--online' });
    for (const r of relatorio.resultados) console.log(`${r.ok ? 'OK' : 'PENDENTE'} — ${r.item}: ${r.detalhe}`);
    if (relatorio.callback) console.log(`Origem pública configurada (deve constar nas URLs permitidas do Supabase Auth): ${relatorio.callback}`);
    console.log(relatorio.limites);
    process.exitCode = relatorio.ok ? 0 : 1;
  }
}
