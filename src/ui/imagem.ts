/**
 * Gera a imagem da parcial (PNG 1080×1350, formato bom para WhatsApp/Instagram).
 * Só usa dados oficiais já exibidos no painel. Mesmo tratamento visual para os dois candidatos.
 */
import brasil from '@svg-maps/brazil';
import { CANDIDATOS, UFS, urlFoto } from '../config';
import { confirmados, eleicaoDefinida, lideranca } from '../core/calc';
import type { Resultado } from '../core/types';
import { CORES_CANDIDATOS, pintar } from './camadas';
import { num, pctTxt } from './format';

const W = 1080;
const H = 1350;
const COR: Record<string, string> = { flavio: CORES_CANDIDATOS.flavio, lula: CORES_CANDIDATOS.lula };
const FONTE = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const LOCAIS = (brasil as unknown as { locations: { id: string; path: string }[]; viewBox: string });

async function carregarFoto(url: string | null): Promise<ImageBitmap | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) return null;
    return await createImageBitmap(await r.blob());
  } catch {
    return null; // sem CORS ou offline: usa as iniciais
  }
}

function texto(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, tam: number, cor: string, peso = 400, alinhar: CanvasTextAlign = 'left') {
  ctx.font = `${peso} ${tam}px ${FONTE}`;
  ctx.fillStyle = cor;
  ctx.textAlign = alinhar;
  ctx.fillText(t, x, y);
}

function barra(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pct: number, cor: string) {
  ctx.fillStyle = '#0A1730';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  if (pct > 0) {
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(h, (w * Math.min(pct, 100)) / 100), h, h / 2);
    ctx.fill();
  }
}

export interface DadosImagem {
  nacional: Resultado;
  resultadoUF: (uf: string) => Resultado | null;
  url: string;
}

export async function gerarImagemParcial(d: DadosImagem): Promise<Blob> {
  const r = d.nacional;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  // Fundo
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0C1F44');
  g.addColorStop(1, '#071226');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Cabeçalho
  texto(ctx, 'URNA', 64, 112, 64, '#F4F6FB', 800);
  const wUrna = ctx.measureText('URNA').width;
  texto(ctx, '360', 64 + wUrna, 112, 64, '#F6C445', 800);
  texto(ctx, 'APURAÇÃO · PRESIDENTE · 2º TURNO · 25/10/2026', 64, 156, 26, '#A9B6CF', 600);

  // Situação
  const def = eleicaoDefinida(r);
  let y = 230;
  if (def.definido) {
    ctx.fillStyle = '#F6C445';
    ctx.beginPath();
    ctx.roundRect(64, y - 50, W - 128, 70, 16);
    ctx.fill();
    const t = def.eleito ? `TSE: ${def.eleito.rotulo} eleito — Parabéns!` : 'TSE: resultado definido';
    texto(ctx, t, W / 2, y - 4, 34, '#071226', 800, 'center');
    y += 50;
  }

  // Progresso
  const pst = r.secoes.pctTotalizadas ?? 0;
  texto(ctx, pctTxt(r.secoes.pctTotalizadas), 64, y + 56, 76, '#F4F6FB', 800);
  texto(ctx, 'das seções totalizadas', 64, y + 98, 28, '#A9B6CF', 500);
  barra(ctx, 64, y + 122, W - 128, 18, pst, '#3C7BEA');
  y += 190;

  // Candidatos (ordem oficial do TSE)
  const conf = confirmados(r);
  const lista = CANDIDATOS.map((x) => ({ x, dd: conf[x.chave] })).sort((a, b) => (a.dd?.seq ?? 99) - (b.dd?.seq ?? 99));
  const fotos = await Promise.all(lista.map(({ dd }) => carregarFoto(dd?.sqcand ? urlFoto(dd.sqcand) : null)));
  lista.forEach(({ x, dd }, i) => {
    const top = y + i * 190;
    const cor = COR[x.chave]!;
    const venceu = def.definido && def.eleito?.chave === x.chave;
    ctx.fillStyle = '#102445';
    ctx.strokeStyle = venceu ? '#F6C445' : '#22385F';
    ctx.lineWidth = venceu ? 5 : 2;
    ctx.beginPath();
    ctx.roundRect(64, top, W - 128, 170, 22);
    ctx.fill();
    ctx.stroke();
    // foto ou iniciais
    const cx = 144;
    const cy = top + 85;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 58, 0, Math.PI * 2);
    ctx.fillStyle = '#071226';
    ctx.fill();
    ctx.clip();
    const f = fotos[i];
    if (f) {
      const s = Math.max(116 / f.width, 116 / f.height);
      ctx.drawImage(f, cx - (f.width * s) / 2, cy - (f.height * s) * 0.4, f.width * s, f.height * s);
    } else {
      texto(ctx, x.rotulo.split(' ').map((p) => p[0]).slice(0, 2).join(''), cx, cy + 14, 40, '#A9B6CF', 800, 'center');
    }
    ctx.restore();
    ctx.strokeStyle = cor;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 58, 0, Math.PI * 2);
    ctx.stroke();
    // nome, número, percentual
    texto(ctx, x.rotulo, 228, top + 62, 40, '#F4F6FB', 800);
    texto(ctx, `${x.numero}${dd?.partido ? ` · ${dd.partido}` : ''}${venceu ? '  ★ ELEITO · TSE' : ''}`, 228, top + 100, 26, venceu ? '#F6C445' : '#A9B6CF', 600);
    const pct = r.votosDisponiveis ? dd?.percentual ?? null : null;
    texto(ctx, r.votosDisponiveis ? pctTxt(pct) : '—', W - 96, top + 74, 64, '#F4F6FB', 800, 'right');
    texto(ctx, r.votosDisponiveis ? `${num(dd?.votos)} votos` : 'aguardando votos', W - 96, top + 112, 26, '#A9B6CF', 500, 'right');
    barra(ctx, 228, top + 128, W - 128 - 228 + 64 - 32, 14, pct ?? 0, cor);
  });
  y += 2 * 190 + 10;

  // Mapa de liderança por UF + legenda
  const [, , vbW, vbH] = LOCAIS.viewBox.split(/\s+/).map(Number) as [number, number, number, number];
  const altMapa = H - y - 150;
  const esc = Math.min(560 / vbW, altMapa / vbH);
  const mx = 64;
  const my = y;
  const contagem = { flavio: 0, lula: 0, empate: 0, neutro: 0 };
  ctx.save();
  ctx.translate(mx, my);
  ctx.scale(esc, esc);
  ctx.lineWidth = 1 / esc;
  ctx.strokeStyle = '#071226';
  for (const l of LOCAIS.locations) {
    if (!(UFS as readonly string[]).includes(l.id)) continue;
    const lid = lideranca(d.resultadoUF(l.id));
    contagem[lid.estado]++;
    const p = new Path2D(l.path);
    ctx.fillStyle = pintar('lideranca', d.resultadoUF(l.id), null).cor;
    ctx.fill(p);
    ctx.stroke(p);
  }
  ctx.restore();
  const lx = mx + vbW * esc + 40;
  let ly = my + 40;
  texto(ctx, 'Mais votos por estado', lx, ly, 30, '#F4F6FB', 700);
  ly += 20;
  const itens: [string, string, number][] = [
    [CORES_CANDIDATOS.flavio, 'Flávio Bolsonaro', contagem.flavio], // tom mais forte = vantagem maior
    [CORES_CANDIDATOS.lula, 'Lula', contagem.lula],
    [CORES_CANDIDATOS.empate, 'Empate', contagem.empate],
    [CORES_CANDIDATOS.neutro, 'Sem dados', contagem.neutro],
  ];
  for (const [cor, nome, n] of itens) {
    ly += 52;
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.roundRect(lx, ly - 26, 30, 30, 6);
    ctx.fill();
    texto(ctx, `${nome}: ${n} UF${n === 1 ? '' : 's'}`, lx + 44, ly, 27, '#E2E8F4', 500);
  }
  texto(ctx, 'Parcial de cada UF;', lx, ly + 60, 23, '#A9B6CF', 400);
  texto(ctx, 'não indica o resultado nacional.', lx, ly + 90, 23, '#A9B6CF', 400);

  // Rodapé
  ctx.fillStyle = '#22385F';
  ctx.fillRect(64, H - 128, W - 128, 2);
  const quando = r.totalizadoEm ? `Totalização do TSE: ${r.totalizadoEm.texto} (horário de Brasília)` : 'Aguardando totalização do TSE';
  texto(ctx, quando, 64, H - 84, 26, '#E2E8F4', 600);
  texto(ctx, r.totalizacaoFinal ? 'Resultado final — Fonte: TSE' : 'Parcial — não é resultado final · Fonte: TSE', 64, H - 46, 24, '#A9B6CF', 500);

  return await new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('falha ao gerar imagem'))), 'image/png'));
}

/** Compartilha a imagem; se o aparelho não permitir, mostra a imagem para salvar. */
export async function compartilharImagem(blob: Blob, textoMsg: string): Promise<'compartilhado' | 'previa' | 'cancelado'> {
  const arquivo = new File([blob], `urna360-parcial-${Date.now()}.png`, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], text: textoMsg, title: 'URNA360 — parcial' });
      return 'compartilhado';
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return 'cancelado';
  }
  mostrarPrevia(blob, arquivo.name, textoMsg);
  return 'previa';
}

function mostrarPrevia(blob: Blob, nome: string, textoMsg: string) {
  document.getElementById('previa-imagem')?.remove();
  const url = URL.createObjectURL(blob);
  const d = document.createElement('div');
  d.id = 'previa-imagem';
  d.className = 'previa';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-label', 'Imagem da parcial');
  d.innerHTML = `<div class="previa-caixa">
      <img src="${url}" alt="Imagem da parcial da apuração" data-testid="previa-img" />
      <p class="nota">Toque e segure a imagem para salvar ou compartilhar, ou use o botão abaixo.</p>
      <div class="previa-acoes">
        <a class="botao" href="${url}" download="${nome}">Baixar imagem</a>
        <button type="button" class="botao" data-acao="copiar">Copiar texto</button>
        <button type="button" class="botao" data-acao="fechar">Fechar</button>
      </div>
    </div>`;
  d.addEventListener('click', async (e) => {
    const alvo = e.target as HTMLElement;
    const acao = alvo.closest<HTMLElement>('[data-acao]')?.dataset.acao;
    if (acao === 'fechar' || alvo === d) { d.remove(); URL.revokeObjectURL(url); }
    if (acao === 'copiar') {
      try { await navigator.clipboard.writeText(textoMsg); alvo.textContent = 'Texto copiado ✓'; } catch { alvo.textContent = 'Não foi possível copiar'; }
    }
  });
  document.body.appendChild(d);
  d.querySelector<HTMLElement>('[data-acao="fechar"]')?.focus();
}
