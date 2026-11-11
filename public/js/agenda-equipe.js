// A agenda da reunião da equipe da seção (`GET /api/reunioes-equipe/agenda`) no formato que as telas da reunião da organização esperam:
// o formulário (`painelReuniao`) lê `agendaComoConfig`; o trilho e a prévia leem `agendaComoBoot`.
import { est } from './estado.js';

export const agendaComoConfig = (a) => ({ reuniao_dia: a.dia, reuniao_hora: a.hora, reuniao_intervalo: a.intervalo, combinados_frequencia: a.combinados_frequencia });

/** O trilho da reunião da equipe (do Início do chefe): o mesmo da organização, na agenda da seção. */
export const agendaComoBoot = (a) => ({ hoje: a.hoje, semana: a.semana, reuniao_proxima: a.proxima, reuniao_dia: a.dia, reuniao_hora: a.hora, reuniao_intervalo: a.intervalo,
  reuniao_anterior: a.anterior, config: agendaComoConfig(a), user: est.user, alteravel: true, rotulo_trilho: 'Reunião da equipe' });
