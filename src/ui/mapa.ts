import brasil from '@svg-maps/brazil';
import { NOMES_UF, UFS, type UF } from '../config';
import type { AcompanhamentoAbr, Resultado } from '../core/types';
import { CAMADAS_METRICAS, pintar, type IdCamada } from './camadas';
import { esc } from './format';

interface Local { id: string; name: string; path: string }
const LOCAIS = (brasil as unknown as { locations: Local[]; viewBox: string }).locations;
const VIEWBOX = (brasil as unknown as { viewBox: string }).viewBox;

export interface DadosMapa {
  camada: IdCamada;
  texturas: boolean;
  selecionada: string | null;
  resultado: (uf: string) => Resultado | null;
  acomp: (uf: string) => AcompanhamentoAbr | null;
}

export interface EventosMapa {
  /** Recebe a UF clicada, ou null ao clicar fora das UFs. */
  selecionar: (uf: string | null) => void;
  dica: (uf: string | null, x: number, y: number) => void;
}

/** Monta o SVG uma única vez; depois só atualiza cores (sem recriar nós). */
export function montarMapa(raiz: HTMLElement, ev: EventosMapa) {
  const ids = new Set<string>(UFS);
  const paths = LOCAIS.filter((l) => ids.has(l.id))
    .map(
      (l) =>
        `<path id="uf-${l.id}" data-uf="${l.id}" d="${esc(l.path)}" tabindex="0" role="button" aria-label="${esc(NOMES_UF[l.id as UF])}"></path>`,
    )
    .join('');
  const texturas = LOCAIS.filter((l) => ids.has(l.id))
    .map((l) => `<path class="textura" data-tex="${l.id}" d="${esc(l.path)}" fill="none"></path>`)
    .join('');
  raiz.innerHTML = `
    <svg viewBox="${VIEWBOX}" role="group" aria-label="Mapa do Brasil com as 27 unidades da Federação. Use Tab para navegar e Enter para ver detalhes.">
      <defs>
        <pattern id="tx-flavio" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="3" height="8" fill="#FFFFFF8C"></rect>
        </pattern>
        <pattern id="tx-lula" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="4" cy="4" r="1.8" fill="#FFFFFF8C"></circle>
        </pattern>
      </defs>
      <g class="ufs">${paths}</g>
      <g class="texturas">${texturas}</g>
      <g class="rotulos"></g>
    </svg>`;
  const svg = raiz.querySelector('svg')!;

  // Siglas no centro de cada UF (getBBox não existe em todos os ambientes).
  const rot = svg.querySelector('.rotulos')!;
  for (const p of svg.querySelectorAll<SVGPathElement>('.ufs path')) {
    const bb = typeof p.getBBox === 'function' ? p.getBBox() : null;
    if (!bb || !bb.width) continue;
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', String(bb.x + bb.width / 2));
    t.setAttribute('y', String(bb.y + bb.height / 2 + 3));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('class', 'rot');
    t.setAttribute('aria-hidden', 'true');
    t.dataset.rot = p.dataset.uf ?? '';
    const sigla = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    sigla.textContent = (p.dataset.uf ?? '').toUpperCase();
    const valor = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    valor.setAttribute('class', 'rot-v');
    valor.setAttribute('x', String(bb.x + bb.width / 2));
    valor.setAttribute('dy', '9');
    t.append(sigla, valor);
    rot.appendChild(t);
  }

  const ufDe = (e: Event) => (e.target as Element | null)?.closest?.('path[data-uf]')?.getAttribute('data-uf') ?? null;
  svg.addEventListener('click', (e) => {
    const uf = ufDe(e);
    ev.selecionar(uf);
  });
  svg.addEventListener('keydown', (e) => {
    const uf = ufDe(e);
    if (e.key === 'Escape') {
      ev.selecionar(null);
      return;
    }
    if (uf && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      ev.selecionar(uf);
    }
  });
  const caixa = raiz.parentElement!;
  const mover = (e: PointerEvent) => {
    const uf = ufDe(e);
    const r = caixa.getBoundingClientRect();
    ev.dica(uf, e.clientX - r.left, e.clientY - r.top);
  };
  svg.addEventListener('pointermove', mover);
  svg.addEventListener('pointerleave', () => ev.dica(null, 0, 0));
  svg.addEventListener('focusin', (e) => {
    const uf = ufDe(e);
    const el = (e.target as Element).getBoundingClientRect?.();
    const r = caixa.getBoundingClientRect();
    if (uf && el) ev.dica(uf, el.left - r.left + el.width / 2, el.top - r.top + el.height / 2);
  });
  svg.addEventListener('focusout', () => ev.dica(null, 0, 0));
}

export function pintarMapa(raiz: HTMLElement, d: DadosMapa) {
  for (const p of raiz.querySelectorAll<SVGPathElement>('.ufs path')) {
    const uf = p.dataset.uf!;
    const pin = pintar(d.camada, d.resultado(uf), d.acomp(uf));
    p.setAttribute('fill', pin.cor);
    p.setAttribute('data-estado', pin.lid?.estado ?? 'metrica');
    p.setAttribute('aria-label', `${NOMES_UF[uf as UF]}: ${pin.resumo}`);
    p.setAttribute('aria-pressed', String(d.selecionada === uf));
    p.classList.toggle('sel', d.selecionada === uf);
    const v = raiz.querySelector(`[data-rot="${uf}"] .rot-v`);
    if (v) {
      const c = CAMADAS_METRICAS.find((x) => x.id === d.camada);
      const val = c ? c.valor(d.resultado(uf), d.acomp(uf)) : null;
      v.textContent = val === null ? '' : `${val.toLocaleString('pt-BR', { maximumFractionDigits: val < 10 ? 1 : 0 })}%`;
    }
    const tex = raiz.querySelector<SVGPathElement>(`[data-tex="${uf}"]`);
    if (tex) tex.setAttribute('fill', d.texturas && pin.padrao ? `url(#tx-${pin.padrao})` : 'none');
  }
}

export const TOTAL_UFS_NO_MAPA = LOCAIS.filter((l) => (UFS as readonly string[]).includes(l.id)).length;
