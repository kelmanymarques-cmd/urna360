// Gera as capturas usadas no README a partir do site publicado (dados reais). Uso: node scripts/capturas-readme.mjs URL
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const url = process.argv[2];
mkdirSync('capturas', { recursive: true });
const log = [];
const passo = async (nome, fn) => { try { await fn(); log.push(`ok ${nome}`); } catch (e) { log.push(`FALHOU ${nome}: ${String(e).slice(0, 300)}`); } };
const b = await chromium.launch();
async function abrir(opts) {
  const p = await b.newPage(opts);
  await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  const abrirPg = p.getByText('Open the page');
  if (await abrirPg.count()) { await abrirPg.first().click(); await p.waitForLoadState('networkidle'); }
  await p.waitForSelector('[data-testid="status"]', { timeout: 30000 });
  await p.waitForTimeout(6000);
  await p.addStyleTag({ content: '#resumo-fixo,#toasts,.dica{display:none!important}*{animation:none!important;transition:none!important}' });
  return p;
}
let cel, desk;
await passo('abrir celular', async () => { cel = await abrir({ ...devices['Pixel 7'] }); });
await passo('painel celular', () => cel.screenshot({ path: 'capturas/painel-celular.png' }));
await passo('imagem compartilhada', async () => {
  await cel.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true }));
  await cel.locator('#btn-compartilhar').click();
  const img = cel.locator('#previa-imagem img');
  await img.waitFor({ timeout: 20000 });
  const dataUrl = await img.evaluate(async (el) => { const bl = await (await fetch(el.src)).blob(); return await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(bl); }); });
  writeFileSync('capturas/imagem-compartilhada.png', Buffer.from(String(dataUrl).split(',')[1], 'base64'));
});
await passo('abrir desktop', async () => { desk = await abrir({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }); });
await passo('mapa', () => desk.locator('.mapa-grade').screenshot({ path: 'capturas/mapa.png' }));
await passo('nacional', () => desk.locator('#painel-nacional').screenshot({ path: 'capturas/nacional.png' }));
await passo('evolucao', () => desk.locator('#g-evolucao').screenshot({ path: 'capturas/evolucao.png' }));
await passo('comparacao', async () => {
  await desk.locator('#sec-comparacao').scrollIntoViewIfNeeded();
  await desk.locator('[data-testid="tabela-comparacao"] tbody tr').nth(26).waitFor({ timeout: 30000 });
  await desk.locator('.cmp-cards').screenshot({ path: 'capturas/comparacao.png' });
});
await passo('analise', async () => {
  await desk.locator('#sec-analise').scrollIntoViewIfNeeded();
  await desk.locator('[data-testid="analise-destaques"]').waitFor({ timeout: 30000 });
  await desk.waitForTimeout(1500);
  await desk.locator('#analise .an-grade').screenshot({ path: 'capturas/analise.png' });
});
writeFileSync('capturas/log.txt', log.join('\n'));
console.log(log.join('\n'));
await b.close();
