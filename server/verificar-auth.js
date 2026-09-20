import { pathToFileURL } from 'node:url';
import { configurarAuth } from './auth.js';

/** Diagnóstico sem consultar banco, autenticar usuários ou exibir credenciais. */
export async function verificarAuth(env = process.env, { online = false, fetchImpl = fetch } = {}) {
  const resultados = [];
  const registrar = (ok, item, detalhe) => resultados.push({ ok, item, detalhe });
  const campos = ['SGC_PUBLIC_ORIGIN', 'ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_CLIENT_SECRET'];
  for (const campo of campos) registrar(Boolean(env[campo]), campo, env[campo] ? 'Presente; valor não exibido.' : 'Configuração ausente.');
  const institucional = !env.SGC_AUTH_MODE || env.SGC_AUTH_MODE === 'entra';
  registrar(institucional, 'Modo institucional', institucional ? 'Entra ID selecionado.' : 'A homologação institucional exige SGC_AUTH_MODE=entra.');
  let config;
  if (campos.every(c => env[c]) && institucional) {
    try {
      config = configurarAuth(env);
      registrar(true, 'Formato da configuração', 'Identificadores e origem válidos.');
    } catch {
      registrar(false, 'Formato da configuração', 'Confira GUIDs, origem HTTPS sem caminho e configuração do ambiente.');
    }
  }
  let descoberta = false;
  if (online && config) {
    try {
      // Só consulta a URL oficial derivada de um Tenant ID já validado como GUID.
      // Não envia segredo, Client ID, token de sessão ou conteúdo do banco.
      const base = `https://login.microsoftonline.com/${config.tenant}`;
      const resposta = await fetchImpl(`${base}/v2.0/.well-known/openid-configuration`, {
        redirect: 'error', signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' },
      });
      if (!resposta.ok) throw new Error('Descoberta indisponível.');
      const dados = await resposta.json();
      descoberta = dados.issuer === `${base}/v2.0`
        && dados.authorization_endpoint === `${base}/oauth2/v2.0/authorize`
        && dados.token_endpoint === `${base}/oauth2/v2.0/token`
        && dados.jwks_uri === `${base}/discovery/v2.0/keys`
        && dados.id_token_signing_alg_values_supported?.includes('RS256') === true
        && dados.response_types_supported?.includes('code') === true;
      registrar(descoberta, 'Descoberta OIDC', descoberta ? 'Endpoints compatíveis com a implementação.' : 'Metadados diferentes dos endpoints esperados; revise antes de homologar.');
    } catch {
      registrar(false, 'Descoberta OIDC', 'Consulta indisponível ou resposta inválida. Confira tenant, rede e tente novamente.');
    }
  }
  return {
    ok: resultados.every(r => r.ok) && Boolean(config) && (!online || descoberta),
    resultados,
    callback: config ? `${config.origin}/api/auth/retorno` : null,
    limites: 'Esta verificação não comprova registro da aplicação, validade do segredo, vínculos, migrações, MFA ou login real.',
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
    if (relatorio.callback) console.log(`URI de retorno a registrar como plataforma Web: ${relatorio.callback}`);
    console.log(relatorio.limites);
    process.exitCode = relatorio.ok ? 0 : 1;
  }
}
