// node --test kit/faixa.test.mjs: a faixa de palavra (batida "palavra" e quadro "palavra" do gancho) é uma linha só.
// Texto longo saía da tela de 1080 ("+190 MIL G" saía cortado no fliperama). O build encolhe a fonte.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fonteDaFaixa } from "./batidas.mjs";
import { build } from "./build.mjs";

test("faixa: texto que cabe fica no tamanho do tema", () => {
  assert.equal(fonteDaFaixa("*+190 MIL*", "fliperama"), null);
  assert.equal(fonteDaFaixa("GRÁTIS", "neon"), null);
});

test("faixa: fliperama (1 em por letra) encolhe até caber em 1000 px", () => {
  const px = fonteDaFaixa("*+190 MIL* GATOS", "fliperama");
  assert.ok(px < 92, `esperava menos de 92, veio ${px}`);
  assert.ok(14 * px + 216 <= 1000);
});

test("faixa: tema de fonte normal conta 0,7 em por letra", () => {
  const px = fonteDaFaixa("IA QUE VAI MUDAR O MUNDO", "neon");
  assert.ok(px < 118);
  assert.ok(24 * px * 0.7 + 88 <= 1000);
});

test("faixa: quadro do gancho também encolhe", () => {
  assert.ok(fonteDaFaixa("3 SEMANAS GASTANDO", "neon", "qp") < 150);
  assert.equal(fonteDaFaixa("3 *SEMANAS*", "neon", "qp"), null);
});

test("build: batida palavra longa sai com a fonte encolhida no html", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "faixa-"));
  const fala = "Já são mais de cento e noventa mil gatos";
  const words = fala.split(" ").map((w, k) => ({ w, s: k * 0.25, e: k * 0.25 + 0.22 }));
  fs.writeFileSync(path.join(dir, "reel.json"), JSON.stringify({
    trilha: false, tema: "fliperama", titulo: "CAÇA AOS | *GATOS*",
    cenas: [{ tipo: "frase", fala, dados: { texto: "*GATOS*" }, batidas: [
      { tipo: "palavra", texto: "*+190 MIL* GATOS", em: "mil" },
      { tipo: "palavra", texto: "*GATOS*", em: "gatos" },
    ] }],
  }));
  fs.writeFileSync(path.join(dir, "words.json"), JSON.stringify(words));
  fs.writeFileSync(path.join(dir, "narracao.wav"), "");
  build(dir);
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  const px = fonteDaFaixa("*+190 MIL* GATOS", "fliperama");
  assert.match(html, new RegExp(`<span class="bt-txt" style="font-size:${px}px">`));
  assert.match(html, /<span class="bt-txt"><em>GATOS<\/em><\/span>/);
});
