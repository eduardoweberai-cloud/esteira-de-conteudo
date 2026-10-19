// Trilha de fundo do reel: a faixa (sua, em kit/assets/musica; ver kit/trilhas.mjs) é cortada no tamanho do reel a
// partir de `inicio`, ganha fade de entrada e saída e é normalizada em -16 LUFS; o `volume` do <audio> a deixa
// 22 dB abaixo da voz.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { num } from "./html.mjs";
import { lufsDe, volumeDaTrilha, caminhoDaFaixa, escolherTrilha, faixaNoCatalogo } from "./trilhas.mjs";

export function comandoTrilha({ entrada, saida, duracao, inicio = 0, fadeIn = 0.35, fadeOut = 1.2 }) {
  const fo = num(Math.max(0, duracao - fadeOut));
  return [
    "-v", "error", "-y",
    "-stream_loop", "-1",
    "-ss", String(inicio),
    "-i", entrada,
    "-t", String(num(duracao)),
    "-af", `afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${fo}:d=${fadeOut},loudnorm=I=-16:TP=-2:LRA=11`,
    "-ar", "44100", "-ac", "2", "-b:a", "192k",
    saida,
  ];
}

const SEM_MUSICA = "ponha faixas em kit/assets/musica e descreva no musicas.json, como ensina o kit/assets/musica/LEIA-ME.md";

// A faixa do reel: a que o reel.json fixou ou, sem ela, uma do clima no catálogo (a semente é o slug).
// Devolve { arquivo, inicio } ou { aviso } quando não há música pra tocar.
export function faixaDoReel(trilha = {}, { catalogo, semente = "" } = {}) {
  if (trilha.arquivo) return { arquivo: trilha.arquivo, inicio: trilha.inicio };
  const clima = trilha.clima ?? "conversa";
  let arquivo;
  try {
    arquivo = escolherTrilha({ clima, semente, catalogo });
  } catch (e) {
    return { aviso: `${e.message}: reel sai sem trilha` };
  }
  if (!arquivo) return { aviso: `nenhuma música do clima "${clima}": reel sai sem trilha (${SEM_MUSICA})` };
  return { arquivo, inicio: trilha.inicio };
}

// Devolve { src, volume } para o <audio>, ou { aviso } se não há faixa (o medidor de ritmo avisa reel sem trilha).
// Sem volume no reel, a trilha fica 22 dB abaixo da voz medida (`voz`: a narração do reel).
export function prepararTrilha(dir, cfg, total, voz, { catalogo } = {}) {
  const arquivo = caminhoDaFaixa(cfg.arquivo, { catalogo, dir });
  if (!fs.existsSync(arquivo)) return { aviso: `trilha ${cfg.arquivo} não encontrada: reel sai sem música (${SEM_MUSICA})` };
  const inicio = cfg.inicio ?? faixaNoCatalogo(cfg.arquivo, catalogo)?.inicio ?? 0;
  const saida = path.join(dir, "assets", "trilha.mp3");
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  const r = spawnSync("ffmpeg", comandoTrilha({ entrada: arquivo, saida, duracao: total, inicio }), { encoding: "utf8" });
  if (r.status !== 0) return { aviso: `trilha ${cfg.arquivo}: ffmpeg falhou (${String(r.stderr).trim().split(/\r?\n/).pop()})` };
  return { src: "assets/trilha.mp3", volume: cfg.volume ?? volumeDaTrilha(lufsDe(voz)) };
}
