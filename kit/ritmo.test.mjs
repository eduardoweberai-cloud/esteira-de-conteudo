// node --test kit/ritmo.test.mjs: auto-ritmo (nenhum vão visual maior que o teto) e tema.
import test from "node:test";
import assert from "node:assert/strict";
import { preencherVaos, maiorVao, palavraChave } from "./ritmo.mjs";
import { temaDe, acento, cssTema, misturar, TEMAS, TEMA_PADRAO } from "./tema.mjs";

const pal = (...ss) => ss.map((s, j) => ({ w: `p${j}`, s, e: s + 0.2 }));

test("preencherVaos: sem vão acima do teto, não inventa batida", () => {
  assert.deepEqual(preencherVaos([0.5, 1.5, 2.6], pal(0.1, 1.0, 2.0), { inicio: 0, fim: 3.2, maxVao: 1.4 }), []);
});

test("preencherVaos: vão de 3 s ganha 2 batidas, cada uma na palavra mais perto do ponto ideal", () => {
  // eventos em 1,0 e 4,0; ideais em 2,0 e 3,0; palavras em 1,9 e 3,2
  const r = preencherVaos([1.0, 4.0], pal(0.2, 1.9, 2.6, 3.2), { inicio: 1.0, fim: 4.0, maxVao: 1.4 });
  assert.deepEqual(r.map((b) => b.t), [1.9, 3.2]);
  assert.deepEqual(r.map((b) => b.j), [1, 3]);
});

test("preencherVaos: no silêncio (sem palavra perto) usa o ponto ideal", () => {
  const r = preencherVaos([0, 3.0], pal(0.1), { inicio: 0, fim: 3.0, maxVao: 1.4 });
  assert.deepEqual(r.map((b) => b.t), [1, 2]);
  assert.deepEqual(r.map((b) => b.j), [-1, -1]);
});

test("preencherVaos: cobre o começo e o fim do trecho também", () => {
  const r = preencherVaos([2.0], [], { inicio: 0, fim: 4.0, maxVao: 1.4 });
  assert.deepEqual(r.map((b) => b.t), [1, 3]);
});

test("maiorVao: mede o maior intervalo entre início, eventos e fim", () => {
  assert.equal(maiorVao([1, 2.5, 3], 0, 4), 1.5);
  assert.equal(maiorVao([], 0, 2), 2);
});

test("preencherVaos: depois de preencher, nenhum vão passa do teto", () => {
  const ev = [0.3, 5.9, 6.2, 12.0];
  const palavras = pal(...Array.from({ length: 40 }, (_, k) => 0.27 * k + 0.05));
  const novos = preencherVaos(ev, palavras, { inicio: 0, fim: 13.5, maxVao: 1.4 });
  assert.ok(maiorVao([...ev, ...novos.map((b) => b.t)], 0, 13.5) <= 1.4);
});

test("palavraChave: prefere destaque, depois número, depois a palavra mais longa", () => {
  const ws = [
    { w: "o", s: 0 },
    { w: "ferramenta", s: 0.2 },
    { w: "ccusage,", s: 0.6 },
    { w: "5.568", s: 1.0 },
  ];
  assert.equal(palavraChave(ws, 0, 1.2, new Set(["ccusage"])), 2);
  assert.equal(palavraChave(ws, 0, 1.2, new Set()), 3);
  assert.equal(palavraChave(ws, 0, 0.5, new Set()), 1);
  assert.equal(palavraChave(ws, 5, 6, new Set()), -1);
});

test("temaDe: tema do reel, padrão quando não diz e erro com a lista quando não existe", () => {
  assert.equal(temaDe({}).nome, TEMA_PADRAO);
  assert.equal(temaDe({ tema: "fliperama" }).nome, "fliperama");
  assert.throws(() => temaDe({ tema: "xadrez" }), /tema "xadrez" não existe \(.*neon.*\)/);
});

test("acento: cores do tema em rodízio por cena", () => {
  const t = TEMAS.neon;
  assert.equal(acento(t, 0), t.cores[0]);
  assert.equal(acento(t, t.cores.length + 1), t.cores[1]);
});

test("todo tema tem pelo menos 4 cores (o anel do Me segue usa acc0 a acc3)", () => {
  for (const t of Object.values(TEMAS)) assert.ok(t.cores.length >= 4, `${t.nome}: ${t.cores.length} cores`);
});

test("cssTema: variáveis de cor do tema vão para o :root", () => {
  const css = cssTema(TEMAS.gradiente);
  assert.match(css, /^:root \{/);
  assert.match(css, /--base: #[0-9a-f]{6}/i);
  assert.match(css, /--acc0: #[0-9a-f]{6}/i);
});

test("misturar: mistura duas cores hex na proporção", () => {
  assert.equal(misturar("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(misturar("#ff0000", "#0000ff", 0), "#ff0000");
  assert.equal(misturar("#ff0000", "#0000ff", 1), "#0000ff");
});
