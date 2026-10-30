// Empresa em curso: cada requisição autenticada roda dentro de um contexto assíncrono com o `empresa_id` de quem está
// logado. Todo SQL sobre tabelas raiz filtra por esse número (ver MULTIEMPRESA.md). O número vem sempre da conta no banco,
// nunca do cliente.
import { AsyncLocalStorage } from 'node:async_hooks';

const contexto = new AsyncLocalStorage();

/** Roda `fn` com a empresa informada como a empresa em curso. */
export const comEmpresa = (empresaId, fn) => contexto.run({ empresaId: Number(empresaId) }, fn);

/** Há uma empresa em curso (requisição autenticada)? */
export const temEmpresa = () => contexto.getStore() !== undefined;

/** A empresa em curso. Falha alto, em vez de deixar uma consulta sem filtro passar em silêncio. */
export function empresaAtual() {
  const c = contexto.getStore();
  if (!c || !Number.isInteger(c.empresaId) || c.empresaId < 1) throw new Error('Consulta sem empresa em curso.');
  return c.empresaId;
}

/** Middleware: depois da autenticação, fixa a empresa da conta para o resto da requisição. */
export const escopoDaEmpresa = (req, res, next) => (req.user ? comEmpresa(req.user.empresa_id, next) : next());

// ---------- Rede de segurança ----------
// Com SGC_LINT_EMPRESA=1 (ligado nos testes), toda consulta feita dentro de uma requisição autenticada que leia, grave ou
// apague uma tabela raiz sem mencionar `empresa_id` falha na hora. Junções por chave primária (`join secoes s on s.id = ...`)
// partem de uma linha que já foi filtrada e ficam de fora; `from`, `update`, `delete from` e `insert into` não.
const RAIZES = ['secoes', 'usuarios', 'diretrizes', 'acoes', 'combinados', 'avisos', 'reunioes', 'atualizacoes', 'config'];
const REFERENCIA = new RegExp(`\\b(?:from|update|into)\\s+(${RAIZES.join('|')})\\b`, 'gi');

// Exceção declarada: a consulta que PRECISA olhar todas as empresas (e-mail único no sistema inteiro) leva /*global*/.
export function semFiltroDeEmpresa(sql) {
  if (String(sql).includes('/*global*/')) return null;
  const limpo = String(sql).replace(/'(?:[^']|'')*'/g, "''");
  const refs = [...limpo.matchAll(REFERENCIA)].map((m) => m[1].toLowerCase());
  if (!refs.length) return null;
  const filtros = (limpo.match(/\bempresa_id\b/gi) || []).length;
  return filtros >= refs.length ? null : refs;
}

/** Envolve `db.prepare` e `db.exec` para aplicar a rede de segurança. Devolve o próprio `db`. */
export function instalarLintDeEmpresa(db) {
  if (db.__lintEmpresa) return db;
  db.__lintEmpresa = true;
  const verificar = (sql) => {
    if (!temEmpresa()) return;
    const refs = semFiltroDeEmpresa(sql);
    if (refs) throw new Error(`SQL sem filtro de empresa (${[...new Set(refs)].join(', ')}): ${String(sql).replace(/\s+/g, ' ').trim().slice(0, 160)}`);
  };
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => { verificar(sql); return prepare(sql); };
  return db;
}
