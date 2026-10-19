// Trilhas por clima: a música do reel sai do clima do assunto (`reel.trilha.clima`, escolhido no roteiro), nunca uma
// das que tocaram nos últimos 10 reels (registro em trilhas-usadas.json), e a versão de teste toca outra do mesmo clima.
// O repositório não traz música: cada pessoa põe as faixas dela em kit/assets/musica e descreve no musicas.json
// ([{ "arquivo": "minha-faixa.mp3", "clima": "passo", "inicio": 5 }]). Sem faixa do clima, o reel sai sem trilha.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { KIT } from "./html.mjs";

export const MUSICA = path.join(KIT, "assets", "musica");
export const MUSICAS_JSON = path.join(MUSICA, "musicas.json");

// curiosidade: "e se...", ciência, mistério · passo: passo a passo, tutorial, lista prática ·
// conversa: opinião, reflexão, bastidor · descontraido: humor, POV, leve.
export const CLIMAS_PADRAO = ["curiosidade", "passo", "conversa", "descontraido"];
const RECENTES = 10;
// Clima sem caixa nem acento: "Descontraído" e "descontraido" são o mesmo.
export const normClima = (c) => String(c ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const hash = (s) => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

// Lê o musicas.json: cada faixa guarda `arquivo` como está no JSON (é o nome que vai pro reel.json) e `caminho`, o do
// disco (relativo à pasta do JSON). Faixa que não está no disco, ou com caminho absoluto ou fora da pasta (o reel.json
// gravaria um caminho da máquina), fica de fora com aviso.
export function carregarCatalogo(arquivo = MUSICAS_JSON) {
  if (!fs.existsSync(arquivo)) return { catalogo: [], avisos: [] };
  let lista;
  try {
    lista = JSON.parse(fs.readFileSync(arquivo, "utf8"));
    if (!Array.isArray(lista)) throw new Error("tem que ser uma lista");
  } catch (e) {
    return { catalogo: [], avisos: [`${path.basename(arquivo)} ilegível (${e.message}): reel sai sem música`] };
  }
  const catalogo = [];
  const avisos = [];
  for (const f of lista) {
    if (!f || typeof f.arquivo !== "string" || typeof f.clima !== "string") {
      avisos.push(`${path.basename(arquivo)}: faixa sem "arquivo" ou "clima" ignorada`);
      continue;
    }
    const pasta = path.dirname(arquivo);
    const caminho = path.resolve(pasta, f.arquivo);
    const rel = path.relative(pasta, caminho);
    if (path.isAbsolute(f.arquivo) || !rel || rel.startsWith("..") || path.isAbsolute(rel)) {
      avisos.push(`${path.basename(arquivo)}: ${f.arquivo} tem que ser um arquivo dentro de ${pasta} (nome relativo, sem caminho absoluto)`);
      continue;
    }
    if (fs.existsSync(caminho)) catalogo.push({ ...f, caminho });
    else avisos.push(`${path.basename(arquivo)}: ${f.arquivo} não está em ${path.dirname(arquivo)}`);
  }
  return { catalogo, avisos };
}

let padrao;
const catalogoPadrao = () => (padrao ??= carregarCatalogo());
const lista = (catalogo) => catalogo ?? catalogoPadrao().catalogo;

// { clima: [arquivos] }, com os 4 climas padrão sempre presentes (mesmo vazios).
export function climasDe(catalogo) {
  const out = Object.fromEntries(CLIMAS_PADRAO.map((c) => [c, []]));
  for (const f of lista(catalogo)) (out[normClima(f.clima)] ??= []).push(f.arquivo);
  return out;
}

// Faixa do clima fora das `recentes` (as dos últimos 10 reels; sem elas, as 10 últimas da lista); a semente (o slug
// do reel) decide entre as livres; se todas tocaram, a que tocou há mais tempo em `usadas`. Sem faixa do clima: null.
export function escolherTrilha({ clima, usadas = [], recentes = usadas.slice(-RECENTES), semente = "", catalogo } = {}) {
  const climas = climasDe(catalogo);
  const doClima = climas[normClima(clima)];
  if (!doClima) throw new Error(`clima "${clima}" não existe (${Object.keys(climas).join(", ")})`);
  if (!doClima.length) return null;
  const livres = doClima.filter((f) => !recentes.includes(f));
  if (livres.length) return livres[hash(semente) % livres.length];
  return [...doClima].sort((a, b) => usadas.lastIndexOf(a) - usadas.lastIndexOf(b))[0];
}

// A próxima do mesmo clima (versão de teste); faixa fora do catálogo pega a 1ª do clima pedido. Sem outra: a mesma.
export function outraDoClima(arquivo, clima, catalogo) {
  const cat = lista(catalogo);
  const climas = climasDe(cat);
  const doClima = climas[normClima(cat.find((f) => f.arquivo === arquivo)?.clima ?? clima)];
  if (!doClima?.length) return arquivo;
  return doClima.includes(arquivo) ? doClima[(doClima.indexOf(arquivo) + 1) % doClima.length] : doClima[0];
}

export const faixaNoCatalogo = (arquivo, catalogo) => lista(catalogo).find((f) => f.arquivo === arquivo) ?? null;

// Caminho no disco de uma faixa do reel: absoluto, do catálogo, da pasta de música ou da pasta do reel.
export function caminhoDaFaixa(arquivo, { catalogo, dir } = {}) {
  if (path.isAbsolute(arquivo)) return arquivo;
  const doCatalogo = faixaNoCatalogo(arquivo, catalogo)?.caminho;
  if (doCatalogo) return doCatalogo;
  const naMusica = path.join(MUSICA, arquivo);
  if (fs.existsSync(naMusica) || !dir) return naMusica;
  return path.join(dir, arquivo);
}

// A faixa sai do kit normalizada em -16 LUFS (kit/trilha.mjs); o volume do <audio> a põe 22 dB abaixo da voz.
export const ABAIXO_DA_VOZ = 22;
export function volumeDaTrilha(vozLufs) {
  if (vozLufs == null || !Number.isFinite(vozLufs)) return 0.07;
  const v = 10 ** ((vozLufs - ABAIXO_DA_VOZ + 16) / 20);
  return Math.round(Math.min(0.13, Math.max(0.03, v)) * 1000) / 1000;
}

// Loudness integrada (LUFS) de um áudio, ou null.
export function lufsDe(arquivo) {
  if (!arquivo || !fs.existsSync(arquivo) || fs.statSync(arquivo).size < 1000) return null;
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", arquivo, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" });
  const m = /I:\s+(-?[\d.]+) LUFS/.exec(String(r.stderr).split("Summary:").pop() ?? "");
  return m ? Number(m[1]) : null;
}

// Registro estragado não para a produção: vira aviso e o rodízio recomeça.
function lerRegistro(f) {
  if (!f || !fs.existsSync(f)) return { linhas: [] };
  try {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    if (Array.isArray(j)) return { linhas: j.filter((x) => x && typeof x.arquivo === "string") };
  } catch {}
  return { linhas: [], aviso: `registro de trilhas ${path.basename(f)} ilegível: rodízio recomeça (conserte ou apague o arquivo)` };
}

// As faixas dos últimos 10 reels (perfil e teste contam como um reel só).
function dosUltimosReels(linhas, n = RECENTES) {
  const reels = [];
  for (let i = linhas.length - 1; i >= 0 && reels.length < n; i--) if (!reels.includes(linhas[i].reel)) reels.push(linhas[i].reel);
  return linhas.filter((x) => reels.includes(x.reel)).map((x) => x.arquivo);
}

// Antes do build: reel sem faixa escolhida ganha a do perfil e a da versão de teste, gravadas no reel.json e no
// registro. Reel com faixa (ou sem trilha) não muda; clima sem faixa no catálogo também não (avisa).
export function fixarTrilha(dir, { registro, catalogo } = {}) {
  const f = path.join(dir, "reel.json");
  const reel = JSON.parse(fs.readFileSync(f, "utf8"));
  if (reel.trilha === false || reel.trilha?.arquivo) return { escolhida: null };
  const clima = reel.trilha?.clima ?? "conversa";
  const slug = reel.slug ?? path.basename(dir);
  const lido = lerRegistro(registro);
  const usadas = lido.linhas.map((x) => x.arquivo);
  const recentes = dosUltimosReels(lido.linhas);
  const perfil = escolherTrilha({ clima, usadas, recentes, semente: slug, catalogo });
  if (!perfil) return { escolhida: null, aviso: `nenhuma música do clima "${clima}" no musicas.json: o reel sai sem trilha` };
  const vt = reel.versoes?.teste ?? {};
  if (vt.trilha === false) {
    // Versão de teste sem música por escolha: só o perfil ganha faixa.
    fs.writeFileSync(f, JSON.stringify({ ...reel, trilha: { ...(reel.trilha ?? {}), clima, arquivo: perfil } }, null, 2) + "\n");
    if (registro) fs.writeFileSync(registro, JSON.stringify([...lido.linhas, { arquivo: perfil, reel: slug, versao: "perfil", em: new Date().toISOString() }], null, 2) + "\n");
    return { escolhida: perfil, teste: null, ...(lido.aviso ? { aviso: lido.aviso } : {}) };
  }
  // Faixa de teste escolhida à mão no reel.json vence.
  let teste = vt.trilha?.arquivo ?? escolherTrilha({ clima, usadas: [...usadas, perfil], recentes: [...recentes, perfil], semente: `${slug}-teste`, catalogo });
  if (teste === perfil) teste = outraDoClima(perfil, clima, catalogo);
  const novo = { ...reel, trilha: { ...(reel.trilha ?? {}), clima, arquivo: perfil }, versoes: { ...(reel.versoes ?? {}), teste: { ...vt, trilha: { ...(vt.trilha ?? {}), arquivo: teste } } } };
  fs.writeFileSync(f, JSON.stringify(novo, null, 2) + "\n");
  if (registro) {
    const em = new Date().toISOString();
    fs.writeFileSync(registro, JSON.stringify([...lido.linhas, { arquivo: perfil, reel: slug, versao: "perfil", em }, { arquivo: teste, reel: slug, versao: "teste", em }], null, 2) + "\n");
  }
  return { escolhida: perfil, teste, ...(lido.aviso ? { aviso: lido.aviso } : {}) };
}
