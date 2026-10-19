#!/usr/bin/env node
// Métrica de ritmo: mede no MP4 renderizado se a tela muda cedo e nunca fica parada, e se há trilha.
// Uso: node scripts/medir-ritmo.mjs <video.mp4> [--sem-mascara] [--sem-trilha] [--json <saida.json>]
//
// Vídeo: cada quadro (amostrado a 5 por segundo) é comparado com o de 0,2 s antes; "mudança" = mais de 1% da tela
// mudou mais de 24 níveis de cinza. A faixa da legenda fica tapada (legenda sozinha não é animação).
// Áudio: nível RMS em janelas de 50 ms; o piso (2% mais baixos) acima de -70 dB indica trilha sob a voz.
// Metas: 1ª mudança até 1 s, nenhum trecho parado de mais de 2 s (reel que demora a mexer perde quem rola o feed).
// Reel sem música (nenhuma faixa no musicas.json): --sem-trilha, e a falta de trilha só avisa.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Piso da trilha (16/10): os 2% mais baixos acima de -70 dB. Com a música 22 dB abaixo da voz e a voz quase sem
// pausa (o respiro é silêncio digital), a voz sozinha mede -100 a -120 dB e com a faixa mais calma, -52 dB.
export const METAS = { primeiraMax: 1, paradoMax: 2, pisoTrilhaDb: -70, pisoPercentil: 0.02 };
const r3 = (x) => Math.round(x * 1000) / 1000;
const fmt = (x) => (Math.round(x * 10) / 10).toFixed(1).replace(".", ",");

export function lerMetadata(txt, chave) {
  const out = [];
  for (const l of String(txt).split(/\r?\n/)) {
    const i = l.indexOf(chave + "=");
    if (i < 0) continue;
    const v = parseFloat(l.slice(i + chave.length + 1));
    out.push(Number.isFinite(v) ? v : -120);
  }
  return out;
}

// serie[j] = % da tela que mudou entre o quadro (j+1)*passo e o de j*passo.
export function analisarSerie(serie, { passo = 0.2, limiar = 1, grande = 5, janela = 3 } = {}) {
  const duracao = r3((serie.length + 1) * passo);
  const t = (j) => r3((j + 1) * passo);
  let primeiraMudanca = null;
  let maiorParado = 0;
  let inicioParado = 0;
  let ultima = 0;
  serie.forEach((v, j) => {
    if (v <= limiar) return;
    if (primeiraMudanca === null) primeiraMudanca = t(j);
    if (t(j) - ultima > maiorParado) (maiorParado = r3(t(j) - ultima)), (inicioParado = ultima);
    ultima = t(j);
  });
  if (duracao - ultima > maiorParado) (maiorParado = r3(duracao - ultima)), (inicioParado = ultima);
  let trocasGrandes = 0;
  serie.forEach((v, j) => {
    if (v <= grande) return;
    for (let k = j - janela; k <= j + janela; k++) {
      if (k === j || serie[k] === undefined) continue;
      if (serie[k] > v || (serie[k] === v && k < j)) return;
    }
    trocasGrandes++;
  });
  return {
    duracao,
    primeiraMudanca,
    maiorParado,
    inicioParado: r3(inicioParado),
    movimentoPct: Math.round((100 * serie.filter((v) => v > limiar).length) / Math.max(1, serie.length)),
    trocasGrandes,
    trocaGrandeACada: Math.round((duracao / Math.max(1, trocasGrandes)) * 10) / 10,
  };
}

export function avaliarRitmo(r, { primeiraMax = METAS.primeiraMax, paradoMax = METAS.paradoMax } = {}) {
  const motivos = [];
  if (r.primeiraMudanca == null) motivos.push("nenhuma mudança visual");
  else if (r.primeiraMudanca > primeiraMax) motivos.push(`1ª mudança em ${fmt(r.primeiraMudanca)} s (meta: até ${fmt(primeiraMax)} s)`);
  if (r.maiorParado > paradoMax) motivos.push(`${fmt(r.maiorParado)} s parado a partir de ${fmt(r.inicioParado ?? 0)} s (meta: até ${fmt(paradoMax)} s)`);
  return { ok: motivos.length === 0, motivos };
}

export function analisarTrilha(rms, { piso = METAS.pisoTrilhaDb } = {}) {
  const s = [...rms].sort((a, b) => a - b);
  const pisoDb = Math.round((s[Math.floor(METAS.pisoPercentil * (s.length - 1))] ?? -120) * 10) / 10;
  return { ok: pisoDb > piso, pisoDb };
}

// ---------- ffmpeg ----------
function ffmpegMetadata(video, filtro, chave, chaveArquivo) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ritmo-"));
  const arq = `${chaveArquivo}.txt`;
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", path.resolve(video), ...filtro(arq), "-f", "null", "-"], { cwd: tmp, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg falhou ao medir ${video}: ${r.stderr}`);
  const vals = lerMetadata(fs.readFileSync(path.join(tmp, arq), "utf8"), chave);
  fs.rmSync(tmp, { recursive: true, force: true });
  return vals;
}

export function medir(video, { mascaraLegenda = true, exigeTrilha = true } = {}) {
  const mascara = mascaraLegenda ? "drawbox=x=0:y=ih*0.72:w=iw:h=ih*0.075:color=black:t=fill," : "";
  const serie = ffmpegMetadata(
    video,
    (arq) => ["-vf", `${mascara}fps=5,scale=360:640,format=gray,tblend=all_mode=difference,lutyuv=y='if(gt(val\\,24)\\,255\\,0)',signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${arq}`],
    "lavfi.signalstats.YAVG",
    "video",
  ).map((v) => (v / 255) * 100);
  const rms = ffmpegMetadata(
    video,
    (arq) => ["-af", `aformat=channel_layouts=mono,aresample=44100,asetnsamples=2205,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=${arq}`],
    "lavfi.astats.Overall.RMS_level",
    "audio",
  );
  const visual = analisarSerie(serie);
  const avaliacao = avaliarRitmo(visual);
  const trilha = analisarTrilha(rms);
  const avisos = [];
  const semTrilha = `sem trilha: piso do áudio em ${fmt(trilha.pisoDb)} dB (meta: acima de ${METAS.pisoTrilhaDb} dB)`;
  if (!trilha.ok) (exigeTrilha ? avaliacao.motivos : avisos).push(exigeTrilha ? semTrilha : `${semTrilha}; o reel não tem música no musicas.json`);
  avaliacao.ok = avaliacao.motivos.length === 0;
  return { video: path.resolve(video), ...visual, trilha, ...avaliacao, avisos };
}

export function resumo(m) {
  return [
    `[ritmo] ${path.basename(m.video)}: ${m.ok ? "APROVADO" : "REPROVADO"}`,
    `  1ª mudança ${m.primeiraMudanca == null ? "nenhuma" : fmt(m.primeiraMudanca) + " s"} · maior trecho parado ${fmt(m.maiorParado)} s (em ${fmt(m.inicioParado)} s) · tela mudando ${m.movimentoPct}% · troca grande a cada ${fmt(m.trocaGrandeACada)} s · trilha ${m.trilha.ok ? "sim" : "não"} (piso ${fmt(m.trilha.pisoDb)} dB)`,
    ...m.motivos.map((x) => `  - ${x}`),
    ...(m.avisos ?? []).map((x) => `  aviso: ${x}`),
  ].join("\n");
}

// Rodado direto (compara o caminho real: pasta aberta por junção ou link simbólico também conta).
if (process.argv[1] && fs.realpathSync.native(path.resolve(process.argv[1])) === fs.realpathSync.native(fileURLToPath(import.meta.url))) {
  const video = process.argv[2];
  if (!video) {
    console.error("uso: node scripts/medir-ritmo.mjs <video.mp4> [--sem-mascara] [--sem-trilha] [--json <saida.json>]");
    process.exit(1);
  }
  const m = medir(video, { mascaraLegenda: !process.argv.includes("--sem-mascara"), exigeTrilha: !process.argv.includes("--sem-trilha") });
  const j = process.argv.indexOf("--json");
  if (j > 0 && process.argv[j + 1]) fs.writeFileSync(process.argv[j + 1], JSON.stringify(m, null, 2));
  console.log(resumo(m));
  process.exit(m.ok ? 0 : 3);
}
