/**
 * Análise 1º → 2º turno com dados oficiais (aritmética agregada).
 *
 * Identidade usada (por abrangência):
 *   (Flávio₂ + Lula₂) − (Flávio₁ + Lula₁)  =  Outros₁  +  (Nominais₂ − Nominais₁)
 * e  Nominais₂ − Nominais₁  ≈  ΔComparecimento − Δ(Brancos + Nulos) − ΔAnulados.
 *
 * IMPORTANTE: são saldos agregados. Não dizem quem votou em quem (não há dado individual);
 * por exemplo, "Lula ganhou mais que os votos dos outros candidatos" não significa que
 * eleitores de Flávio migraram — pode ser comparecimento novo, menos brancos/nulos etc.
 */
import type { Resultado } from './types';
import { confirmados } from './calc';

export interface Fluxo {
  abr: string;
  f1: number; l1: number; outros1: number; qtdOutros: number; nominais1: number; bn1: number; comp1: number | null;
  f2: number; l2: number; nominais2: number; bn2: number; comp2: number | null;
  dF: number; dL: number;
  /** Votos que os dois receberam a mais que no 1º turno, somados (= dF + dL). */
  novosParaOsDois: number;
  /** Fatia desse saldo que foi para Lula (0–100). null se algum dos dois perdeu votos (fatia não faz sentido). */
  fatiaLula: number | null;
  dComparecimento: number | null;
  dBrancosNulos: number;
  /** Diferença Flávio − Lula em cada turno e a variação (negativa = moveu para Lula). */
  margem1: number; margem2: number; dMargem: number;
  /** % de seções do 2º turno já totalizadas (para saber se o dado ainda muda). */
  pctSecoes2: number | null;
}

export function fluxo(abr: string, r1: Resultado | null, r2: Resultado | null): Fluxo | null {
  if (!r1 || !r2 || !r2.votosDisponiveis || !r1.votosDisponiveis) return null;
  const c1 = confirmados(r1);
  const c2 = confirmados(r2);
  const f1 = c1.flavio?.votos, l1 = c1.lula?.votos, f2 = c2.flavio?.votos, l2 = c2.lula?.votos;
  const n1 = r1.votos.nominais, n2 = r2.votos.nominais;
  if (f1 == null || l1 == null || f2 == null || l2 == null || n1 == null || n2 == null) return null;
  const bn1 = (r1.votos.brancos ?? 0) + (r1.votos.nulos ?? 0);
  const bn2 = (r2.votos.brancos ?? 0) + (r2.votos.nulos ?? 0);
  const dF = f2 - f1;
  const dL = l2 - l1;
  const novos = dF + dL;
  return {
    abr,
    f1, l1, outros1: Math.max(0, n1 - f1 - l1), qtdOutros: Math.max(0, r1.candidatos.length - 2), nominais1: n1, bn1, comp1: r1.eleitorado.comparecimento,
    f2, l2, nominais2: n2, bn2, comp2: r2.eleitorado.comparecimento,
    dF, dL, novosParaOsDois: novos,
    fatiaLula: novos > 0 && dF >= 0 && dL >= 0 ? (dL / novos) * 100 : null,
    dComparecimento: r1.eleitorado.comparecimento != null && r2.eleitorado.comparecimento != null ? r2.eleitorado.comparecimento - r1.eleitorado.comparecimento : null,
    dBrancosNulos: bn2 - bn1,
    margem1: f1 - l1, margem2: f2 - l2, dMargem: (f2 - l2) - (f1 - l1),
    pctSecoes2: r2.secoes.pctTotalizadas,
  };
}

export interface Resumo {
  nacional: Fluxo;
  /** UFs ordenadas pela contribuição para a mudança da diferença rumo a Lula (dMargem mais negativo primeiro). */
  rumoLula: Fluxo[];
  /** UFs onde a diferença se moveu a favor de Flávio. */
  rumoFlavio: Fluxo[];
  /** UFs onde Flávio teve menos votos absolutos que no 1º turno. */
  flavioPerdeuVotos: Fluxo[];
  /** UFs onde Lula ganhou mais votos do que os outros candidatos tinham somado no 1º turno. */
  lulaAlemDosOutros: Fluxo[];
  /** Soma das variações de diferença das UFs (para checar contra o nacional; diferença = exterior). */
  somaUFs: number;
}

export function resumir(nacional: Fluxo, ufs: Fluxo[]): Resumo {
  return {
    nacional,
    rumoLula: ufs.filter((u) => u.dMargem < 0).sort((a, b) => a.dMargem - b.dMargem),
    rumoFlavio: ufs.filter((u) => u.dMargem > 0).sort((a, b) => b.dMargem - a.dMargem),
    flavioPerdeuVotos: ufs.filter((u) => u.dF < 0).sort((a, b) => a.dF - b.dF),
    lulaAlemDosOutros: ufs.filter((u) => u.dL > u.outros1).sort((a, b) => (b.dL - b.outros1) - (a.dL - a.outros1)),
    somaUFs: ufs.reduce((s, u) => s + u.dMargem, 0),
  };
}
