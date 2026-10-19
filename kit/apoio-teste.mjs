// Apoio dos testes do kit: pasta de reel temporária e sons, foto e música gerados com ffmpeg
// (o repositório não traz efeito sonoro, música nem foto de ninguém).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Reel de teste: palavras de 0,25 s em sequência, sem pausa; narração vazia.
export function montar(reel, extra = {}, prefixo = "kit-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
  const falas = reel.cenas.flatMap((c) => c.fala.split(/\s+/).filter(Boolean));
  const words = falas.map((w, k) => ({ w, s: Math.round(k * 0.25 * 1000) / 1000, e: Math.round((k * 0.25 + 0.22) * 1000) / 1000 }));
  fs.writeFileSync(path.join(dir, "reel.json"), JSON.stringify({ trilha: false, ...reel }));
  fs.writeFileSync(path.join(dir, "words.json"), JSON.stringify(words));
  fs.writeFileSync(path.join(dir, "narracao.wav"), "");
  for (const [f, body] of Object.entries(extra)) fs.writeFileSync(path.join(dir, f), body);
  return { dir, words, html: () => fs.readFileSync(path.join(dir, "index.html"), "utf8") };
}

export function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg falhou: ${r.stderr}`);
}

// Os nomes de efeito que o kit pede (kit/assets/sfx/LEIA-ME.md).
export const NOMES_SONS = [
  "pop", "pop-2", "pop-3", "pop-4", "whoosh", "whoosh-short", "whoosh-cinematic", "impact-curto", "glitch-curto",
  "sparkle", "typing", "ping", "key-press", "notification", "click", "click-soft", "error", "chime",
];

// Pasta com um bipe curto para cada nome pedido (ou só os `nomes` dados).
export function sonsDeTeste(nomes = NOMES_SONS) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sons-"));
  const base = path.join(dir, "_bipe.mp3");
  ffmpeg(["-f", "lavfi", "-i", "sine=frequency=880:duration=0.3", base]);
  for (const n of nomes) fs.copyFileSync(base, path.join(dir, `${n}.mp3`));
  fs.rmSync(base);
  return dir;
}

// perfil.json de teste numa pasta própria; com `foto`, gera um PNG quadrado.
export function perfilDeTeste({ nome = "Ana Teste", user = "@ana.teste", foto = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "perfil-"));
  if (foto) ffmpeg(["-f", "lavfi", "-i", "color=c=red:s=64x64", "-frames:v", "1", path.join(dir, "foto.png")]);
  const arquivo = path.join(dir, "perfil.json");
  fs.writeFileSync(arquivo, JSON.stringify({ nome, user, foto: foto ? "foto.png" : null }));
  return arquivo;
}
