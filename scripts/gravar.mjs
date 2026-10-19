#!/usr/bin/env node
// Gravador da narração no PC: página local com teleprompter; ao salvar, a tomada vai pra <reel>/gravacao/ e já é
// limpa e alinhada com o roteiro (kit/voz-gravada.mjs). Só a tomada que passa vira a escolhida, e é ela que o
// produzir.mjs usa. Só escuta em 127.0.0.1 e só aceita a própria página (origem e host locais), uma tomada por vez.
// O teleprompter mostra o texto aprovado no roteiro.md; sem aprovação, a página não grava (--teste grava o
// texto do reel.json como está, pra experimentar).
// Uso: node scripts/gravar.mjs <pasta-do-reel> [--porta 4090] [--teste]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { salvarTomada, gravacaoDoReel, processarGravacao, hashFalas } from "../kit/voz-gravada.mjs";
import { validarReel, ancoras } from "./validar-roteiro.mjs";
import { checarAprovacao } from "./aprovacao.mjs";
import { norm, tokens } from "../kit/texto.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mp4": "m4a" };
const TETO = 200 * 1024 * 1024; // ~1 h de opus a 192 kbps é 85 MB: 200 MB sobra

export const tituloLimpo = (t = "") => t.replace(/\s*\|\s*/g, " ").replace(/\*/g, "").replace(/\s+/g, " ").trim();
export const extensaoDe = (tipo = "") => EXT[tipo.split(";")[0].trim().toLowerCase()] ?? null;

// Âncora (batida, cabeçalho, marca da cena 3D) cuja palavra agora aparece primeiro numa palavra nova que ele
// falou: o kit usa a 1ª vez que a palavra aparece, então o efeito mudaria de lugar sem ninguém ver.
export function ancorasMovidas(lido, novo, origens) {
  const casa = (palavra) => {
    const quer = norm(tokens(palavra)[0] ?? "");
    return (w) => norm(w) === quer || (quer.length >= 4 && norm(w).startsWith(quer));
  };
  const primeira = (fala, palavra) => tokens(fala).findIndex(casa(palavra));
  const vezes = (fala, palavra) => tokens(fala).filter(casa(palavra)).length;
  const avisos = [];
  novo.cenas.forEach((c, i) => {
    const lista = ancoras(c);
    for (const [nome, marca] of Object.entries(novo.mundo?.marcas ?? {})) if (Array.isArray(marca) && marca[0] === i) lista.push([marca[1], `marca ${nome} da cena 3D`]);
    for (const [palavra, campo] of lista) {
      const k = primeira(c.fala, String(palavra));
      if (k < 0) continue;
      const mais = vezes(c.fala, String(palavra)) > vezes(lido.cenas[i].fala, String(palavra));
      if (!mais && origens[i]?.[k] === primeira(lido.cenas[i].fala, String(palavra))) continue;
      avisos.push(`cena ${i + 1}: ${campo} "${palavra}" agora ${mais ? `também está numa palavra nova que você falou (aparece ${vezes(c.fala, String(palavra))} vezes) e o efeito cai na 1ª` : origens[i]?.[k] < 0 ? "cai numa palavra nova que você falou" : "cai em outro lugar da fala"}`);
    }
  });
  return avisos;
}

function enviar(res, status, corpo, tipo = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": tipo, "cache-control": "no-store" });
  res.end(typeof corpo === "string" || Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo));
}

// opts: alinhar e transcrever (falsos nos testes; padrão, a ElevenLabs); teste: grava sem conferir a aprovação.
export function criarServidor(dir, { teste = false, ...opts } = {}) {
  const lerReel = () => JSON.parse(fs.readFileSync(path.join(dir, "reel.json"), "utf8"));
  // O texto do teleprompter: o aprovado (depois de uma tomada com fala livre, o reel.json tem o que você falou, mas
  // a próxima tomada lê de novo o aprovado). No --teste, o texto do reel.json como está.
  const textoDaTela = () => (teste ? lerReel().cenas.map((c) => c.fala) : checarAprovacao(dir).falas);
  let processando = false;
  const srv = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      // Só a página servida aqui: host local (contra DNS rebinding) e, se vier origem, a mesma.
      const porta = srv.address().port;
      const locais = new Set([`localhost:${porta}`, `127.0.0.1:${porta}`]);
      if (!locais.has(String(req.headers.host))) return enviar(res, 403, { erro: "só pela página local" });
      if (req.headers.origin && !locais.has(String(req.headers.origin).replace(/^http:\/\//, ""))) return enviar(res, 403, { erro: "só pela página local" });
      if (req.method === "GET" && url.pathname === "/") return enviar(res, 200, fs.readFileSync(path.join(HERE, "gravador.html")), "text/html; charset=utf-8");
      if (req.method === "GET" && url.pathname === "/favicon.ico") return enviar(res, 204, "");
      if (req.method === "GET" && url.pathname === "/roteiro") {
        const reel = lerReel();
        let falas;
        try {
          falas = textoDaTela();
        } catch (e) {
          return enviar(res, 409, { erro: e.message });
        }
        return enviar(res, 200, { slug: reel.slug ?? path.basename(dir), titulo: tituloLimpo(reel.titulo), falas, hash: hashFalas(reel), gravacao: gravacaoDoReel(dir, reel)?.estado ?? null, teste });
      }
      if (req.method === "GET" && url.pathname === "/narracao.mp3") {
        const f = path.join(dir, "narracao.mp3");
        return fs.existsSync(f) ? enviar(res, 200, fs.readFileSync(f), "audio/mpeg") : enviar(res, 404, { erro: "sem narração ainda" });
      }
      if (req.method === "POST" && url.pathname === "/tomada") {
        const ext = extensaoDe(req.headers["content-type"]);
        if (!ext) return enviar(res, 415, { erro: "formato de áudio não aceito" });
        if (req.headers["x-hash"] !== hashFalas(lerReel())) return enviar(res, 409, { erro: "o roteiro mudou desde que a página abriu: recarregue a página e grave de novo" });
        let tela;
        try {
          tela = textoDaTela();
        } catch (e) {
          return enviar(res, 409, { erro: e.message });
        }
        if (processando) return enviar(res, 409, { erro: "ainda estou processando a tomada anterior: espere o resultado" });
        processando = true;
        try {
          const partes = [];
          let tam = 0;
          for await (const p of req) {
            tam += p.length;
            if (tam > TETO) return enviar(res, 413, { erro: "tomada grande demais" });
            partes.push(p);
          }
          const buf = Buffer.concat(partes);
          if (buf.length < 1000) return enviar(res, 400, { erro: "a tomada veio vazia: grave de novo" });
          let marcas = null;
          try {
            const m = JSON.parse(String(req.headers["x-marcas"] ?? "null"));
            if (Array.isArray(m) && m.length <= 200 && m.every((x) => x === null || Number.isFinite(x))) marcas = m;
          } catch {}
          const lido0 = lerReel();
          const tomada = salvarTomada(dir, buf, ext, { falas: tela, hash: req.headers["x-hash"], marcas });
          console.log(`[gravar] tomada salva: ${tomada}`);
          try {
            const r = await processarGravacao(dir, { ...opts, tomada, hash: req.headers["x-hash"] });
            // O aviso de âncora compara com o texto que estava na tela.
            const lido = { ...lido0, cenas: lido0.cenas.map((c, i) => ({ ...c, fala: tela[i] ?? c.fala })) };
            // Fala livre: texto de tela ou marca da cena 3D que perdeu a palavra (reancorar no reel.json antes de produzir).
            const v = validarReel(dir);
            r.ancoras = [...[...v.erros, ...v.avisos].filter((m) => /não está na fala|fora da ordem/.test(m)), ...ancorasMovidas(lido, lerReel(), r.origens)];
            if (r.mudancas.length) console.log(`[gravar] texto do reel = o que você falou (${r.mudancas.length} trecho(s) diferente(s) do roteiro; o roteiro ficou em reel-roteiro.json)`);
            console.log(`[gravar] ${path.basename(tomada)} escolhida: ${r.duracao}s, perda ${r.perda}, ${r.pausas} pausa(s) encurtada(s)`);
            return enviar(res, 200, { ok: true, tomada: path.basename(tomada), ...r });
          } catch (e) {
            console.log(`[gravar] ${path.basename(tomada)} salva, mas não passou: ${e.message}`);
            return enviar(res, 422, { erro: e.message, tomada: path.basename(tomada) });
          }
        } finally {
          processando = false;
        }
      }
      enviar(res, 404, { erro: "não existe" });
    } catch (e) {
      enviar(res, 500, { erro: String(e.message ?? e) });
    }
  });
  return srv;
}

// Rodado direto (compara o caminho real: pasta aberta por junção ou link simbólico também conta).
if (process.argv[1] && fs.realpathSync.native(path.resolve(process.argv[1])) === fs.realpathSync.native(fileURLToPath(import.meta.url))) {
  const [alvo] = process.argv.slice(2).filter((a, k, todos) => !a.startsWith("--") && todos[k - 1] !== "--porta");
  const dir = path.resolve(alvo ?? ".");
  if (!fs.existsSync(path.join(dir, "reel.json"))) {
    console.error(`não achei reel.json em ${dir}`);
    process.exit(1);
  }
  const teste = process.argv.includes("--teste");
  if (!teste) {
    try {
      checarAprovacao(dir);
    } catch (e) {
      console.error(`[gravar] ${e.message}`);
      process.exit(1);
    }
  } else console.log("[gravar] TESTE: grava o texto do reel.json sem conferir a aprovação");
  const i = process.argv.indexOf("--porta");
  const porta = i > -1 ? Number(process.argv[i + 1]) : 4090;
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
    console.error(`[gravar] --porta precisa de um número de 1 a 65535 (ex.: --porta 4091)`);
    process.exit(1);
  }
  const srv = criarServidor(dir, { teste });
  srv.on("error", (e) => {
    console.error(e.code === "EADDRINUSE" ? `a porta ${porta} está ocupada: use --porta <outra>` : String(e.message));
    process.exit(1);
  });
  srv.listen(porta, "127.0.0.1", () => console.log(`[gravar] abra http://localhost:${porta} (reel ${path.basename(dir)}); Ctrl+C encerra`));
}
