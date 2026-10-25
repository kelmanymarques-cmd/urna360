#!/usr/bin/env node
/**
 * URNA360 — servidor/proxy sem dependências.
 *
 * - Serve o build estático (dist/) com cabeçalhos de segurança.
 * - /api/tse/*  : proxy SOMENTE para os arquivos oficiais do pleito configurado (lista branca),
 *                 com cache curto, coalescência de requisições, requisições condicionais (ETag),
 *                 cache negativo de 404 (o TSE bloqueia IPs que geram muitos 404) e
 *                 entrega do último dado válido marcado como desatualizado se a fonte falhar.
 * - /api/historico : pontos observados do arquivo nacional oficial (apenas quando mudam).
 * - /api/saude  : verificação simples de funcionamento.
 *
 * Nenhuma credencial é necessária: os arquivos do TSE são públicos.
 */
import http from 'node:http';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ELEICAO = '6258';
const ELEICAO_ARQ = '006258';
const ABRANGENCIAS = new Set([
  'br', 'zz', 'ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt', 'pa',
  'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to',
]);
const RE_ARQUIVO = new RegExp(
  `^/(oficial|simulado2026)/ele2026/${ELEICAO}/dados/([a-z]{2})/([a-z]{2})-(c0001-e${ELEICAO_ARQ}-u|e${ELEICAO_ARQ}-ab)\\.json$`,
);
const RE_EXTRAS = [
  /^\/oficial\/ele2026\/6257\/dados\/([a-z]{2})\/([a-z]{2})-c0001-e006257-u\.json$/,
  /^\/oficial\/ele2026\/6258\/dados\/([a-z]{2})\/([a-z]{2})\d{5}-c0001-e006258-u\.json$/,
];
const CONFIG_MUN = '/oficial/ele2026/6258/config/mun-e006258-cm.json';

/** Valida o caminho pedido. Retorna null se não for um arquivo permitido. */
export function caminhoPermitido(p) {
  if (p === CONFIG_MUN) return p;
  for (const re of RE_EXTRAS) {
    const x = re.exec(p);
    if (x && x[1] === x[2] && ABRANGENCIAS.has(x[1])) return p;
  }
  const m = RE_ARQUIVO.exec(p);
  if (!m) return null;
  const [, , dir, abr, tipo] = m;
  if (dir !== abr || !ABRANGENCIAS.has(abr)) return null;
  if (tipo.endsWith('-ab') && abr !== 'br') return null;
  return p;
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

const CABECALHOS_SEGURANCA = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://resultados.tse.jus.br; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/** Extrai do arquivo nacional apenas o necessário para o histórico. Retorna null se não for um ponto válido. */
export function pontoHistorico(json, registradoEm) {
  if (!json || typeof json !== 'object') return null;
  if (String(json.ele) !== ELEICAO || String(json.t) !== '2' || json.f !== 'o' || json.dv !== 's') return null;
  const st = Number(json.s?.st);
  if (!Number.isFinite(st) || st <= 0) return null;
  if (!json.dt || !json.ht) return null;
  const num = (v) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  };
  const percentuais = {};
  for (const cargo of Array.isArray(json.carg) ? json.carg : []) {
    for (const agr of cargo.agr ?? []) for (const par of agr.par ?? []) for (const c of par.cand ?? []) {
      percentuais[String(c.n)] = num(c.pvapn ?? c.pvap);
    }
  }
  const pst = num(json.s.pstn ?? json.s.pst);
  if (pst === null) return null;
  return { registradoEm, totalizadoEm: `${json.dt} ${json.ht}`, pctTotalizadas: pst, percentuais };
}

export function criarServidor(opcoes = {}) {
  const origem = (opcoes.origem ?? process.env.TSE_ORIGEM ?? 'https://resultados.tse.jus.br').replace(/\/$/, '');
  const ttlMs = Number(opcoes.ttlMs ?? process.env.CACHE_TTL_MS ?? 10_000);
  const timeoutMs = Number(opcoes.timeoutMs ?? 10_000);
  const servirEstatico = opcoes.servirEstatico ?? true;
  const pastaEstatica = opcoes.pastaEstatica ?? path.join(RAIZ, 'dist');
  const arquivoHistorico = opcoes.arquivoHistorico ?? process.env.HISTORICO_ARQUIVO ?? null;
  const limitePorMinuto = Number(opcoes.limitePorMinuto ?? 600);
  const fetchImpl = opcoes.fetchImpl ?? fetch;
  const log = opcoes.log ?? ((ev, d) => console.log(JSON.stringify({ t: new Date().toISOString(), ev, ...d })));

  /** @type {Map<string, {corpo: Buffer, etag?: string, lastModified?: string, obtidoEm: number, status: number}>} */
  const cache = new Map();
  const emVoo = new Map();
  const negativo = new Map(); // caminho -> expira (ms)
  const historico = [];
  const acessos = new Map();

  if (arquivoHistorico && existsSync(arquivoHistorico)) {
    readFile(arquivoHistorico, 'utf8').then((t) => {
      const j = JSON.parse(t);
      if (Array.isArray(j)) historico.push(...j);
    }).catch(() => {});
  }

  function registrarHistorico(corpo) {
    let json;
    try { json = JSON.parse(corpo.toString('utf8')); } catch { return; }
    const p = pontoHistorico(json, new Date().toISOString());
    if (!p) return;
    const ultimo = historico[historico.length - 1];
    if (ultimo && ultimo.totalizadoEm === p.totalizadoEm) return;
    historico.push(p);
    if (historico.length > 2000) historico.shift();
    if (arquivoHistorico) writeFile(arquivoHistorico, JSON.stringify(historico)).catch(() => {});
  }

  async function buscarUpstream(caminho) {
    const anterior = cache.get(caminho);
    const headers = { Accept: 'application/json', 'User-Agent': 'URNA360/0.1 (painel de apuração)' };
    if (anterior?.etag) headers['If-None-Match'] = anterior.etag;
    if (anterior?.lastModified) headers['If-Modified-Since'] = anterior.lastModified;
    const inicio = Date.now();
    try {
      const r = await fetchImpl(origem + caminho, { headers, signal: AbortSignal.timeout(timeoutMs) });
      log('upstream', { caminho, status: r.status, ms: Date.now() - inicio });
      if (r.status === 304 && anterior) {
        anterior.obtidoEm = Date.now();
        return { entrada: anterior };
      }
      if (r.status === 404) negativo.set(caminho, Date.now() + 60_000);
      if (!r.ok) return { erro: `HTTP ${r.status}`, status: r.status };
      const corpo = Buffer.from(await r.arrayBuffer());
      if (corpo.length === 0) return { erro: 'arquivo vazio', status: 502 };
      const entrada = {
        corpo,
        etag: r.headers.get('etag') ?? undefined,
        lastModified: r.headers.get('last-modified') ?? undefined,
        obtidoEm: Date.now(),
        status: 200,
      };
      cache.set(caminho, entrada);
      if (caminho.includes('/br/br-c0001-')) registrarHistorico(corpo);
      return { entrada };
    } catch (e) {
      const tipo = e?.name === 'TimeoutError' ? 'timeout' : 'rede';
      log('upstream_erro', { caminho, tipo, ms: Date.now() - inicio });
      return { erro: tipo, status: 504 };
    }
  }

  async function obter(caminho) {
    const c = cache.get(caminho);
    if (c && Date.now() - c.obtidoEm < ttlMs) return { entrada: c };
    const neg = negativo.get(caminho);
    if (neg && neg > Date.now()) return c ? { entrada: c, erro: 'HTTP 404 (em espera)' } : { erro: 'HTTP 404 (em espera)', status: 404 };
    if (!emVoo.has(caminho)) {
      emVoo.set(caminho, buscarUpstream(caminho).finally(() => emVoo.delete(caminho)));
    }
    const r = await emVoo.get(caminho);
    if (r.entrada) return r;
    // Fonte falhou: entrega o último dado válido, marcado como desatualizado.
    if (c) return { entrada: c, erro: r.erro };
    return r;
  }

  function limitar(req) {
    const ip = req.socket.remoteAddress ?? '?';
    const agora = Date.now();
    const a = acessos.get(ip);
    if (!a || agora - a.inicio > 60_000) {
      acessos.set(ip, { inicio: agora, n: 1 });
      if (acessos.size > 50_000) acessos.clear();
      return false;
    }
    a.n++;
    return a.n > limitePorMinuto;
  }

  function json(res, status, obj, extra = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CABECALHOS_SEGURANCA, ...extra });
    res.end(JSON.stringify(obj));
  }

  async function estatico(req, res, pathname) {
    if (!servirEstatico) return json(res, 404, { erro: 'não encontrado' });
    let rel = decodeURIComponent(pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const alvo = path.normalize(path.join(pastaEstatica, rel));
    if (!alvo.startsWith(pastaEstatica)) return json(res, 400, { erro: 'caminho inválido' });
    let arquivo = alvo;
    try {
      const s = await stat(arquivo);
      if (!s.isFile()) throw new Error();
    } catch {
      arquivo = path.join(pastaEstatica, 'index.html');
    }
    try {
      const corpo = await readFile(arquivo);
      const ext = path.extname(arquivo);
      const imutavel = arquivo.includes(`${path.sep}assets${path.sep}`);
      res.writeHead(200, {
        'Content-Type': TIPOS[ext] ?? 'application/octet-stream',
        'Cache-Control': imutavel ? 'public, max-age=31536000, immutable' : 'no-cache',
        ...CABECALHOS_SEGURANCA,
      });
      res.end(req.method === 'HEAD' ? undefined : corpo);
    } catch {
      json(res, 404, { erro: 'build não encontrado — rode npm run build' });
    }
  }

  const servidor = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { erro: 'método não permitido' });
      const url = new URL(req.url ?? '/', 'http://localhost');
      const p = url.pathname;
      if (p.startsWith('/api/')) {
        if (limitar(req)) return json(res, 429, { erro: 'muitas requisições' }, { 'Retry-After': '60' });
        if (p === '/api/saude') return json(res, 200, { ok: true, cache: cache.size, historico: historico.length });
        if (p === '/api/historico') return json(res, 200, historico);
        if (p.startsWith('/api/tse/')) {
          const caminho = caminhoPermitido(p.slice('/api/tse'.length));
          if (!caminho) return json(res, 400, { erro: 'arquivo não permitido' });
          const r = await obter(caminho);
          if (!r.entrada) return json(res, r.status === 404 ? 404 : 502, { erro: r.erro ?? 'falha na fonte' });
          const extra = { 'X-Urna360-Obtido-Em': new Date(r.entrada.obtidoEm).toISOString() };
          if (r.erro) {
            extra['X-Urna360-Desatualizado'] = '1';
            extra['X-Urna360-Erro-Fonte'] = r.erro;
          }
          const etagLocal = r.entrada.etag;
          if (etagLocal && req.headers['if-none-match'] === etagLocal) {
            res.writeHead(304, { ETag: etagLocal, ...CABECALHOS_SEGURANCA, ...extra });
            return res.end();
          }
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache',
            ...(etagLocal ? { ETag: etagLocal } : {}),
            ...CABECALHOS_SEGURANCA,
            ...extra,
          });
          return res.end(req.method === 'HEAD' ? undefined : r.entrada.corpo);
        }
        return json(res, 404, { erro: 'não encontrado' });
      }
      return estatico(req, res, p);
    } catch (e) {
      log('erro_interno', { msg: String(e) });
      if (!res.headersSent) json(res, 500, { erro: 'erro interno' });
    }
  });
  return servidor;
}

const executadoDireto = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executadoDireto) {
  const dev = process.argv.includes('--dev');
  const porta = Number(process.env.PORT ?? (dev ? 8787 : 8080));
  criarServidor({ servirEstatico: !dev }).listen(porta, () => {
    console.log(`URNA360 ${dev ? '(proxy de desenvolvimento)' : ''} em http://localhost:${porta}`);
  });
}
