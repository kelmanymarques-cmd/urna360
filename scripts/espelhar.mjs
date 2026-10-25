#!/usr/bin/env node
// Espelho para hospedagem estática SEM CORS no TSE: baixa os arquivos oficiais (com ETag) e grava
// em ./espelho/ com o MESMO caminho, sem alterar um byte. Usado pela Action "espelho".
// Uso: node scripts/espelhar.mjs  (uma rodada; a Action repete a cada ~60 s)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const ORIGEM = 'https://resultados.tse.jus.br';
const UFS = 'ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to zz'.split(' ');
const base = '/oficial/ele2026/6258/dados';
const arquivos = [`${base}/br/br-c0001-e006258-u.json`, `${base}/br/br-e006258-ab.json`, ...UFS.map((u) => `${base}/${u}/${u}-c0001-e006258-u.json`)];
const etags = JSON.parse(await readFile('espelho/.etags.json', 'utf8').catch(() => '{}'));
let mudou = 0;
for (const a of arquivos) {
  const h = { 'User-Agent': 'URNA360-espelho' };
  if (etags[a]) h['If-None-Match'] = etags[a];
  try {
    const r = await fetch(ORIGEM + a, { headers: h, signal: AbortSignal.timeout(15000) });
    if (r.status === 304) continue;
    if (!r.ok) { console.log(`HTTP ${r.status} ${a}`); continue; }
    const corpo = Buffer.from(await r.arrayBuffer());
    try { JSON.parse(corpo.toString('utf8')); } catch { console.log(`JSON inválido ignorado ${a}`); continue; }
    await mkdir(path.dirname('espelho' + a), { recursive: true });
    await writeFile('espelho' + a, corpo);
    if (r.headers.get('etag')) etags[a] = r.headers.get('etag');
    mudou++;
  } catch (e) { console.log(`falha ${a}: ${e}`); }
  await new Promise((r) => setTimeout(r, 100)); // bem abaixo do limite de 100 req/s do TSE
}
await mkdir('espelho', { recursive: true });
await writeFile('espelho/.etags.json', JSON.stringify(etags));
console.log(`arquivos alterados: ${mudou}`);
