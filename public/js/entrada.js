// Moldura das telas de entrada (login, escolha de perfil na demonstração e criação da primeira senha): à esquerda uma vitrine decorativa com a marca
// e, à direita, o conteúdo. A vitrine é só enfeite (`aria-hidden`): tudo o que a pessoa precisa fica à direita, e no celular a vitrine some e a
// marca passa para o alto do formulário. Nenhuma regra de acesso muda aqui; os textos e os campos são os mesmos de antes, no desenho novo.

const svg = (d, tamanho = 20) => `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
export const ICONE_ENTRADA = {
  email: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7.5 8.5 6 8.5-6"/>'),
  cadeado: svg('<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  chave: svg('<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l3 3"/>'),
  olho: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', 22),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 16),
  tendencia: svg('<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>', 16),
};

/** A vitrine da esquerda: marca, uma ilustração simples (anéis, o ícone do Agilis e dois selos) e o lema. */
export const vitrineEntrada = () => `<aside class="entrada-vitrine" aria-hidden="true">
  <img src="/imagens/logo-agilis.png" alt="" class="vitrine-logo">
  <div class="vitrine-arte">
    <svg class="vitrine-aneis" viewBox="0 0 460 460" focusable="false"><circle cx="230" cy="230" r="224"/><circle cx="230" cy="230" r="160"/><circle class="ponto" cx="72" cy="66" r="7"/><circle class="ponto" cx="402" cy="352" r="6"/></svg>
    <div class="vitrine-icone"><img src="/imagens/icon-192.png" alt="" width="76" height="76"></div>
    <div class="vitrine-selo selo-a">${ICONE_ENTRADA.check}<span>Ações em dia</span></div>
    <div class="vitrine-selo selo-b">${ICONE_ENTRADA.tendencia}<span>Prazos à vista</span></div>
  </div>
  <div class="vitrine-base">
    <p class="vitrine-eyebrow">Atualização · Reunião · Decisão</p>
    <p class="vitrine-titulo">Semana em dia.<br>Reunião com foco.</p>
  </div>
</aside>`;

/** A tela inteira: vitrine + painel. `larga` abre mais o painel (a lista de perfis da demonstração). */
export const moldeEntrada = (miolo, { larga = false } = {}) => `<div class="entrada entrada-dividida">${vitrineEntrada()}
  <main class="entrada-painel"><div class="entrada-conteudo${larga ? ' larga' : ''}">
    <img src="/imagens/logo-agilis.png" alt="Agilis" class="entrada-logo-movel">
    ${miolo}
  </div></main></div>`;
