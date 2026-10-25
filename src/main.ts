import './styles.css';
import { ABRANGENCIA_EXTERIOR, CANDIDATOS, FONTE, NOMES_UF, UFS, urlFoto, type UF } from './config';
import { confirmados, eleicaoDefinida, lideranca, ROTULO_STATUS, statusApuracao } from './core/calc';
import type { Resultado } from './core/types';
import { Store, type Estado, type Entrada, type PontoHistorico } from './data/store';
import { CAMADAS_METRICAS, CORES_CANDIDATOS, type IdCamada, pintar } from './ui/camadas';
import { dataHora, esc, hora, num, pctTxt, TRACO } from './ui/format';
import { montarMapa, pintarMapa } from './ui/mapa';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const COR: Record<string, string> = { flavio: CORES_CANDIDATOS.flavio, lula: CORES_CANDIDATOS.lula };

const ui = {
  camada: 'lideranca' as IdCamada,
  selecionada: null as string | null,
  texturas: false,
};
try {
  const c = localStorage.getItem('urna360.camada');
  if (c) ui.camada = c as IdCamada;
  ui.texturas = localStorage.getItem('urna360.texturas') === '1';
} catch { /* armazenamento opcional */ }

const store = new Store();
let estado: Estado = store.estado;

const nomeUF = (uf: string) => NOMES_UF[uf as UF] ?? uf.toUpperCase();
const resUF = (uf: string): Resultado | null => estado.abrangencias[uf]?.dados ?? null;
const acompUF = (uf: string) => estado.acompanhamento.dados?.abrangencias.find((a) => a.abrangencia === uf) ?? null;

// ---------- cabeçalho / avisos ----------
function renderTopo() {
  const r = estado.nacional.dados;
  const st = r ? statusApuracao(r) : estado.nacional.ultimoErro ? 'indisponivel' : null;
  const consultado = estado.nacional.consultadoEm;
  $('estado-fonte').innerHTML = st
    ? `<span class="pilula ${st}" data-testid="status">${esc(ROTULO_STATUS[st])}</span>
       <span>Fonte: <a href="${FONTE.portal}" target="_blank" rel="noopener">TSE</a></span>
       <span>Consultado às <b class="num">${hora(consultado)}</b>${estado.consultando ? ' · atualizando…' : ''}</span>`
    : `<span class="pilula" data-testid="status">Carregando dados oficiais…</span>`;

  const av: string[] = [];
  const def = eleicaoDefinida(r);
  if (def.definido) {
    const quem = def.eleito ? `${esc(def.eleito.rotulo)} eleito` : 'resultado definido';
    const como = def.motivo === 'matematico'
      ? 'O TSE indica que o resultado está matematicamente definido. A totalização final ainda não terminou.'
      : 'Totalização final concluída pelo TSE.';
    av.push(`<div class="aviso eleito" data-testid="aviso-eleito"><strong>TSE: ${quem}</strong><span>${como}</span>
      <button type="button" class="botao botao-p" data-acao="hino">▶ Tocar o Hino Nacional</button></div>`);
  }
  if (r?.simulado) av.push(`<div class="aviso simulado" data-testid="aviso-simulado">Ambiente de simulação do TSE — estes números NÃO são resultados reais.</div>`);
  const erro = estado.nacional.ultimoErro;
  if (erro && r) {
    av.push(`<div class="aviso alerta" data-testid="aviso-desatualizado">Última atualização falhou às ${hora(erro.em)} (${esc(erro.mensagem)}). Exibindo os dados consultados às ${hora(consultado)}.</div>`);
  } else if (r && store.desatualizado(estado.nacional)) {
    av.push(`<div class="aviso alerta" data-testid="aviso-desatualizado">Dados possivelmente desatualizados: última consulta bem-sucedida às ${hora(consultado)}.</div>`);
  }
  if (erro && !r) av.push(`<div class="aviso erro" data-testid="aviso-erro">Dados indisponíveis. ${esc(erro.mensagem)} Nova tentativa automática às ${hora(estado.proximaConsultaEm)}.</div>`);
  if (r && r.divulgacaoAutorizada === false) av.push(`<div class="aviso info">O TSE ainda não liberou a divulgação dos votos. Os votos aparecerão quando forem publicados.</div>`);
  // Fato verificável: há quanto tempo o TSE não publica nova totalização (sem especular o motivo).
  if (r && statusApuracao(r) === 'em_andamento' && r.totalizadoEm && Date.now() - r.totalizadoEm.ms > 15 * 60_000) {
    const min = Math.floor((Date.now() - r.totalizadoEm.ms) / 60_000);
    av.push(`<div class="aviso info" data-testid="aviso-sem-totalizacao">O TSE não publica nova totalização desde ${esc(r.totalizadoEm.texto.slice(11, 16))} (há ${min} min). Os números abaixo são os últimos divulgados e serão atualizados assim que o TSE publicar.</div>`);
  }
  if (r?.motivoSemTotalizacaoFinal) av.push(`<div class="aviso info">TSE: ${esc(r.motivoSemTotalizacaoFinal)}</div>`);
  $('avisos').innerHTML = av.join('');
}

// ---------- painel nacional ----------
function renderNacional() {
  const alvo = $('painel-nacional');
  const ent = estado.nacional;
  const r = ent.dados;
  if (!r) {
    alvo.innerHTML = ent.ultimoErro
      ? `<div class="cartao vazio" data-testid="nacional-indisponivel"><strong>Dados indisponíveis</strong><span>Não foi possível ler o arquivo oficial do TSE. Nenhum número é exibido até a fonte responder.</span></div>`
      : `<div class="cartao" aria-busy="true"><div class="esqueleto" style="height:28px;width:40%"></div><div class="esqueleto" style="height:12px;margin-top:14px"></div></div>`;
    return;
  }
  const st = statusApuracao(r);
  const conf = confirmados(r);
  const cards = CANDIDATOS.map((c) => ({ c, d: conf[c.chave] }))
    .sort((a, b) => (a.d?.seq ?? 99) - (b.d?.seq ?? 99))
    .map(({ c, d }) => {
      const pct = r.votosDisponiveis ? d?.percentual ?? null : null;
      const sit = r.totalizacaoFinal && d?.situacaoOficial ? `<span class="oficial">Situação oficial (TSE): ${esc(d.situacaoOficial)}</span>` : '';
      const foto = d?.sqcand ? urlFoto(d.sqcand) : null;
      const iniciais = c.rotulo.split(' ').map((x) => x[0]).slice(0, 2).join('');
      return `<article class="cartao cand" style="--c:${COR[c.chave]}" data-testid="cand-${c.numero}">
        <div class="cab-c">
          <span class="foto" data-iniciais="${esc(iniciais)}">${foto ? `<img src="${esc(foto)}" alt="Foto oficial de ${esc(c.rotulo)} (TSE)" width="64" height="64" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</span>
          <div class="ident">
            <div class="topo-c"><span class="nome">${esc(c.rotulo)}</span><span class="numero">${c.numero}${d?.partido ? ` · ${esc(d.partido)}` : ''}</span></div>
            ${d?.vice ? `<span class="vice" data-testid="vice-${c.numero}">Vice: ${esc(d.vice)}</span>` : ''}
          </div>
        </div>
        <span class="pct num" data-vivo="pct-${c.numero}" data-testid="pct-${c.numero}">${r.votosDisponiveis ? pctTxt(pct) : TRACO}</span>
        <div class="barra" aria-hidden="true"><i style="width:${pct ?? 0}%"></i></div>
        <span class="votos num" data-vivo="votos-${c.numero}">${r.votosDisponiveis ? `${num(d?.votos)} votos` : 'Aguardando votos oficiais'}</span>
        ${!d ? '<span class="nota">Candidato não localizado no arquivo oficial.</span>' : ''}${sit}
      </article>`;
    })
    .join('');

  const v = r.votos;
  const e = r.eleitorado;
  const ind = (rotulo: string, valor: string, desc: string, id: string) =>
    `<div class="cartao ind" data-testid="ind-${id}"><span class="rotulo">${rotulo}</span><span class="v num">${valor}</span><span class="d">${desc}</span></div>`;
  const tot = r.secoes;
  renderComDestaque(alvo, `<div class="nacional">
    <div class="cartao progresso">
      <div class="linha1"><span class="rotulo">Urnas (seções) totalizadas</span><span class="rotulo">${esc(ROTULO_STATUS[st])}</span></div>
      <span class="grande num" data-vivo="pct-totalizadas" data-testid="pct-totalizadas">${pctTxt(tot.pctTotalizadas)}</span>
      <div class="barra" role="progressbar" aria-label="Seções totalizadas" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${(tot.pctTotalizadas ?? 0).toFixed(2)}"><i style="width:${tot.pctTotalizadas ?? 0}%"></i></div>
      <span class="nota num">${num(tot.totalizadas)} de ${num(tot.total)} seções · eleitorado total ${num(e.total)}</span>
      ${r.definidoMatematicamente === 'eleito' && !r.totalizacaoFinal ? '<span class="chip">TSE informa: resultado matematicamente definido</span>' : ''}
    </div>
    <div class="cands">${cards}</div>
    ${textoVantagem(r, 'nacional')}
    <div class="indicadores">
      ${ind('Votos válidos', num(v.validos), 'Votos nominais dos candidatos', 'validos')}
      ${ind('Brancos', r.votosDisponiveis ? `${num(v.brancos)} · ${pctTxt(v.pctBrancos)}` : TRACO, '% sobre o total de votos', 'brancos')}
      ${ind('Nulos', r.votosDisponiveis ? `${num(v.nulos)} · ${pctTxt(v.pctNulos)}` : TRACO, '% sobre o total de votos (inclui nulos técnicos)', 'nulos')}
      ${ind('Comparecimento', e.comparecimento !== null ? `${num(e.comparecimento)} · ${pctTxt(e.pctComparecimento)}` : TRACO, '% sobre o eleitorado das seções totalizadas', 'comparecimento')}
      ${ind('Abstenção', e.abstencao !== null ? `${num(e.abstencao)} · ${pctTxt(e.pctAbstencao)}` : TRACO, '% sobre o eleitorado das seções totalizadas', 'abstencao')}
    </div>
    <div class="carimbos">
      <span>Arquivo gerado pelo TSE: <b class="num">${esc(r.geradoEm?.texto ?? TRACO)}</b></span>
      <span>Totalização: <b class="num">${esc(r.totalizadoEm?.texto ?? 'ainda não iniciada')}</b></span>
      <span>Consultado (seu relógio): <b class="num">${dataHora(ent.consultadoEm)}</b></span>
    </div>
  </div>`);
}

/** Diferença oficial de votos nominais entre os dois candidatos (sem projeção). */
function textoVantagem(r: Resultado | null, onde: 'nacional' | 'uf'): string {
  const l = lideranca(r);
  if (l.estado === 'empate') return onde === 'nacional' ? '<p class="vantagem" data-vivo="vantagem" data-testid="vantagem">Empate em votos nominais (parcial)</p>' : 'Empate';
  if (l.estado !== 'flavio' && l.estado !== 'lula') return onde === 'nacional' ? '' : TRACO;
  const nome = CANDIDATOS.find((c) => c.chave === l.estado)!.rotulo;
  const txt = `${esc(nome)} tem <b class="num">${num(l.diferencaVotos)}</b> votos a mais`;
  return onde === 'nacional'
    ? `<p class="vantagem" data-vivo="vantagem" data-testid="vantagem">${txt} até agora <span class="nota">(apuração parcial — não é resultado final)</span></p>`
    : txt;
}

/** Destaca brevemente só os valores que realmente mudaram desde a renderização anterior. */
function renderComDestaque(alvo: HTMLElement, html: string) {
  const antes = new Map<string, string>();
  for (const el of alvo.querySelectorAll<HTMLElement>('[data-vivo]')) antes.set(el.dataset.vivo!, el.textContent ?? '');
  alvo.innerHTML = html;
  if (!antes.size) return;
  for (const el of alvo.querySelectorAll<HTMLElement>('[data-vivo]')) {
    const v = antes.get(el.dataset.vivo!);
    if (v !== undefined && v !== el.textContent) el.classList.add('mudou');
  }
}

// ---------- mapa ----------
function renderCamadas() {
  const opts: { id: IdCamada; t: string }[] = [
    { id: 'lideranca', t: 'Liderança nominal' },
    ...CAMADAS_METRICAS.map((c) => ({ id: c.id, t: c.titulo })),
  ];
  $('camadas').innerHTML = opts
    .map((o) => `<button type="button" role="radio" data-camada="${o.id}" aria-checked="${ui.camada === o.id}" tabindex="${ui.camada === o.id ? 0 : -1}">${o.t}</button>`)
    .join('');
}

function renderLegenda() {
  const nota = '<p class="nota">Azul-escuro = sem dados suficientes, aguardando totalização ou arquivo indisponível.</p>';
  if (ui.camada === 'lideranca') {
    const contagem = { flavio: 0, lula: 0, empate: 0, neutro: 0 };
    for (const uf of UFS) contagem[lideranca(resUF(uf)).estado]++;
    $('legenda').innerHTML = `<h3>Liderança por votos nominais</h3>
      <ul>
        <li><span class="amostra" style="background:${CORES_CANDIDATOS.flavio}"></span>Flávio Bolsonaro com mais votos <span class="num nota">(${contagem.flavio} UFs)</span></li>
        <li><span class="amostra" style="background:${CORES_CANDIDATOS.lula}"></span>Lula com mais votos <span class="num nota">(${contagem.lula} UFs)</span></li>
        <li><span class="amostra" style="background:${CORES_CANDIDATOS.empate}"></span>Empate <span class="num nota">(${contagem.empate})</span></li>
        <li><span class="amostra" style="background:${CORES_CANDIDATOS.neutro}"></span>Neutro — dados insuficientes <span class="num nota">(${contagem.neutro})</span></li>
      </ul>${nota}<p class="nota">Contagem parcial de cada UF; não representa o resultado nacional.</p>`;
    return;
  }
  const c = CAMADAS_METRICAS.find((x) => x.id === ui.camada)!;
  $('legenda').innerHTML = `<h3>${c.titulo}</h3><p class="nota">${c.descricao} Unidade: ${c.denominador}. Faixas fixas.</p>
    <ul>${c.faixas.map((f) => `<li><span class="amostra" style="background:${f.cor}"></span>${f.rotulo}</li>`).join('')}
    <li><span class="amostra" style="background:${CORES_CANDIDATOS.neutro}"></span>Sem dados</li></ul>`;
}

function linhaUF(uf: string) {
  const r = resUF(uf);
  const a = acompUF(uf);
  const c = r ? confirmados(r) : null;
  return { uf, r, a, flavio: c?.flavio ?? null, lula: c?.lula ?? null, lid: lideranca(r) };
}

function renderDetalhe() {
  const uf = ui.selecionada;
  if (!uf) {
    $('detalhe').innerHTML = `<p class="nota">Toque ou clique em uma UF (ou use Tab + Enter) para ver os detalhes.</p>`;
    return;
  }
  const { r, a, flavio, lula, lid } = linhaUF(uf);
  const ent = estado.abrangencias[uf];
  const pin = pintar(ui.camada, r, a);
  const vd = r?.votosDisponiveis;
  $('detalhe').innerHTML = `<div class="cartao" data-testid="detalhe-uf">
    <h3>${esc(nomeUF(uf))} <span class="nota">(${uf.toUpperCase()})</span></h3>
    <span class="chip" style="border-color:${pin.cor}">${esc(lid.estado === 'neutro' ? lid.motivo : pin.lid ? pin.resumo : pintar('lideranca', r, a).resumo)}</span>
    <dl class="num">
      <dt>Seções totalizadas</dt><dd>${pctTxt(r?.secoes.pctTotalizadas ?? a?.pctTotalizadas)}</dd>
      <dt>Flávio Bolsonaro (22)</dt><dd>${vd ? `${num(flavio?.votos)} · ${pctTxt(flavio?.percentual)}` : TRACO}</dd>
      <dt>Lula (13)</dt><dd>${vd ? `${num(lula?.votos)} · ${pctTxt(lula?.percentual)}` : TRACO}</dd>
      <dt>Diferença</dt><dd data-testid="vantagem-uf">${textoVantagem(r, 'uf')}</dd>
      <dt>Brancos</dt><dd>${vd ? `${num(r?.votos.brancos)} · ${pctTxt(r?.votos.pctBrancos)}` : TRACO}</dd>
      <dt>Nulos</dt><dd>${vd ? `${num(r?.votos.nulos)} · ${pctTxt(r?.votos.pctNulos)}` : TRACO}</dd>
      <dt>Abstenção</dt><dd>${pctTxt(r?.eleitorado.pctAbstencao)}</dd>
      <dt>Eleitorado</dt><dd>${num(r?.eleitorado.total)}</dd>
      <dt>Totalização (TSE)</dt><dd>${esc(r?.totalizadoEm?.texto ?? a?.totalizadoEm?.texto ?? TRACO)}</dd>
      <dt>Consultado</dt><dd>${hora(ent?.consultadoEm)}</dd>
    </dl>
    ${ent?.ultimoErro ? `<p class="nota" style="color:var(--alerta)">Última atualização desta UF falhou: ${esc(ent.ultimoErro.mensagem)}</p>` : ''}
  </div>`;
}

function renderTabela() {
  const caixa = $('tabela-ufs');
  if (caixa.hidden) return;
  const linhas = [...UFS, ABRANGENCIA_EXTERIOR].map((uf) => {
    const { r, a, flavio, lula, lid } = linhaUF(uf);
    const vd = r?.votosDisponiveis;
    const rotLid = { flavio: 'Flávio Bolsonaro', lula: 'Lula', empate: 'Empate', neutro: 'Sem dados suficientes' }[lid.estado];
    return `<tr><td>${esc(nomeUF(uf))}</td><td>${pctTxt(r?.secoes.pctTotalizadas ?? a?.pctTotalizadas)}</td>
      <td>${vd ? pctTxt(flavio?.percentual) : TRACO}</td><td>${vd ? pctTxt(lula?.percentual) : TRACO}</td>
      <td>${rotLid}</td><td>${vd ? pctTxt(r?.votos.pctBrancos) : TRACO}</td><td>${vd ? pctTxt(r?.votos.pctNulos) : TRACO}</td>
      <td>${pctTxt(r?.eleitorado.pctAbstencao)}</td></tr>`;
  });
  caixa.innerHTML = `<table data-testid="tabela"><caption class="nota" style="text-align:left;padding:8px 10px">Dados por UF (fonte: TSE). Percentuais dos candidatos: oficiais do TSE.</caption>
    <thead><tr><th scope="col">UF</th><th scope="col">Totalizadas</th><th scope="col">Flávio (22)</th><th scope="col">Lula (13)</th><th scope="col">Mais votos nominais</th><th scope="col">Brancos</th><th scope="col">Nulos</th><th scope="col">Abstenção</th></tr></thead>
    <tbody>${linhas.join('')}</tbody></table>`;
}

// ---------- gráficos ----------
function renderProgressoUF() {
  const itens = [...UFS, ABRANGENCIA_EXTERIOR]
    .map((uf) => ({ uf, p: resUF(uf)?.secoes.pctTotalizadas ?? acompUF(uf)?.pctTotalizadas ?? null }))
    .sort((a, b) => (b.p ?? -1) - (a.p ?? -1));
  const algum = itens.some((i) => i.p !== null);
  $('g-progresso').innerHTML = `<h3>Progresso da totalização por UF</h3>
    ${algum ? `<div class="barras-uf" role="list">${itens.map((i) => `<div class="l" role="listitem"><b>${i.uf.toUpperCase()}</b><span class="t" aria-hidden="true"><i style="width:${i.p ?? 0}%"></i></span><span class="num">${pctTxt(i.p)}</span></div>`).join('')}</div>`
      : '<div class="cartao vazio"><strong>Aguardando dados oficiais</strong></div>'}
    <figcaption>Unidade: % de seções totalizadas em cada UF. Fonte: TSE.</figcaption>`;
}

function renderEvolucao() {
  const servidor = (estado.historico?.length ?? 0) >= 2;
  const h = (servidor ? estado.historico! : historicoLocal).filter((p) => Number.isFinite(p.pctTotalizadas));
  const alvo = $('g-evolucao');
  if (h.length < 2) {
    alvo.innerHTML = `<h3>Evolução ao longo da apuração</h3><div class="cartao vazio" data-testid="evolucao-vazia"><strong>Histórico ainda indisponível</strong><span>A série é formada só pelas totalizações oficiais que ${servidor ? 'este servidor' : 'este aparelho'} recebe, a partir de quando a página foi aberta. Aparece após a 2ª atualização do TSE. Nada é preenchido ou estimado.</span></div>
      <figcaption>Fonte: arquivos oficiais do TSE registrados a cada nova totalização.</figcaption>`;
    return;
  }
  const W = 560, H = 260, m = { l: 40, r: 16, t: 14, b: 30 };
  const x = (pst: number) => m.l + (pst / 100) * (W - m.l - m.r);
  const y = (p: number) => m.t + (1 - p / 100) * (H - m.t - m.b);
  const grade = [0, 25, 50, 75, 100].map((g) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(g)}" y2="${y(g)}" stroke="#22385F"></line><text x="${m.l - 6}" y="${y(g) + 4}" text-anchor="end">${g}%</text>`).join('');
  const eixoX = [0, 25, 50, 75, 100].map((g) => `<text x="${x(g)}" y="${H - 8}" text-anchor="middle">${g}%</text>`).join('');
  const linhas = CANDIDATOS.map((c) => {
    const pts = h.filter((p) => p.percentuais[String(c.numero)] != null).map((p) => `${x(p.pctTotalizadas).toFixed(1)},${y(p.percentuais[String(c.numero)]!).toFixed(1)}`);
    return pts.length ? `<polyline fill="none" stroke="${COR[c.chave]}" stroke-width="2.5" points="${pts.join(' ')}"></polyline>` : '';
  }).join('');
  alvo.innerHTML = `<h3>Evolução do percentual oficial conforme a totalização avança</h3>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Percentual de cada candidato em função do percentual de seções totalizadas">${grade}${eixoX}${linhas}</svg>
    <figcaption>Eixo horizontal: % de seções totalizadas no Brasil. Eixo vertical: % oficial de cada candidato. ${h.length} totalizações oficiais registradas por ${servidor ? 'este servidor' : 'este aparelho'} desde ${esc(h[0]!.totalizadoEm)}. Pode haver lacunas entre registros.
    <span style="color:${COR.flavio}">■</span> Flávio Bolsonaro <span style="color:${COR.lula}">■</span> Lula</figcaption>`;
}

// ---------- ciclo de renderização ----------
function renderMapa() {
  pintarMapa($('mapa'), { camada: ui.camada, texturas: ui.texturas, selecionada: ui.selecionada, resultado: resUF, acomp: acompUF });
  renderLegenda();
  renderDetalhe();
  renderTabela();
}

function renderTudo() {
  renderTopo();
  renderResumoFixo();
  renderNacional();
  renderMapa();
  renderProgressoUF();
  renderEvolucao();
}

function iniciar() {
  renderCamadas();
  ($('padroes') as HTMLInputElement).checked = ui.texturas;
  montarMapa($('mapa'), {
    selecionar(uf) {
      ui.selecionada = uf;
      renderMapa();
    },
    dica(uf, x, y) {
      const d = $('dica');
      if (!uf) {
        d.hidden = true;
        return;
      }
      const pin = pintar(ui.camada, resUF(uf), acompUF(uf));
      d.innerHTML = `<b>${esc(nomeUF(uf))}</b><br>${esc(pin.resumo)}`;
      d.hidden = false;
      const caixa = d.parentElement!.getBoundingClientRect();
      d.style.left = `${Math.min(Math.max(8, x + 12), caixa.width - 248)}px`;
      d.style.top = `${Math.max(0, y + 12)}px`;
    },
  });
  $('camadas').addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-camada]');
    if (!b) return;
    ui.camada = b.dataset.camada as IdCamada;
    try { localStorage.setItem('urna360.camada', ui.camada); } catch { /* opcional */ }
    renderCamadas();
    renderMapa();
    $('camadas').querySelector<HTMLButtonElement>(`[data-camada="${ui.camada}"]`)?.focus();
  });
  $('camadas').addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const bs = [...$('camadas').querySelectorAll<HTMLButtonElement>('button')];
    const i = bs.findIndex((b) => b.dataset.camada === ui.camada);
    const n = bs[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length];
    e.preventDefault();
    n?.click();
  });
  $('padroes').addEventListener('change', (e) => {
    ui.texturas = (e.target as HTMLInputElement).checked;
    try { localStorage.setItem('urna360.texturas', ui.texturas ? '1' : '0'); } catch { /* opcional */ }
    renderMapa();
  });
  $('btn-tabela').addEventListener('click', () => {
    const c = $('tabela-ufs');
    c.hidden = !c.hidden;
    $('btn-tabela').setAttribute('aria-expanded', String(!c.hidden));
    $('btn-tabela').textContent = c.hidden ? 'Ver dados em tabela' : 'Ocultar tabela';
    renderTabela();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && estado.proximaConsultaEm && Date.now() >= estado.proximaConsultaEm) void store.consultarAgora();
  });

  // Foto indisponível → mostra as iniciais (mesmo tratamento para os dois candidatos).
  document.addEventListener('error', (e) => {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLImageElement && t.parentElement?.classList.contains('foto')) t.remove();
  }, true);
  configurarTelaAcesa();

  configurarAlertas();
  $('avisos').addEventListener('click', (ev) => {
    const b = (ev.target as Element).closest<HTMLButtonElement>('[data-acao="hino"]');
    if (!b) return;
    if (hinoTocando) { pararHino(); b.textContent = '▶ Tocar o Hino Nacional'; return; }
    try { audio ??= new AudioContext(); } catch { audio = null; }
    void carregarHino().then(tocarHino).then((ok) => { b.textContent = ok ? '■ Parar o hino' : 'Não foi possível tocar o áudio'; });
  });
  store.assinar((e, mudou) => {
    estado = e;
    if (mudou) { aoMudarNacional(e.nacional.dados); verificarEleito(); }
    if (mudou || !e.consultando) renderTudo();
    else renderTopo();
  });
  renderTudo();
  store.iniciar();
  // Reavalia o aviso de "desatualizado" mesmo sem novas respostas.
  setInterval(renderTopo, 30_000);
}

// ---------- resumo fixo + título da aba ----------
function renderResumoFixo() {
  const r = estado.nacional.dados;
  const el = $('resumo-fixo');
  if (!r) { el.hidden = true; document.title = 'URNA360 · Apuração 2º turno 2026'; return; }
  const pst = pctTxt(r.secoes.pctTotalizadas);
  const conf = confirmados(r);
  const partes = CANDIDATOS.map((c) => ({ c, d: conf[c.chave] }))
    .sort((a, b) => (a.d?.seq ?? 99) - (b.d?.seq ?? 99))
    .map(({ c, d }) => `<span class="rf-c"><i style="background:${COR[c.chave]}"></i>${esc(c.rotulo)} <b class="num">${r.votosDisponiveis ? pctTxt(d?.percentual) : TRACO}</b></span>`);
  el.innerHTML = `<span class="rf-p"><b class="num" data-vivo="rf-pst">${pst}</b> apurado</span>${partes.join('')}`;
  el.hidden = false;
  document.title = `${pst} apurado · URNA360`;
}

// ---------- histórico local (só totalizações oficiais observadas por este aparelho) ----------
const CHAVE_HIST = 'urna360.historico.6258';
let historicoLocal: PontoHistorico[] = [];
try {
  const j: unknown = JSON.parse(localStorage.getItem(CHAVE_HIST) ?? '[]');
  if (Array.isArray(j)) historicoLocal = j.filter((p): p is PontoHistorico =>
    !!p && typeof p.totalizadoEm === 'string' && typeof p.pctTotalizadas === 'number' && typeof p.percentuais === 'object');
} catch { /* opcional */ }

function pontoDe(r: Resultado): PontoHistorico | null {
  if (!r.votosDisponiveis || r.simulado || !r.totalizadoEm || r.secoes.pctTotalizadas === null) return null;
  const percentuais: Record<string, number | null> = {};
  for (const c of r.candidatos) percentuais[String(c.numero)] = c.percentual;
  return { registradoEm: new Date().toISOString(), totalizadoEm: r.totalizadoEm.texto, pctTotalizadas: r.secoes.pctTotalizadas, percentuais };
}

let ultimaTotalizacaoVista: string | null = null;
function aoMudarNacional(r: Resultado | null) {
  if (!r?.totalizadoEm) return;
  const nova = r.totalizadoEm.texto;
  const houveAntes = ultimaTotalizacaoVista !== null;
  if (nova === ultimaTotalizacaoVista) return;
  ultimaTotalizacaoVista = nova;
  const p = pontoDe(r);
  if (p && !historicoLocal.some((x) => x.totalizadoEm === p.totalizadoEm)) {
    historicoLocal.push(p);
    historicoLocal.sort((a, b) => a.pctTotalizadas - b.pctTotalizadas);
    if (historicoLocal.length > 1500) historicoLocal.shift();
    try { localStorage.setItem(CHAVE_HIST, JSON.stringify(historicoLocal)); } catch { /* opcional */ }
  }
  if (houveAntes) alertar();
}

// ---------- Hino Nacional quando o TSE definir o resultado (mesmo hino para qualquer eleito) ----------
const CHAVE_HINO = 'urna360.hino.6258';
let hinoBuffer: AudioBuffer | null = null;
let hinoTocando: AudioBufferSourceNode | HTMLAudioElement | null = null;
async function carregarHino() {
  if (hinoBuffer || !audio) return;
  try {
    const r = await fetch('./hino-nacional.mp3');
    hinoBuffer = await audio.decodeAudioData(await r.arrayBuffer());
  } catch { hinoBuffer = null; }
}
function pararHino() {
  try {
    if (hinoTocando instanceof HTMLAudioElement) hinoTocando.pause();
    else hinoTocando?.stop();
  } catch { /* ok */ }
  hinoTocando = null;
}
async function tocarHino(): Promise<boolean> {
  pararHino();
  try {
    if (audio && hinoBuffer) {
      await audio.resume();
      const src = audio.createBufferSource();
      src.buffer = hinoBuffer;
      src.connect(audio.destination);
      src.start();
      hinoTocando = src;
      return true;
    }
    const el = new Audio('./hino-nacional.mp3');
    await el.play();
    hinoTocando = el;
    return true;
  } catch { return false; }
}
function verificarEleito() {
  const def = eleicaoDefinida(estado.nacional.dados);
  if (!def.definido) return;
  let jaTocou = false;
  try { jaTocou = localStorage.getItem(CHAVE_HINO) === '1'; } catch { /* opcional */ }
  if (jaTocou || !alertasLigados) return;
  void tocarHino().then((ok) => {
    if (ok) { try { localStorage.setItem(CHAVE_HINO, '1'); } catch { /* opcional */ } }
  });
}

// ---------- alerta de nova totalização (vibração + som opcional; desligado por padrão) ----------
let alertasLigados = false;
let audio: AudioContext | null = null;
function configurarAlertas() {
  const btn = $<HTMLButtonElement>('btn-alerta');
  const pintar = () => {
    btn.setAttribute('aria-pressed', String(alertasLigados));
    btn.textContent = alertasLigados ? 'Avisos ligados ✓' : 'Avisar novas parciais';
  };
  try { alertasLigados = localStorage.getItem('urna360.alertas') === '1'; } catch { /* opcional */ }
  pintar();
  btn.addEventListener('click', () => {
    alertasLigados = !alertasLigados;
    try { localStorage.setItem('urna360.alertas', alertasLigados ? '1' : '0'); } catch { /* opcional */ }
    if (alertasLigados) {
      try { audio ??= new AudioContext(); void audio.resume(); void carregarHino(); } catch { audio = null; }
      alertar(); // demonstra o aviso
    }
    pintar();
  });
}
function alertar() {
  if (!alertasLigados) return;
  try { navigator.vibrate?.([180, 90, 180]); } catch { /* opcional */ }
  if (!audio) return;
  try {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.35);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.4);
  } catch { /* opcional */ }
}

function configurarTelaAcesa() {
  const btn = $<HTMLButtonElement>('btn-tela');
  const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void>; addEventListener: (ev: string, fn: () => void) => void }> } }).wakeLock;
  if (!btn) return;
  if (!wl) { btn.hidden = true; return; }
  let trava: { release: () => Promise<void>; addEventListener: (ev: string, fn: () => void) => void } | null = null;
  let querAcesa = false;
  const pintarBtn = () => {
    btn.setAttribute('aria-pressed', String(!!trava));
    btn.textContent = trava ? 'Tela acesa ✓' : 'Manter tela acesa';
  };
  const pedir = async () => {
    try {
      trava = await wl.request('screen');
      trava.addEventListener('release', () => { trava = null; pintarBtn(); });
    } catch { trava = null; btn.textContent = 'Tela acesa indisponível'; return; }
    pintarBtn();
  };
  btn.hidden = false;
  btn.addEventListener('click', async () => {
    querAcesa = !trava;
    if (trava) { await trava.release().catch(() => {}); trava = null; pintarBtn(); } else await pedir();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && querAcesa && !trava) void pedir();
  });
}

export type { Entrada };
iniciar();
