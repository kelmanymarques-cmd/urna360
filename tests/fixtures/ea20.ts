/**
 * FIXTURE_TESTE_URNA360 — gerador de arquivos NO FORMATO da especificação EA20/EA14 do TSE.
 * Os números aqui são INVENTADOS para teste e jamais devem ir para produção
 * (scripts/check-dist.mjs falha o build se este marcador aparecer em dist/).
 * Estrutura de chaves conferida com o arquivo oficial br-c0001-e006258-u.json em 25/10/2026.
 */

export interface OpcoesEA20 {
  abr?: string;
  ele?: number;
  t?: number;
  f?: 's' | 'o';
  dv?: 's' | 'n';
  and?: 'n' | 'p' | 'f';
  tf?: 's' | 'n';
  ts?: number;
  st?: number;
  flavio?: number;
  lula?: number;
  vb?: number;
  vn?: number;
  vnt?: number;
  te?: number;
  c?: number;
  a?: number;
  dg?: string;
  hg?: string;
  dt?: string;
  ht?: string;
  idg?: number;
  nmuFlavio?: string;
  semCandidatos?: boolean;
  md?: 's' | 'e' | 'n';
  eleito?: 13 | 22;
  stEleito?: boolean;
  extra?: Record<string, unknown>;
}

const br = (n: number, casas = 2) => n.toFixed(casas).replace('.', ',');
const p = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : 0);

export function ea20(o: OpcoesEA20 = {}) {
  const ts = o.ts ?? 1000;
  const st = o.st ?? 0;
  const fl = o.flavio ?? 0;
  const lu = o.lula ?? 0;
  const vb = o.vb ?? 0;
  const vn = o.vn ?? 0;
  const vnt = o.vnt ?? 0;
  const vnom = fl + lu;
  const vv = vnom;
  const tvn = vn + vnt;
  const tv = vv + vb + tvn;
  const vvc = vv;
  const c = o.c ?? 0;
  const a = o.a ?? 0;
  const est = c + a;
  const cand = (n: number, nmu: string, nm: string, seq: number, vap: number) => ({
    n, sqcand: 280000000000 + n, nm, nmu, dt: '01/01/1970', dvt: 'Válido', seq, e: o.eleito === n ? 's' : 'n', st: o.stEleito ? (o.eleito === n ? 'Eleito' : 'Não eleito') : '',
    vap: String(vap), pvap: br(p(vap, vvc)), pvapn: br(p(vap, vvc), 9),
    vs: [{ tp: 'v', sqcand: 1, nm: 'VICE', nmu: 'VICE', sgp: 'X' }], subs: [],
  });
  return {
    _fixture: 'FIXTURE_TESTE_URNA360',
    ele: String(o.ele ?? 6258), t: String(o.t ?? 2), f: o.f ?? 'o', sup: 'n', tpabr: o.abr === 'br' || !o.abr ? 'br' : 'uf',
    cdabr: o.abr ?? 'br', dg: o.dg ?? '25/10/2026', hg: o.hg ?? '18:00:00', idg: String(o.idg ?? 1), dv: o.dv ?? 's',
    dt: o.dt ?? (st > 0 ? '25/10/2026' : ''), ht: o.ht ?? (st > 0 ? '18:00:00' : ''), tf: o.tf ?? 'n', and: o.and ?? (st > 0 ? 'p' : 'n'),
    md: o.md ?? 'n', esae: 'n', mnae: [],
    carg: o.semCandidatos
      ? []
      : [{
          cd: '1', nmn: 'Presidente', nmm: 'Presidente', nmf: 'Presidenta', nv: '1', fed: [],
          agr: [
            { n: '13', nm: 'COLIGACAO A', tp: 'c', com: 'PT', tvtn: String(lu), tvan: String(lu),
              par: [{ n: '13', sg: 'PT', nm: 'PARTIDO DOS TRABALHADORES', tvtn: String(lu), tvan: String(lu), cand: [cand(13, 'LULA', 'LUIZ INÁCIO LULA DA SILVA', 1, lu)] }] },
            { n: '22', nm: 'COLIGACAO B', tp: 'c', com: 'PL', tvtn: String(fl), tvan: String(fl),
              par: [{ n: '22', sg: 'PL', nm: 'PARTIDO LIBERAL', tvtn: String(fl), tvan: String(fl), cand: [cand(22, o.nmuFlavio ?? 'FLAVIO BOLSONARO', 'FLAVIO NANTES BOLSONARO', 2, fl)] }] },
          ],
        }],
    s: {
      ts: String(ts), st: String(st), pst: br(p(st, ts)), pstn: br(p(st, ts), 9),
      snt: String(ts - st), psnt: br(p(ts - st, ts)), psntn: br(p(ts - st, ts), 9),
      si: String(st), psi: '100,00', psin: '100', sni: '0', psni: '0,00', psnin: '0',
      sa: String(st), psa: '100,00', psan: '100', sna: '0', psna: '0,00', psnan: '0',
    },
    e: {
      te: String(o.te ?? 100000), est: String(est), pest: br(p(est, o.te ?? 100000)), pestn: br(p(est, o.te ?? 100000), 9),
      c: String(c), pc: br(p(c, est)), pcn: br(p(c, est), 9), a: String(a), pa: br(p(a, est)), pan: br(p(a, est), 9),
    },
    v: {
      tv: String(tv), vvc: String(vvc), pvvc: br(p(vvc, tv)), pvvcn: br(p(vvc, tv), 9),
      vv: String(vv), pvv: br(p(vv, vvc)), pvvn: br(p(vv, vvc), 9), vnom: String(vnom), pvnom: br(p(vnom, vv)), pvnomn: br(p(vnom, vv), 9),
      van: '0', pvan: '0,00', pvann: '0', vansj: '0', pvansj: '0,00', pvansjn: '0',
      vb: String(vb), pvb: br(p(vb, tv)), pvbn: br(p(vb, tv), 9),
      tvn: String(tvn), ptvn: br(p(tvn, tv)), ptvnn: br(p(tvn, tv), 9),
      vn: String(vn), pvn: br(p(vn, tvn)), pvnn: br(p(vn, tvn), 9), vnt: String(vnt), pvnt: br(p(vnt, tvn)), pvntn: br(p(vnt, tvn), 9),
      vscv: '0',
    },
    ...o.extra,
  };
}

export function ea14(itens: { abr: string; st: number; ts: number; dt?: string; ht?: string; and?: string }[], o: { ele?: number; f?: string } = {}) {
  return {
    _fixture: 'FIXTURE_TESTE_URNA360',
    ele: String(o.ele ?? 6258), t: '2', f: o.f ?? 'o', dg: '25/10/2026', hg: '18:00:00', idg: '1',
    abr: itens.map((i) => ({
      and: i.and ?? (i.st > 0 ? 'p' : 'n'), tpabr: i.abr === 'br' ? 'br' : 'uf', cdabr: i.abr, dt: i.dt ?? '', ht: i.ht ?? '',
      s: { ts: String(i.ts), st: String(i.st), pst: br(p(i.st, i.ts)), pstn: br(p(i.st, i.ts), 9) },
      e: {},
    })),
  };
}
