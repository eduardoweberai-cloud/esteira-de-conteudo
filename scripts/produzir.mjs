#!/usr/bin/env node
// Produção de um reel aprovado: confere a aprovação, valida, usa a sua gravação, monta, confere, renderiza e mede o ritmo.
// Uso: node scripts/produzir.mjs <pasta-do-reel> [--draft] [--teste] [--refazer-voz] [--versao teste]
//   Voz: a tomada escolhida no gravador (npm run gravar -- <pasta-do-reel>). Narração já pronta é reaproveitada;
//   --refazer-voz processa a tomada escolhida de novo com o texto de hoje (sem transcrever outra vez).
//   --teste: produz sem conferir a aprovação do roteiro.md (pra experimentar); o producao.json registra o teste e a
//   entrega não copia esse vídeo.
//   --versao teste: a versão para os Reels de teste do Instagram (kit/versao.mjs: mesmo áudio, outro tema, outra
//   trilha e a cena 3D mais perto), em renders/<slug>-teste-vN.mp4, com resumo em producao-teste.json.
//   Cada render vira renders/<slug>-vN.mp4 (nunca sobrescreve). Resumo em producao.json. O render final (sem --teste,
//   qualidade alta e ritmo aprovado) vai pra pasta de entrega (scripts/entrega.mjs).
// Não publica nada: postar é com você.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tokens } from "../kit/texto.mjs";
import { medir, resumo } from "./medir-ritmo.mjs";
import { checarAprovacao } from "./aprovacao.mjs";
import { gravacaoDoReel, processarGravacao } from "../kit/voz-gravada.mjs";
import { VERSOES } from "../kit/versao.mjs";
import { fixarTrilha } from "../kit/trilhas.mjs";
import { entregar, resumoEntrega } from "./entrega.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REGISTRO_TRILHAS = path.join(RAIZ, "lotes", "trilhas-usadas.json");
// Caminho do reel do jeito que você digita no terminal (as mensagens dizem o comando pronto).
const rel = (dir) => path.relative(process.cwd(), dir).split(path.sep).join("/") || ".";

// A narração é sempre a sua gravação: sem tomada escolhida, ou com uma tomada de um texto que mudou depois, para e
// diz o que fazer.
export function planoProducao(dir, { refazerVoz = false, versao = "perfil" } = {}) {
  if (!VERSOES.includes(versao)) throw new Error(`versão "${versao}" não existe (${VERSOES.join(", ")})`);
  const reel = JSON.parse(fs.readFileSync(path.join(dir, "reel.json"), "utf8"));
  const slug = reel.slug ?? path.basename(dir);
  const grav = gravacaoDoReel(dir, reel);
  if (!grav) throw new Error(`${slug} ainda não tem gravação: grave a narração com npm run gravar -- ${rel(dir)}`);
  if (grav.estado === "velha") {
    throw new Error(`a gravação de ${slug} é de um texto antigo (a fala mudou depois): grave de novo (npm run gravar -- ${rel(dir)}); se você só corrigiu à mão o texto que falou, use a gravação com o texto de hoje: npm run voz -- ${rel(dir)} --literal`);
  }
  // A narração pronta só serve se veio desta tomada, com a velocidade de hoje e as palavras de hoje.
  const fv = path.join(dir, "narracao-voz.json");
  const feita = fs.existsSync(fv) ? JSON.parse(fs.readFileSync(fv, "utf8")) : null;
  const mesmaVoz = feita?.gravada === grav.hash && feita.tomada === path.basename(grav.arquivo) && (feita.acelerar ?? 1) === (reel.voz_gravada?.acelerar ?? 1);
  const fw = path.join(dir, "words.json");
  const falas = reel.cenas.flatMap((c) => tokens(c.fala));
  const temVoz =
    fs.existsSync(path.join(dir, "narracao.mp3")) &&
    fs.existsSync(fw) &&
    mesmaVoz &&
    JSON.parse(fs.readFileSync(fw, "utf8")).map((w) => w.w).join(" ") === falas.join(" ");
  const rdir = path.join(dir, "renders");
  // A versão de teste numera à parte (<slug>-teste-vN), sem mexer na numeração do perfil.
  const nome = versao === "teste" ? `${slug}-teste` : slug;
  const versoes = fs.existsSync(rdir)
    ? fs.readdirSync(rdir).map((f) => new RegExp(`^${nome}-v(\\d+)\\.mp4$`).exec(f)).filter(Boolean).map((m) => Number(m[1]))
    : [];
  const passos = ["validar", ...(refazerVoz || !temVoz ? ["gravada"] : []), "build", "check", "render"];
  return { slug, versao, passos, tomada: grav.arquivo, render: path.join("renders", `${nome}-v${Math.max(0, ...versoes) + 1}.mp4`) };
}

// `hyperframes check --json`: erro de lint, runtime, layout ou motion barra a produção. O passe de contraste
// do HyperFrames confunde camada de efeito (brilho, clarão, SVG) com fundo do texto: vira aviso, e o contraste real
// se confere nas fotos do vídeo. `check_cleanup_failure` (o Chrome do check não fechou depois de terminar) é da
// máquina, não do reel: aviso. Se a checagem não rodou, vem `check_runtime_failure` e barra.
const SO_LIMPEZA = new Set(["check_cleanup_failure"]);
export function avaliarCheck(j) {
  const bloqueios = [];
  const avisos = [];
  for (const sec of ["lint", "runtime", "layout", "motion"]) {
    const s = j[sec];
    if (!s || !(s.errorCount > 0)) continue;
    const todos = (s.findings ?? []).filter((f) => f.severity === "error");
    const erros = todos.filter((f) => !SO_LIMPEZA.has(f.code));
    if (todos.length && !erros.length) {
      avisos.push(`navegador do check não fechou no fim (${sec}); a checagem rodou`);
      continue;
    }
    bloqueios.push(`${sec}: ${erros.map((f) => `${f.code ?? "erro"} ${f.message ?? ""}`.trim()).slice(0, 3).join("; ") || `${s.errorCount} erro(s)`}`);
  }
  avisos.push(...(j.contrast?.findings ?? [])
    .filter((f) => f.severity === "error")
    .map((f) => `contraste ${String(f.ratio ?? "").replace(".", ",")}:1 em "${f.text ?? f.selector}" (${String(f.time ?? "?").replace(".", ",")} s)`));
  return { ok: bloqueios.length === 0, bloqueios, avisos };
}

export function registroProducao(out, { draft, teste, agora }) {
  return { ...out, render_em: agora, qualidade: draft ? "draft" : "high", ...(teste ? { teste: "roteiro não conferido (produção de teste)" } : {}) };
}

// Sem nenhuma música no clima do reel (kit/assets/musica/musicas.json), o reel sai sem trilha e o medidor só avisa.
// A versão de teste usa outra faixa do mesmo clima, salvo versoes.teste.trilha false (kit/versao.mjs).
export function exigeTrilha(reel, versao = "perfil") {
  if (reel.trilha === false || !reel.trilha?.arquivo) return false;
  return versao !== "teste" || reel.versoes?.teste?.trilha !== false;
}

// comando: [programa, ...argumentos] roda direto (caminho com espaço passa inteiro); uma string roda no shell
// (o npx precisa dele no Windows), e aí só com argumentos fixos, sem nada digitado por você.
function rodar(rotulo, comando, cwd) {
  const t0 = Date.now();
  const opts = { cwd, encoding: "utf8", timeout: 1200000, maxBuffer: 64 * 1024 * 1024 };
  const r = Array.isArray(comando) ? spawnSync(comando[0], comando.slice(1), opts) : spawnSync(comando, { ...opts, shell: true });
  const saida = `${r.stdout ?? ""}\n${r.stderr ?? ""}`.trim();
  const s = Math.round((Date.now() - t0) / 1000);
  if (r.status !== 0) throw new Error(`[${rotulo}] falhou (status ${r.status}, ${s}s):\n${saida.split(/\r?\n/).slice(-20).join("\n")}`);
  console.log(`[${rotulo}] ok (${s}s)`);
  return saida;
}

async function produzir(dir, { refazerVoz, draft, teste, versao }) {
  // A versão do roteiro aprovado vai no producao.json: a entrega só copia se ela ainda for a aprovada.
  let roteiro = null;
  if (teste) console.log("[produzir] TESTE: o roteiro.md não é conferido; este vídeo não vai pra entrega");
  else {
    checarAprovacao(dir);
    roteiro = JSON.parse(fs.readFileSync(path.join(dir, "reel.json"), "utf8")).aprovado.roteiro;
    console.log("[produzir] roteiro aprovado");
  }
  // Música pelo clima do reel, sem repetir as dos últimos 10 (kit/trilhas.mjs); fica gravada no reel.json.
  const faixa = fixarTrilha(dir, { registro: REGISTRO_TRILHAS });
  if (faixa.escolhida) console.log(`[trilha] ${faixa.escolhida} no perfil${faixa.teste ? ` e ${faixa.teste} na versão de teste` : ""}`);
  if (faixa.aviso) console.log(`[trilha] aviso: ${faixa.aviso}`);
  const plano = planoProducao(dir, { refazerVoz, versao });
  const sufixo = plano.versao === "teste" ? "-teste" : "";
  console.log(`[produzir] ${plano.slug}: ${plano.passos.join(" > ")} · voz: ${path.basename(plano.tomada)}`);
  const node = process.execPath;
  const out = { voz: "gravada", ...(roteiro ? { roteiro } : {}) };
  for (const passo of plano.passos) {
    if (passo === "validar") {
      const v = spawnSync(node, [path.join(RAIZ, "scripts", "validar-roteiro.mjs"), dir], { cwd: RAIZ, encoding: "utf8" });
      if (v.status !== 0) throw new Error(`[validar] o roteiro tem erro (corrija e rode de novo):\n${`${v.stdout}\n${v.stderr}`.trim()}`);
      console.log("[validar] ok");
    }
    if (passo === "gravada") {
      const g = await processarGravacao(dir);
      out.voz_gravada = { tomada: path.basename(plano.tomada), perda: g.perda, duracao: g.duracao, pausas: g.pausas, suspeitas: g.suspeitas, vaos: g.vaos };
      console.log(`[voz] ${path.basename(plano.tomada)}: ${g.palavras} palavras, ${g.duracao}s, perda ${g.perda}${g.vaos.length ? `; ouça a emenda depois de: ${g.vaos.map((v) => `"${v.depois}"`).join(", ")}` : ""}${g.suspeitas.length ? `; confira: ${g.suspeitas.join(", ")}` : ""}`);
    }
    if (passo === "build") {
      const linhas = rodar("build", [node, path.join(RAIZ, "kit", "build.mjs"), dir, "--versao", plano.versao], RAIZ).split(/\r?\n/).filter((l) => l.startsWith("[kit]"));
      linhas.forEach((l) => console.log(l));
      out.build = linhas.join(" | ");
    }
    if (passo === "check") {
      const r = spawnSync("npx hyperframes check --json", { cwd: dir, encoding: "utf8", shell: true, timeout: 1200000, maxBuffer: 64 * 1024 * 1024 });
      const txt = String(r.stdout ?? "");
      let j;
      try {
        j = JSON.parse(txt.slice(txt.indexOf("{")));
      } catch {
        throw new Error(`[check] saída sem JSON (status ${r.status}):\n${`${txt}\n${r.stderr ?? ""}`.trim().split(/\r?\n/).slice(-15).join("\n")}`);
      }
      const c = avaliarCheck(j);
      if (!c.ok) throw new Error(`[check] falhou:\n${c.bloqueios.join("\n")}`);
      console.log(`[check] ok${c.avisos.length ? ` · ${c.avisos.length} aviso(s)` : ""}`);
      c.avisos.forEach((a) => console.log(`[check] aviso: ${a}`));
      out.avisos_contraste = c.avisos;
    }
    if (passo === "render") {
      fs.mkdirSync(path.join(dir, "renders"), { recursive: true });
      rodar("render", `npx hyperframes render --quality ${draft ? "draft" : "high"} --output "${plano.render.split(path.sep).join("/")}"`, dir);
      const dur = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(dir, plano.render)], { encoding: "utf8" });
      out.video = path.join(dir, plano.render);
      out.duracao = Math.round(Number(dur.stdout) * 10) / 10;
      // 1ª mudança até 1 s, nada parado mais de 2 s e, se o reel tem música, trilha presente (scripts/medir-ritmo.mjs).
      const reel = JSON.parse(fs.readFileSync(path.join(dir, "reel.json"), "utf8"));
      const m = medir(out.video, { exigeTrilha: exigeTrilha(reel, plano.versao) });
      fs.writeFileSync(path.join(dir, `ritmo${sufixo}.json`), JSON.stringify(m, null, 2));
      console.log(resumo(m));
      out.ritmo = { ok: m.ok, primeira_mudanca: m.primeiraMudanca, maior_parado: m.maiorParado, movimento_pct: m.movimentoPct, trilha: m.trilha.ok, motivos: m.motivos, avisos: m.avisos };
    }
  }
  const registro = registroProducao(out, { draft, teste, agora: new Date().toISOString() });
  fs.writeFileSync(path.join(dir, `producao${sufixo}.json`), JSON.stringify({ ...registro, versao: plano.versao }, null, 2));
  console.log(`[produzir] ${plano.slug} pronto: ${out.video} (${out.duracao}s)`);
  if (out.video) resumoEntrega(entregar(dir, { versoes: [plano.versao] })).forEach((l) => console.log(l));
  if (out.ritmo && !out.ritmo.ok) {
    console.error(`[produzir] ritmo REPROVADO: ${out.ritmo.motivos.join("; ")}. Ponha uma batida grande no trecho parado e produza de novo.`);
    process.exitCode = 3;
  }
}

// Rodado direto (compara o caminho real: pasta aberta por junção ou link simbólico também conta).
if (process.argv[1] && fs.realpathSync.native(path.resolve(process.argv[1])) === fs.realpathSync.native(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const valor = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const [alvo] = args.filter((a, k) => !a.startsWith("--") && args[k - 1] !== "--versao");
  const dir = path.resolve(alvo ?? ".");
  if (!fs.existsSync(path.join(dir, "reel.json"))) {
    console.error(`não achei reel.json em ${dir}`);
    process.exit(1);
  }
  produzir(dir, { refazerVoz: args.includes("--refazer-voz"), draft: args.includes("--draft"), teste: args.includes("--teste"), versao: valor("--versao") }).catch((e) => {
    console.error(String(e.message ?? e));
    process.exit(1);
  });
}
