// Estrutura: o Diretor cria e organiza as seções em árvore (Centros, Coordenação e subseções) e o cadastro mínimo de usuários.
import { get, patch, post, put, del } from './api.js';
import { atualizarSessao, est } from './estado.js';
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
        <button class="btn btn-fantasma btn-mini" data-a="renomear">Editar</button><button class="btn btn-fantasma btn-mini" data-a="chefe">Chefe</button>
        ${s.ativa && s.nivel < LIMITE ? '<button class="btn btn-fantasma btn-mini" data-a="sub">Nova subseção</button>' : ''}
        <button class="btn btn-fantasma btn-mini" data-a="${s.ativa ? 'desativar' : 'reativar'}">${s.ativa ? 'Desativar' : 'Reativar'}</button><button class="btn btn-fantasma btn-mini" data-a="excluir-secao">Excluir</button></span></div>
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
    <div class="cartao"><div class="linha entre"><h2>Usuários</h2><div><button class="btn btn-primario" data-a="chefe-acesso">Novo usuário com acesso</button> <button class="btn btn-sec" data-a="usuario">Cadastro sem login</button></div></div>
      <div class="tabela-rolagem"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Seção</th><th></th></tr></thead><tbody>
      ${usuarios.map((u) => `<tr><td>${esc(u.nome)}${u.ativo ? '' : ' <span class="pilula enc">Inativo</span>'}</td><td>${esc(u.email || '—')}</td><td>${PERFIL[u.perfil]}</td><td>${esc(u.secao_nome || '—')}</td>
        <td><button class="btn btn-fantasma btn-mini" data-editar-u="${u.id}">Editar</button> ${u.tem_login ? `<button class="btn btn-fantasma btn-mini" data-login-u="${u.id}">Login</button>` : ''} ${u.perfil === 'diretor' ? '' : `<button class="btn btn-fantasma btn-mini" data-u="${u.id}" data-ativo="${u.ativo ? 0 : 1}">${u.ativo ? 'Desativar' : 'Reativar'}</button> <button class="btn btn-fantasma btn-mini" data-excluir-u="${u.id}">Excluir</button>`}</td></tr>`).join('')}</tbody></table></div>
      <p class="suave pequeno" style="margin-top:8px">Use Novo usuário com acesso para criar o login e atribuir uma seção. Entregue a senha inicial diretamente ao usuário.</p></div>`;
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
    abrirForm({titulo:'Editar usuário', corpo:`
      <div class="campo"><label for="eu-nome">Nome</label><input id="eu-nome" name="nome" value="${esc(u.nome)}" maxlength="120" required></div>
      <div class="campo"><label for="eu-email">E-mail</label><input id="eu-email" name="email" type="email" value="${esc(u.email || '')}" ${u.tem_login ? 'disabled' : ''}><div class="dica">Para contas vinculadas, altere e-mail e senha pelo botão Login.</div></div>
      ${u.perfil==='diretor' ? '<p>Perfil Diretor protegido.</p>' : `<div class="campo"><label for="eu-perfil">Perfil</label><select id="eu-perfil" name="perfil"><option value="chefe" ${u.perfil==='chefe'?'selected':''}>Chefe</option><option value="apoio" ${u.perfil==='apoio'?'selected':''}>Apoio</option></select></div>
      <div class="campo"><label for="eu-secao">Seção (Chefe)</label><select id="eu-secao" name="secao_id"><option value="">Sem seção</option>${secoes.filter(s=>s.ativa && (!s.chefe_id || s.chefe_id===u.id)).map(s=>`<option value="${s.id}" ${s.id===u.secao_id?'selected':''}>${esc(s.nome)}</option>`).join('')}</select></div>`}`,
      aoEnviar:async d=>{await patch(`/usuarios/${u.id}`,d);salvo('Usuário atualizado.');}
    });
  });
  on(raiz, 'click', '[data-login-u]', el => {
    const u=usuarios.find(x=>x.id===Number(el.dataset.loginU));
    abrirForm({titulo:`Login de ${u.nome}`,corpo:`
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
        abrirForm({
          titulo: 'Editar seção',
          corpo: `<div class="campo"><label for="r-nome">Nome</label><input id="r-nome" name="nome" value="${esc(s.nome)}"></div>
                  <div class="campo"><label for="r-sigla">Sigla</label><input id="r-sigla" name="sigla" maxlength="12" value="${esc(s.sigla || '')}"></div>
                  <div class="campo"><label for="r-tipo">Tipo</label><select id="r-tipo" name="tipo">${Object.entries(TIPO).map(([k,v])=>`<option value="${k}" ${s.tipo===k?'selected':''}>${v}</option>`).join('')}</select></div>
                  <div class="campo"><label for="r-pai">Seção superior (somente Subseção)</label><select id="r-pai" name="pai_id"><option value="">Primeiro nível</option>${secoes.filter(x=>x.ativa && x.id!==s.id).map(x=>`<option value="${x.id}" ${s.pai_id===x.id?'selected':''}>${esc(x.nome)}</option>`).join('')}</select></div>`,
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
      } else if (a === 'chefe-acesso') {
        abrirForm({
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
