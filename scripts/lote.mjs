#!/usr/bin/env node
// Estado do lote: lotes/<AAAA-MM-DD>/lote.json guarda a etapa, e a skill retoma de onde parou.
// Uso:
//   node scripts/lote.mjs novo [AAAA-MM-DD] [--reels 3]   cria o lote (padrão: hoje, 3 reels)
//   node scripts/lote.mjs status                          lote aberto, etapa e próximo passo
//   node scripts/lote.mjs etapa <AAAA-MM-DD> <etapa>      muda a etapa (ver ETAPAS)
//   node scripts/lote.mjs roteiros [AAAA-MM-DD] [--forcar] escreve o roteiro.md de cada reel pra você revisar
//   node scripts/lote.mjs aprovados [AAAA-MM-DD]          leva o texto aprovado (Aprovado: sim) pros arquivos do reel
// Sem data, roteiros e aprovados usam o lote aberto. Etapa de trabalho (radar, roteiros, gravacao, producao) e etapa
// que espera você (aprovacao, corte, publicacao) são estados diferentes: a espera só começa depois que o material
// foi mostrado.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { escreverRoteiros, processarAprovados } from "./aprovacao.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LOTES = path.join(RAIZ, "lotes");
export const CALIBRACAO = path.join(RAIZ, "voz", "calibracao.md");
export const ETAPAS = ["radar", "roteiros", "aprovacao", "gravacao", "producao", "corte", "publicacao", "fechado"];

const PROXIMO = {
  radar: "rodar o radar de concorrentes, escolher as pautas e criar uma pasta por reel com reel.json e legenda.md; etapa roteiros",
  roteiros: "escrever e validar os roteiros (npm run validar -- lotes/<data>) e gerar o roteiro.md de cada reel (npm run lote -- roteiros); ao mostrar os roteiros, etapa aprovacao",
  aprovacao: "esperar você revisar cada roteiro.md e trocar a primeira linha para \"Aprovado: sim\"; depois npm run lote -- aprovados (remontar as cenas se a quantidade de falas mudou); todos aprovados, etapa gravacao",
  gravacao: "você grava a narração de cada reel aprovado (npm run gravar -- lotes/<data>/<reel>); gravados, etapa producao",
  producao: "produzir cada reel gravado (npm run produzir -- lotes/<data>/<reel>) e conferir o vídeo por fotos; ao mostrar os cortes, etapa corte",
  corte: "esperar você assistir os cortes; ajuste é editar o reel.json e produzir de novo; com o ok, etapa publicacao",
  publicacao: "você posta cada reel (vídeo e legenda na pasta de entrega); todos no ar, etapa fechado",
  fechado: "lote fechado",
};

export function novoLote(lotesDir, data, meta = {}) {
  const dir = path.join(lotesDir, data);
  if (fs.existsSync(path.join(dir, "lote.json"))) throw new Error(`lote ${data} já existe`);
  fs.mkdirSync(dir, { recursive: true });
  const lote = { data, etapa: "radar", meta: { reels: 3, ...meta }, criado: new Date().toISOString(), historico: [] };
  fs.writeFileSync(path.join(dir, "lote.json"), JSON.stringify(lote, null, 2));
  return lote;
}

// O lote não fechado mais recente (por data), ou null.
export function loteAberto(lotesDir) {
  if (!fs.existsSync(lotesDir)) return null;
  const abertos = fs
    .readdirSync(lotesDir)
    .filter((d) => fs.existsSync(path.join(lotesDir, d, "lote.json")))
    .map((d) => JSON.parse(fs.readFileSync(path.join(lotesDir, d, "lote.json"), "utf8")))
    .filter((l) => l.etapa !== "fechado")
    .sort((a, b) => (a.data < b.data ? 1 : -1));
  return abertos[0] ?? null;
}

export function proximoPasso(lote) {
  return (PROXIMO[lote.etapa] ?? `etapa desconhecida: ${lote.etapa}`).replaceAll("<data>", lote.data ?? "<data>");
}

export function mudarEtapa(lotesDir, data, etapa) {
  if (!ETAPAS.includes(etapa)) throw new Error(`etapa ${etapa} não existe (${ETAPAS.join(", ")})`);
  const f = path.join(lotesDir, data, "lote.json");
  if (!fs.existsSync(f)) throw new Error(`lote ${data} não existe em ${lotesDir}`);
  const lote = JSON.parse(fs.readFileSync(f, "utf8"));
  lote.historico = [...(lote.historico ?? []), { de: lote.etapa, para: etapa, em: new Date().toISOString() }];
  lote.etapa = etapa;
  fs.writeFileSync(f, JSON.stringify(lote, null, 2));
  return lote;
}

// A data pedida, ou a do lote aberto.
export function dataDoLote(lotesDir, data) {
  if (data) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error(`data "${data}" inválida: use AAAA-MM-DD (ex.: ${new Date().toLocaleDateString("sv-SE")})`);
    if (!fs.existsSync(path.join(lotesDir, data))) throw new Error(`lote ${data} não existe em ${lotesDir}`);
    return data;
  }
  const l = loteAberto(lotesDir);
  if (!l) throw new Error("nenhum lote aberto: crie um com npm run lote -- novo");
  return l.data;
}

// Rodado direto (compara o caminho real: pasta aberta por junção ou link simbólico também conta).
if (process.argv[1] && fs.realpathSync.native(path.resolve(process.argv[1])) === fs.realpathSync.native(fileURLToPath(import.meta.url))) {
  const cmd = process.argv[2];
  // Argumentos de posição (a data, a etapa); flag e o valor do --reels não contam.
  const [a, b] = process.argv.slice(3).filter((x, k, todos) => !x.startsWith("--") && todos[k - 1] !== "--reels");
  const hoje = new Date().toLocaleDateString("sv-SE");
  try {
    if (cmd === "novo") {
      const i = process.argv.indexOf("--reels");
      if (a && !/^\d{4}-\d{2}-\d{2}$/.test(a)) throw new Error(`data "${a}" inválida: use AAAA-MM-DD (ex.: ${hoje})`);
      const data = a ?? hoje;
      const l = novoLote(LOTES, data, i > -1 ? { reels: Number(process.argv[i + 1]) } : {});
      console.log(`[lote] criado ${path.join(LOTES, l.data)} · ${l.meta.reels} reels · etapa ${l.etapa}`);
    } else if (cmd === "status") {
      const l = loteAberto(LOTES);
      console.log(l ? `[lote] ${path.join(LOTES, l.data)} · etapa ${l.etapa} · próximo: ${proximoPasso(l)}` : "[lote] nenhum lote aberto");
    } else if (cmd === "etapa") {
      const l = mudarEtapa(LOTES, a, b);
      console.log(`[lote] ${l.data} -> ${l.etapa} · próximo: ${proximoPasso(l)}`);
    } else if (cmd === "roteiros") {
      const data = dataDoLote(LOTES, a);
      const lista = escreverRoteiros(path.join(LOTES, data), { data, forcar: process.argv.includes("--forcar") });
      if (!lista.length) console.log(`[lote] nenhum reel em ${path.join(LOTES, data)} (cada reel é uma pasta com reel.json)`);
      for (const r of lista) console.log(`[lote] ${r.reel}: ${r.estado} · ${r.arquivo}`);
    } else if (cmd === "aprovados") {
      const data = dataDoLote(LOTES, a);
      const quando = new Date().toLocaleDateString("pt-BR");
      for (const r of processarAprovados(path.join(LOTES, data), { calibracao: CALIBRACAO, data: quando })) {
        console.log(`[lote] ${r.reel}: ${r.estado}${r.remontar_cenas ? " · REMONTAR CENAS (a quantidade de falas mudou)" : ""}`);
      }
    } else {
      console.log("uso: node scripts/lote.mjs novo [AAAA-MM-DD] [--reels N] | status | etapa <AAAA-MM-DD> <etapa> | roteiros [AAAA-MM-DD] [--forcar] | aprovados [AAAA-MM-DD]");
      process.exit(2);
    }
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}
