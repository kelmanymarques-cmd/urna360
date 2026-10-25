// Captura uma página pública (celular e desktop) para análise. Uso: node scripts/capturar.mjs URL
import { chromium, devices } from 'playwright';
const url = process.argv[2];
const b = await chromium.launch();
for (const [nome, ctxOpts] of [['celular', devices['Pixel 7']], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
  const p = await b.newPage(ctxOpts);
  await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  await p.screenshot({ path: `ref-${nome}.png`, fullPage: true }).catch(() => {});
  if (nome === 'desktop') {
    const txt = await p.evaluate(() => document.body.innerText.slice(0, 6000));
    const abas = await p.evaluate(() => [...document.querySelectorAll('a,button')].map((e) => e.textContent.trim()).filter(Boolean).slice(0, 80));
    (await import('node:fs')).writeFileSync('ref-texto.txt', txt + '\n\n--- controles ---\n' + abas.join(' | '));
    for (const aba of ['Mapas e Análises', 'Progressão']) {
      const l = p.getByText(aba, { exact: true }).first();
      if (await l.count()) { await l.click().catch(() => {}); await p.waitForTimeout(4000); await p.screenshot({ path: `ref-${aba.split(' ')[0].toLowerCase()}.png`, fullPage: true }).catch(() => {}); }
    }
  }
  await p.close();
}
await b.close();
