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
    const m = /dados\/([a-z]{2})\//.exec(url);
    const abr = m?.[1] ?? 'br';
    if (abr === 'br') return route.fulfill({ json: ea20({ abr: 'br', ...nacional }) });
    const o = porUF(abr);
    if (!o) return route.fulfill({ status: 404, body: 'não encontrado' });
    return route.fulfill({ json: ea20({ abr, ...o }) });
  });
}

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
    const r = await page.request.get('/hino-nacional.mp3');
    expect(r.status()).toBe(200);
    await page.getByTestId('aviso-eleito').getByRole('button').click();
    await expect(page.getByTestId('aviso-eleito').getByRole('button')).toHaveText('■ Parar o hino');
  });
}

test('sem indicação do TSE não há aviso de eleito', async ({ page }) => {
  await fonte(page, () => ({ st: 10, flavio: 1, lula: 1 }), { st: 9000, ts: 10000, flavio: 900, lula: 100 });
  await page.goto('/');
  await expect(page.getByTestId('pct-22')).toHaveText('90,00%');
  await expect(page.getByTestId('aviso-eleito')).toHaveCount(0);
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
