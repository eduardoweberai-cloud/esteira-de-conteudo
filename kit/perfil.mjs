// Perfil de quem publica: nome, @ e foto que aparecem no fecho do reel (Me segue e a DM).
// Mora no perfil.json da raiz do repositório; a foto é um caminho relativo a ele (ou null: o fecho usa as iniciais).
import fs from "node:fs";
import path from "node:path";
import { KIT } from "./html.mjs";

export const RAIZ = path.resolve(KIT, "..");
export const PERFIL_JSON = path.join(RAIZ, "perfil.json");
export const PERFIL_PADRAO = { nome: "Seu Nome", user: "seu.perfil", foto: null };

export function lerPerfil(arquivo = PERFIL_JSON) {
  const avisos = [];
  if (!fs.existsSync(arquivo)) {
    avisos.push(`${path.basename(arquivo)} não existe: o fecho sai com "${PERFIL_PADRAO.nome}" (preencha nome, user e foto)`);
    return { ...PERFIL_PADRAO, avisos };
  }
  let p;
  try {
    p = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch (e) {
    throw new Error(`${arquivo} não é um JSON válido: ${e.message}`);
  }
  const nome = String(p.nome ?? PERFIL_PADRAO.nome).trim();
  const user = String(p.user ?? PERFIL_PADRAO.user).trim().replace(/^@/, "");
  let foto = null;
  if (nome === PERFIL_PADRAO.nome || user === PERFIL_PADRAO.user) avisos.push(`${path.basename(arquivo)} ainda está com o exemplo ("${nome}", @${user}): preencha nome, user e foto`);
  if (p.foto) {
    const f = path.resolve(path.dirname(arquivo), p.foto);
    if (fs.existsSync(f)) foto = f;
    else avisos.push(`foto ${p.foto} do ${path.basename(arquivo)} não encontrada: o fecho sai com as iniciais`);
  }
  return { nome, user, foto, avisos };
}

// Primeira e última palavra do nome ("Ana Maria Teste" -> "AT").
export function iniciais(nome) {
  const partes = String(nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const letras = partes.length === 1 ? [partes[0]] : [partes[0], partes[partes.length - 1]];
  return letras.map((p) => [...p][0].toLocaleUpperCase("pt-BR")).join("");
}
