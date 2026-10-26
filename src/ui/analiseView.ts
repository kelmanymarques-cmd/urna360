/**
 * Seção "Análise: o que mudou do 1º para o 2º turno" — texto gerado a partir dos números oficiais,
 * mesmo tratamento para os dois candidatos, com os limites da análise explícitos.
 */
import { NOMES_UF, REGIOES, type UF } from '../config';
import type { Fluxo, Resumo } from '../core/analise';
import { esc, num } from './format';

const mi = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} milhões`
    : a >= 1_000 ? `${(a / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil` : num(a);
  return s;
};
const sinal = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${mi(n)}`;
const nomeUF = (a: string) => NOMES_UF[a as UF] ?? a.toUpperCase();
const lado = (m: number) => (m > 0 ? `Flávio +${mi(m)}` : m < 0 ? `Lula +${mi(-m)}` : 'empate');
const pct = (v: number, d = 1) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

function barra(valor: number, max: number, cls: string): string {
  const w = max > 0 ? Math.min(100, (Math.abs(valor) / max) * 100) : 0;
  return `<span class="an-barra ${cls}" style="width:${w.toFixed(1)}%"></span>`;
}

export function htmlAnalise(r: Resumo, ufs: Fluxo[], pendente: boolean): string {
  const n = r.nacional;
  const parcial = (n.pctSecoes2 ?? 0) < 100;
  const regioes = REGIOES.map((rg) => {
    const lista = ufs.filter((u) => (rg.ufs as readonly string[]).includes(u.abr));
    const dM = lista.reduce((s, u) => s + u.dMargem, 0);
    return { nome: rg.nome, dM, dF: lista.reduce((s, u) => s + u.dF, 0), dL: lista.reduce((s, u) => s + u.dL, 0), outros: lista.reduce((s, u) => s + u.outros1, 0) };
  }).sort((a, b) => a.dM - b.dM);
  const maxReg = Math.max(...regioes.map((x) => Math.abs(x.dM)), 1);
  const maxUF = Math.max(...ufs.map((u) => Math.abs(u.dMargem)), 1);
  const top = [...ufs].sort((a, b) => a.dMargem - b.dMargem);
  const viraram = ufs.filter((u) => Math.sign(u.margem1) !== Math.sign(u.margem2) && u.margem1 !== 0 && u.margem2 !== 0);
  const sobraNominal = n.nominais2 - n.nominais1;
  const quemMais = n.dL > n.dF ? 'Lula' : 'Flávio Bolsonaro';
  const fatiaF = n.fatiaLula !== null ? 100 - n.fatiaLula : null;

  // Destaques gerados só a partir dos números
  const destaques: string[] = [];
  destaques.push(`A diferença entre os dois mudou <b>${sinal(-n.dMargem).replace('+', '')} votos a favor de ${n.dMargem < 0 ? 'Lula' : 'Flávio Bolsonaro'}</b>: era ${lado(n.margem1)} no 1º turno e ficou ${lado(n.margem2)} no 2º.`);
  if (r.rumoFlavio.length === 0 && r.rumoLula.length) destaques.push(`A diferença se moveu na mesma direção (rumo a Lula) em <b>todas as ${r.rumoLula.length} UFs</b>.`);
  else destaques.push(`A diferença se moveu rumo a Lula em ${r.rumoLula.length} UFs e rumo a Flávio em ${r.rumoFlavio.length}.`);
  const t3 = top.slice(0, 3);
  const pt3 = t3.reduce((s, u) => s + u.dMargem, 0) / n.dMargem * 100;
  destaques.push(`${t3.map((u) => `${nomeUF(u.abr)} (${mi(-u.dMargem)})`).join(', ')} somam <b>${pct(pt3, 0)}</b> dessa mudança.`);
  const reg1 = regioes[0]!, reg2 = regioes[1]!;
  destaques.push(`Por região: ${reg1.nome} (${pct((reg1.dM / n.dMargem) * 100, 0)}) e ${reg2.nome} (${pct((reg2.dM / n.dMargem) * 100, 0)}) concentram a maior parte.`);
  if (viraram.length) destaques.push(`Mudou o candidato com mais votos em: ${viraram.map((u) => `<b>${nomeUF(u.abr)}</b> (${lado(u.margem1)} → ${lado(u.margem2)})`).join(', ')}.`);
  if (r.flavioPerdeuVotos.length) destaques.push(`Flávio teve <b>menos votos absolutos</b> que no 1º turno em ${r.flavioPerdeuVotos.map((u) => `${nomeUF(u.abr)} (${sinal(u.dF)})`).join(', ')} — estados onde o comparecimento caiu.`);
  if (r.lulaAlemDosOutros.length) destaques.push(`Em ${r.lulaAlemDosOutros.length} UFs, Lula ganhou mais votos do que <b>todos os outros candidatos somaram</b> no 1º turno (maiores: ${r.lulaAlemDosOutros.slice(0, 4).map((u) => nomeUF(u.abr)).join(', ')}). Ali o saldo também veio de comparecimento maior e/ou menos brancos e nulos.`);
  const fFortes = [...ufs].filter((u) => u.fatiaLula !== null).sort((a, b) => (a.fatiaLula ?? 0) - (b.fatiaLula ?? 0)).slice(0, 3);
  if (fFortes.length) destaques.push(`Onde Flávio ficou com a maior fatia do saldo novo: ${fFortes.map((u) => `${nomeUF(u.abr)} (${pct(100 - (u.fatiaLula ?? 0), 0)})`).join(', ')}.`);

  const linhasUF = top.map((u) => `<tr>
      <td>${esc(nomeUF(u.abr))}</td>
      <td class="${u.dF >= 0 ? 'sobe' : 'desce'}">${sinal(u.dF)}</td>
      <td class="${u.dL >= 0 ? 'sobe' : 'desce'}">${sinal(u.dL)}</td>
      <td>${mi(u.outros1)}</td>
      <td>${u.dComparecimento === null ? '—' : sinal(u.dComparecimento)}</td>
      <td>${sinal(u.dBrancosNulos)}</td>
      <td>${u.fatiaLula === null ? '—' : `${pct(100 - u.fatiaLula, 0)} / ${pct(u.fatiaLula, 0)}`}</td>
      <td>${lado(u.margem1)} → ${lado(u.margem2)}</td>
      <td><span class="an-celula">${barra(u.dMargem, maxUF, u.dMargem < 0 ? 'l' : 'f')}</span>${sinal(-u.dMargem).replace('+', '')}</td>
    </tr>`).join('');

  return `
    ${pendente ? '<p class="nota">Carregando os arquivos do 1º turno…</p>' : ''}
    ${parcial ? `<p class="aviso info">2º turno com ${pct(n.pctSecoes2 ?? 0, 2)} das seções totalizadas: os números ainda podem mudar um pouco.</p>` : ''}
    <div class="an-grade">
      <div class="cartao an-bloco">
        <h3>De onde vieram os votos a mais (Brasil)</h3>
        <dl class="an-dl num">
          <dt>Flávio Bolsonaro</dt><dd>${mi(n.f1)} → ${mi(n.f2)} <b class="${n.dF >= 0 ? 'sobe' : 'desce'}">(${sinal(n.dF)})</b></dd>
          <dt>Lula</dt><dd>${mi(n.l1)} → ${mi(n.l2)} <b class="${n.dL >= 0 ? 'sobe' : 'desce'}">(${sinal(n.dL)})</b></dd>
          <dt>Os dois juntos receberam a mais</dt><dd><b>${mi(n.novosParaOsDois)}</b></dd>
        </dl>
        <p class="nota">Esse saldo é a soma de:</p>
        <dl class="an-dl num">
          <dt>Votos dos outros ${n.qtdOutros} candidatos no 1º turno</dt><dd>${mi(n.outros1)}</dd>
          <dt>Variação dos votos válidos (comparecimento ${n.dComparecimento === null ? '—' : sinal(n.dComparecimento)} · brancos e nulos ${sinal(n.dBrancosNulos)})</dt><dd>${sinal(sobraNominal)}</dd>
        </dl>
        <div class="an-divisao" aria-label="Divisão do saldo novo">
          <span style="width:${fatiaF ?? 0}%;background:var(--flavio)"></span><span style="width:${n.fatiaLula ?? 0}%;background:var(--lula)"></span>
        </div>
        <p class="nota num">Do saldo novo, <b>${fatiaF === null ? '—' : pct(fatiaF)}</b> foi para Flávio e <b>${n.fatiaLula === null ? '—' : pct(n.fatiaLula)}</b> para Lula. ${quemMais} ganhou mais votos em relação ao 1º turno.</p>
      </div>
      <div class="cartao an-bloco">
        <h3>Principais pontos</h3>
        <ul class="an-lista" data-testid="analise-destaques">${destaques.map((d) => `<li>${d}</li>`).join('')}</ul>
      </div>
    </div>
    <div class="cartao an-bloco">
      <h3>Mudança da diferença por região</h3>
      <div class="an-regioes">${regioes.map((g) => `<div class="an-reg"><span>${g.nome}</span><span class="an-celula">${barra(g.dM, maxReg, g.dM < 0 ? 'l' : 'f')}</span><span class="num">${g.dM < 0 ? 'Lula' : 'Flávio'} +${mi(Math.abs(g.dM))} · ${pct(Math.abs(g.dM / n.dMargem) * 100, 0)}</span></div>`).join('')}</div>
      <p class="nota">Quanto a diferença Flávio − Lula se moveu em cada região do 1º para o 2º turno. Barra vermelha = moveu a favor de Lula; verde = a favor de Flávio.</p>
    </div>
    <div class="tabela-caixa"><table data-testid="tabela-analise">
      <caption class="nota" style="text-align:left;padding:8px 10px">Por UF, ordenado pela mudança da diferença. “Outros no 1º” = votos dos demais candidatos no 1º turno. “Fatia” = divisão do saldo novo (Flávio / Lula); “—” quando os dois juntos tiveram menos votos que no 1º turno.</caption>
      <thead><tr><th scope="col">UF</th><th scope="col">Δ Flávio</th><th scope="col">Δ Lula</th><th scope="col">Outros no 1º</th><th scope="col">Δ comparecimento</th><th scope="col">Δ brancos+nulos</th><th scope="col">Fatia F / L</th><th scope="col">Diferença 1º → 2º</th><th scope="col">Mudança</th></tr></thead>
      <tbody>${linhasUF}</tbody>
    </table></div>
    <p class="nota an-limite"><b>Limites desta análise:</b> são saldos agregados dos arquivos oficiais do TSE (1º turno final, eleição 6257; 2º turno, eleição 6258). Eles mostram onde e quanto cada um cresceu, mas <b>não dizem quem votou em quem</b>: não é possível saber, só com esses números, se eleitores trocaram de candidato, se novos eleitores compareceram ou se quem votou em branco no 1º turno escolheu um lado. Exterior (ZZ) fica fora das UFs (diferença de ${mi(Math.abs(n.dMargem - r.somaUFs))} votos na soma).</p>`;
}
