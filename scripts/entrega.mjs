// Copia a versão final de cada reel para a pasta de entrega, onde você pega o vídeo e a legenda na hora de postar.
// Uso: node scripts/entrega.mjs <pasta-do-reel> [<pasta-do-reel> ...]
//   Pasta: ESTEIRA_ENTREGA no ambiente ou no .env (padrão: entregas/ na raiz do repositório). Uma pasta por reel,
//   "<data do lote> <pasta do reel>", com <NOME>.mp4 (perfil), "<NOME> teste.mp4" (Reels de teste do Instagram) e
//   legenda.txt. Só vai o render final: sem --teste, qualidade alta, ritmo aprovado e o roteiro aprovado agora, na
//   mesma versão que o render usou. Render novo substitui o anterior.
//   O produzir.mjs chama isto sozinho depois de cada render.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lerEnv } from "../kit/chave.mjs";
import { RAIZ } from "../kit/perfil.mjs";
import { checarAprovacao } from "./aprovacao.mjs";

export function pastaDeEntregaPadrao({ env = process.env, arquivo } = {}) {
  const escolhida = env.ESTEIRA_ENTREGA ?? lerEnv(arquivo).ESTEIRA_ENTREGA;
  return escolhida ? path.resolve(RAIZ, escolhida) : path.join(RAIZ, "entregas");
}

const VERSOES = { perfil: { registro: "producao.json", sufixo: "" }, teste: { registro: "producao-teste.json", sufixo: " teste" } };

export function nomeDoReel(slug) {
  return slug.replace(/^r\d+-/, "").split("-").join(" ").toUpperCase();
}

export function pastaDoReel(dir, raiz = pastaDeEntregaPadrao()) {
  return path.join(raiz, `${path.basename(path.dirname(dir))} ${path.basename(dir)}`);
}

// O vídeo e a legenda só saem se o roteiro está aprovado agora e é a mesma aprovação que o render usou.
export function motivoDaAprovacao(dir, p) {
  try {
    checarAprovacao(dir);
  } catch (e) {
    return `o roteiro não está aprovado agora (${e.message})`;
  }
  const atual = JSON.parse(fs.readFileSync(path.join(dir, "reel.json"), "utf8")).aprovado?.roteiro;
  if (p.roteiro !== atual) return "o roteiro aprovado mudou depois deste render: produza de novo";
  return null;
}

function porQueNaoVai(p, dir, conferir) {
  if (p.teste) return `produção de teste (${p.teste})`;
  if (p.qualidade !== "high") return `render ${p.qualidade ?? "sem qualidade registrada"} (draft não é final)`;
  if (!p.ritmo?.ok) return "ritmo reprovado";
  if (!p.video || !fs.existsSync(p.video)) return `o vídeo ${p.video ?? "(sem caminho)"} não existe`;
  return conferir(dir, p);
}

export function entregar(dir, { raiz = pastaDeEntregaPadrao(), versoes = Object.keys(VERSOES), conferir = motivoDaAprovacao } = {}) {
  const pasta = pastaDoReel(dir, raiz);
  const nome = nomeDoReel(path.basename(dir));
  const copiados = [];
  const pulados = [];
  for (const v of versoes) {
    const reg = path.join(dir, VERSOES[v].registro);
    if (!fs.existsSync(reg)) continue;
    const p = JSON.parse(fs.readFileSync(reg, "utf8"));
    const motivo = porQueNaoVai(p, dir, conferir);
    if (motivo) {
      pulados.push({ versao: v, motivo });
      continue;
    }
    fs.mkdirSync(pasta, { recursive: true });
    const destino = path.join(pasta, `${nome}${VERSOES[v].sufixo}.mp4`);
    fs.copyFileSync(p.video, destino);
    copiados.push(destino);
  }
  const legenda = path.join(dir, "legenda.md");
  if (copiados.length && fs.existsSync(legenda)) fs.copyFileSync(legenda, path.join(pasta, "legenda.txt"));
  return { pasta, copiados, pulados };
}

export function resumoEntrega({ pasta, copiados, pulados }) {
  return [
    ...(copiados.length ? [`[entrega] copiado para ${pasta}: ${copiados.map((c) => path.basename(c)).join(", ")}`] : []),
    ...pulados.map((p) => `[entrega] não copiei a versão ${p.versao}: ${p.motivo}`),
  ];
}

// Rodado direto (compara o caminho real: pasta aberta por junção ou link simbólico também conta).
if (process.argv[1] && fs.realpathSync.native(path.resolve(process.argv[1])) === fs.realpathSync.native(fileURLToPath(import.meta.url))) {
  for (const d of process.argv.slice(2)) resumoEntrega(entregar(path.resolve(d))).forEach((l) => console.log(l));
}
