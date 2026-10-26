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

## Endereços oficiais adicionais (conferidos em 25/10/2026)
- 1º turno (final): eleição **6257**, `/oficial/ele2026/6257/dados/<uf>/<uf>-c0001-e006257-u.json`, com `tf="s"`. É usado na comparação e na análise.
- Municípios: configuração `/oficial/ele2026/6258/config/mun-e006258-cm.json` (EA12) e resultado `/oficial/ele2026/6258/dados/<uf>/<uf><cd>-c0001-e006258-u.json`.
- **Comportamento real observado às 21:11:** o TSE publicou `md="e"` (resultado matematicamente definido) com `cand.e="n"` para os dois candidatos. O painel só nomeia o eleito nesse caso se a vantagem oficial for maior que os eleitores das seções não totalizadas (`esnt`).

## Funcionalidades
- **Brasil:** status oficial, % de seções, candidatos (foto, vice, votos em milhões), diferença, eleitores que faltam, ritmo e estimativa de término (rotulada), brancos, nulos e abstenção com barras, 1º turno, "Conta da vitória" (garantia matemática e cenário rotulado).
- **Mapa:** liderança com tons pela vantagem; % apurado colorido em cada UF; camadas neutras (totalização, brancos, nulos, abstenção) com valores; seleção por toque, lista agrupada por região, Esc, ×; texturas para daltonismo; tela cheia; UF pisca ao receber dados novos; tabela textual.
- **UF:** detalhes, 1º turno e busca de município.
- **Regiões:** soma dos votos oficiais das UFs.
- **Gráficos:** progresso por UF; evolução desde a coleta automática (horário ou % de urnas, com marcação das viradas).
- **1º × 2º turno:** cartões, base selecionável e tabela ordenável com mudança de liderança.
- **Análise 1º → 2º turno:** de onde vieram os votos a mais, divisão do saldo, região, UF e destaques gerados dos números, com limites explícitos.
- **Avisos:** virada, nova parcial (vibração ou bip), eleito pelo TSE com selo, parabéns e Hino Nacional (o mesmo para qualquer eleito; gravação de domínio público).
- **Compartilhar:** imagem PNG 1080×1350 (ou prévia para salvar).
- **Outros:** tema claro, manifesto e ícones para a tela inicial, botão "manter tela acesa".

## Arquitetura
```
TSE ──► navegador (consulta a cada 10 s, ETag, timeout, backoff, guarda o último dado válido)
         └─ src/core (validação EA20/EA14, cálculos, análise) ─ src/ui (painel, mapa, gráficos, imagem)
Opcional: server/proxy.mjs (lista branca, cache, histórico) para hospedagem com Node.
```
- **Publicação atual:** ramo `site`, servido por raw.githack.com. O `index.html` desse ramo é um **carregador**: ele busca o commit mais recente do ramo pela API do GitHub e carrega o `app.html` e os arquivos daquele commit pelo jsDelivr, que tem endereço imutável. Assim evita o cache velho do githack. Publicar: `scripts/publicar-site.sh <clone-do-ramo-site> "mensagem"`.
- **Ramo `historico`:** `historico.json` com cada totalização oficial do arquivo nacional, gravada pela Action `historico`.
- **Ramo `verificacao`:** evidências das Actions (arquivos reais, cabeçalhos, capturas de tela).

## Actions
| Workflow | Quando | Para quê |
|---|---|---|
| `ci` | push/PR | typecheck, unitários, build com checagem anti-fixture e E2E (desktop/celular/tablet); salva o relatório no ramo `verificacao` se falhar |
| `verificar-tse` | push em `src/core` e manual | baixa arquivos reais, testa o normalizador, CORS e fotos |
| `verificar-site` | manual (URL) | abre o site publicado num Chromium de celular e salva capturas |
| `historico` | manual | grava a evolução oficial (até ~6 h) |
| `analise-real` | manual | calcula a análise 1º → 2º turno com os 56 arquivos oficiais |
| `campos-tse`, `sondar-tse`, `buscar-hino`, `conferir-publicacao`, `capturar-referencia` | manual | conferências pontuais |
| `monitor` | **desativado** a pedido | testes a cada 10 min |
| `pages` | manual | só depois de ativar o GitHub Pages em Settings → Pages |

## Comandos
```bash
npm ci
npm run dev          # proxy :8787 + Vite :5173
npm test             # unitários (Vitest)
npm run build        # typecheck + build + verificação anti-fixture do dist/
npm run test:e2e     # Playwright sobre o build de produção (rede externa bloqueada nos testes)
npm start            # produção com Node: serve dist/ e /api em :8080
```

## Testes (25/10/2026, 21h45)
- **Unitários: 73 passando** (+4 que só rodam com arquivos reais nas Actions).
- **E2E: 57 passando** (19 cenários × desktop, celular e tablet), herméticos, sem rede externa.
- **Com dados reais (Actions):** `verificar-tse`, `analise-real` e `verificar-site` passaram.

## Pendente
- Assinaturas JWS dos arquivos não são verificadas.
- Comparação com 2022, 2018 e 2014 (endereços históricos a conferir).
- GitHub Pages (link mais limpo) depende de ativação manual.
- Fotos na imagem compartilhada: o TSE não libera uso em canvas; aparecem as iniciais.

## Link publicado
https://raw.githack.com/kelmanymarques-cmd/urna360/site/index.html
