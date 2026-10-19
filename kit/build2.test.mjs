// node --test kit/build2.test.mjs: kit v2 (ritmo de 1 a 2 s, cor, trilha, foto do perfil).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "./build.mjs";
import { TEMAS, acento } from "./tema.mjs";
import { montar, sonsDeTeste, perfilDeTeste } from "./apoio-teste.mjs";

const SONS = sonsDeTeste();

const GANCHO = {
  titulo: "EU PAGO | E USO *muito*",
  palavra: "PLANO",
  cenas: [
    {
      tipo: "hook",
      // palavras: Em(0) três(0.25) semanas(0.5) o(0.75) meu(1.0) Claude(1.25) Code(1.5) ia(1.75) gastar(2.0) muito(2.25)
      fala: "Em três semanas o meu Claude Code ia gastar muito.",
      cabs: [{ em: "Claude", t: "MEU *Claude*" }],
      dados: {
        quadros: [
          { em: "Em", tipo: "palavra", texto: "3 *SEMANAS*" },
          { em: "Claude", tipo: "logo", logo: "claude" },
          { em: "gastar", tipo: "contador", ate: 5568, prefixo: "US$ ", rotulo: "SE FOSSE *API*" },
        ],
      },
      batidas: [
        { em: "gastar", tipo: "chuva", item: "moeda" },
        { em: "muito", tipo: "selo", texto: "PREÇO DE API" },
      ],
    },
    { tipo: "frase", fala: "Quem fez a conta foi uma ferramenta grátis que lê o histórico do seu computador e calcula tudo.", dados: { texto: "Quem fez a *conta*" } },
    { tipo: "segue", fala: "Me segue," },
    { tipo: "comenta", fala: "e comenta PLANO aqui.", dados: { em: "comenta" } },
  ],
};

test("build v2: tema padrão vira data-tema no body e as cores entram no :root", () => {
  const r = montar(GANCHO);
  build(r.dir);
  // AFINAÇÃO 16/10: o body ganhou o estilo cinema (padrão aprovado por ele); o teste confere só o tema.
  assert.match(r.html(), /<body data-tema="neon"[ >]/);
  assert.match(r.html(), /--acc0: #ff3d8b;/);
  const f = montar({ ...GANCHO, tema: "fliperama" });
  build(f.dir);
  assert.match(f.html(), /<body data-tema="fliperama"[ >]/);
});

test("build v2: cada cena ganha o acento do tema em rodízio", () => {
  const r = montar(GANCHO);
  build(r.dir);
  assert.match(r.html(), new RegExp(`id="s0" class="clip cena"[^>]*style="--acc:${acento(TEMAS.neon, 0)};`));
  assert.match(r.html(), new RegExp(`id="s1" class="clip cena"[^>]*style="--acc:${acento(TEMAS.neon, 1)};`));
});

test("build v2: quadros do gancho trocam o palco na palavra falada", () => {
  const r = montar(GANCHO);
  build(r.dir);
  const h = r.html();
  assert.match(h, /id="s0-q0"/);
  assert.match(h, /tl\.fromTo\("#s0-q1",[^\n]*, 1\.25\);/);
  assert.match(h, /tl\.fromTo\("#s0-q2",[^\n]*, 2\);/);
  // o 1º quadro entra no primeiro quadro do vídeo (a mudança do 1º segundo)
  assert.match(h, /tl\.fromTo\("#s0-q0",[^\n]*, 0\);/);
});

test("build v2: quadro de tipo desconhecido é erro com a lista", () => {
  const reel = structuredClone(GANCHO);
  reel.cenas[0].dados.quadros[0].tipo = "foguete";
  assert.throws(() => build(montar(reel).dir), /quadro 0 da cena 0: tipo "foguete" não existe \(.*palavra.*\)/);
});

test("build v2: cabeçalho troca na palavra falada", () => {
  const r = montar(GANCHO);
  build(r.dir);
  const h = r.html();
  assert.match(h, /id="s0-cab0"[^>]*>/);
  assert.match(h, /MEU <em>Claude<\/em>/);
  assert.match(h, /tl\.set\("#s0-cab0",\{opacity:1\}, 1\.25\);/);
});

test("build v2: batidas entram na âncora; tipo desconhecido é erro", () => {
  const r = montar(GANCHO);
  build(r.dir);
  const h = r.html();
  assert.match(h, /id="s0-b1"[^>]*>PREÇO DE API</);
  assert.match(h, /tl\.fromTo\("#s0-b1",[^\n]*, 2\.25\);/);
  assert.match(h, /id="s0-b0m0"/);
  const reel = structuredClone(GANCHO);
  reel.cenas[0].batidas[0].tipo = "terremoto";
  assert.throws(() => build(montar(reel).dir), /batida 0 da cena 0: tipo "terremoto" não existe \(.*selo.*\)/);
});

test("build v2: auto-ritmo não deixa vão visual maior que 1,4 s", () => {
  const r = montar(GANCHO);
  const out = build(r.dir);
  assert.ok(out.maiorVao <= 1.4, `maiorVao=${out.maiorVao}`);
  assert.ok(out.batidasAuto > 0, "a frase longa sem batida precisa de batidas automáticas");
});

test("build v2: cabeçalho e carimbo são mudança pequena (menos de 1% da tela) e não cobrem vão", () => {
  const p = (n, ini = 0) => Array.from({ length: n }, (_, k) => `p${ini + k}`).join(" ");
  const reel = {
    cenas: [
      { tipo: "frase", fala: p(12), dados: { texto: "um" } },
      // cena 1: 16 palavras de 3,0 a 6,97 s; cabeçalho na 5ª e carimbo na 10ª
      { tipo: "frase", fala: p(16, 12), dados: { texto: "dois" }, cabs: [{ em: "p17", t: "X" }], batidas: [{ em: "p22", tipo: "selo", texto: "OK" }] },
    ],
  };
  const out = build(montar(reel).dir);
  // de 2,92 a 8,57 s (5,65 s) só a transição é grande: precisa de 4 batidas automáticas
  assert.ok(out.autosPorCena[1] >= 4, `autosPorCena=${out.autosPorCena}`);
  assert.ok(out.maiorVao <= 1.4, `maiorVao=${out.maiorVao}`);
});

test("build v2: chuva de estrela desenha a estrela em SVG (nunca caractere que a fonte pode não ter)", () => {
  const reel = structuredClone(GANCHO);
  reel.cenas[0].batidas[0] = { em: "gastar", tipo: "chuva", item: "estrela", n: 3 };
  const r = montar(reel);
  build(r.dir);
  assert.match(r.html(), /id="s0-b0m0"[^>]*><svg[^>]*><polygon/);
  assert.doesNotMatch(r.html(), /★/);
});

const p = (n, ini = 0) => Array.from({ length: n }, (_, k) => `p${ini + k}`).join(" ");

test("build v2 (revisão): nenhum id repetido no HTML (repo, batidas automáticas e botões do segue)", () => {
  const reel = {
    palavra: "PLANO",
    cenas: [
      { tipo: "repo", fala: p(20), dados: { dono: "a", nome: "b", arquivos: ["x.md", "y/", "z.js"] } },
      { tipo: "segue", fala: `Me segue ${p(6, 20)}`, batidas: [{ em: "p21", tipo: "anel" }, { em: "p22", tipo: "selo", texto: "OI" }, { em: "p23", tipo: "palavra", texto: "UM" }] },
      { tipo: "comenta", fala: "e comenta PLANO aqui.", dados: { em: "comenta" } },
    ],
  };
  const r = montar(reel);
  build(r.dir);
  const ids = [...r.html().matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((id, k) => ids.indexOf(id) !== k);
  assert.deepEqual([...new Set(dup)], []);
});

test("build v2 (revisão): confete some no fim (não congela na tela)", () => {
  const reel = structuredClone(GANCHO);
  reel.cenas[1].batidas = [{ em: "ferramenta", tipo: "confete" }];
  const r = montar(reel);
  build(r.dir);
  assert.match(r.html(), /tl\.to\("#s1-b0c0",\{opacity:0,/);
});

test("build v2 (revisão): brilho atravessa devagar (a métrica amostra a cada 0,2 s)", () => {
  const reel = structuredClone(GANCHO);
  reel.cenas[1].batidas = [{ em: "ferramenta", tipo: "brilho" }];
  const r = montar(reel);
  build(r.dir);
  const d = Number(r.html().match(/tl\.fromTo\("#s1-b0",\{x:-1300\},\{x:1300,duration:([0-9.]+)/)[1]);
  assert.ok(d >= 1, `duração ${d}`);
});

test("build v2 (revisão): no segue curto o Seguindo acende antes do fim da cena", () => {
  const reel = { palavra: "PLANO", cenas: [{ tipo: "frase", fala: p(8), dados: { texto: "x" } }, { tipo: "segue", fala: "Me segue," }, { tipo: "comenta", fala: "e comenta PLANO aqui.", dados: { em: "comenta" } }] };
  const r = montar(reel);
  build(r.dir);
  const h = r.html();
  const [, ini, dur] = h.match(/id="s1" class="clip cena" data-start="([0-9.]+)" data-duration="([0-9.]+)"/);
  const t = Number(h.match(/tl\.to\("#s1-bt2",\{opacity:1[^\n]*, ([0-9.]+)\);/)[1]);
  assert.ok(t < Number(ini) + Number(dur), `Seguindo em ${t}, cena acaba em ${Number(ini) + Number(dur)}`);
});

test("build v2: trilha sem faixa e sem música do clima no catálogo sai sem trilha e avisa (o repositório não traz música)", () => {
  const r = montar({ ...GANCHO, trilha: { volume: 0.08 } });
  const out = build(r.dir, { catalogo: [] });
  assert.doesNotMatch(r.html(), /id="trilha"/);
  assert.ok(out.avisos.some((a) => /música/.test(a)), out.avisos.join(" | "));
});

test("build v2: trilha só com clima pega uma faixa daquele clima no catálogo (musicas.json)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "catalogo-"));
  const tom = path.join(tmp, "tom.mp3");
  assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=330:duration=20", tom]).status, 0);
  const catalogo = [{ arquivo: tom, clima: "passo" }, { arquivo: path.join(tmp, "outra.mp3"), clima: "conversa" }];
  const r = montar({ ...GANCHO, trilha: { clima: "passo", volume: 0.08 } });
  const out = build(r.dir, { catalogo, perfil: perfilDeTeste() });
  assert.match(r.html(), /<audio id="trilha" src="assets\/trilha.mp3"[^>]*data-volume="0.08">/);
  assert.deepEqual(out.avisos, []);
});

test("build v2: no tema claro o pulso é branco (o acento some no degradê vivo)", () => {
  const reel = { ...structuredClone(GANCHO), tema: "gradiente" };
  reel.cenas[1].batidas = [{ em: "ferramenta", tipo: "pulso" }];
  const r = montar(reel);
  build(r.dir);
  assert.match(r.html(), /tl\.set\("#pulso",\{"--pc":"#ffffff"\}/);
});

test("build v2: a 1ª batida automática da cena é zoom (mexe o conteúdo em qualquer tema)", () => {
  const reel = { cenas: [{ tipo: "frase", fala: Array.from({ length: 16 }, (_, k) => `p${k}`).join(" "), dados: { texto: "x" } }] };
  const r = montar(reel);
  build(r.dir);
  const zooms = [...r.html().matchAll(/tl\.to\("#s0-cam",[^\n]*, ([0-9.]+)\);/g)].map((m) => Number(m[1]));
  const brilhos = [...r.html().matchAll(/tl\.fromTo\("#s0-a\d+",\{x:-1300\}[^\n]*, ([0-9.]+)\);/g)].map((m) => Number(m[1]));
  assert.ok(zooms.length && (!brilhos.length || zooms[0] < brilhos[0]), `zooms=${zooms} brilhos=${brilhos}`);
});

test("build v2: anel e confete só aparecem na hora da batida (nada parado antes)", () => {
  const reel = structuredClone(GANCHO);
  reel.cenas[1].batidas = [
    { em: "ferramenta", tipo: "anel" },
    { em: "calcula", tipo: "confete" },
  ];
  const r = montar(reel);
  build(r.dir);
  const h = r.html();
  assert.match(h, /tl\.fromTo\("#s1-b0",\{scale:0\.2,opacity:1\},\{[^\n]*immediateRender:false\}/);
  assert.match(h, /tl\.fromTo\("#s1-b1c0",\{[^}]*opacity:1\},\{[^\n]*immediateRender:false\}/);
});

test("build v2: toda faixa de brilho no palco tem animação (nenhuma fica parada no meio)", () => {
  const r = montar(GANCHO);
  build(r.dir);
  const h = r.html();
  const faixas = [...h.matchAll(/class="bt-brilho" id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(faixas.length >= 0);
  for (const id of faixas) assert.match(h, new RegExp(`tl\\.fromTo\\("#${id}",\\{x:-1300\\}`), `faixa ${id} sem animação`);
});

test("build v2: Me segue e DM usam nome, @ e foto do perfil.json", () => {
  const r = montar(GANCHO);
  build(r.dir, { perfil: perfilDeTeste({ foto: true }) });
  const h = r.html();
  assert.equal((h.match(/<img src="assets\/img\/perfil\.png" alt="">/g) ?? []).length, 2);
  assert.match(h, /<div class="sg-nome">Ana Teste<\/div>/);
  assert.match(h, /<div class="sg-user">@ana\.teste<\/div>/);
  assert.match(h, /<b>ana\.teste<\/b>/);
  assert.ok(fs.existsSync(path.join(r.dir, "assets", "img", "perfil.png")));
});

test("build v2: perfil sem foto vira um círculo com as iniciais (nenhuma imagem quebrada)", () => {
  const r = montar(GANCHO);
  build(r.dir, { perfil: perfilDeTeste({ nome: "Ana Teste" }) });
  const h = r.html();
  assert.doesNotMatch(h, /<img src="assets\/img\//);
  assert.equal((h.match(/<span class="av-ini">AT<\/span>/g) ?? []).length, 2);
});

test("build v2: mascote começa grande no gancho e encolhe pro canto", () => {
  const r = montar(GANCHO);
  build(r.dir);
  assert.match(r.html(), /tl\.set\("#masc",\{scale:1\.9\}, 0\);/);
  assert.match(r.html(), /tl\.to\("#masc",\{scale:1,[^\n]*\);/);
});

test("build v2: mascote não começa grande quando o 1º quadro tem rótulo embaixo (cobriria o texto)", () => {
  const reel = structuredClone(GANCHO);
  reel.cenas[0].dados.quadros[0] = { em: "Em", tipo: "logo", logo: "claude", rotulo: "CLAUDE" };
  const r = montar(reel);
  build(r.dir);
  assert.doesNotMatch(r.html(), /tl\.set\("#masc",\{scale:1\.9\}/);
});

test("build v2: legenda da palavra grande fica fora da faixa colorida", () => {
  const reel = structuredClone(GANCHO);
  reel.cenas[0].dados.quadros[0] = { em: "Em", tipo: "palavra", texto: "3 *semanas*", sub: "DE SETEMBRO" };
  const r = montar(reel);
  build(r.dir);
  assert.match(r.html(), /<span class="qp-in">[^]*?<\/span><\/span><span class="qp-sub">DE SETEMBRO<\/span>/);
});

test("build v2: troca de cena tem clarão e whoosh", () => {
  const r = montar(GANCHO);
  build(r.dir, { sfx: SONS });
  const h = r.html();
  // cena 1 começa na palavra 10 (2,5 s) menos a antecipação de 0,08 s
  assert.match(h, /tl\.to\("#clarao",[^\n]*, 2\.42\);/);
  assert.match(h, /src="assets\/sfx\/whoosh[a-z-]*\.mp3" data-start="2\.3[0-9]*"/);
});

test("build v2: fundo vivo do tema anda do começo ao fim", () => {
  const r = montar(GANCHO);
  const out = build(r.dir);
  const h = r.html();
  assert.match(h, /<div id="fundo" class="fundo-manchas">/);
  assert.match(h, /tl\.fromTo\("#mancha0",/);
  assert.match(h, /id="tc1"/);
  assert.ok(out.total > 5);
});

test("build v2: palavra falada da legenda dá um pulo", () => {
  const r = montar(GANCHO);
  build(r.dir);
  assert.match(r.html(), /tl\.fromTo\("#w5",\{scale:1\.[0-9]+\},\{scale:1,[^\n]*, 1\.25\);/);
});

test("build v2: trilha entra cortada no tamanho do reel, abaixo da voz", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trilha-"));
  const tom = path.join(tmp, "tom.mp3");
  const g = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=30", tom]);
  assert.equal(g.status, 0);
  const r = montar({ ...GANCHO, trilha: { arquivo: tom, volume: 0.15 } });
  const out = build(r.dir);
  assert.match(r.html(), new RegExp(`<audio id="trilha" src="assets/trilha.mp3" data-start="0" data-duration="${out.total}" data-track-index="11" data-volume="0.15">`));
  const dur = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(r.dir, "assets", "trilha.mp3")], { encoding: "utf8" });
  assert.ok(Math.abs(Number(dur.stdout) - out.total) < 0.15, `trilha ${dur.stdout} x reel ${out.total}`);
});

test("build v2: sem trilha no tema avisa em vez de quebrar", () => {
  const r = montar({ ...GANCHO, trilha: { arquivo: "nao-existe.mp3" } });
  const out = build(r.dir);
  assert.ok(out.avisos.some((a) => /trilha/.test(a)));
  assert.doesNotMatch(r.html(), /id="trilha"/);
});

test("build v2: som limpo (sem ruído branco, impacto curto e chuva baixa)", () => {
  const reel = structuredClone(GANCHO);
  reel.cenas[0].batidas = [
    { em: "Em", tipo: "palavra", texto: "TRÊS *SEMANAS*" },
    { em: "Claude", tipo: "glitch" },
    { em: "Code", tipo: "tremor" },
    { em: "ia", tipo: "clarao" },
    { em: "gastar", tipo: "explosao" },
    { em: "muito", tipo: "chuva", item: "estrela" },
  ];
  const r = montar(reel);
  build(r.dir, { sfx: SONS });
  const sons = [...r.html().matchAll(/<audio id="sfx\d+" src="assets\/sfx\/([^"]+)\.mp3" data-start="[^"]+" data-duration="([^"]+)"[^>]*data-volume="([^"]+)"/g)]
    .map(([, nome, dur, vol]) => ({ nome, dur: Number(dur), vol: Number(vol) }));
  assert.ok(sons.length >= 5, `poucos sons: ${JSON.stringify(sons)}`);
  assert.ok(sons.some((s) => s.nome === "impact-curto"), "impacto curto tocando");
  assert.ok(sons.some((s) => s.nome === "glitch-curto"), "glitch curto tocando");
  for (const s of sons) {
    assert.ok(!["glitch-2", "impact-bass-1", "impact-bass-2"].includes(s.nome), `som barulhento no reel: ${s.nome}`);
    if (/impact|glitch/.test(s.nome)) assert.ok(s.dur <= 1, `${s.nome} dura ${s.dur}s`);
    if (s.nome === "sparkle" || s.nome === "moedas") assert.ok(s.vol <= 0.15, `${s.nome} no volume ${s.vol}`);
  }
});

const MUNDO = {
  titulo: "E SE O *SOL* SUMISSE",
  cenas: [
    // palavras: E(0) se(0.25) o(0.5) Sol(0.75) sumisse(1.0) agora(1.25)
    { tipo: "mundo", fala: "E se o Sol sumisse agora", dados: { hud: [{ rotulo: "o *Sol*", valor: "sumisse", em: "Sol" }] } },
    // palavras: A(1.5) luz(1.75) leva(2.0) oito(2.25) minutos(2.5)
    { tipo: "mundo", fala: "A luz leva oito minutos" },
    { tipo: "segue", fala: "Me segue," },
  ],
  mundo: { arquivo: "mundo.mjs", marcas: { some: [0, "sumisse"], luz: [1, "luz"] } },
};

test("build v2: mundo 3D entra atrás do palco, com as marcas resolvidas na fala e o relógio na timeline", () => {
  const r = montar(MUNDO, { "mundo.mjs": "export function criarMundo(){ return { render(){} }; }" });
  build(r.dir);
  const h = r.html();
  assert.match(h, /<canvas id="mundo3d" width="1080" height="1920"><\/canvas>/);
  assert.ok(h.indexOf('id="mundo3d"') < h.indexOf('id="s0"'), "canvas antes das cenas (fica atrás)");
  const dados = JSON.parse(h.match(/window\.__mundo = (\{.*\});/)[1]);
  assert.deepEqual(dados.marcas, { some: 1, luz: 1.75 });
  assert.equal(dados.cenas.length, 3);
  // import dinâmico dentro do try: erro no mundo.mjs vira __hfStartupError (o render para e diz por quê) em vez de travar
  assert.match(h, /try \{\s*const THREE = await import\("\.\/assets\/vendor\/three\.module\.min\.js"\);\s*const \{ criarMundo \} = await import\("\.\/mundo\.mjs"\);/);
  assert.match(h, /window\.__hfStartupError = "mundo 3D: "/);
  // criarMundo pode ser assíncrono (carregar imagem real como textura antes do render)
  assert.match(h, /const m = await criarMundo\(THREE, document\.getElementById\("mundo3d"\), window\.__mundo\);/);
  assert.match(h, /finally \{\s*window\.__mundoPronto\(\);/);
  assert.match(h, /window\.__hf\.buildReady\["mundo"\]/);
  assert.match(h, /tl\.to\(window\.__mundoClock,\{t:\d+(\.\d+)?,duration:\d+(\.\d+)?,ease:"none",onUpdate/);
  assert.match(h, /class="mn-hud"[\s\S]*?o <em>Sol<\/em>[\s\S]*?sumisse/);
  assert.ok(fs.existsSync(path.join(r.dir, "assets", "vendor", "three.core.min.js")));
});

test("build v2: marca do mundo com palavra fora da cena é erro, e reel sem mundo não ganha canvas", () => {
  const reel = structuredClone(MUNDO);
  reel.mundo.marcas.luz = [0, "luz"];
  assert.throws(() => build(montar(reel, { "mundo.mjs": "" }).dir), /marca "luz" do mundo: "luz" não está na fala da cena 0/);
  reel.mundo.marcas.luz = "luz";
  assert.throws(() => build(montar(reel, { "mundo.mjs": "" }).dir), /marca "luz" do mundo: use \[cena, palavra\]/);
  const r = montar(GANCHO);
  build(r.dir);
  assert.ok(!r.html().includes('<canvas id="mundo3d"'));
  assert.ok(!r.html().includes("criarMundo"));
});

test("build v2: reel com mundo 3D não ganha batida automática (a cena já se mexe; o brilho vira um feixe no meio do 3D)", () => {
  const reel = structuredClone(MUNDO);
  reel.cenas[1].fala = "A luz leva oito minutos pra chegar aqui e durante esse tempo tudo continua igual no céu azul do meio dia";
  const r = montar(reel, { "mundo.mjs": "export function criarMundo(){ return { render(){} }; }" });
  const res = build(r.dir);
  assert.equal(res.batidasAuto, 0);
  assert.ok(!r.html().includes('<span class="bt-brilho"'));
});

test("build v2: versão de teste muda o tema e aproxima a cena 3D; a do perfil fica igual", () => {
  const r = montar(MUNDO, { "mundo.mjs": "export function criarMundo(){ return { render(){} }; }" });
  build(r.dir);
  const perfil = r.html();
  assert.match(perfil, /<canvas id="mundo3d" width="1080" height="1920"><\/canvas>/);
  build(r.dir, { versao: "teste" });
  const teste = r.html();
  assert.notEqual(teste.match(/<body data-tema="([^"]+)"/)[1], perfil.match(/<body data-tema="([^"]+)"/)[1]);
  assert.match(teste, /<canvas id="mundo3d" width="1080" height="1920" style="transform:scale\(1\.\d+\)[^"]*"><\/canvas>/);
});

// Um parágrafo da gravação pode juntar "Me segue" e "comenta PALAVRA" (o teleprompter grava por parágrafo).
test("cena com \"antes\": um parágrafo vira duas telas (o segue até a palavra, o comenta no resto), igual a duas cenas", () => {
  const [g, f] = GANCHO.cenas;
  const separado = montar({ ...GANCHO, cenas: [g, f, { tipo: "segue", fala: "Me segue pra ver mais," }, { tipo: "comenta", fala: "e comenta PLANO aqui.", dados: { em: "comenta" } }] });
  const junto = montar({ ...GANCHO, cenas: [g, f, { tipo: "comenta", fala: "Me segue pra ver mais, e comenta PLANO aqui.", dados: { em: "comenta" }, antes: { tipo: "segue", ate: "mais" } }] });
  build(separado.dir);
  build(junto.dir);
  assert.match(junto.html(), /class="sg"/);
  assert.equal(junto.html(), separado.html());
});

test("cena com \"antes\": palavra de corte que não está na fala (ou é a última) para o build dizendo qual", () => {
  const [g] = GANCHO.cenas;
  for (const ate of ["seguir", "aqui"]) {
    const r = montar({ ...GANCHO, cenas: [g, { tipo: "comenta", fala: "Me segue e comenta PLANO aqui.", dados: { em: "comenta" }, antes: { tipo: "segue", ate } }] });
    assert.throws(() => build(r.dir), new RegExp(`antes\.ate.*"${ate}"`));
  }
});

test("cena com \"antes\": marca da cena 3D com começo de palavra (como o validador aceita) vai pra tela certa", () => {
  const mundo = "export default function (THREE, dados) { return { render() {} }; }\n";
  const reel = { trilha: false, palavra: "PLANO", mundo: { arquivo: "mundo.mjs", marcas: { obra: [0, "Constr"], fim: [0, "parar"] } },
    cenas: [{ tipo: "mundo", fala: "Construindo tudo agora sem parar", antes: { tipo: "mundo", ate: "tudo" } }, { tipo: "segue", fala: "Me segue," }, { tipo: "comenta", fala: "e comenta PLANO aqui.", dados: { em: "comenta" } }] };
  const r = montar(reel, { "mundo.mjs": mundo });
  build(r.dir);
  const marcas = JSON.parse(r.html().match(/window\.__mundo = (\{.*\});/)[1]).marcas;
  assert.deepEqual(marcas, { obra: 0, fim: r.words[4].s });
});

test("build v2: sem pasta de efeitos sonoros o reel monta sem nenhum <audio> de efeito", () => {
  const r = montar(GANCHO);
  build(r.dir, { sfx: path.join(os.tmpdir(), "nao-existe-sfx") });
  assert.doesNotMatch(r.html(), /id="sfx\d+"/);
  assert.ok(!fs.existsSync(path.join(r.dir, "assets", "sfx")) || fs.readdirSync(path.join(r.dir, "assets", "sfx")).length === 0);
});

// Revisão em contexto limpo da fase 1 (achados 1, 2, 4 e 7).
function tons(...freqs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tons-"));
  return freqs.map((f) => {
    const arq = path.join(dir, `tom-${f}.mp3`);
    assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=${f}:duration=20`, arq]).status, 0);
    return arq;
  });
}

test("revisão: versão de teste sem faixa fixada toca outra música do clima (com 2 faixas, sempre a outra)", () => {
  const [a, b] = tons(220, 330);
  const catalogo = [{ arquivo: a, clima: "passo" }, { arquivo: b, clima: "passo" }];
  for (const slug of ["r1", "r2-gratuito", "exemplo", "abc"]) {
    const r = montar({ ...GANCHO, slug, trilha: { clima: "passo" } });
    const perfil = build(r.dir, { catalogo, perfil: perfilDeTeste() });
    const teste = build(r.dir, { catalogo, perfil: perfilDeTeste(), versao: "teste" });
    assert.ok(perfil.trilha && teste.trilha, `${slug}: ${perfil.trilha} / ${teste.trilha}`);
    assert.notEqual(teste.trilha, perfil.trilha, slug);
  }
});

test("revisão: clima com acento ou maiúscula acha a faixa; clima desconhecido sem música avisa em vez de quebrar", () => {
  const [a] = tons(440);
  const r = montar({ ...GANCHO, trilha: { clima: "Descontraído" } });
  assert.equal(build(r.dir, { catalogo: [{ arquivo: a, clima: "descontraido" }], perfil: perfilDeTeste() }).trilha, a);
  const x = montar({ ...GANCHO, trilha: { clima: "tristeza" } });
  const out = build(x.dir, { catalogo: [], perfil: perfilDeTeste() });
  assert.doesNotMatch(x.html(), /id="trilha"/);
  assert.ok(out.avisos.some((m) => /tristeza/.test(m)), out.avisos.join(" | "));
});

test("revisão: montar de novo na mesma pasta sem foto, sem sons e sem trilha não deixa foto, sons nem música antiga", () => {
  const [a] = tons(550);
  const r = montar({ ...GANCHO, trilha: { arquivo: a } });
  build(r.dir, { perfil: perfilDeTeste({ foto: true }), sfx: SONS });
  assert.ok(fs.readdirSync(path.join(r.dir, "assets", "sfx")).length > 0);
  fs.writeFileSync(path.join(r.dir, "reel.json"), JSON.stringify({ ...GANCHO, trilha: false }));
  build(r.dir, { perfil: perfilDeTeste(), sfx: path.join(os.tmpdir(), "nao-existe-sfx") });
  assert.ok(!fs.existsSync(path.join(r.dir, "assets", "img")) || fs.readdirSync(path.join(r.dir, "assets", "img")).length === 0);
  assert.ok(!fs.existsSync(path.join(r.dir, "assets", "sfx")));
  assert.ok(!fs.existsSync(path.join(r.dir, "assets", "trilha.mp3")));
});

test("revisão: reel.autor de outra pessoa não herda a foto do perfil; campo null conta como ausente", () => {
  const r = montar({ ...GANCHO, autor: { nome: "Bruno Outro", user: "@bruno" } });
  build(r.dir, { perfil: perfilDeTeste({ foto: true }) });
  assert.doesNotMatch(r.html(), /<img src="assets\/img\//);
  assert.match(r.html(), /<span class="av-ini">BO<\/span>/);
  assert.match(r.html(), /<div class="sg-user">@bruno<\/div>/);
  const n = montar({ ...GANCHO, autor: { user: null } });
  build(n.dir, { perfil: perfilDeTeste() });
  assert.match(n.html(), /<div class="sg-user">@ana\.teste<\/div>/);
  assert.doesNotMatch(n.html(), /@null/);
});
