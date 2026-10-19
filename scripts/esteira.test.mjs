// node --test scripts/esteira.test.mjs: validador do roteiro, plano de produção, leitura do check e estado do lote.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validarReel, validarLote, palavrasForaDaFala } from "./validar-roteiro.mjs";
import { planoProducao, avaliarCheck, registroProducao, exigeTrilha } from "./produzir.mjs";
import { novoLote, loteAberto, proximoPasso, mudarEtapa, dataDoLote, ETAPAS } from "./lote.mjs";
import { salvarTomada, escolherTomada, hashFalas } from "../kit/voz-gravada.mjs";

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const json = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2));
const lerReel = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "reel.json"), "utf8"));
const TRAVESSAO = String.fromCharCode(8212);

// Reel mínimo válido com isca (palavra TESTE).
function reelValido(dir, mexer = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const reel = {
    slug: "r1-teste",
    titulo: "UM TÍTULO | *forte*",
    palavra: "TESTE",
    destaques: ["Claude"],
    dm: { texto: "Aqui está o *guia*.", botao: "abrir o guia" },
    cenas: [
      { tipo: "hook", fala: "O meu Claude faz uma coisa que pouca gente sabe.", dados: { logo: "claude", selo: "COISA", selo_em: "coisa" } },
      { tipo: "lista", fala: "Ele lê as regras, segue o roteiro e confere o fato.", dados: { itens: [
        { nome: "Lê as regras", icone: "contexto", em: "regras" },
        { nome: "Confere o fato", icone: "diagnostico", em: "confere" } ] } },
      { tipo: "segue", fala: "Me segue pra ver mais," },
      { tipo: "comenta", fala: "e comenta TESTE que eu te mando o guia na DM.", dados: { em: "comenta", dm_em: "mando" } },
    ],
    ...mexer.reel,
  };
  json(path.join(dir, "reel.json"), reel);
  fs.writeFileSync(path.join(dir, "legenda.md"), mexer.legenda ?? "Comenta “TESTE” que te mando o guia na DM\n\nTô usando isso todo dia.\n#claude #ia\n");
  return dir;
}

const erros = (r) => r.erros.join(" | ");

test("validarReel: reel completo passa e estima a duração no ritmo de reel", () => {
  const r = validarReel(reelValido(path.join(tmp("v-"), "r1")));
  assert.deepEqual(r.erros, []);
  assert.ok(r.segundos > 5 && r.segundos < 15, `segundos=${r.segundos}`);
});

test("validarReel: slug vira nome de arquivo e vai no comando do render: só minúsculas, números e hífen", () => {
  for (const slug of ["R1-Teste", "r1 teste", "r1\"teste", "-r1"]) {
    assert.match(erros(validarReel(reelValido(path.join(tmp("v-"), "r1"), { reel: { slug } }))), /slug .* inválido/, slug);
  }
  assert.deepEqual(validarReel(reelValido(path.join(tmp("v-"), "r1"), { reel: { slug: "r12-fim-de-semana" } })).erros, []);
});

test("validarReel: tipo de cena, logo e ícone que não existem no kit são erro", () => {
  const dir = reelValido(path.join(tmp("v-"), "r1"));
  const reel = lerReel(dir);
  reel.cenas[0].dados.logo = "marca-que-nao-existe";
  reel.cenas[1].dados.itens[0].icone = "icone-que-nao-existe";
  reel.cenas.splice(2, 0, { tipo: "carrossel", fala: "Uma cena nova." });
  json(path.join(dir, "reel.json"), reel);
  const e = erros(validarReel(dir));
  assert.match(e, /marca-que-nao-existe/);
  assert.match(e, /icone-que-nao-existe/);
  assert.match(e, /carrossel/);
});

test("validarReel: âncora que não está na fala da cena é erro (a animação cairia num tempo chutado)", () => {
  const dir = reelValido(path.join(tmp("v-"), "r1"));
  const reel = lerReel(dir);
  reel.cenas[1].dados.itens[1].em = "auditoria";
  reel.cenas[0].efeitos = [{ tipo: "explosao", em: "bomba" }];
  json(path.join(dir, "reel.json"), reel);
  const e = erros(validarReel(dir));
  assert.match(e, /auditoria/);
  assert.match(e, /bomba/);
});

test("validarReel: âncora de quadro, cabeçalho e batida fora da fala é erro", () => {
  const dir = reelValido(path.join(tmp("v-"), "r1"));
  const reel = lerReel(dir);
  reel.cenas[0].dados = { quadros: [{ tipo: "palavra", texto: "UMA", em: "meu" }, { tipo: "logo", logo: "claude", em: "foguete" }] };
  reel.cenas[0].cabs = [{ em: "planeta", t: "COISA" }];
  reel.cenas[1].batidas = [{ tipo: "selo", texto: "REGRAS", em: "regras" }, { tipo: "zoom", em: "galáxia" }];
  json(path.join(dir, "reel.json"), reel);
  const e = erros(validarReel(dir));
  assert.match(e, /quadros\[1\]\.em "foguete"/);
  assert.match(e, /cabs\[0\]\.em "planeta"/);
  assert.match(e, /batidas\[1\]\.em "galáxia"/);
  assert.doesNotMatch(e, /"meu"|"regras"/);
});

test("validarReel: tipo de quadro ou batida, logo do quadro e tema que não existem são erro", () => {
  const dir = reelValido(path.join(tmp("v-"), "r1"));
  const reel = lerReel(dir);
  reel.tema = "xadrez";
  reel.cenas[0].dados = { quadros: [{ tipo: "foguete", em: "meu" }, { tipo: "logo", logo: "marca-inexistente", em: "coisa" }] };
  reel.cenas[1].batidas = [{ tipo: "terremoto", em: "regras" }];
  json(path.join(dir, "reel.json"), reel);
  const e = erros(validarReel(dir));
  assert.match(e, /tema "xadrez"/);
  assert.match(e, /quadro "foguete"/);
  assert.match(e, /marca-inexistente/);
  assert.match(e, /batida "terremoto"/);
});

test("validarReel: quadros fora da ordem da fala e quadro sem o campo obrigatório são erro", () => {
  const dir = reelValido(path.join(tmp("v-"), "r1"));
  const reel = lerReel(dir);
  // fala: "O meu Claude faz uma coisa que pouca gente sabe."
  reel.cenas[0].dados = { quadros: [{ tipo: "palavra", texto: "UMA", em: "coisa" }, { tipo: "logo", logo: "claude", em: "meu" }, { tipo: "contador", em: "sabe" }] };
  json(path.join(dir, "reel.json"), reel);
  const e = erros(validarReel(dir));
  assert.match(e, /quadros fora da ordem da fala/);
  assert.match(e, /quadro contador sem "ate"/);
});

test("validarReel: travessão e \"não é só\" repetido barram", () => {
  const dir = reelValido(path.join(tmp("v-"), "r1"), { legenda: `Comenta TESTE ${TRAVESSAO} e pronto\n` });
  const reel = lerReel(dir);
  reel.cenas[0].fala = "Não é só prompt, é método, e não é só ferramenta, é processo.";
  json(path.join(dir, "reel.json"), reel);
  const r = validarReel(dir);
  assert.match(erros(r), /travessão em legenda\.md/);
  assert.match(erros(r), /não é só/);
});

test("validarReel: texto de tela (cabeçalho, carimbo, frase, lista, etiqueta) só com palavras da fala da cena", () => {
  const dir = reelValido(path.join(tmp("v-"), "r1"));
  const reel = lerReel(dir);
  reel.cenas[0].fala = "O meu Claude ia gastar umas quatro vezes mais nessa coisa que pouca gente sabe.";
  reel.cenas[0].cabs = [{ em: "gastar", t: "QUANTO IA *custar*" }, { em: "quatro", t: "UMAS *4 vezes* MAIS" }];
  reel.cenas[0].batidas = [{ em: "coisa", tipo: "selo", texto: "POUCA GENTE SABE" }];
  reel.cenas[1].dados.itens[0].nome = "Lê as normas";
  reel.cenas.splice(2, 0, { tipo: "frase", fala: "É grátis e não tem propaganda.", dados: { texto: "Grátis e *sem anúncio*" } });
  reel.mascote_rotulo = "CAÇADOR";
  json(path.join(dir, "reel.json"), reel);
  const e = erros(validarReel(dir));
  assert.match(e, /texto de tela "QUANTO IA \*custar\*".*quanto, custar/);
  assert.doesNotMatch(e, /4 vezes|POUCA GENTE SABE/);
  assert.match(e, /texto de tela "Lê as normas".*normas/);
  assert.match(e, /texto de tela "Grátis e \*sem anúncio\*".*anuncio/);
  assert.match(e, /etiqueta do bonequinho "CAÇADOR".*cacador/);
});

test("validarReel (midia): sem imagens, âncora fora da fala e arquivo que não existe são erro", () => {
  const dir = reelValido(path.join(tmp("v-"), "r1"));
  const reel = lerReel(dir);
  reel.cenas.splice(1, 0,
    { tipo: "midia", fala: "Olha o app aberto aqui.", dados: { imagens: [{ src: "midia/a.jpg" }, { src: "midia/b.jpg", em: "mapa" }] } },
    { tipo: "midia", fala: "E outra tela." },
  );
  json(path.join(dir, "reel.json"), reel);
  fs.mkdirSync(path.join(dir, "midia"));
  fs.writeFileSync(path.join(dir, "midia", "a.jpg"), "x");
  const e = erros(validarReel(dir));
  assert.match(e, /imagens\[1\]\.em "mapa" não está na fala/);
  assert.match(e, /imagem midia\/b\.jpg não existe/);
  assert.match(e, /cena 3 \(midia\): falta dados\.imagens/);
  assert.doesNotMatch(e, /midia\/a\.jpg/);
});

test("palavrasForaDaFala: palavra curta da fala não vira coringa; flexão passa, paráfrase não", () => {
  assert.deepEqual(palavrasForaDaFala("Isso tem tudo a ver com o Claude.", "TEMPESTADE COMPLETA"), ["tempestade", "completa"]);
  assert.deepEqual(palavrasForaDaFala("Vai pro app.", "PROIBIDO"), ["proibido"]);
  assert.deepEqual(palavrasForaDaFala("Uma pessoa tem que revisar.", "UMA PESSOA REVISA"), []);
  assert.deepEqual(palavrasForaDaFala("Esse mod muda tudo.", "*MODS*"), []);
  assert.deepEqual(palavrasForaDaFala("Ia gastar muito.", "QUANTO IA *custar*"), ["quanto", "custar"]);
  assert.deepEqual(palavrasForaDaFala("Uma ferramenta grátis.", "GRÁTIS"), []);
});

test("validarReel: passar de 60 s no ritmo de reel só avisa", () => {
  const dir = reelValido(path.join(tmp("v-"), "r1"));
  const reel = lerReel(dir);
  reel.cenas[1].fala = Array(260).fill("palavra").join(" ") + " regras confere";
  json(path.join(dir, "reel.json"), reel);
  const r = validarReel(dir);
  assert.doesNotMatch(erros(r), /60s/);
  assert.match(r.avisos.join(" | "), /passa de 60s/);
});

test("validarReel: legenda sem a palavra, fala do comenta sem a palavra e reel sem dm.texto são erro", () => {
  const dir = reelValido(path.join(tmp("v-"), "r1"), { legenda: "Tô usando isso todo dia.\n" });
  const reel = lerReel(dir);
  reel.cenas[3].fala = "e comenta aqui que eu te mando o guia na DM.";
  reel.cenas[3].dados = { em: "comenta", dm_em: "mando" };
  delete reel.dm;
  json(path.join(dir, "reel.json"), reel);
  const e = erros(validarReel(dir));
  assert.match(e, /legenda não pede pra comentar TESTE/);
  assert.match(e, /a fala da cena comenta não diz TESTE/);
  assert.match(e, /sem dm\.texto/);
});

test("validarReel: reel de opinião (sem palavra) não exige fecho com comenta nem DM", () => {
  const dir = path.join(tmp("v-"), "r9");
  fs.mkdirSync(dir);
  json(path.join(dir, "reel.json"), {
    slug: "r9-opiniao",
    titulo: "A IA *não* vai te substituir",
    cenas: [
      { tipo: "frase", fala: "A IA não vai te substituir, quem usa IA vai.", dados: { texto: "quem usa *IA* vai" } },
      { tipo: "segue", fala: "Me segue pra ver mais." },
    ],
  });
  fs.writeFileSync(path.join(dir, "legenda.md"), "O que você acha?\n#ia\n");
  assert.deepEqual(validarReel(dir).erros, []);
});

test("validarLote: palavra repetida no lote é erro", () => {
  const lote = path.join(tmp("lote-"), "2026-10-10");
  reelValido(path.join(lote, "r1-teste"));
  reelValido(path.join(lote, "r2-teste"), { reel: { slug: "r2-teste" } });
  const r = validarLote(lote);
  assert.match(r.erros.join(" | "), /palavra TESTE repetida no lote \(r1-teste, r2-teste\)/);
});

test("validarReel: mundo 3D exige o arquivo, marca na fala da cena e painel com palavras da fala", () => {
  const cenaMundo = { tipo: "mundo", fala: "O meu Claude faz uma coisa que pouca gente sabe.", dados: { hud: [{ rotulo: "pouca *gente*", valor: "sabe", em: "gente" }] } };
  const dir = reelValido(path.join(tmp("v-"), "r1"), { reel: { mundo: { arquivo: "mundo.mjs", marcas: { faz: [0, "faz"] } } } });
  const reel = lerReel(dir);
  reel.cenas[0] = cenaMundo;
  json(path.join(dir, "reel.json"), reel);
  assert.match(erros(validarReel(dir)), /mundo: falta mundo\.mjs na pasta do reel/);
  fs.writeFileSync(path.join(dir, "mundo.mjs"), "export function criarMundo(){ return { render(){} }; }");
  assert.equal(erros(validarReel(dir)), "");
  reel.mundo.marcas.voa = [0, "voa"];
  reel.mundo.marcas.longe = [9, "faz"];
  reel.cenas[0].dados.hud[0].valor = "ninguém";
  json(path.join(dir, "reel.json"), reel);
  const e = erros(validarReel(dir));
  assert.match(e, /mundo: marca "voa": "voa" não está na fala da cena 1/);
  assert.match(e, /mundo: marca "longe": cena 10 não existe/);
  assert.match(e, /texto de tela "ninguém" tem palavra que não está na fala/);
  reel.mundo.marcas = { faz: "faz" };
  reel.cenas[0].dados.hud[0].valor = "sabe";
  json(path.join(dir, "reel.json"), reel);
  assert.match(erros(validarReel(dir)), /mundo: marca "faz": use \[cena, palavra\]/);
  reel.mundo.marcas = { faz: [0, "faz"] };
  json(path.join(dir, "reel.json"), reel);
  fs.writeFileSync(path.join(dir, "mundo.mjs"), "export function criarMundo( {");
  assert.match(erros(validarReel(dir)), /mundo: mundo\.mjs não compila/);
  fs.writeFileSync(path.join(dir, "mundo.mjs"), "export function outraCoisa(){}");
  assert.match(erros(validarReel(dir)), /mundo: mundo\.mjs não exporta criarMundo/);
});

test("validarReel: \"Me segue\" no mesmo parágrafo do comenta (antes: segue) vale como o segue; palavra de corte fora da fala é erro", () => {
  const [hook, lista] = lerReel(reelValido(path.join(tmp("v-"), "r0"))).cenas;
  const junto = { tipo: "comenta", fala: "Me segue pra ver mais, e comenta TESTE que eu te mando o guia na DM.", dados: { em: "comenta", dm_em: "mando" }, antes: { tipo: "segue", ate: "mais" } };
  const r = validarReel(reelValido(path.join(tmp("v-"), "r1"), { reel: { cenas: [hook, lista, junto] } }));
  assert.deepEqual(r.erros, []);
  assert.ok(!r.avisos.some((a) => /penúltima/.test(a)), r.avisos.join(" | "));
  const ruim = validarReel(reelValido(path.join(tmp("v-"), "r2"), { reel: { cenas: [hook, lista, { ...junto, antes: { tipo: "segue", ate: "seguir" } }] } }));
  assert.match(erros(ruim), /antes\.ate "seguir"/);
});

test("validarReel: cena com \"antes\" confere as âncoras de cada tela contra a parte da fala dela", () => {
  const [hook, lista] = lerReel(reelValido(path.join(tmp("v-"), "r0"))).cenas;
  const junto = (mexer) => ({ tipo: "comenta", fala: "Me segue pra ver mais, e comenta TESTE que eu te mando o guia na DM.", dados: { em: "comenta", dm_em: "mando" }, antes: { tipo: "segue", ate: "mais" }, ...mexer });
  const digitou = validarReel(reelValido(path.join(tmp("v-"), "r1"), { reel: { cenas: [hook, lista, junto({ antes: { tipo: "segue", ate: "mais", dados: { em: "sigam" } } })] } }));
  assert.match(erros(digitou), /segue.*"sigam" não está na fala/);
  const trocou = validarReel(reelValido(path.join(tmp("v-"), "r2"), { reel: { cenas: [hook, lista, junto({ batidas: [{ tipo: "pulso", em: "ver" }] })] } }));
  assert.match(erros(trocou), /comenta.*"ver" não está na fala/);
});

// ─── produção ─────────────────────────────────────────────────────────────────

const palavras = (reel) => reel.cenas.flatMap((c) => c.fala.split(/\s+/).filter(Boolean));

test("planoProducao: sem gravação para e diz o comando; gravação de texto antigo pede regravar ou --literal", () => {
  const dir = reelValido(path.join(tmp("p-"), "r1"));
  assert.throws(() => planoProducao(dir), /ainda não tem gravação: grave a narração com npm run gravar -- /);
  const reel = lerReel(dir);
  // Tomada salva que ainda não passou (não é a escolhida) não conta.
  const t1 = salvarTomada(dir, Buffer.from("x"), "webm");
  assert.throws(() => planoProducao(dir), /ainda não tem gravação/);
  escolherTomada(dir, t1, hashFalas(reel));
  assert.deepEqual(planoProducao(dir).passos, ["validar", "gravada", "build", "check", "render"]);
  // Fala editada depois da gravação: a gravação não vale mais.
  json(path.join(dir, "reel.json"), { ...reel, cenas: reel.cenas.map((c, i) => (i === 2 ? { ...c, fala: "Me segue que tem mais," } : c)) });
  assert.throws(() => planoProducao(dir), /texto antigo.*npm run voz -- .* --literal/);
});

test("planoProducao: reaproveita a narração pronta da mesma tomada e numera o render; mudou tomada, velocidade ou fala, processa de novo", () => {
  const dir = reelValido(path.join(tmp("p-"), "r1"));
  const reel = lerReel(dir);
  const hash = hashFalas(reel);
  const t1 = salvarTomada(dir, Buffer.from("x"), "webm");
  escolherTomada(dir, t1, hash);
  fs.writeFileSync(path.join(dir, "narracao.mp3"), "");
  json(path.join(dir, "words.json"), palavras(reel).map((w, i) => ({ w, s: i, e: i + 0.5 })));
  json(path.join(dir, "narracao-voz.json"), { gravada: hash, tomada: "tomada-1.webm", acelerar: 1 });
  fs.mkdirSync(path.join(dir, "renders"));
  fs.writeFileSync(path.join(dir, "renders", "r1-teste-v1.mp4"), "");
  fs.writeFileSync(path.join(dir, "renders", "r1-teste-v3.mp4"), "");
  const p = planoProducao(dir);
  assert.deepEqual(p.passos, ["validar", "build", "check", "render"]);
  assert.equal(p.render, path.join("renders", "r1-teste-v4.mp4"));
  assert.equal(p.tomada, t1);
  assert.ok(planoProducao(dir, { refazerVoz: true }).passos.includes("gravada"));
  // Outra velocidade pedida: processa de novo.
  json(path.join(dir, "reel.json"), { ...reel, voz_gravada: { acelerar: 1.15 } });
  assert.ok(planoProducao(dir).passos.includes("gravada"));
  json(path.join(dir, "reel.json"), reel);
  // Outra tomada escolhida: processa de novo.
  escolherTomada(dir, salvarTomada(dir, Buffer.from("y"), "webm"), hash);
  assert.ok(planoProducao(dir).passos.includes("gravada"));
  escolherTomada(dir, t1, hash);
  assert.ok(!planoProducao(dir).passos.includes("gravada"));
  // words.json de outro texto (narração velha): processa de novo.
  json(path.join(dir, "words.json"), [{ w: "outra", s: 0, e: 1 }]);
  assert.ok(planoProducao(dir).passos.includes("gravada"));
});

test("planoProducao: a versão de teste tem a própria numeração e não mexe na do perfil", () => {
  const dir = reelValido(path.join(tmp("ver-"), "r1"));
  escolherTomada(dir, salvarTomada(dir, Buffer.from("x"), "webm"), hashFalas(lerReel(dir)));
  fs.mkdirSync(path.join(dir, "renders"));
  fs.writeFileSync(path.join(dir, "renders", "r1-teste-v3.mp4"), "");
  fs.writeFileSync(path.join(dir, "renders", "r1-teste-teste-v1.mp4"), "");
  assert.equal(planoProducao(dir).render, path.join("renders", "r1-teste-v4.mp4"));
  assert.equal(planoProducao(dir, { versao: "teste" }).render, path.join("renders", "r1-teste-teste-v2.mp4"));
  assert.equal(planoProducao(dir, { versao: "teste" }).versao, "teste");
  assert.throws(() => planoProducao(dir, { versao: "b" }), /versão "b" não existe/);
});

test("registroProducao e exigeTrilha: o teste fica registrado; reel sem música não exige trilha", () => {
  assert.equal(registroProducao({ voz: "gravada" }, { draft: false, teste: true, agora: "x" }).teste, "roteiro não conferido (produção de teste)");
  assert.equal(registroProducao({}, { draft: true, teste: false, agora: "x" }).qualidade, "draft");
  assert.equal(registroProducao({}, { draft: false, teste: false, agora: "x" }).teste, undefined);
  assert.equal(exigeTrilha({ trilha: { clima: "passo" } }), false, "clima sem faixa escolhida (sem musicas.json)");
  assert.equal(exigeTrilha({ trilha: false }), false);
  assert.equal(exigeTrilha({ trilha: { arquivo: "a.mp3" } }), true);
  assert.equal(exigeTrilha({ trilha: { arquivo: "a.mp3" } }, "teste"), true);
  assert.equal(exigeTrilha({ trilha: { arquivo: "a.mp3" }, versoes: { teste: { trilha: false } } }, "teste"), false);
});

test("avaliarCheck: erro de lint, runtime, layout ou motion barra; contraste só avisa", () => {
  const vazio = { ok: true, errorCount: 0, findings: [] };
  const j = {
    lint: vazio,
    runtime: vazio,
    motion: vazio,
    layout: { ok: false, errorCount: 1, findings: [{ severity: "error", code: "content_overlap", message: "Two text blocks overlap" }] },
    contrast: { ok: false, errorCount: 1, findings: [{ severity: "error", code: "contrast_aa_failure", message: "Contrast is 1.5:1", text: "$", time: 3.5 }, { severity: "warning", message: "x" }] },
  };
  const r = avaliarCheck(j);
  assert.equal(r.ok, false);
  assert.match(r.bloqueios.join(" | "), /layout: content_overlap/);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /contraste.*"\$".*3,5 s/);
  assert.equal(avaliarCheck({ ...j, layout: vazio }).ok, true);
});

test("avaliarCheck: navegador que não fechou depois da checagem é aviso; checagem que não rodou barra", () => {
  const vazio = { ok: true, errorCount: 0, findings: [] };
  const limpeza = { severity: "error", code: "check_cleanup_failure", message: "Browser process did not exit after forced shutdown." };
  const base = { lint: vazio, layout: vazio, motion: vazio, contrast: vazio };
  const r = avaliarCheck({ ...base, runtime: { ok: false, errorCount: 1, findings: [limpeza, { severity: "warning", code: "clip_media_fit", message: "x" }] } });
  assert.equal(r.ok, true);
  assert.match(r.avisos.join(" | "), /navegador do check não fechou/);
  const naoRodou = { severity: "error", code: "check_runtime_failure", message: "Browser process did not exit after forced shutdown." };
  const r2 = avaliarCheck({ ...base, runtime: { ok: false, errorCount: 2, findings: [naoRodou, limpeza] } });
  assert.equal(r2.ok, false);
  assert.match(r2.bloqueios.join(" | "), /runtime: check_runtime_failure/);
});

// ─── lote ─────────────────────────────────────────────────────────────────────

test("lote: cria no radar, acha o lote aberto mais recente, muda a etapa e diz o próximo passo com a data", () => {
  const lotes = tmp("lotes-");
  const a = novoLote(lotes, "2026-10-10", { reels: 5 });
  assert.equal(a.etapa, "radar");
  assert.equal(a.meta.reels, 5);
  assert.equal(novoLote(lotes, "2026-10-01").meta.reels, 3);
  assert.throws(() => novoLote(lotes, "2026-10-10"), /já existe/);
  fs.mkdirSync(path.join(lotes, "2026-10-03"));
  json(path.join(lotes, "2026-10-03", "lote.json"), { data: "2026-10-03", etapa: "fechado" });
  assert.equal(loteAberto(lotes).data, "2026-10-10");
  assert.equal(dataDoLote(lotes), "2026-10-10");
  assert.equal(dataDoLote(lotes, "2026-10-01"), "2026-10-01");
  assert.throws(() => dataDoLote(lotes, "2026-09-09"), /não existe/);
  assert.equal(mudarEtapa(lotes, "2026-10-10", "gravacao").etapa, "gravacao");
  assert.throws(() => mudarEtapa(lotes, "2026-10-10", "g2"), /etapa g2 não existe/);
  assert.match(proximoPasso({ etapa: "gravacao", data: "2026-10-10" }), /npm run gravar -- lotes\/2026-10-10\/<reel>/);
  assert.match(proximoPasso({ etapa: "corte" }), /esperar/);
  for (const e of ETAPAS) assert.ok(proximoPasso({ etapa: e }).length > 10);
  for (const l of ["2026-10-10", "2026-10-01"]) mudarEtapa(lotes, l, "fechado");
  assert.equal(loteAberto(lotes), null);
  assert.throws(() => dataDoLote(lotes), /nenhum lote aberto/);
});

test("dataDoLote: data mal digitada é erro (não cai calada no lote aberto); flag não conta como data", () => {
  const lotes = tmp("lotes-");
  novoLote(lotes, "2026-10-19");
  assert.throws(() => dataDoLote(lotes, "12-10-2026"), /data "12-10-2026" inválida: use AAAA-MM-DD/);
  assert.throws(() => dataDoLote(lotes, "ontem"), /inválida/);
  assert.equal(dataDoLote(lotes, undefined), "2026-10-19");
});

test("gravar: --porta sem número sai com mensagem de uso, sem stack trace", async () => {
  const { spawnSync } = await import("node:child_process");
  const dir = reelValido(path.join(tmp("porta-"), "r1"));
  for (const extra of [["--porta"], ["--porta", "abc"], ["--porta", "70000"]]) {
    const r = spawnSync(process.execPath, [path.join(import.meta.dirname, "gravar.mjs"), dir, "--teste", ...extra], { encoding: "utf8", timeout: 15000 });
    assert.equal(r.status, 1, extra.join(" "));
    assert.match(r.stderr, /--porta precisa de um número de 1 a 65535/);
    assert.doesNotMatch(r.stderr, /at .*\.mjs:\d+/);
  }
});

test("validarReel (revisão 19/10): cards, comparar, barras, calendário, sub do número e rótulo do gancho também são texto de tela", () => {
  const dir = reelValido(path.join(tmp("v-"), "r1"));
  const reel = lerReel(dir);
  reel.cenas[0] = { tipo: "hook", fala: "O meu Claude faz uma coisa que pouca gente sabe.", dados: { numero: 3, rotulo: "GANHEI DINHEIRO" } };
  reel.cenas.splice(2, 0,
    { tipo: "cards", fala: "Dois blocos aqui.", dados: { itens: [{ titulo: "Milhões vendidos", sub: "blocos" }, { titulo: "Blocos", sub: "perfeito garantido" }] } },
    { tipo: "comparar", fala: "Antes era lento, depois ficou rápido.", dados: { antes: { rotulo: "Antes", itens: ["vendas falsas"] }, depois: { rotulo: "Depois", itens: ["rápido"], em: "depois" } } },
    { tipo: "numero", fala: "São quatro passos.", dados: { valor: "4", rotulo: "passos", sub: "promoção inventada", em: "quatro" } },
  );
  reel.cenas[1].dados = { ...reel.cenas[1].dados, quadros: undefined };
  reel.cenas[1].fala = "Ele lê as regras, segue o roteiro e confere o fato.";
  json(path.join(dir, "reel.json"), reel);
  const e = erros(validarReel(dir));
  for (const t of ["GANHEI DINHEIRO", "Milhões vendidos", "perfeito garantido", "vendas falsas", "promoção inventada"]) assert.match(e, new RegExp(`texto de tela "${t}"`), t);
  // Quadros barras e calendário no gancho.
  const dir2 = reelValido(path.join(tmp("v-"), "r2"));
  const r2 = lerReel(dir2);
  r2.cenas[0].dados = { quadros: [{ tipo: "barras", itens: [{ rotulo: "Lucro inventado", valor: 3, texto: "coisa" }] }, { tipo: "calendario", mes: "DEZEMBRO", dias: [1, 3], em: "coisa" }] };
  json(path.join(dir2, "reel.json"), r2);
  const e2 = erros(validarReel(dir2));
  assert.match(e2, /texto de tela "Lucro inventado"/);
  assert.match(e2, /texto de tela "DEZEMBRO"/);
});

test("validarReel (revisão 19/10): cor e clima que não existem são erro no validar (antes só quebravam no produzir)", () => {
  const dir = reelValido(path.join(tmp("v-"), "r1"), { reel: { cor: "roxo", trilha: { clima: "humor" } } });
  const e = erros(validarReel(dir));
  assert.match(e, /cor "roxo" não existe/);
  assert.match(e, /clima "humor" não existe/);
  assert.deepEqual(validarReel(reelValido(path.join(tmp("v-"), "r2"), { reel: { cor: "#12ab9F", trilha: { clima: "Descontraído" } } })).erros, []);
});

test("validarReel (revisão 19/10): o bonequinho vem ligado com a etiqueta CLAUDE; fora da fala, avisa como desligar", () => {
  const dir = reelValido(path.join(tmp("v-"), "r1"));
  const reel = lerReel(dir);
  reel.cenas[0].fala = "A receita de bolo que pouca gente sabe fazer.";
  reel.cenas[0].dados = { selo: "BOLO", selo_em: "bolo" };
  json(path.join(dir, "reel.json"), reel);
  assert.match(validarReel(dir).avisos.join(" | "), /bonequinho.*CLAUDE.*"mascote": false/);
  json(path.join(dir, "reel.json"), { ...reel, mascote: false });
  assert.ok(!validarReel(dir).avisos.some((a) => /bonequinho/.test(a)));
});

test("scripts de linha de comando comparam o caminho real (clone aberto por junção ou link simbólico não sai calado)", () => {
  const raiz = path.resolve(import.meta.dirname, "..");
  const arquivos = ["scripts", "kit"].flatMap((d) => fs.readdirSync(path.join(raiz, d)).filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs")).map((f) => path.join(d, f)));
  const sem = arquivos.filter((f) => /path\.resolve\(process\.argv\[1\]\) === fileURLToPath/.test(fs.readFileSync(path.join(raiz, f), "utf8")));
  assert.deepEqual(sem, []);
});
