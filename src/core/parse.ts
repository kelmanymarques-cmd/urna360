/**
 * Leitura defensiva de valores dos arquivos do TSE.
 * Os arquivos usam números como string e vírgula decimal ("9,90").
 * Nada aqui inventa valores: entrada inválida vira `null`.
 */

export type Obj = Record<string, unknown>;

export function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Inteiro não negativo (contagens). Aceita número ou string só com dígitos. */
export function inteiro(v: unknown): number | null {
  if (typeof v === 'number') {
    return Number.isInteger(v) && v >= 0 ? v : null;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (!/^\d+$/.test(s)) return null;
    const n = Number(s);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

/** Decimal no formato do TSE ("9,90", "100", "45.123456789") → número entre 0 e 100. */
export function percentual(v: unknown): number | null {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const s = v.trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    n = Number(s);
  } else return null;
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

export function texto(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Flag "s"/"n" → boolean; qualquer outro valor → null. */
export function flag(v: unknown): boolean | null {
  if (v === 's' || v === 'S') return true;
  if (v === 'n' || v === 'N') return false;
  return null;
}

export interface CarimboTSE {
  /** Texto exatamente como publicado (dd/mm/aaaa hh:mm:ss). */
  texto: string;
  /**
   * Instante interpretado assumindo horário de Brasília (UTC−03:00).
   * A especificação EA20 não declara fuso; ver README.
   */
  iso: string;
  ms: number;
}

/** Combina campos de data (dd/mm/aaaa) e hora (hh:mm:ss) do TSE. */
export function carimbo(data: unknown, hora: unknown): CarimboTSE | null {
  if (typeof data !== 'string' || typeof hora !== 'string') return null;
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data.trim());
  const h = /^(\d{2}):(\d{2}):(\d{2})$/.exec(hora.trim());
  if (!d || !h) return null;
  const [, dd, mm, aaaa] = d;
  const [, hh, mi, ss] = h;
  const iso = `${aaaa}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  // Rejeita datas impossíveis (ex.: 31/02) que Date normalizaria.
  const chk = new Date(ms - 3 * 3600_000);
  if (chk.getUTCDate() !== Number(dd) || chk.getUTCMonth() + 1 !== Number(mm)) return null;
  return { texto: `${data.trim()} ${hora.trim()}`, iso, ms };
}

/** Percentual seguro: null se algum valor faltar ou o denominador for zero. */
export function pct(parte: number | null | undefined, total: number | null | undefined): number | null {
  if (parte == null || total == null) return null;
  if (!Number.isFinite(parte) || !Number.isFinite(total) || total <= 0 || parte < 0) return null;
  if (parte > total) return null;
  return (parte / total) * 100;
}
