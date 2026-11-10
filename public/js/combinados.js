// Combinados da reunião: cadastro completo para Diretor e Apoio, leitura para os chefes.
import { OTopo, oTopo } from './vocab.js';
import { get, patch, post, put } from './api.js';
import { ehGestao, podeOperar } from './estado.js';
import { abrirForm, esc, on, plural, toast, vazio } from './ui.js';

let verArquivados = false;
const FREQ = {
  sempre: 'Sempre que uma reunião começar',
  primeira_do_mes: 'Só na primeira reunião do mês',
  quando_mudarem: 'Só quando os combinados mudarem',
};

/** `o`: a instância. Sem opções, são os combinados da organização (Diretor e Apoio editam, os chefes leem); para uma seção, `base` aponta
 *  às rotas dela e o chefe da seção edita. */
export async function combinados(raiz, { refresh }, o = {}) {
  const base = o.base || '/combinados';
  const gere = o.gere ?? ehGestao(); // Diretor, Apoio e Administrador veem também os inativos e arquivados
  const edita = o.edita ?? podeOperar(); // só Diretor e Apoio alteram
  const [c, cfg] = await Promise.all([get(`${base}${gere ? `?todos=1${verArquivados ? '&arquivados=1' : ''}` : ''}`), o.carregarConfig ? o.carregarConfig() : get('/config')]);
  let n = 0;
  raiz.innerHTML = `
    <div class="cabeca"><div><h1>${esc(o.titulo || 'Combinados da reunião')}</h1>
      <div class="sub">${edita ? 'Aparecem em uma tela curta quando a reunião começa. Mudanças valem a partir da próxima reunião.' : gere ? `Aparecem em uma tela curta quando a reunião começa. Você consulta; quem altera é ${oTopo()} ou o Apoio.` : 'Como conduzimos a reunião semanal.'}</div></div></div>
    ${gere && c.aviso ? `<div class="aviso">${esc(c.aviso)}</div>` : ''}
    <div class="cartao">
      ${c.itens.length ? `<ol class="combinados">${c.itens.map((i) => {
        if (!i.arquivado && i.ativo) n += 1;
        return `<li class="combinado ${i.ativo ? '' : 'inativo'} ${i.arquivado ? 'arquivado' : ''}" data-id="${i.id}">
          <span class="ordem num">${i.arquivado || !i.ativo ? '·' : n}</span><span class="texto">${esc(i.texto)}</span>
          ${i.arquivado ? '<span class="pilula enc">Arquivado</span>' : !i.ativo ? '<span class="pilula">Desativado</span>' : ''}
          ${edita ? `<span class="linha" style="gap:4px">
            ${i.arquivado ? '<button class="btn btn-sec btn-mini" data-acao="restaurar">Restaurar</button>' : `
              <button class="btn btn-fantasma btn-mini" data-acao="cima" aria-label="Subir">↑</button>
              <button class="btn btn-fantasma btn-mini" data-acao="baixo" aria-label="Descer">↓</button>
              <button class="btn btn-fantasma btn-mini" data-acao="editar">Editar</button>
              <button class="btn btn-fantasma btn-mini" data-acao="alternar">${i.ativo ? 'Desativar' : 'Ativar'}</button>
              <button class="btn btn-fantasma btn-mini" data-acao="arquivar">Arquivar</button>`}</span>` : ''}
        </li>`;
      }).join('')}</ol>` : vazio('Nenhum combinado ativo', edita ? 'Adicione o primeiro abaixo.' : `${OTopo()} ainda não cadastrou combinados.`)}
    </div>
    ${edita ? `<div class="espaco"></div>
    <div class="dois" style="align-items:start">
      <form class="cartao" id="form-novo" novalidate><h2>Novo combinado</h2>
        <div class="erro-form oculto" role="alert"></div>
        <div class="campo"><label for="n-texto">Texto</label><input id="n-texto" name="texto" maxlength="240" placeholder="Ex.: Uma pessoa fala por vez."></div>
        <button class="btn btn-primario" type="submit">Adicionar combinado</button></form>
      <div class="cartao"><h2>Quando aparecem</h2>
        <div class="campo"><label for="freq">Tela de abertura</label><select id="freq">${Object.entries(FREQ).map(([k, v]) => `<option value="${k}" ${cfg.combinados_frequencia === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <div class="dica">Quem opera o Modo Reunião sempre pode abri-los pelo botão "Ver combinados". Recomendação: de 5 a 7 ativos, para a abertura continuar rápida. Hoje: ${plural(c.ativos, 'ativo', 'ativos')}.</div></div>
        <label class="escolha" style="display:inline-flex"><input type="checkbox" id="arq" ${verArquivados ? 'checked' : ''}> Mostrar arquivados</label>
        <p class="suave pequeno" style="margin-top:10px">Combinados não são excluídos: arquivar preserva o histórico e a ata sempre guarda o que estava valendo naquela reunião.</p></div>
    </div>` : ''}`;
  if (!edita) return;
  const erro = (e) => toast(e.message, 'erro');
  on(raiz, 'click', '[data-acao]', async (el) => {
    const li = el.closest('[data-id]');
    const id = li.dataset.id;
    const item = c.itens.find((i) => i.id === Number(id));
    const a = el.dataset.acao;
    try {
      if (a === 'cima' || a === 'baixo') await patch(`${base}/${id}`, { mover: a });
      else if (a === 'alternar') await patch(`${base}/${id}`, { ativo: !item.ativo });
      else if (a === 'arquivar') await patch(`${base}/${id}`, { arquivado: true });
      else if (a === 'restaurar') await patch(`${base}/${id}`, { arquivado: false, ativo: true });
      else if (a === 'editar') {
        abrirForm({
          titulo: 'Editar combinado',
          corpo: `<div class="campo"><label for="e-texto">Texto</label><textarea id="e-texto" name="texto">${esc(item.texto)}</textarea></div>`,
          aoEnviar: async (d) => { await patch(`${base}/${id}`, { texto: d.texto }); toast('Combinado atualizado.'); refresh(); },
        });
        return;
      }
      refresh();
    } catch (e) { erro(e); }
  });
  raiz.querySelector('#form-novo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await post(base, { texto: f.texto.value }); toast('Combinado adicionado.'); refresh(); }
    catch (ex) { const b = f.querySelector('.erro-form'); b.textContent = ex.message; b.classList.remove('oculto'); }
  });
  raiz.querySelector('#freq').addEventListener('change', async (e) => {
    try { await (o.salvarFrequencia ? o.salvarFrequencia(e.target.value) : put('/config', { combinados_frequencia: e.target.value })); toast('Preferência salva.'); } catch (ex) { erro(ex); }
  });
  raiz.querySelector('#arq').addEventListener('change', (e) => { verArquivados = e.target.checked; refresh(); });
}
