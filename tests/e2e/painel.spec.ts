import { expect, test, type Page } from '@playwright/test';
import { ea14, ea20, type OpcoesEA20 } from '../fixtures/ea20';

const UFS = ['ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt', 'pa', 'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to'];

/** Intercepta /api/tse com fixtures (somente nos testes). */
async function fonte(page: Page, porUF: (uf: string) => OpcoesEA20 | null, nacional: OpcoesEA20, ab?: object) {
  await page.route('**/api/tse/**', async (route) => {
    const url = route.request().url();
    if (url.includes('-ab.json')) {
      return route.fulfill({ json: ab ?? ea14(UFS.map((u) => ({ abr: u, st: porUF(u)?.st ?? 0, ts: 1000 }))) });
    }
    if (url.includes('/config/mun-')) {
      return route.fulfill({ json: { dg: '25/10/2026', hg: '18:00:00', idg: '1', f: 'o', abr: [
        { cd: 'PE', ds: 'PERNAMBUCO', mu: [{ cd: '25313', cdi: '2611606', nm: 'RECIFE', c: 's', z: [] }, { cd: '24376', cdi: '2604106', nm: 'CARUARU', c: 'n', z: [] }] },
      ] } });
    }
    const mun = /dados\/([a-z]{2})\/[a-z]{2}(\d{5})-c0001/.exec(url);
    if (mun) return route.fulfill({ json: ea20({ abr: mun[2], st: 50, ts: 100, flavio: 300, lula: 700 }) });
    if (url.includes('e006257')) {
      const a = /dados\/([a-z]{2})\//.exec(url)?.[1] ?? 'br';
      return route.fulfill({ json: ea20({ abr: a, ele: 6257, t: 1, st: 1000, ts: 1000, flavio: 4703, lula: 4516, tf: 's', and: 'f' }) });
    }
    const m = /dados\/([a-z]{2})\//.exec(url);
    const abr = m?.[1] ?? 'br';
    if (abr === 'br') return route.fulfill({ json: ea20({ abr: 'br', ...nacional }) });
    const o = porUF(abr);
    if (!o) return route.fulfill({ status: 404, body: 'não encontrado' });
    return route.fulfill({ json: ea20({ abr, ...o }) });
  });
}

// Testes herméticos: nenhuma chamada real ao TSE ou ao histórico do GitHub (no CI há internet).
// Rotas registradas depois, dentro de cada teste, têm prioridade sobre esta.
test.beforeEach(async ({ page }) => {
  await page.route(/resultados\.tse\.jus\.br|raw\.githubusercontent\.com|cdn\.jsdelivr\.net|api\.github\.com/, (r) => r.abort());
});

async function semRolagemHorizontal(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw + 1);
}

test('anti-fabricação: sem fonte, o build de produção não mostra nenhum resultado', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('nacional-indisponivel')).toBeVisible();
  await expect(page.getByTestId('status')).toHaveText('Dados indisponíveis');
  await expect(page.getByTestId('aviso-erro')).toBeVisible();
  expect(await page.locator('#mapa path[data-uf]').count()).toBe(27);
  const estados = await page.locator('#mapa path[data-uf]').evaluateAll((ps) => ps.map((p) => p.getAttribute('data-estado')));
  expect(new Set(estados)).toEqual(new Set(['neutro']));
  await expect(page.locator('body')).not.toContainText('FIXTURE');
  await semRolagemHorizontal(page);
});

test('aguardando: arquivo oficial sem seções totalizadas não vira 0%', async ({ page }, info) => {
  await fonte(page, () => ({ st: 0 }), { st: 0 });
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveText('Aguardando dados oficiais');
  await expect(page.getByTestId('pct-22')).toHaveText('—');
  await expect(page.getByTestId('pct-13')).toHaveText('—');
  await expect(page.getByTestId('ind-brancos')).toContainText('—');
  await expect(page.getByTestId('vantagem')).toHaveCount(0);
  await page.screenshot({ path: `test-results/aguardando-${info.project.name}.png`, fullPage: true });
});

test('em andamento: cores por liderança, neutro sem dados, detalhes e camadas', async ({ page }, info) => {
  const porUF = (uf: string): OpcoesEA20 | null => {
    if (uf === 'ac') return null; // arquivo indisponível → neutro
    if (uf === 'ba') return { st: 400, flavio: 500, lula: 500, vb: 10, vn: 20, c: 900, a: 100 }; // empate
    if (uf === 'am') return { st: 0 }; // ainda sem totalização → neutro
    const lulaNa = ['pe', 'ce', 'pi', 'ma', 'pb', 'rn', 'se', 'al'].includes(uf);
    return lulaNa
      ? { st: 600, flavio: 300, lula: 700, vb: 15, vn: 30, vnt: 2, c: 1000, a: 250 }
      : { st: 550, flavio: 650, lula: 350, vb: 25, vn: 40, vnt: 1, c: 1100, a: 180 };
  };
  await fonte(page, porUF, { st: 4321, ts: 10000, flavio: 52000, lula: 48000, vb: 1200, vn: 2400, vnt: 50, c: 103650, a: 21000, te: 150000 });
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveText('Apuração em andamento (parcial)');
  await expect(page.getByTestId('pct-totalizadas')).toHaveText('43,21%');
  await expect(page.getByTestId('pct-22')).toHaveText('52,00%');
  await expect(page.getByTestId('pct-13')).toHaveText('48,00%');
  await expect(page.getByTestId('vantagem')).toContainText('Flávio Bolsonaro tem 4.000 votos a mais');
  await expect(page.getByTestId('vice-22')).toHaveText('Vice: VICE');
  // sem acesso à foto, os dois cartões mostram iniciais (mesmo tratamento)
  await expect.poll(() => page.locator('.foto img').count()).toBe(0);
  expect(await page.locator('.foto').evaluateAll((els) => els.map((e) => e.getAttribute('data-iniciais')))).toEqual(['L', 'FB']);

  const estado = (uf: string) => page.locator(`#uf-${uf}`).getAttribute('data-estado');
  await expect.poll(() => estado('pe')).toBe('lula');
  expect(await estado('sp')).toBe('flavio');
  expect(await estado('ba')).toBe('empate');
  expect(await estado('ac')).toBe('neutro');
  expect(await estado('am')).toBe('neutro');
  expect(await page.locator('#uf-pe').getAttribute('fill')).toBe('#D93A3A');
  expect(await page.locator('#uf-sp').getAttribute('fill')).toBe('#1FA35B');

  // toque/clique
  await page.locator('#uf-pe').click();
  await expect(page.getByTestId('detalhe-uf')).toContainText('Pernambuco');
  await expect(page.getByTestId('detalhe-uf')).toContainText('70,00%');
  await expect(page.getByTestId('vantagem-uf')).toContainText('Lula tem 400 votos a mais');
  // teclado
  await page.locator('#uf-sp').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('detalhe-uf')).toContainText('São Paulo');
  // desmarcar: tocar de novo na mesma UF
  await page.locator('#uf-sp').click();
  await expect(page.getByTestId('detalhe-uf')).toHaveCount(0);
  expect(await page.locator('#mapa path.sel').count()).toBe(0);
  // desmarcar: botão fechar
  await page.locator('#uf-sp').click();
  await page.getByRole('button', { name: 'Fechar detalhes de São Paulo' }).click();
  await expect(page.getByTestId('detalhe-uf')).toHaveCount(0);
  // desmarcar: tecla Esc
  await page.locator('#uf-pe').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('detalhe-uf')).toHaveCount(0);
  await page.locator('#uf-pe').click();
  await expect(page.getByTestId('detalhe-uf')).toContainText('Pernambuco');

  // camadas neutras independentes
  await page.getByRole('radio', { name: 'Votos brancos' }).click();
  await expect(page.locator('#legenda')).toContainText('% do total de votos da UF');
  expect(await page.locator('#uf-pe').getAttribute('fill')).not.toMatch(/#D93A3A|#1FA35B/);
  expect(await page.locator('#uf-ac').getAttribute('fill')).toBe('#24314F');
  await page.getByRole('radio', { name: 'Abstenção' }).click();
  await expect(page.locator('#legenda')).toContainText('eleitorado das seções já totalizadas');
  await page.getByRole('radio', { name: 'Liderança nominal' }).click();

  // alternativa textual
  await page.getByRole('button', { name: 'Ver dados em tabela' }).click();
  await expect(page.getByTestId('tabela').locator('tbody tr')).toHaveCount(28);
  await expect(page.getByTestId('tabela')).toContainText('Exterior');

  await semRolagemHorizontal(page);
  await page.getByRole('button', { name: 'Ocultar tabela' }).click();
  await page.screenshot({ path: `test-results/andamento-${info.project.name}.png`, fullPage: true });
});

test('resumo fixo, título da aba, avisos e evolução local', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('urna360.historico.6258', JSON.stringify([
      { registradoEm: 'x', totalizadoEm: '25/10/2026 19:10:00', pctTotalizadas: 5, percentuais: { '13': 55, '22': 45 } },
      { registradoEm: 'y', totalizadoEm: '25/10/2026 19:20:00', pctTotalizadas: 20, percentuais: { '13': 52, '22': 48 } },
    ]));
  });
  await fonte(page, () => ({ st: 10, flavio: 1, lula: 3 }), { st: 2500, ts: 10000, flavio: 40, lula: 60 });
  await page.goto('/');
  await expect(page.getByTestId('resumo-fixo')).toContainText('25,00% apurado');
  await expect(page.getByTestId('resumo-fixo')).toContainText('Lula 60,00%');
  await expect(page).toHaveTitle('25,00% apurado · URNA360');
  await expect(page.locator('#g-evolucao svg polyline')).toHaveCount(2);
  await expect(page.locator('#g-evolucao figcaption')).toContainText('este aparelho');
  await page.getByRole('button', { name: 'Avisar novas parciais' }).click();
  await expect(page.locator('#btn-alerta')).toHaveAttribute('aria-pressed', 'true');
  // o resumo continua visível depois de rolar até o mapa
  await page.locator('#t-graficos').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('resumo-fixo')).toBeInViewport();
  await page.screenshot({ path: `test-results/resumo-rolado-${test.info().project.name}.png` });
  await semRolagemHorizontal(page);
});

for (const [n, nome] of [[22, 'Flávio Bolsonaro'], [13, 'Lula']] as const) {
  test(`aviso de eleito pelo TSE com o mesmo hino — ${nome}`, async ({ page }) => {
    await fonte(page, () => ({ st: 10, flavio: 1, lula: 1 }), { st: 9000, ts: 10000, flavio: 500, lula: 500, md: 'e', eleito: n });
    await page.goto('/');
    await expect(page.getByTestId('aviso-eleito')).toContainText(`TSE: ${nome} eleito`);
    await expect(page.getByTestId('aviso-eleito')).toContainText('matematicamente definido');
    await expect(page.getByTestId('aviso-eleito').getByRole('button')).toHaveText('▶ Tocar o Hino Nacional');
    await expect(page.getByTestId('aviso-eleito')).toContainText(`Parabéns, ${nome}!`);
    await expect(page.getByTestId(`cand-${n}`).getByTestId('selo-eleito')).toContainText('Eleito · TSE');
    await expect(page.getByTestId(`cand-${n === 22 ? 13 : 22}`).getByTestId('selo-eleito')).toHaveCount(0);
    await expect(page.getByTestId('toast-eleito')).toContainText(`Parabéns, ${nome}!`);
    const r = await page.request.get('/hino-nacional.mp3');
    expect(r.status()).toBe(200);
    await page.getByTestId('aviso-eleito').getByRole('button').click();
    await expect(page.getByTestId('aviso-eleito').getByRole('button')).toHaveText('■ Parar o hino');
  });
}

for (const [antes, n, nome, outro] of [['flavio', 13, 'Lula', 'Flávio Bolsonaro'], ['lula', 22, 'Flávio Bolsonaro', 'Lula']] as const) {
  test(`notifica virada na liderança — ${nome} passa ${outro}`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem('urna360.lider.6258', l), antes);
    const v = n === 22 ? { flavio: 600, lula: 400 } : { flavio: 400, lula: 600 };
    await fonte(page, () => ({ st: 10, flavio: 1, lula: 1 }), { st: 3000, ts: 10000, ...v });
    await page.goto('/');
    await expect(page.getByTestId('toast-virada')).toContainText(`${nome} ultrapassou ${outro}`);
    await expect(page.getByTestId('toast-virada')).toContainText('Diferença: 200 votos');
  });
}

test('sem virada não há notificação', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('urna360.lider.6258', 'lula'));
  await fonte(page, () => ({ st: 10, flavio: 1, lula: 1 }), { st: 3000, ts: 10000, flavio: 400, lula: 600 });
  await page.goto('/');
  await expect(page.getByTestId('pct-13')).toHaveText('60,00%');
  await expect(page.getByTestId('toast-virada')).toHaveCount(0);
});

test('sem indicação do TSE não há aviso de eleito', async ({ page }) => {
  await fonte(page, () => ({ st: 10, flavio: 1, lula: 1 }), { st: 9000, ts: 10000, flavio: 900, lula: 100 });
  await page.goto('/');
  await expect(page.getByTestId('pct-22')).toHaveText('90,00%');
  await expect(page.getByTestId('aviso-eleito')).toHaveCount(0);
  await expect(page.getByTestId('selo-eleito')).toHaveCount(0);
});

test('seletor de UF, 1º turno, município, quanto falta, compartilhar e tema', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.addInitScript(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });
  await fonte(page, () => ({ st: 10, ts: 100, flavio: 4, lula: 6 }), { st: 2500, ts: 10000, flavio: 40, lula: 60 });
  await page.goto('/');
  await expect(page.getByTestId('falta')).toContainText('Faltam 7.500 seções');
  await expect(page.getByTestId('nacional-1t')).toContainText('1º turno (TSE, final): Flávio Bolsonaro 51,01% · Lula 48,99%');
  // escolher UF pela lista
  await page.locator('#sel-uf').selectOption('pe');
  await expect(page.getByTestId('detalhe-uf')).toContainText('Pernambuco');
  await expect(page.locator('#uf-pe')).toHaveClass(/sel/);
  await expect(page.getByTestId('uf-1t')).toContainText('1º turno (TSE, final)');
  // município
  await page.locator('#busca-mun').focus();
  await page.locator('#busca-mun').fill('caruaru');
  await page.locator('#busca-mun').press('Enter');
  await page.locator('#busca-mun').dispatchEvent('change');
  await expect(page.getByTestId('mun-nome')).toHaveText('CARUARU');
  await expect(page.locator('#mun-res')).toContainText('Lula tem 400 votos a mais');
  // a busca sobrevive à atualização do painel (não é recriada)
  await page.locator('#sel-uf').selectOption('');
  await expect(page.getByTestId('detalhe-uf')).toHaveCount(0);
  await expect(page.locator('#detalhe-extra')).toBeEmpty();
  // tema
  await page.getByRole('button', { name: 'Tema claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'claro');
  await page.getByRole('button', { name: 'Tema escuro' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-tema', 'claro');
  await semRolagemHorizontal(page);
});

test('compartilhar gera imagem PNG da parcial', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __share?: ShareData };
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: (d: ShareData) => { w.__share = d; return Promise.resolve(); }, configurable: true });
  });
  await fonte(page, (u) => (u === 'pe' ? { st: 10, flavio: 1, lula: 3 } : { st: 10, flavio: 3, lula: 1 }), { st: 2500, ts: 10000, flavio: 40, lula: 60 });
  await page.goto('/');
  await expect(page.getByTestId('pct-13')).toHaveText('60,00%');
  await page.getByRole('button', { name: 'Compartilhar parcial' }).click();
  await expect(page.locator('#btn-compartilhar')).toHaveText('Compartilhado ✓');
  const info = await page.evaluate(async () => {
    const d = (window as unknown as { __share: ShareData }).__share;
    const f = d.files![0]!;
    const bmp = await createImageBitmap(f);
    return { tipo: f.type, tam: f.size, w: bmp.width, h: bmp.height, texto: d.text };
  });
  expect(info).toMatchObject({ tipo: 'image/png', w: 1080, h: 1350 });
  expect(info.tam).toBeGreaterThan(20_000);
  expect(info.texto).toContain('Fonte: TSE');
});

test('sem compartilhamento de arquivo, mostra a imagem para salvar', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true }); });
  await fonte(page, () => ({ st: 10, flavio: 1, lula: 3 }), { st: 2500, ts: 10000, flavio: 40, lula: 60 });
  await page.goto('/');
  await expect(page.getByTestId('pct-13')).toHaveText('60,00%');
  await page.getByRole('button', { name: 'Compartilhar parcial' }).click();
  await expect(page.getByTestId('previa-img')).toBeVisible();
  await page.screenshot({ path: `test-results/previa-${test.info().project.name}.png` });
  const src = await page.getByTestId('previa-img').getAttribute('src');
  const png = await page.evaluate(async (u) => { const b = await (await fetch(u!)).blob(); return { t: b.type, s: b.size }; }, src);
  expect(png.t).toBe('image/png');
  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByTestId('previa-img')).toHaveCount(0);
});

test('evolução desde a coleta, ritmo, viradas, regiões, rótulos no mapa e tela cheia', async ({ page }) => {
  const pts = [
    ['19:00:00', 5, 55, 45], ['19:06:00', 8, 53, 47], ['19:12:00', 12, 50.5, 49.5], ['19:20:00', 18, 49.2, 50.8],
  ].map(([h, pst, l, f]) => ({ registradoEm: 'x', totalizadoEm: `25/10/2026 ${h}`, pctTotalizadas: pst, percentuais: { '13': l, '22': f } }));
  await page.route('**/raw.githubusercontent.com/**', (r) => r.fulfill({ json: pts, headers: { 'access-control-allow-origin': '*' } }));
  await fonte(page, (u) => (['pe', 'ba', 'ce'].includes(u) ? { st: 50, ts: 100, flavio: 30, lula: 70 } : { st: 40, ts: 100, flavio: 60, lula: 40 }), { st: 1800, ts: 10000, flavio: 508, lula: 492 });
  await page.goto('/');
  await expect(page.getByTestId('grafico-evolucao')).toBeVisible();
  await expect(page.getByTestId('grafico-evolucao').locator('polyline')).toHaveCount(2);
  await expect(page.getByTestId('grafico-evolucao')).toContainText('virada 19:20');
  await expect(page.getByTestId('ritmo')).toContainText('+10 p.p.');
  await expect(page.getByTestId('eta')).toContainText('Estimativa pelo ritmo atual');
  await expect(page.locator('.ind .mini')).toHaveCount(2); // brancos e nulos; abstenção sem dado neste cenário fica sem barra
  await page.getByRole('radio', { name: '% de urnas' }).click();
  await expect(page.getByRole('radio', { name: '% de urnas' })).toHaveAttribute('aria-checked', 'true');
  // regiões: Nordeste soma PE+BA+CE (Lula) e demais (Flávio)
  const ne = page.getByTestId('tabela-regioes').locator('tr', { hasText: 'Nordeste' });
  await expect(ne).toContainText('Empate'); // 3 UFs 30x70 + 6 UFs 60x40 = 450 x 450
  await expect(page.getByTestId('tabela-regioes').locator('tr', { hasText: 'Sul' })).toContainText('Flávio Bolsonaro');
  await expect(page.getByTestId('tabela-regioes').locator('tbody tr')).toHaveCount(5);
  // seletor agrupado por região
  await expect(page.locator('#sel-uf optgroup')).toHaveCount(5);
  // rótulo com valor na camada de urnas totalizadas
  await page.getByRole('radio', { name: 'Urnas totalizadas' }).click();
  const rot = page.locator('#mapa [data-rot="pe"] .rot-v');
  if (await rot.count()) await expect(rot).toHaveText('50%');
  await page.getByRole('radio', { name: 'Liderança nominal' }).click();
  if (await rot.count()) { await expect(rot).toHaveText('50%'); await expect(rot).toHaveClass(/av-medio/); }
  // tela cheia (com botão para sair dentro dela)
  await page.getByRole('button', { name: 'Mapa em tela cheia' }).click();
  await expect(page.locator('.mapa-grade')).toHaveClass(/cheia/);
  await page.locator('#btn-sair-cheia').click();
  await expect(page.locator('.mapa-grade')).not.toHaveClass(/cheia/);
});

test('comparação 1º × 2º turno: tabela, mudança de liderança, base e ordenação', async ({ page }) => {
  await fonte(page, (u) => (u === 'pe' ? { st: 60, ts: 100, flavio: 300, lula: 700 } : { st: 40, ts: 100, flavio: 600, lula: 400 }), { st: 4000, ts: 10000, flavio: 520, lula: 480 });
  await page.goto('/');
  await expect(page.getByTestId('pct-22')).toHaveText('52,00%');
  await page.locator('#sec-comparacao').scrollIntoViewIfNeeded();
  const tab = page.getByTestId('tabela-comparacao');
  await expect(tab.locator('tbody tr')).toHaveCount(27);
  await expect(page.getByTestId('cmp-mudaram')).toContainText('Pernambuco (Flávio → Lula)');
  await expect(tab.locator('tr.mudou-lider')).toHaveCount(1);
  // Flávio 1º (só entre os dois) = 4703/(4703+4516) = 51,01%; 2º = 52,00%
  await expect(page.getByTestId('cmp-22')).toContainText('51,01%');
  await expect(page.getByTestId('cmp-22')).toContainText('+1,0 p.p.');
  await page.getByRole('radio', { name: '1º turno com todos os candidatos' }).click();
  await expect(page.locator('#comparacao')).toContainText('Não é diretamente comparável');
  await page.getByRole('button', { name: /^UF/ }).click();
  await expect(tab.locator('tbody tr').first()).toContainText('Acre');
  await semRolagemHorizontal(page);
  // layout: cartões e tabela ocupam a largura toda (uma coluna no celular)
  const larg = await page.evaluate(() => {
    const c = document.getElementById('comparacao')!.getBoundingClientRect().width;
    const t = document.querySelector('#comparacao .tabela-caixa')!.getBoundingClientRect().width;
    return { c, t };
  });
  expect(larg.t).toBeGreaterThan(larg.c * 0.95);
  await page.locator('#sec-comparacao').screenshot({ path: `test-results/comparacao-${test.info().project.name}.png` });
  // análise 1º → 2º turno
  await page.locator('#sec-analise').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('analise-destaques')).toContainText('A diferença entre os dois mudou');
  await expect(page.getByTestId('tabela-analise').locator('tbody tr')).toHaveCount(27);
  await expect(page.getByTestId('analise-destaques')).toContainText('Pernambuco');
  await page.locator('#sec-analise').screenshot({ path: `test-results/analise-${test.info().project.name}.png` });
});

test('conta da vitória: falta para garantir e cenário', async ({ page }) => {
  await page.route('**/api/tse/**', async (route) => {
    const url = route.request().url();
    if (url.includes('-ab.json')) return route.fulfill({ json: ea14([]) });
    const m = /dados\/([a-z]{2})\//.exec(url)?.[1] ?? 'br';
    const raw = ea20({ abr: m, st: 50, ts: 100, flavio: 600, lula: 400 }) as Record<string, any>;
    raw.e.esnt = '1000'; raw.e.est = '1250';
    return route.fulfill({ json: raw });
  });
  await page.goto('/');
  await expect(page.getByTestId('cv-falta')).toContainText('faltam 801 votos de vantagem');
  await expect(page.getByTestId('cv-cenario')).toContainText('62,5%');
});

test('telas largas: conteúdo usa a largura e as tabelas não precisam de rolagem lateral', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'só desktop');
  await page.setViewportSize({ width: 1920, height: 1000 });
  await fonte(page, (u) => (u === 'pe' ? { st: 60, ts: 100, flavio: 300, lula: 700 } : { st: 40, ts: 100, flavio: 600, lula: 400 }), { st: 4000, ts: 10000, flavio: 520, lula: 480 });
  await page.goto('/');
  await expect(page.getByTestId('pct-22')).toHaveText('52,00%');
  const largura = await page.evaluate(() => document.querySelector('main')!.getBoundingClientRect().width);
  expect(largura).toBeGreaterThan(1700);
  await page.locator('#sec-analise').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('tabela-analise').locator('tbody tr')).toHaveCount(27);
  const rolam = await page.evaluate(() => [...document.querySelectorAll('.tabela-caixa')]
    .filter((c) => (c as HTMLElement).offsetParent !== null && c.scrollWidth > c.clientWidth + 1).map((c) => c.querySelector('table')?.dataset.testid));
  expect(rolam).toEqual([]);
});

test('avisa quando o TSE está há mais de 15 min sem nova totalização', async ({ page }) => {
  await fonte(page, () => ({ st: 10, flavio: 1, lula: 2 }), { st: 10, flavio: 1, lula: 2, dt: '25/10/2026', ht: '17:06:27' });
  await page.goto('/');
  await expect(page.getByTestId('aviso-sem-totalizacao')).toContainText('desde 17:06');
  await expect(page.getByTestId('pct-13')).toHaveText('66,67%');
});

test('arquivo de simulação do TSE é sinalizado e não colore o mapa', async ({ page }) => {
  await fonte(page, () => ({ f: 's', st: 10, flavio: 9, lula: 1 }), { f: 's', st: 10, flavio: 9, lula: 1 }, ea14([], { f: 's' }));
  await page.goto('/');
  await expect(page.getByTestId('aviso-simulado')).toBeVisible();
  await expect.poll(() => page.locator('#uf-sp').getAttribute('data-estado')).toBe('neutro');
});

test('arquivo de outra eleição é recusado', async ({ page }) => {
  await fonte(page, () => ({ ele: 6257, st: 10, flavio: 9, lula: 1 }), { ele: 6257, st: 10, flavio: 9, lula: 1 }, ea14([], { ele: 6257 }));
  await page.goto('/');
  await expect(page.getByTestId('nacional-indisponivel')).toBeVisible();
  await expect(page.getByTestId('aviso-erro')).toContainText('não corresponde ao pleito');
});
