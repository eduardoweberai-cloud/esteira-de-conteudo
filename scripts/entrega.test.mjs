import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { nomeDoReel, pastaDoReel, entregar as entregarDe, pastaDeEntregaPadrao } from "./entrega.mjs";

// A trava da aprovação tem teste próprio no fim; aqui ela fica de fora.
const entregar = (dir, o) => entregarDe(dir, { conferir: () => null, ...o });

// Lote falso: lotes/<data>/<reel> com renders, producao*.json e legenda.md.
function loteFalso({ perfil = {}, teste = null, legenda = "Comenta “GUIA”\n#ia" } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "entrega-"));
  const dir = path.join(base, "lotes", "2026-10-14", "r3-guia");
  fs.mkdirSync(path.join(dir, "renders"), { recursive: true });
  const registrar = (arquivo, nomeVideo, extra) => {
    const video = path.join(dir, "renders", nomeVideo);
    fs.writeFileSync(video, nomeVideo);
    fs.writeFileSync(path.join(dir, arquivo), JSON.stringify({ video, qualidade: "high", ritmo: { ok: true }, ...extra }));
  };
  registrar("producao.json", "r3-guia-v10.mp4", perfil);
  if (teste) registrar("producao-teste.json", "r3-guia-teste-v3.mp4", teste);
  if (legenda) fs.writeFileSync(path.join(dir, "legenda.md"), legenda);
  return { dir, raiz: path.join(base, "entregas") };
}

test("entrega: nome do reel sai do slug sem o rN", () => {
  assert.equal(nomeDoReel("r2-gratuito"), "GRATUITO");
  assert.equal(nomeDoReel("r12-fim-de-semana"), "FIM DE SEMANA");
  assert.equal(nomeDoReel("sol"), "SOL");
});

test("entrega: uma pasta por reel, com a data do lote e o nome da pasta do reel (r1-ia e r2-ia não se misturam)", () => {
  const { dir, raiz } = loteFalso();
  assert.equal(pastaDoReel(dir, raiz), path.join(raiz, "2026-10-14 r3-guia"));
});

test("entrega: copia o perfil e a versão de teste com nome de gente e a legenda em txt", () => {
  const { dir, raiz } = loteFalso({ teste: {} });
  const r = entregar(dir, { raiz });
  const pasta = path.join(raiz, "2026-10-14 r3-guia");
  assert.deepEqual(fs.readdirSync(pasta).sort(), ["GUIA teste.mp4", "GUIA.mp4", "legenda.txt"]);
  assert.equal(fs.readFileSync(path.join(pasta, "GUIA.mp4"), "utf8"), "r3-guia-v10.mp4");
  assert.equal(fs.readFileSync(path.join(pasta, "GUIA teste.mp4"), "utf8"), "r3-guia-teste-v3.mp4");
  assert.equal(fs.readFileSync(path.join(pasta, "legenda.txt"), "utf8"), "Comenta “GUIA”\n#ia");
  assert.deepEqual(r.copiados.map((c) => path.basename(c)), ["GUIA.mp4", "GUIA teste.mp4"]);
  assert.deepEqual(r.pulados, []);
});

test("entrega: render novo substitui o anterior na pasta (só a versão final fica)", () => {
  const { dir, raiz } = loteFalso();
  entregar(dir, { raiz });
  const video = path.join(dir, "renders", "r3-guia-v11.mp4");
  fs.writeFileSync(video, "v11");
  fs.writeFileSync(path.join(dir, "producao.json"), JSON.stringify({ video, qualidade: "high", ritmo: { ok: true } }));
  entregar(dir, { raiz });
  assert.equal(fs.readFileSync(path.join(raiz, "2026-10-14 r3-guia", "GUIA.mp4"), "utf8"), "v11");
});

test("entrega: não copia produção de teste, draft nem ritmo reprovado, e diz por quê", () => {
  for (const [extra, motivo] of [
    [{ teste: "roteiro não aprovado" }, /roteiro não aprovado/],
    [{ qualidade: "draft" }, /draft/],
    [{ ritmo: { ok: false } }, /ritmo/],
  ]) {
    const { dir, raiz } = loteFalso({ perfil: extra });
    const r = entregar(dir, { raiz });
    assert.deepEqual(r.copiados, []);
    assert.equal(r.pulados.length, 1);
    assert.match(r.pulados[0].motivo, motivo);
    assert.equal(fs.existsSync(path.join(raiz, "2026-10-14 r3-guia", "GUIA.mp4")), false);
  }
});

test("entrega: só a versão pedida quando o produzir acabou de renderizar uma", () => {
  const { dir, raiz } = loteFalso({ teste: {} });
  const r = entregar(dir, { raiz, versoes: ["teste"] });
  assert.deepEqual(r.copiados.map((c) => path.basename(c)), ["GUIA teste.mp4"]);
  assert.equal(fs.existsSync(path.join(raiz, "2026-10-14 r3-guia", "GUIA.mp4")), false);
});

test("entrega: vídeo registrado que sumiu do disco é pulado, sem quebrar", () => {
  const { dir, raiz } = loteFalso({ legenda: null });
  fs.rmSync(path.join(dir, "renders", "r3-guia-v10.mp4"));
  const r = entregar(dir, { raiz });
  assert.deepEqual(r.copiados, []);
  assert.match(r.pulados[0].motivo, /não existe/);
});

test("entrega: a pasta vem de ESTEIRA_ENTREGA (ambiente ou .env) e, sem ela, é entregas/ na raiz do repositório", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "entrega-env-"));
  const env = path.join(base, ".env");
  assert.equal(path.basename(pastaDeEntregaPadrao({ env: {}, arquivo: env })), "entregas");
  fs.writeFileSync(env, "# pasta onde pego os vídeos" + String.fromCharCode(10) + "ESTEIRA_ENTREGA=" + JSON.stringify(path.join(base, "videos")) + String.fromCharCode(10));
  assert.equal(pastaDeEntregaPadrao({ env: {}, arquivo: env }), path.join(base, "videos"));
  assert.equal(pastaDeEntregaPadrao({ env: { ESTEIRA_ENTREGA: path.join(base, "outra") }, arquivo: env }), path.join(base, "outra"), "o ambiente vence o .env");
});

test("entrega: só entrega com o roteiro aprovado agora e na mesma versão do render (legenda não aprovada não vai)", async () => {
  const { escreverRoteiros, processarAprovados } = await import("./aprovacao.mjs");
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "entrega-trava-"));
  const lote = path.join(base, "2026-10-19");
  const dir = path.join(lote, "r1-oi");
  fs.mkdirSync(path.join(dir, "renders"), { recursive: true });
  fs.writeFileSync(path.join(dir, "reel.json"), JSON.stringify({ slug: "r1-oi", titulo: "OI | *GENTE*", cenas: [{ tipo: "frase", fala: "Oi gente." }] }));
  fs.writeFileSync(path.join(dir, "legenda.md"), "Oi.\n");
  escreverRoteiros(lote);
  const f = path.join(dir, "roteiro.md");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("Aprovado: não", "Aprovado: sim"));
  processarAprovados(lote);
  const aprovado = JSON.parse(fs.readFileSync(path.join(dir, "reel.json"), "utf8")).aprovado.roteiro;
  const video = path.join(dir, "renders", "r1-oi-v1.mp4");
  fs.writeFileSync(video, "v1");
  fs.writeFileSync(path.join(dir, "producao.json"), JSON.stringify({ video, qualidade: "high", ritmo: { ok: true }, roteiro: aprovado }));
  const raiz = path.join(base, "entregas");
  assert.deepEqual(entregarDe(dir, { raiz }).copiados.map((c) => path.basename(c)), ["OI.mp4"]);
  // Reaberto pra revisar: não entrega.
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("Aprovado: sim", "Aprovado: não"));
  fs.writeFileSync(path.join(dir, "legenda.md"), "Legenda que ninguém aprovou.\n");
  let r = entregarDe(dir, { raiz });
  assert.deepEqual(r.copiados, []);
  assert.match(r.pulados[0].motivo, /não está aprovado/);
  // Aprovado de novo com outra legenda: o render é da aprovação anterior, produza de novo.
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("Aprovado: não", "Aprovado: sim").replace(/Oi\.\n$/, "Oi de novo.\n"));
  processarAprovados(lote);
  r = entregarDe(dir, { raiz });
  assert.deepEqual(r.copiados, []);
  assert.match(r.pulados[0].motivo, /mudou depois deste render/);
  assert.equal(fs.readFileSync(path.join(raiz, "2026-10-19 r1-oi", "legenda.txt"), "utf8"), "Oi.\n", "a legenda entregue é a aprovada daquele render");
});
