import { describe, expect, it } from 'vitest';
import { fluxo, resumir } from '../../src/core/analise';
import { normalizarResultado } from '../../src/core/normalize';
import { ea20 } from '../fixtures/ea20';

const t1 = (abr: string, o: Parameters<typeof ea20>[0]) => {
  const raw = ea20({ abr, ele: 6257, t: 1, st: 100, ts: 100, tf: 's', and: 'f', ...o }) as Record<string, any>;
  // um terceiro candidato com 100 votos no 1º turno
  raw.carg[0].agr.push({ n: '55', nm: 'X', tp: 'i', par: [{ n: '55', sg: 'X', nm: 'X', cand: [{ n: 55, nmu: 'OUTRO', nm: 'OUTRO', seq: 3, vap: '100', pvap: '10,00', e: 'n', st: 'Não eleito' }] }] });
  raw.v.vnom = String(Number(raw.v.vnom) + 100);
  return normalizarResultado(raw, abr, { codigo: 6257, turno: 1 });
};
const t2 = (abr: string, o: Parameters<typeof ea20>[0]) => normalizarResultado(ea20({ abr, st: 100, ts: 100, ...o }), abr);

describe('análise 1º → 2º turno', () => {
  it('identidade: votos novos dos dois = outros do 1º + variação dos nominais', () => {
    const f = fluxo('pe', t1('pe', { flavio: 500, lula: 400, vb: 30, vn: 20, c: 1000, a: 100 }), t2('pe', { flavio: 520, lula: 560, vb: 10, vn: 10, c: 1120, a: 80 }))!;
    expect(f.outros1).toBe(100);
    expect(f.qtdOutros).toBe(1);
    expect(f.dF).toBe(20);
    expect(f.dL).toBe(160);
    expect(f.novosParaOsDois).toBe(f.outros1 + (f.nominais2 - f.nominais1));
    expect(f.fatiaLula).toBeCloseTo((160 / 180) * 100);
    expect(f.margem1).toBe(100);
    expect(f.margem2).toBe(-40);
    expect(f.dMargem).toBe(-140);
    expect(f.dComparecimento).toBe(120);
    expect(f.dBrancosNulos).toBe(-30);
  });
  it('fatia indefinida quando um dos dois perdeu votos', () => {
    const f = fluxo('ac', t1('ac', { flavio: 500, lula: 400 }), t2('ac', { flavio: 480, lula: 470 }))!;
    expect(f.dF).toBe(-20);
    expect(f.fatiaLula).toBeNull();
  });
  it('resumo classifica estados de forma simétrica', () => {
    const a = fluxo('pe', t1('pe', { flavio: 500, lula: 400 }), t2('pe', { flavio: 480, lula: 600 }))!;
    const b = fluxo('sc', t1('sc', { flavio: 400, lula: 500 }), t2('sc', { flavio: 700, lula: 450 }))!;
    const r = resumir(a, [a, b]);
    expect(r.rumoLula.map((x) => x.abr)).toEqual(['pe']);
    expect(r.rumoFlavio.map((x) => x.abr)).toEqual(['sc']);
    expect(r.flavioPerdeuVotos.map((x) => x.abr)).toEqual(['pe']);
    expect(r.lulaAlemDosOutros.map((x) => x.abr)).toEqual(['pe']);
  });
  it('sem votos no 2º turno não calcula', () => {
    expect(fluxo('pe', t1('pe', { flavio: 1, lula: 1 }), t2('pe', { st: 0 }))).toBeNull();
  });
});
