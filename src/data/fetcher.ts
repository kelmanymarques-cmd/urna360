/**
 * Busca de JSON com timeout, classificação de erros e validação.
 * Uma resposta inválida NUNCA substitui o último dado válido (isso é garantido no store).
 */
import { ErroNormalizacao } from '../core/normalize';

export type TipoErro = 'timeout' | 'rede' | 'http' | 'vazio' | 'json_invalido' | 'validacao';

export interface ErroBusca {
  tipo: TipoErro;
  mensagem: string;
  status?: number;
  em: number;
}

export type Busca<T> = { ok: true; dados: T; duracaoMs: number } | { ok: false; erro: ErroBusca; duracaoMs: number };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const MENSAGEM_ERRO: Record<TipoErro, string> = {
  timeout: 'A fonte demorou demais para responder.',
  rede: 'Falha de conexão com a fonte.',
  http: 'A fonte respondeu com erro.',
  vazio: 'A fonte devolveu um arquivo vazio.',
  json_invalido: 'A fonte devolveu um arquivo ilegível.',
  validacao: 'O arquivo recebido não corresponde ao pleito esperado.',
};

export async function buscarJson<T>(
  url: string,
  normalizar: (raw: unknown) => T,
  opts: { timeoutMs: number; fetchImpl?: FetchLike; agora?: () => number },
): Promise<Busca<T>> {
  const agora = opts.agora ?? Date.now;
  const f = opts.fetchImpl ?? ((i: string, init?: RequestInit) => fetch(i, init));
  const inicio = agora();
  const falha = (tipo: TipoErro, mensagem: string, status?: number): Busca<T> => ({
    ok: false,
    erro: { tipo, mensagem, status, em: agora() },
    duracaoMs: agora() - inicio,
  });

  const ctrl = new AbortController();
  let estourou = false;
  const timer = setTimeout(() => {
    estourou = true;
    ctrl.abort();
  }, opts.timeoutMs);

  try {
    let resp: Response;
    try {
      // "no-cache" = sempre revalidar; o navegador usa ETag/Last-Modified (304) automaticamente.
      resp = await f(url, { signal: ctrl.signal, cache: 'no-cache', headers: { Accept: 'application/json' } });
    } catch (e) {
      return estourou ? falha('timeout', MENSAGEM_ERRO.timeout) : falha('rede', `${MENSAGEM_ERRO.rede} ${String(e)}`);
    }
    if (!resp.ok) return falha('http', `${MENSAGEM_ERRO.http} (HTTP ${resp.status})`, resp.status);
    let corpo: string;
    try {
      corpo = await resp.text();
    } catch {
      return estourou ? falha('timeout', MENSAGEM_ERRO.timeout) : falha('rede', MENSAGEM_ERRO.rede);
    }
    if (corpo.trim() === '') return falha('vazio', MENSAGEM_ERRO.vazio);
    let raw: unknown;
    try {
      raw = JSON.parse(corpo);
    } catch {
      return falha('json_invalido', MENSAGEM_ERRO.json_invalido);
    }
    try {
      return { ok: true, dados: normalizar(raw), duracaoMs: agora() - inicio };
    } catch (e) {
      if (e instanceof ErroNormalizacao) return falha('validacao', `${MENSAGEM_ERRO.validacao} ${e.message}`);
      throw e;
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Executa tarefas com limite de concorrência. */
export async function emLotes<T, R>(itens: readonly T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(itens.length);
  let i = 0;
  const trabalhadores = Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (i < itens.length) {
      const idx = i++;
      out[idx] = await fn(itens[idx] as T);
    }
  });
  await Promise.all(trabalhadores);
  return out;
}
