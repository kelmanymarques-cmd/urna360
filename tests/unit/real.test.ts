/**
 * Validação com ARQUIVOS REAIS do TSE. Roda só quando tests/real-data/ existe
 * (preenchido pela Action "verificar-tse"). Sem os arquivos, os testes são pulados.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizarAcompanhamento, normalizarResultado } from '../../src/core/normalize';
import { confirmados, lideranca, statusApuracao } from '../../src/core/calc';

const dir = 'tests/real-data';
const tem = existsSync(`${dir}/br-c0001-e006258-u.json`);

describe.skipIf(!tem)('arquivos reais do TSE (eleição 6258)', () => {
  const ler = (n: string) => JSON.parse(readFileSync(`${dir}/${n}`, 'utf8'));
  it('nacional normaliza e confirma os candidatos 22 e 13', () => {
    const r = normalizarResultado(ler('br-c0001-e006258-u.json'), 'br');
    const c = confirmados(r);
    expect(c.flavio?.numero).toBe(22);
    expect(c.lula?.numero).toBe(13);
    expect(r.simulado).toBe(false);
    console.log('REAL br:', JSON.stringify({ status: statusApuracao(r), gerado: r.geradoEm?.texto, tot: r.totalizadoEm?.texto, secoes: r.secoes, votosDisponiveis: r.votosDisponiveis, cands: r.candidatos.map((x) => [x.numero, x.nomeUrna, x.votos, x.percentual]), brancos: r.votos.pctBrancos, nulos: r.votos.pctNulos, abst: r.eleitorado.pctAbstencao, avisos: r.avisos }));
    if (r.votosDisponiveis) {
      const soma = r.candidatos.reduce((s, x) => s + (x.votos ?? 0), 0);
      expect(soma).toBe(r.votos.nominais);
    }
  });
  it('acompanhamento lista 27 UFs + exterior', () => {
    const a = normalizarAcompanhamento(ler('br-e006258-ab.json'));
    const ufs = a.abrangencias.map((x) => x.abrangencia).filter((x) => x !== 'br');
    console.log('REAL ab:', ufs.join(','));
    expect(ufs.length).toBe(28);
    expect(ufs).toContain('zz');
  });
  it('UF (PE) normaliza', () => {
    const r = normalizarResultado(ler('pe-c0001-e006258-u.json'), 'pe');
    console.log('REAL pe:', JSON.stringify({ secoes: r.secoes, lid: lideranca(r), avisos: r.avisos }));
    expect(r.abrangencia).toBe('pe');
  });
});
