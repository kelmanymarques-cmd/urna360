import { describe, expect, it, vi } from 'vitest';
import { buscarJson } from '../../src/data/fetcher';
import { normalizarResultado } from '../../src/core/normalize';
import { Store } from '../../src/data/store';
import { ea14, ea20 } from '../fixtures/ea20';
import { UFS } from '../../src/config';

const norm = (r: unknown) => normalizarResultado(r, 'br');
const resp = (corpo: string, status = 200) => new Response(corpo, { status });

describe('busca de arquivos (rede)', () => {
  it('resposta HTTP válida', async () => {
    const b = await buscarJson('/x', norm, { timeoutMs: 1000, fetchImpl: async () => resp(JSON.stringify(ea20({ st: 1, flavio: 1, lula: 1 }))) });
    expect(b.ok).toBe(true);
  });
  it('timeout', async () => {
    const lento = (_: string, init?: RequestInit) =>
      new Promise<Response>((_r, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('abort', 'AbortError'))));
    const b = await buscarJson('/x', norm, { timeoutMs: 20, fetchImpl: lento });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.erro.tipo).toBe('timeout');
  });
  it('falha de rede', async () => {
    const b = await buscarJson('/x', norm, { timeoutMs: 1000, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
    expect(!b.ok && b.erro.tipo).toBe('rede');
  });
  it.each([404, 429, 500, 503])('HTTP %i', async (s) => {
    const b = await buscarJson('/x', norm, { timeoutMs: 1000, fetchImpl: async () => resp('erro', s) });
    expect(!b.ok && b.erro.tipo).toBe('http');
    expect(!b.ok && b.erro.status).toBe(s);
  });
  it('arquivo vazio', async () => {
    const b = await buscarJson('/x', norm, { timeoutMs: 1000, fetchImpl: async () => resp('  ') });
    expect(!b.ok && b.erro.tipo).toBe('vazio');
  });
  it('JSON inválido', async () => {
    const b = await buscarJson('/x', norm, { timeoutMs: 1000, fetchImpl: async () => resp('{"ele": 62') });
    expect(!b.ok && b.erro.tipo).toBe('json_invalido');
  });
  it('arquivo de outra eleição é rejeitado na validação', async () => {
    const b = await buscarJson('/x', norm, { timeoutMs: 1000, fetchImpl: async () => resp(JSON.stringify(ea20({ ele: 1 }))) });
    expect(!b.ok && b.erro.tipo).toBe('validacao');
  });
});

describe('store: atualização periódica', () => {
  function servidor(mapa: Record<string, () => Response | Promise<Response>>) {
    const chamadas: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      chamadas.push(url);
      const k = Object.keys(mapa).find((k) => url.includes(k));
      return k ? mapa[k]!() : resp('nao', 404);
    });
    return { fetchImpl, chamadas };
  }
  const silencio = () => {};

  it('mantém o último dado válido quando a próxima resposta é inválida', async () => {
    let n = 0;
    const s = servidor({ 'br-c0001': () => (n++ === 0 ? resp(JSON.stringify(ea20({ st: 5, flavio: 3, lula: 2 }))) : resp('{quebrado')) });
    const st = new Store({ base: 'http://t', fetchImpl: s.fetchImpl, log: silencio });
    await st.consultarAgora();
    expect(st.estado.nacional.dados?.secoes.totalizadas).toBe(5);
    await st.consultarAgora();
    expect(st.estado.nacional.dados?.secoes.totalizadas).toBe(5);
    expect(st.estado.nacional.ultimoErro?.tipo).toBe('json_invalido');
    st.parar();
  });

  it('não dispara consultas duplicadas em paralelo', async () => {
    let liberar!: () => void;
    const trava = new Promise<void>((r) => (liberar = r));
    const s = servidor({ 'br-c0001': async () => { await trava; return resp(JSON.stringify(ea20())); } });
    const st = new Store({ base: 'http://t', fetchImpl: s.fetchImpl, log: silencio });
    const a = st.consultarAgora();
    const b = st.consultarAgora();
    expect(a).toBe(b);
    liberar();
    await a;
    expect(s.chamadas.filter((c) => c.includes('br-c0001')).length).toBe(1);
    st.parar();
  });

  it('dado repetido não é marcado como mudança (sem animação falsa)', async () => {
    const s = servidor({ 'br-c0001': () => resp(JSON.stringify(ea20({ st: 5, flavio: 3, lula: 2 }))) });
    const st = new Store({ base: 'http://t', fetchImpl: s.fetchImpl, log: silencio });
    const mudancas: boolean[] = [];
    st.assinar((e, m) => { if (!e.consultando) mudancas.push(m); });
    await st.consultarAgora();
    await st.consultarAgora();
    expect(mudancas.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect(mudancas.at(-1)).toBe(false);
    st.parar();
  });

  it('ignora arquivo com horário de geração mais antigo que o exibido', async () => {
    let n = 0;
    const s = servidor({ 'br-c0001': () => resp(JSON.stringify(n++ === 0 ? ea20({ st: 9, hg: '19:00:00', flavio: 2, lula: 1 }) : ea20({ st: 4, hg: '18:00:00', flavio: 1, lula: 1 }))) });
    const st = new Store({ base: 'http://t', fetchImpl: s.fetchImpl, log: silencio });
    await st.consultarAgora();
    await st.consultarAgora();
    expect(st.estado.nacional.dados?.secoes.totalizadas).toBe(9);
    st.parar();
  });

  it('só rebaixa UFs cuja totalização mudou no acompanhamento', async () => {
    const ab = ea14(UFS.map((u) => ({ abr: u, st: 0, ts: 10 })));
    const mapa: Record<string, () => Response> = { 'br-c0001': () => resp(JSON.stringify(ea20())), 'br-e006258-ab': () => resp(JSON.stringify(ab)) };
    for (const u of [...UFS, 'zz']) mapa[`/${u}-c0001`] = () => resp(JSON.stringify(ea20({ abr: u })));
    const s = servidor(mapa);
    const st = new Store({ base: 'http://t', fetchImpl: s.fetchImpl, log: silencio });
    await st.consultarAgora();
    const primeira = s.chamadas.length;
    expect(primeira).toBe(2 + 28);
    await st.consultarAgora();
    expect(s.chamadas.length - primeira).toBe(2); // nada mudou: só br-u e ab
    st.parar();
  });

  it('marca dados como desatualizados após o limite', async () => {
    let agora = 1_000_000;
    const s = servidor({ 'br-c0001': () => resp(JSON.stringify(ea20())) });
    const st = new Store({ base: 'http://t', fetchImpl: s.fetchImpl, log: silencio, agora: () => agora });
    await st.consultarAgora();
    expect(st.desatualizado(st.estado.nacional)).toBe(false);
    agora += 4 * 60_000;
    expect(st.desatualizado(st.estado.nacional)).toBe(true);
    st.parar();
  });
});
