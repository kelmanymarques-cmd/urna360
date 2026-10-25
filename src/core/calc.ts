import { CANDIDATOS, type CandidatoConfirmado, type ChaveCandidato } from '../config';
import type { CandidatoResultado, Lideranca, Resultado, StatusApuracao } from './types';

function normalizarNome(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
}

/**
 * Localiza o candidato confirmado no resultado: exige número E nome de urna iguais
 * aos confirmados na fonte oficial. Se não bater, retorna null (nunca adivinha).
 */
export function localizarCandidato(r: Resultado, conf: CandidatoConfirmado): CandidatoResultado | null {
  const c = r.candidatos.find((x) => x.numero === conf.numero);
  if (!c) return null;
  return normalizarNome(c.nomeUrna) === normalizarNome(conf.nomeUrnaOficial) ? c : null;
}

export function confirmados(r: Resultado): Record<ChaveCandidato, CandidatoResultado | null> {
  const out = {} as Record<ChaveCandidato, CandidatoResultado | null>;
  for (const conf of CANDIDATOS) out[conf.chave] = localizarCandidato(r, conf);
  return out;
}

/**
 * Liderança por votos nominais em uma abrangência.
 * Só retorna um candidato quando há dados oficiais válidos dos DOIS candidatos.
 * Brancos, nulos e abstenção não participam desta comparação.
 */
export function lideranca(r: Resultado | null | undefined): Lideranca {
  if (!r) return { estado: 'neutro', motivo: 'Sem dados oficiais para esta UF.' };
  if (r.simulado) return { estado: 'neutro', motivo: 'Arquivo de simulação do TSE — não é resultado real.' };
  if (r.divulgacaoAutorizada !== true) return { estado: 'neutro', motivo: 'Divulgação de votos ainda não autorizada pelo TSE.' };
  if (!r.votosDisponiveis) return { estado: 'neutro', motivo: 'Nenhuma seção totalizada ainda.' };
  const { flavio, lula } = confirmados(r);
  if (!flavio || !lula) return { estado: 'neutro', motivo: 'Candidatos não confirmados no arquivo (número/nome divergente).' };
  if (flavio.votos === null || lula.votos === null) return { estado: 'neutro', motivo: 'Votos nominais ausentes ou inválidos.' };
  if (flavio.votos === 0 && lula.votos === 0) return { estado: 'neutro', motivo: 'Ainda sem votos nominais apurados.' };
  if (flavio.votos === lula.votos) return { estado: 'empate' };
  return flavio.votos > lula.votos
    ? { estado: 'flavio', diferencaVotos: flavio.votos - lula.votos }
    : { estado: 'lula', diferencaVotos: lula.votos - flavio.votos };
}

/** Estado da apuração exclusivamente a partir dos campos oficiais (and, tf, st). */
export function statusApuracao(r: Resultado | null | undefined): StatusApuracao {
  if (!r) return 'indisponivel';
  if (r.totalizacaoFinal) return 'totalizada';
  if (r.andamento === 'finalizado') return 'concluida_aguardando_final';
  if (r.andamento === 'nao_iniciado' || !r.secoes.totalizadas) return 'aguardando';
  return 'em_andamento';
}

export const ROTULO_STATUS: Record<StatusApuracao, string> = {
  indisponivel: 'Dados indisponíveis',
  aguardando: 'Aguardando dados oficiais',
  em_andamento: 'Apuração em andamento (parcial)',
  concluida_aguardando_final: 'Apuração concluída — aguardando totalização final do TSE',
  totalizada: 'Totalizada pelo TSE',
};

export type Eleicao =
  | { definido: false }
  | { definido: true; motivo: 'matematico' | 'totalizacao_final'; eleito: CandidatoConfirmado | null };

/**
 * Resultado definido SEGUNDO O TSE (nunca por cálculo próprio):
 * md="e" (matematicamente definido) ou totalização final com candidato marcado como eleito.
 * O eleito só é nomeado se o TSE marcar exatamente um candidato confirmado (número + nome de urna).
 */
export function eleicaoDefinida(r: Resultado | null | undefined): Eleicao {
  if (!r || r.simulado || r.divulgacaoAutorizada !== true) return { definido: false };
  const marcados = CANDIDATOS.filter((c) => {
    const d = localizarCandidato(r, c);
    return d && (d.eleitoOficial || /^eleit/i.test(d.situacaoOficial ?? ''));
  });
  const eleito = marcados.length === 1 ? marcados[0]! : null;
  if (r.definidoMatematicamente === 'eleito') return { definido: true, motivo: 'matematico', eleito };
  if (r.totalizacaoFinal && eleito) return { definido: true, motivo: 'totalizacao_final', eleito };
  return { definido: false };
}
