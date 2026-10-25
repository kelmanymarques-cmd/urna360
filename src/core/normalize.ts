/**
 * Normalização dos arquivos oficiais do TSE para o modelo interno.
 * Especificações seguidas: EA20 (resultado unificado) e EA14 (acompanhamento Brasil),
 * Eleições 2026. Ver README para links e evidências.
 */
import { ELEICAO } from '../config';
import { carimbo, flag, inteiro, isObj, percentual, pct, texto, type Obj } from './parse';
import type { Acompanhamento, AcompanhamentoAbr, Andamento, CandidatoResultado, Resultado } from './types';

export type TipoErroNormalizacao = 'formato' | 'eleicao_divergente' | 'abrangencia_divergente' | 'campos_obrigatorios';

export class ErroNormalizacao extends Error {
  constructor(public readonly tipo: TipoErroNormalizacao, mensagem: string) {
    super(mensagem);
    this.name = 'ErroNormalizacao';
  }
}

const CHAVES_RAIZ_EA20 = new Set([
  'ele', 't', 'f', 'sup', 'tpabr', 'cdabr', 'dg', 'hg', 'idg', 'dv', 'dt', 'ht', 'tf', 'mntf',
  'and', 'md', 'esae', 'mnae', 'carg', 'perg', 's', 'e', 'v',
]);

function andamento(v: unknown): Andamento {
  if (v === 'n') return 'nao_iniciado';
  if (v === 'p') return 'em_andamento';
  if (v === 'f') return 'finalizado';
  return 'desconhecido';
}

/** Percentual oficial (campo numérico "…n", depois o de 2 casas) ou cálculo próprio como reserva. */
function pctOficialOu(o: Obj, chave: string, parte: number | null, total: number | null): number | null {
  return percentual(o[`${chave}n`]) ?? percentual(o[chave]) ?? pct(parte, total);
}

function validarCabecalho(raw: Obj, avisos: string[]): { simulado: boolean } {
  const ele = inteiro(raw.ele);
  const turno = inteiro(raw.t);
  if (ele === null || turno === null) {
    throw new ErroNormalizacao('campos_obrigatorios', 'Arquivo sem código de eleição (ele) ou turno (t).');
  }
  if (ele !== ELEICAO.codigo || turno !== ELEICAO.turno) {
    throw new ErroNormalizacao(
      'eleicao_divergente',
      `Arquivo de outra eleição (ele=${ele}, t=${turno}); esperado ele=${ELEICAO.codigo}, t=${ELEICAO.turno}.`,
    );
  }
  const fase = raw.f;
  if (fase !== 'o' && fase !== 's') avisos.push(`Fase desconhecida (f=${String(fase)}).`);
  return { simulado: fase !== 'o' };
}

export function normalizarResultado(raw: unknown, abrangenciaEsperada: string): Resultado {
  if (!isObj(raw)) throw new ErroNormalizacao('formato', 'Resposta não é um objeto JSON.');
  const avisos: string[] = [];
  const { simulado } = validarCabecalho(raw, avisos);

  const cdabr = texto(raw.cdabr)?.toLowerCase() ?? null;
  if (cdabr !== null && cdabr !== abrangenciaEsperada.toLowerCase()) {
    throw new ErroNormalizacao('abrangencia_divergente', `Arquivo de ${cdabr}, esperado ${abrangenciaEsperada}.`);
  }
  if (!isObj(raw.s)) throw new ErroNormalizacao('campos_obrigatorios', 'Arquivo sem bloco de seções (s).');

  for (const k of Object.keys(raw)) if (!CHAVES_RAIZ_EA20.has(k)) avisos.push(`Campo desconhecido ignorado: ${k}`);

  const s = raw.s;
  const e = isObj(raw.e) ? raw.e : {};
  const v = isObj(raw.v) ? raw.v : {};
  if (!isObj(raw.e)) avisos.push('Bloco de eleitorado (e) ausente.');
  if (!isObj(raw.v)) avisos.push('Bloco de votos (v) ausente.');

  const ts = inteiro(s.ts);
  const st = inteiro(s.st);
  const and = andamento(raw.and);
  const dv = flag(raw.dv);

  // Regra EA20: com dv="n" os votos são publicados zerados — não são votos reais.
  // Sem seções totalizadas, também não há votos a mostrar.
  const votosDisponiveis = dv === true && st !== null && st > 0 && and !== 'nao_iniciado';
  if (dv === false) avisos.push('TSE ainda não autorizou a divulgação de votos (dv="n").');

  const tv = inteiro(v.tv);
  const vb = inteiro(v.vb);
  const tvn = inteiro(v.tvn) ?? somaSeAmbos(inteiro(v.vn), inteiro(v.vnt));
  const van = somaSeAmbos(inteiro(v.van) ?? 0, inteiro(v.vansj) ?? 0);
  const vvc = inteiro(v.vvc);

  const est = inteiro(e.est);
  const c = inteiro(e.c);
  const a = inteiro(e.a);
  const temEleitoradoApurado = est !== null && est > 0;

  const candidatos = extrairCandidatos(raw, avisos).map((cand) =>
    votosDisponiveis ? { ...cand, percentual: cand.percentual ?? pct(cand.votos, vvc) } : { ...cand, votos: null, percentual: null },
  );

  const md = raw.md;
  return {
    abrangencia: cdabr ?? abrangenciaEsperada.toLowerCase(),
    eleicao: ELEICAO.codigo,
    turno: ELEICAO.turno,
    simulado,
    geradoEm: carimbo(raw.dg, raw.hg),
    totalizadoEm: carimbo(raw.dt, raw.ht),
    idGeracao: inteiro(raw.idg),
    divulgacaoAutorizada: dv,
    andamento: and,
    totalizacaoFinal: flag(raw.tf) === true,
    motivoSemTotalizacaoFinal: texto(raw.mntf),
    definidoMatematicamente: md === 'e' ? 'eleito' : md === 's' ? 'segundo_turno' : md === 'n' ? 'nao' : null,
    secoes: {
      total: ts,
      totalizadas: st,
      pctTotalizadas: pctOficialOu(s, 'pst', st, ts),
    },
    eleitorado: {
      total: inteiro(e.te),
      emSecoesTotalizadas: est,
      comparecimento: temEleitoradoApurado ? c : null,
      abstencao: temEleitoradoApurado ? a : null,
      pctComparecimento: temEleitoradoApurado ? pctOficialOu(e, 'pc', c, somaSeAmbos(c, a)) : null,
      pctAbstencao: temEleitoradoApurado ? pctOficialOu(e, 'pa', a, somaSeAmbos(c, a)) : null,
    },
    votos: votosDisponiveis
      ? {
          total: tv,
          validos: inteiro(v.vv),
          nominais: inteiro(v.vnom),
          brancos: vb,
          nulos: tvn,
          anulados: van,
          pctBrancos: pctOficialOu(v, 'pvb', vb, tv),
          pctNulos: pctOficialOu(v, 'ptvn', tvn, tv),
        }
      : { total: null, validos: null, nominais: null, brancos: null, nulos: null, anulados: null, pctBrancos: null, pctNulos: null },
    votosDisponiveis,
    candidatos,
    avisos,
  };
}

function somaSeAmbos(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a + b;
}

function extrairCandidatos(raw: Obj, avisos: string[]): CandidatoResultado[] {
  if (!Array.isArray(raw.carg)) {
    avisos.push('Lista de cargos (carg) ausente.');
    return [];
  }
  const cargo = raw.carg.find((c) => isObj(c) && inteiro(c.cd) === ELEICAO.cargoNumero) ?? null;
  if (!isObj(cargo)) {
    avisos.push('Cargo Presidente não encontrado no arquivo.');
    return [];
  }
  const out: CandidatoResultado[] = [];
  const agrs = Array.isArray(cargo.agr) ? cargo.agr : [];
  for (const agr of agrs) {
    if (!isObj(agr) || !Array.isArray(agr.par)) continue;
    for (const par of agr.par) {
      if (!isObj(par) || !Array.isArray(par.cand)) continue;
      for (const cand of par.cand) {
        if (!isObj(cand)) continue;
        const numero = inteiro(cand.n);
        const nomeUrna = texto(cand.nmu);
        if (numero === null || nomeUrna === null) {
          avisos.push('Candidato sem número ou nome de urna ignorado.');
          continue;
        }
        out.push({
          numero,
          nomeUrna,
          nome: texto(cand.nm),
          partido: texto(par.sg),
          sqcand: inteiro(cand.sqcand),
          vice: extrairVice(cand.vs),
          seq: inteiro(cand.seq),
          votos: inteiro(cand.vap),
          percentual: percentual(cand.pvapn) ?? percentual(cand.pvap),
          eleitoOficial: flag(cand.e) === true,
          situacaoOficial: texto(cand.st) || null,
        });
      }
    }
  }
  out.sort((x, y) => (x.seq ?? 99) - (y.seq ?? 99) || x.numero - y.numero);
  return out;
}

function extrairVice(vs: unknown): string | null {
  if (!Array.isArray(vs)) return null;
  const v = vs.find((x) => isObj(x) && x.tp === 'v');
  return isObj(v) ? texto(v.nmu) ?? texto(v.nm) : null;
}

/** EA14 — arquivo de acompanhamento Brasil (br-e006258-ab.json). */
export function normalizarAcompanhamento(raw: unknown): Acompanhamento {
  if (!isObj(raw)) throw new ErroNormalizacao('formato', 'Resposta não é um objeto JSON.');
  const avisos: string[] = [];
  const { simulado } = validarCabecalho(raw, avisos);
  if (!Array.isArray(raw.abr)) throw new ErroNormalizacao('campos_obrigatorios', 'Arquivo sem lista de abrangências (abr).');
  const abrangencias: AcompanhamentoAbr[] = [];
  for (const item of raw.abr) {
    if (!isObj(item)) continue;
    const cd = texto(item.cdabr)?.toLowerCase();
    if (!cd) continue;
    const s = isObj(item.s) ? item.s : {};
    const ts = inteiro(s.ts);
    const st = inteiro(s.st);
    abrangencias.push({
      abrangencia: cd,
      andamento: andamento(item.and),
      totalizadoEm: carimbo(item.dt, item.ht),
      secoesTotal: ts,
      secoesTotalizadas: st,
      pctTotalizadas: pctOficialOu(s, 'pst', st, ts),
    });
  }
  return { eleicao: ELEICAO.codigo, turno: ELEICAO.turno, simulado, geradoEm: carimbo(raw.dg, raw.hg), abrangencias, avisos };
}
