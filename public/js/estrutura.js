// Estrutura: o Diretor cria e organiza as seções em árvore (Centros, Coordenação e subseções) e o cadastro mínimo de usuários.
import { get, patch, post, put, del } from './api.js';
import { atualizarSessao } from './estado.js';
import { abrirForm, confirmar, esc, on, toast } from './ui.js';
import { HORA_FECHAMENTO } from './regras.js';

const TIPO = { centro: 'Centro', coordenacao: 'Coordenação', subsecao: 'Subseção' };
const PERFIL = { diretor: 'Diretor', apoio: 'Apoio', chefe: 'Chefe' };
const LIMITE = 3;
const ui = { painel: 'secoes', buscaSecao: '', estadoSecao: 'todas', buscaUsuario: '', perfil: 'todos', estadoUsuario: 'todos', recolhidas: new Set() };

// Formulários usam validação nativa e mostram somente campos aplicáveis.
function formulario(opcoes) {
  return abrirForm({ ...opcoes, aoAbrir: (dlg, form) => {
    form.removeAttribute('novalidate');
    const perfil = form.querySelector('#ca-perfil')?.closest('.campo');
    const secao = form.querySelector('#ca-secao')?.closest('.campo');
    if (perfil && secao) secao.before(perfil);
    const vincular = (seletor, dependente, ativo, limpar = false) => {
      const controle=form.querySelector(seletor), campo=form.querySelector(dependente);
      if(!controle || !campo) return;
      const ajustar=()=>{
        const mostrar=ativo(controle.value);
        campo.closest('.campo').hidden=!mostrar;
        campo.disabled=!mostrar;
        if(limpar && !mostrar) campo.value='';
      };
      controle.addEventListener('change',ajustar);ajustar();
    };
    vincular('#ca-perfil','#ca-secao',v=>v==='chefe');
    vincular('#eu-perfil','#eu-secao',v=>v==='chefe');
    vincular('#r-tipo','#r-pai',v=>v==='subsecao',true);
    opcoes.aoAbrir?.(dlg,form);
  }});
}

export async function estrutura(raiz, { refresh }) {
  const [secoes, usuarios, config] = await Promise.all([get('/secoes'), get('/usuarios'), get('/config')]);
  const diaAtual = config.reuniao_dia != null ? Number(config.reuniao_dia) : 2;
  const horaAtual = config.reuniao_hora || '10:00';
  const filhos = (pai) => secoes.filter((s) => (s.pai_id ?? null) === pai).sort((a, b) => a.ordem - b.ordem || a.id - b.id);
  const chefes = usuarios.filter((u) => u.perfil === 'chefe' && u.ativo);
  const opcoesChefe = (atual) => `<option value="">Sem chefe atribuído</option>${chefes.map((u) =>
    `<option value="${u.id}" ${u.id === atual ? 'selected' : ''}>${esc(u.nome)}${u.secao_nome && u.id !== atual ? ` (hoje em ${esc(u.secao_nome)})` : ''}</option>`).join('')}`;
  const normalizar = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const opcoes = (rotulo, conteudo) => `<details class="estrutura-opcoes"><summary aria-label="Mais opções para ${esc(rotulo)}">Mais opções</summary><div class="estrutura-opcoes-itens">${conteudo}</div></details>`;
  const no = (s) => {
    const sub = filhos(s.id).map(no).join('');
    const busca = normalizar(ui.buscaSecao);
    const corresponde = normalizar(`${s.nome} ${s.sigla || ''} ${s.chefe_nome || ''}`).includes(busca)
      && (ui.estadoSecao === 'todas' || (ui.estadoSecao === 'ativas' ? s.ativa : !s.ativa));
    if (!corresponde && !sub) return '';
    const aberta = busca || ui.estadoSecao !== 'todas' || !ui.recolhidas.has(s.id);
    return `<li><div class="estrutura-secao ${s.ativa ? '' : 'estrutura-inativa'}" data-id="${s.id}">
      <div class="estrutura-identidade">
        ${filhos(s.id).length ? `<button class="estrutura-expandir" ${busca || ui.estadoSecao !== 'todas' ? 'disabled' : ''} data-expandir="${s.id}" aria-expanded="${!!aberta}" aria-controls="filhas-${s.id}" aria-label="${aberta ? 'Recolher' : 'Expandir'} subseções de ${esc(s.nome)}">${aberta ? '−' : '+'}</button>` : '<span class="estrutura-marcador" aria-hidden="true">•</span>'}
        <div><strong>${esc(s.nome)}</strong><div class="estrutura-metadados">${esc(TIPO[s.tipo])}${s.sigla ? ` · ${esc(s.sigla)}` : ''}${filhos(s.id).length ? ` · ${filhos(s.id).length} ${filhos(s.id).length === 1 ? 'subseção' : 'subseções'}` : ''}</div></div>
      </div>
      <div class="estrutura-responsavel"><span class="estrutura-legenda">Responsável</span><span>${esc(s.chefe_nome || 'Não atribuído')}</span></div>
      <span class="estrutura-status ${s.ativa ? 'ativo' : ''}">${s.ativa ? 'Ativa' : 'Inativa'}</span>
      <div class="estrutura-acoes"><button class="btn btn-sec btn-mini" data-a="renomear" aria-label="Editar ${esc(s.nome)}">Editar</button>
        ${opcoes(s.nome, `<button data-a="chefe">Gerenciar chefia</button>${s.ativa && s.nivel < LIMITE ? '<button data-a="sub">Adicionar subseção</button>' : ''}<button data-a="cima">Mover para cima</button><button data-a="baixo">Mover para baixo</button><button data-a="${s.ativa ? 'desativar' : 'reativar'}">${s.ativa ? 'Desativar' : 'Reativar'} seção</button><button class="estrutura-perigo" data-a="excluir-secao">Excluir seção</button>`)}</div>
      </div>${sub ? `<ul id="filhas-${s.id}" ${aberta ? '' : 'hidden'}>${sub}</ul>` : ''}</li>`;
  };
  const linhaUsuario = u => `<tr>
    <td><strong>${esc(u.nome)}</strong><span class="estrutura-email">${esc(u.email || 'E-mail não informado')}</span></td>
    <td>${PERFIL[u.perfil]}</td><td>${esc(u.secao_nome || 'Sem seção atribuída')}</td>
    <td><span class="estrutura-status ${u.ativo ? 'ativo' : ''}">${u.ativo ? 'Ativo' : 'Inativo'}</span><span class="estrutura-email">${u.tem_login ? 'Login vinculado' : 'Sem login'}</span></td>
    <td><div class="estrutura-acoes"><button class="btn btn-sec btn-mini" data-editar-u="${u.id}" aria-label="Editar ${esc(u.nome)}">Editar</button>
    ${opcoes(u.nome, `${u.tem_login ? `<button data-login-u="${u.id}">Alterar e-mail ou senha</button>` : '<span class="estrutura-menu-nota">Cadastro sem acesso ao app</span>'}${u.perfil !== 'diretor' ? `<button data-u="${u.id}" data-ativo="${u.ativo ? 0 : 1}">${u.ativo ? 'Desativar' : 'Reativar'} usuário</button><button class="estrutura-perigo" data-excluir-u="${u.id}">Excluir usuário</button>` : '<span class="estrutura-menu-nota">Perfil Diretor protegido</span>'}`)}</div></td></tr>`;
  raiz.innerHTML = `<div class="estrutura-pagina">
    <header class="estrutura-cabecalho"><div><p class="estrutura-sobretitulo">ADMINISTRAÇÃO</p><h1>Estrutura</h1><p class="sub">Organize as seções, as pessoas e a rotina de acompanhamento.</p></div></header>
    <div class="estrutura-resumo" aria-label="Resumo dos cadastros">
      <div><strong>${secoes.filter(s=>s.ativa).length}</strong><span>Seções ativas</span></div>
      <div><strong>${usuarios.filter(u=>u.ativo).length}</strong><span>Usuários ativos</span></div>
      <div><strong>${secoes.filter(s=>s.ativa && !s.chefe_id).length}</strong><span>Seções sem chefe</span></div>
    </div>
    <nav class="estrutura-abas" aria-label="Áreas da estrutura">
      <button data-painel="secoes" aria-controls="estrutura-secoes">Seções</button>
      <button data-painel="usuarios" aria-controls="estrutura-usuarios">Usuários e acessos</button>
      <button data-painel="reuniao" aria-controls="estrutura-reuniao">Reunião semanal</button>
    </nav>
    <section id="estrutura-secoes" class="estrutura-painel" aria-labelledby="titulo-secoes">
      <div class="estrutura-barra"><div><h2 id="titulo-secoes">Organização das seções</h2><p class="suave">Centros, coordenações e subseções em até três níveis.</p></div><button class="btn btn-primario" data-a="nova">+ Nova seção</button></div>
      <div class="estrutura-filtros"><div class="campo"><label for="buscar-secao">Buscar seção ou responsável</label><input id="buscar-secao" type="search" placeholder="Nome, sigla ou responsável" value="${esc(ui.buscaSecao)}"></div><div class="campo"><label for="estado-secao">Situação</label><select id="estado-secao"><option value="todas">Todas</option><option value="ativas">Ativas</option><option value="inativas">Inativas</option></select></div></div>
      <div id="lista-secoes"></div>
    </section>
    <section id="estrutura-usuarios" class="estrutura-painel" aria-labelledby="titulo-usuarios" hidden>
      <div class="estrutura-barra"><div><h2 id="titulo-usuarios">Usuários e acessos</h2><p class="suave">Gerencie perfis, atribuições e acesso ao Agilis.</p></div><div class="estrutura-acoes"><button class="btn btn-primario" data-a="chefe-acesso">+ Novo usuário</button>${opcoes('cadastro de usuários','<button data-a="usuario">Criar cadastro sem login</button>')}</div></div>
      <div class="estrutura-filtros"><div class="campo"><label for="buscar-usuario">Buscar usuário</label><input id="buscar-usuario" type="search" placeholder="Nome, e-mail ou seção" value="${esc(ui.buscaUsuario)}"></div><div class="campo"><label for="perfil-filtro">Perfil</label><select id="perfil-filtro"><option value="todos">Todos os perfis</option><option value="diretor">Diretor</option><option value="apoio">Apoio</option><option value="chefe">Chefe</option></select></div><div class="campo"><label for="estado-usuario">Situação</label><select id="estado-usuario"><option value="todos">Todos</option><option value="ativos">Ativos</option><option value="inativos">Inativos</option></select></div></div>
      <p id="contagem-usuarios" class="estrutura-contagem" role="status"></p>
      <div class="tabela-rolagem"><table class="estrutura-tabela"><thead><tr><th scope="col">Usuário</th><th scope="col">Perfil</th><th scope="col">Seção</th><th scope="col">Acesso</th><th scope="col">Ações</th></tr></thead><tbody id="lista-usuarios"></tbody></table></div>
    </section>
    <section id="estrutura-reuniao" class="estrutura-painel" aria-labelledby="titulo-reuniao" hidden>
      <div class="estrutura-barra"><div><h2 id="titulo-reuniao">Reunião semanal</h2><p class="suave">Defina o dia e o horário de acompanhamento.</p></div></div>
      <div class="estrutura-aviso">O prazo para os relatos encerra no dia anterior à reunião, às ${HORA_FECHAMENTO}h.</div>
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

    </section>
  </div>`;
  const renderSecoes = () => {
    const html = filhos(null).map(no).join('');
    raiz.querySelector('#lista-secoes').innerHTML = html ? `<ul class="estrutura-arvore">${html}</ul>` : `<div class="estrutura-vazio"><strong>${secoes.length ? 'Nenhuma seção encontrada' : 'Sua estrutura começa aqui'}</strong><p>${secoes.length ? 'Experimente outro termo ou altere o filtro de situação.' : 'Adicione a primeira seção para organizar as responsabilidades da equipe.'}</p></div>`;
  };
  const renderUsuarios = () => {
    const rows = usuarios.filter(u=>normalizar(`${u.nome} ${u.email || ''} ${u.secao_nome || ''}`).includes(normalizar(ui.buscaUsuario)) && (ui.perfil==='todos' || u.perfil===ui.perfil) && (ui.estadoUsuario==='todos' || (ui.estadoUsuario==='ativos' ? u.ativo : !u.ativo)));
    raiz.querySelector('#lista-usuarios').innerHTML = rows.map(linhaUsuario).join('') || '<tr><td colspan="5"><div class="estrutura-vazio"><strong>Nenhum usuário encontrado</strong><p>Altere os filtros ou cadastre um novo usuário.</p></div></td></tr>';
    raiz.querySelector('#contagem-usuarios').textContent = `${rows.length} de ${usuarios.length} usuários`;
  };
  const selecionarPainel = painel => {
    ui.painel=painel;
    raiz.querySelectorAll('[data-painel]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.painel===painel)));
    for(const p of ['secoes','usuarios','reuniao']) raiz.querySelector(`#estrutura-${p}`).hidden=p!==painel;
  };
  on(raiz,'click','[data-painel]',el=>selecionarPainel(el.dataset.painel));
  on(raiz,'click','[data-expandir]',el=>{const id=Number(el.dataset.expandir);ui.recolhidas.has(id)?ui.recolhidas.delete(id):ui.recolhidas.add(id);renderSecoes();raiz.querySelector(`[data-expandir="${id}"]`)?.focus();});
  for(const [id,chave,render] of [['buscar-secao','buscaSecao',renderSecoes],['estado-secao','estadoSecao',renderSecoes],['buscar-usuario','buscaUsuario',renderUsuarios],['perfil-filtro','perfil',renderUsuarios],['estado-usuario','estadoUsuario',renderUsuarios]]) {
    const el=raiz.querySelector(`#${id}`);el.value=ui[chave];el.addEventListener(el.tagName==='INPUT'?'input':'change',()=>{ui[chave]=el.value;render();});
  }
  raiz.addEventListener('keydown',e=>{if(e.key==='Escape') {const d=e.target.closest('.estrutura-opcoes');if(d){d.open=false;d.querySelector('summary').focus();}}});
  raiz.addEventListener('click',e=>{raiz.querySelectorAll('.estrutura-opcoes[open]').forEach(d=>{if(!d.contains(e.target) || e.target.closest('button')) d.open=false;});});
  renderSecoes();renderUsuarios();selecionarPainel(ui.painel);
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
      await put('/config', {
        combinados_frequencia: config.combinados_frequencia || 'sempre',
        reuniao_dia: Number(formReuniao.reuniao_dia.value),
        reuniao_hora: formReuniao.reuniao_hora.value,
      });
      atualizarSessao(await get('/bootstrap'));
      toast('Configuração da reunião salva.');
      refresh();
    } catch (ex) {
      erroEl.textContent = ex.message;
      erroEl.classList.remove('oculto');
      btn.disabled = false;
    }
  });

  on(raiz, 'click', '[data-editar-u]', el => {
    const u=usuarios.find(x=>x.id===Number(el.dataset.editarU));
    formulario({titulo:'Editar usuário', corpo:`
      <div class="campo"><label for="eu-nome">Nome</label><input id="eu-nome" name="nome" value="${esc(u.nome)}" maxlength="120" required></div>
      <div class="campo"><label for="eu-email">E-mail</label><input id="eu-email" name="email" type="email" value="${esc(u.email || '')}" ${u.tem_login ? 'disabled' : ''}><div class="dica">Para contas vinculadas, altere e-mail e senha pelo botão Login.</div></div>
      ${u.perfil==='diretor' ? '<p>Perfil Diretor protegido.</p>' : `<div class="campo"><label for="eu-perfil">Perfil</label><select id="eu-perfil" name="perfil"><option value="chefe" ${u.perfil==='chefe'?'selected':''}>Chefe</option><option value="apoio" ${u.perfil==='apoio'?'selected':''}>Apoio</option></select></div>
      <div class="campo"><label for="eu-secao">Seção (Chefe)</label><select id="eu-secao" name="secao_id"><option value="">Sem seção</option>${secoes.filter(s=>s.ativa && (!s.chefe_id || s.chefe_id===u.id)).map(s=>`<option value="${s.id}" ${s.id===u.secao_id?'selected':''}>${esc(s.nome)}</option>`).join('')}</select></div>`}`,
      aoEnviar:async d=>{await patch(`/usuarios/${u.id}`,d);salvo('Usuário atualizado.');}
    });
  });
  on(raiz, 'click', '[data-login-u]', el => {
    const u=usuarios.find(x=>x.id===Number(el.dataset.loginU));
    formulario({titulo:`Login de ${u.nome}`,corpo:`
      <div class="campo"><label for="lu-email">Novo e-mail (opcional)</label><input id="lu-email" name="email" type="email" autocomplete="off"></div>
      <div class="campo"><label for="lu-senha">Nova senha (opcional)</label><input id="lu-senha" name="senha" type="password" autocomplete="new-password" minlength="12" maxlength="128"></div>
      <p>As sessões atuais serão encerradas. Entregue a nova senha diretamente ao usuário.</p>`,
      aoEnviar:async(d,form)=>{try{await patch(`/usuarios/${u.id}/login`,d);salvo('Login atualizado. Entre novamente se alterou sua própria conta.');}finally{form.querySelector('[name="senha"]').value='';d.senha='';}}
    });
  });
  on(raiz, 'click', '[data-excluir-u]', async el => {
    const u=usuarios.find(x=>x.id===Number(el.dataset.excluirU));
    if(await confirmar({titulo:'Excluir usuário',texto:`Excluir ${esc(u.nome)} do Agilis? O acesso ao app será removido e as seções chefiadas ficarão sem chefe. Cadastros com histórico não podem ser excluídos. A conta no provedor de login será preservada.`,rotulo:'Excluir',perigo:true})) {
      try{await del(`/usuarios/${u.id}`);salvo('Usuário excluído.');}catch(e){erro(e);}
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
      if (a === 'excluir-secao') {
        if(await confirmar({titulo:'Excluir seção',texto:`Excluir ${esc(s.nome)}? Seções com usuários, subseções ou histórico não podem ser excluídas.`,rotulo:'Excluir',perigo:true})) {await del(`/secoes/${id}`);salvo('Seção excluída.');}
      } else if (a === 'cima' || a === 'baixo') { await patch(`/secoes/${id}`, { mover: a }); refresh(); }
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
        const descendentes = new Set([s.id]);
        const marcar = pai => filhos(pai).forEach(f => { descendentes.add(f.id); marcar(f.id); });
        marcar(s.id);
        formulario({
          titulo: 'Editar seção',
          corpo: `<div class="campo"><label for="r-nome">Nome</label><input id="r-nome" name="nome" required maxlength="120" value="${esc(s.nome)}"></div>
                  <div class="campo"><label for="r-sigla">Sigla</label><input id="r-sigla" name="sigla" maxlength="12" value="${esc(s.sigla || '')}"></div>
                  <div class="campo"><label for="r-tipo">Tipo</label><select id="r-tipo" name="tipo">${Object.entries(TIPO).map(([k,v])=>`<option value="${k}" ${s.tipo===k?'selected':''}>${v}</option>`).join('')}</select></div>
                  <div class="campo"><label for="r-pai">Seção superior</label><select id="r-pai" name="pai_id" required><option value="">Escolha uma seção</option>${secoes.filter(x=>x.ativa && !descendentes.has(x.id) && x.nivel < LIMITE).map(x=>`<option value="${x.id}" ${s.pai_id===x.id?'selected':''}>${esc(x.nome)}</option>`).join('')}</select></div>`,
          aoEnviar: async (d) => { if(d.tipo !== 'subsecao') d.pai_id=null; await patch(`/secoes/${id}`, d); salvo('Seção atualizada.'); },
        });
      } else if (a === 'chefe') {
        formulario({
          titulo: `Chefe de ${s.nome}`,
          corpo: `<div class="campo"><label for="c-chefe">Chefe</label><select id="c-chefe" name="chefe_id">${opcoesChefe(s.chefe_id)}</select>
            <div class="dica">Ao atribuir um chefe que já lidera outra seção, ele passa a liderar esta.</div></div>`,
          aoEnviar: async (d) => { await patch(`/secoes/${id}`, { chefe_id: d.chefe_id || null }); salvo('Chefe atualizado.'); },
        });
      } else if (a === 'sub' || a === 'nova') {
        formulario({
          titulo: a === 'sub' ? `Nova subseção em ${s.nome}` : 'Nova seção',
          corpo: `${a === 'nova' ? `<div class="campo"><label>Tipo</label><div class="escolha"><label><input type="radio" name="tipo" value="centro" checked> Centro</label><label><input type="radio" name="tipo" value="coordenacao"> Coordenação</label></div></div>` : ''}
            <div class="campo"><label for="n-nome">Nome</label><input id="n-nome" name="nome" required maxlength="120" placeholder="Ex.: Centro de Estudos Econômicos"></div>
            <div class="campo"><label for="n-sigla">Sigla (opcional)</label><input id="n-sigla" name="sigla" maxlength="12"></div>
            <div class="campo"><label for="n-chefe">Chefe (opcional)</label><select id="n-chefe" name="chefe_id">${opcoesChefe(null)}</select></div>`,
          aoEnviar: async (d) => {
            await post('/secoes', { nome: d.nome, sigla: d.sigla, chefe_id: d.chefe_id || null, tipo: a === 'sub' ? 'subsecao' : d.tipo, pai_id: a === 'sub' ? Number(id) : null });
            salvo('Seção criada.');
          },
        });
      } else if (a === 'chefe-acesso') {
        formulario({
          titulo: 'Novo usuário com acesso', rotulo: 'Criar usuário e login',
          corpo: `<div class="campo"><label for="ca-nome">Nome</label><input id="ca-nome" name="nome" maxlength="120" required></div>
            <div class="campo"><label for="ca-email">E-mail de login</label><input id="ca-email" name="email" type="email" maxlength="160" autocomplete="off" required></div>
            <div class="campo"><label for="ca-senha">Senha inicial</label><input id="ca-senha" name="senha" type="password" minlength="12" maxlength="128" autocomplete="new-password" required><div class="dica">De 12 a 128 caracteres. Entregue a senha diretamente ao usuário.</div></div>
            <div class="campo"><label for="ca-secao">Seção</label><select id="ca-secao" name="secao_id" required><option value="">Escolha uma seção</option>${secoes.filter(s => s.ativa).map(s => `<option value="${s.id}">${esc(s.nome)}${s.sigla ? ` (${esc(s.sigla)})` : ''}${s.chefe_id ? ` — chefe atual: ${esc(s.chefe_nome || 'atribuído')}` : ''}</option>`).join('')}</select><div class="dica">Todas as seções ativas estão disponíveis. Se já houver chefe, será solicitada confirmação para substituí-lo.</div></div>
            <div class="campo"><label for="ca-perfil">Perfil</label><select id="ca-perfil" name="perfil"><option value="chefe">Chefe de seção</option><option value="apoio">Apoio (sem seção)</option></select></div><p>Confira o e-mail: a conta será criada com acesso imediato, sem envio de convite.</p>`,
          aoEnviar: async (d, form) => {
            const selecionada = secoes.find(s => s.id === Number(d.secao_id));
            if (d.perfil === 'chefe' && selecionada?.chefe_id) {
              const ok = await confirmar({ titulo: 'Substituir chefe da seção', texto: `O novo usuário assumirá ${esc(selecionada.nome)} no lugar de ${esc(selecionada.chefe_nome || 'seu chefe atual')}. O chefe anterior perderá a atribuição à seção; o histórico será preservado.`, rotulo: 'Confirmar substituição' });
              if (!ok) throw new Error('Substituição cancelada. Escolha outra seção ou confirme para continuar.');
              d.substituir_chefe_id = selecionada.chefe_id;
            }
            try { await post('/usuarios/acesso', d); salvo('Usuário criado com acesso.'); }
            finally { form.querySelector('[name="senha"]').value = ''; d.senha = ''; }
          },
        });
      } else if (a === 'usuario') {
        formulario({
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
