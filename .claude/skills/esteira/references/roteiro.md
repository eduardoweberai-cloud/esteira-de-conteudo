# Roteiro (passo 3): os arquivos de cada reel

Cada reel é uma pasta `lotes/<AAAA-MM-DD>/r<N>-<palavra>/` com:

- `reel.json`: o roteiro que o kit transforma em vídeo (falas, título, cenas e a parte visual);
- `legenda.md`: o texto exato pra colar no post, nada além dele;
- `mundo.mjs` (opcional): a cena 3D que fica atrás de tudo;
- `midia/` (opcional): imagens reais pra cena `midia`.

Exemplo completo e validado: `exemplo/reel.json`, `exemplo/legenda.md` e `exemplo/mundo.mjs`. O kit que lê o `reel.json` é `kit/build.mjs`; o validador é `scripts/validar-roteiro.mjs` (`npm run validar -- <pasta>`).

## Narração (as falas)

- Uma fala por cena, escrita do jeito que a pessoa fala (`voz/perfil-de-voz.md`). Antes de escrever, ler `voz/calibracao.md`: é o que ela mudou nos textos anteriores.
- Gancho nos primeiros 3 s (umas 12 palavras), direto no assunto, sem saudação.
- Até uns 60 s no total (o validador estima a duração e avisa quando passa).
- No máximo 1 "não é só X, é Y" na fala e nenhum na legenda. Nenhum travessão. Nada de frases de 3 palavras empilhadas ("Sozinho. Sem time. Sem verba.").
- Número falado por extenso ("cinco") e o mesmo número em algarismo na tela.
- Fato com fonte aberta no dia: o que não deu pra confirmar sai do roteiro.
- Fecho com isca (quando há algo real pra mandar na DM): as duas últimas cenas são `segue` ("Me segue pra ver mais,") e `comenta` ("e comenta PALAVRA que eu te mando <a isca> na DM."). Se a pessoa juntar os dois num parágrafo só, a cena é uma `comenta` com `"antes": { "tipo": "segue", "ate": "<última palavra do Me segue>" }`: o kit mostra o segue até essa palavra e o comenta no resto.

## `reel.json`

```json
{
  "slug": "r1-kit",
  "titulo": "ESSE REEL SAIU | DE UM *TEXTO*",
  "palavra": "KIT",
  "destaques": ["texto", "roteiro"],
  "dm": { "texto": "Aqui está o *passo a passo* pra montar o seu.", "botao": "abrir o guia" },
  "tema": "neon",
  "cor": "ciano",
  "trilha": { "clima": "passo" },
  "voz_gravada": { "acelerar": 1.15 },
  "mascote": false,
  "ritmo": { "max_vao": 1.4 },
  "mundo": { "arquivo": "mundo.mjs", "marcas": { "acende": [0, "arquivo"] } },
  "cenas": [
    { "tipo": "hook", "fala": "Esse vídeo inteiro saiu de um arquivo de texto.", "dados": {}, "batidas": [] }
  ]
}
```

- `slug`: minúsculas, números e hífen (vira o nome do vídeo).
- `titulo`: título-tese fixo no topo, caixa alta, exatamente 1 palavra em `*itálico*` (ela sai maior e na cor do reel); `|` quebra a linha. Em reel com cena `midia`, título em 2 linhas (a moldura do celular cobre a 3ª).
- `palavra` + `dm`: a isca. Sem `palavra`, o reel é de opinião e fecha só com o `segue`.
- `destaques`: palavras que acendem na cor do reel na legenda do vídeo (a `palavra` já acende sozinha).
- `tema`: `neon` (padrão, quase preto com manchas coloridas), `gradiente` (degradê vivo, cards claros), `fliperama` (pixel art: título com até ~19 letras por linha) ou `ouro`. Variar entre os reels do lote.
- `cor`: a cor de destaque, pelo assunto: `ouro`, `laranja`, `coral`, `rosa`, `lilas`, `ciano`, `verde`, `amarelo` ou um hex de 6 dígitos (`#f6b73c`). O validador barra outra.
- `trilha.clima`: `curiosidade` ("e se...", ciência), `passo` (tutorial, lista), `conversa` (opinião, bastidor), `descontraido` (humor), ou um clima seu que exista no `musicas.json` (o validador barra clima que não existe). A faixa sai das músicas que a pessoa pôs em `kit/assets/musica/` (ver o `LEIA-ME.md` de lá); sem música, o reel sai sem trilha. `"trilha": false` desliga.
- `voz_gravada.acelerar`: acelera a gravação sem mudar o tom (1.15 deixa a fala corrida de reel; 1 é o ritmo natural).
- `mascote`: o bonequinho de pixel do Claude Code vem **ligado**, com a etiqueta "CLAUDE", no canto do palco. Reel que não é sobre o Claude: `"mascote": false`. Pra usar, `mascote_rotulo` (etiqueta com palavra da fala) e `mascote` por cena (outra etiqueta, ou `false` pra esconder naquela cena). O validador avisa quando a etiqueta padrão não está na fala.
- `ritmo.max_vao`: o maior vão (em segundos) sem mudança grande antes de o kit encaixar uma batida sozinho. O padrão é 1,4; **com mundo 3D, o encaixe automático fica desligado** (a cena 3D já mexe), e `"ritmo": { "max_vao": 1.4 }` liga de novo se o medidor reprovar.
- `header` (opcional, por cena): cabeçalho fixo com 1 palavra em `*itálico*`.
- `estilo: "classico"` volta o visual antigo (legenda em caixa, contador no topo); o padrão é o "cinema" (título serifado, legenda branca sem caixa, a palavra falada acende na cor).
- `segura_fim`: segundos de tela depois da última palavra (padrão 1,6).
- `versoes.teste`: ajustes da versão pros Reels de teste do Instagram (`npm run produzir -- <reel> --versao teste`: mesmo áudio, outro tema, outra faixa do clima, cena 3D mais perto). Ex.: `"versoes": { "teste": { "tema": "gradiente" } }`.

### Âncoras

Os campos `em`, `selo_em`, `dm_em`, `chips_em`, `efeitos[].em`, `batidas[].em`, `cabs[].em`, `dados.quadros[].em` e `ate_em` dizem em que palavra falada a animação acontece. Têm que ser palavra da fala **da própria cena** (igual, ou começo de palavra com 4 letras ou mais: "recomenda" casa "recomendação"; palavra de até 3 letras só casa igual). Vale a 1ª vez que a palavra aparece na cena. O validador barra âncora que não casa.

### Texto de tela vem da fala

Cabeçalho, carimbo, quadros (palavra, rótulos, barras, mês do calendário), selo e rótulo do gancho, itens de lista e de cards, rótulo e `sub` do número, lados do comparar, frase grande, chips do cérebro, painel do mundo e etiqueta do bonequinho só podem usar palavras que estão na fala aprovada daquela cena (flexão passa, paráfrase não; número pode ser algarismo). Quem aprova lê a fala; a tela não pode dizer coisa que ninguém aprovou. O validador barra. Fica de fora o que é mockup da coisa real: terminal (o comando), chat (a conversa), repositório (os dados do GitHub) e o `credito` da cena `midia`; a fonte de um número vai na fala ou na legenda.

### Ritmo (algo grande muda a cada 1 a 2 s)

Meta medida no vídeo pronto (`scripts/medir-ritmo.mjs`): primeira mudança no 1º segundo, nada parado mais de 2 s. A parte visual monta isso:

- `dados.quadros` (só no `hook`): o palco troca de visual na palavra falada. Tipos: `palavra` (`texto` com `*itálico*`, `sub`), `logo` (`logo`, `rotulo`), `icone` (`icone`, `rotulo`), `contador` (`ate`, `prefixo`, `sufixo`, `rotulo`, `ate_em`), `calendario` (`mes`, `ano`, `mes_num`, `dias: [de, ate]`), `barras` (`itens: [{ "rotulo", "valor", "texto" }]`). `canto: true` encolhe o quadro pro canto em vez de sumir. O 1º quadro sem `em` entra no início com clarão.
- `cabs: [{ "em", "t" }]` (qualquer cena): o cabeçalho troca na palavra.
- `batidas: [{ "tipo", "em", ... }]` (qualquer cena): `selo` (`texto`, `pos`: dir, esq, centro, baixo), `palavra` (`texto`, `dur`; só com o palco vazio), `explosao`, `chuva` (`item`: moeda ou estrela, `n`), `confete` (nunca no `segue`: cai no rosto), `zoom`, `tremor`, `clarao` (`cor`), `anel`, `xis`, `risco` (`y` em %), `glitch`, `brilho`, `pulso`.
- O kit mede o vão entre mudanças grandes (cabeçalho e carimbo são pequenos) e encaixa brilho, zoom ou pulso onde passar de `ritmo.max_vao` (1,4 s; desligado em reel com mundo 3D, salvo `max_vao` explícito). Se o medidor reprovar, pôr uma batida grande no trecho parado.

Cena nova a cada 2 a 6 s; alternar tipos (não 3 listas seguidas); o que aparece mostra o que a fala diz, não enfeita.

### Tipos de cena e `dados`

| tipo | dados | uso |
|---|---|---|
| `hook` | `quadros`; ou `logo` (string ou lista), `icone`, `numero` + `rotulo`; `selo`, `selo_em` | abertura |
| `terminal` | `titulo` da janela; `linhas: [{ "k": "cmd" \| "out" \| "ok", "t", "em" }]` (cmd digita letra a letra) | comando rodando |
| `chat` | `app`, `pergunta`, `resposta` (lista de linhas, aceita `*itálico*`) | conversa com IA |
| `repo` | `dono`, `nome`, `descricao`, `estrelas`, `forks`, `licenca`, `linguagem`, `arquivos`, `selo`, `selo_em` | repositório do GitHub (dados checados no dia) |
| `lista` | `itens: [{ "nome", "desc", "icone", "em" }]` | passos, regras |
| `numero` | `valor` (string), `prefixo`, `sufixo`, `rotulo`, `sub`, `em` | número forte |
| `cards` | `itens: [{ "titulo", "sub", "icone", "em" }]` (2 a 4) | blocos lado a lado |
| `comparar` | `antes` e `depois`: `{ "rotulo", "itens" }`; `depois.em` | antes x depois |
| `frase` | `texto` (com `*itálico*`), `assinatura` | citação, opinião |
| `cerebro` | `arquivo`, `em`, `rotulos`, `chips_em` | "a IA lê isso" |
| `midia` | `imagens: [{ "src", "em" }]`, `credito` | tela real de um produto ou app |
| `mundo` | `hud: [{ "rotulo", "valor", "em" }]` | palco vazio pra cena 3D aparecer |
| `segue` | `selo` (padrão "+1 SEGUIDOR"), `em` | fecho 1 |
| `comenta` | `em` (quando digita a palavra), `dm_em` (quando a DM chega), `selo` | fecho 2 |

Ícones: contexto, dados, inteligencia, automacao, resultado, diagnostico, sprint, camadas, industria, sistemas, times, partida, site, trafego, mentoria, olho, conversa, alerta, relogio, setaLink.

Logos (em `kit/assets/logos`): anthropic, claude, cloudflare, cursor, github, googlegemini, instagram, n8n, nodedotjs, notion, obsidian, openai, supabase, telegram, vercel, visualstudiocode, whatsapp, youtube. Logo novo: baixar o SVG do [Simple Icons](https://simpleicons.org) pra `kit/assets/logos/<nome>.svg`.

### Imagens reais: cena `midia`

Quando o reel fala de um produto, app ou lugar real, o palco mostra a coisa de verdade num celular grande: `{ "tipo": "midia", "fala": "...", "dados": { "credito": "imagens: site.com", "imagens": [{ "src": "midia/tela.jpg" }, { "src": "midia/outra.jpg", "em": "mapa" }] } }`. Use telas oficiais de divulgação (site do produto, loja de apps), nunca o post de outro criador; anote a origem e a data em `midia/FONTES.md`.

## Mundo 3D (`mundo.mjs`)

Uma cena 3D low-poly por código fica atrás das cenas e reage à fala. Card, lista e tela real continuam por cima quando carregam informação.

```json
"mundo": { "arquivo": "mundo.mjs", "marcas": { "some": [0, "sumisse"], "apaga": [3, "apaga"] } }
```

- `mundo.mjs` na pasta do reel: `export function criarMundo(THREE, canvas, dados) { ...; return { render(t) { ... } }; }` (pode ser `async`). `dados` = `{ total, marcas: { nome: segundos }, cenas: [{ tipo, t0, t1 }] }`.
- Tudo é função de `t`: nada de `Math.random`, `Date.now` ou laço de animação (use o `prng` com semente). O vídeo é renderizado quadro a quadro.
- `marcas`: `[índice da cena, palavra da fala daquela cena]`. É assim que o mundo reage à fala, igual às batidas.
- Blocos prontos em `kit/assets/vendor/mundo-kit.mjs` (importar com `from "./assets/vendor/mundo-kit.mjs"`): `base` (renderer, câmera e `mover`), `planoEm` (cortes por marca), `tempoIntegrado`, `prng`, `suave`, `fracao`, `ceu`, `estrelas`, `chao`, `gradeNeon`, `arvores`, `predios`, `multidao`, `pessoa`, `mascote`, `computador` (monitor com tela trocável), `imagem` (print real como textura), `caberNaTela`, `telaCanvas`, `textoSprite`, `brilho`, `sprite`, `moedas`.
- Referência: `exemplo/mundo.mjs`. Ideias que funcionam: um objeto 3D por ideia da fala, entrando na palavra; câmera sempre andando devagar; luz que muda com a história; tela real do produto no monitor 3D.
- Gotchas: malha instanciada precisa de `frustumCulled = false`; dois planos no mesmo lugar tremem (afastar 0,01 a 0,02); câmera no chão no meio de bonecos vira bonecos gigantes (câmera alta e longe); selo `dir`/`esq` cobre o que estiver no alto do palco (conferir na foto; `baixo` resolve).

## `legenda.md`

```
Comenta PALAVRA que eu te mando <a isca>, <detalhe concreto>

<1 ou 2 linhas na voz da pessoa: prova ou pergunta pro público>
#tag1 #tag2 #tag3
```

A palavra nos primeiros 125 caracteres (o resto fica escondido no "mais"), no máximo 5 hashtags, até 2.200 caracteres, sem travessão.

## `roteiro.md` (o que a pessoa revisa e aprova)

Gerado por `npm run lote -- roteiros` a partir do `reel.json` e da `legenda.md`. A pessoa edita o texto ali e troca a primeira linha para `Aprovado: sim`; `npm run lote -- aprovados` leva o texto aprovado de volta. A parte visual não aparece pra ela.

```markdown
Aprovado: não

## Título na tela
LINHA 1 DO TÍTULO
LINHA 2 COM *ITÁLICO*

## Narração
(cada parágrafo vira uma cena)

Fala da cena 1.

Fala da cena 2.

## Legenda do post
Texto exato pra colar.

## Comenta e DM
Palavra: PALAVRA
DM no vídeo: texto do card da DM no fecho
Botão no vídeo: abrir o guia
```

Parágrafo novo vira cena nova (o reel fica marcado com `remontar_cenas` até a parte visual ser remontada sobre as falas novas). Depois da aprovação, a fala só muda pelo `roteiro.md` aprovado de novo ou pela gravação (fala livre).
