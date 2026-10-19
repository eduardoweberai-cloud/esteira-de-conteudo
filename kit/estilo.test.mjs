// node --test kit/estilo.test.mjs: o estilo "cinema" (padrão): sem contador no topo, título em serifada com a
// palavra-chave na cor do assunto, legenda branca sem caixa, música escolhida pelo clima do assunto sem repetir e
// bem abaixo da voz, e um "poc" (em rodízio) em tudo que aparece.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "./build.mjs";
import { versaoDoReel } from "./versao.mjs";
import { DESTAQUES } from "./tema.mjs";
import { carregarCatalogo, climasDe, escolherTrilha, outraDoClima, volumeDaTrilha, fixarTrilha } from "./trilhas.mjs";
import { montar as montarReel, sonsDeTeste } from "./apoio-teste.mjs";

const montar = (reel) => montarReel(reel, {}, "estilo-");

// Catálogo de mentira (só nomes): 6 faixas por clima.
const CAT = ["curiosidade", "passo", "conversa", "descontraido"].flatMap((clima) => Array.from({ length: 6 }, (_, k) => ({ arquivo: `${clima}-${k + 1}.mp3`, clima })));
const CLIMAS = climasDe(CAT);

const REEL = {
  titulo: "DÁ PRA USAR A IA | NO *GRATUITO*?",
  palavra: "PLANO",
  cenas: [
    { tipo: "mundo", fala: "Dá pra usar a IA no plano gratuito?", cabs: [{ em: "usar", t: "DÁ PRA *usar*" }], dados: { hud: [{ rotulo: "plano", valor: "~R$ 100", em: "plano" }] } },
    { tipo: "frase", fala: "Paga uma assinatura que vale a pena.", dados: { texto: "PAGA *assinatura*" } },
    { tipo: "segue", fala: "Me segue," },
    { tipo: "comenta", fala: "e comenta PLANO aqui.", dados: { em: "comenta" } },
  ],
};

test("estilo cinema é o padrão: sem contador nem barra de capítulos; \"classico\" mantém o antigo", () => {
  const r = montar(REEL);
  build(r.dir);
  assert.match(r.html(), /<body data-tema="[^"]+" data-estilo="cinema"/);
  assert.doesNotMatch(r.html(), /id="topo"|tl\.fromTo\("#pg0"|tl\.set\("#ct\d/);
  const c = montar({ ...REEL, estilo: "classico" });
  build(c.dir);
  assert.match(c.html(), /id="topo"/);
  assert.match(c.html(), /<body data-tema="[^"]+">/);
});

test("cor de destaque por assunto: nome da paleta ou hex; a palavra falada acende nela, e a legenda branca não acende", () => {
  const verde = montar({ ...REEL, cor: "verde" });
  build(verde.dir);
  assert.match(verde.html(), new RegExp(`<body [^>]*style="--destaque:${DESTAQUES.verde}"`));
  assert.match(verde.html(), new RegExp(`tl\\.set\\("#w0",\\{color:"${DESTAQUES.verde}"\\}`));
  const hex = montar({ ...REEL, cor: "#123abc" });
  build(hex.dir);
  assert.match(hex.html(), /--destaque:#123abc/);
  const branca = montar({ ...REEL, cor: "verde", legenda: "branca" });
  build(branca.dir);
  assert.match(branca.html(), /tl\.set\("#w0",\{color:"#ffffff"\}/);
  assert.throws(() => build(montar({ ...REEL, cor: "furta-cor" }).dir), /cor "furta-cor"/);
});

test("versão de teste: outra cor da paleta, legenda branca e outra música do mesmo clima", () => {
  const perfil = { ...REEL, cor: "verde", trilha: { clima: "passo", arquivo: CLIMAS.passo[0] } };
  const t = versaoDoReel(perfil, "teste", { catalogo: CAT });
  assert.notEqual(t.cor, "verde");
  assert.ok(t.cor in DESTAQUES);
  assert.equal(t.legenda, "branca");
  assert.notEqual(t.trilha.arquivo, perfil.trilha.arquivo);
  assert.ok(CLIMAS.passo.includes(t.trilha.arquivo));
  assert.equal(versaoDoReel({ ...perfil, versoes: { teste: { cor: "lilas" } } }, "teste", { catalogo: CAT }).cor, "lilas");
});

test("carregarCatalogo: lê o musicas.json da pasta de música e deixa de fora (com aviso) a faixa que não está no disco", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "musica-"));
  fs.writeFileSync(path.join(dir, "tem.mp3"), "x");
  fs.writeFileSync(path.join(dir, "musicas.json"), JSON.stringify([{ arquivo: "tem.mp3", clima: "passo", inicio: 3 }, { arquivo: "falta.mp3", clima: "conversa" }]));
  const { catalogo, avisos } = carregarCatalogo(path.join(dir, "musicas.json"));
  // `arquivo` fica como no musicas.json (o reel.json grava o nome, nunca um caminho da máquina); `caminho` é o do disco.
  assert.deepEqual(catalogo, [{ arquivo: "tem.mp3", clima: "passo", inicio: 3, caminho: path.join(dir, "tem.mp3") }]);
  assert.ok(avisos.some((a) => /falta\.mp3/.test(a)), avisos.join(" | "));
  assert.deepEqual(carregarCatalogo(path.join(dir, "nao-existe.json")), { catalogo: [], avisos: [] });
  fs.writeFileSync(path.join(dir, "quebrado.json"), "{ quebrado");
  assert.match(carregarCatalogo(path.join(dir, "quebrado.json")).avisos[0], /quebrado\.json/);
});

test("escolherTrilha: faixa do clima que não tocou nos últimos 10 reels; tudo usado, a que tocou há mais tempo", () => {
  const passo = CLIMAS.passo;
  const usadas = [passo[0], passo[1], CLIMAS.curiosidade[0]];
  const a = escolherTrilha({ clima: "passo", usadas, semente: "r3-guia", catalogo: CAT });
  assert.ok(passo.includes(a) && !usadas.includes(a), a);
  assert.equal(escolherTrilha({ clima: "passo", usadas, semente: "r3-guia", catalogo: CAT }), a);
  // Todas do clima tocaram: volta a que tocou primeiro (a mais antiga na lista).
  const todas = [...passo.slice(2), passo[0], passo[1]];
  assert.equal(escolherTrilha({ clima: "passo", usadas: todas, semente: "x", catalogo: CAT }), passo[2]);
  assert.throws(() => escolherTrilha({ clima: "tristeza", usadas: [], catalogo: CAT }), /clima "tristeza"/);
  assert.notEqual(outraDoClima(passo[0], undefined, CAT), passo[0]);
  assert.ok(passo.includes(outraDoClima(passo[0], undefined, CAT)));
});

test("escolherTrilha: clima conhecido sem nenhuma faixa no catálogo devolve null (o reel sai sem música)", () => {
  assert.equal(escolherTrilha({ clima: "passo", catalogo: [] }), null);
  assert.equal(escolherTrilha({ clima: "conversa", catalogo: [{ arquivo: "a.mp3", clima: "passo" }] }), null);
  // Clima novo, que só existe no catálogo da pessoa, vale.
  assert.equal(escolherTrilha({ clima: "epico", catalogo: [{ arquivo: "e.mp3", clima: "epico" }] }), "e.mp3");
});

test("volumeDaTrilha: a música fica 22 dB abaixo da voz, com limite pra voz muito alta ou baixa", () => {
  assert.equal(volumeDaTrilha(-18), 0.063);
  assert.equal(volumeDaTrilha(-24), 0.032);
  assert.equal(volumeDaTrilha(-8), 0.13);
  assert.equal(volumeDaTrilha(null), 0.07);
});

test("fixarTrilha: escolhe pela clima do reel, grava no reel.json (perfil e teste) e no registro; rodar de novo não muda", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fixar-"));
  const registro = path.join(dir, "trilhas-usadas.json");
  fs.writeFileSync(registro, JSON.stringify([{ arquivo: CLIMAS.conversa[0], reel: "antigo" }]));
  const reelDir = path.join(dir, "r2-gratuito");
  fs.mkdirSync(reelDir);
  fs.writeFileSync(path.join(reelDir, "reel.json"), JSON.stringify({ slug: "r2-gratuito", trilha: { clima: "conversa" }, cenas: [] }));
  const r = fixarTrilha(reelDir, { registro, catalogo: CAT });
  const reel = JSON.parse(fs.readFileSync(path.join(reelDir, "reel.json"), "utf8"));
  assert.ok(CLIMAS.conversa.includes(reel.trilha.arquivo) && reel.trilha.arquivo !== CLIMAS.conversa[0]);
  assert.ok(CLIMAS.conversa.includes(reel.versoes.teste.trilha.arquivo));
  assert.notEqual(reel.versoes.teste.trilha.arquivo, reel.trilha.arquivo);
  assert.deepEqual(JSON.parse(fs.readFileSync(registro, "utf8")).map((x) => x.arquivo).slice(1), [reel.trilha.arquivo, reel.versoes.teste.trilha.arquivo]);
  assert.equal(r.escolhida, reel.trilha.arquivo);
  assert.equal(fixarTrilha(reelDir, { registro, catalogo: CAT }).escolhida, null);
  assert.equal(JSON.parse(fs.readFileSync(registro, "utf8")).length, 3);
});

test("fixarTrilha sem música do clima no catálogo não mexe no reel.json e avisa", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fixar0-"));
  fs.writeFileSync(path.join(dir, "reel.json"), JSON.stringify({ slug: "r1", trilha: { clima: "passo" }, cenas: [] }));
  const antes = fs.readFileSync(path.join(dir, "reel.json"), "utf8");
  const r = fixarTrilha(dir, { catalogo: [] });
  assert.equal(r.escolhida, null);
  assert.match(r.aviso, /música/);
  assert.equal(fs.readFileSync(path.join(dir, "reel.json"), "utf8"), antes);
});

test("efeitos: tudo que aparece dá um poc, em rodízio de 4 sons (cabeçalho e número também)", () => {
  const r = montar({ ...REEL, cenas: [{ ...REEL.cenas[0], batidas: [{ tipo: "selo", texto: "UM", em: "IA" }, { tipo: "selo", texto: "DOIS", em: "gratuito?" }] }, ...REEL.cenas.slice(1)] });
  build(r.dir, { sfx: sonsDeTeste() });
  const sons = [...r.html().matchAll(/<audio id="sfx\d+" src="assets\/sfx\/([^"]+)\.mp3" data-start="([^"]+)"/g)].map((m) => ({ nome: m[1], t: Number(m[2]) }));
  const pops = sons.filter((s) => /^pop(-\d)?$/.test(s.nome));
  assert.ok(pops.length >= 4, sons.map((s) => s.nome).join(","));
  assert.deepEqual(pops.slice(0, 4).map((s) => s.nome), ["pop", "pop-2", "pop-3", "pop-4"]);
  // O cabeçalho "DÁ PRA usar" (palavra 2, "usar") e o número (palavra 6, "plano") entram com poc.
  assert.ok(pops.some((s) => Math.abs(s.t - r.words[2].s) < 0.01), "poc no cabeçalho");
  assert.ok(pops.some((s) => Math.abs(s.t - r.words[6].s) < 0.06), "poc no número");
});

test("trilha sem volume no reel fica 22 dB abaixo da voz, medido no áudio", () => {
  const r = montar(REEL);
  const tom = path.join(r.dir, "tom.mp3");
  const voz = path.join(r.dir, "narracao.wav");
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=220:d=12", "-af", "volume=4dB", voz]);
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:d=20", tom]);
  fs.writeFileSync(path.join(r.dir, "reel.json"), JSON.stringify({ ...REEL, trilha: { arquivo: tom } }));
  build(r.dir);
  const vol = Number(/<audio id="trilha" [^>]*data-volume="([^"]+)"/.exec(r.html())[1]);
  const lufs = (f, filtro = "") => Number(/I:\s+(-?[\d.]+) LUFS/.exec(spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", f, "-af", `${filtro}ebur128`, "-f", "null", "-"], { encoding: "utf8" }).stderr.split("Summary:").pop())[1]);
  const lv = lufs(voz);
  const lt = lufs(path.join(r.dir, "assets", "trilha.mp3"), `volume=${vol},`);
  assert.ok(Math.abs(lv - 22 - lt) < 1.5, `voz ${lv} LUFS, trilha no vídeo ${lt} LUFS (volume ${vol})`);
});

test("rodízio conta os últimos 10 reels (perfil e teste são do mesmo reel), não as últimas 10 linhas", () => {
  const passo = CLIMAS.passo;
  const outras = [...CLIMAS.conversa, ...CLIMAS.curiosidade];
  // 6 reels (12 linhas): r1 a r3 usaram passo[0] a passo[4]; r4 a r6, outros climas. Só passo[5] está livre.
  const registro = [{ arquivo: passo[0], reel: "r1" }, { arquivo: passo[1], reel: "r1" }, { arquivo: passo[2], reel: "r2" }, { arquivo: passo[3], reel: "r2" }, { arquivo: passo[4], reel: "r3" }, { arquivo: outras[0], reel: "r3" }];
  for (let k = 4; k <= 6; k++) registro.push({ arquivo: outras[2 * k - 6], reel: `r${k}` }, { arquivo: outras[2 * k - 5], reel: `r${k}` });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rodizio-"));
  const f = path.join(dir, "trilhas-usadas.json");
  fs.writeFileSync(f, JSON.stringify(registro));
  const reelDir = path.join(dir, "r7");
  fs.mkdirSync(reelDir);
  fs.writeFileSync(path.join(reelDir, "reel.json"), JSON.stringify({ slug: "r7", trilha: { clima: "passo" }, cenas: [] }));
  const r = fixarTrilha(reelDir, { registro: f, catalogo: CAT });
  assert.equal(r.escolhida, passo[5]);
  assert.notEqual(r.teste, passo[5]);
});

test("fixarTrilha respeita a faixa de teste escolhida à mão; registro estragado vira aviso e segue", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fixar2-"));
  const f = path.join(dir, "trilhas-usadas.json");
  fs.writeFileSync(f, "{ quebrado");
  const reelDir = path.join(dir, "r1");
  fs.mkdirSync(reelDir);
  fs.writeFileSync(path.join(reelDir, "reel.json"), JSON.stringify({ slug: "r1", trilha: { clima: "passo" }, versoes: { teste: { trilha: { arquivo: "minha-faixa.mp3" } } }, cenas: [] }));
  const r = fixarTrilha(reelDir, { registro: f, catalogo: CAT });
  assert.equal(r.teste, "minha-faixa.mp3");
  assert.equal(JSON.parse(fs.readFileSync(path.join(reelDir, "reel.json"), "utf8")).versoes.teste.trilha.arquivo, "minha-faixa.mp3");
  assert.match(r.aviso, /registro/);
});

test("versão de teste: palavra-chave da legenda também branca; reel sem trilha continua sem trilha", () => {
  const r = montar(versaoDoReel({ ...REEL, cor: "verde" }, "teste"));
  fs.writeFileSync(path.join(r.dir, "reel.json"), JSON.stringify({ ...versaoDoReel({ ...REEL, cor: "verde" }, "teste"), trilha: false }));
  build(r.dir);
  const plano = r.words.findIndex((w) => w.w === "PLANO");
  assert.match(r.html(), new RegExp(`tl\\.set\\("#w${plano}",\\{color:"#ffffff"\\}`));
  assert.equal(versaoDoReel({ ...REEL, trilha: false }, "teste").trilha, false);
});

test("versão de teste com faixa fora do catálogo ainda troca de música (outra do clima)", () => {
  const t = versaoDoReel({ ...REEL, trilha: { clima: "passo", arquivo: "minha.mp3" } }, "teste", { catalogo: CAT });
  assert.notEqual(t.trilha.arquivo, "minha.mp3");
  assert.ok(CLIMAS.passo.includes(t.trilha.arquivo));
  assert.notEqual(outraDoClima("minha.mp3", "passo", CAT), "minha.mp3");
});

test("título de 3 linhas ganha a classe que diminui a letra", () => {
  const tres = montar({ ...REEL, titulo: "5 COISAS PRA | CONSTRUIR NUM | *FIM DE SEMANA*" });
  build(tres.dir);
  assert.match(tres.html(), /<div id="titulo" class="linhas-3">/);
  const duas = montar(REEL);
  build(duas.dir);
  assert.match(duas.html(), /<div id="titulo" class="linhas-2">/);
});

// Revisão em contexto limpo da fase 1 (achados 3, 8 e 9).
test("revisão: musicas.json com caminho absoluto ou fora da pasta fica de fora (o reel.json nunca grava caminho da máquina)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "musica-"));
  fs.mkdirSync(path.join(dir, "musica"));
  fs.writeFileSync(path.join(dir, "fora.mp3"), "x");
  fs.writeFileSync(path.join(dir, "musica", "dentro.mp3"), "x");
  const json = path.join(dir, "musica", "musicas.json");
  fs.writeFileSync(json, JSON.stringify([{ arquivo: path.join(dir, "fora.mp3"), clima: "passo" }, { arquivo: "../fora.mp3", clima: "passo" }, { arquivo: "dentro.mp3", clima: "passo" }]));
  const { catalogo, avisos } = carregarCatalogo(json);
  assert.deepEqual(catalogo.map((f) => f.arquivo), ["dentro.mp3"]);
  assert.equal(avisos.length, 2, avisos.join(" | "));
});

test("revisão: versoes.teste.trilha = false deixa a versão de teste sem música (e o fixarTrilha respeita)", () => {
  const reel = { ...REEL, trilha: { clima: "passo", arquivo: CLIMAS.passo[0] }, versoes: { teste: { trilha: false } } };
  assert.equal(versaoDoReel(reel, "teste", { catalogo: CAT }).trilha, false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fixar3-"));
  fs.writeFileSync(path.join(dir, "reel.json"), JSON.stringify({ slug: "r1", trilha: { clima: "passo" }, versoes: { teste: { trilha: false } }, cenas: [] }));
  const r = fixarTrilha(dir, { catalogo: CAT });
  assert.ok(r.escolhida);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "reel.json"), "utf8")).versoes.teste.trilha, false);
});

test("revisão: trocar de faixa na versão de teste não herda o início nem o volume da faixa do perfil", () => {
  const t = versaoDoReel({ ...REEL, trilha: { clima: "passo", arquivo: CLIMAS.passo[0], inicio: 40, volume: 0.1 } }, "teste", { catalogo: CAT });
  assert.equal(t.trilha.arquivo, CLIMAS.passo[1]);
  assert.equal(t.trilha.inicio, undefined);
  assert.equal(t.trilha.volume, undefined);
});
