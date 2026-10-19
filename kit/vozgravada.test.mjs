// Voz gravada no PC: hash do texto, leitura e checagem do alinhamento forçado, pausas, tomadas, o gravador local
// e o fluxo inteiro (sincronia medida no áudio final).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { align } from "./align.mjs";
import {
  hashFalas, ouvidas, checarCobertura, checarPerda, vaosNoMeio, cortarPausas, gravacaoDoReel, salvarTomada, escolherTomada, processarGravacao,
  palavrasDaTranscricao, falasDoQueFalou, porExtenso,
} from "./voz-gravada.mjs";

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const json = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2));
const ler = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const reel2 = { slug: "rv", cenas: [{ tipo: "hook", fala: "Oi gente, tudo bem?" }, { tipo: "segue", fala: "Me segue aí." }] };
const ffmpeg = (args) => {
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...args]);
  assert.equal(r.status, 0, String(r.stderr));
};
const duracao = (f) => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout);

test("hashFalas: muda quando a fala muda, não quando só o espaço muda", () => {
  const a = hashFalas(reel2);
  assert.match(a, /^[0-9a-f]{40}$/);
  assert.equal(hashFalas({ cenas: [{ fala: "Oi  gente,\ntudo bem?" }, { fala: " Me segue aí. " }] }), a);
  assert.notEqual(hashFalas({ cenas: [{ fala: "Oi gente, tudo bem?" }, { fala: "Me segue lá." }] }), a);
});

test("ouvidas: lê as palavras do alinhamento forçado da ElevenLabs e ignora as vazias", () => {
  const fa = { words: [{ text: "Oi", start: 0.1, end: 0.3, loss: 0.2 }, { text: " ", start: 0.3, end: 0.35, loss: 0 }, { text: "gente,", start: 0.35, end: 0.8, loss: 0.4 }], loss: 0.3 };
  assert.deepEqual(ouvidas(fa), [{ w: "Oi", s: 0.1, e: 0.3, loss: 0.2 }, { w: "gente,", s: 0.35, e: 0.8, loss: 0.4 }]);
});

test("align: diz palavra a palavra o que casou", () => {
  const r = align(["Oi", "gente,", "tudo", "bem?"], [{ w: "Oi", s: 0, e: 0.2 }, { w: "bem", s: 1, e: 1.2 }]);
  assert.deepEqual(r.casou, [true, false, false, true]);
  assert.equal(r.casadas, 2);
});

test("checarCobertura: as palavras do alinhamento têm que ser as do roteiro (95% ou mais)", () => {
  const script = "a b c d e f g h i j k l m n o p q r s t".split(" ");
  const tudo = script.map((w, i) => ({ w, s: i, e: i + 0.5 }));
  assert.equal(checarCobertura(align(script, tudo)).pct, 100);
  const faltando = tudo.filter((h) => !["h", "i", "j"].includes(h.w));
  assert.throws(() => checarCobertura(align(script, faltando)), (e) => /85%/.test(e.message) && /"h i j"/.test(e.message));
});

// Calibrado em 14/10 com a API real sobre o SOL: certo 0,52 de média e pior janela 0,74; parágrafo pulado
// 1,34 e janela 11,3; áudio de outro reel 4,48 e janela 10,2. O alinhamento forçado sempre encaixa o texto
// pedido, então "casou 100%" não prova nada: quem prova é a perda.
test("checarPerda: barra áudio de outro reel e trecho pulado, mostrando onde; tomada certa passa", () => {
  const ws = (losses) => losses.map((loss, i) => ({ w: `p${i}`, s: i, e: i + 0.5, loss }));
  const boa = { loss: 0.52, words: ws([0.4, 0.6, 0.5, 0.7, 0.98, 0.5, 0.6, 0.4]) };
  const r = checarPerda(boa.words, boa.loss);
  assert.equal(r.perda, 0.52);
  assert.deepEqual(r.suspeitas, []);
  const pulado = ws([0.5, 0.5, 9, 12, 14, 11, 10, 0.5]);
  assert.throws(() => checarPerda(pulado, 1.34), (e) => /p2 p3 p4 p5 p6/.test(e.message) && /pulou|trocou/.test(e.message));
  assert.throws(() => checarPerda(ws([2.1, 2.2, 2.3, 2.1, 2.2, 2.4]), 4.48), /outro roteiro|não bate/);
  // Uma palavra só mal encaixada não barra, mas vira aviso.
  assert.deepEqual(checarPerda(ws([0.5, 0.5, 2.8, 0.5, 0.5, 0.5, 0.5]), 0.8).suspeitas, ["p2"]);
});

test("vaosNoMeio: vão longo no meio de um parágrafo (frase repetida e cortada) vira aviso; entre parágrafos não", () => {
  const w = [["Oi", 0, 0.2], ["gente,", 0.25, 0.5], ["tudo", 3.6, 3.8], ["bem?", 3.85, 4.1], ["Me", 7.0, 7.2], ["segue", 7.25, 7.5], ["aí.", 7.55, 7.8]].map(([x, s, e]) => ({ w: x, s, e }));
  assert.deepEqual(vaosNoMeio(w, reel2), [{ depois: "gente,", antes: "tudo", em: 0.5, segundos: 3.1 }]);
});

test("cortarPausas: pausa curta fica como está, pausa longa vira folga + respiro", () => {
  const words = [{ w: "um", s: 0.5, e: 0.9 }, { w: "dois", s: 1.1, e: 1.5 }, { w: "três", s: 4.0, e: 4.4 }];
  const r = cortarPausas(words, { maxPausa: 0.45, respiro: 0.18, folgaIni: 0.08, folgaFim: 0.12 });
  assert.deepEqual(r.cortes, [{ a: 0.42, b: 1.62 }, { a: 3.92, b: 4.52 }]);
  assert.ok(Math.abs(r.words[1].s - r.words[0].e - 0.2) < 1e-9, "pausa curta preservada");
  assert.ok(Math.abs(r.words[2].s - r.words[1].e - (0.12 + 0.18 + 0.08)) < 1e-9, "pausa longa vira folga + respiro");
  assert.equal(r.words[0].s, 0.08);
});

test("salvarTomada numera; só a tomada que passou vira a escolhida; texto mudou = gravação velha", () => {
  const dir = tmp("grav-");
  json(path.join(dir, "reel.json"), reel2);
  assert.equal(gravacaoDoReel(dir, reel2), null);
  const t1 = salvarTomada(dir, Buffer.from("a"), "webm");
  const t2 = salvarTomada(dir, Buffer.from("b"), "webm");
  assert.deepEqual([t1, t2].map((f) => path.basename(f)), ["tomada-1.webm", "tomada-2.webm"]);
  assert.equal(gravacaoDoReel(dir, reel2), null, "salvar não escolhe: só a tomada processada com sucesso vira a escolhida");
  escolherTomada(dir, t1, hashFalas(reel2));
  const g = gravacaoDoReel(dir, reel2);
  assert.deepEqual([g.estado, g.arquivo, g.hash], ["valida", t1, hashFalas(reel2)]);
  assert.equal(gravacaoDoReel(dir, { ...reel2, cenas: [reel2.cenas[0], { tipo: "segue", fala: "Me segue lá." }] }).estado, "velha");
});

// Tomada sintética: cada "palavra" é um bipe num tempo conhecido, com 2,5 s de silêncio entre os parágrafos.
const BIPES = [[0.2, 0.4], [0.55, 0.75], [0.9, 1.0], [1.15, 1.3], [3.8, 4.0], [4.15, 4.35], [4.5, 4.7]];
function tomadaDeBipes(dir) {
  const bruto = path.join(dir, "bruto.wav");
  const liga = BIPES.map(([s, e]) => `between(t,${s},${e})`).join("+");
  ffmpeg(["-f", "lavfi", "-i", "sine=f=440:d=5.2", "-af", `volume=0:enable='not(${liga})'`, bruto]);
  return salvarTomada(dir, fs.readFileSync(bruto), "wav");
}
const alinharBipes = (contador = { n: 0 }, loss = 0.4) => async (arquivo, texto) => {
  contador.n++;
  contador.arquivo = arquivo;
  contador.texto = texto;
  return { words: texto.split(" ").map((w, i) => ({ text: w, start: BIPES[i][0], end: BIPES[i][1], loss })), loss };
};
// Transcrição falsa: o texto dito, uma palavra por bipe (com os espaços que a ElevenLabs devolve).
const TEXTO2 = "Oi gente, tudo bem? Me segue aí.";
const transcreverBipes = (texto, contador = {}) => async () => {
  contador.n = (contador.n ?? 0) + 1;
  return { words: texto.split(" ").flatMap((w, i) => [{ text: w, type: "word", start: BIPES[i][0], end: BIPES[i][1] }, { text: " ", type: "spacing", start: BIPES[i][1], end: BIPES[i][1] }]) };
};
// Início de cada som no áudio final (fim de cada silêncio), pra medir a sincronia de verdade.
function inicios(arquivo) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", arquivo, "-af", "silencedetect=noise=-35dB:d=0.03", "-f", "null", "-"], { encoding: "utf8" });
  return [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
}

test("processarGravacao: legenda cai no som (medido no mp3), duração exata, pausa longa cortada, escolhida só no sucesso", async () => {
  const dir = tmp("grav-proc-");
  json(path.join(dir, "reel.json"), reel2);
  const tomada = tomadaDeBipes(dir);
  const c = { n: 0 };
  const r = await processarGravacao(dir, { tomada, hash: hashFalas(reel2), alinhar: alinharBipes(c), transcrever: transcreverBipes(TEXTO2) });
  assert.equal(c.texto, "Oi gente, tudo bem? Me segue aí.");
  assert.match(path.basename(c.arquivo), /^limpa-1\.wav$/, "intermediário por tomada");
  assert.equal(r.pct, 100);
  const words = ler(path.join(dir, "words.json"));
  assert.deepEqual(words.map((w) => w.w), ["Oi", "gente,", "tudo", "bem?", "Me", "segue", "aí."]);
  // Sincronia: cada palavra que começa depois de silêncio tem que começar onde o som começa no mp3 final.
  const sons = inicios(path.join(dir, "narracao.mp3"));
  for (const i of [0, 1, 2, 3, 4, 5, 6]) {
    const perto = Math.min(...sons.map((t) => Math.abs(t - words[i].s)));
    assert.ok(perto < 0.04, `palavra ${words[i].w} em ${words[i].s}s e o som mais perto a ${perto}s`);
  }
  // Duração: os dois trechos + um respiro (o resto do silêncio sumiu).
  const B = BIPES;
  const esperado = (B[3][1] + 0.12 - (B[0][0] - 0.08)) + 0.18 + (B[6][1] + 0.12 - (B[4][0] - 0.08));
  assert.ok(Math.abs(duracao(path.join(dir, "narracao.mp3")) - esperado) < 0.06, `duração ${duracao(path.join(dir, "narracao.mp3"))} x ${esperado}`);
  assert.deepEqual(ler(path.join(dir, "narracao-voz.json")), { gravada: hashFalas(reel2), tomada: "tomada-1.wav", acelerar: 1 });
  assert.equal(gravacaoDoReel(dir, reel2).arquivo, tomada);
  // Refazer a mesma tomada é de graça: o alinhamento salvo é reaproveitado.
  await processarGravacao(dir, { alinhar: alinharBipes(c), transcrever: transcreverBipes(TEXTO2) });
  assert.equal(c.n, 1);
});

test("processarGravacao: tomada que não bate com o roteiro não vira a escolhida nem mexe na narração", async () => {
  const dir = tmp("grav-ruim-");
  json(path.join(dir, "reel.json"), reel2);
  fs.writeFileSync(path.join(dir, "narracao.mp3"), "narração anterior");
  const tomada = tomadaDeBipes(dir);
  await assert.rejects(processarGravacao(dir, { tomada, hash: hashFalas(reel2), alinhar: alinharBipes({ n: 0 }, 9), transcrever: transcreverBipes(TEXTO2) }), /não bate/);
  assert.equal(gravacaoDoReel(dir, reel2), null);
  assert.equal(fs.readFileSync(path.join(dir, "narracao.mp3"), "utf8"), "narração anterior");
  // Texto mudou entre abrir a página e salvar: recusa.
  await assert.rejects(processarGravacao(dir, { tomada, hash: "outro", alinhar: alinharBipes(), transcrever: transcreverBipes(TEXTO2) }), /roteiro mudou/);
});

test("gravador: roteiro com hash; recusa tipo estranho, outra origem, roteiro mudado e tomada vazia sem salvar nada", async () => {
  const { criarServidor, tituloLimpo, extensaoDe } = await import("../scripts/gravar.mjs");
  assert.equal(tituloLimpo("E SE O SOL | *SUMISSE*?"), "E SE O SOL SUMISSE?");
  assert.equal(extensaoDe("audio/webm;codecs=opus"), "webm");
  assert.equal(extensaoDe("text/plain"), null);
  const dir = tmp("grav-srv-");
  json(path.join(dir, "reel.json"), { ...reel2, titulo: "OI | *GENTE*" });
  const srv = criarServidor(dir, { teste: true });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (headers, body = Buffer.alloc(5000)) => fetch(`${base}/tomada`, { method: "POST", headers, body });
  try {
    const rot = await (await fetch(`${base}/roteiro`)).json();
    assert.deepEqual(rot, { slug: "rv", titulo: "OI GENTE", falas: ["Oi gente, tudo bem?", "Me segue aí."], hash: hashFalas(reel2), gravacao: null, teste: true });
    assert.equal((await post({ "content-type": "text/plain", "x-hash": rot.hash })).status, 415);
    assert.equal((await post({ "content-type": "audio/webm", "x-hash": rot.hash, origin: "https://site-qualquer.example" })).status, 403);
    assert.equal((await post({ "content-type": "audio/webm", "x-hash": "velho" })).status, 409);
    assert.equal((await post({ "content-type": "audio/webm", "x-hash": rot.hash }, Buffer.from("x"))).status, 400);
    assert.ok(!fs.existsSync(path.join(dir, "gravacao")), "nada recusado é salvo");
    assert.equal((await fetch(`${base}/narracao.mp3`)).status, 404);
  } finally {
    srv.close();
  }
});

// Fala livre: ele pode trocar palavras ao gravar; o texto do reel vira o que ele falou.
const ouv = (lista) => lista.map(([w, s, e]) => ({ w, s, e }));
const reel3 = { slug: "r3", cenas: [{ fala: "Oi gente, tudo bem?" }, { fala: "Hoje eu vou mostrar uma coisa." }, { fala: "Me segue aí." }] };

test("palavrasDaTranscricao: só as palavras, sem espaço nem evento de áudio", () => {
  const stt = { words: [{ text: "Oi", type: "word", start: 0.1, end: 0.2 }, { text: " ", type: "spacing", start: 0.2, end: 0.25 }, { text: "(risos)", type: "audio_event", start: 0.3, end: 0.6 }, { text: "gente,", type: "word", start: 0.6, end: 0.9 }] };
  assert.deepEqual(palavrasDaTranscricao(stt), [{ w: "Oi", s: 0.1, e: 0.2 }, { w: "gente,", s: 0.6, e: 0.9 }]);
});

test("falasDoQueFalou: leitura igual ao roteiro não muda nada (a pontuação do roteiro fica)", () => {
  const heard = ouv([["Oi", 0, 0.2], ["gente", 0.25, 0.5], ["tudo", 0.55, 0.7], ["bem?", 0.75, 0.9], ["Hoje", 2, 2.2], ["eu", 2.25, 2.3], ["vou", 2.35, 2.5], ["mostrar", 2.55, 2.9], ["uma", 2.95, 3.1], ["coisa", 3.15, 3.5], ["Me", 5, 5.1], ["segue", 5.15, 5.4], ["aí", 5.45, 5.6]]);
  const r = falasDoQueFalou(reel3, heard);
  assert.deepEqual(r.falas, reel3.cenas.map((c) => c.fala));
  assert.deepEqual(r.mudancas, []);
});

test("falasDoQueFalou: palavra trocada ou a mais vira o texto do reel e cada mudança aparece com antes e depois", () => {
  const heard = ouv([["Oi", 0, 0.2], ["pessoal,", 0.25, 0.6], ["tudo", 0.65, 0.8], ["bem?", 0.85, 1], ["Hoje", 2, 2.2], ["eu", 2.25, 2.3], ["vou", 2.35, 2.5], ["te", 2.52, 2.6], ["mostrar", 2.65, 2.9], ["um", 2.95, 3.05], ["negócio.", 3.1, 3.5], ["Me", 5, 5.1], ["segue", 5.15, 5.4], ["aí.", 5.45, 5.6]]);
  const r = falasDoQueFalou(reel3, heard);
  assert.deepEqual(r.falas, ["Oi pessoal, tudo bem?", "Hoje eu vou te mostrar um negócio.", "Me segue aí."]);
  assert.deepEqual(r.mudancas, [
    { cena: 0, antes: "gente,", depois: "pessoal," },
    { cena: 1, antes: "", depois: "te" },
    { cena: 1, antes: "uma coisa.", depois: "um negócio." },
  ]);
});

test("falasDoQueFalou: palavra a mais na virada do parágrafo fica do lado da pausa, com maiúscula de quem falou", () => {
  // "Beleza?" logo depois de "bem?" fica na cena 1; "Então" depois da pausa abre a cena 3 (e o "Me" vira "me").
  const heard = ouv([["Oi", 0, 0.2], ["gente,", 0.25, 0.5], ["tudo", 0.55, 0.7], ["bem?", 0.75, 0.9], ["Beleza?", 0.95, 1.3], ["Hoje", 3, 3.2], ["eu", 3.25, 3.3], ["vou", 3.35, 3.5], ["mostrar", 3.55, 3.9], ["uma", 3.95, 4.1], ["coisa.", 4.15, 4.5], ["Então", 6.5, 6.7], ["me", 6.75, 6.85], ["segue", 6.9, 7.1], ["aí.", 7.15, 7.3]]);
  const r = falasDoQueFalou(reel3, heard);
  assert.deepEqual(r.falas, ["Oi gente, tudo bem? Beleza?", "Hoje eu vou mostrar uma coisa.", "Então me segue aí."]);
});

test("falasDoQueFalou: parágrafo dito com outras palavras entra inteiro, separado pelas pausas", () => {
  const heard = ouv([["Oi", 0, 0.2], ["gente,", 0.25, 0.5], ["tudo", 0.55, 0.7], ["bem?", 0.75, 0.9], ["Olha", 2.5, 2.7], ["só", 2.75, 2.9], ["isso", 2.95, 3.2], ["aqui.", 3.25, 3.5], ["Me", 5, 5.1], ["segue", 5.15, 5.4], ["aí.", 5.45, 5.6]]);
  const r = falasDoQueFalou(reel3, heard);
  assert.deepEqual(r.falas, ["Oi gente, tudo bem?", "Olha só isso aqui.", "Me segue aí."]);
  assert.deepEqual(r.mudancas, [{ cena: 1, antes: "Hoje eu vou mostrar uma coisa.", depois: "Olha só isso aqui." }]);
});

test("falasDoQueFalou: parágrafo pulado inteiro barra dizendo qual", () => {
  const heard = ouv([["Oi", 0, 0.2], ["gente,", 0.25, 0.5], ["tudo", 0.55, 0.7], ["bem?", 0.75, 0.9], ["Me", 3, 3.1], ["segue", 3.15, 3.4], ["aí.", 3.45, 3.6]]);
  assert.throws(() => falasDoQueFalou(reel3, heard), /parágrafo 2/);
});

test("processarGravacao (fala livre): o texto do reel vira o que ele falou, o roteiro fica guardado e tomada ruim não mexe no texto", async () => {
  const dir = tmp("grav-livre-");
  json(path.join(dir, "reel.json"), reel2);
  const dito = "Oi pessoal, tudo bem? Me segue aí.";
  const c = { n: 0 };
  const r = await processarGravacao(dir, { tomada: tomadaDeBipes(dir), hash: hashFalas(reel2), alinhar: alinharBipes(c), transcrever: transcreverBipes(dito) });
  assert.equal(c.texto, dito, "o alinhamento preciso roda sobre o que ele falou");
  const novo = ler(path.join(dir, "reel.json"));
  assert.deepEqual(novo.cenas.map((x) => x.fala), ["Oi pessoal, tudo bem?", "Me segue aí."]);
  assert.deepEqual(ler(path.join(dir, "reel-roteiro.json")).cenas.map((x) => x.fala), reel2.cenas.map((x) => x.fala));
  assert.deepEqual(r.mudancas, [{ cena: 0, antes: "gente,", depois: "pessoal," }]);
  assert.deepEqual(r.falas, ["Oi pessoal, tudo bem?", "Me segue aí."]);
  assert.equal(r.hash, hashFalas(novo));
  assert.equal(gravacaoDoReel(dir, novo).estado, "valida");
  assert.deepEqual(ler(path.join(dir, "words.json")).map((w) => w.w), ["Oi", "pessoal,", "tudo", "bem?", "Me", "segue", "aí."]);
  // Tomada nova que não passa: o texto continua o da tomada boa e o roteiro original segue guardado.
  await assert.rejects(
    processarGravacao(dir, { tomada: tomadaDeBipes(dir), hash: hashFalas(novo), alinhar: alinharBipes({}, 9), transcrever: transcreverBipes("Oi galera, tudo bem? Me segue aí.") }),
    /não bate/,
  );
  assert.deepEqual(ler(path.join(dir, "reel.json")).cenas.map((x) => x.fala), ["Oi pessoal, tudo bem?", "Me segue aí."]);
  assert.deepEqual(ler(path.join(dir, "reel-roteiro.json")).cenas.map((x) => x.fala), reel2.cenas.map((x) => x.fala));
});

test("gravador (fala livre): salvar devolve as mudanças, o texto e o hash novos; texto de tela que perdeu a palavra vira aviso", async () => {
  const { criarServidor } = await import("../scripts/gravar.mjs");
  const dir = tmp("grav-srv-livre-");
  const reel = { ...reel2, cenas: [{ ...reel2.cenas[0], batidas: [{ tipo: "selo", texto: "GENTE", em: "gente" }] }, reel2.cenas[1]] };
  json(path.join(dir, "reel.json"), reel);
  const bruto = path.join(tmp("bipes-"), "b.wav");
  const liga = BIPES.map(([s, e]) => `between(t,${s},${e})`).join("+");
  ffmpeg(["-f", "lavfi", "-i", "sine=f=440:d=5.2", "-af", `volume=0:enable='not(${liga})'`, bruto]);
  const srv = criarServidor(dir, { teste: true, alinhar: alinharBipes(), transcrever: transcreverBipes("Oi pessoal, tudo bem? Me segue aí.") });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  try {
    const res = await fetch(`http://127.0.0.1:${srv.address().port}/tomada`, { method: "POST", headers: { "content-type": "audio/wav", "x-hash": hashFalas(reel) }, body: fs.readFileSync(bruto) });
    const j = await res.json();
    assert.equal(res.status, 200, JSON.stringify(j));
    assert.deepEqual(j.mudancas, [{ cena: 0, antes: "gente,", depois: "pessoal," }]);
    assert.deepEqual(j.falas, ["Oi pessoal, tudo bem?", "Me segue aí."]);
    assert.equal(j.hash, hashFalas(ler(path.join(dir, "reel.json"))));
    assert.ok(j.ancoras.some((a) => /gente/i.test(a)), JSON.stringify(j.ancoras));
  } finally {
    srv.close();
  }
});

test("porExtenso: número da transcrição vira palavra (a ElevenLabs alterna \"vinte\" e \"20\" na mesma fala)", () => {
  const casos = { 0: "zero", 8: "oito", 14: "catorze", 20: "vinte", 25: "vinte e cinco", 100: "cem", 125: "cento e vinte e cinco", 300: "trezentos", 1000: "mil", 1500: "mil e quinhentos", 1520: "mil quinhentos e vinte", 2026: "dois mil e vinte e seis", 40000: "quarenta mil" };
  for (const [n, txt] of Object.entries(casos)) assert.equal(porExtenso(Number(n)), txt, `${n}`);
});

test("falasDoQueFalou: número em algarismo ou no feminino não conta como mudança e o roteiro mantém a grafia dele", () => {
  const reel = { cenas: [{ fala: "Leva oito minutos e vinte segundos." }, { fala: "Em vinte e cinco dias, duas horas, cinquenta por cento." }] };
  const heard = ouv([["Leva", 0, 0.2], ["8", 0.25, 0.5], ["minutos", 0.55, 0.8], ["e", 0.85, 0.9], ["20", 0.95, 1.2], ["segundos.", 1.25, 1.6], ["Em", 3, 3.1], ["25", 3.15, 3.6], ["dias,", 3.65, 3.9], ["2", 3.95, 4.1], ["horas,", 4.15, 4.4], ["50%.", 4.45, 5]]);
  const r = falasDoQueFalou(reel, heard);
  assert.deepEqual(r.mudancas, []);
  assert.deepEqual(r.falas, reel.cenas.map((c) => c.fala));
});

test("falasDoQueFalou: coloquial e formal são a mesma fala (a transcrição troca \"pra\" por \"para\" e \"pro\" por \"para o\")", () => {
  const reel = { cenas: [{ fala: "Leva oito minutos pra chegar, tá?" }, { fala: "Manda pro Claude e para o time." }] };
  const heard = ouv([["Leva", 0, 0.2], ["oito", 0.25, 0.5], ["minutos", 0.55, 0.8], ["para", 0.85, 1], ["chegar,", 1.05, 1.3], ["está?", 1.35, 1.6], ["Manda", 3, 3.2], ["para", 3.25, 3.4], ["o", 3.42, 3.5], ["Claude", 3.55, 3.9], ["e", 3.95, 4], ["pro", 4.05, 4.2], ["time.", 4.25, 4.6]]);
  const r = falasDoQueFalou(reel, heard);
  assert.deepEqual(r.mudancas, []);
  assert.deepEqual(r.falas, reel.cenas.map((c) => c.fala));
  // Mudança de verdade continua aparecendo do lado da equivalência.
  const outro = ouv([["Leva", 0, 0.2], ["uns", 0.22, 0.3], ["oito", 0.35, 0.5], ["minutos", 0.55, 0.8], ["para", 0.85, 1], ["chegar,", 1.05, 1.3], ["está?", 1.35, 1.6], ["Manda", 3, 3.2], ["pro", 3.25, 3.4], ["Claude", 3.55, 3.9], ["e", 3.95, 4], ["pro", 4.05, 4.2], ["time.", 4.25, 4.6]]);
  const r2 = falasDoQueFalou(reel, outro);
  assert.deepEqual(r2.mudancas, [{ cena: 0, antes: "", depois: "uns" }]);
  assert.deepEqual(r2.falas, ["Leva uns oito minutos pra chegar, tá?", "Manda pro Claude e para o time."]);
});

test("cache da transcrição e do alinhamento é da tomada (impressão digital), não do número: tomada nova com o mesmo número paga de novo", async () => {
  const dir = tmp("grav-cache-");
  json(path.join(dir, "reel.json"), reel2);
  const ct = { n: 0 };
  const ca = { n: 0 };
  await processarGravacao(dir, { tomada: tomadaDeBipes(dir), hash: hashFalas(reel2), alinhar: alinharBipes(ca), transcrever: transcreverBipes(TEXTO2, ct) });
  // Ele apaga os áudios pesados e grava de novo: a tomada nova volta a ser a 1.
  for (const f of fs.readdirSync(path.join(dir, "gravacao"))) if (/^(tomada|limpa)-1\./.test(f)) fs.rmSync(path.join(dir, "gravacao", f));
  const bruto = path.join(dir, "outro.wav");
  ffmpeg(["-f", "lavfi", "-i", "sine=f=660:d=5.2", "-af", `volume=0:enable='not(${BIPES.map(([s, e]) => `between(t,${s},${e})`).join("+")})'`, bruto]);
  const t = salvarTomada(dir, fs.readFileSync(bruto), "wav");
  assert.equal(path.basename(t), "tomada-1.wav");
  await processarGravacao(dir, { tomada: t, hash: hashFalas(reel2), alinhar: alinharBipes(ca), transcrever: transcreverBipes(TEXTO2, ct) });
  assert.deepEqual([ct.n, ca.n], [2, 2]);
});

test("reel.json: edição feita durante o processamento não se perde, e tomada que falha desfaz só a fala (e o backup que ela criou)", async () => {
  const dir = tmp("grav-concorre-");
  json(path.join(dir, "reel.json"), { ...reel2, titulo: "ANTES" });
  const mexeNoTitulo = (texto) => async (arquivo) => {
    const r = ler(path.join(dir, "reel.json"));
    json(path.join(dir, "reel.json"), { ...r, titulo: "EDITADO" });
    return transcreverBipes(texto)(arquivo);
  };
  await processarGravacao(dir, { tomada: tomadaDeBipes(dir), hash: hashFalas(reel2), alinhar: alinharBipes(), transcrever: mexeNoTitulo("Oi pessoal, tudo bem? Me segue aí.") });
  let r = ler(path.join(dir, "reel.json"));
  assert.equal(r.titulo, "EDITADO");
  assert.deepEqual(r.cenas.map((c) => c.fala), ["Oi pessoal, tudo bem?", "Me segue aí."]);
  // Reel novo, primeira tomada falha: a fala volta, o título editado fica e o reel-roteiro.json que ela criou some.
  const dir2 = tmp("grav-concorre2-");
  json(path.join(dir2, "reel.json"), { ...reel2, titulo: "ANTES" });
  const mexe2 = async (arquivo) => {
    const x = ler(path.join(dir2, "reel.json"));
    json(path.join(dir2, "reel.json"), { ...x, titulo: "EDITADO" });
    return transcreverBipes("Oi galera, tudo bem? Me segue aí.")(arquivo);
  };
  await assert.rejects(processarGravacao(dir2, { tomada: tomadaDeBipes(dir2), hash: hashFalas(reel2), alinhar: alinharBipes({}, 9), transcrever: mexe2 }), /não bate/);
  r = ler(path.join(dir2, "reel.json"));
  assert.equal(r.titulo, "EDITADO");
  assert.deepEqual(r.cenas.map((c) => c.fala), reel2.cenas.map((c) => c.fala));
  assert.ok(!fs.existsSync(path.join(dir2, "reel-roteiro.json")), "backup criado por tomada que falhou não fica");
});

test("fala livre: o reel.json só recebe o texto falado depois da narração pronta (processo que morre no meio não deixa o reel pela metade)", async () => {
  const dir = tmp("grav-atomico-");
  json(path.join(dir, "reel.json"), reel2);
  const visto = [];
  const espia = async (arquivo, texto) => {
    visto.push(ler(path.join(dir, "reel.json")).cenas.map((c) => c.fala));
    return alinharBipes()(arquivo, texto);
  };
  await processarGravacao(dir, { tomada: tomadaDeBipes(dir), alinhar: espia, transcrever: transcreverBipes("Oi pessoal, tudo bem? Me segue aí.") });
  assert.ok(visto.length > 0);
  for (const falas of visto) assert.deepEqual(falas, reel2.cenas.map((c) => c.fala), "durante o alinhamento o reel ainda tem o texto de antes");
  assert.deepEqual(ler(path.join(dir, "reel.json")).cenas.map((c) => c.fala), ["Oi pessoal, tudo bem?", "Me segue aí."]);
});

test("tomada reprovada por qualidade é Reprovada; falha de rede ou de ferramenta não", async () => {
  const { Reprovada } = await import("./voz-gravada.mjs");
  const dir = tmp("grav-reprovada-");
  json(path.join(dir, "reel.json"), reel2);
  const ruim = await processarGravacao(dir, { tomada: tomadaDeBipes(dir), alinhar: alinharBipes({}, 9), transcrever: transcreverBipes(TEXTO2) }).catch((e) => e);
  assert.ok(ruim instanceof Reprovada, ruim.message);
  const pulou = await processarGravacao(dir, { tomada: tomadaDeBipes(dir), alinhar: alinharBipes(), transcrever: transcreverBipes("Oi gente, tudo bem?") }).catch((e) => e);
  assert.ok(pulou instanceof Reprovada, pulou.message);
  const rede = await processarGravacao(dir, { tomada: tomadaDeBipes(dir), alinhar: alinharBipes(), transcrever: async () => { throw new Error("ElevenLabs transcrição 503: fora"); } }).catch((e) => e);
  assert.ok(!(rede instanceof Reprovada));
  const sem = [{ w: "a", s: 0, e: 1 }];
  assert.throws(() => checarCobertura(align(["a", "b", "c"], sem)), (e) => e instanceof Reprovada);
});

test("modo literal: usa a gravação com o texto de hoje, sem transcrever (pra quando eu corrijo o texto à mão)", async () => {
  const dir = tmp("grav-literal-");
  json(path.join(dir, "reel.json"), reel2);
  const ct = { n: 0 };
  const r = await processarGravacao(dir, { tomada: tomadaDeBipes(dir), livre: false, alinhar: alinharBipes(), transcrever: transcreverBipes("Outra coisa qualquer aqui dita agora.", ct) });
  assert.equal(ct.n, 0);
  assert.deepEqual(r.mudancas, []);
  assert.deepEqual(ler(path.join(dir, "reel.json")).cenas.map((c) => c.fala), reel2.cenas.map((c) => c.fala));
  assert.equal(gravacaoDoReel(dir, reel2).estado, "valida");
});

test("reprocessar a tomada escolhida (produzir) usa o texto de hoje e não muda nada de novo", async () => {
  const dir = tmp("grav-repro-");
  json(path.join(dir, "reel.json"), reel2);
  const bruto = path.join(dir, "b.wav");
  ffmpeg(["-f", "lavfi", "-i", "sine=f=440:d=5.2", "-af", `volume=0:enable='not(${BIPES.map(([s, e]) => `between(t,${s},${e})`).join("+")})'`, bruto]);
  const t = salvarTomada(dir, fs.readFileSync(bruto), "wav", { falas: reel2.cenas.map((c) => c.fala), hash: hashFalas(reel2), marcas: [2.5] });
  assert.deepEqual(ler(path.join(dir, "gravacao", "tomada-1.json")).marcas, [2.5]);
  const stt = transcreverBipes("Oi pessoal, tudo bem? Me segue aí.");
  await processarGravacao(dir, { tomada: t, hash: hashFalas(reel2), alinhar: alinharBipes(), transcrever: stt });
  const depois1 = fs.readFileSync(path.join(dir, "reel.json"), "utf8");
  const r = await processarGravacao(dir, { alinhar: alinharBipes(), transcrever: stt });
  assert.equal(fs.readFileSync(path.join(dir, "reel.json"), "utf8"), depois1);
  // AFINAÇÃO 14/10 (revisão 3, achado 2): reprocessar é literal, senão desfaz correção feita à mão no texto.
  assert.deepEqual(r.mudancas, []);
});

test("gravador: âncora que passou a cair numa palavra nova vira aviso; marcas do Espaço vão com a tomada", async () => {
  const { criarServidor } = await import("../scripts/gravar.mjs");
  const dir = tmp("grav-srv-ancora-");
  const reel = { ...reel2, cenas: [{ ...reel2.cenas[0], batidas: [{ tipo: "selo", texto: "TUDO", em: "tudo" }] }, reel2.cenas[1]] };
  json(path.join(dir, "reel.json"), reel);
  const bruto = path.join(tmp("bipes-"), "b.wav");
  ffmpeg(["-f", "lavfi", "-i", "sine=f=440:d=5.2", "-af", `volume=0:enable='not(${BIPES.map(([s, e]) => `between(t,${s},${e})`).join("+")})'`, bruto]);
  const srv = criarServidor(dir, { teste: true, alinhar: alinharBipes(), transcrever: transcreverBipes("Oi tudo, tudo bem? Me segue aí.") });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  try {
    const res = await fetch(`http://127.0.0.1:${srv.address().port}/tomada`, { method: "POST", headers: { "content-type": "audio/wav", "x-hash": hashFalas(reel), "x-marcas": "[2.4]" }, body: fs.readFileSync(bruto) });
    const j = await res.json();
    assert.equal(res.status, 200, JSON.stringify(j));
    assert.ok(j.ancoras.some((a) => /tudo/.test(a) && /palavra nova/.test(a)), JSON.stringify(j.ancoras));
    assert.deepEqual(ler(path.join(dir, "gravacao", "tomada-1.json")).marcas, [2.4]);
  } finally {
    srv.close();
  }
});

test("palavra incerta (a transcrição apagou) fica se o alinhamento acha ela no áudio e sai se não acha", async () => {
  // Alinhamento falso com perda por palavra: "tudo" fora do áudio = perda alta.
  const alinharPerda = (perdas, c = { n: 0, textos: [] }) => async (arquivo, texto) => {
    c.n++;
    c.textos.push(texto);
    return { words: texto.split(" ").map((w, i) => ({ text: w, start: BIPES[i][0], end: BIPES[i][1], loss: perdas[w] ?? 0.4 })), loss: 0.5 };
  };
  const dito = "Oi gente, bem? Me segue aí.";
  const dir = tmp("grav-incerta-");
  json(path.join(dir, "reel.json"), reel2);
  await processarGravacao(dir, { tomada: tomadaDeBipes(dir), hash: hashFalas(reel2), alinhar: alinharPerda({}), transcrever: transcreverBipes(dito) });
  assert.deepEqual(ler(path.join(dir, "reel.json")).cenas.map((x) => x.fala), reel2.cenas.map((x) => x.fala), "achou no áudio: fica");
  const dir2 = tmp("grav-incerta2-");
  json(path.join(dir2, "reel.json"), reel2);
  const c = { n: 0, textos: [] };
  const r = await processarGravacao(dir2, { tomada: tomadaDeBipes(dir2), hash: hashFalas(reel2), alinhar: alinharPerda({ tudo: 6 }, c), transcrever: transcreverBipes(dito) });
  assert.deepEqual(ler(path.join(dir2, "reel.json")).cenas.map((x) => x.fala), ["Oi gente, bem?", "Me segue aí."]);
  assert.deepEqual(c.textos, ["Oi gente, tudo bem? Me segue aí.", "Oi gente, bem? Me segue aí."]);
  assert.ok(r.mudancas.some((m) => m.antes === "tudo" && m.depois === ""), JSON.stringify(r.mudancas));
});

// Alinhamento falso com perda e duração por palavra (palavra fora do áudio: perda alta ou duração ~0).
const alinharMedido = ({ perdas = {}, curtas = [] } = {}, c = { textos: [] }) => async (arquivo, texto) => {
  c.textos.push(texto);
  return { words: texto.split(" ").map((w, i) => ({ text: w, start: BIPES[i][0], end: curtas.includes(w) ? BIPES[i][0] + 0.005 : BIPES[i][1], loss: perdas[w] ?? 0.4 })), loss: 0.5 };
};

test("correção à mão depois da fala livre: --literal usa a gravação com o texto corrigido e reprocessar não desfaz", async () => {
  // AFINAÇÃO 16/10: o exemplo era "Cloud", que agora a fala livre escreve "Claude" (a transcrição ouve assim a voz dele).
  const dir = tmp("grav-correcao-");
  json(path.join(dir, "reel.json"), reel2);
  await processarGravacao(dir, { tomada: tomadaDeBipes(dir), hash: hashFalas(reel2), alinhar: alinharBipes(), transcrever: transcreverBipes("Oi gente, tudo bem? Me segue Clube.") });
  assert.equal(ler(path.join(dir, "reel.json")).cenas[1].fala, "Me segue Clube.");
  // Eu corrijo à mão: a gravação fica "velha" pro texto de hoje.
  const r = ler(path.join(dir, "reel.json"));
  json(path.join(dir, "reel.json"), { ...r, cenas: [r.cenas[0], { ...r.cenas[1], fala: "Me segue aí." }] });
  assert.equal(gravacaoDoReel(dir, ler(path.join(dir, "reel.json"))).estado, "velha");
  const ct = { n: 0 };
  await processarGravacao(dir, { livre: false, alinhar: alinharBipes(), transcrever: transcreverBipes(TEXTO2, ct) });
  assert.equal(gravacaoDoReel(dir, ler(path.join(dir, "reel.json"))).estado, "valida");
  // Reprocessar (o que o produzir --refazer-voz faz) usa o texto de hoje e não volta o "Clube".
  await processarGravacao(dir, { alinhar: alinharBipes(), transcrever: transcreverBipes(TEXTO2, ct) });
  assert.equal(ler(path.join(dir, "reel.json")).cenas[1].fala, "Me segue aí.");
  assert.equal(ct.n, 0, "sem tomada nova não transcreve de novo");
});

test("incerta sai quando o alinhamento a encaixa em menos de 10 ms ou com perda acima de 1,5", async () => {
  for (const [nome, medida] of [["perda 1,8", { perdas: { tudo: 1.8 } }], ["5 ms", { curtas: ["tudo"] }]]) {
    const dir = tmp("grav-incerta-limiar-");
    json(path.join(dir, "reel.json"), reel2);
    await processarGravacao(dir, { tomada: tomadaDeBipes(dir), hash: hashFalas(reel2), alinhar: alinharMedido(medida), transcrever: transcreverBipes("Oi gente, bem? Me segue aí.") });
    assert.equal(ler(path.join(dir, "reel.json")).cenas[0].fala, "Oi gente, bem?", nome);
  }
});

test("tirar a incerta que abria a frase passa a maiúscula pra palavra seguinte", async () => {
  const dir = tmp("grav-incerta-maiuscula-");
  const reel = { slug: "rv", cenas: [{ tipo: "hook", fala: "Oi gente, tudo bem?" }, { tipo: "segue", fala: "Tá, segue aí." }] };
  json(path.join(dir, "reel.json"), reel);
  await processarGravacao(dir, { tomada: tomadaDeBipes(dir), hash: hashFalas(reel), alinhar: alinharMedido({ perdas: { "Tá,": 4 } }), transcrever: transcreverBipes("Oi gente, tudo bem? Segue aí.") });
  assert.equal(ler(path.join(dir, "reel.json")).cenas[1].fala, "Segue aí.");
});

test("retomada: o trecho refeito sai do áudio (alinhamento e narração sem ele) e o corte vale de novo ao reprocessar", async () => {
  const dir = tmp("grav-retomada-");
  json(path.join(dir, "reel.json"), reel2);
  // "Oi gente, tudo bem?" | "Me segue" (errado) | "errei, vou gravar de novo" | "Me segue aí."
  const DITO = [["Oi", 0.2, 0.4], ["gente,", 0.55, 0.75], ["tudo", 0.9, 1.0], ["bem?", 1.15, 1.3], ["Me", 2.5, 2.7], ["segue", 2.85, 3.05], ["errei,", 4.0, 4.3], ["vou", 4.4, 4.55], ["gravar", 4.65, 4.9], ["de", 5.0, 5.1], ["novo.", 5.2, 5.4], ["Me", 6.5, 6.7], ["segue", 6.85, 7.05], ["aí.", 7.2, 7.4]];
  const bruto = path.join(dir, "bruto.wav");
  // aevalsrc liga o bipe na amostra exata (volume=enable anda em blocos de 23 ms).
  ffmpeg(["-f", "lavfi", "-i", `aevalsrc='if(${DITO.map(([, s, e]) => `between(t,${s},${e})`).join("+")},sin(2*PI*440*t),0)':d=8:s=44100`, bruto]);
  const tomada = salvarTomada(dir, fs.readFileSync(bruto), "wav", { falas: reel2.cenas.map((c) => c.fala), marcas: [2.3] });
  const transcrever = async () => ({ words: DITO.map(([w, s, e]) => ({ text: w, type: "word", start: s, end: e })) });
  // Sem o corte (2,42 a 6,42 s), a repetição começa onde o "Me segue" errado começava.
  const DEPOIS = [[0.2, 0.4], [0.55, 0.75], [0.9, 1.0], [1.15, 1.3], [2.5, 2.7], [2.85, 3.05], [3.2, 3.4]];
  const c = { n: 0 };
  const alinhar = async (arquivo, texto) => {
    c.n++;
    c.arquivo = arquivo;
    c.texto = texto;
    return { words: texto.split(" ").map((w, i) => ({ text: w, start: DEPOIS[i][0], end: DEPOIS[i][1], loss: 0.4 })), loss: 0.4 };
  };
  const r = await processarGravacao(dir, { tomada, alinhar, transcrever });
  assert.deepEqual(r.mudancas, []);
  assert.equal(c.texto, "Oi gente, tudo bem? Me segue aí.");
  assert.ok(Math.abs(duracao(c.arquivo) - 4) < 0.05, `o alinhamento recebeu ${duracao(c.arquivo)} s de áudio`);
  assert.deepEqual(r.retomadas.map((x) => x.texto), ["Me segue errei, vou gravar de novo."]);
  // Sincronia medida: cada palavra começa onde o som começa no mp3 final (sem o corte, o "aí." cairia no silêncio).
  const words = ler(path.join(dir, "words.json"));
  const sons = inicios(path.join(dir, "narracao.mp3"));
  for (const w of words) {
    const perto = Math.min(...sons.map((t) => Math.abs(t - w.s)));
    assert.ok(perto < 0.04, `palavra ${w.w} em ${w.s}s e o som mais perto a ${perto}s`);
  }
  // O corte fica guardado na tomada e vale ao reprocessar a escolhida (sem transcrever nem alinhar de novo).
  assert.deepEqual(ler(path.join(dir, "gravacao", "tomada-1.json")).retomadas.cortes.map((x) => [x.a, x.b]), [[2.42, 6.42]]);
  await processarGravacao(dir, { alinhar, transcrever: async () => { throw new Error("não devia transcrever de novo"); } });
  assert.equal(c.n, 1);
});

test("gravador com a trava: sem aprovação não mostra o texto nem salva tomada; aprovado, o teleprompter lê o aprovado (também depois da fala livre)", async () => {
  const { criarServidor } = await import("../scripts/gravar.mjs");
  const { escreverRoteiros, processarAprovados, checarAprovacao } = await import("../scripts/aprovacao.mjs");
  const lote = path.join(tmp("grav-trava-"), "2026-10-19");
  const dir = path.join(lote, "r1-oi");
  fs.mkdirSync(dir, { recursive: true });
  json(path.join(dir, "reel.json"), { ...reel2, titulo: "OI | *GENTE*" });
  fs.writeFileSync(path.join(dir, "legenda.md"), "Oi.\n");
  escreverRoteiros(lote);
  const bruto = path.join(tmp("bipes-"), "b.wav");
  ffmpeg(["-f", "lavfi", "-i", "sine=f=440:d=5.2", "-af", `volume=0:enable='not(${BIPES.map(([s, e]) => `between(t,${s},${e})`).join("+")})'`, bruto]);
  const srv = criarServidor(dir, { alinhar: alinharBipes(), transcrever: transcreverBipes("Oi pessoal, tudo bem? Me segue aí.") });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const gravar = async () => fetch(`${base}/tomada`, { method: "POST", headers: { "content-type": "audio/wav", "x-hash": hashFalas(ler(path.join(dir, "reel.json"))) }, body: fs.readFileSync(bruto) });
  try {
    let res = await fetch(`${base}/roteiro`);
    assert.equal(res.status, 409);
    assert.match((await res.json()).erro, /não está aprovado/);
    assert.equal((await gravar()).status, 409);
    assert.ok(!fs.existsSync(path.join(dir, "gravacao")), "sem aprovação nada é salvo");
    const f = path.join(dir, "roteiro.md");
    fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("Aprovado: não", "Aprovado: sim"));
    processarAprovados(lote);
    res = await fetch(`${base}/roteiro`);
    assert.equal(res.status, 200);
    const aprovadas = ["Oi gente, tudo bem?", "Me segue aí."];
    assert.deepEqual((await res.json()).falas, aprovadas);
    res = await gravar();
    const j = await res.json();
    assert.equal(res.status, 200, JSON.stringify(j));
    assert.deepEqual(ler(path.join(dir, "reel.json")).cenas.map((c) => c.fala), ["Oi pessoal, tudo bem?", "Me segue aí."]);
    assert.deepEqual(ler(path.join(dir, "gravacao", "tomada-1.json")).falas, aprovadas, "a tomada guarda o texto que estava na tela");
    assert.deepEqual((await (await fetch(`${base}/roteiro`)).json()).falas, aprovadas, "a próxima tomada lê de novo o aprovado");
    assert.deepEqual(checarAprovacao(dir).falas, aprovadas, "falado lendo o aprovado passa na trava do produzir");
  } finally {
    srv.close();
  }
});

test("fala livre: a tomada guarda o que foi falado (falado), que é o que a trava aceita no lugar do aprovado", async () => {
  const dir = tmp("grav-falado-");
  json(path.join(dir, "reel.json"), reel2);
  const tomada = tomadaDeBipes(dir);
  fs.writeFileSync(tomada.replace(/\.wav$/, ".json"), JSON.stringify({ falas: reel2.cenas.map((c) => c.fala) }));
  await processarGravacao(dir, { tomada, hash: hashFalas(reel2), alinhar: alinharBipes(), transcrever: transcreverBipes("Oi pessoal, tudo bem? Me segue aí.") });
  const meta = ler(path.join(dir, "gravacao", "tomada-1.json"));
  assert.deepEqual(meta.falado, ["Oi pessoal, tudo bem?", "Me segue aí."]);
  assert.deepEqual(meta.falas, reel2.cenas.map((c) => c.fala), "o texto lido continua guardado");
  // Reprocessar no modo literal (texto corrigido à mão) não reescreve o falado.
  const r = ler(path.join(dir, "reel.json"));
  json(path.join(dir, "reel.json"), { ...r, cenas: r.cenas.map((c, i) => (i === 0 ? { ...c, fala: "Oi pessoal, tudo bom?" } : c)) });
  await processarGravacao(dir, { alinhar: alinharBipes(), transcrever: transcreverBipes("x") });
  assert.deepEqual(ler(path.join(dir, "gravacao", "tomada-1.json")).falado, ["Oi pessoal, tudo bem?", "Me segue aí."]);
});

test("importarTomada: arquivo gravado fora da página entra em gravacao/ como tomada-N com o texto lido", async () => {
  const { importarTomada } = await import("./voz-gravada.mjs");
  const dir = tmp("grav-importa-");
  json(path.join(dir, "reel.json"), reel2);
  const fora = path.join(tmp("celular-"), "gravacao do celular.WAV");
  fs.writeFileSync(fora, "audio");
  const t = importarTomada(dir, fora, { falas: ["a", "b"] });
  assert.equal(t, path.join(dir, "gravacao", "tomada-1.wav"));
  assert.equal(fs.readFileSync(t, "utf8"), "audio");
  assert.deepEqual(ler(path.join(dir, "gravacao", "tomada-1.json")).falas, ["a", "b"]);
  assert.throws(() => importarTomada(dir, path.join(dir, "nao-existe.wav"), {}), /não achei/);
  fs.writeFileSync(fora.replace(/WAV$/, "txt"), "texto");
  assert.throws(() => importarTomada(dir, fora.replace(/WAV$/, "txt"), {}), /formato \.txt não aceito/);
});

test("voz-gravada pela linha de comando: roteiro não aprovado para antes de qualquer chamada paga", () => {
  const lote = path.join(tmp("grav-cli-"), "2026-10-19");
  const dir = path.join(lote, "r1");
  fs.mkdirSync(dir, { recursive: true });
  json(path.join(dir, "reel.json"), reel2);
  const fora = path.join(tmp("celular-"), "t.wav");
  fs.writeFileSync(fora, "audio");
  const env = { ...process.env, ELEVENLABS_API_KEY: "" };
  const r = spawnSync(process.execPath, [path.join(import.meta.dirname, "voz-gravada.mjs"), dir, fora], { encoding: "utf8", env });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /sem roteiro\.md/);
  assert.ok(!fs.existsSync(path.join(dir, "gravacao")), "nada importado nem pago");
});
