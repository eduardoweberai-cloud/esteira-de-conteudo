---
name: esteira
description: Roda a sua esteira de reels com o Claude Code, um lote por vez - radar de concorrentes, pautas do seu dia a dia ou descontraídas, roteiros no seu jeito de falar aprovados por você num arquivo, gravação da sua voz num teleprompter local, vídeo por código (HyperFrames) com legenda, animação e cena 3D, e a pasta de entrega pronta pra postar, parando nas aprovações. Use quando pedirem /esteira, "roda a esteira", "lote da semana", "faz os reels", ao retomar um lote aberto ou quando a pessoa disser que aprovou o roteiro ou que gravou.
---

# /esteira: um lote de reels por vez

O mecânico roda sozinho; o gosto, o texto e o que vai a público passam pela pessoa.

```
[1 RADAR] -> [2 PAUTAS] -> [3 ROTEIROS] -> APROVAÇÃO (ela, no roteiro.md)
   -> GRAVAÇÃO (ela, no teleprompter) -> [4 PRODUÇÃO] -> CORTE (ela assiste) -> PUBLICAÇÃO (ela posta)
```

## Regras que nunca dobram

- **Nada é gravado nem produzido sem o roteiro aprovado pela pessoa.** Quem troca a primeira linha do `roteiro.md` para `Aprovado: sim` é ela, nunca você. Os scripts conferem (`scripts/aprovacao.mjs`).
- **Depois da aprovação, a fala só muda pelo `roteiro.md` aprovado de novo ou pela gravação.** Você mexe só na parte visual (tipo de cena, quadros, cabeçalhos, batidas, mundo 3D), e texto de tela só com palavras da fala aprovada.
- **Nada vai pro ar por você.** Postar é com a pessoa.
- **Fato com fonte aberta no dia.** O que não deu pra confirmar sai do roteiro.
- **Nunca copiar** texto, piada, rosto, mascote ou identidade visual de outro criador: do outlier vêm a ideia e o mecanismo.
- Sem travessão em nada que você escrever pra ela ou pro público.

## Onde fica tudo

| O quê | Caminho |
|---|---|
| Lote | `lotes/<AAAA-MM-DD>/` com `lote.json`, `classificacao.json` e uma pasta por reel `r<N>-<palavra>/` |
| Reel | `reel.json`, `legenda.md`, `roteiro.md` (o que ela aprova), `mundo.mjs` (opcional), `gravacao/` (tomadas), `renders/` |
| Voz | `voz/perfil-de-voz.md` (como ela fala) e `voz/calibracao.md` (o que ela mudou nos seus textos: ler antes de cada lote) |
| Ideias dela | `lotes/ideias.md` (uma por linha; ela anota quando quiser) |
| Perfil do fecho | `perfil.json` (nome, @ e foto no "Me segue" e na DM) |
| Entrega | `entregas/` ou a pasta em `ESTEIRA_ENTREGA` no `.env`: vídeo final e `legenda.txt` de cada reel |
| Referências desta skill | `references/roteiro.md` (passo 3), `references/pautas.md` (passo 2), `references/perfil-de-voz.md` (molde) |

`lotes/`, `voz/` e `entregas/` ficam fora do git: são da pessoa.

## Como chamar

- `/esteira`: retoma o lote aberto na etapa onde parou; sem lote aberto, cria o de hoje e começa pelo radar.
- `/esteira novo [AAAA-MM-DD] [--reels N]`: cria o lote (padrão 3 reels).
- `/esteira status`: etapa e próximo passo (`npm run lote -- status`).

## Passo 0: abrir

1. Primeira vez (sem `voz/perfil-de-voz.md`): conferir a instalação (`node -v` 22 ou mais, `ffmpeg -version`, `npm install`, `npm test`), o `.env` com `ELEVENLABS_API_KEY` (molde no `.env.example`) e o `perfil.json`. Depois montar o perfil de voz: copiar `references/perfil-de-voz.md` para `voz/perfil-de-voz.md` e preencher com a pessoa (5 a 10 reels dela com fala, ou uma conversa de 10 minutos). Mostrar o perfil e pedir que ela corrija.
2. `npm run lote -- status`. Sem lote aberto: `npm run lote -- novo`.
3. Ler o `lote.json`, `voz/perfil-de-voz.md` e `voz/calibracao.md`. Cada mudança de etapa: `npm run lote -- etapa <data> <etapa>`. Etapas: `radar` > `roteiros` > `aprovacao` > `gravacao` > `producao` > `corte` > `publicacao` > `fechado`. As de espera (`aprovacao`, `corte`, `publicacao`) só começam depois que o material foi mostrado.

## Passo 1: radar

Usa a skill `ig-competitor-research` (pública em https://github.com/eduardoweberai-cloud/claude-skills, pasta `skills/ig-competitor-research`; instalar copiando a pasta pra `~/.claude/skills/` e seguindo o setup dela, com token do Apify). Lista de 10 a 15 perfis do nicho da pessoa e de perfis que fazem humor ou curiosidade bem, período = os 7 dias antes do lote, top 15. Avisar o custo do Apify antes de rodar.

Do relatório, separar os **outliers**: post muito acima da média do próprio perfil (não o post grande de conta grande). Classificar cada um em `lotes/<data>/classificacao.json` (formato em `references/pautas.md`).

## Passo 2: pautas

Ler `references/pautas.md`. Fontes: as ideias da pessoa (`lotes/ideias.md` e o que ela disser) e os outliers classificados. Gravar em `lote.json` as `escolhidas` (`reel`, `linha`, `origem`, `por_que`, `palavra`). Checar cada fato na fonte (WebFetch). Etapa `roteiros`.

## Passo 3: roteiros, para na aprovação

Ler `references/roteiro.md` e `voz/perfil-de-voz.md`. Para cada pauta, criar `lotes/<data>/r<N>-<palavra minúscula>/` com `reel.json` (falas, título, cenas, parte visual, `voz_gravada: { "acelerar": 1.15 }`), `legenda.md` e, se houver, `mundo.mjs`.

1. Reler a fala como ela falaria e cortar o que soar escrito (frase de redação, staccato, "não é só").
2. `npm run validar -- lotes/<data>` com zero ERRO (aviso vai junto pra ela decidir).
3. `npm run lote -- roteiros` escreve o `roteiro.md` de cada reel, com `Aprovado: não`.

Mensagem pra pessoa, curta, por reel: a linha (dia a dia ou descontraído), de onde veio, a checagem de fato com links, os avisos do validador e o caminho do `roteiro.md`, dizendo que ela edita o texto do jeito dela e troca a primeira linha pra `Aprovado: sim`. Etapa `aprovacao`. **Parar.**

Quando ela avisar que aprovou: `npm run lote -- aprovados`. O texto aprovado entra exatamente como está; o que ela mudou vai pra `voz/calibracao.md`. Reel marcado `REMONTAR CENAS` (a quantidade de falas mudou): remontar tipo de cena e batidas sobre as falas novas, tirar `remontar_cenas` do `reel.json` e validar de novo. Roteiro ainda "pra revisar" fica esperando. Etapa `gravacao`.

## Gravação (a pessoa)

`npm run gravar -- lotes/<data>/<reel>` abre o teleprompter em http://localhost:4090 (só abre com o roteiro aprovado). Ela escolhe o microfone, lê um parágrafo por vez (Espaço avança), grava numa tomada só e clica em **Salvar e alinhar**. A tomada é limpa, transcrita e alinhada com o roteiro na ElevenLabs, que cobra algumas dezenas de créditos por minuto de tomada (medido em outubro de 2026).

- **Fala livre:** se ela falou diferente do texto, o texto do reel vira o que ela falou (a página mostra o que mudou; o roteiro de antes fica em `reel-roteiro.json`). A próxima tomada lê de novo o texto aprovado.
- **Trecho refeito:** se ela erra, comenta ("errei, vou falar de novo") e repete, o trecho errado sai sozinho.
- Tomada que não bate com o roteiro (parágrafo pulado, outro texto) é recusada dizendo onde.
- Gravou no celular: `npm run voz -- lotes/<data>/<reel> <arquivo>` (webm, ogg, wav, m4a ou mp3).

Quando ela disser "gravei": `npm run validar -- lotes/<data>/<reel>`. Âncora ou texto de tela que perdeu a palavra com a fala livre: reancorar só os campos visuais no `reel.json`. Etapa `producao`.

## Passo 4: produção, para no corte

```bash
npm run produzir -- lotes/<data>/<reel>                    # um por vez (o render pesa)
npm run produzir -- lotes/<data>/<reel> --versao teste     # opcional: versão pros Reels de teste do Instagram
```

O `produzir` confere a aprovação, exige a gravação, valida, monta, roda `hyperframes check`, renderiza em `renders/<slug>-vN.mp4`, mede o ritmo (`ritmo.json`: 1ª mudança até 1 s, nada parado mais de 2 s; sem música no `musicas.json`, a falta de trilha só avisa) e copia o final pra pasta de entrega. Falhou: ler o erro, corrigir e rodar de novo (até 3 vezes; depois mostrar o erro real). Ritmo reprovado nunca vai pra ela: pôr uma batida grande no trecho parado e produzir de novo.

**QA visual antes de mostrar:** fotos de cada cena na pasta do reel (`npx hyperframes snapshot --at <t1>,<t2>,... --no-end -o snaps --describe false`; meio e fim de cada cena) e olhar a folha de contato em `snaps/` com Read. Reprova: quadro preto, título cortado, legenda fora da tela, palavra errada no comenta, selo cobrindo texto ou rosto, destaque sem contraste.

Mensagem por reel: o caminho na pasta de entrega, duração e os números do `ritmo.json`. Etapa `corte`. **Parar.** Ajuste visual: editar o `reel.json` e produzir de novo (gera vN+1; sem custo de voz). Ajuste de fala: só pelo `roteiro.md` aprovado de novo e uma gravação nova.

## Publicação (a pessoa)

Ela posta o vídeo com a `legenda.txt` da pasta de entrega. A resposta automática de "comenta PALAVRA" fica com a ferramenta de DM que ela usar. Todos no ar: etapa `fechado`.

## Gotchas

- Fala editada pede gravação nova: o `produzir` para e diz o comando. Correção do que ela falou (a transcrição errou uma palavra): a correção vai pro `roteiro.md`, ela aprova, `npm run lote -- aprovados` e `npm run voz -- <reel> --literal` (usa a mesma tomada com o texto corrigido).
- `hyperframes check` às vezes cai com "Browser process did not exit": é da máquina, rodar de novo. Não tirar foto de QA enquanto outro reel está no check.
- A transcrição costuma ouvir "Cloud" quando a pessoa diz "Claude": a fala livre trata como a mesma palavra.
- Âncora tem que ser palavra da fala da própria cena, senão a animação cai num tempo chutado: o validador barra.
- Reel com cena `midia`: título em 2 linhas.
- Sem `perfil.json` preenchido, o fecho sai com "Seu Nome" (o build avisa).

## Custos por lote de 3 reels

Apify: perto de US$ 1 a 2 por radar (a conta grátis tem crédito mensal). ElevenLabs: algumas dezenas de créditos por minuto de tomada (transcrição e alinhamento cobram por minuto de áudio; medido em outubro de 2026). HyperFrames, Node e FFmpeg: grátis.
