// node --test kit/kit.test.mjs (sem dependências além do Node)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, norm } from "./build.mjs";

test("norm tira acento, caixa e pontuação", () => {
  assert.equal(norm("Cérebro,"), "cerebro");
  assert.equal(norm("DM."), "dm");
});

test("build: cena começa na primeira palavra da fala e o fecho segura até o fim", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kit-"));
  fs.writeFileSync(
    path.join(dir, "reel.json"),
    JSON.stringify({
      titulo: "A *b* | C",
      palavra: "GUIA",
      segura_fim: 1,
      trilha: false,
      cenas: [
        { tipo: "frase", fala: "Um dois.", dados: { texto: "Um dois" } },
        { tipo: "comenta", fala: "Comenta guia." },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(dir, "words.json"),
    JSON.stringify([
      { w: "Um", s: 0.1, e: 0.3 },
      { w: "dois.", s: 0.3, e: 0.6 },
      { w: "Comenta", s: 1.0, e: 1.4 },
      { w: "guia.", s: 1.4, e: 1.8 },
    ]),
  );
  fs.writeFileSync(path.join(dir, "narracao.wav"), "");
  const r = build(dir);
  assert.equal(r.scenes, 2);
  assert.equal(r.total, 2.8);
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.match(html, /id="s1" class="clip cena" data-start="0.92" data-duration="1.88"/);
  assert.match(html, /data-duration="2.8"/);
  assert.match(html, /class="lw kw" id="w3">guia\.</);
});

test("build recusa words.json que não casa com as falas", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kit-"));
  fs.writeFileSync(path.join(dir, "reel.json"), JSON.stringify({ cenas: [{ tipo: "frase", fala: "a b c", dados: { texto: "x" } }] }));
  fs.writeFileSync(path.join(dir, "words.json"), JSON.stringify([{ w: "a", s: 0, e: 1 }]));
  fs.writeFileSync(path.join(dir, "narracao.wav"), "");
  assert.throws(() => build(dir), /words.json tem 1 palavras/);
});

test("build copia gsap e three do node_modules (nada de biblioteca de terceiros vendorizada no repositório)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kit-"));
  fs.writeFileSync(path.join(dir, "reel.json"), JSON.stringify({ trilha: false, cenas: [{ tipo: "frase", fala: "a", dados: { texto: "a" } }] }));
  fs.writeFileSync(path.join(dir, "words.json"), JSON.stringify([{ w: "a", s: 0, e: 0.3 }]));
  fs.writeFileSync(path.join(dir, "narracao.wav"), "");
  build(dir);
  for (const f of ["gsap.min.js", "three.module.min.js", "three.core.min.js", "mundo-kit.mjs"]) {
    assert.ok(fs.existsSync(path.join(dir, "assets", "vendor", f)), f);
  }
  const kitVendor = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets", "vendor");
  assert.deepEqual(fs.readdirSync(kitVendor), ["mundo-kit.mjs"]);
});
