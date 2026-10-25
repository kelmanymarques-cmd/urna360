# URNA360

Painel responsivo para acompanhar a apuração do **2º turno presidencial de 25/10/2026** com dados oficiais do TSE. Inclui mapa das 27 UFs, camadas independentes, indicadores e gráficos. O painel só exibe números que o TSE publicou: nada é estimado, previsto ou preenchido.

## Fonte oficial e evidências (consulta em 25/10/2026, ~15h20 de Brasília)

| Item | Valor confirmado | Evidência |
|---|---|---|
| Documentação | [Informações técnicas sobre a divulgação de resultados 2026](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados) | página do TSE |
| Especificação | EA20 (resultado unificado) e EA14 (acompanhamento Brasil) | [PDF EA20](https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/divulgacao-de-resultados/tse-ea20-arquivo-de-resultado-unificado) |
| Ambiente | `https://resultados.tse.jus.br/oficial` | documentação |
| Eleição | **6258** (Eleição Geral Federal, 2º turno, pleito 3221), arquivo `e006258` | documentação + arquivo real |
| Cargo | `c0001` (Presidente) | EA20 |
| Arquivo nacional | `/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json` | **lido**: `ele=6258`, `t=2`, `f=o`, `and=n`, `dv=s`, `dg/hg=24/10/2026 19:19:13`, `ts=499248`, `st=0`, `te=158745502` |
| Candidatos | `n=22` `nmu="FLAVIO BOLSONARO"` (PL); `n=13` `nmu="LULA"` (PT) | arquivo real |
| Acompanhamento | `/oficial/ele2026/6258/dados/br/br-e006258-ab.json` com 28 UFs (27 + `zz` exterior) + `br` | arquivo real (estrutura de chaves) |
| Limites | 100 req/s por IP; excesso → bloqueio de 10 min; muitos 404 → bloqueio; ETag/Last-Modified aceitos | documentação |
| Atualização | sem cadência fixa ("conforme a evolução da totalização") | documentação |

**Como foi lido:** os arquivos foram consultados com uma ferramenta de busca web que resume o conteúdo. Por isso, os valores acima são transcrições. O acesso direto pelo terminal deste ambiente foi bloqueado (proxy 403). Os arquivos reais brutos são baixados e testados pela Action `verificar-tse` (veja abaixo).

### Regras da especificação que afetam o painel
- `dv="n"`: o TSE publica os votos **zerados**. O painel trata esses votos como indisponíveis, nunca como 0%.
- `and`: `n` = não iniciada, `p` = em andamento, `f` = finalizada. **"Totalizada" só aparece com `tf="s"`.**
- Percentual dos candidatos (`pvap`/`pvapn`): base = votos computados para candidatos (`vvc`).
- Brancos (`pvb`) e nulos (`ptvn` = nulos + nulos técnicos): base = total de votos (`tv`).
- Abstenção (`pa`): base = eleitorado das seções já totalizadas.
- Datas: `dd/mm/aaaa` + `hh:mm:ss`. **A especificação não declara fuso.** O painel mostra o texto como publicado e assume Brasília (UTC−3) só para ordenar.
- Arquivo com `f="s"` (simulação) aparece com uma faixa "NÃO são resultados reais" e não colore o mapa.

## Arquitetura (escolha mínima)
```
TSE (resultados.tse.jus.br) → server/proxy.mjs (lista branca, cache 10 s, ETag, coalescência, cache de 404)
        → src/data (fetch com timeout, polling sem sobreposição, backoff, preserva último dado válido)
        → src/core (validação e normalização EA20/EA14, cálculos, liderança)
        → src/ui (painel, mapa SVG, camadas, tabela, gráficos)
```
- Vite + TypeScript sem framework: 37 kB gzip de JS.
- Proxy Node sem dependências. Ele evita depender de CORS e faz um único servidor consultar o TSE por todos os usuários. Também guarda o histórico real (`/api/historico`).
- Mapa: `@svg-maps/brazil` (CC BY 4.0), com 27 UFs. O exterior (`zz`) entra só na tabela e no total nacional.
- Só baixa o arquivo de uma UF quando o EA14 indica nova totalização nela.

## Regras do mapa
- **Liderança nominal:** verde se Flávio Bolsonaro (22) tem mais votos nominais; vermelho se Lula (13) tem mais; cinza-claro em empate. Azul-escuro (neutro) quando não há arquivo, `dv≠s`, nenhuma seção totalizada, os dois candidatos com 0 votos, simulação, ou candidato cujo número **e** nome de urna não batem com os confirmados.
- **Camadas neutras independentes:** urnas totalizadas, brancos, nulos e abstenção, cada uma com escala de faixas fixas e sem verde ou vermelho.
- Opção de texturas (listras e pontos) para quem não distingue cores. Tabela completa como alternativa textual. Navegação por Tab + Enter.

## Comandos
```bash
npm ci
npm run dev          # proxy :8787 + Vite :5173
npm test             # unitários (Vitest)
npm run build        # typecheck + build + verificação anti-fixture do dist/
npm run test:e2e     # Playwright: desktop, celular e tablet, sobre o build de produção
npm start            # produção: serve dist/ e /api em :8080 (PORT configurável)
```
Variáveis: `PORT`, `TSE_ORIGEM`, `CACHE_TTL_MS`, `HISTORICO_ARQUIVO` (servidor); `VITE_TSE_BASE`, `VITE_INTERVALO_SEGUNDOS` (mínimo 15 s, padrão 30 s).

## Testes (resultado real em 25/10/2026)
- **Unitários: 43/43 passando.** Cobrem normalização, campos ausentes/negativos/desconhecidos, percentuais e divisão por zero, `dv=n`, liderança (vitória de cada candidato, empate, neutro), separação de brancos/nulos/abstenção, eleição ou UF divergente, simulação, timeout, falha de rede, HTTP 4xx/5xx, arquivo vazio, JSON inválido, dado repetido, arquivo mais antigo, polling sem duplicidade e proxy (lista branca, coalescência, último dado válido, cache de 404, histórico).
- **Interface: 15/15 passando** (5 cenários × desktop 1366 px, Pixel 7 e tablet 820 px). Cobrem anti-fabricação, aguardando, andamento com cores e neutros, clique e teclado, camadas, tabela com 28 linhas, sem rolagem horizontal, simulação e eleição errada.
- **Anti-fabricação:** fixtures só existem em `tests/fixtures`. `npm run build` falha se o marcador de fixture aparecer em `dist/`. Sem fonte, o build mostra "Dados indisponíveis".
- **Dados reais:** `tests/unit/real.test.ts` roda com os arquivos baixados pela Action `verificar-tse` e é pulado quando eles não existem.

## Pendente / não validado
- Leitura dos arquivos **brutos** reais pelo app (só a Action consegue baixar daqui).
- CORS do TSE para leitura direta pelo navegador (a Action registra os cabeçalhos).
- Assinaturas JWS dos arquivos (manual do TSE) ainda não são verificadas.
- Comportamento real durante a apuração (17h em diante): comparar amostras com o portal do TSE.
- Fuso dos horários não declarado na especificação.

## Deploy
- **Com servidor (recomendado):** qualquer host Node 20+ (Render, Railway, Fly, VPS): `npm ci && npm run build && npm start`, atrás de HTTPS. O servidor já envia CSP e outros cabeçalhos de segurança.
- **GitHub Pages (estático):** workflow `pages.yml`. O navegador lê direto do TSE, o que exige CORS. Sem CORS, use o espelho (`scripts/espelhar.mjs`) e aponte `VITE_TSE_BASE` para ele.
- Rollback: reimplantar o commit anterior; o app não guarda estado fora do histórico opcional.
