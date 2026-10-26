/** Roda só na Action "analise-real" (com os 56 arquivos oficiais baixados). Imprime a análise em JSON. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizarResultado } from '../../src/core/normalize';
import { fluxo, resumir } from '../../src/core/analise';
import { UFS } from '../../src/config';

const dir = 'tests/real-analise';
describe.skipIf(!existsSync(`${dir}/t2/br.json`))('análise real 1º → 2º turno', () => {
  it('calcula e grava', () => {
    const ler = (t: string, a: string) => JSON.parse(readFileSync(`${dir}/${t}/${a}.json`, 'utf8'));
    const f = (a: string) => fluxo(a, normalizarResultado(ler('t1', a), a, { codigo: 6257, turno: 1 }), normalizarResultado(ler('t2', a), a));
    const nac = f('br')!;
    const ufs = UFS.map(f).filter((x): x is NonNullable<typeof x> => !!x);
    const zz = f('zz');
    const r = resumir(nac, ufs);
    writeFileSync('analise-real.json', JSON.stringify({ nacional: nac, exterior: zz, ufs, resumo: {
      rumoLula: r.rumoLula.map((u) => [u.abr, u.dMargem]), rumoFlavio: r.rumoFlavio.map((u) => [u.abr, u.dMargem]),
      flavioPerdeuVotos: r.flavioPerdeuVotos.map((u) => [u.abr, u.dF]), lulaAlemDosOutros: r.lulaAlemDosOutros.map((u) => [u.abr, u.dL - u.outros1]),
      somaUFs: r.somaUFs } }, null, 1));
    expect(ufs.length).toBe(27);
  });
});
