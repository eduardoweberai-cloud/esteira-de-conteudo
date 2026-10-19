// node --test scripts/aprovacao.test.mjs: aprovação do roteiro no arquivo (roteiro.md com "Aprovado: sim").
// Nada é gravado nem produzido sem aprovação, e o texto que vai pro vídeo é o aprovado (ou o que você falou lendo ele).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { aprovadoNo, hashRoteiro, roteiroParaRevisar, escreverRoteiros, processarAprovados, checarAprovacao, aplicarAprovado } from "./aprovacao.mjs";
import { salvarTomada, escolherTomada, hashFalas } from "../kit/voz-gravada.mjs";

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const json = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2));
const ler = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

const REEL = {
  slug: "r1-teste",
  titulo: "UM REEL | DE *TESTE*",
  palavra: "KIT",
  dm: { texto: "Aqui está.", botao: "abrir" },
  cenas: [
    { tipo: "hook", fala: "Primeira fala do reel.", dados: { quadros: [{ tipo: "palavra", texto: "FALA" }] } },
    { tipo: "segue", fala: "Me segue," },
    { tipo: "comenta", fala: "e comenta KIT.", dados: { em: "comenta" } },
  ],
};

// Lote com um reel: lotes/2026-10-19/r1-teste/{reel.json, legenda.md}
function lote() {
  const dir = path.join(tmp("aprov-"), "2026-10-19");
  const reel = path.join(dir, "r1-teste");
  fs.mkdirSync(reel, { recursive: true });
  json(path.join(dir, "lote.json"), { data: "2026-10-19", etapa: "roteiros" });
  json(path.join(reel, "reel.json"), REEL);
  fs.writeFileSync(path.join(reel, "legenda.md"), "Comenta KIT.\n");
  return { dir, reel, roteiro: path.join(reel, "roteiro.md"), calibracao: path.join(dir, "..", "calibracao.md") };
}
const aprovar = (f, troca = (s) => s) => fs.writeFileSync(f, troca(fs.readFileSync(f, "utf8")).replace(/^Aprovado: não$/m, "Aprovado: sim"));

test("aprovadoNo: só a linha \"Aprovado: sim\" antes do roteiro aprova (maiúscula e espaço não importam)", () => {
  assert.equal(aprovadoNo("Aprovado: sim\n\n## Título na tela\nX"), true);
  assert.equal(aprovadoNo("\r\n  aprovado:   SIM  \r\n## Título na tela"), true);
  assert.equal(aprovadoNo("Aprovado: não\n## Título na tela"), false);
  assert.equal(aprovadoNo("Aprovado: sim, quase\n## Título na tela"), false);
  assert.equal(aprovadoNo("## Título na tela\nAprovado: sim"), false, "a linha tem que vir antes do roteiro");
  assert.equal(aprovadoNo(""), false);
});

test("hashRoteiro: CRLF e espaço no fim não mudam; texto muda", () => {
  assert.equal(hashRoteiro("a\nb\n"), hashRoteiro("a\r\nb"));
  assert.notEqual(hashRoteiro("a\nb"), hashRoteiro("a\nc"));
});

test("roteiroParaRevisar: abre com \"Aprovado: não\" e diz o comando que aplica a aprovação", () => {
  const md = roteiroParaRevisar({ reel: REEL, legenda: "Comenta KIT." }, { data: "2026-10-19" });
  assert.match(md, /^Aprovado: não\n/);
  assert.match(md, /npm run lote -- aprovados 2026-10-19/);
  assert.match(md, /## Narração/);
  assert.equal(aprovadoNo(md), false);
});

test("escreverRoteiros: escreve o roteiro.md pra revisar e não pisa no que você mexeu ou aprovou", () => {
  const l = lote();
  let r = escreverRoteiros(l.dir, { data: "2026-10-19" });
  assert.deepEqual(r.map((x) => [x.reel, x.estado]), [["r1-teste", "pra revisar"]]);
  assert.match(fs.readFileSync(l.roteiro, "utf8"), /Primeira fala do reel\./);
  // Você mexeu no texto: escrever de novo mantém o seu.
  fs.writeFileSync(l.roteiro, fs.readFileSync(l.roteiro, "utf8").replace("Primeira fala", "Fala minha"));
  r = escreverRoteiros(l.dir, { data: "2026-10-19" });
  assert.equal(r[0].estado, "mantido: você já mexeu");
  assert.match(fs.readFileSync(l.roteiro, "utf8"), /Fala minha/);
  // Aprovado também fica; --forcar reescreve.
  aprovar(l.roteiro);
  assert.equal(escreverRoteiros(l.dir, { data: "2026-10-19" })[0].estado, "mantido: já aprovado");
  assert.equal(escreverRoteiros(l.dir, { data: "2026-10-19", forcar: true })[0].estado, "pra revisar");
  assert.doesNotMatch(fs.readFileSync(l.roteiro, "utf8"), /Fala minha/);
});

test("processarAprovados: só aplica o aprovado; o texto aprovado entra exato e a mudança vai pra calibração", () => {
  const l = lote();
  escreverRoteiros(l.dir, { data: "2026-10-19" });
  assert.equal(processarAprovados(l.dir, { calibracao: l.calibracao, data: "19/10/2026" })[0].estado, "pra revisar");
  aprovar(l.roteiro, (s) => s.replace("Primeira fala do reel.", "A primeira fala, do meu jeito.").replace("Comenta KIT.\n\n## Comenta", "Comenta KIT aqui embaixo.\n\n## Comenta"));
  const r = processarAprovados(l.dir, { calibracao: l.calibracao, data: "19/10/2026", agora: "2026-10-19T12:00:00.000Z" });
  assert.deepEqual(r.map((x) => [x.reel, x.estado]), [["r1-teste", "aplicado"]]);
  const reel = ler(path.join(l.reel, "reel.json"));
  assert.equal(reel.cenas[0].fala, "A primeira fala, do meu jeito.");
  assert.deepEqual(reel.cenas[0].dados, REEL.cenas[0].dados, "mesma quantidade de falas: a parte visual da cena fica");
  assert.equal(reel.aprovado.roteiro, hashRoteiro(fs.readFileSync(l.roteiro, "utf8")));
  assert.equal(reel.aprovado.em, "2026-10-19T12:00:00.000Z");
  assert.equal(fs.readFileSync(path.join(l.reel, "legenda.md"), "utf8"), "Comenta KIT aqui embaixo.\n");
  assert.equal(fs.readFileSync(path.join(l.reel, "roteiro-aprovado.md"), "utf8"), fs.readFileSync(l.roteiro, "utf8"));
  const cal = fs.readFileSync(l.calibracao, "utf8");
  assert.match(cal, /### 19\/10\/2026 · r1-teste/);
  assert.match(cal, /Fala 1.*Primeira fala do reel\..*A primeira fala, do meu jeito\./);
  // Rodar de novo não aplica nem registra a calibração outra vez.
  assert.equal(processarAprovados(l.dir, { calibracao: l.calibracao, data: "19/10/2026" })[0].estado, "já aplicado");
  assert.equal(fs.readFileSync(l.calibracao, "utf8"), cal);
});

test("aplicarAprovado: quantidade de falas mudou marca remontar_cenas; sem Comenta e DM, a palavra e a DM saem", () => {
  const arquivos = { reel: REEL, legenda: "x" };
  const r = aplicarAprovado(arquivos, { titulo: "T", falas: ["Uma.", "Duas.", "Três.", "Quatro."], legenda: "L", palavra: null, dm_video: null });
  assert.equal(r.remontar_cenas, true);
  assert.equal(r.reel.remontar_cenas, true);
  assert.deepEqual(r.reel.cenas.map((c) => c.tipo), ["hook", "segue", "comenta", "frase"]);
  assert.equal(r.reel.palavra, undefined);
  assert.equal(r.reel.dm, undefined);
  const mesma = aplicarAprovado({ reel: { ...REEL, remontar_cenas: true }, legenda: "x" }, { titulo: "T", falas: ["a", "b", "c"], legenda: "L", palavra: "KIT", dm_video: { texto: "Nova DM." } });
  assert.equal(mesma.reel.remontar_cenas, undefined);
  // AFINAÇÃO (Gate 10, 19/10): a DM é exatamente a aprovada; o botão que saiu do roteiro não fica da DM anterior.
  assert.deepEqual(mesma.reel.dm, { texto: "Nova DM." });
});

test("checarAprovacao: barra sem roteiro, sem aprovação, aprovação não aplicada, texto diferente e cenas a remontar", () => {
  const l = lote();
  assert.throws(() => checarAprovacao(l.reel), /sem roteiro\.md.*npm run lote -- roteiros 2026-10-19/);
  escreverRoteiros(l.dir, { data: "2026-10-19" });
  assert.throws(() => checarAprovacao(l.reel), /não está aprovado.*Aprovado: sim/);
  aprovar(l.roteiro);
  assert.throws(() => checarAprovacao(l.reel), /mudou depois do último "aprovados".*npm run lote -- aprovados 2026-10-19/);
  processarAprovados(l.dir, { calibracao: l.calibracao, data: "19/10/2026" });
  assert.deepEqual(checarAprovacao(l.reel).falas, REEL.cenas.map((c) => c.fala));
  // Fala mexida à mão no reel.json depois da aprovação: barra.
  const f = path.join(l.reel, "reel.json");
  const reel = ler(f);
  json(f, { ...reel, cenas: reel.cenas.map((c, i) => (i === 0 ? { ...c, fala: "Outra coisa." } : c)) });
  assert.throws(() => checarAprovacao(l.reel), /difere do roteiro aprovado \(fala 1\)/);
  json(f, { ...reel, titulo: "OUTRO" });
  assert.throws(() => checarAprovacao(l.reel), /difere do roteiro aprovado \(título\)/);
  fs.writeFileSync(path.join(l.reel, "legenda.md"), "Outra legenda.\n");
  json(f, reel);
  assert.throws(() => checarAprovacao(l.reel), /difere do roteiro aprovado \(legenda\)/);
  fs.writeFileSync(path.join(l.reel, "legenda.md"), "Comenta KIT.\n");
  json(f, { ...reel, remontar_cenas: true });
  assert.throws(() => checarAprovacao(l.reel), /remontar as cenas/);
});

test("checarAprovacao: a fala pode ser o que você falou na gravação escolhida, se ela foi lida do texto aprovado", () => {
  const l = lote();
  escreverRoteiros(l.dir, { data: "2026-10-19" });
  aprovar(l.roteiro);
  processarAprovados(l.dir, { calibracao: l.calibracao, data: "19/10/2026" });
  const f = path.join(l.reel, "reel.json");
  const reel = ler(f);
  const aprovadas = reel.cenas.map((c) => c.fala);
  // Gravou lendo o aprovado e falou diferente: o reel.json fica com o que foi falado.
  const falado = { ...reel, cenas: reel.cenas.map((c, i) => (i === 0 ? { ...c, fala: "Primeira fala do vídeo." } : c)) };
  json(f, falado);
  const falas = falado.cenas.map((c) => c.fala);
  const t = salvarTomada(l.reel, Buffer.from("audio"), "webm", { falas: aprovadas, falado: falas, hash: hashFalas(reel) });
  escolherTomada(l.reel, t, hashFalas(falado));
  assert.deepEqual(checarAprovacao(l.reel).falas, aprovadas);
  // Gravação lida de outro texto não serve.
  const t2 = salvarTomada(l.reel, Buffer.from("audio"), "webm", { falas: ["Outro texto.", "Me segue,", "e comenta KIT."], falado: falas });
  escolherTomada(l.reel, t2, hashFalas(falado));
  assert.throws(() => checarAprovacao(l.reel), /difere do roteiro aprovado \(fala 1\)/);
  // Revisão 19/10: texto mexido à mão depois da gravação e reprocessado com --literal (a escolhida passa a ter o hash
  // do texto mexido) não é o que você falou: barra.
  escolherTomada(l.reel, t, hashFalas(falado));
  const mexido = { ...falado, cenas: falado.cenas.map((c, i) => (i === 0 ? { ...c, fala: "Primeira fala grátis do vídeo." } : c)) };
  json(f, mexido);
  escolherTomada(l.reel, t, hashFalas(mexido));
  assert.throws(() => checarAprovacao(l.reel), /difere do roteiro aprovado \(fala 1\)/);
});

test("checarAprovacao: a DM do vídeo (texto e botão) também é texto aprovado; DM tirada do roteiro sai do reel", () => {
  const l = lote();
  escreverRoteiros(l.dir, { data: "2026-10-19" });
  aprovar(l.roteiro);
  processarAprovados(l.dir, { calibracao: l.calibracao, data: "19/10/2026" });
  const f = path.join(l.reel, "reel.json");
  const reel = ler(f);
  json(f, { ...reel, dm: { texto: "Compre o curso no link.", botao: "abrir" } });
  assert.throws(() => checarAprovacao(l.reel), /difere do roteiro aprovado \(DM\)/);
  json(f, { ...reel, dm: { texto: "Aqui está.", botao: "comprar agora" } });
  assert.throws(() => checarAprovacao(l.reel), /difere do roteiro aprovado \(DM\)/);
  json(f, reel);
  assert.equal(checarAprovacao(l.reel).falas.length, 3);
  // Aprovou sem as linhas da DM: a DM antiga não fica no reel.
  fs.writeFileSync(l.roteiro, fs.readFileSync(l.roteiro, "utf8").replace(/^DM no vídeo: .*$/m, "").replace(/^Botão no vídeo: .*$/m, ""));
  processarAprovados(l.dir, { calibracao: l.calibracao, data: "19/10/2026" });
  assert.equal(ler(f).dm, undefined);
});

// Grava "falando diferente": a tomada leu o aprovado e o reel.json ficou com o que foi falado.
function gravouFalandoDiferente(l) {
  const f = path.join(l.reel, "reel.json");
  const reel = ler(f);
  const aprovadas = reel.cenas.map((c) => c.fala);
  const falado = { ...reel, cenas: reel.cenas.map((c, i) => (i === 0 ? { ...c, fala: "Primeira fala do vídeo." } : c)) };
  json(f, falado);
  const t = salvarTomada(l.reel, Buffer.from("audio"), "webm", { falas: aprovadas, falado: falado.cenas.map((c) => c.fala), hash: hashFalas(reel) });
  escolherTomada(l.reel, t, hashFalas(falado));
  return { f, aprovadas, falado };
}

test("processarAprovados: reaprovar só a legenda depois de gravar mantém o que você falou (a gravação continua valendo)", () => {
  const l = lote();
  escreverRoteiros(l.dir, { data: "2026-10-19" });
  aprovar(l.roteiro);
  processarAprovados(l.dir, { calibracao: l.calibracao, data: "19/10/2026" });
  const { f, falado } = gravouFalandoDiferente(l);
  fs.writeFileSync(l.roteiro, fs.readFileSync(l.roteiro, "utf8").replace("Comenta KIT.\n\n## Comenta", "Comenta KIT aqui.\n\n## Comenta"));
  assert.equal(processarAprovados(l.dir, { calibracao: l.calibracao, data: "19/10/2026" })[0].estado, "aplicado");
  assert.equal(ler(f).cenas[0].fala, falado.cenas[0].fala);
  assert.equal(fs.readFileSync(path.join(l.reel, "legenda.md"), "utf8"), "Comenta KIT aqui.\n");
  assert.equal(checarAprovacao(l.reel).falas[0], "Primeira fala do reel.");
});

test("processarAprovados: reel.json que saiu do texto aprovado volta pro aprovado (a mensagem da trava conserta de verdade)", () => {
  const l = lote();
  escreverRoteiros(l.dir, { data: "2026-10-19" });
  aprovar(l.roteiro);
  processarAprovados(l.dir, { calibracao: l.calibracao, data: "19/10/2026" });
  const f = path.join(l.reel, "reel.json");
  const reel = ler(f);
  json(f, { ...reel, cenas: reel.cenas.map((c, i) => (i === 0 ? { ...c, fala: "Outra coisa." } : c)) });
  fs.writeFileSync(path.join(l.reel, "legenda.md"), "Legenda que ninguém aprovou.\n");
  assert.throws(() => checarAprovacao(l.reel), /difere.*npm run lote -- aprovados 2026-10-19/);
  const r = processarAprovados(l.dir, { calibracao: l.calibracao, data: "19/10/2026" });
  assert.match(r[0].estado, /^reaplicado/);
  assert.equal(ler(f).cenas[0].fala, "Primeira fala do reel.");
  assert.deepEqual(ler(f).cenas[0].dados, REEL.cenas[0].dados, "a parte visual fica");
  assert.equal(checarAprovacao(l.reel).falas[0], "Primeira fala do reel.");
  // Fala livre válida não é "sair do aprovado": continua já aplicado.
  gravouFalandoDiferente(l);
  assert.equal(processarAprovados(l.dir, { calibracao: l.calibracao, data: "19/10/2026" })[0].estado, "já aplicado");
});
