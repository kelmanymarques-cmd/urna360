import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { caminhoPermitido, criarServidor, pontoHistorico } from '../../server/proxy.mjs';
import { ea20 } from '../fixtures/ea20';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

let srv: Server | null = null;
afterEach(() => { srv?.close(); srv = null; });

async function subir(fetchImpl: (u: string, i?: RequestInit) => Promise<Response>) {
  srv = criarServidor({ fetchImpl, servirEstatico: false, ttlMs: 50, log: () => {} }) as Server;
  await new Promise<void>((r) => srv!.listen(0, r));
  return `http://127.0.0.1:${(srv!.address() as AddressInfo).port}`;
}

describe('proxy', () => {
  it('lista branca: aceita só arquivos do pleito 6258 e UFs válidas', () => {
    expect(caminhoPermitido('/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json')).toBeTruthy();
    expect(caminhoPermitido('/oficial/ele2026/6258/dados/pe/pe-c0001-e006258-u.json')).toBeTruthy();
    expect(caminhoPermitido('/oficial/ele2026/6258/dados/br/br-e006258-ab.json')).toBeTruthy();
    expect(caminhoPermitido('/oficial/ele2026/6258/dados/pe/pe-e006258-ab.json')).toBeNull();
    expect(caminhoPermitido('/oficial/ele2026/6258/dados/xx/xx-c0001-e006258-u.json')).toBeNull();
    expect(caminhoPermitido('/oficial/ele2026/6258/dados/pe/sp-c0001-e006258-u.json')).toBeNull();
    expect(caminhoPermitido('/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json')).toBeNull();
    expect(caminhoPermitido('/../../etc/passwd')).toBeNull();
  });

  it('coalesce requisições simultâneas e faz cache', async () => {
    let n = 0;
    const base = await subir(async () => { n++; await new Promise((r) => setTimeout(r, 30)); return new Response(JSON.stringify(ea20()), { headers: { etag: '"a"' } }); });
    const url = `${base}/api/tse/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json`;
    const rs = await Promise.all([fetch(url), fetch(url), fetch(url)]);
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(n).toBe(1);
    expect(rs[0]!.headers.get('content-security-policy')).toContain("default-src 'self'");
  });

  it('entrega último dado válido marcado como desatualizado se a fonte cair', async () => {
    let falhar = false;
    const base = await subir(async () => { if (falhar) throw new TypeError('rede'); return new Response(JSON.stringify(ea20())); });
    const url = `${base}/api/tse/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json`;
    expect((await fetch(url)).status).toBe(200);
    falhar = true;
    await new Promise((r) => setTimeout(r, 80));
    const r = await fetch(url);
    expect(r.status).toBe(200);
    expect(r.headers.get('x-urna360-desatualizado')).toBe('1');
  });

  it('recusa caminhos fora da lista e não consulta a fonte', async () => {
    let n = 0;
    const base = await subir(async () => { n++; return new Response('{}'); });
    expect((await fetch(`${base}/api/tse/oficial/ele2026/6258/dados/xx/xx-c0001-e006258-u.json`)).status).toBe(400);
    expect(n).toBe(0);
  });

  it('cache negativo de 404 evita martelar a fonte', async () => {
    let n = 0;
    const base = await subir(async () => { n++; return new Response('nf', { status: 404 }); });
    const url = `${base}/api/tse/oficial/ele2026/6258/dados/pe/pe-c0001-e006258-u.json`;
    await fetch(url);
    await new Promise((r) => setTimeout(r, 80));
    await fetch(url);
    expect(n).toBe(1);
  });

  it('histórico registra só pontos oficiais com votos liberados', () => {
    expect(pontoHistorico(ea20({ st: 0 }), 'x')).toBeNull();
    expect(pontoHistorico(ea20({ st: 5, dv: 'n' }), 'x')).toBeNull();
    expect(pontoHistorico(ea20({ st: 5, f: 's', flavio: 1, lula: 1 }), 'x')).toBeNull();
    const p = pontoHistorico(ea20({ st: 500, flavio: 3, lula: 1 }), 'x');
    expect(p.pctTotalizadas).toBeCloseTo(50);
    expect(p.percentuais['22']).toBeCloseTo(75);
  });
});
