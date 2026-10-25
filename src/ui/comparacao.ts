/**
 * Comparação 1º turno (eleição 6257, final) × 2º turno (6258, parcial), por UF e no Brasil.
 * Só dados oficiais. Duas bases para o 1º turno:
 *  - "todos": percentual oficial do TSE (sobre todos os candidatos do 1º turno);
 *  - "dois": só entre Flávio e Lula (votos de um ÷ soma dos dois), comparável ao 2º turno.
 */
import { CANDIDATOS, NOMES_UF, UFS, type UF } from '../config';
import { confirmados } from '../core/calc';
import type { Resultado } from '../core/types';
import { esc, num, pctTxt, TRACO } from './format';

export type Base1T = 'todos' | 'dois';

export interface LinhaComparacao {
  abr: string;
  nome: string;
  t1: { flavio: number | null; lula: number | null; outros: number | null; lider: 'flavio' | 'lula' | 'empate' | null; votosF: number | null; votosL: number | null };
  t2: { flavio: number | null; lula: number | null; lider: 'flavio' | 'lula' | 'empate' | null; pctSecoes: number | null; votosF: number | null; votosL: number | null };
  deltaF: number | null;
  deltaL: number | null;
  mudouLider: boolean;
}

function lider(f: number | null | undefined, l: number | null | undefined): 'flavio' | 'lula' | 'empate' | null {
  if (f == null || l == null || (f === 0 && l === 0)) return null;
  return f === l ? 'empate' : f > l ? 'flavio' : 'lula';
}

export function linhaComparacao(abr: string, r1: Resultado | null, r2: Resultado | null, base: Base1T): LinhaComparacao {
  const c1 = r1 ? confirmados(r1) : null;
  const c2 = r2 && r2.votosDisponiveis ? confirmados(r2) : null;
  const vF1 = c1?.flavio?.votos ?? null;
  const vL1 = c1?.lula?.votos ?? null;
  const soma1 = vF1 != null && vL1 != null ? vF1 + vL1 : null;
  const p1F = base === 'dois' ? (soma1 ? (vF1! / soma1) * 100 : null) : c1?.flavio?.percentual ?? null;
  const p1L = base === 'dois' ? (soma1 ? (vL1! / soma1) * 100 : null) : c1?.lula?.percentual ?? null;
  const outros = base === 'todos' && c1?.flavio?.percentual != null && c1?.lula?.percentual != null
    ? Math.max(0, 100 - c1.flavio.percentual - c1.lula.percentual) : null;
  const p2F = c2?.flavio?.percentual ?? null;
  const p2L = c2?.lula?.percentual ?? null;
  const l1 = lider(vF1, vL1);
  const l2 = lider(c2?.flavio?.votos, c2?.lula?.votos);
  return {
    abr,
    nome: abr === 'br' ? 'Brasil' : NOMES_UF[abr as UF] ?? abr.toUpperCase(),
    t1: { flavio: p1F, lula: p1L, outros, lider: l1, votosF: vF1, votosL: vL1 },
    t2: { flavio: p2F, lula: p2L, lider: l2, pctSecoes: r2?.secoes.pctTotalizadas ?? null, votosF: c2?.flavio?.votos ?? null, votosL: c2?.lula?.votos ?? null },
    deltaF: p1F != null && p2F != null ? p2F - p1F : null,
    deltaL: p1L != null && p2L != null ? p2L - p1L : null,
    mudouLider: !!l1 && !!l2 && l1 !== 'empate' && l2 !== 'empate' && l1 !== l2,
  };
}

export type Coluna = 'nome' | 't1f' | 't1l' | 't2f' | 't2l' | 'df' | 'dl' | 'sec';
const valorColuna: Record<Coluna, (l: LinhaComparacao) => number | string | null> = {
  nome: (l) => l.nome, t1f: (l) => l.t1.flavio, t1l: (l) => l.t1.lula, t2f: (l) => l.t2.flavio, t2l: (l) => l.t2.lula,
  df: (l) => l.deltaF, dl: (l) => l.deltaL, sec: (l) => l.t2.pctSecoes,
};

export function ordenar(linhas: LinhaComparacao[], col: Coluna, desc: boolean): LinhaComparacao[] {
  const f = valorColuna[col];
  return [...linhas].sort((a, b) => {
    const va = f(a), vb = f(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; // sem dado sempre no fim
    if (vb == null) return -1;
    const c = typeof va === 'string' ? va.localeCompare(String(vb), 'pt-BR') : (va as number) - (vb as number);
    return desc ? -c : c;
  });
}

const pp = (v: number | null) => v == null ? TRACO : `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`;
const nomeLider = (l: LinhaComparacao['t1']['lider']) => l === 'flavio' ? 'Flávio' : l === 'lula' ? 'Lula' : l === 'empate' ? 'Empate' : TRACO;

export function htmlComparacao(o: {
  nacional: LinhaComparacao; linhas: LinhaComparacao[]; base: Base1T; col: Coluna; desc: boolean; carregando: number; falhas: number;
}): string {
  const n = o.nacional;
  const th = (c: Coluna, t: string) => `<th scope="col"><button type="button" data-col="${c}" aria-sort="${o.col === c ? (o.desc ? 'descending' : 'ascending') : 'none'}">${t}${o.col === c ? (o.desc ? ' ▼' : ' ▲') : ''}</button></th>`;
  const mudaram = o.linhas.filter((l) => l.mudouLider);
  const cardCand = (k: 'flavio' | 'lula') => {
    const c = CANDIDATOS.find((x) => x.chave === k)!;
    const p1 = k === 'flavio' ? n.t1.flavio : n.t1.lula;
    const p2 = k === 'flavio' ? n.t2.flavio : n.t2.lula;
    const v1 = k === 'flavio' ? n.t1.votosF : n.t1.votosL;
    const v2 = k === 'flavio' ? n.t2.votosF : n.t2.votosL;
    const d = k === 'flavio' ? n.deltaF : n.deltaL;
    return `<div class="cartao cmp-cand" style="--c:var(--${k})" data-testid="cmp-${c.numero}">
      <strong>${esc(c.rotulo)} (${c.numero})</strong>
      <div class="cmp-lado"><span class="rotulo">1º turno (final)</span><span class="num grande-2">${pctTxt(p1)}</span><span class="nota num">${num(v1)} votos</span></div>
      <div class="cmp-lado"><span class="rotulo">2º turno (parcial)</span><span class="num grande-2">${pctTxt(p2)}</span><span class="nota num">${num(v2)} votos até agora</span></div>
      <span class="cmp-delta num ${d == null ? '' : d >= 0 ? 'sobe' : 'desce'}">${pp(d)}</span>
    </div>`;
  };
  const linhasHtml = o.linhas.map((l) => `<tr${l.mudouLider ? ' class="mudou-lider"' : ''}>
      <td>${esc(l.nome)}</td>
      <td>${pctTxt(l.t1.flavio)}</td><td>${pctTxt(l.t1.lula)}</td>
      <td>${pctTxt(l.t2.flavio)}</td><td>${pctTxt(l.t2.lula)}</td>
      <td class="${l.deltaF == null ? '' : l.deltaF >= 0 ? 'sobe' : 'desce'}">${pp(l.deltaF)}</td>
      <td class="${l.deltaL == null ? '' : l.deltaL >= 0 ? 'sobe' : 'desce'}">${pp(l.deltaL)}</td>
      <td>${nomeLider(l.t1.lider)} → ${nomeLider(l.t2.lider)}${l.mudouLider ? ' ⇄' : ''}</td>
      <td>${pctTxt(l.t2.pctSecoes)}</td>
    </tr>`).join('');
  return `
    <div class="cmp-topo">
      <div class="eixo" role="radiogroup" aria-label="Base do percentual do 1º turno">
        <button type="button" role="radio" data-base="dois" aria-checked="${o.base === 'dois'}">1º turno só entre os dois</button>
        <button type="button" role="radio" data-base="todos" aria-checked="${o.base === 'todos'}">1º turno com todos os candidatos</button>
      </div>
      <p class="nota">${o.base === 'dois'
        ? 'Base comparável: no 1º turno, votos de cada um ÷ soma dos votos de Flávio e Lula. No 2º turno, percentual oficial do TSE.'
        : `Percentual oficial do 1º turno (sobre todos os candidatos; outros candidatos somaram ${pctTxt(n.t1.outros)} no Brasil). Não é diretamente comparável ao 2º turno.`}
        O 2º turno é parcial: compare sabendo quanto de cada UF já foi totalizado (última coluna).</p>
    </div>
    ${o.carregando ? `<p class="nota">Carregando 1º turno de ${o.carregando} UFs…</p>` : ''}
    ${o.falhas ? `<p class="nota">${o.falhas} arquivo(s) do 1º turno não carregaram; tentaremos de novo.</p>` : ''}
    <div class="cmp-cards">${cardCand('flavio')}${cardCand('lula')}</div>
    <p class="vantagem" data-testid="cmp-mudaram">${mudaram.length
      ? `Estados onde o candidato com mais votos <b>mudou</b> do 1º para o 2º turno (parcial): ${mudaram.map((l) => `${esc(l.nome)} (${nomeLider(l.t1.lider)} → ${nomeLider(l.t2.lider)})`).join(', ')}.`
      : 'Até agora, nenhum estado mudou de candidato com mais votos entre o 1º e o 2º turno.'}</p>
    <div class="tabela-caixa"><table data-testid="tabela-comparacao">
      <caption class="nota" style="text-align:left;padding:8px 10px">Toque no título de uma coluna para ordenar. ⇄ = mudou quem tem mais votos. Fonte: TSE (eleições 6257 e 6258).</caption>
      <thead><tr>${th('nome', 'UF')}${th('t1f', 'Flávio 1º')}${th('t1l', 'Lula 1º')}${th('t2f', 'Flávio 2º')}${th('t2l', 'Lula 2º')}${th('df', 'Δ Flávio')}${th('dl', 'Δ Lula')}<th scope="col">Mais votos</th>${th('sec', '2º totalizado')}</tr></thead>
      <tbody>${linhasHtml}</tbody>
    </table></div>`;
}

export const UFS_COMPARACAO: readonly string[] = UFS;
