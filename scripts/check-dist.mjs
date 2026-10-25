// Anti-fabricação: falha o build se algum dado de teste/fixture entrar no pacote de produção.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
const raiz = path.resolve('dist');
const proibidos = ['FIXTURE_TESTE_URNA360', 'fixtures/', 'resultado-ficticio'];
let falhas = 0;
const andar = (d) => {
  for (const n of readdirSync(d)) {
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) { andar(p); continue; }
    const t = readFileSync(p, 'utf8');
    for (const s of proibidos) if (t.includes(s)) { console.error(`✗ ${p} contém "${s}"`); falhas++; }
  }
};
andar(raiz);
if (falhas) process.exit(1);
console.log('✓ dist/ sem fixtures ou dados de teste');
