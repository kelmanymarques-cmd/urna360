/**
 * Camadas do mapa. A camada de liderança usa as cores dos candidatos;
 * as demais usam escalas neutras próprias, com faixas FIXAS (não dependem dos dados),
 * para que a cor de uma UF não mude só porque outra UF mudou.
 */
import { lideranca } from '../core/calc';
import type { Lideranca, Resultado } from '../core/types';
import type { AcompanhamentoAbr } from '../core/types';
import { pctTxt } from './format';

export type IdCamada = 'lideranca' | 'totalizacao' | 'brancos' | 'nulos' | 'abstencao';

export const CORES_CANDIDATOS = {
  flavio: '#1FA35B', // verde — Flávio Bolsonaro (regra do produto)
  lula: '#D93A3A', // vermelho — Lula (regra do produto)
  empate: '#B9C2D3',
  neutro: '#24314F',
} as const;

/**
 * Tons por vantagem (diferença em pontos percentuais entre os dois, só votos oficiais).
 * Faixas fixas: <2 p.p., 2–10, 10–20, ≥20. O tom mais forte é a cor base de cada candidato.
 */
export const FAIXAS_VANTAGEM = [
  { min: 0, rotulo: 'até 2 p.p.' },
  { min: 2, rotulo: '2 a 10 p.p.' },
  { min: 10, rotulo: '10 a 20 p.p.' },
  { min: 20, rotulo: '20 p.p. ou mais' },
] as const;
export const TONS: Record<'flavio' | 'lula', readonly string[]> = {
  flavio: ['#A7DDBD', '#63C48F', '#34AE6D', CORES_CANDIDATOS.flavio],
  lula: ['#F2B1B1', '#E97878', '#DF4F4F', CORES_CANDIDATOS.lula],
};
export function vantagemPP(r: Resultado | null): number | null {
  const l = lideranca(r);
  if ((l.estado !== 'flavio' && l.estado !== 'lula') || !r) return null;
  const c = r.candidatos.filter((x) => x.numero === 22 || x.numero === 13).reduce((s, x) => s + (x.votos ?? 0), 0);
  return c > 0 ? (l.diferencaVotos / c) * 100 : null;
}
export function tomVantagem(chave: 'flavio' | 'lula', pp: number | null): string {
  let i = 0;
  FAIXAS_VANTAGEM.forEach((f, k) => { if ((pp ?? 0) >= f.min) i = k; });
  return TONS[chave][i]!;
}

export interface Faixa {
  min: number;
  max: number | null;
  cor: string;
  rotulo: string;
}

export interface CamadaMetrica {
  id: Exclude<IdCamada, 'lideranca'>;
  titulo: string;
  descricao: string;
  denominador: string;
  faixas: Faixa[];
  valor: (r: Resultado | null, acomp: AcompanhamentoAbr | null) => number | null;
}

function faixas(limites: number[], cores: string[]): Faixa[] {
  return cores.map((cor, i) => {
    const min = limites[i] ?? 0;
    const max = limites[i + 1] ?? null;
    const rotulo = max === null ? `${min}% ou mais` : `${min}% a ${max}%`;
    return { min, max, cor, rotulo };
  });
}

export const CAMADAS_METRICAS: CamadaMetrica[] = [
  {
    id: 'totalizacao',
    titulo: 'Urnas totalizadas',
    descricao: 'Seções eleitorais já totalizadas pelo TSE.',
    denominador: '% do total de seções da UF',
    faixas: faixas([0, 20, 40, 60, 80, 100], ['#16264A', '#1E3F7A', '#2B5FB4', '#4A86E8', '#9CC2FF']).map((f, i, a) =>
      i === a.length - 1 ? { ...f, rotulo: '80% a 100%' } : f,
    ),
    valor: (r, a) => r?.secoes.pctTotalizadas ?? a?.pctTotalizadas ?? null,
  },
  {
    id: 'brancos',
    titulo: 'Votos brancos',
    descricao: 'Votos em branco. Não são votos de candidatos.',
    denominador: '% do total de votos da UF',
    faixas: faixas([0, 1, 2, 3, 4], ['#2A2350', '#46368A', '#6B54C2', '#957CE6', '#C8B8FF']),
    valor: (r) => (r?.votosDisponiveis ? r.votos.pctBrancos : null),
  },
  {
    id: 'nulos',
    titulo: 'Votos nulos',
    descricao: 'Votos nulos (inclui nulos técnicos). Não são votos de candidatos.',
    denominador: '% do total de votos da UF',
    faixas: faixas([0, 2, 4, 6, 8], ['#3A2E10', '#6B5212', '#A07A14', '#D6A419', '#FFD54A']),
    valor: (r) => (r?.votosDisponiveis ? r.votos.pctNulos : null),
  },
  {
    id: 'abstencao',
    titulo: 'Abstenção',
    descricao: 'Eleitores aptos que não compareceram, conforme o TSE.',
    denominador: '% do eleitorado das seções já totalizadas',
    faixas: faixas([0, 15, 20, 25, 30], ['#123236', '#1C5158', '#2A7A82', '#45A6AE', '#8FD8DD']),
    valor: (r) => r?.eleitorado.pctAbstencao ?? null,
  },
];

export function faixaDe(c: CamadaMetrica, v: number | null): Faixa | null {
  if (v === null) return null;
  for (let i = c.faixas.length - 1; i >= 0; i--) {
    const f = c.faixas[i]!;
    if (v >= f.min) return f;
  }
  return c.faixas[0] ?? null;
}

export interface Pintura {
  cor: string;
  padrao: 'flavio' | 'lula' | null;
  resumo: string;
  lid?: Lideranca;
}

export function pintar(camada: IdCamada, r: Resultado | null, acomp: AcompanhamentoAbr | null): Pintura {
  if (camada === 'lideranca') {
    const lid = lideranca(r);
    switch (lid.estado) {
      case 'flavio':
      case 'lula': {
        const pp = vantagemPP(r);
        const nome = lid.estado === 'flavio' ? 'Flávio Bolsonaro' : 'Lula';
        const vant = pp === null ? '' : ` — vantagem de ${pp.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`;
        return { cor: tomVantagem(lid.estado, pp), padrao: lid.estado, resumo: `${nome} com mais votos nominais (parcial)${vant}`, lid };
      }
      case 'empate':
        return { cor: CORES_CANDIDATOS.empate, padrao: null, resumo: 'Empate em votos nominais', lid };
      default:
        return { cor: CORES_CANDIDATOS.neutro, padrao: null, resumo: `Neutro: ${lid.motivo}`, lid };
    }
  }
  const c = CAMADAS_METRICAS.find((x) => x.id === camada)!;
  const v = c.valor(r, acomp);
  const f = faixaDe(c, v);
  if (!f) return { cor: CORES_CANDIDATOS.neutro, padrao: null, resumo: `${c.titulo}: sem dados` };
  return { cor: f.cor, padrao: null, resumo: `${c.titulo}: ${pctTxt(v)} (${c.denominador})` };
}
