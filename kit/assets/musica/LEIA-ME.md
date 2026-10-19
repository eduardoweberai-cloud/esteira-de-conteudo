# Música de fundo (opcional)

O repositório não traz música: as faixas gratuitas deixam usar no seu vídeo, mas não deixam redistribuir o arquivo. Sem música, o reel sai sem trilha e nada quebra.

## Como pôr as suas

1. Baixe faixas instrumentais de um banco que permita uso em vídeo de rede social (o [Mixkit](https://mixkit.co/free-stock-music/) é grátis e não pede cadastro; leia a licença de cada banco).
2. Salve os `.mp3` nesta pasta.
3. Descreva cada uma em `musicas.json`, nesta pasta, com o **clima**:

```json
[
  { "arquivo": "faixa-misterio.mp3", "clima": "curiosidade", "inicio": 5 },
  { "arquivo": "faixa-tutorial.mp3", "clima": "passo" },
  { "arquivo": "faixa-opiniao.mp3", "clima": "conversa" },
  { "arquivo": "faixa-humor.mp3", "clima": "descontraido" }
]
```

| Clima | Para que reel |
|---|---|
| `curiosidade` | "e se...", ciência, mistério |
| `passo` | passo a passo, tutorial, lista prática |
| `conversa` | opinião, reflexão, bastidor |
| `descontraido` | humor, POV, leve |

`inicio` (opcional) é o segundo da faixa em que a música começa no reel. Pode criar climas seus: o reel que pedir aquele clima pega uma faixa dele.

## Como o kit usa

- O roteiro escolhe o clima (`"trilha": { "clima": "passo" }` no `reel.json`) e o kit sorteia uma faixa daquele clima, nunca uma das 10 que tocaram por último (quando a produção registra as usadas).
- A faixa é cortada no tamanho do reel, ganha fade e fica 22 dB abaixo da voz.
- A versão de teste do reel toca outra faixa do mesmo clima.
- Pra fixar uma faixa: `"trilha": { "arquivo": "faixa-tutorial.mp3" }`. Sem trilha: `"trilha": false`.

Os `.mp3` desta pasta ficam fora do git (`.gitignore`) para ninguém publicar música de banco sem querer.
