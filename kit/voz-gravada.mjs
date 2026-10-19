#!/usr/bin/env node
// Narração gravada por você no PC: limpa o áudio, alinha com o texto (alinhamento forçado da ElevenLabs),
// confere pela perda se a fala é mesmo este roteiro, encurta pausa longa pra um respiro e grava words.json.
// Uso: node kit/voz-gravada.mjs <pasta-do-reel> [tomada] [--literal] [--teste]  (sem tomada: reprocessa a escolhida;
// --literal: usa o texto de hoje como está, sem transcrever; tomada de fora da página é copiada pra gravacao/).
// Só roda com o roteiro aprovado (scripts/aprovacao.mjs), salvo --teste.
// As tomadas ficam em <reel>/gravacao/ (scripts/gravar.mjs salva). Só a tomada que passou vira a escolhida;
// gravação de um texto que mudou depois não vale.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tokens } from "./texto.mjs";
import { align } from "./align.mjs";
import { juntarFalas, reacelerar } from "./narracao.mjs";
import { acharRetomadas, falasDoQueFalou, palavrasDaTranscricao, Reprovada, semRetomadas } from "./fala-livre.mjs";

import { apiKey } from "./chave.mjs";

export { falasDoQueFalou, palavrasDaTranscricao, porExtenso, Reprovada } from "./fala-livre.mjs";

// Passa-alta tira ronco de ar e mesa; a redução de ruído é leve pra não deixar a voz metálica.
export const FILTRO_LIMPEZA = "highpass=f=70,afftdn=nr=8:nf=-50";
const PAUSAS = { maxPausa: 0.45, respiro: 0.18, folgaIni: 0.08, folgaFim: 0.12 };
// Perda do alinhamento forçado, calibrada em 14/10 com a API real num reel de 9 parágrafos (certo: média 0,52 e pior
// janela de 5 palavras 0,74; parágrafo pulado: 1,34 e 11,3; áudio de outro reel: 4,48 e 10,2).
const PERDA = { janela: 5, tetoJanela: 3, tetoMedia: 2, tetoPalavra: 2.5, tetoIncerta: 1.5 };

const falasDe = (reel) => reel.cenas.flatMap((c) => tokens(c.fala));
export const hashFalas = (reel) => crypto.createHash("sha1").update(falasDe(reel).join(" ")).digest("hex");
const lerJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

export function ouvidas(fa) {
  return (fa.words ?? []).filter((w) => String(w.text).trim()).map((w) => ({ w: w.text, s: w.start, e: w.end, loss: w.loss }));
}

// As palavras devolvidas têm que ser as do roteiro (o alinhamento forçado devolve o texto enviado, então isto
// pega erro de tokenização; quem prova que a fala é o roteiro é a perda, em checarPerda).
export function checarCobertura(r, { minimo = 0.95 } = {}) {
  const pct = Math.round((100 * r.casadas) / r.total);
  if (r.casadas / r.total >= minimo) return { pct };
  throw new Reprovada(`só ${pct}% da fala casou com o roteiro (mínimo ${Math.round(minimo * 100)}%); não casou: ${trechosSem(r).slice(0, 5).join(", ")}`);
}

function trechosSem(r) {
  const trechos = [];
  for (let i = 0; i < r.total; i++) {
    if (r.casou[i]) continue;
    let k = i;
    while (k < r.total && !r.casou[k]) k++;
    trechos.push(`"${r.words.slice(i, k).map((w) => w.w).join(" ")}"`);
    i = k;
  }
  return trechos;
}

// Barra a tomada quando o áudio não é este roteiro (perda média alta) ou quando um trecho foi pulado ou trocado
// (janela de palavras com perda alta, mostrada na mensagem). Palavra solta mal encaixada vira só aviso.
export function checarPerda(heard, perdaMedia, o = PERDA) {
  if (perdaMedia > o.tetoMedia) throw new Reprovada(`a fala não bate com o roteiro (perda ${perdaMedia.toFixed(2)}): o áudio é de outro roteiro?`);
  let pior = 0;
  let onde = 0;
  for (let i = 0; i + o.janela <= heard.length; i++) {
    const m = heard.slice(i, i + o.janela).reduce((a, h) => a + (h.loss ?? 0), 0) / o.janela;
    if (m > pior) [pior, onde] = [m, i];
  }
  if (pior > o.tetoJanela) throw new Reprovada(`a fala não bate com o roteiro perto de "${heard.slice(onde, onde + o.janela).map((h) => h.w).join(" ")}": você pulou ou trocou esse trecho? Regrava.`);
  return { perda: perdaMedia, suspeitas: heard.filter((h) => h.loss > o.tetoPalavra).map((h) => h.w) };
}

// Vão longo no meio de um parágrafo = provável frase repetida (o alinhador fica com uma tentativa e o corte de
// pausa tira a outra). Não barra: avisa pra você ouvir a emenda.
export function vaosNoMeio(words, reel, { minimo = 1.5 } = {}) {
  const inicios = new Set();
  let k = 0;
  for (const c of reel.cenas) inicios.add(k), (k += tokens(c.fala).length);
  const vaos = [];
  for (let i = 1; i < words.length; i++) {
    const v = words[i].s - words[i - 1].e;
    if (v > minimo && !inicios.has(i)) vaos.push({ depois: words[i - 1].w, antes: words[i].w, em: words[i - 1].e, segundos: Math.round(v * 100) / 100 });
  }
  return vaos;
}

// Pausa maior que maxPausa (fim de parágrafo, respirada longa, tentativa repetida) vira folga + respiro.
export function cortarPausas(words, opts = {}) {
  const o = { ...PAUSAS, ...opts };
  const grupos = [];
  for (const w of words) {
    const g = grupos[grupos.length - 1];
    if (g && w.s - g[g.length - 1].e <= o.maxPausa) g.push(w);
    else grupos.push([w]);
  }
  return juntarFalas(grupos.map((g) => ({ words: g })), o);
}

const pastaGravacao = (dir) => path.join(dir, "gravacao");
const impressao = (f) => crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex");
const numeroDa = (tomada) => /tomada-(\d+)\./.exec(path.basename(tomada))?.[1];

// meta: o que a página mostrou quando você gravou ({ falas, hash, marcas do Espaço }), guardado em tomada-N.json.
export function salvarTomada(dir, buf, ext, meta) {
  const pasta = pastaGravacao(dir);
  fs.mkdirSync(pasta, { recursive: true });
  const n = 1 + Math.max(0, ...fs.readdirSync(pasta).map((f) => /^tomada-(\d+)\./.exec(f)).filter(Boolean).map((m) => Number(m[1])));
  const arquivo = path.join(pasta, `tomada-${n}.${ext}`);
  fs.writeFileSync(arquivo, buf);
  if (meta) fs.writeFileSync(path.join(pasta, `tomada-${n}.json`), JSON.stringify(meta, null, 2));
  return arquivo;
}

const FORMATOS = new Set(["webm", "ogg", "wav", "m4a", "mp3"]);
// Tomada gravada fora da página: copia pra gravacao/tomada-N.<ext> (o arquivo original não muda).
export function importarTomada(dir, arquivo, meta) {
  if (!fs.existsSync(arquivo)) throw new Error(`não achei a tomada ${arquivo}`);
  const ext = path.extname(arquivo).slice(1).toLowerCase();
  if (!FORMATOS.has(ext)) throw new Error(`formato .${ext} não aceito na tomada (use ${[...FORMATOS].join(", ")})`);
  return salvarTomada(dir, fs.readFileSync(arquivo), ext, meta);
}

export function escolherTomada(dir, arquivo, hash) {
  fs.writeFileSync(path.join(pastaGravacao(dir), "escolhida.json"), JSON.stringify({ arquivo: path.basename(arquivo), hash, em: new Date().toISOString() }, null, 2));
}

// null = sem gravação escolhida; "velha" = gravada sobre um texto que mudou depois (vale como inexistente).
export function gravacaoDoReel(dir, reel) {
  const f = path.join(pastaGravacao(dir), "escolhida.json");
  if (!fs.existsSync(f)) return null;
  const e = lerJson(f);
  const arquivo = path.join(pastaGravacao(dir), e.arquivo);
  if (!fs.existsSync(arquivo)) return null;
  const hash = hashFalas(reel);
  return { estado: e.hash === hash ? "valida" : "velha", arquivo, hash };
}

function ffmpeg(args) {
  const ff = spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...args]);
  if (ff.error) throw new Error(`ffmpeg não encontrado no PATH (instale em https://ffmpeg.org/download.html): ${ff.error.message}`);
  if (ff.status !== 0) throw new Error(`ffmpeg falhou: ${ff.stderr}`);
}

// Tira do áudio os trechos refeitos (retomadas): cada corte [a, b) some e o resto fica colado. atrim é exato na
// amostra (aselect e enable= andam em blocos de 23 ms).
function cortarTrechos(origem, destino, cortes) {
  const partes = cortes.reduce((acc, c) => (acc.at(-1).end = c.a, [...acc, { start: c.b }]), [{ start: 0 }]);
  const k = partes.length;
  const fil = [`[0:a]asplit=${k}${partes.map((_, i) => `[a${i}]`).join("")}`];
  partes.forEach((x, i) => fil.push(`[a${i}]atrim=start=${x.start}${x.end != null ? `:end=${x.end}` : ""},asetpts=PTS-STARTPTS[p${i}]`));
  fil.push(`${partes.map((_, i) => `[p${i}]`).join("")}concat=n=${k}:v=0:a=1[out]`);
  ffmpeg(["-i", origem, "-filter_complex", fil.join(";"), "-map", "[out]", "-ar", "44100", "-ac", "1", destino]);
}

// Alinhamento guardado por tomada (impressão digital) e por texto: reprocessar a mesma tomada não paga de novo.
async function alinharCacheado(dir, n, digital, falas, limpa, alinhar) {
  const cache = path.join(pastaGravacao(dir), `alinhamento-${n}.json`);
  const hash = hashFalas({ cenas: falas.map((fala) => ({ fala })) });
  const guardado = fs.existsSync(cache) ? lerJson(cache) : null;
  const porHash = guardado?.digital === digital ? guardado.porHash ?? {} : {};
  if (porHash[hash]) return porHash[hash];
  porHash[hash] = await alinhar(limpa, falas.flatMap((f) => tokens(f)).join(" "));
  fs.writeFileSync(cache, JSON.stringify({ digital, porHash }));
  return porHash[hash];
}

// Tira palavras da fala; a pontuação final da palavra que sai passa pra anterior ("segue aí." sem "aí" = "segue.")
// e, se ela abria a frase com maiúscula, a seguinte herda ("Tá, mas pode" sem "Tá" = "Mas pode").
function tirarPalavras(fala, fora) {
  const t = tokens(fala);
  const out = [];
  let herdaMaiuscula = false;
  t.forEach((w, k) => {
    if (!fora.has(k)) {
      out.push(herdaMaiuscula ? w.replace(/\p{L}/u, (c) => c.toUpperCase()) : w);
      herdaMaiuscula = false;
      return;
    }
    const abria = (k === 0 || /[.?!…]["”']?$/.test(t[k - 1])) && /^\P{L}*\p{Lu}/u.test(w);
    herdaMaiuscula = herdaMaiuscula || abria;
    const p = /[^\p{L}\p{N}]+$/u.exec(w)?.[0];
    if (p && out.length && !/[^\p{L}\p{N}]$/u.test(out.at(-1))) out[out.length - 1] += p;
  });
  return out.join(" ");
}

// Custo: preço da transcrição da ElevenLabs (medido em 14/10: ~13 créditos por minuto de áudio).
export async function alinharElevenLabs(arquivo, texto) {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(arquivo)]), path.basename(arquivo));
  form.append("text", texto);
  const r = await fetch("https://api.elevenlabs.io/v1/forced-alignment", { method: "POST", headers: { "xi-api-key": apiKey() }, body: form });
  if (!r.ok) throw new Error(`ElevenLabs alinhamento ${r.status}: ${(await r.text()).slice(0, 400)}`);
  return r.json();
}

// Mesmo preço do alinhamento por minuto de áudio; scribe_v2 sem verbatim tira "é...", "tipo" e frase abandonada.
export async function transcreverElevenLabs(arquivo) {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(arquivo)]), path.basename(arquivo));
  for (const [k, v] of Object.entries({ model_id: "scribe_v2", language_code: "por", no_verbatim: "true", timestamps_granularity: "word", tag_audio_events: "false" })) form.append(k, v);
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": apiKey() }, body: form });
  if (!r.ok) throw new Error(`ElevenLabs transcrição ${r.status}: ${(await r.text()).slice(0, 400)}`);
  return r.json();
}

// tomada: arquivo da tomada nova (vinda da página). hash: o texto que a página mostrou (recusa se o roteiro
// mudou). Com tomada nova, fala livre: a tomada é transcrita e, se você falou diferente do texto que leu (guardado
// com a tomada em tomada-N.json, junto das marcas do Espaço), o texto do reel vira o que você falou; o roteiro de
// antes fica em reel-roteiro.json. Sem tomada (reprocessar a escolhida: produzir, --literal), modo literal: usa
// o texto de hoje como está, inclusive depois de uma correção feita à mão (a escolhida "velha" vale). Só no
// sucesso a tomada vira a escolhida e a narração e a fala do reel são trocadas (a fala por último); se não
// passar, o reel fica como estava. Recusa de qualidade (parágrafo pulado, outro roteiro) é Reprovada.
export async function processarGravacao(dir, { tomada, hash, livre, alinhar = alinharElevenLabs, transcrever = transcreverElevenLabs } = {}) {
  const fReel = path.join(dir, "reel.json");
  const reelInicio = lerJson(fReel);
  if (hash && hash !== hashFalas(reelInicio)) throw new Error("o roteiro mudou desde que a página abriu: recarregue a página e grave de novo");
  livre = livre ?? Boolean(tomada);
  if (!tomada) {
    const g = gravacaoDoReel(dir, reelInicio);
    if (!g) throw new Error("não tem gravação neste reel");
    if (g.estado !== "valida" && livre) throw new Error("a gravação é de um texto antigo: grave de novo (ou use --literal pra usar com o texto de hoje)");
    tomada = g.arquivo;
  }
  const n = numeroDa(tomada);
  const digital = impressao(tomada);
  const fMeta = path.join(pastaGravacao(dir), `tomada-${n}.json`);
  const meta = fs.existsSync(fMeta) ? lerJson(fMeta) : null;
  const limpa = path.join(pastaGravacao(dir), `limpa-${n}.wav`);
  ffmpeg(["-i", tomada, "-af", FILTRO_LIMPEZA, "-ar", "44100", "-ac", "1", limpa]);
  const falasHoje = reelInicio.cenas.map((c) => c.fala);
  let r = { falas: falasHoje, mudancas: [], origens: falasHoje.map((f) => tokens(f).map((_, i) => i)) };
  // Trecho refeito ("errei, vou gravar de novo essa parte") achado na transcrição fica guardado na tomada:
  // reprocessar a escolhida (produzir, --literal) corta igual, sem transcrever de novo.
  let retomadas = meta?.retomadas?.digital === digital ? meta.retomadas : null;
  if (livre) {
    // Transcrição guardada pela impressão digital da tomada (tomada nova com o mesmo número paga de novo).
    const fStt = path.join(pastaGravacao(dir), `transcricao-${n}.json`);
    let stt = fs.existsSync(fStt) && lerJson(fStt).digital === digital ? lerJson(fStt).stt : null;
    if (!stt) {
      stt = await transcrever(limpa);
      fs.writeFileSync(fStt, JSON.stringify({ digital, stt }));
    }
    const lido = meta?.falas?.length === falasHoje.length ? meta.falas : falasHoje;
    const ouvido = palavrasDaTranscricao(stt);
    const achadas = acharRetomadas(ouvido, lido);
    retomadas = { digital, cortes: achadas.cortes.map(({ a, b, texto }) => ({ a, b, texto })), avisos: achadas.avisos };
    if (achadas.cortes.length || achadas.avisos.length || meta?.retomadas) {
      fs.writeFileSync(fMeta, JSON.stringify({ ...(fs.existsSync(fMeta) ? lerJson(fMeta) : {}), retomadas }, null, 2));
    }
    const sem = semRetomadas(ouvido, achadas.cortes, meta?.marcas);
    r = falasDoQueFalou({ cenas: lido.map((fala) => ({ fala })) }, sem.palavras, { marcas: sem.marcas });
  }
  const cortes = retomadas?.cortes ?? [];
  const audio = cortes.length ? path.join(pastaGravacao(dir), `limpa-${n}-sem-retomada.wav`) : limpa;
  const digitalAudio = cortes.length ? `${digital}:${crypto.createHash("sha1").update(JSON.stringify(cortes.map((c) => [c.a, c.b]))).digest("hex")}` : digital;
  if (cortes.length) cortarTrechos(limpa, audio, cortes);
  // Palavra incerta (só a transcrição apagou): fica se o alinhamento forçado acha ela no áudio, sai se não acha.
  if (r.incertas?.some((x) => x.length)) {
    const ouv = ouvidas(await alinharCacheado(dir, n, digitalAudio, r.falas, audio, alinhar));
    const { match } = align(r.falas.flatMap((f) => tokens(f)), ouv);
    let base = 0;
    const tirar = r.falas.map((f, c) => {
      // Palavra dita tem perda até ~1 e nunca menos de 10 ms (calibração de 14/10); fora disso, não foi falada.
      const fora = new Set(r.incertas[c].filter((k) => {
        const h = ouv[match[base + k]];
        return !h || (h.loss ?? 0) > PERDA.tetoIncerta || h.e - h.s < 0.01;
      }));
      base += tokens(f).length;
      return fora;
    });
    if (tirar.some((s) => s.size)) {
      r = {
        ...r,
        mudancas: [...r.mudancas, ...r.falas.flatMap((f, c) => [...tirar[c]].map((k) => ({ cena: c, antes: tokens(f)[k], depois: "" })))],
        falas: r.falas.map((f, c) => tirarPalavras(f, tirar[c])),
        origens: r.origens.map((o, c) => o.filter((_, k) => !tirar[c].has(k))),
      };
    }
  }
  const trocar = r.falas.some((f, i) => f !== falasHoje[i]);
  const mudouNoCaminho = () => JSON.stringify(lerJson(fReel).cenas.map((c) => c.fala)) !== JSON.stringify(falasHoje);
  const MUDOU = "o texto do reel mudou enquanto eu processava: recarregue a página e grave de novo";
  if (trocar && mudouNoCaminho()) throw new Error(MUDOU);
  const reel = { ...reelInicio, cenas: reelInicio.cenas.map((c, i) => ({ ...c, fala: r.falas[i] })) };
  const out = await narrarGravada(dir, reel, tomada, audio, n, digitalAudio, alinhar);
  if (trocar) {
    // Só depois da narração pronta o reel recebe o texto falado: processo que morre no meio (rede, Ctrl+C)
    // deixa o reel como estava. Relê na hora de escrever: só a fala muda; outra edição feita no meio fica.
    if (mudouNoCaminho()) throw new Error(MUDOU);
    const agora = lerJson(fReel);
    const fRoteiro = path.join(dir, "reel-roteiro.json");
    if (!fs.existsSync(fRoteiro)) fs.writeFileSync(fRoteiro, JSON.stringify(agora, null, 2) + "\n");
    fs.writeFileSync(fReel, JSON.stringify({ ...agora, cenas: agora.cenas.map((c, i) => ({ ...c, fala: r.falas[i] })) }, null, 2) + "\n");
  }
  // O que foi falado fica com a tomada: é o único texto que a trava aceita no lugar do aprovado (scripts/aprovacao.mjs).
  // O modo literal não mexe nele: texto corrigido à mão depois da gravação precisa ser aprovado no roteiro.md.
  if (livre) fs.writeFileSync(fMeta, JSON.stringify({ ...(fs.existsSync(fMeta) ? lerJson(fMeta) : {}), falado: r.falas }, null, 2));
  return { ...out, mudancas: r.mudancas, origens: r.origens, falas: r.falas, retomadas: cortes, avisos_retomada: retomadas?.avisos ?? [] };
}

async function narrarGravada(dir, reel, tomada, limpa, n, digital, alinhar) {
  const hashHoje = hashFalas(reel);
  const script = falasDe(reel);
  const fa = await alinharCacheado(dir, n, digital, reel.cenas.map((c) => c.fala), limpa, alinhar);
  const heard = ouvidas(fa);
  const r = align(script, heard);
  const { pct } = checarCobertura(r);
  const { perda, suspeitas } = checarPerda(heard, fa.loss ?? 0);
  const vaos = vaosNoMeio(r.words, reel);
  const { words, cortes } = cortarPausas(r.words);
  // Passou: a partir daqui troca a narração do reel.
  const k = cortes.length;
  const fil = [`[0:a]asplit=${k}${cortes.map((_, i) => `[a${i}]`).join("")}`];
  cortes.forEach((c, i) => fil.push(`[a${i}]atrim=start=${c.a}:end=${c.b},asetpts=PTS-STARTPTS[p${i}]`));
  cortes.slice(0, -1).forEach((_, i) => fil.push(`aevalsrc=0:d=${PAUSAS.respiro}:s=44100:c=mono[s${i}]`));
  fil.push(`${cortes.map((_, i) => (i < k - 1 ? `[p${i}][s${i}]` : `[p${i}]`)).join("")}concat=n=${2 * k - 1}:v=0:a=1[out]`);
  ffmpeg(["-i", limpa, "-filter_complex", fil.join(";"), "-map", "[out]", "-ar", "44100", "-ac", "1", path.join(dir, "narracao-original.wav")]);
  fs.writeFileSync(path.join(dir, "words-base.json"), JSON.stringify(words));
  // Sem acelerar por padrão: é o seu ritmo (reel.voz_gravada.acelerar 1.15 deixa a fala mais corrida, como no reel).
  const acelerar = reel.voz_gravada?.acelerar ?? 1;
  const out = reacelerar(dir, acelerar);
  fs.writeFileSync(path.join(dir, "narracao-voz.json"), JSON.stringify({ gravada: hashHoje, tomada: path.basename(tomada), acelerar }));
  escolherTomada(dir, tomada, hashHoje);
  return { ...out, pct, perda: Math.round(perda * 100) / 100, pausas: k - 1, suspeitas, vaos, hash: hashHoje };
}

// Rodado direto (compara o caminho real: pasta aberta por junção ou link simbólico também conta).
if (process.argv[1] && fs.realpathSync.native(path.resolve(process.argv[1])) === fs.realpathSync.native(fileURLToPath(import.meta.url))) {
  const [alvo, arquivo] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const dir = path.resolve(alvo ?? ".");
  const teste = process.argv.includes("--teste");
  // Mesma trava do gravador: sem roteiro aprovado, nada é processado (nem pago). O dynamic import evita o ciclo
  // kit/voz-gravada.mjs <-> scripts/aprovacao.mjs na carga do módulo.
  const trabalho = (async () => {
    const { checarAprovacao } = await import("../scripts/aprovacao.mjs");
    const tela = teste ? JSON.parse(fs.readFileSync(path.join(dir, "reel.json"), "utf8")).cenas.map((c) => c.fala) : checarAprovacao(dir).falas;
    // Tomada gravada fora da página (celular, outro programa): entra em gravacao/ como tomada-N, com o texto lido.
    const tomada = arquivo ? importarTomada(dir, path.resolve(arquivo), { falas: tela }) : undefined;
    return processarGravacao(dir, { tomada, livre: tomada ? !process.argv.includes("--literal") : false });
  })();
  trabalho
    .then((r) => console.log(`[voz] gravada: ${r.palavras} palavras, ${r.duracao}s, perda ${r.perda}, ${r.pausas} pausa(s) encurtada(s)${r.vaos.length ? `; ouça a emenda depois de: ${r.vaos.map((v) => `"${v.depois}"`).join(", ")}` : ""}${r.suspeitas.length ? `; confira: ${r.suspeitas.join(", ")}` : ""}`))
    .catch((e) => {
      console.error(String(e.message ?? e));
      process.exit(1);
    });
}
