// Estrutura: o Diretor cria e organiza as seções em árvore (Centros, Coordenação e subseções) e o cadastro mínimo de usuários.
import { get, patch, post, put } from './api.js';
import { est } from './estado.js';
import { abrirForm, confirmar, esc, on, toast } from './ui.js';

const TIPO = { centro: 'Centro', coordenacao: 'Coordenação', subsecao: 'Subseção' };
const PERFIL = { diretor: 'Diretor', apoio: 'Apoio', chefe: 'Chefe' };
const LIMITE = 3;

export async function estrutura(raiz, { refresh }) {
  const [secoes, usuarios, config] = await Promise.all([get('/secoes'), get('/usuarios'), get('/config')]);
  const diaAtual = config.reuniao_dia != null ? Number(config.reuniao_dia) : 2;
  const horaAtual = config.reuniao_hora || '10:00';
  const filhos = (pai) => secoes.filter((s) => (s.pai_id ?? null) === pai).sort((a, b) => a.ordem - b.ordem || a.id - b.id);
  const chefes = usuarios.filter((u) => u.perfil === 'chefe' && u.ativo);
  const opcoesChefe = (atual) => `<option value="">Sem chefe atribuído</option>${chefes.map((u) =>
    `<option value="${u.id}" ${u.id === atual ? 'selected' : ''}>${esc(u.nome)}${u.secao_nome && u.id !== atual ? ` (hoje em ${esc(u.secao_nome)})` : ''}</option>`).join('')}`;
  const no = (s) => {
    const sub = filhos(s.id);
    return `<li><div class="no ${s.ativa ? '' : 'inativa'}" data-id="${s.id}">
      <span class="nome">${esc(s.nome)}</span><span class="pilula">${TIPO[s.tipo]}${s.sigla ? ` · ${esc(s.sigla)}` : ''}</span>
      <span class="chefe">${s.chefe_nome ? esc(s.chefe_nome) : 'sem chefe'}${s.ativa ? '' : ' · desativada'}</span>
      <span class="fim">
        <button class="btn btn-fantasma btn-mini" data-a="cima" aria-label="Subir">↑</button><button class="btn btn-fantasma btn-mini" data-a="baixo" aria-label="Descer">↓</button>
        <button class="btn btn-fantasma btn-mini" data-a="renomear">Renomear</button><button class="btn btn-fantasma btn-mini" data-a="chefe">Chefe</button>
        ${s.ativa && s.nivel < LIMITE ? '<button class="btn btn-fantasma btn-mini" data-a="sub">Nova subseção</button>' : ''}
        <button class="btn btn-fantasma btn-mini" data-a="${s.ativa ? 'desativar' : 'reativar'}">${s.ativa ? 'Desativar' : 'Reativar'}</button></span></div>
      ${sub.length ? `<ul>${sub.map(no).join('')}</ul>` : ''}</li>`;
  };
  raiz.innerHTML = `
    <div class="cabeca"><div><h1>Estrutura</h1><div class="sub">Crie quantas seções forem necessárias. Cada chefe poderá organizar subseções abaixo da sua (até ${LIMITE} níveis abaixo do Departamento).</div></div>
      <div class="acoes-topo"><button class="btn btn-primario" data-a="nova">Nova seção</button></div></div>
    <div class="cartao"><ul class="arvore">${filhos(null).map(no).join('')}</ul></div>
    <div class="espaco"></div>
    <div class="cartao" id="card-reuniao">
      <h2>Reunião semanal</h2>
      <p class="suave pequeno" style="margin-bottom:12px">Define quando os chefes precisam enviar a atualização. O fechamento é sempre no dia anterior, às 18h.</p>
      <form id="form-reuniao" novalidate>
        <div class="dois" style="align-items:flex-end;gap:12px">
          <div class="campo">
            <label for="r-dia">Dia da semana</label>
            <select id="r-dia" name="reuniao_dia">
              <option value="1" ${diaAtual === 1 ? 'selected' : ''}>Segunda-feira</option>
              <option value="2" ${diaAtual === 2 ? 'selected' : ''}>Terça-feira</option>
              <option value="3" ${diaAtual === 3 ? 'selected' : ''}>Quarta-feira</option>
              <option value="4" ${diaAtual === 4 ? 'selected' : ''}>Quinta-feira</option>
              <option value="5" ${diaAtual === 5 ? 'selected' : ''}>Sexta-feira</option>
            </select>
          </div>
          <div class="campo">
            <label for="r-hora">Horário de início</label>
            <input id="r-hora" type="time" name="reuniao_hora" value="${esc(horaAtual)}" required>
          </div>
          <div>
            <button class="btn btn-primario" type="submit" id="btn-salvar-reuniao">Salvar</button>
          </div>
        </div>
        <div class="erro-form oculto" role="alert" id="erro-reuniao"></div>
      </form>
    </div>
    <div class="espaco"></div>
    <div class="cartao"><div class="linha entre"><h2>Usuários</h2><button class="btn btn-sec" data-a="usuario">Novo usuário</button></div>
      <div class="tabela-rolagem"><table><thead><tr><th>Nome</th><th>Perfil</th><th>Seção</th><th></th></tr></thead><tbody>
      ${usuarios.map((u) => `<tr><td>${esc(u.nome)}${u.ativo ? '' : ' <span class="pilula enc">Inativo</span>'}</td><td>${PERFIL[u.perfil]}</td><td>${esc(u.secao_nome || '—')}</td>
        <td>${u.perfil === 'diretor' ? '' : `<button class="btn btn-fantasma btn-mini" data-u="${u.id}" data-ativo="${u.ativo ? 0 : 1}">${u.ativo ? 'Desativar' : 'Reativar'}</button>`}</td></tr>`).join('')}</tbody></table></div>
      <p class="suave pequeno" style="margin-top:8px">Protótipo: não há senha nem envio de convite. O acesso é escolhido na tela de entrada.</p></div>`;
  const erro = (e) => toast(e.message, 'erro');
  const salvo = (msg) => { toast(msg); refresh(); };

  // ---------- Handler: formulário de reunião semanal ----------
  const formReuniao = raiz.querySelector('#form-reuniao');
  formReuniao?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = raiz.querySelector('#btn-salvar-reuniao');
    const erroEl = raiz.querySelector('#erro-reuniao');
    erroEl.classList.add('oculto');
    btn.disabled = true;
    try {
      const cfgAtualizada = await put('/config', {
        combinados_frequencia: config.combinados_frequencia || 'sempre',
        reuniao_dia: Number(formReuniao.reuniao_dia.value),
        reuniao_hora: formReuniao.reuniao_hora.value,
      });
      // Atualiza o bootstrap em memória para refletir no trilho imediatamente
      est.boot.reuniao_dia = cfgAtualizada.reuniao_dia != null ? Number(cfgAtualizada.reuniao_dia) : 2;
      est.boot.reuniao_hora = cfgAtualizada.reuniao_hora || '10:00';
      toast('Configuração da reunião salva.');
      refresh();
    } catch (ex) {
      erroEl.textContent = ex.message;
      erroEl.classList.remove('oculto');
      btn.disabled = false;
    }
  });

  on(raiz, 'click', '[data-u]', async (el) => {
    try { await patch(`/usuarios/${el.dataset.u}`, { ativo: el.dataset.ativo === '1' }); salvo('Usuário atualizado.'); } catch (e) { erro(e); }
  });
  on(raiz, 'click', '[data-a]', async (el) => {
    const a = el.dataset.a;
    const id = el.closest('[data-id]')?.dataset.id;
    const s = id ? secoes.find((x) => x.id === Number(id)) : null;
    try {
      if (a === 'cima' || a === 'baixo') { await patch(`/secoes/${id}`, { mover: a }); refresh(); }
      else if (a === 'reativar') { await patch(`/secoes/${id}`, { ativa: true }); salvo('Seção reativada.'); }
      else if (a === 'desativar') {
        try { await patch(`/secoes/${id}`, { ativa: false }); salvo('Seção desativada.'); }
        catch (e) {
          if (e.status === 409 && e.dados?.pode_reatribuir) {
            if (await confirmar({ titulo: 'Reatribuir ações abertas', texto: `${esc(e.message)}<br><br>Reatribuir agora e desativar a seção? O histórico é preservado.`, rotulo: 'Reatribuir e desativar' })) {
              await patch(`/secoes/${id}`, { ativa: false, reatribuir: true });
              salvo('Ações reatribuídas e seção desativada.');
            }
          } else throw e;
        }
      } else if (a === 'renomear') {
        abrirForm({
          titulo: 'Renomear seção',
          corpo: `<div class="campo"><label for="r-nome">Nome</label><input id="r-nome" name="nome" value="${esc(s.nome)}"></div>
                  <div class="campo"><label for="r-sigla">Sigla</label><input id="r-sigla" name="sigla" maxlength="12" value="${esc(s.sigla || '')}"></div>`,
          aoEnviar: async (d) => { await patch(`/secoes/${id}`, d); salvo('Seção atualizada.'); },
        });
      } else if (a === 'chefe') {
        abrirForm({
          titulo: `Chefe de ${s.nome}`,
          corpo: `<div class="campo"><label for="c-chefe">Chefe</label><select id="c-chefe" name="chefe_id">${opcoesChefe(s.chefe_id)}</select>
            <div class="dica">Ao atribuir um chefe que já lidera outra seção, ele passa a liderar esta.</div></div>`,
          aoEnviar: async (d) => { await patch(`/secoes/${id}`, { chefe_id: d.chefe_id || null }); salvo('Chefe atualizado.'); },
        });
      } else if (a === 'sub' || a === 'nova') {
        abrirForm({
          titulo: a === 'sub' ? `Nova subseção em ${s.nome}` : 'Nova seção',
          corpo: `${a === 'nova' ? `<div class="campo"><label>Tipo</label><div class="escolha"><label><input type="radio" name="tipo" value="centro" checked> Centro</label><label><input type="radio" name="tipo" value="coordenacao"> Coordenação</label></div></div>` : ''}
            <div class="campo"><label for="n-nome">Nome</label><input id="n-nome" name="nome" placeholder="Ex.: Centro de Estudos Econômicos"></div>
            <div class="campo"><label for="n-sigla">Sigla (opcional)</label><input id="n-sigla" name="sigla" maxlength="12"></div>
            <div class="campo"><label for="n-chefe">Chefe (opcional)</label><select id="n-chefe" name="chefe_id">${opcoesChefe(null)}</select></div>`,
          aoEnviar: async (d) => {
            await post('/secoes', { nome: d.nome, sigla: d.sigla, chefe_id: d.chefe_id || null, tipo: a === 'sub' ? 'subsecao' : d.tipo, pai_id: a === 'sub' ? Number(id) : null });
            salvo('Seção criada.');
          },
        });
      } else if (a === 'usuario') {
        abrirForm({
          titulo: 'Novo usuário',
          corpo: `<div class="campo"><label for="u-nome">Nome</label><input id="u-nome" name="nome"></div>
            <div class="campo"><label for="u-email">E-mail institucional (opcional)</label><input id="u-email" name="email" type="email"></div>
            <div class="campo"><label>Perfil</label><div class="escolha"><label><input type="radio" name="perfil" value="chefe" checked> Chefe</label><label><input type="radio" name="perfil" value="apoio"> Apoio</label></div></div>`,
          aoEnviar: async (d) => { await post('/usuarios', d); salvo('Usuário criado. Atribua-o a uma seção pelo botão Chefe.'); },
        });
      }
    } catch (e) { erro(e); }
  });
}

