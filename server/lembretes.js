// Lembretes da semana: quem ainda não enviou a atualização é avisado, e a gestão recebe o resumo no fechamento.
//
// Três momentos, todos relativos ao dia e à hora da reunião da empresa (como o trilho da tela):
//   - lembrete       (4 dias antes da reunião, 15h; sexta, para reunião na terça): chefes sem relato;
//   - ultimas_horas  (véspera da reunião, 12h; segunda): chefes que ainda não enviaram;
//   - fechamento     (véspera da reunião, 18h; segunda): resumo de quem ficou pendente, para o topo da empresa.
// Cada lembrete sai uma só vez por empresa, semana, tipo e pessoa (tabela `lembretes_enviados`).
//
// O envio real depende de um provedor de e-mail, ainda não escolhido. Sem transporte configurado, o motor roda em modo ENSAIO:
// calcula e devolve o que enviaria, sem gravar nada, para ser conferido antes de ligar o envio.
import { addDays, agora, DIA_PADRAO, fechamentoDe, HORA_CORTE_PADRAO, HORA_PADRAO, hojeISO, br, refDiaReuniao } from './logic.js';
import { instante } from '../public/js/datas.js';
import { comEmpresa, empresaAtual } from './empresa.js';
import { painelSemana } from './helpers.js';

export const TIPOS_DE_LEMBRETE = ['lembrete', 'ultimas_horas', 'fechamento'];
const NOMES_DIA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** O que está na hora de sair agora. Só um dos dois lembretes aos chefes vale de cada vez: o mais recente (se a rotina
 *  começar tarde, não chegam dois e-mails juntos). Depois da reunião, nada. */
export function tipoDevido(semana, hora, agoraInstante) {
  const reuniao = instante(`${semana}T${hora}:00`);
  const lembrete = instante(`${addDays(semana, -4)}T15:00:00`);
  const ultimasHoras = instante(`${addDays(semana, -1)}T12:00:00`);
  const fechamento = instante(fechamentoDe(semana));
  if (agoraInstante >= reuniao) return null;
  if (agoraInstante >= fechamento) return 'fechamento';
  if (agoraInstante >= ultimasHoras) return 'ultimas_horas';
  if (agoraInstante >= lembrete) return 'lembrete';
  return null;
}

/** Texto do e-mail. Função pura: recebe tudo de que precisa e devolve { assunto, texto }. */
export function montarMensagem({ tipo, pessoa, unidade, pendentes = [], semana, dia, hora, origem }) {
  const reuniao = `${NOMES_DIA[dia]}, ${br(semana)}, às ${hora}`;
  const veespera = NOMES_DIA[(dia + 6) % 7];
  const link = origem ? `\n\nAbra o Agilis: ${origem}/#/atualizacao` : '';
  if (tipo === 'fechamento') {
    const lista = pendentes.map((p) => `- ${p}`).join('\n');
    return {
      assunto: `Agilis: ${pendentes.length === 1 ? '1 unidade não enviou' : `${pendentes.length} unidades não enviaram`} a atualização da semana`,
      texto: `Olá, ${pessoa}.\n\nO prazo regular das atualizações (${veespera}, 18h) terminou. Ainda não enviaram para a reunião de ${reuniao}:\n\n${lista}\n\n`
        + 'Correções continuam possíveis até a reunião.' + (origem ? `\n\nPainel da semana: ${origem}/#/painel` : ''),
    };
  }
  const prazo = `${veespera}, às 18h`;
  if (tipo === 'ultimas_horas') {
    return {
      assunto: 'Agilis: últimas horas para enviar a atualização da semana',
      texto: `Olá, ${pessoa}.\n\nA atualização de ${unidade} ainda não foi enviada. O prazo regular termina hoje (${prazo}), para a reunião de ${reuniao}.${link}`,
    };
  }
  return {
    assunto: 'Agilis: lembrete da atualização da semana',
    texto: `Olá, ${pessoa}.\n\nA atualização de ${unidade} para a reunião de ${reuniao} ainda não foi enviada. O prazo regular termina ${prazo}. `
      + `Confira o relato, acrescente as observações e envie.${link}`,
  };
}

/** Transporte de ensaio: só registra no log o que enviaria. */
export const transporteEnsaio = {
  nome: 'ensaio',
  real: false,
  async enviar({ para, assunto }) { console.log(JSON.stringify({ nivel: 'info', lembrete: 'ensaio', para, assunto })); },
};

/** Escolhe o transporte pela configuração. Sem configuração, ensaio. Provedores reais entram aqui quando forem escolhidos. */
export function escolherTransporte(env = process.env) {
  const nome = (env.SGC_EMAIL_TRANSPORTE || '').trim().toLowerCase();
  if (!nome || nome === 'ensaio') return transporteEnsaio;
  throw new Error(`Transporte de e-mail "${nome}" ainda não implementado: veja o desenho em docs/plano-melhorias.md.`);
}

const violacaoDeUnicidade = (e) => e?.code === '23505' || /^SQLITE_CONSTRAINT/.test(String(e?.code || '')) || /UNIQUE constraint/i.test(String(e?.message || ''));

/** Roda os lembretes da empresa em curso (chame dentro de `comEmpresa`). */
async function processarEmpresa(db, { transporte, ensaio, origem, agoraInstante }) {
  const cfg = Object.fromEntries((await db.prepare('select chave, valor from config where empresa_id = ?').all(empresaAtual())).map((r) => [r.chave, r.valor]));
  const dia = cfg.reuniao_dia != null ? Number(cfg.reuniao_dia) : DIA_PADRAO;
  const hora = cfg.reuniao_hora || HORA_PADRAO;
  const semana = refDiaReuniao(agoraInstante, dia, HORA_CORTE_PADRAO);
  const tipo = tipoDevido(semana, hora, agoraInstante);
  const resultado = { semana, tipo, destinatarios: [], enviados: 0, jaEnviados: 0, falhas: 0 };
  if (!tipo) return resultado;

  const painel = await painelSemana(db, semana, hojeISO());
  const pendentes = painel.filter((c) => c.secao.na_reuniao && !c.enviada);
  if (!pendentes.length) return resultado;
  const nomeDe = (c) => c.secao.sigla ? `${c.secao.nome} (${c.secao.sigla})` : c.secao.nome;

  const pessoas = tipo === 'fechamento'
    ? (await db.prepare("select id, nome, email, perfil, secao_id from usuarios where empresa_id = ? and ativo = 1 and perfil = 'diretor' and email is not null and email != ''").all(empresaAtual()))
        .map((u) => ({ ...u, unidade: null }))
    : (await db.prepare("select id, nome, email, perfil, secao_id from usuarios where empresa_id = ? and ativo = 1 and perfil in ('chefe', 'administrador') and secao_id is not null and email is not null and email != ''").all(empresaAtual()))
        .map((u) => ({ ...u, unidade: pendentes.find((c) => c.secao.id === u.secao_id) }))
        .filter((u) => u.unidade);

  for (const u of pessoas) {
    const mensagem = montarMensagem({
      tipo, pessoa: u.nome, unidade: u.unidade ? nomeDe(u.unidade) : null, pendentes: pendentes.map(nomeDe), semana, dia, hora, origem,
    });
    resultado.destinatarios.push({ usuario_id: u.id, perfil: u.perfil, assunto: mensagem.assunto });
    if (ensaio || !transporte.real) continue;
    try {
      await db.prepare('insert into lembretes_enviados (empresa_id, semana, tipo, usuario_id, enviado_em, modo) values (?, ?, ?, ?, ?, ?)')
        .run(empresaAtual(), semana, tipo, u.id, agoraInstante.toISOString(), transporte.nome);
    } catch (e) {
      if (violacaoDeUnicidade(e)) { resultado.jaEnviados++; continue; }
      throw e;
    }
    try {
      await transporte.enviar({ para: u.email, assunto: mensagem.assunto, texto: mensagem.texto });
      resultado.enviados++;
    } catch (e) {
      // Falhou: libera a linha para a próxima rodada tentar de novo.
      await db.prepare('delete from lembretes_enviados where empresa_id = ? and semana = ? and tipo = ? and usuario_id = ?').run(empresaAtual(), semana, tipo, u.id);
      resultado.falhas++;
      console.error(JSON.stringify({ nivel: 'erro', lembrete: tipo, usuario: u.id, mensagem: String(e?.message || e).slice(0, 200) }));
    }
  }
  return resultado;
}

/** Roda os lembretes de todas as empresas ativas (menos a interna da plataforma). `ensaio` não envia nem grava nada. */
export async function rodarLembretes(db, { transporte = escolherTransporte(), ensaio = false, origem = '', agoraInstante = agora() } = {}) {
  const empresas = await db.prepare("select id, slug from empresas where ativa = 1 and slug != 'plataforma' order by id").all();
  const saida = [];
  for (const e of empresas) {
    const r = await comEmpresa(e.id, () => processarEmpresa(db, { transporte, ensaio, origem, agoraInstante }));
    saida.push({ empresa: e.slug, modo: ensaio || !transporte.real ? 'ensaio' : transporte.nome, ...r });
  }
  return saida;
}
