/**
 * Configuração do pleito acompanhado pela URNA360.
 *
 * Todos os valores abaixo foram CONFIRMADOS na fonte oficial em 25/10/2026
 * (ver README → "Fonte oficial e evidências"). Não altere sem nova verificação.
 */

export const ELEICAO = {
  /** Código da eleição (Eleição Geral Federal — 2º turno, pleito 3221). */
  codigo: 6258,
  /** Número de controle com 6 dígitos usado nos nomes de arquivo. */
  codigoArquivo: '006258',
  turno: 2,
  ano: 2026,
  /** Código do cargo Presidente na especificação EA20. */
  cargo: '0001',
  cargoNumero: 1,
  /** Fase esperada nos arquivos oficiais: "o" = oficial. "s" = simulação. */
  faseEsperada: 'o' as const,
} as const;

export type ChaveCandidato = 'flavio' | 'lula';

export interface CandidatoConfirmado {
  chave: ChaveCandidato;
  /** Número de urna confirmado no arquivo oficial. */
  numero: number;
  /** Nome de urna exatamente como publicado pelo TSE (campo `nmu`). */
  nomeUrnaOficial: string;
  /** Nome para exibição. */
  rotulo: string;
}

/**
 * Candidatos confirmados no arquivo oficial br-c0001-e006258-u.json
 * (campo carg[].agr[].par[].cand[]): n=22 nmu="FLAVIO BOLSONARO" e n=13 nmu="LULA".
 * A regra de cor do mapa só é aplicada se número E nome de urna baterem.
 */
export const CANDIDATOS: readonly CandidatoConfirmado[] = [
  { chave: 'flavio', numero: 22, nomeUrnaOficial: 'FLAVIO BOLSONARO', rotulo: 'Flávio Bolsonaro' },
  { chave: 'lula', numero: 13, nomeUrnaOficial: 'LULA', rotulo: 'Lula' },
];

/** 26 estados + Distrito Federal (ordem alfabética da sigla). */
export const UFS = [
  'ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt', 'pa',
  'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to',
] as const;
export type UF = (typeof UFS)[number];

/** Abrangência "ZZ" (exterior) aparece nos arquivos do TSE mas não no mapa. */
export const ABRANGENCIA_EXTERIOR = 'zz';

export const NOMES_UF: Record<UF | 'zz' | 'br', string> = {
  br: 'Brasil', zz: 'Exterior',
  ac: 'Acre', al: 'Alagoas', am: 'Amazonas', ap: 'Amapá', ba: 'Bahia', ce: 'Ceará',
  df: 'Distrito Federal', es: 'Espírito Santo', go: 'Goiás', ma: 'Maranhão',
  mg: 'Minas Gerais', ms: 'Mato Grosso do Sul', mt: 'Mato Grosso', pa: 'Pará',
  pb: 'Paraíba', pe: 'Pernambuco', pi: 'Piauí', pr: 'Paraná', rj: 'Rio de Janeiro',
  rn: 'Rio Grande do Norte', ro: 'Rondônia', rr: 'Roraima', rs: 'Rio Grande do Sul',
  sc: 'Santa Catarina', se: 'Sergipe', sp: 'São Paulo', to: 'Tocantins',
};

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

/**
 * Base para buscar os arquivos. Padrão: proxy próprio (/api/tse), que faz cache,
 * respeita o limite do TSE e evita depender de CORS. Pode apontar direto para
 * https://resultados.tse.jus.br se o CORS for confirmado.
 */
export const BASE_DADOS = env.VITE_TSE_BASE ?? '/api/tse';
export const AMBIENTE = env.VITE_TSE_AMBIENTE ?? 'oficial';

/** Intervalo de consulta em segundos (mínimo 10 s). Cada rodada faz 2 requisições + só as UFs que mudaram; muito abaixo do limite do TSE (100 req/s por IP). O CDN do TSE guarda cada arquivo por até ~42 s; esse atraso é da fonte e nenhum painel consegue evitar. */
export const INTERVALO_SEGUNDOS = Math.max(10, Number(env.VITE_INTERVALO_SEGUNDOS ?? 10) || 10);
export const TIMEOUT_MS = 12_000;
/** Dado é considerado desatualizado após este tempo sem consulta bem-sucedida. */
export const LIMITE_DESATUALIZADO_MS = 3 * 60_000;

export function caminhoResultado(abr: 'br' | UF | 'zz'): string {
  return `/${AMBIENTE}/ele${ELEICAO.ano}/${ELEICAO.codigo}/dados/${abr}/${abr}-c${ELEICAO.cargo}-e${ELEICAO.codigoArquivo}-u.json`;
}

export function caminhoAcompanhamento(): string {
  return `/${AMBIENTE}/ele${ELEICAO.ano}/${ELEICAO.codigo}/dados/br/br-e${ELEICAO.codigoArquivo}-ab.json`;
}

export const FONTE = {
  nome: 'Tribunal Superior Eleitoral (TSE)',
  portal: 'https://resultados.tse.jus.br/oficial/app/index.html',
  documentacao: 'https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados',
};

/**
 * Foto oficial do candidato (pelo sqcand do arquivo EA20).
 * Endereço confirmado em 25/10/2026: HTTP 200 image/jpeg para os dois sqcand (ramo verificacao, fotos.txt).
 */
export const FOTOS_BASE = env.VITE_FOTOS_BASE ?? `https://resultados.tse.jus.br/oficial/ele${ELEICAO.ano}/${ELEICAO.codigo}/fotos/br`;
export function urlFoto(sqcand: number): string | null {
  return FOTOS_BASE ? `${FOTOS_BASE}/${sqcand}.jpeg` : null;
}

/** 1º turno (eleição 6257), já totalizado — confirmado em 25/10/2026 (HTTP 200, tf="s"). */
export const ELEICAO_1T = { codigo: 6257, codigoArquivo: '006257', turno: 1 } as const;
export function caminhoResultado1T(abr: string): string {
  return `/${AMBIENTE}/ele${ELEICAO.ano}/${ELEICAO_1T.codigo}/dados/${abr}/${abr}-c${ELEICAO.cargo}-e${ELEICAO_1T.codigoArquivo}-u.json`;
}
/** Configuração de municípios (EA12) — confirmado: abr[].cd (UF), abr[].mu[] {cd, nm, ...}. */
export function caminhoConfigMunicipios(): string {
  return `/${AMBIENTE}/ele${ELEICAO.ano}/${ELEICAO.codigo}/config/mun-e${ELEICAO.codigoArquivo}-cm.json`;
}
/** Resultado do município: <uf><cd 5 dígitos>-c0001-e006258-u.json — confirmado (pe26310). */
export function caminhoMunicipio(uf: string, cd: string): string {
  return `/${AMBIENTE}/ele${ELEICAO.ano}/${ELEICAO.codigo}/dados/${uf}/${uf}${cd}-c${ELEICAO.cargo}-e${ELEICAO.codigoArquivo}-u.json`;
}

/** Regiões do IBGE (para agrupar o seletor e somar os votos oficiais das UFs). */
export const REGIOES: { nome: string; ufs: UF[] }[] = [
  { nome: 'Norte', ufs: ['ac', 'ap', 'am', 'pa', 'ro', 'rr', 'to'] },
  { nome: 'Nordeste', ufs: ['al', 'ba', 'ce', 'ma', 'pb', 'pe', 'pi', 'rn', 'se'] },
  { nome: 'Centro-Oeste', ufs: ['df', 'go', 'mt', 'ms'] },
  { nome: 'Sudeste', ufs: ['es', 'mg', 'rj', 'sp'] },
  { nome: 'Sul', ufs: ['pr', 'rs', 'sc'] },
];
/** Histórico oficial coletado pela Action "historico" (ramo historico do repositório). */
export const URL_HISTORICO = env.VITE_URL_HISTORICO ?? 'https://raw.githubusercontent.com/kelmanymarques-cmd/urna360/historico/historico.json';
