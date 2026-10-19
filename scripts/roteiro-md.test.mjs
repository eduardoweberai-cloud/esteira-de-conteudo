// node --test scripts/roteiro-md.test.mjs: o roteiro que você revisa e aprova (roteiro.md), de e para markdown.
import test from "node:test";
import assert from "node:assert/strict";
import { paraMarkdown, deMarkdown } from "./roteiro-md.mjs";

// Reel fictício com isca (palavra e DM no fecho), como sai de um roteiro da esteira.
const COM_ISCA = {
  reel: {
    titulo: "ESSE REEL SAIU | DE UM *TEXTO*",
    palavra: "KIT",
    dm: { texto: "Aqui está o *passo a passo*.", botao: "abrir o guia" },
    cenas: [
      { tipo: "hook", fala: "Esse vídeo inteiro saiu de um arquivo de texto." },
      { tipo: "segue", fala: "Me segue pra ver mais," },
      { tipo: "comenta", fala: "e comenta KIT que eu te mando o passo a passo." },
    ],
  },
  legenda: "Comenta KIT que eu te mando o passo a passo.\n\n#reels",
};

test("ida e volta sem perder texto (reel com palavra e DM)", () => {
  const a = COM_ISCA;
  const r = deMarkdown(paraMarkdown(a));
  assert.equal(r.titulo, a.reel.titulo);
  assert.deepEqual(r.falas, a.reel.cenas.map((c) => c.fala));
  assert.equal(r.legenda, a.legenda.trim());
  assert.equal(r.palavra, a.reel.palavra);
  assert.deepEqual(r.dm_video, a.reel.dm);
});

const MINIMO = {
  reel: { titulo: "E SE A TERRA | FOSSE *ENGOLIDA*", cenas: [{ tipo: "hook", fala: "Primeira fala." }, { tipo: "frase", fala: "Segunda fala." }] },
  legenda: "Legenda curta.\n\n#ia",
};

test("sem isca: não tem Comenta e DM", () => {
  const md = paraMarkdown(MINIMO);
  assert.doesNotMatch(md, /## Comenta e DM/);
  const r = deMarkdown(md);
  assert.equal(r.palavra, null);
  assert.equal(r.dm_video, null);
  assert.deepEqual(r.falas, ["Primeira fala.", "Segunda fala."]);
});

test("título com várias linhas vira ' | ' e volta", () => {
  const md = paraMarkdown(MINIMO);
  assert.match(md, /## Título na tela\nE SE A TERRA\nFOSSE \*ENGOLIDA\*\n/);
  assert.equal(deMarkdown(md).titulo, "E SE A TERRA | FOSSE *ENGOLIDA*");
});

test("parágrafo novo vira fala nova e quebra de linha dentro do parágrafo vira espaço", () => {
  const md = paraMarkdown(MINIMO).replace("Segunda fala.", "Segunda fala\ncontinua aqui.\n\nTerceira fala nova.");
  assert.deepEqual(deMarkdown(md).falas, ["Primeira fala.", "Segunda fala continua aqui.", "Terceira fala nova."]);
});

test("a dica entre parênteses da Narração não vira fala", () => {
  const md = paraMarkdown(MINIMO);
  assert.match(md, /\(cada parágrafo vira uma cena\)/);
  assert.ok(!deMarkdown(md).falas.some((f) => f.includes("cada parágrafo")));
});

test("seção obrigatória apagada lança erro com o nome dela", () => {
  const md = paraMarkdown(MINIMO).replace("## Legenda do post", "## Legenda");
  assert.throws(() => deMarkdown(md), /falta a seção "Legenda do post"/);
  assert.throws(() => deMarkdown("## Narração\nOi."), /falta a seção "Título na tela"/);
});

test("narração vazia lança erro", () => {
  const md = paraMarkdown(MINIMO).replace(/## Narração\n[\s\S]*?\n## Legenda/, "## Narração\n\n## Legenda");
  assert.throws(() => deMarkdown(md), /"Narração" está vazia/);
});

test("Comenta e DM sem Palavra lança erro", () => {
  const md = paraMarkdown(COM_ISCA).replace(/^Palavra: .*$/m, "");
  assert.throws(() => deMarkdown(md), /Palavra/);
});

test("CRLF do Windows é aceito", () => {
  const md = paraMarkdown(MINIMO).replace(/\n/g, "\r\n");
  assert.deepEqual(deMarkdown(md).falas, ["Primeira fala.", "Segunda fala."]);
});

// ─── revisão de 13/10 ─────────────────────────────────────────────────────────

test("título '## ' desconhecido no meio do roteiro é erro (não corta a narração em silêncio)", () => {
  const md = paraMarkdown(MINIMO).replace("Segunda fala.", "## Parte 2\nSegunda fala.");
  assert.throws(() => deMarkdown(md), /seção "Parte 2" não existe/);
});

test("seção repetida é erro", () => {
  const md = paraMarkdown(MINIMO) + "\n## Legenda do post\nOutra legenda.\n";
  assert.throws(() => deMarkdown(md), /seção "Legenda do post" aparece 2 vezes/);
});

test("a dica colada na primeira fala, sem linha em branco, não vira narração", () => {
  const md = paraMarkdown(MINIMO).replace("(cada parágrafo vira uma cena)\n\nPrimeira fala.", "(cada parágrafo vira uma cena)\nPrimeira fala.");
  assert.deepEqual(deMarkdown(md).falas, ["Primeira fala.", "Segunda fala."]);
});

test("linha desconhecida no Comenta e DM é erro e diz quais linhas existem", () => {
  const md = paraMarkdown(COM_ISCA).replace("Palavra: KIT", "Palavra: KIT\nAbertura: Opa!");
  assert.throws(() => deMarkdown(md), /linha não reconhecida em "Comenta e DM": Abertura: Opa! \(use "Palavra: \.\.\."/);
});

test("o que vem antes do primeiro título (a linha Aprovado e a dica) não é roteiro", () => {
  const md = "Aprovado: não\n\n> Revise e troque para sim.\n\n" + paraMarkdown(MINIMO);
  assert.deepEqual(deMarkdown(md).falas, ["Primeira fala.", "Segunda fala."]);
});
