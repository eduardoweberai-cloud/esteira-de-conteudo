// Fala livre (quem grava fala com as próprias palavras): viradas de parágrafo, grafia da transcrição, maiúscula e pontuação.
// Casos da revisão em contexto limpo de 14/10 (scripts em scratchpad\revisor2).
import test from "node:test";
import assert from "node:assert/strict";
import { acharRetomadas, falasDoQueFalou, semRetomadas } from "./fala-livre.mjs";

// Palavras ditas com tempos: cada parágrafo (array) começa depois de uma pausa; dentro dele, 0,05 s entre palavras.
function dito(paragrafos, { pausas = [], inicio = 0.2 } = {}) {
  const out = [];
  let t = inicio;
  paragrafos.forEach((p, k) => {
    if (k > 0) t += pausas[k - 1] ?? 1.2;
    for (const w of p.split(" ")) {
      out.push({ w, s: Math.round(t * 1000) / 1000, e: Math.round((t + 0.25) * 1000) / 1000 });
      t += 0.3;
    }
  });
  return out;
}
const reel = (...falas) => ({ cenas: falas.map((fala) => ({ fala })) });

test("frase nova no fim do parágrafo fica nele, mesmo começando com o \"e\" que abre o parágrafo seguinte", () => {
  const r = reel("O céu azul, o calor, tudo.", "E a gravidade do Sol também viaja.");
  const h = dito(["O céu azul, o calor, tudo, e ninguém ia perceber nada.", "E a gravidade do Sol também viaja."], { pausas: [1.26] });
  const out = falasDoQueFalou(r, h);
  assert.deepEqual(out.falas, ["O céu azul, o calor, tudo, e ninguém ia perceber nada.", "E a gravidade do Sol também viaja."]);
  assert.deepEqual(out.mudancas, [{ cena: 0, antes: "", depois: "e ninguém ia perceber nada." }]);
});

test("o Espaço do teleprompter decide a virada quando a pausa não decide", () => {
  const r = reel("Oi gente, tudo bem?", "Hoje eu vou mostrar uma coisa.");
  // "Beleza?" no meio de duas pausas iguais: a marca do Espaço diz de que lado ele estava.
  const h = dito(["Oi gente, tudo bem?", "Beleza?", "Hoje eu vou mostrar uma coisa."], { pausas: [0.8, 0.8] });
  const antesDoBeleza = h[4].s - 0.4;
  const depoisDoBeleza = h[5].s - 0.4;
  assert.deepEqual(falasDoQueFalou(r, h, { marcas: [depoisDoBeleza] }).falas, ["Oi gente, tudo bem? Beleza?", "Hoje eu vou mostrar uma coisa."]);
  assert.deepEqual(falasDoQueFalou(r, h, { marcas: [antesDoBeleza] }).falas, ["Oi gente, tudo bem?", "Beleza? Hoje eu vou mostrar uma coisa."]);
});

test("parágrafo dito com outras palavras passa com a pausa maior antes ou depois dele", () => {
  const r = reel("Oi gente, tudo bem?", "Hoje eu vou mostrar uma coisa.", "Me segue aí.");
  for (const pausas of [[0.9, 1.0], [1.0, 0.9]]) {
    const out = falasDoQueFalou(r, dito(["Oi gente, tudo bem?", "Olha só isso aqui.", "Me segue aí."], { pausas }));
    assert.deepEqual(out.falas, ["Oi gente, tudo bem?", "Olha só isso aqui.", "Me segue aí."], `pausas ${pausas}`);
  }
});

test("parágrafo pulado barra dizendo qual, com ou sem a marca do Espaço", () => {
  const r = reel("Oi gente, tudo bem?", "Hoje eu vou mostrar uma coisa bem legal pra vocês.", "Me segue aí.");
  const h = dito(["Oi gente, tudo bem?", "Me segue aí."], { pausas: [1.5] });
  assert.throws(() => falasDoQueFalou(r, h), /parágrafo 2/);
  // Com marcas: ele passou pelo parágrafo 2 em meio segundo.
  assert.throws(() => falasDoQueFalou(r, h, { marcas: [1.4, 1.9] }), /parágrafo 2/);
});

test("cena que começa com minúscula continua minúscula; sigla e nome continuam maiúsculos", () => {
  const r = reel("Olha só. IA não é mágica. Claude erra também.", "e comenta GUIA aqui embaixo.");
  const out = falasDoQueFalou(r, dito(["Olha só. Mas IA não é mágica. E Claude erra também.", "E comenta GUIA aqui embaixo."]));
  assert.deepEqual(out.falas, ["Olha só. Mas IA não é mágica. E Claude erra também.", "e comenta GUIA aqui embaixo."]);
});

test("palavra nova depois do fim da frase: a pontuação vem de como ele falou", () => {
  const r = reel("O calor, tudo.", "Me segue pra ver mais coisa assim.");
  const out = falasDoQueFalou(r, dito(["O calor, tudo mesmo.", "Me segue pra ver mais coisa assim, galera."]));
  assert.deepEqual(out.falas, ["O calor, tudo mesmo.", "Me segue pra ver mais coisa assim, galera."]);
});

test("grafia da transcrição não é mudança: palavra colada ou separada, ordinal, hora, moeda", () => {
  const r = reel("Abre o VS Code e instala o Node.js, no dia a dia, a primeira às dez horas, por cem reais no ChatGPT.");
  const out = falasDoQueFalou(r, dito(["Abre o VSCode e instala o Node JS, no dia-a-dia, a 1ª às 10h, por R$ 100 no Chat GPT."]));
  assert.deepEqual(out.mudancas, []);
  assert.deepEqual(out.falas, r.cenas.map((c) => c.fala));
});

test("palavra de apoio que a transcrição apagou (\"tipo\", \"aí\") continua no texto", () => {
  const r = reel("É tipo um assistente, sabe?", "Me segue aí.");
  const out = falasDoQueFalou(r, dito(["É um assistente, sabe?", "Me segue."]));
  assert.deepEqual(out.mudancas, []);
  assert.deepEqual(out.falas, r.cenas.map((c) => c.fala));
});

test("número que ele disse diferente vira mudança, e número novo fica em algarismo", () => {
  const out = falasDoQueFalou(reel("Custa vinte reais e cinco centavos por mês."), dito(["Custa 25 centavos por mês."]));
  assert.deepEqual(out.falas, ["Custa 25 centavos por mês."]);
  assert.deepEqual(out.mudancas, [{ cena: 0, antes: "vinte reais e cinco", depois: "25" }]);
  const out2 = falasDoQueFalou(reel("Eu ganhei tempo pra fazer."), dito(["Eu ganhei 2 horas pra fazer."]));
  assert.deepEqual(out2.falas, ["Eu ganhei 2 horas pra fazer."]);
  const out3 = falasDoQueFalou(reel("Aí você manda para ele o arquivo inteiro."), dito(["Aí você manda pro arquivo inteiro."]));
  assert.deepEqual(out3.falas, ["Aí você manda pro arquivo inteiro."]);
  assert.equal(out3.mudancas.length, 1);
});

test("origens: cada palavra do texto novo diz de qual palavra do roteiro veio (-1 = nova)", () => {
  const out = falasDoQueFalou(reel("Sem abrir um editor de vídeo."), dito(["E o vídeo, sem abrir um editor de vídeo."]));
  assert.deepEqual(out.origens[0], [-1, -1, -1, 0, 1, 2, 3, 4, 5]);
});

test("moeda com centavos e multiplicador também são grafia: \"R$ 100,00\" = \"cem reais\", \"3x\" = \"três vezes\"", () => {
  const r = reel("Sai na faixa de cem reais por mês e fica três vezes mais rápido, por vinte reais e cinquenta centavos.");
  const out = falasDoQueFalou(r, dito(["Sai na faixa de R$ 100,00 por mês e fica 3x mais rápido, por R$ 20,50."]));
  assert.deepEqual(out.mudancas, []);
});

test("parágrafo resumido em poucas palavras passa quando o Espaço mostra que ele leu o parágrafo", () => {
  const r = reel("Oi gente, tudo bem?", "Esse roteiro quem escreveu foi o Claude, a partir de uma ideia que eu tinha anotado no meu sistema.", "Me segue aí.");
  const h = dito(["Oi gente, tudo bem?", "Tudo isso saiu sozinho.", "Me segue aí."], { pausas: [1.0, 0.9] });
  const marcas = [h[4].s - 0.5, h[8].s - 0.45];
  assert.deepEqual(falasDoQueFalou(r, h, { marcas }).falas, ["Oi gente, tudo bem?", "Tudo isso saiu sozinho.", "Me segue aí."]);
});

test("marca faltando (ele esqueceu um Espaço) não invalida as outras", () => {
  const r = reel("Oi gente.", "Tudo bem?", "Hoje eu vou mostrar uma coisa.");
  const h = dito(["Oi gente.", "Tudo bem?", "Beleza?", "Hoje eu vou mostrar uma coisa."], { pausas: [0.8, 0.8, 0.8] });
  // Sem marca na 1ª virada; a 2ª marca (antes do "Beleza?") decide o lado do "Beleza?".
  assert.deepEqual(falasDoQueFalou(r, h, { marcas: [null, h[4].s - 0.4] }).falas, ["Oi gente.", "Tudo bem?", "Beleza? Hoje eu vou mostrar uma coisa."]);
  assert.deepEqual(falasDoQueFalou(r, h, { marcas: [null, h[5].s - 0.4] }).falas, ["Oi gente.", "Tudo bem? Beleza?", "Hoje eu vou mostrar uma coisa."]);
});

test("palavra que a transcrição apagou sozinha (1 ou 2, sem nada no lugar) fica como incerta; 3 ou mais é corte dele", () => {
  const r = reel("Porque ela não tem luz própria, ela só reflete a luz do Sol.", "Leva uns oito minutos e vinte segundos pra chegar aqui.");
  const out = falasDoQueFalou(r, dito(["Porque ela não tem luz própria, só reflete a luz do Sol.", "Leva uns oito minutos pra chegar aqui."]));
  assert.deepEqual(out.falas, ["Porque ela não tem luz própria, ela só reflete a luz do Sol.", "Leva uns oito minutos pra chegar aqui."]);
  assert.deepEqual(out.incertas, [[6], []]);
  assert.deepEqual(out.mudancas, [{ cena: 1, antes: "e vinte segundos", depois: "" }]);
});

test("troca por uma palavra que já vem logo depois (\"Oi tudo, tudo bem?\") fica uma troca só, sem incerta", () => {
  const out = falasDoQueFalou(reel("Oi gente, tudo bem?"), dito(["Oi tudo, tudo bem?"]));
  assert.deepEqual(out.falas, ["Oi tudo, tudo bem?"]);
  assert.deepEqual(out.mudancas, [{ cena: 0, antes: "gente,", depois: "tudo," }]);
  assert.deepEqual(out.incertas, [[]]);
});

// Fala com hesitação apagada pela transcrição: palavras de 0,25 s, vão de 0,05 s e um vão de 0,35 s a cada 5
// palavras (o "é..." que sumiu); entre parágrafos, só 0,15 s (como nas viradas reais do SOL).
function ditoHesitante(paragrafos, { virada = 0.15 } = {}) {
  const out = [];
  let t = 0.2;
  let k = 0;
  paragrafos.forEach((p, i) => {
    if (i > 0) t += virada - 0.05;
    for (const w of p.split(" ")) {
      out.push({ w, s: Math.round(t * 1000) / 1000, e: Math.round((t + 0.25) * 1000) / 1000 });
      t += 0.3 + (++k % 5 === 0 ? 0.3 : 0);
    }
  });
  return out;
}

test("virada curta com hesitações apagadas no meio dos parágrafos: leitura igual não muda nada (com e sem Espaço)", () => {
  const r = reel("A primeira é uma central das suas ferramentas, com e-mail, calendário e lista de tarefas, tudo numa tela só.", "A segunda é um segundo cérebro, que guarda tudo o que você estuda e responde quando você pergunta.", "Me segue pra ver mais coisa assim.");
  const h = ditoHesitante(r.cenas.map((c) => c.fala));
  assert.deepEqual(falasDoQueFalou(r, h).mudancas, []);
  const virada1 = h[20].s;
  const virada2 = h[38].s;
  assert.deepEqual(falasDoQueFalou(r, h, { marcas: [virada1 + 1.2, virada2 - 0.8] }).mudancas, []);
});

test("Espaço atrasado não arrasta a palavra nova que abre o parágrafo depois de uma pausa", () => {
  const r = reel("Isso aqui é a prova de tudo.", "E a edição o Claude montou em código.");
  const h = dito(["Isso aqui é a prova de tudo.", "Basicamente a edição o Claude montou em código."], { pausas: [0.35] });
  const basicamente = h[7].s;
  for (const atraso of [0, 0.5, 0.7])
    assert.deepEqual(falasDoQueFalou(r, h, { marcas: [basicamente + atraso] }).falas, ["Isso aqui é a prova de tudo.", "Basicamente a edição o Claude montou em código."], `atraso ${atraso}`);
});

test("três palavras de apoio seguidas apagadas pela transcrição ficam (incertas); marca fora de ordem é ignorada", () => {
  const out = falasDoQueFalou(reel("É tipo assim né um assistente."), dito(["É um assistente."]));
  assert.deepEqual(out.falas, ["É tipo assim né um assistente."]);
  assert.deepEqual(out.incertas, [[1, 2, 3]]);
  const r = reel("Oi gente.", "Tudo bem?", "Hoje eu vou mostrar uma coisa.");
  const h = dito(["Oi gente.", "Tudo bem?", "Beleza?", "Hoje eu vou mostrar uma coisa."], { pausas: [0.8, 0.8, 0.8] });
  assert.deepEqual(falasDoQueFalou(r, h, { marcas: [h[5].s - 0.4, h[2].s - 0.4] }).falas, falasDoQueFalou(r, h).falas);
});

test("moeda com escala, decimal com escala e hora e meia são grafia", () => {
  const r = reel("Custa cem mil reais por ano, tem um milhão e meio de views e dura uma hora e meia.");
  const out = falasDoQueFalou(r, dito(["Custa R$ 100 mil por ano, tem 1,5 milhão de views e dura 1h30."]));
  assert.deepEqual(out.mudancas, []);
  assert.deepEqual(out.falas, r.cenas.map((c) => c.fala));
});

// Retomada (16/10): no PROJETOS ele errou o fim, disse "Eu errei essa parte final, então pode cortar" e repetiu.
test("retomada: o trecho errado e o comentário saem; fica a repetição", () => {
  const h = dito([
    "Foi construindo que eu aprendi de verdade.",
    "Me segue pra ver mais conteúdos assim e comenta PROJETOS que eu te mando cada um dos seus",
    "Eu errei essa parte final, então pode cortar e editar essa parte final.",
    "Me segue pra ver mais conteúdos assim e comenta PROJETOS que eu te mando o prompt.",
  ], { pausas: [0.8, 1.5, 1.2] });
  const { cortes, avisos } = acharRetomadas(h, ["Foi construindo que eu aprendi de verdade.", "Me segue pra ver mais coisa assim e comenta PROJETOS que eu te mando o pedido."]);
  assert.deepEqual(avisos, []);
  assert.equal(cortes.length, 1);
  const [c] = cortes;
  assert.deepEqual([c.de, c.ate], [7, 38]);
  assert.match(c.texto, /^Me segue .* cada um dos seus Eu errei .* parte final\.$/);
  // Corta logo antes do trecho errado até logo antes da repetição: a pausa antes do "Me segue" fica a de antes.
  assert.ok(c.a < h[7].s && c.a > h[6].e, `a ${c.a}`);
  assert.ok(c.b < h[38].s && c.b > h[37].e, `b ${c.b}`);
  const { palavras, marcas } = semRetomadas(h, cortes, [h[7].s - 0.3, h[30].s]);
  assert.deepEqual(palavras.map((p) => p.w), [...h.slice(0, 7), ...h.slice(38)].map((p) => p.w));
  // A repetição passa a começar onde o trecho errado começava; a marca dentro do corte vai pro começo dele.
  assert.ok(Math.abs(palavras[7].s - h[7].s) < 1e-9);
  const ms = (t) => Math.round(t * 1000) / 1000;
  assert.deepEqual(marcas, [ms(h[7].s - 0.3), c.a]);
});

test("retomada: sem comentário de erro não corta nada, nem o \"de novo\" que é do roteiro", () => {
  const h = dito(["Você vai ter que esperar pra usar de novo.", "Me segue pra ver mais.", "Me segue pra ver mais."]);
  assert.deepEqual(acharRetomadas(h, ["Você vai ter que esperar pra usar de novo.", "Me segue pra ver mais."]), { cortes: [], avisos: [] });
});

test("retomada: comentário de erro sem repetição achada vira aviso, sem cortar", () => {
  const h = dito(["Oi gente, tudo bem?", "Ih, errei.", "Hoje eu vou mostrar uma coisa."]);
  const r = acharRetomadas(h, ["Oi gente, tudo bem?", "Hoje eu vou mostrar uma coisa."]);
  assert.deepEqual(r.cortes, []);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0].texto, /errei/);
  assert.equal(r.avisos[0].em, h[5].s);
});

test("retomada no meio do parágrafo, voltando pro começo da frase (\"vou falar de novo\")", () => {
  const h = dito(["A terceira é um painel financeiro com entradas e saídas", "não, peraí, vou falar de novo", "A terceira é um painel financeiro completo com entradas e saídas."]);
  const { cortes } = acharRetomadas(h, ["A terceira é um painel financeiro completo, com entradas e saídas."]);
  assert.deepEqual(cortes.map((c) => [c.de, c.ate]), [[0, 16]]);
});

test("a transcrição escreve \"Cloud\" no lugar de \"Claude\": não é mudança, e palavra nova sai como Claude", () => {
  const out = falasDoQueFalou(reel("Agora, se você vai mexer no Claude Code, ele gasta mais."), dito(["Agora, se você vai mexer no Cloud Code, o Cloud gasta muito mais."]));
  assert.deepEqual(out.falas, ["Agora, se você vai mexer no Claude Code, o Claude gasta muito mais."]);
  assert.deepEqual(out.mudancas, [{ cena: 0, antes: "ele", depois: "o Claude" }, { cena: 0, antes: "", depois: "muito" }]);
});

// Revisão em contexto limpo de 16/10 (scratchpad\revisor-retomada): o corte pegava a repetição mais longa em
// qualquer lugar antes do comentário, e cortava fala boa quando ele dizia "errado" ou "de novo" com as palavras dele.
test("retomada: corta o trecho errado logo antes do comentário, não uma frase igual de um parágrafo anterior", () => {
  const roteiro = ["Salva esse vídeo pra ver mais tarde.", "Me segue aí pra ver mais."];
  const h = dito(["Salva esse vídeo pra ver mais tarde.", "Me segue lá", "errei,", "Me segue aí pra ver mais."]);
  const { cortes } = acharRetomadas(h, roteiro);
  assert.deepEqual(cortes.map((c) => [c.de, c.ate, c.texto]), [[7, 11, "Me segue lá errei,"]]);
  assert.deepEqual(falasDoQueFalou(reel(...roteiro), semRetomadas(h, cortes).palavras).falas, ["Salva esse vídeo pra ver mais tarde.", "Me segue aí pra ver mais."]);
});

test("retomada: \"errado\" e \"de novo\" ditos como parte da fala não cortam nada (o que vem depois não refaz o trecho)", () => {
  const casos = [
    [["O Claude Code lê o seu projeto inteiro antes de mexer. Ele acerta de primeira."], ["O Claude Code lê o seu projeto inteiro antes de mexer. Se ele entende errado, o Claude Code pergunta antes. Ele acerta de primeira."]],
    [["Eu testei o Claude Code no meu projeto.", "Aí eu rodei o comando outra vez e ele refez tudo sozinho."], ["Eu testei o Claude Code no meu projeto.", "Aí eu rodei o comando de novo e o Claude Code refez tudo sozinho."]],
  ];
  for (const [roteiro, falado] of casos) {
    const h = dito(falado);
    assert.deepEqual(acharRetomadas(h, roteiro).cortes, [], falado.join(" "));
    assert.equal(falasDoQueFalou(reel(...roteiro), h).falas.join(" "), falado.join(" "));
  }
});

test("\"Cloud\" dito como palavra nova sai \"Claude\" com maiúscula, e \"Google Cloud\" fica", () => {
  const out = falasDoQueFalou(reel("O Claude gasta mais."), dito(["O cloud gasta mais, e eu subi o servidor na Google Cloud."]));
  assert.deepEqual(out.falas, ["O Claude gasta mais, e eu subi o servidor na Google Cloud."]);
});
