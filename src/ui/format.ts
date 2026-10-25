const nf = new Intl.NumberFormat('pt-BR');
const pf = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hf = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dhf = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const TRACO = '—';

export function num(n: number | null | undefined): string {
  return n == null ? TRACO : nf.format(n);
}

export function pctTxt(n: number | null | undefined): string {
  return n == null ? TRACO : `${pf.format(n)}%`;
}

export function hora(ms: number | null | undefined): string {
  return ms == null ? TRACO : hf.format(new Date(ms));
}

export function dataHora(ms: number | null | undefined): string {
  return ms == null ? TRACO : dhf.format(new Date(ms));
}

const MAPA_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => MAPA_ESC[c] ?? c);
}
