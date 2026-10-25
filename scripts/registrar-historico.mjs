#!/usr/bin/env node
// Registra cada nova totalização OFICIAL do arquivo nacional do TSE em historico.json (ramo "historico").
// Roda em loop até o prazo (minutos) e publica a cada mudança. Uso: node scripts/registrar-historico.mjs <pasta> <minutos>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const [, , pasta = '.', minutos = '340'] = process.argv;
const URL_BR = 'https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json';
const arq = path.join(pasta, 'historico.json');
const hist = existsSync(arq) ? JSON.parse(readFileSync(arq, 'utf8')) : [];
const fim = Date.now() + Number(minutos) * 60_000;
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null; };
let etag = null;
const git = (...a) => execFileSync('git', ['-C', pasta, ...a], { stdio: 'pipe' }).toString();

while (Date.now() < fim) {
  try {
    const r = await fetch(URL_BR, { headers: etag ? { 'If-None-Match': etag } : {}, signal: AbortSignal.timeout(15000) });
    if (r.status === 200) {
      etag = r.headers.get('etag');
      const j = await r.json();
      const st = Number(j?.s?.st);
      if (String(j.ele) === '6258' && String(j.t) === '2' && j.f === 'o' && j.dv === 's' && st > 0 && j.dt && j.ht) {
        const totalizadoEm = `${j.dt} ${j.ht}`;
        if (!hist.some((p) => p.totalizadoEm === totalizadoEm)) {
          const percentuais = {}; const votos = {};
          for (const c of j.carg ?? []) for (const a of c.agr ?? []) for (const p of a.par ?? []) for (const k of p.cand ?? []) {
            percentuais[String(k.n)] = num(k.pvapn ?? k.pvap);
            votos[String(k.n)] = Number(k.vap);
          }
          const pst = num(j.s.pstn ?? j.s.pst);
          if (pst !== null) {
            hist.push({ registradoEm: new Date().toISOString(), totalizadoEm, pctTotalizadas: pst, percentuais, votos, secoesTotalizadas: st });
            writeFileSync(arq, JSON.stringify(hist));
            git('add', 'historico.json');
            git('commit', '-qm', `historico ${totalizadoEm} (${j.s.pst}%)`);
            git('push', '-q', 'origin', 'HEAD:historico');
            console.log('registrado', totalizadoEm, j.s.pst);
          }
        }
        if (j.tf === 's') { console.log('totalização final — encerrando'); break; }
      }
    }
  } catch (e) { console.log('falha', String(e)); }
  await new Promise((ok) => setTimeout(ok, 30_000));
}
