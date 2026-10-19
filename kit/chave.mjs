// Chave da ElevenLabs (transcrição e alinhamento da sua gravação): ELEVENLABS_API_KEY no ambiente ou no .env da
// raiz do repositório (o .env não vai pro git). Crie a chave em https://elevenlabs.io/app/settings/api-keys
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "./perfil.mjs";

export const ENV = path.join(RAIZ, ".env");

// Lê KEY=valor de um .env (aceita aspas, comentário com # e CRLF do Windows).
export function lerEnv(arquivo = ENV) {
  if (!fs.existsSync(arquivo)) return {};
  const out = {};
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linha);
    if (!m || linha.trimStart().startsWith("#")) continue;
    out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

export function apiKey({ env = process.env, arquivo = ENV } = {}) {
  const chave = String(env.ELEVENLABS_API_KEY ?? lerEnv(arquivo).ELEVENLABS_API_KEY ?? "").trim();
  if (!chave) throw new Error(`falta a chave da ElevenLabs: crie o arquivo ${arquivo} com ELEVENLABS_API_KEY=sua-chave (veja o .env.example)`);
  return chave;
}
