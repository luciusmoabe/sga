// Cabeçalhos de segurança da resposta HTTP. Sem dependência externa: a interface é JavaScript puro
// servido pelo mesmo domínio, então a política pode ser restritiva.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // as telas usam atributos style em trechos gerados
  "img-src 'self' data:",             // favicon embutido
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** `https`: envia HSTS somente quando o site é servido por HTTPS (evita travar o desenvolvimento local). */
export function cabecalhosSeguranca({ https = false } = {}) {
  return (req, res, next) => {
    res.set('Content-Security-Policy', CSP);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (https) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}
