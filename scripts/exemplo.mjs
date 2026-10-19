#!/usr/bin/env node
// Prévia do reel de exemplo, sem voz e sem chave de API: estima o tempo de cada palavra (0,226 s), gera uma narração
// muda, monta o projeto HyperFrames com o kit e renderiza o MP4.
// Uso: npm run exemplo [-- --alta] [-- --sem-render]
//   --alta        qualidade de entrega (mais lento); o padrão é rascunho
//   --sem-render  só monta o projeto (exemplo/saida/index.html), sem gerar o vídeo
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build, tokens } from "../kit/build.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGEM = path.join(RAIZ, "exemplo");
const SAIDA = path.join(ORIGEM, "saida");
const SEG_POR_PALAVRA = 0.226;
const PAUSA_ENTRE_CENAS = 0.3;
const args = process.argv.slice(2);

function exigir(cmd) {
  const r = spawnSync(cmd, ["-version"], { encoding: "utf8" });
  if (r.error || r.status !== 0) {
    console.error(`[exemplo] ${cmd} não encontrado no PATH. Instale o FFmpeg (https://ffmpeg.org/download.html) e rode de novo.`);
    process.exit(1);
  }
}

// Tempos estimados: cada palavra dura 0,2 s e começa 0,226 s depois da anterior; respiro de 0,3 s entre cenas.
export function palavrasEstimadas(reel, { inicio = 0.15 } = {}) {
  const words = [];
  let t = inicio;
  for (const c of reel.cenas) {
    for (const w of tokens(c.fala)) {
      words.push({ w, s: Math.round(t * 1000) / 1000, e: Math.round((t + 0.2) * 1000) / 1000 });
      t += SEG_POR_PALAVRA;
    }
    t += PAUSA_ENTRE_CENAS;
  }
  return { words, fim: t };
}

// Rodado direto (compara o caminho real: pasta aberta por junção ou link simbólico também conta).
if (process.argv[1] && fs.realpathSync.native(path.resolve(process.argv[1])) === fs.realpathSync.native(fileURLToPath(import.meta.url))) {
  exigir("ffmpeg");
  exigir("ffprobe");
  // Limpa o conteúdo, não a pasta: no Windows a pasta aberta num terminal não pode ser apagada.
  fs.mkdirSync(SAIDA, { recursive: true });
  for (const f of fs.readdirSync(SAIDA)) fs.rmSync(path.join(SAIDA, f), { recursive: true, force: true });
  for (const f of ["reel.json", "mundo.mjs"]) fs.copyFileSync(path.join(ORIGEM, f), path.join(SAIDA, f));

  const reel = JSON.parse(fs.readFileSync(path.join(SAIDA, "reel.json"), "utf8"));
  const { words, fim } = palavrasEstimadas(reel);
  fs.writeFileSync(path.join(SAIDA, "words.json"), JSON.stringify(words, null, 1));
  const duracao = (fim + (reel.segura_fim ?? 1.6)).toFixed(2);
  const muda = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", duracao, path.join(SAIDA, "narracao.wav")], { encoding: "utf8" });
  if (muda.status !== 0) throw new Error(`ffmpeg não gerou a narração muda: ${muda.stderr}`);

  const r = build(SAIDA);
  console.log(`[exemplo] projeto montado em ${path.join(SAIDA, "index.html")}: ${r.scenes} cenas, ${r.total} s, maior vão ${r.maiorVao} s`);
  for (const a of r.avisos) console.log(`[exemplo] aviso: ${a}`);

  if (args.includes("--sem-render")) process.exit(0);
  const saida = "renders/exemplo.mp4";
  console.log(`[exemplo] renderizando com o HyperFrames (${args.includes("--alta") ? "alta" : "rascunho"}); a primeira vez baixa o Chrome que ele usa e demora mais...`);
  // Comando numa string só (argumentos fixos): o npx precisa de shell no Windows.
  const render = spawnSync(`npx hyperframes render --quality ${args.includes("--alta") ? "high" : "draft"} --output ${saida}`, { cwd: SAIDA, stdio: "inherit", shell: true });
  const mp4 = path.join(SAIDA, saida);
  if (render.status !== 0 || !fs.existsSync(mp4)) {
    console.error(`[exemplo] o render falhou (código ${render.status}). Veja o erro acima.`);
    process.exit(1);
  }
  const dur = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4], { encoding: "utf8" });
  console.log(`[exemplo] pronto: ${mp4} (${Number(dur.stdout).toFixed(1)} s)`);
}
