// Mundo 3D (Three.js) atrás do palco: uma cena contínua do assunto acontecendo (bom pros reels "E se...").
// Cada reel traz o seu
// `mundo.mjs` (export function criarMundo(THREE, canvas, dados) -> { render(t) }) e o kit:
//  - resolve as marcas [cena, palavra] do reel.json em segundos (a cena reage à fala, como as batidas);
//  - põe um canvas 1080x1920 atrás das cenas;
//  - dirige render(t) por um relógio linear na timeline pausada do GSAP (o seek do HyperFrames move o
//    relógio, o relógio chama render) e segura o render até a cena montar (window.__hf.buildReady).
import { norm, tokens } from "./texto.mjs";
import { num, rich } from "./html.mjs";

// Tempo da 1ª palavra da cena que casa com a âncora (igual, ou começo de palavra com 4+ letras).
function tempoNaCena(sc, words, palavra) {
  const want = norm(tokens(palavra)[0] ?? "");
  for (let j = sc.range[0]; j < sc.range[1]; j++) {
    const n = norm(words[j].w);
    if (want && (n === want || (want.length >= 4 && n.startsWith(want)))) return num(Math.max(sc.t0, words[j].s));
  }
  return null;
}

export function prepararMundo(reel, scenes, words, total) {
  const cfg = reel.mundo;
  if (!cfg) return null;
  const arquivo = cfg.arquivo ?? "mundo.mjs";
  const marcas = {};
  for (const [nome, par] of Object.entries(cfg.marcas ?? {})) {
    if (!Array.isArray(par) || par.length !== 2) throw new Error(`marca "${nome}" do mundo: use [cena, palavra]`);
    const [ci, palavra] = par;
    const sc = scenes[ci];
    if (!sc) throw new Error(`marca "${nome}" do mundo: cena ${ci} não existe`);
    const t = tempoNaCena(sc, words, palavra);
    if (t == null) throw new Error(`marca "${nome}" do mundo: "${palavra}" não está na fala da cena ${ci}`);
    marcas[nome] = t;
  }
  const dados = { total, marcas, cenas: scenes.map((s) => ({ tipo: s.tipo, t0: s.t0, t1: s.t1 })) };
  // Versão de teste (kit/versao.mjs): a mesma cena 3D, mais perto e um pouco mais alta.
  const enq = reel.mundo_enquadramento;
  const estilo = enq ? ` style="transform:scale(${enq.zoom ?? 1}) translateY(${enq.y ?? 0}%);transform-origin:50% 45%"` : "";
  return {
    marcas,
    canvas: `<canvas id="mundo3d" width="1080" height="1920"${estilo}></canvas>`,
    prelude: [
      `window.__mundo = ${JSON.stringify(dados)};`,
      `window.__mundoClock = { t: 0 };`,
      `window.__hf = window.__hf || {};`,
      `window.__hf.buildReady = window.__hf.buildReady || {};`,
      `window.__hf.buildReady["mundo"] = new Promise((r) => { window.__mundoPronto = r; });`,
    ].join("\n"),
    relogio: `tl.to(window.__mundoClock,{t:${num(total)},duration:${num(total)},ease:"none",onUpdate:()=>window.__mundoRender&&window.__mundoRender(window.__mundoClock.t)}, 0);`,
    // Import dinâmico dentro do try: se o mundo.mjs não carrega ou quebra, o render para com o motivo
    // (window.__hfStartupError) em vez de ficar esperando o buildReady ou sair sem a cena 3D.
    modulo: `<script type="module">
try {
  const THREE = await import("./assets/vendor/three.module.min.js");
  const { criarMundo } = await import("./${arquivo}");
  if (typeof criarMundo !== "function") throw new Error("${arquivo} não exporta criarMundo");
  const m = await criarMundo(THREE, document.getElementById("mundo3d"), window.__mundo);
  window.__mundoRender = (t) => m.render(t);
  window.addEventListener("hf-seek", (e) => window.__mundoRender(e.detail.time));
  window.__mundoRender(window.__mundoClock.t);
} catch (e) {
  console.error("mundo 3D: " + (e && e.message));
  window.__hfStartupError = "mundo 3D: " + (e && e.message);
} finally {
  window.__mundoPronto();
}
</script>`,
  };
}

// Cena "mundo": o palco fica vazio pra cena 3D aparecer; opcional `dados.hud` = painel de números no canto
// ([{ rotulo, valor, em }], cada linha entra na palavra `em`).
export function tipoMundo(sc) {
  const d = sc.dados ?? {};
  const p = `s${sc.i}`;
  const hud = d.hud ?? [];
  const html = hud.length
    ? `<div class="mn-hud">${hud.map((h, k) => `<div class="mn-it" id="${p}-h${k}"><div class="mn-rot">${rich(h.rotulo ?? "")}</div><div class="mn-val">${rich(h.valor ?? "")}</div></div>`).join("")}</div>`
    : `<div class="mn"></div>`;
  return {
    html,
    anim(tl, sc, at, ev) {
      hud.forEach((h, k) => {
        const t = at(h.em, 0.05 + k * 0.1);
        tl.add(`gsap.fromTo("#${p}-h${k}",{opacity:0,x:-60},{opacity:1,x:0,duration:0.3,ease:"power3.out"})`, t, "pop", 0.24);
        ev(t, false);
      });
    },
  };
}
