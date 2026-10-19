# Pautas (passo 2)

A pauta sai das regras abaixo, sem pedir pra pessoa escolher tema por tema: ela vê o resultado no roteiro e descarta na aprovação o que não quiser.

## Regras

1. **Duas linhas, e só elas.**
   - **Dia a dia:** assunto que a pessoa vive e domina (das ideias dela, anotadas em `lotes/ideias.md` ou ditas no chat). Prova em 1ª pessoa com número dela ganha de afirmação genérica, e o número tem que vir dela: nunca inventar caso, cliente ou resultado.
   - **Descontraído:** humor, POV, curiosidade, "e se...". Mantém a ideia do outlier que deu certo, contada do jeito da pessoa. "E se..." pede mundo 3D do fenômeno acontecendo (`roteiro.md`, seção "Mundo 3D"), não só card. Não exige domínio, porque é diversão.
   - **Fora:** reel técnico sobre ferramenta, repositório ou produto que a pessoa não usou. Outlier técnico pode virar ideia anotada, mas não vira pauta sozinho.
2. **Lote:** o padrão é 3 reels por lote, pelo menos 1 de cada linha. Ordem de escolha: o que a pessoa marcou como prioridade > maior outlier descontraído (mesmo fora do nicho) > ideia mais antiga dela.
3. **Mecanismo e ideia sim, identidade nunca.** Do outlier vêm a ideia e o porquê de ter andado (formato, gancho, "Comenta PALAVRA"). Nunca o texto, a piada pronta, o mascote, a paleta, o rosto ou o bordão do outro criador.
4. **Isca:** no dia a dia, quando há algo real pra entregar na DM (arquivo, passo a passo, lista, link). No descontraído é opcional; sem isca, o reel fecha só com "Me segue". Se a isca depende da pessoa (um arquivo dela, expor algo dela), dizer isso junto do roteiro.
5. **Fato checado na fonte, no dia.** Repositório: abrir o GitHub. Estudo: o paper ou a página oficial. Notícia e app: a fonte primária. O que não deu pra confirmar sai do roteiro, mesmo que o post de origem diga. Número sempre com a data em que foi visto.
6. **Palavra única** (quando há isca): uma palavra, maiúsculas, sem acento de preferência, diferente das outras pautas do lote e das que a pessoa já usou.
7. **Tamanho:** até uns 60 s (umas 250 palavras na fala corrida).
8. **Gancho** pela fórmula do outlier, escrito como a pessoa fala (`voz/perfil-de-voz.md`), depois de ler `voz/calibracao.md`.

## Classificação dos outliers (`lotes/<data>/classificacao.json`)

Um objeto por post analisado no radar:

```json
[
  { "shortcode": "<código do post>", "linha": "descontraido", "titulo": "E se a Lua sumisse?", "mecanismo": "pergunta absurda no gancho e resposta em 5 fenômenos" }
]
```

`linha` é `descontraido`, `dia_a_dia` ou `tecnico`. O `titulo` é a ideia em português, curta, do jeito que a pessoa anotaria.

## Escolhidas (`lote.json`)

```json
"escolhidas": [
  { "reel": "r1-lua", "linha": "descontraido", "origem": "<link do post>", "por_que": "maior outlier do radar, 40x a mediana do perfil", "palavra": null }
]
```
