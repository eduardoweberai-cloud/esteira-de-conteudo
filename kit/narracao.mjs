// Montagem da narração a partir da sua gravação: emenda os trechos com um respiro fixo, acelera sem mudar o tom,
// nivela o volume e escala o tempo de cada palavra na mesma proporção.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const r3 = (x) => Math.round(x * 1000) / 1000;

function ffmpeg(args) {
  const ff = spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...args]);
  if (ff.error) throw new Error(`ffmpeg não encontrado no PATH (instale em https://ffmpeg.org/download.html): ${ff.error.message}`);
  if (ff.status !== 0) throw new Error(`ffmpeg falhou: ${ff.stderr}`);
}

// Áudio acelerado com atempo (mantém o tom): os tempos encolhem na mesma proporção.
export function escalarTempos(words, fator) {
  if (fator === 1) return words;
  const r = (x) => Math.round((x / fator) * 1000) / 1000;
  return words.map((w) => ({ ...w, s: r(w.s), e: r(w.e) }));
}

// Emenda trechos de fala: recorta cada um na voz (com folga) e põe um respiro fixo entre eles.
export function juntarFalas(partes, { respiro = 0.08, folgaIni = 0.03, folgaFim = 0.06 } = {}) {
  let off = 0;
  const words = [];
  const cortes = [];
  for (const p of partes) {
    const a = Math.max(0, p.words[0].s - folgaIni);
    const b = p.words[p.words.length - 1].e + folgaFim;
    cortes.push({ a: r3(a), b: r3(b) });
    for (const w of p.words) words.push({ w: w.w, s: r3(off + w.s - a), e: r3(off + w.e - a) });
    off += b - a + respiro;
  }
  return { words, cortes };
}

// narracao-original.wav + words-base.json -> narracao.mp3 (acelerada, -16 LUFS) + words.json.
export function reacelerar(dir, fator) {
  const filtros = [fator !== 1 ? `atempo=${fator}` : null, "loudnorm=I=-16:TP=-1.5:LRA=11"].filter(Boolean).join(",");
  ffmpeg(["-i", path.join(dir, "narracao-original.wav"), "-af", filtros, "-ar", "44100", "-b:a", "160k", path.join(dir, "narracao.mp3")]);
  const words = escalarTempos(JSON.parse(fs.readFileSync(path.join(dir, "words-base.json"), "utf8")), fator);
  fs.writeFileSync(path.join(dir, "words.json"), JSON.stringify(words));
  return { palavras: words.length, duracao: words[words.length - 1].e };
}
