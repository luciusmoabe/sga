// Vocabulário da empresa em curso, para a interface: atalhos sobre `vocabulario.js` que leem os nomes do bootstrap.
// Sem bootstrap ainda (tela de entrada), valem os nomes padrão.
import { est } from './estado.js';
import * as V from './vocabulario.js';

export const vocab = () => V.completarVocabulario(est.boot?.vocabulario);
const minuscula = (s) => s.charAt(0).toLowerCase() + s.slice(1);

export const nomeTipo = (tipo) => V.nomeTipo(vocab(), tipo);
/** A empresa usa este tipo de unidade? (a Coordenação de primeiro nível e a Diretoria Adjunta são opcionais) */
export const usaTipo = (tipo) => V.usaTipo(vocab(), tipo);
export const nomePlural = (tipo) => V.nomePlural(vocab(), tipo);
/** "Todos os Centros" / "Todas as Diretorias"; com `emFrase`, a primeira letra em minúscula. */
export const todasAs = (tipo, emFrase = false) => (emFrase ? minuscula(V.todasAs(vocab(), tipo)) : V.todasAs(vocab(), tipo));
export const dosPlural = (tipo) => V.dosPlural(vocab(), tipo);
export const esteTipo = (tipo) => V.esteTipo(vocab(), tipo);
export const oTipo = (tipo) => V.oTipo(vocab(), tipo);
export const rotuloPerfilDe = (perfil) => V.rotuloPerfil(vocab(), perfil);
/** Objeto que se lê como `PERFIL[perfil]`, sempre com os nomes atuais da empresa. */
export const PERFIL_DA_EMPRESA = new Proxy({}, { get: (_, perfil) => (typeof perfil === 'string' ? rotuloPerfilDe(perfil) : undefined) });
/** Objeto que se lê como `TIPO[tipo]`. */
export const TIPO_DA_EMPRESA = new Proxy({}, { get: (_, tipo) => (typeof tipo === 'string' ? nomeTipo(tipo) : undefined) });
