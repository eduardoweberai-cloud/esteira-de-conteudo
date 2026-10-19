// node --test kit/midia.test.mjs: cena "midia" (imagem real do produto numa moldura de celular).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "./build.mjs";

function montar(reel) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "midia-"));
  const falas = reel.cenas.flatMap((c) => c.fala.split(/\s+/).filter(Boolean));
  const words = falas.map((w, k) => ({ w, s: Math.round(k * 0.25 * 1000) / 1000, e: Math.round((k * 0.25 + 0.22) * 1000) / 1000 }));
  fs.writeFileSync(path.join(dir, "reel.json"), JSON.stringify({ trilha: false, ...reel }));
  fs.writeFileSync(path.join(dir, "words.json"), JSON.stringify(words));
  fs.writeFileSync(path.join(dir, "narracao.wav"), "");
  fs.mkdirSync(path.join(dir, "midia"));
  for (const f of ["scan.jpg", "feed.jpg", "mapa.jpg"]) fs.writeFileSync(path.join(dir, "midia", f), "x");
  return { dir, html: () => fs.readFileSync(path.join(dir, "index.html"), "utf8") };
}

const REEL = {
  titulo: "CAÇA AOS | *GATOS*",
  cenas: [
    {
      tipo: "midia",
      // palavras: Você(0) vê(0.25) um(0.5) gato(0.75) tira(1.0) uma(1.25) foto(1.5) e(1.75) vira(2.0) figurinha(2.25)
      fala: "Você vê um gato tira uma foto e vira figurinha.",
      dados: {
        credito: "imagens: app.exemplo",
        imagens: [{ src: "midia/scan.jpg" }, { src: "midia/feed.jpg", em: "figurinha" }],
      },
    },
    { tipo: "midia", fala: "E marca no seu mapa onde achou cada gato.", dados: { imagens: [{ src: "midia/mapa.jpg", em: "mapa" }] } },
    { tipo: "segue", fala: "Me segue." },
  ],
};

test("midia: moldura de celular com uma tela por imagem, ignorada pela checagem de layout", () => {
  const r = montar(REEL);
  build(r.dir);
  const html = r.html();
  assert.match(html, /<div class="md-cel" id="s0-cel" data-layout-ignore>/);
  assert.match(html, /<img src="midia\/scan\.jpg" alt="" id="s0-i0">/);
  assert.match(html, /<img src="midia\/feed\.jpg" alt="" id="s0-i1">/);
  assert.match(html, /imagens: app\.exemplo/);
});

test("midia: a 2ª tela entra na palavra marcada (figurinha = 2,25 s) e a 1ª no começo da cena", () => {
  const r = montar(REEL);
  build(r.dir);
  const html = r.html();
  assert.match(html, /tl\.fromTo\("#s0-t1",[^\n]*, 2\.25\);/);
  assert.match(html, /tl\.fromTo\("#s0-t0",[^\n]*, 0\.05\);/);
});

test("midia: cada tela tem zoom lento (Ken Burns) até a próxima ou o fim da cena", () => {
  const r = montar(REEL);
  build(r.dir);
  const html = r.html();
  assert.match(html, /tl\.fromTo\("#s0-i0",\{scale:1\},\{scale:1\.1\d*,duration:2\.2,ease:"none"/);
  assert.match(html, /tl\.fromTo\("#s0-i1",\{scale:1\},\{scale:1\.1\d*,duration:/);
});

test("midia: troca de tela conta como mudança grande (o auto-ritmo não precisa tapar esse vão)", () => {
  const r = montar(REEL);
  const out = build(r.dir);
  assert.ok(out.maiorVao <= 1.4, `maior vão ${out.maiorVao}`);
});

test("midia: imagem que não existe na pasta do reel é erro no build", () => {
  const r = montar({ ...REEL, cenas: [{ tipo: "midia", fala: "Oi gato.", dados: { imagens: [{ src: "midia/nao-tem.jpg" }] } }] });
  assert.throws(() => build(r.dir), /midia\/nao-tem\.jpg não existe/);
});
