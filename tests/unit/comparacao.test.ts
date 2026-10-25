import { describe, expect, it } from 'vitest';
import { linhaComparacao, ordenar } from '../../src/ui/comparacao';
import { normalizarResultado } from '../../src/core/normalize';
import { ea20 } from '../fixtures/ea20';

const t1 = (o = {}) => normalizarResultado(ea20({ abr: 'pe', ele: 6257, t: 1, st: 100, ts: 100, flavio: 300, lula: 600, tf: 's', and: 'f', ...o }), 'pe', { codigo: 6257, turno: 1 });
const t2 = (o = {}) => normalizarResultado(ea20({ abr: 'pe', st: 50, ts: 100, flavio: 350, lula: 650, ...o }), 'pe');

describe('comparação 1º × 2º turno', () => {
  it('base "dois": percentual só entre Flávio e Lula no 1º turno e delta em p.p.', () => {
    const l = linhaComparacao('pe', t1(), t2(), 'dois');
    expect(l.t1.flavio).toBeCloseTo(33.333, 2);
    expect(l.t2.flavio).toBeCloseTo(35);
    expect(l.deltaF).toBeCloseTo(1.667, 2);
    expect(l.deltaL).toBeCloseTo(-1.667, 2);
    expect(l.mudouLider).toBe(false);
  });
  it('detecta mudança de quem tem mais votos', () => {
    const l = linhaComparacao('pe', t1(), t2({ flavio: 700, lula: 300 }), 'dois');
    expect(l.t1.lider).toBe('lula');
    expect(l.t2.lider).toBe('flavio');
    expect(l.mudouLider).toBe(true);
  });
  it('2º turno sem votos: sem delta e sem mudança', () => {
    const l = linhaComparacao('pe', t1(), t2({ st: 0 }), 'dois');
    expect(l.t2.flavio).toBeNull();
    expect(l.deltaF).toBeNull();
    expect(l.mudouLider).toBe(false);
  });
  it('ordena com dados ausentes sempre no fim', () => {
    const a = linhaComparacao('pe', t1(), t2(), 'dois');
    const b = linhaComparacao('ba', null, null, 'dois');
    const c = linhaComparacao('sp', t1({ flavio: 600, lula: 300 }), t2({ flavio: 500, lula: 500 }), 'dois');
    expect(ordenar([b, a, c], 'df', true).map((x) => x.abr)).toEqual(['pe', 'sp', 'ba']);
    expect(ordenar([b, a, c], 'df', false).map((x) => x.abr)).toEqual(['sp', 'pe', 'ba']);
  });
});
