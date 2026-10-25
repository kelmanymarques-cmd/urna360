import { describe, expect, it } from 'vitest';
import { carimbo, inteiro, pct, percentual } from '../../src/core/parse';
import { ErroNormalizacao, normalizarAcompanhamento, normalizarResultado } from '../../src/core/normalize';
import { eleicaoDefinida, lideranca, ritmo, somarRegiao, statusApuracao } from '../../src/core/calc';
import { CAMADAS_METRICAS, TONS, pintar, tomVantagem } from '../../src/ui/camadas';
import { ea14, ea20 } from '../fixtures/ea20';

describe('leitura de valores do TSE', () => {
  it('converte inteiros e rejeita negativos, texto e decimais', () => {
    expect(inteiro('123')).toBe(123);
    expect(inteiro(7)).toBe(7);
    expect(inteiro('-1')).toBeNull();
    expect(inteiro(-1)).toBeNull();
    expect(inteiro('12,5')).toBeNull();
    expect(inteiro('abc')).toBeNull();
    expect(inteiro(null)).toBeNull();
    expect(inteiro(undefined)).toBeNull();
  });
  it('converte percentuais com vírgula decimal e limita a 0–100', () => {
    expect(percentual('9,90')).toBeCloseTo(9.9);
    expect(percentual('100')).toBe(100);
    expect(percentual('45,123456789')).toBeCloseTo(45.123456789, 9);
    expect(percentual('101,00')).toBeNull();
    expect(percentual('-3')).toBeNull();
    expect(percentual('')).toBeNull();
  });
  it('percentual seguro evita divisão por zero e valores incoerentes', () => {
    expect(pct(1, 0)).toBeNull();
    expect(pct(0, 0)).toBeNull();
    expect(pct(null, 10)).toBeNull();
    expect(pct(11, 10)).toBeNull();
    expect(pct(1, 3)).toBeCloseTo(33.3333, 3);
  });
  it('interpreta data/hora do TSE e rejeita datas impossíveis', () => {
    const c = carimbo('25/10/2026', '18:42:10');
    expect(c?.texto).toBe('25/10/2026 18:42:10');
    expect(c?.iso).toBe('2026-10-25T18:42:10-03:00');
    expect(carimbo('31/02/2026', '10:00:00')).toBeNull();
    expect(carimbo('', '')).toBeNull();
  });
});

describe('normalização EA20', () => {
  it('lê um arquivo oficial válido em andamento', () => {
    const r = normalizarResultado(ea20({ st: 500, flavio: 600, lula: 400, vb: 20, vn: 30, vnt: 10, c: 1100, a: 200 }), 'br');
    expect(r.votosDisponiveis).toBe(true);
    expect(r.secoes.pctTotalizadas).toBeCloseTo(50);
    const f = r.candidatos.find((c) => c.numero === 22)!;
    expect(f.votos).toBe(600);
    expect(f.percentual).toBeCloseTo(60);
    expect(r.votos.validos).toBe(1000);
    expect(r.votos.brancos).toBe(20);
    expect(r.votos.nulos).toBe(40); // vn + vnt
    expect(r.votos.pctBrancos).toBeCloseTo((20 / 1060) * 100, 6);
    expect(r.eleitorado.pctAbstencao).toBeCloseTo((200 / 1300) * 100, 6);
    expect(r.totalizadoEm?.texto).toBe('25/10/2026 18:00:00');
  });

  it('extrai sqcand (foto) e vice de cada candidato', () => {
    const r = normalizarResultado(ea20({ st: 1, flavio: 1, lula: 1 }), 'br');
    const f = r.candidatos.find((c) => c.numero === 22)!;
    expect(f.sqcand).toBe(280000000022);
    expect(f.vice).toBe('VICE');
  });

  it('mantém brancos, nulos e abstenção separados dos votos nominais', () => {
    const r = normalizarResultado(ea20({ st: 10, flavio: 100, lula: 100, vb: 50, vn: 50, c: 300, a: 700 }), 'br');
    const somaCands = r.candidatos.reduce((s, c) => s + (c.votos ?? 0), 0);
    expect(somaCands).toBe(r.votos.nominais);
    expect(r.votos.validos).toBe(200);
    expect(r.votos.brancos).toBe(50);
    expect(r.votos.nulos).toBe(50);
    expect(r.eleitorado.abstencao).toBe(700);
    // percentuais dos candidatos usam base própria e não incluem brancos/nulos
    expect(r.candidatos.reduce((s, c) => s + (c.percentual ?? 0), 0)).toBeCloseTo(100);
  });

  it('antes da apuração (and=n, st=0) não expõe votos zerados como resultado', () => {
    const r = normalizarResultado(ea20({ st: 0 }), 'br');
    expect(r.votosDisponiveis).toBe(false);
    expect(r.candidatos.every((c) => c.votos === null && c.percentual === null)).toBe(true);
    expect(r.votos.brancos).toBeNull();
    expect(r.eleitorado.pctAbstencao).toBeNull();
    expect(statusApuracao(r)).toBe('aguardando');
  });

  it('com dv=n os votos (publicados zerados) são tratados como indisponíveis', () => {
    const r = normalizarResultado(ea20({ st: 300, dv: 'n', flavio: 0, lula: 0 }), 'br');
    expect(r.votosDisponiveis).toBe(false);
    expect(r.avisos.join(' ')).toMatch(/dv="n"/);
    expect(lideranca(r).estado).toBe('neutro');
  });

  it('rejeita arquivo de outra eleição, outro turno ou outra UF', () => {
    expect(() => normalizarResultado(ea20({ ele: 6257 }), 'br')).toThrow(ErroNormalizacao);
    expect(() => normalizarResultado(ea20({ t: 1 }), 'br')).toThrow(/outra eleição/);
    expect(() => normalizarResultado(ea20({ abr: 'sp' }), 'pe')).toThrow(/esperado pe/);
    expect(() => normalizarResultado('texto', 'br')).toThrow(ErroNormalizacao);
    expect(() => normalizarResultado({ ele: '6258', t: '2' }, 'br')).toThrow(/seções/);
  });

  it('ignora campos desconhecidos sem quebrar e registra aviso', () => {
    const r = normalizarResultado(ea20({ st: 1, flavio: 1, lula: 2, extra: { campoNovo2026: 'x' } }), 'br');
    expect(r.avisos).toContain('Campo desconhecido ignorado: campoNovo2026');
    expect(r.votosDisponiveis).toBe(true);
  });

  it('trata campos ausentes, nulos ou negativos como ausentes', () => {
    const raw = ea20({ st: 5, flavio: 10, lula: 5 }) as Record<string, any>;
    raw.v.vb = '-4';
    raw.e = undefined;
    const r = normalizarResultado(raw, 'br');
    expect(r.votos.brancos).toBeNull();
    expect(r.votos.pctBrancos).toBeCloseTo(0); // percentual oficial ainda presente
    expect(r.eleitorado.total).toBeNull();
    expect(r.avisos).toContain('Bloco de eleitorado (e) ausente.');
  });

  it('marca arquivo de simulação (f=s) e nunca o trata como real', () => {
    const r = normalizarResultado(ea20({ f: 's', st: 10, flavio: 9, lula: 1 }), 'br');
    expect(r.simulado).toBe(true);
    expect(lideranca(r).estado).toBe('neutro');
  });

  it('só considera totalizada com tf=s', () => {
    expect(statusApuracao(normalizarResultado(ea20({ st: 1000, and: 'f', flavio: 1, lula: 2 }), 'br'))).toBe('concluida_aguardando_final');
    expect(statusApuracao(normalizarResultado(ea20({ st: 1000, and: 'f', tf: 's', flavio: 1, lula: 2 }), 'br'))).toBe('totalizada');
    expect(statusApuracao(normalizarResultado(ea20({ st: 10, flavio: 1, lula: 2 }), 'br'))).toBe('em_andamento');
    expect(statusApuracao(null)).toBe('indisponivel');
  });

  it('normaliza o acompanhamento EA14 incluindo exterior (zz)', () => {
    const a = normalizarAcompanhamento(ea14([{ abr: 'br', st: 1, ts: 4 }, { abr: 'ZZ', st: 0, ts: 2 }, { abr: 'pe', st: 2, ts: 4, dt: '25/10/2026', ht: '17:30:00' }]));
    expect(a.abrangencias.map((x) => x.abrangencia)).toEqual(['br', 'zz', 'pe']);
    expect(a.abrangencias[2]!.pctTotalizadas).toBeCloseTo(50);
    expect(a.abrangencias[2]!.totalizadoEm?.texto).toBe('25/10/2026 17:30:00');
  });
});

describe('liderança estadual por votos nominais', () => {
  const uf = (o: Parameters<typeof ea20>[0]) => normalizarResultado(ea20({ abr: 'pe', ...o }), 'pe');
  it('verde quando Flávio Bolsonaro tem mais votos nominais', () => {
    const l = lideranca(uf({ st: 10, flavio: 101, lula: 100 }));
    expect(l).toEqual({ estado: 'flavio', diferencaVotos: 1 });
    expect(pintar('lideranca', uf({ st: 10, flavio: 101, lula: 100 }), null).cor).toBe('#A7DDBD'); // vantagem < 2 p.p. = tom mais claro
    expect(pintar('lideranca', uf({ st: 10, flavio: 70, lula: 30 }), null).cor).toBe('#1FA35B'); // ≥ 20 p.p. = cor base
  });
  it('vermelho quando Lula tem mais votos nominais', () => {
    expect(lideranca(uf({ st: 10, flavio: 100, lula: 150 })).estado).toBe('lula');
    expect(pintar('lideranca', uf({ st: 10, flavio: 100, lula: 150 }), null).cor).toBe('#D93A3A');
  });
  it('empate é exibido como empate, sem cor de candidato', () => {
    expect(lideranca(uf({ st: 10, flavio: 5, lula: 5 })).estado).toBe('empate');
  });
  it('neutro sem dados, sem votos ou com candidato não confirmado', () => {
    expect(lideranca(null).estado).toBe('neutro');
    expect(lideranca(uf({ st: 0 })).estado).toBe('neutro');
    expect(lideranca(uf({ st: 10, flavio: 0, lula: 0 })).estado).toBe('neutro');
    expect(lideranca(uf({ st: 10, flavio: 9, lula: 1, nmuFlavio: 'OUTRO NOME' })).estado).toBe('neutro');
    expect(lideranca(uf({ st: 10, semCandidatos: true })).estado).toBe('neutro');
  });
  it('brancos e nulos não interferem na liderança', () => {
    expect(lideranca(uf({ st: 10, flavio: 10, lula: 11, vb: 1000, vn: 1000 })).estado).toBe('lula');
  });
});

describe('camadas neutras', () => {
  it('não usam as cores dos candidatos', () => {
    const coresCand = ['#1FA35B', '#D93A3A'];
    for (const c of CAMADAS_METRICAS) for (const f of c.faixas) expect(coresCand).not.toContain(f.cor);
  });
  it('UF sem dados fica neutra em todas as camadas de votos', () => {
    for (const id of ['brancos', 'nulos', 'abstencao'] as const) {
      expect(pintar(id, normalizarResultado(ea20({ abr: 'pe', st: 0 }), 'pe'), null).resumo).toMatch(/sem dados/);
    }
  });
});

describe('resultado definido pelo TSE (hino para qualquer eleito)', () => {
  const r = (o: Parameters<typeof ea20>[0]) => normalizarResultado(ea20({ st: 900, ts: 1000, flavio: 10, lula: 10, ...o }), 'br');
  it('não dispara sem indicação oficial, mesmo com vantagem grande', () => {
    expect(eleicaoDefinida(r({ flavio: 1000, lula: 1 })).definido).toBe(false);
    expect(eleicaoDefinida(r({ flavio: 1, lula: 1000 })).definido).toBe(false);
  });
  it.each([[22, 'Flávio Bolsonaro'], [13, 'Lula']] as const)('md="e" com eleito %i → %s, tratamento idêntico', (n, nome) => {
    const d = eleicaoDefinida(r({ md: 'e', eleito: n }));
    expect(d).toMatchObject({ definido: true, motivo: 'matematico' });
    expect(d.definido && d.eleito?.rotulo).toBe(nome);
  });
  it('totalização final com situação "Eleito"', () => {
    const d = eleicaoDefinida(r({ tf: 's', and: 'f', eleito: 13, stEleito: true }));
    expect(d).toMatchObject({ definido: true, motivo: 'totalizacao_final' });
  });
  it('md="e" sem candidato marcado: definido, mas sem nome', () => {
    const d = eleicaoDefinida(r({ md: 'e' }));
    expect(d.definido && d.eleito).toBeNull();
  });
  it('simulação ou dv="n" nunca disparam', () => {
    expect(eleicaoDefinida(r({ md: 'e', eleito: 22, f: 's' })).definido).toBe(false);
    expect(eleicaoDefinida(r({ md: 'e', eleito: 13, dv: 'n' })).definido).toBe(false);
  });
});

describe('1º turno e municípios', () => {
  it('normaliza arquivo do 1º turno só quando pedido explicitamente', () => {
    const raw = ea20({ ele: 6257, t: 1, st: 10, flavio: 47, lula: 45, tf: 's', and: 'f' });
    expect(() => normalizarResultado(raw, 'br')).toThrow(/outra eleição/);
    const r = normalizarResultado(raw, 'br', { codigo: 6257, turno: 1 });
    expect(r.turno).toBe(1);
    expect(r.candidatos.find((c) => c.numero === 22)!.votos).toBe(47);
  });
  it('lê eleitores em seções não totalizadas', () => {
    const raw = ea20({ st: 10 }) as Record<string, any>;
    raw.e.esnt = '12345';
    expect(normalizarResultado(raw, 'br').eleitorado.emSecoesNaoTotalizadas).toBe(12345);
  });
});

describe('ritmo e soma por região (só dados oficiais)', () => {
  it('ritmo usa o registro de ~10 min antes', () => {
    const m = 60_000;
    expect(ritmo([{ ms: 0, pst: 5 }, { ms: 6 * m, pst: 8 }, { ms: 12 * m, pst: 12 }])).toEqual({ pp: 7, minutos: 12 });
    expect(ritmo([{ ms: 0, pst: 5 }, { ms: 5 * m, pst: 8 }])).toBeNull();
    expect(ritmo([{ ms: 0, pst: 5 }, { ms: 60 * m, pst: 50 }])).toBeNull();
  });
  it('soma votos oficiais das UFs e ignora UFs sem votos', () => {
    const res = (uf: string) => uf === 'xx' ? null : normalizarResultado(ea20({ abr: uf, st: uf === 'pe' ? 0 : 50, ts: 100, flavio: 30, lula: 70 }), uf);
    const t = somarRegiao(['ba', 'pe', 'xx'], res);
    expect(t.votos).toEqual({ flavio: 30, lula: 70 });
    expect(t.pct.lula).toBeCloseTo(70);
    expect(t.ufsComDados).toBe(1);
    expect(t.pctTotalizadas).toBeCloseTo(25);
  });
});

describe('tons pela vantagem', () => {
  it('faixas fixas e iguais para os dois candidatos', () => {
    for (const k of ['flavio', 'lula'] as const) {
      expect(tomVantagem(k, 1)).toBe(TONS[k][0]);
      expect(tomVantagem(k, 5)).toBe(TONS[k][1]);
      expect(tomVantagem(k, 15)).toBe(TONS[k][2]);
      expect(tomVantagem(k, 40)).toBe(TONS[k][3]);
    }
  });
});
