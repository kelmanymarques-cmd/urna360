// Abre o site publicado num Chromium real e confirma que ele lê o TSE (uso: node scripts/verificar-site.mjs URL)
import { chromium, devices } from 'playwright';
const url = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ ...devices['Pixel 7'] });
const reqs = [];
p.on('response', (r) => { if (r.url().includes('tse.jus.br')) reqs.push(`${r.status()} ${r.url()}`); });
p.on('console', (m) => console.log('console:', m.text()));
await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
const abrir = p.getByText('Open the page');
if (await abrir.count()) { console.log('interstício do githack: clicando em "Open the page"'); await abrir.first().click(); await p.waitForLoadState('networkidle'); }
await p.waitForTimeout(10000);
const status = await p.locator('[data-testid=status]').textContent().catch(() => null);
const ufs = await p.locator('#mapa path[data-uf]').count();
const versaoNova = await p.locator('#sel-uf').count();
const falhas = [];
p.on('requestfailed', (r) => falhas.push(r.url()));
const scripts = await p.evaluate(() => [...document.scripts].map((s) => s.src).filter(Boolean));
console.log(JSON.stringify({ url, status, ufs, versaoNova: versaoNova > 0, scripts, respostasTSE: reqs.length, amostra: reqs.slice(0, 4) }, null, 1));
await p.screenshot({ path: 'site-celular.png', fullPage: false });
await p.locator('#g-evolucao').screenshot({ path: 'site-evolucao.png' }).catch(() => {});
await p.locator('#regioes').screenshot({ path: 'site-regioes.png' }).catch(() => {});
await p.locator('.mapa-grade').screenshot({ path: 'site-mapa.png' }).catch(() => {});
await p.locator('#painel-nacional').screenshot({ path: 'site-nacional.png' }).catch(() => {});
await p.locator('[data-testid="conta-vitoria"]').screenshot({ path: 'site-conta.png' }).catch(() => {});
console.log('CONTA:', await p.locator('[data-testid="conta-vitoria"]').innerText().catch(() => 'sem cartão'));
await p.locator('#sec-comparacao').scrollIntoViewIfNeeded().catch(() => {});
await p.locator('[data-testid="tabela-comparacao"] tbody tr').nth(26).waitFor({ timeout: 20000 }).catch(() => {});
await p.waitForTimeout(3000);
await p.locator('#sec-comparacao').screenshot({ path: 'site-comparacao.png' }).catch(() => {});
// Gera a imagem de compartilhamento com os dados reais (sem abrir o menu do sistema).
try {
  await p.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true }));
  await p.locator('#btn-compartilhar').click();
  const img = p.locator('#previa-imagem img');
  await img.waitFor({ timeout: 15000 });
  const dataUrl = await img.evaluate(async (el) => {
    const b = await (await fetch(el.src)).blob();
    return await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); });
  });
  const fs = await import('node:fs');
  fs.writeFileSync('parcial-real.png', Buffer.from(String(dataUrl).split(',')[1], 'base64'));
  console.log('imagem de compartilhamento gerada');
} catch (e) { console.log('imagem de compartilhamento: falhou', String(e)); }
await b.close();
if (!status || status.includes('indisponíveis') || ufs !== 27 || reqs.length === 0) process.exit(1);
