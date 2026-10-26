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
  let eleito = marcados.length === 1 ? marcados[0]! : null;
  if (r.definidoMatematicamente === 'eleito') {
    // Observado em 25/10/2026: o TSE publica md="e" sem marcar o candidato (cand.e="n").
    // Nesse caso, o definido só pode ser quem tem mais votos nominais — e só o nomeamos se a
    // aritmética confirmar (vantagem maior que todos os eleitores das seções não totalizadas).
    if (!eleito && marcados.length === 0) {
      const l = lideranca(r);
      const R = r.eleitorado.emSecoesNaoTotalizadas;
      if ((l.estado === 'flavio' || l.estado === 'lula') && R !== null && l.diferencaVotos > R) {
        eleito = CANDIDATOS.find((c) => c.chave === l.estado) ?? null;
      }
    }
    return { definido: true, motivo: 'matematico', eleito };
  }
  if (r.totalizacaoFinal && eleito) return { definido: true, motivo: 'totalizacao_final', eleito };
  return { definido: false };
}

export interface TotalRegiao {
  secoesTotal: number; secoesTotalizadas: number; pctTotalizadas: number | null;
  votos: Record<ChaveCandidato, number>; pct: Record<ChaveCandidato, number | null>;
  ufsComDados: number; ufsTotal: number;
}
/**
 * Soma dados OFICIAIS das UFs de uma região (não é estimativa).
 * Percentual = votos do candidato ÷ votos somados dos dois candidatos nessas UFs.
 */
export function somarRegiao(ufs: readonly string[], res: (uf: string) => Resultado | null): TotalRegiao {
  let ts = 0, st = 0, n = 0;
  const votos = { flavio: 0, lula: 0 } as Record<ChaveCandidato, number>;
  for (const uf of ufs) {
    const r = res(uf);
    if (!r) continue;
    ts += r.secoes.total ?? 0;
    st += r.secoes.totalizadas ?? 0;
    if (!r.votosDisponiveis || r.simulado) continue;
    const c = confirmados(r);
    if (c.flavio?.votos == null || c.lula?.votos == null) continue;
    votos.flavio += c.flavio.votos;
    votos.lula += c.lula.votos;
    n++;
  }
  const soma = votos.flavio + votos.lula;
  return {
    secoesTotal: ts, secoesTotalizadas: st, pctTotalizadas: ts > 0 ? (st / ts) * 100 : null,
    votos, pct: { flavio: soma > 0 ? (votos.flavio / soma) * 100 : null, lula: soma > 0 ? (votos.lula / soma) * 100 : null },
    ufsComDados: n, ufsTotal: ufs.length,
  };
}

/** Avanço da totalização (pontos percentuais) na janela, a partir de pontos oficiais observados. */
export function ritmo(pontos: { ms: number; pst: number }[], janelaMs = 10 * 60_000): { pp: number; minutos: number } | null {
  if (pontos.length < 2) return null;
  const ord = [...pontos].sort((a, b) => a.ms - b.ms);
  const fim = ord[ord.length - 1]!;
  const ini = [...ord].reverse().find((p) => p.ms <= fim.ms - janelaMs);
  if (!ini) return null;
  const minutos = Math.round((fim.ms - ini.ms) / 60_000);
  if (minutos <= 0 || minutos > 30) return null;
  return { pp: fim.pst - ini.pst, minutos };
}

export interface Consolidacao {
  lider: ChaveCandidato;
  outro: ChaveCandidato;
  /** Vantagem atual em votos (oficial). */
  vantagem: number;
  /** Teto absoluto de votos que ainda podem entrar: eleitores em seções não totalizadas (esnt). */
  restantesMax: number;
  /** Garantia matemática: vantagem > teto (nem todos os restantes votando no outro virariam). */
  garantido: boolean;
  /** Quanto a vantagem ainda precisa crescer para ficar irreversível (0 se garantido). */
  faltaParaGarantir: number;
  /** Cenário (estimativa): votos nominais que ainda devem entrar, pela taxa observada nas seções já totalizadas. */
  cenario: { taxaNominal: number; votosRestantes: number; outroPrecisa: number | null; liderPrecisa: number | null } | null;
}

/**
 * Conta da vitória — só aritmética sobre dados oficiais.
 * 1) Garantia matemática: o pior caso possível é TODOS os eleitores das seções não totalizadas
 *    votarem no outro candidato. Se a vantagem atual for maior que esse teto, a ordem não pode mais mudar.
 * 2) Cenário (rotulado como estimativa): supõe que as seções restantes terão a mesma taxa de votos
 *    nominais por eleitor observada até agora e calcula a fatia dos votos restantes que cada um precisaria.
 */
export function consolidacao(r: Resultado | null | undefined): Consolidacao | null {
  const l = lideranca(r);
  if (!r || (l.estado !== 'flavio' && l.estado !== 'lula')) return null;
  const R = r.eleitorado.emSecoesNaoTotalizadas;
  if (R === null) return null;
  const vantagem = l.diferencaVotos;
  const garantido = vantagem > R;
  const outro: ChaveCandidato = l.estado === 'flavio' ? 'lula' : 'flavio';
  const est = r.eleitorado.emSecoesTotalizadas;
  const nom = r.votos.nominais;
  let cenario: Consolidacao['cenario'] = null;
  if (est && nom && est > 0 && R > 0) {
    const taxa = nom / est;
    const V = R * taxa;
    // O outro precisa de x tal que x − (V − x) > vantagem  →  x > (V + vantagem) / 2
    const outroPrecisa = V > 0 ? ((V + vantagem) / 2 / V) * 100 : null;
    // O líder mantém a frente se tiver mais que (V − vantagem) / 2 dos restantes
    const liderPrecisa = V > 0 ? Math.max(0, ((V - vantagem) / 2 / V) * 100) : null;
    cenario = { taxaNominal: taxa, votosRestantes: V, outroPrecisa, liderPrecisa };
  }
  return { lider: l.estado, outro, vantagem, restantesMax: R, garantido, faltaParaGarantir: garantido ? 0 : R - vantagem + 1, cenario };
}
