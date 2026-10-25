import type { CarimboTSE } from './parse';

export type Andamento = 'nao_iniciado' | 'em_andamento' | 'finalizado' | 'desconhecido';

export interface CandidatoResultado {
  numero: number;
  nomeUrna: string;
  nome: string | null;
  partido: string | null;
  /** Código único do candidato (sqcand), usado pelo TSE para a foto. */
  sqcand: number | null;
  /** Nome de urna do vice (vs[].tp = "v"). */
  vice: string | null;
  /** Sequência de ordenação publicada pelo TSE. */
  seq: number | null;
  /** Votos apurados (vap). null quando a divulgação ainda não traz votos válidos. */
  votos: number | null;
  /** Percentual oficial (pvapn/pvap). Base: votos computados para candidatos. */
  percentual: number | null;
  /** Flag oficial `e` do TSE: true = eleito (ou matematicamente eleito). */
  eleitoOficial: boolean;
  /** Situação oficial (st), preenchida pelo TSE só após a totalização final. */
  situacaoOficial: string | null;
}

export interface Resultado {
  abrangencia: string; // 'br', sigla da UF ou 'zz'
  eleicao: number;
  turno: number;
  /** true = arquivo de simulação do TSE (f="s"). Nunca exibir como real. */
  simulado: boolean;
  geradoEm: CarimboTSE | null;
  totalizadoEm: CarimboTSE | null;
  idGeracao: number | null;
  divulgacaoAutorizada: boolean | null; // dv
  andamento: Andamento;
  totalizacaoFinal: boolean; // tf
  motivoSemTotalizacaoFinal: string | null; // mntf
  /** md: "e" = TSE indica eleito matematicamente definido; "s" = 2º turno. */
  definidoMatematicamente: 'eleito' | 'segundo_turno' | 'nao' | null;
  secoes: {
    total: number | null;
    totalizadas: number | null;
    pctTotalizadas: number | null;
  };
  eleitorado: {
    total: number | null;
    emSecoesTotalizadas: number | null;
    comparecimento: number | null;
    abstencao: number | null;
    pctComparecimento: number | null;
    pctAbstencao: number | null;
  };
  /** Todos null enquanto os votos não estiverem disponíveis (ver `votosDisponiveis`). */
  votos: {
    total: number | null; // tv
    validos: number | null; // vv
    nominais: number | null; // vnom
    brancos: number | null; // vb
    nulos: number | null; // tvn (nulos + nulos técnicos)
    anulados: number | null; // van + vansj
    pctBrancos: number | null; // sobre tv
    pctNulos: number | null; // sobre tv
  };
  /** Há votos publicados e utilizáveis neste arquivo? */
  votosDisponiveis: boolean;
  candidatos: CandidatoResultado[];
  /** Campos desconhecidos e outras observações não fatais. */
  avisos: string[];
}

export interface AcompanhamentoAbr {
  abrangencia: string;
  andamento: Andamento;
  totalizadoEm: CarimboTSE | null;
  secoesTotal: number | null;
  secoesTotalizadas: number | null;
  pctTotalizadas: number | null;
}

export interface Acompanhamento {
  eleicao: number;
  turno: number;
  simulado: boolean;
  geradoEm: CarimboTSE | null;
  abrangencias: AcompanhamentoAbr[];
  avisos: string[];
}

export type Lideranca =
  | { estado: 'flavio' | 'lula'; diferencaVotos: number }
  | { estado: 'empate' }
  | { estado: 'neutro'; motivo: string };

export type StatusApuracao = 'aguardando' | 'em_andamento' | 'concluida_aguardando_final' | 'totalizada' | 'indisponivel';
