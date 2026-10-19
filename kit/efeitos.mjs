// Efeitos do kit: bonequinho do Claude, explosão, cérebro e efeitos sonoros.
// Tudo determinístico (PRNG com semente) e animado só por transform/opacity na timeline.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const KIT = path.dirname(fileURLToPath(import.meta.url));
export const SFX_DIR = path.join(KIT, "assets", "sfx");
const num = (x) => Math.round(x * 1000) / 1000;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- som ----------
export const SFX_VOL = {
  pop: 0.32, "pop-2": 0.32, "pop-3": 0.32, "pop-4": 0.32, "whoosh-short": 0.14, "impact-bass-1": 0.45, "key-press": 0.26, notification: 0.3, "click-soft": 0.3, sparkle: 0.28,
  "glitch-1": 0.22, riser: 0.18, chime: 0.25, click: 0.28, error: 0.26, "glitch-2": 0.2, "glitch-3": 0.2, "impact-bass-2": 0.3,
  ping: 0.26, typing: 0.2, whoosh: 0.16, "whoosh-cinematic": 0.16, moedas: 0.14,
  // Impacto e glitch longos (ronco grave contínuo, ruído branco) viram ruído no reel: o kit pede as versões curtas.
  "impact-curto": 0.5, "glitch-curto": 0.35,
};

// Os efeitos são opcionais: o kit toca só os que existem na pasta (um .mp3 por nome, ex.: pop.mp3, whoosh-short.mp3).
// A duração de cada um é medida com ffprobe na primeira vez que ele é usado.
export function bancoDeSons(dir = SFX_DIR, { ffprobe = "ffprobe" } = {}) {
  const existentes = new Set(fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".mp3")).map((f) => f.slice(0, -4)) : []);
  const duracoes = new Map();
  const avisos = new Set();
  const dur = (nome) => {
    if (!duracoes.has(nome)) {
      const r = spawnSync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(dir, `${nome}.mp3`)], { encoding: "utf8" });
      if (r.error) avisos.add(`${ffprobe} não rodou (${r.error.code ?? r.error.message}): os efeitos sonoros ficam de fora (instale o FFmpeg, que traz o ffprobe)`);
      const d = Number(String(r.stdout ?? "").trim());
      if (!r.error && !(d > 0)) avisos.add(`efeito ${nome}.mp3 ilegível: fica de fora`);
      duracoes.set(nome, Number.isFinite(d) && d > 0 ? d : 0);
    }
    return duracoes.get(nome);
  };
  return { dir, tem: (nome) => existentes.has(nome) && dur(nome) > 0, dur, nomes: () => [...existentes], avisos: () => [...avisos] };
}

// Cada efeito vira um <audio> próprio; trilhas distribuídas para nunca sobrepor na mesma faixa.
// O mesmo som duas vezes em menos de 0,08 s vira um só (batidas que caem juntas não somam volume).
// "pop" toca em rodízio entre os pops que existirem (até 4), pra não cansar de ouvir o mesmo.
export const POPS = ["pop", "pop-2", "pop-3", "pop-4"];

export function sfxAudio(events, total, sons = bancoDeSons()) {
  const tracks = [];
  const ultimo = {};
  const pops = POPS.filter((p) => sons.tem(p));
  let kp = 0;
  return events
    .filter((e) => e.t < total - 0.05 && (e.nome === "pop" ? pops.length > 0 : sons.tem(e.nome)))
    .sort((a, b) => a.t - b.t)
    .filter((e) => {
      const repetido = ultimo[e.nome] != null && e.t - ultimo[e.nome] < 0.08;
      if (!repetido) ultimo[e.nome] = e.t;
      return !repetido;
    })
    .map((e) => (e.nome === "pop" ? { ...e, nome: pops[kp++ % pops.length] } : e))
    .map((e, k) => {
      const dur = num(Math.min(sons.dur(e.nome), total - e.t));
      let tr = tracks.findIndex((end) => end <= e.t);
      if (tr === -1) tr = tracks.push(0) - 1;
      tracks[tr] = e.t + dur + 0.01;
      return `<audio id="sfx${k}" src="assets/sfx/${e.nome}.mp3" data-start="${num(e.t)}" data-duration="${dur}" data-track-index="${20 + tr}" data-volume="${e.vol ?? SFX_VOL[e.nome]}"></audio>`;
    })
    .join("\n  ");
}

// ---------- bonequinho (o mascote pixel do Claude Code) ----------
// Desenho em "meio bloco" como aparece no terminal do Claude Code: 18 colunas x 5 linhas, pixel 12x22.
const CLAWD = ["000111111111111000", "000110111111011000", "011111111111111110", "000111111111111000", "000010100001010000"];
const PX = 12;
const PY = 22;

export function mascoteHtml(rotulos) {
  const rects = [];
  CLAWD.forEach((row, y) =>
    [...row].forEach((c, x) => c === "1" && rects.push(`<rect x="${x * PX}" y="${y * PY}" width="${PX + 0.5}" height="${PY + 0.5}"/>`)),
  );
  const olhos = `<rect class="olho" x="${5 * PX}" y="${PY}" width="${PX + 0.5}" height="${PY + 0.5}"/><rect class="olho" x="${12 * PX}" y="${PY}" width="${PX + 0.5}" height="${PY + 0.5}"/>`;
  return `<div id="masc"><div id="masc-tag">${rotulos.map((r, k) => `<span class="mt" id="mt${k}">${esc(r)}</span>`).join("")}</div>
    <div id="masc-corpo"><svg width="${18 * PX}" height="${5 * PY}" viewBox="0 0 ${18 * PX} ${5 * PY}" fill="#d97757">${rects.join("")}<g id="masc-olhos" opacity="0">${olhos}</g></svg></div></div>`;
}

// Etiqueta por cena (sc.mascote = "TEXTO"), some com sc.mascote = false; pula a cada corte e pisca.
export function mascote(reel, scenes, total, opts = {}) {
  const padrao = reel.mascote_rotulo ?? "CLAUDE";
  let atual = padrao;
  const plano = scenes.map((sc) => {
    const off = sc.mascote === false || (sc.mascote == null && sc.tipo === "comenta");
    if (typeof sc.mascote === "string") atual = sc.mascote;
    return { sc, on: !off, rotulo: atual };
  });
  const rotulos = [...new Set(plano.map((p) => p.rotulo))];
  const html = mascoteHtml(rotulos);
  const anim = (tl) => {
    plano.forEach(({ sc, on, rotulo }, i) => {
      const k = rotulos.indexOf(rotulo);
      const prev = i > 0 ? plano[i - 1] : null;
      if (i === 0) {
        if (!on) tl.add(`gsap.set("#masc",{opacity:0})`, 0);
        tl.add(`gsap.set("#mt${k}",{opacity:1})`, 0);
      } else {
        if (on !== prev.on) tl.add(`gsap.set("#masc",{opacity:${on ? 1 : 0}})`, sc.t0);
        if (rotulo !== prev.rotulo) {
          tl.add(`gsap.set("#mt${rotulos.indexOf(prev.rotulo)}",{opacity:0})`, sc.t0);
          tl.add(`gsap.set("#mt${k}",{opacity:1})`, sc.t0);
        }
        if (on) tl.add(`gsap.to("#masc-corpo",{keyframes:[{y:-30,duration:0.13,ease:"power2.out"},{y:0,duration:0.2,ease:"bounce.out"}]})`, sc.t0 + 0.05);
      }
    });
    for (let t = 1.4; t < total - 0.3; t += 2.9) {
      tl.add(`gsap.set("#masc-olhos",{opacity:1})`, num(t));
      tl.add(`gsap.set("#masc-olhos",{opacity:0})`, num(t + 0.13));
    }
    // Gancho: o bonequinho começa grande e encolhe pro canto.
    // Só quando o 1º quadro é gráfico (grande ele cobriria texto do canto de baixo) e encolhe antes do 2º quadro.
    const q = scenes[0]?.dados?.quadros ?? [];
    if (scenes[0]?.tipo === "hook" && plano[0].on && (!q.length || (["palavra", "logo", "icone"].includes(q[0].tipo) && !q[0].rotulo && !q[0].sub))) {
      const t2 = q.length > 1 ? (opts.tempoQuadro?.(1) ?? 2.4) : 2.4;
      const encolhe = num(Math.max(0.8, Math.min(2.4, t2 - 0.18, scenes[0].t1 - 0.3)));
      tl.add(`gsap.set("#masc",{scale:1.9})`, 0);
      tl.add(`gsap.to("#masc",{scale:1,duration:0.42,ease:"back.out(1.6)"})`, encolhe, "whoosh-short", 0.12);
    }
  };
  return { html, anim, usado: plano.some((p) => p.on) };
}

// ---------- explosão ----------
const CORES = ["#e0ae3a", "#e9c247", "#f4efe7", "#d97757", "#c7c1b6"];
// Cacos em SVG (clip-path em muitos elementos faz a captura do HyperFrames sair preta).
const FORMAS = ["50,0 100,100 0,100", "0,0 100,20 70,100", "20,0 100,40 50,100 0,60", "0,30 100,0 80,100"];

export function explosaoHtml(id, seed, cores = CORES) {
  const r = prng(seed);
  const cacos = [...Array(24)].map((_, j) => {
    const s = Math.round(22 + r() * 40);
    return `<span class="caco" id="${id}c${j}" style="width:${s}px;height:${s}px;margin:${-s / 2}px 0 0 ${-s / 2}px"><svg width="${s}" height="${s}" viewBox="0 0 100 100"><polygon points="${FORMAS[j % FORMAS.length]}" fill="${cores[j % cores.length]}"/></svg></span>`;
  });
  return `<div class="boom-flash" id="${id}f"></div><div class="boom" id="${id}"><span class="onda" id="${id}o"></span><span class="onda onda2" id="${id}o2"></span>${cacos.join("")}</div>`;
}

export function explosaoAnim(tl, id, t, seed, alvo, miolo) {
  const r = prng(seed);
  tl.add(`gsap.set("#${id}",{opacity:1})`, t, "impact-curto");
  tl.add(`gsap.set("#${id}",{opacity:0})`, num(t + 1.35));
  tl.add(`gsap.to("#${id}f",{keyframes:[{opacity:0.85,duration:0.04},{opacity:0,duration:0.3}]})`, t);
  tl.add(`gsap.fromTo("#${id}o",{scale:0.2,opacity:1},{scale:9,opacity:0,duration:0.6,ease:"power2.out"})`, t);
  tl.add(`gsap.fromTo("#${id}o2",{scale:0.2,opacity:0.7},{scale:6,opacity:0,duration:0.8,ease:"power2.out"})`, num(t + 0.08));
  for (let j = 0; j < 24; j++) {
    const ang = (j / 24) * Math.PI * 2 + r() * 0.5;
    const dist = 280 + r() * 380;
    const dx = Math.round(Math.cos(ang) * dist);
    const dy = Math.round(Math.sin(ang) * dist + 120 * r());
    const rot = Math.round((r() - 0.5) * 900);
    const dur = num(0.75 + r() * 0.5);
    tl.add(`gsap.fromTo("#${id}c${j}",{x:0,y:0,rotation:0,scale:1.2},{x:${dx},y:${dy},rotation:${rot},scale:0.5,duration:${dur},ease:"power3.out"})`, t);
    tl.add(`gsap.to("#${id}c${j}",{opacity:0,duration:${num(dur * 0.4)},ease:"power1.in"})`, num(t + dur * 0.6));
  }
  if (alvo) tl.add(`gsap.to("${alvo}",{opacity:0,scale:1.25,duration:0.12})`, t);
  if (miolo) tl.add(`gsap.to("${miolo}",{keyframes:[{x:-22,duration:0.04},{x:18,duration:0.05},{x:-12,duration:0.05},{x:6,duration:0.05},{x:0,duration:0.06}]})`, t);
}

// ---------- cérebro ----------
const BRAIN = [
  "M40 110 C20 105 12 85 20 68 C14 50 26 30 46 30 C52 16 72 10 88 18 C100 8 124 8 136 20 C154 16 172 28 172 46 C186 54 190 74 180 88 C186 104 174 120 156 120 C150 132 132 138 118 130 C110 142 88 144 78 132 C64 138 46 132 44 120 C40 118 38 114 40 110 Z",
  "M60 40 C70 48 66 60 76 64",
  "M96 26 C92 40 104 46 100 58",
  "M130 32 C122 44 134 52 128 64",
  "M150 50 C140 58 152 70 142 80",
  "M40 70 C54 72 58 84 50 94",
  "M72 80 C84 76 92 88 104 84",
  "M116 74 C126 86 140 84 150 96",
  "M86 106 C96 98 108 108 118 102",
  "M100 18 C104 60 96 100 100 136",
];
const NOS = [[60, 52], [96, 40], [130, 46], [150, 72], [56, 86], [92, 78], [124, 90], [102, 112], [146, 104], [74, 112]];
const ESC = 2.8;
const LIG = [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 8], [7, 9], [1, 5], [3, 8]];

export function cerebro(sc, ctx, helpers) {
  const d = sc.dados ?? {};
  const p = `s${sc.i}`;
  const { icon } = helpers;
  const chips = [].concat(d.rotulos ?? []);
  const html = `<div class="cb">
    <div class="cb-brain" id="${p}-brain">
      <svg width="${200 * ESC}" height="${160 * ESC}" viewBox="0 0 200 160" fill="none" stroke="#e0ae3a" stroke-width="2.4" stroke-linecap="round">${BRAIN.map((dd, k) => `<path d="${dd}"${k === 0 ? ' fill="rgba(224,174,58,0.07)"' : ""}/>`).join("")}</svg>
      ${NOS.map(([x, y], k) => `<span class="no" id="${p}-n${k}" style="left:${x * ESC - 11}px;top:${y * ESC - 11}px"></span>`).join("")}
      ${LIG.map(([a], k) => `<span class="sinapse" id="${p}-y${k}" style="left:${NOS[a][0] * ESC - 7}px;top:${NOS[a][1] * ESC - 7}px"></span>`).join("")}
    </div>
    ${d.arquivo ? `<div class="cb-doc" id="${p}-doc">${icon("contexto", 44)}<span>${esc(d.arquivo)}</span></div>` : ""}
    ${chips.map((c, k) => `<div class="cb-chip cb-chip${k % 4}" id="${p}-ch${k}">${esc(c)}</div>`).join("")}
  </div>`;
  return {
    html,
    anim(tl, sc, at) {
      const t0 = sc.t0;
      if (sc.i !== 0) tl.add(`gsap.fromTo("#${p}-brain",{x:640,rotation:14,opacity:0},{x:0,rotation:0,opacity:1,duration:0.6,ease:"power3.out"})`, t0, "whoosh-short");
      const ta = Math.max(t0 + 0.9, at(d.em, 0.4));
      if (d.arquivo) {
        tl.add(`gsap.fromTo("#${p}-doc",{opacity:0,y:40},{opacity:1,y:0,duration:0.3,ease:"power2.out"})`, num(t0 + 0.35));
        tl.add(`gsap.to("#${p}-doc",{x:300,y:-250,scale:0.15,opacity:0,duration:0.45,ease:"power2.in"})`, num(ta - 0.45));
      }
      tl.add(`gsap.to("#${p}-brain",{keyframes:[{scale:1.08,duration:0.1},{scale:1,duration:0.35,ease:"elastic.out(1,0.4)"}]})`, num(ta), "sparkle");
      NOS.forEach((_, k) =>
        tl.add(`gsap.fromTo("#${p}-n${k}",{scale:0.4,opacity:0.25},{scale:1,opacity:1,duration:0.25,ease:"back.out(3)"})`, num(ta + k * 0.04)),
      );
      const reps = Math.max(0, Math.floor((sc.t1 - ta - 0.3) / 0.7) - 1);
      LIG.forEach(([a, b], k) => {
        const dx = num((NOS[b][0] - NOS[a][0]) * ESC);
        const dy = num((NOS[b][1] - NOS[a][1]) * ESC);
        tl.add(`gsap.set("#${p}-y${k}",{opacity:1})`, num(ta + 0.1));
        tl.add(`gsap.fromTo("#${p}-y${k}",{x:0,y:0},{x:${dx},y:${dy},duration:0.7,ease:"sine.inOut",yoyo:true,repeat:${reps},delay:${num((k % 3) * 0.12)}})`, num(ta + 0.1));
      });
      chips.forEach((_, k) =>
        tl.add(`gsap.fromTo("#${p}-ch${k}",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.3,ease:"back.out(2)"})`, num(Math.max(ta + 0.2 + k * 0.25, at([].concat(d.chips_em ?? [])[k], 0)))),
      );
    },
  };
}
