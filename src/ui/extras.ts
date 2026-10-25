/**
 * Recursos de consulta sob demanda: 1º turno, municípios e compartilhamento.
 * Tudo vem de arquivos oficiais do TSE; nada é estimado.
 */
import {
  BASE_DADOS, CANDIDATOS, ELEICAO_1T, TIMEOUT_MS, caminhoConfigMunicipios, caminhoMunicipio, caminhoResultado1T,
} from '../config';
import { confirmados } from '../core/calc';
import { isObj, texto } from '../core/parse';
import { normalizarResultado } from '../core/normalize';
import type { Resultado } from '../core/types';
import { buscarJson, type Busca } from '../data/fetcher';
import { pctTxt } from './format';

const opts = () => ({ timeoutMs: TIMEOUT_MS });

// ---------- 1º turno (arquivo final, baixado uma vez por abrangência) ----------
const cache1T = new Map<string, Promise<Busca<Resultado>>>();
export function primeiroTurno(abr: string): Promise<Busca<Resultado>> {
  let p = cache1T.get(abr);
  if (!p) {
    p = buscarJson(`${BASE_DADOS}${caminhoResultado1T(abr)}`, (r) => normalizarResultado(r, abr, ELEICAO_1T), opts());
    p.then((b) => { if (!b.ok) cache1T.delete(abr); });
    cache1T.set(abr, p);
  }
  return p;
}

/** Texto curto com o desempenho de 22 e 13 no 1º turno (percentual oficial; base = todos os candidatos). */
export function resumo1T(r: Resultado): string {
  const c = confirmados(r);
  return CANDIDATOS.map((x) => `${x.rotulo} ${pctTxt(c[x.chave]?.percentual)}`).join(' · ');
}

// ---------- municípios ----------
export interface Municipio { cd: string; nm: string; capital: boolean }
let configMun: Promise<Record<string, Municipio[]>> | null = null;

export function normalizarConfigMunicipios(raw: unknown): Record<string, Municipio[]> {
  if (!isObj(raw) || !Array.isArray(raw.abr)) throw new Error('Configuração de municípios inválida.');
  const out: Record<string, Municipio[]> = {};
  for (const uf of raw.abr) {
    if (!isObj(uf) || !Array.isArray(uf.mu)) continue;
    const sigla = texto(uf.cd)?.toLowerCase();
    if (!sigla) continue;
    out[sigla] = uf.mu
      .filter(isObj)
      .map((m) => ({ cd: texto(m.cd) ?? '', nm: texto(m.nm) ?? '', capital: m.c === 's' }))
      .filter((m) => /^\d{5}$/.test(m.cd) && m.nm)
      .sort((a, b) => a.nm.localeCompare(b.nm, 'pt-BR'));
  }
  return out;
}

export function municipiosDaUF(uf: string): Promise<Municipio[]> {
  configMun ??= buscarJson(`${BASE_DADOS}${caminhoConfigMunicipios()}`, normalizarConfigMunicipios, opts()).then((b) => {
    if (!b.ok) { configMun = null; throw new Error(b.erro.mensagem); }
    return b.dados;
  });
  return configMun.then((m) => m[uf] ?? []);
}

export function resultadoMunicipio(uf: string, cd: string): Promise<Busca<Resultado>> {
  return buscarJson(`${BASE_DADOS}${caminhoMunicipio(uf, cd)}`, (r) => normalizarResultado(r, cd), opts());
}

/** Busca sem acento e sem diferenciar maiúsculas. */
export function acharMunicipio(lista: Municipio[], termo: string): Municipio | null {
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
  const t = n(termo);
  if (!t) return null;
  return lista.find((m) => n(m.nm) === t) ?? null;
}

// ---------- compartilhar ----------
export function textoCompartilhar(r: Resultado, url: string): string {
  const c = confirmados(r);
  const cands = CANDIDATOS.map((x) => ({ x, d: c[x.chave] }))
    .sort((a, b) => (a.d?.seq ?? 99) - (b.d?.seq ?? 99))
    .map(({ x, d }) => `${x.rotulo} ${r.votosDisponiveis ? pctTxt(d?.percentual) : '—'}`)
    .join(' · ');
  const quando = r.totalizadoEm ? `totalização das ${r.totalizadoEm.texto.slice(11, 16)}` : 'aguardando totalização';
  const fim = r.totalizacaoFinal ? 'Resultado final (TSE).' : 'Parcial — não é resultado final.';
  return `Apuração 2º turno · Presidente (TSE, ${quando}): ${pctTxt(r.secoes.pctTotalizadas)} das seções. ${cands}. ${fim} Fonte: TSE via URNA360 ${url}`;
}

export async function compartilhar(textoMsg: string): Promise<'compartilhado' | 'copiado' | 'falhou'> {
  try {
    if (navigator.share) {
      await navigator.share({ title: 'URNA360 — apuração', text: textoMsg });
      return 'compartilhado';
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return 'falhou';
  }
  try {
    await navigator.clipboard.writeText(textoMsg);
    return 'copiado';
  } catch {
    return 'falhou';
  }
}
