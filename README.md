# Esteira de conteúdo

Um kit pra montar a sua esteira de reels com o [Claude Code](https://github.com/anthropics/claude-code). O Claude acha a pauta nos concorrentes, escreve o roteiro do jeito que você fala, você aprova o texto e grava a sua voz, e o vídeo sai por código: legenda palavra por palavra, animação, cena 3D e o fecho com "Me segue" e "Comenta". Você só posta.

Quer ver antes de configurar qualquer coisa? `npm run exemplo` gera um reel de 19 s sem voz e sem chave de API.

## Como funciona

| # | Passo | Quem faz | Como |
|---|---|---|---|
| 1 | Radar | Claude | lê os posts da semana dos perfis que você escolheu e separa os que foram muito acima da média |
| 2 | Pautas | Claude | escolhe pelas regras: assunto do seu dia a dia ou descontraído, nunca cópia do outro criador |
| 3 | Roteiro | Claude, depois você | o Claude escreve na sua voz; você edita o `roteiro.md` e troca a primeira linha pra `Aprovado: sim` |
| 4 | Gravação | você | lê no teleprompter local (`npm run gravar`); trocou palavra, o texto do vídeo vira o que você falou |
| 5 | Produção | Claude | monta, renderiza e mede o ritmo (`npm run produzir`); no `/esteira`, o Claude ainda confere o vídeo por fotos |
| 6 | Publicação | você | pega o vídeo e a legenda na pasta `entregas/` e posta |

Nada é gravado nem produzido sem o roteiro aprovado por você: os scripts conferem.

## Requisitos

- [Node.js](https://nodejs.org) 22 ou mais
- [FFmpeg](https://ffmpeg.org/download.html) no PATH (Windows: `winget install Gyan.FFmpeg`; Mac: `brew install ffmpeg`)
- [Claude Code](https://github.com/anthropics/claude-code)
- [HyperFrames](https://hyperframes.heygen.com) 0.8.177: já vem no `npm install` (na primeira vez, ele baixa o navegador que usa pra renderizar)
- Chave da [ElevenLabs](https://elevenlabs.io/app/settings/api-keys): transcreve e alinha a sua gravação (não é clone de voz; o vídeo usa a sua voz de verdade)
- Pro radar: a skill `ig-competitor-research` do repositório [claude-skills](https://github.com/eduardoweberai-cloud/claude-skills) e o que ela pede no setup dela: conta no [Apify](https://apify.com), Python e o `whisper-ctranslate2`

## Instalar

```bash
git clone https://github.com/eduardoweberai-cloud/esteira-de-conteudo.git
cd esteira-de-conteudo
npm install
npm test
npm run exemplo
```

O vídeo de exemplo sai em `exemplo/saida/renders/exemplo.mp4`.

Depois:

1. Copie `.env.example` pra `.env` e cole a sua `ELEVENLABS_API_KEY`.
2. Preencha `perfil.json` com o seu nome, o seu @ e o caminho de uma foto (ou deixe `"foto": null` pra usar as iniciais).
3. Opcional: música e efeitos sonoros (veja "Música e sons").
4. Abra o Claude Code na pasta e chame `/esteira`. Na primeira vez, ele monta o seu perfil de voz com você.

## O primeiro reel, à mão

Com o `/esteira`, o Claude roda tudo isso e para nas aprovações. Os comandos, se quiser ver um por um:

```bash
npm run lote -- novo                          # cria lotes/<hoje>/
# (o Claude cria lotes/<hoje>/r1-<palavra>/ com reel.json e legenda.md)
npm run validar -- lotes/<data>               # confere o roteiro contra o kit
npm run lote -- roteiros                      # escreve o roteiro.md de cada reel
# você edita o roteiro.md e troca a primeira linha pra "Aprovado: sim"
npm run lote -- aprovados                     # leva o texto aprovado pro reel
npm run gravar -- lotes/<data>/r1-<palavra>   # teleprompter em http://localhost:4090
npm run produzir -- lotes/<data>/r1-<palavra> # vídeo em renders/ e cópia em entregas/
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run exemplo` | reel de exemplo sem voz (`-- --alta` pra qualidade de entrega) |
| `npm run lote -- novo \| status \| etapa \| roteiros \| aprovados` | estado do lote e aprovação dos roteiros |
| `npm run validar -- <lote ou reel>` | confere o roteiro: tipos de cena, âncoras, texto de tela vindo da fala, isca, legenda |
| `npm run gravar -- <reel> [--porta 4091]` | teleprompter local pra gravar a narração |
| `npm run voz -- <reel> <arquivo>` | usa uma gravação feita fora da página (celular) |
| `npm run voz -- <reel> --literal` | reprocessa a gravação escolhida com o texto de hoje (depois de uma correção aprovada) |
| `npm run produzir -- <reel> [--versao teste] [--draft]` | monta, renderiza, mede o ritmo e entrega |
| `npm run ritmo -- <video.mp4> [--sem-trilha]` | mede o ritmo de qualquer vídeo (`--sem-trilha` quando ele não tem música, senão a falta de trilha reprova) |
| `npm test` | testes do kit e dos scripts |

`--teste` no `gravar` e no `produzir` pula a conferência da aprovação, pra experimentar; o vídeo de teste não vai pra entrega.

## Personalizar

- **Visual por reel** (`reel.json`): `tema` (`neon`, `gradiente`, `fliperama`, `ouro`), `cor` de destaque (`ouro`, `laranja`, `coral`, `rosa`, `lilas`, `ciano`, `verde`, `amarelo` ou um hex), 14 tipos de cena, batidas na palavra falada e cena 3D. Tudo em `.claude/skills/esteira/references/roteiro.md`.
- **Música e sons:** o repositório não traz nenhum arquivo de áudio (os bancos gratuitos deixam usar no vídeo, mas não redistribuir). Baixe os seus e siga `kit/assets/musica/LEIA-ME.md` e `kit/assets/sfx/LEIA-ME.md`. Sem eles, o reel sai sem trilha e sem efeitos, e nada quebra.
- **Logos:** `kit/assets/logos/` (Simple Icons). Pra pôr outro, siga `kit/assets/logos/CREDITOS.md`.
- **Pasta de entrega:** `ESTEIRA_ENTREGA` no `.env`.

## Custos

| O quê | Quanto |
|---|---|
| Radar (Apify) | perto de US$ 1 a 2 por semana com 15 perfis; a conta grátis tem crédito mensal |
| Gravação (ElevenLabs) | algumas dezenas de créditos por minuto de tomada (transcrição e alinhamento cobram por minuto de áudio; medido em outubro de 2026) |
| Vídeo (HyperFrames, FFmpeg, Node) | grátis, roda na sua máquina |

## O que fica só na sua máquina

`lotes/` (roteiros, gravações da sua voz, vídeos), `voz/` (o seu perfil de voz e a calibração), `entregas/`, `.env` e os arquivos de música e som estão no `.gitignore`.

## Créditos e licenças

- Código: [MIT](LICENSE).
- [HyperFrames](https://hyperframes.heygen.com) (Apache-2.0), [three.js](https://threejs.org) (MIT) e [GSAP](https://gsap.com) ([licença padrão gratuita](https://gsap.com/standard-license)): instalados pelo `npm install`.
- Fontes Instrument Serif, Hanken Grotesk, JetBrains Mono, Newsreader e Press Start 2P: SIL Open Font License 1.1 (`kit/assets/fonts/OFL.txt`).
- Logos: [Simple Icons](https://simpleicons.org) (CC0 1.0). As marcas pertencem aos donos.
