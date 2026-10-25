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
| Fotos | `/oficial/ele2026/6258/fotos/br/<sqcand>.jpeg` → HTTP 200 `image/jpeg` para 280002551544 e 280002542548 | Action `verificar-tse` (`fotos.txt` no ramo `verificacao`) |
| Acompanhamento | `/oficial/ele2026/6258/dados/br/br-e006258-ab.json` com 28 UFs (27 + `zz` exterior) + `br` | arquivo real (estrutura de chaves) |
| Limites | 100 req/s por IP; excesso → bloqueio de 10 min; muitos 404 → bloqueio; ETag/Last-Modified aceitos | documentação |
| Atualização | sem cadência fixa ("conforme a evolução da totalização") | documentação |

**Verificação com arquivos brutos (25/10/2026 18:48 UTC = 15:48 Brasília), pela Action `verificar-tse`:** os arquivos `br-c0001-e006258-u.json`, `br-e006258-ab.json` e `pe-c0001-e006258-u.json` foram baixados do TSE e normalizados pelo código do app **sem nenhum aviso de campo desconhecido**. Resultado: candidatos 22 e 13 confirmados, status "aguardando", 0 de 499.248 seções e 28 abrangências no EA14 (27 UFs + `zz`). As evidências (arquivos + cabeçalhos HTTP) ficam no ramo `verificacao`.

**Cabeçalhos HTTP reais:** `cache-control: max-age=42`, `etag`, `last-modified`, `x-ratelimit-limit: 5000`. **CORS:** `access-control-allow-origin` devolve a origem pedida (`https://kelmanymarques-cmd.github.io`) com `vary: Origin`. Ou seja, o navegador pode ler os arquivos direto do TSE, e a versão estática no GitHub Pages funciona sem proxy.

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
- **Dados reais: 3/3 passando** (`tests/unit/real.test.ts`, executado na Action `verificar-tse` com arquivos baixados do TSE em 25/10/2026 15:48). Localmente, sem os arquivos, os testes são pulados.

## Pendente / não validado
- Assinaturas JWS dos arquivos (manual do TSE) ainda não são verificadas.
- Comportamento real durante a apuração (17h em diante): comparar amostras com o portal do TSE.
- Fuso dos horários não declarado na especificação.

## Link publicado (celular)
Build estático no ramo `site`, servido por githack (o Pages não pôde ser ativado por esta sessão):
https://rawcdn.githack.com/kelmanymarques-cmd/urna360/5885a93569ff9aafc18557fc5f371f0f058ab9eb/index.html
Verificado pela Action `verificar-site` (Chromium/Pixel 7): 27 UFs, 32 respostas HTTP 200 do TSE, fotos e vices carregados.

## Deploy
- **Com servidor (recomendado):** qualquer host Node 20+ (Render, Railway, Fly, VPS): `npm ci && npm run build && npm start`, atrás de HTTPS. O servidor já envia CSP e outros cabeçalhos de segurança.
- **GitHub Pages (estático):** workflow `pages.yml`. O navegador lê direto do TSE, o que exige CORS. Sem CORS, use o espelho (`scripts/espelhar.mjs`) e aponte `VITE_TSE_BASE` para ele.
- Rollback: reimplantar o commit anterior; o app não guarda estado fora do histórico opcional.
