// Identificação da plataforma de hospedagem. As regras de produção (recusar SQLite, proibir o login
// de demonstração, confiar no proxy, encolher o pool) valem igual na Vercel e no Netlify; antes só a
// Vercel era reconhecida. Fonte única para não repetir a checagem em cada arquivo.
//
// `netlify dev` roda na máquina do desenvolvedor: ali vale o comportamento local (SQLite e login de
// demonstração), como acontecia quando `VERCEL` simplesmente não existia fora da nuvem.

/** Verdadeiro quando o processo roda numa plataforma serverless em nuvem. */
export function ehServerless(env = process.env) {
  if (env.NETLIFY_DEV) return false;
  return !!(env.VERCEL || env.NETLIFY || env.SGC_SERVERLESS);
}

/** Verdadeiro quando origens locais (http://localhost) não devem ser aceitas. */
export function ehProducao(env = process.env) {
  return env.NODE_ENV === 'production' || ehServerless(env);
}
