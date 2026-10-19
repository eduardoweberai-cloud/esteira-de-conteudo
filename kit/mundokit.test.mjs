// Partes puras do mundo-kit (blocos 3D dos reels): determinismo, cortes de plano e tempo integrado.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { prng, suave, planoEm, tempoIntegrado } from "./assets/vendor/mundo-kit.mjs";

test("mundo-kit: prng com a mesma semente dá a mesma sequência (render em paralelo e fora de ordem)", () => {
  const a = prng(42);
  const b = prng(42);
  const sa = [a(), a(), a()];
  assert.deepEqual(sa, [b(), b(), b()]);
  assert.ok(sa.every((x) => x >= 0 && x < 1));
  const c = prng(43);
  assert.notDeepEqual(sa, [c(), c(), c()], "semente diferente tem que dar sequência diferente");
  const seq = prng(42);
  const valores = [...Array(50)].map(() => seq());
  assert.ok(new Set(valores).size > 45, "a sequência varia (não é constante)");
});

test("mundo-kit: suave vai de 0 a 1 sem passar dos limites", () => {
  assert.equal(suave(1, 2, 0), 0);
  assert.equal(suave(1, 2, 3), 1);
  assert.equal(suave(1, 2, 1.5), 0.5);
});

test("mundo-kit: planoEm devolve o plano que começou por último até t (corte exato na marca)", () => {
  const planos = [[0, "espaco"], [1.7, "terra"], [10.5, "orbita"]];
  assert.equal(planoEm(planos, 0), "espaco");
  assert.equal(planoEm(planos, 1.69), "espaco");
  assert.equal(planoEm(planos, 1.7), "terra");
  assert.equal(planoEm(planos, 99), "orbita");
});

test("mundo-kit: tempoIntegrado muda a velocidade sem pular (a multidão do SOL teletransportava)", () => {
  const trechos = [[0, 1], [17, 0.15], [37, 1]];
  const f = (t) => tempoIntegrado(trechos, t);
  assert.equal(f(10), 10);
  for (const corte of [17, 37]) assert.ok(Math.abs(f(corte + 1e-6) - f(corte - 1e-6)) < 1e-4, `pulo em ${corte}`);
  assert.ok(Math.abs(f(27) - (17 + 0.15 * 10)) < 1e-9);
  assert.ok(Math.abs(f(40) - (17 + 0.15 * 20 + 3)) < 1e-9);
});

test("mundo-kit: olhos do mascote 3D nos furos do desenho do kit (colunas 5 e 12, como o mascote de pixel)", () => {
  const fonte = fs.readFileSync(new URL("./assets/vendor/mundo-kit.mjs", import.meta.url), "utf8");
  const linha = fonte.match(/const CLAWD = \[([^\]]+)\]/)[1].split(",")[1].replace(/[" ]/g, "");
  const furos = [...linha].map((c, i) => (c === "0" && i > 2 && i < 15 ? i : -1)).filter((i) => i >= 0);
  const olhos = fonte.match(/for \(const x of \[(\d+), (\d+)\]\)/).slice(1).map(Number);
  assert.deepEqual(olhos, furos);
});
