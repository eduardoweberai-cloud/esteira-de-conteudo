// Gramática do kit (reels que seguram atenção trocam algo grande na tela a cada 1,6 a 1,7 s):
//  - quadros: o palco do gancho troca de visual na palavra falada (palavra grande, logo, contador, calendário...);
//  - cabs: o cabeçalho da cena troca na palavra falada;
//  - batidas: pontuação por cima (carimbo, palavra, explosão, chuva, zoom, clarão...);
//  - auto: o que preenche os vãos que sobram (brilho, zoom, pulso), para nada ficar parado mais de 1,4 s.
// Cada função devolve HTML e, na timeline, registra o instante de cada mudança grande com ev(t).
import { esc, rich, num, icon, logo, stamp } from "./html.mjs";
import { prng, explosaoHtml, explosaoAnim } from "./efeitos.mjs";

// ---------- quadros (gancho) ----------
const fmtNum = (n) => Number(n).toLocaleString("pt-BR");

// Odômetro: cada dígito é uma fita que gira; os da direita dão mais voltas (parece contador correndo).
function odometro(id, texto, alturaPx) {
  const chars = [...texto];
  const digitos = chars.filter((c) => /\d/.test(c)).length;
  let k = 0;
  const fitas = [];
  const html = chars
    .map((ch) => {
      if (!/\d/.test(ch)) return `<span class="od-sep">${esc(ch)}</span>`;
      const voltas = digitos - k;
      const n = voltas * 10 + 10;
      fitas.push({ id: `${id}-d${k}`, alvo: voltas * 10 + Number(ch) });
      return `<span class="od-dig"><span class="od-fita" id="${id}-d${k++}">${[...Array(n)].map((_, m) => `<span>${m % 10}</span>`).join("")}</span></span>`;
    })
    .join("");
  return { html, fitas, altura: alturaPx };
}

// Faixa de palavra é uma linha só: texto longo saía da tela de 1080. Encolhe a fonte no build para caber em 1000 px,
// pela largura medida das fontes do kit: Press Start 2P (fliperama) = 1 em por letra; Hanken em caixa alta ~0,65 em (0,7 com folga;
// 0,67 no quadro do gancho, que tem letter-spacing -0.03em).
const FAIXA = { bt: { base: 118, pad: 88, em: 0.7, pixel: { base: 92, pad: 216, em: 1 } }, qp: { base: 150, pad: 88, em: 0.67, pixel: { base: 92, pad: 128, em: 1 } } };
export function fonteDaFaixa(texto, tema, tipo = "bt") {
  const f = tema === "fliperama" ? FAIXA[tipo].pixel : FAIXA[tipo];
  const letras = String(texto ?? "").replace(/\*/g, "").length;
  if (!letras) return null;
  const cabe = Math.floor((1000 - f.pad) / (letras * f.em));
  return cabe < f.base ? cabe : null;
}
const estiloFaixa = (texto, ctx, tipo) => {
  const px = fonteDaFaixa(texto, ctx?.tema?.nome, tipo);
  return px ? ` style="font-size:${px}px"` : "";
};

export const QUADROS = {
  palavra: (q, id, ctx) => ({
    html: `<div class="qp"><span class="qp-in"><span class="qp-faixa-w"><span class="qp-faixa" id="${id}-f"></span></span><span class="qp-txt" id="${id}-t"${estiloFaixa(q.texto, ctx, "qp")}>${rich(q.texto)}</span></span>${q.sub ? `<span class="qp-sub">${rich(q.sub)}</span>` : ""}</div>`,
    anim(tl, t) {
      tl.add(`gsap.fromTo("#${id}-f",{scaleX:0},{scaleX:1,duration:0.24,ease:"power3.out"})`, num(t + 0.04));
      tl.add(`gsap.fromTo("#${id}-t",{scale:1},{scale:1.05,duration:0.9,ease:"sine.inOut",yoyo:true,repeat:1})`, num(t + 0.3));
    },
    som: "whoosh-short",
  }),
  logo: (q, id) => ({
    html: `<div class="qt"><span class="qt-anel" id="${id}-a"></span><div class="qt-tile qt-${esc(q.logo)}">${logo(q.logo, 270)}</div>${q.rotulo ? `<div class="qt-rot">${rich(q.rotulo)}</div>` : ""}</div>`,
    anim(tl, t) {
      tl.add(`gsap.fromTo("#${id}-a",{rotation:0},{rotation:360,duration:6,ease:"none"})`, t);
    },
    som: "pop",
  }),
  icone: (q, id) => ({
    html: `<div class="qt"><span class="qt-anel" id="${id}-a"></span><div class="qt-tile qt-ico">${icon(q.icone, 250, 1.3)}</div>${q.rotulo ? `<div class="qt-rot">${rich(q.rotulo)}</div>` : ""}</div>`,
    anim(tl, t) {
      tl.add(`gsap.fromTo("#${id}-a",{rotation:0},{rotation:360,duration:6,ease:"none"})`, t);
    },
    som: "pop",
  }),
  contador: (q, id) => {
    const od = odometro(id, fmtNum(q.ate), 230);
    return {
      html: `<div class="qc">${q.rotulo ? `<div class="qc-rot">${rich(q.rotulo)}</div>` : ""}<div class="qc-num" id="${id}-n">${q.prefixo ? `<span class="qc-fix">${esc(q.prefixo.trim())}</span>` : ""}${od.html}${q.sufixo ? `<span class="qc-fix">${esc(q.sufixo)}</span>` : ""}</div></div>`,
      anim(tl, t, ev, at) {
        const fim = Math.max(t + 0.6, q.ate_em ? at(q.ate_em, 0) : t + (q.dur ?? 1.2));
        od.fitas.forEach((f, k) =>
          tl.add(`gsap.fromTo("#${f.id}",{y:0},{y:${-f.alvo * od.altura},duration:${num(fim - t - k * 0.04)},ease:"power2.out"})`, num(t + 0.05)),
        );
        tl.add(`gsap.fromTo("#${id}-n",{scale:1},{keyframes:[{scale:1.14,duration:0.08},{scale:1,duration:0.3,ease:"back.out(3)"}]})`, num(fim), "ping", 0.3);
        tl.som("typing", num(t + 0.05), 0.2);
        ev(fim);
      },
      som: "pop",
    };
  },
  calendario: (q, id) => {
    const [a, b] = q.dias ?? [1, 7];
    const total = q.total ?? new Date(q.ano ?? 2026, q.mes_num ?? 9, 0).getDate();
    const primeiro = new Date(q.ano ?? 2026, (q.mes_num ?? 9) - 1, 1).getDay();
    const celulas = [...Array(primeiro)].map(() => `<span class="qd-c qd-vazio"></span>`);
    for (let d = 1; d <= total; d++) {
      const on = d >= a && d <= b;
      celulas.push(`<span class="qd-c${on ? " qd-on" : ""}"${on ? ` id="${id}-c${d}"` : ""}><span class="qd-luz"${on ? ` id="${id}-l${d}"` : ""}>${on ? d : ""}</span><span class="qd-n">${d}</span></span>`);
    }
    return {
      html: `<div class="qd"><div class="qd-mes">${rich(q.mes ?? "")}</div><div class="qd-sem">${["D", "S", "T", "Q", "Q", "S", "S"].map((x) => `<span>${x}</span>`).join("")}</div><div class="qd-grade">${celulas.join("")}</div></div>`,
      anim(tl, t, ev) {
        const passo = Math.min(0.045, 0.9 / Math.max(1, b - a + 1));
        for (let d = a; d <= b; d++) {
          const td = num(t + 0.2 + (d - a) * passo);
          // acende crescendo (sem transparência: o número nunca fica com contraste pela metade)
          tl.add(`gsap.fromTo("#${id}-l${d}",{scale:0},{scale:1,duration:0.18,ease:"back.out(2.5)"})`, td);
        }
        ev(num(t + 0.2 + (b - a) * passo), false);
      },
      som: "pop",
    };
  },
  barras: (q, id) => {
    const itens = q.itens ?? [];
    const max = Math.max(...itens.map((x) => Number(x.valor) || 0), 1);
    return {
      html: `<div class="qb">${itens
        .map(
          (x, k) => `<div class="qb-linha"><div class="qb-rot">${rich(x.rotulo)}</div><div class="qb-trilho"><span class="qb-fill qb-fill${k % 2}" id="${id}-b${k}" style="width:${Math.max(3.5, (Number(x.valor) / max) * 100).toFixed(2)}%"></span></div><div class="qb-val" id="${id}-v${k}">${rich(x.texto ?? fmtNum(x.valor))}</div></div>`,
        )
        .join("")}</div>`,
      anim(tl, t, ev) {
        itens.forEach((_, k) => {
          const tk = num(t + 0.15 + k * 0.32);
          tl.add(`gsap.fromTo("#${id}-b${k}",{scaleX:0},{scaleX:1,duration:0.5,ease:"power3.out"})`, tk, k ? "pop" : null);
          tl.add(`gsap.fromTo("#${id}-v${k}",{opacity:0,x:-20},{opacity:1,x:0,duration:0.22})`, num(tk + 0.35));
        });
        ev(num(t + 0.15 + (itens.length - 1) * 0.32));
      },
      som: "whoosh-short",
    };
  },
};
export const TIPOS_QUADRO = Object.keys(QUADROS);

export function quadrosDe(sc) {
  const lista = sc.dados?.quadros ?? [];
  lista.forEach((q, k) => {
    if (!QUADROS[q.tipo]) throw new Error(`quadro ${k} da cena ${sc.i}: tipo "${q.tipo}" não existe (${TIPOS_QUADRO.join(", ")})`);
  });
  return lista;
}

export function quadrosHtml(sc, ctx) {
  const lista = quadrosDe(sc);
  if (!lista.length) return { html: "", partes: [] };
  const partes = lista.map((q, k) => ({ q, id: `s${sc.i}-q${k}`, ...QUADROS[q.tipo](q, `s${sc.i}-q${k}`, ctx) }));
  return { html: `<div class="quadros">${partes.map((p) => `<div class="quadro q-${p.q.tipo}" id="${p.id}">${p.html}</div>`).join("")}</div>`, partes };
}

export function quadrosAnim(tl, sc, at, ev, partes) {
  const tempos = partes.map((p, k) => (k === 0 && !p.q.em ? sc.t0 : at(p.q.em, k / partes.length)));
  partes.forEach((p, k) => {
    const t = tempos[k];
    const abre = sc.i === 0 && k === 0 && t <= 0.05;
    tl.add(`gsap.fromTo("#${p.id}",{opacity:0,scale:1.45,y:30},{opacity:1,scale:1,y:0,duration:0.3,ease:"back.out(1.7)"})`, t, abre ? "impact-curto" : p.som, abre ? 0.5 : undefined);
    if (abre) tl.add(`gsap.to("#clarao",{keyframes:[{opacity:0.7,duration:0.05},{opacity:0,duration:0.32}]})`, num(t + 0.02));
    ev(t);
    p.anim(tl, t, ev, at);
    const prox = tempos[k + 1];
    if (prox == null) return;
    if (p.q.canto) {
      // fica no canto como contexto e sai quando entra o quadro seguinte ao próximo (antes que encoste nele)
      tl.add(`gsap.to("#${p.id}",{x:-330,y:-235,scale:0.34,duration:0.32,ease:"power3.inOut"})`, num(prox - 0.04));
      const depois = tempos[k + 2];
      if (depois != null) tl.add(`gsap.to("#${p.id}",{opacity:0,duration:0.14})`, num(depois - 0.1));
    } else tl.add(`gsap.to("#${p.id}",{opacity:0,scale:0.7,y:-50,duration:0.16,ease:"power2.in"})`, num(Math.max(t + 0.34, prox - 0.08)));
  });
  return tempos;
}

// Tempo de cada quadro do gancho (o mascote encolhe antes do 2º).
export function temposQuadros(sc, at) {
  return quadrosDe(sc).map((q, k) => (k === 0 && !q.em ? sc.t0 : at(q.em, k / Math.max(1, quadrosDe(sc).length))));
}

// ---------- cabeçalhos que trocam ----------
export function cabsDe(sc, padrao) {
  const fixo = sc.header ?? padrao;
  return [...(fixo ? [{ t: fixo, em: null }] : []), ...(sc.cabs ?? [])];
}

export function cabsHtml(sc, lista, grande) {
  if (!lista.length) return "";
  return `<div class="cabs${grande ? " cabs-grande" : ""}">${lista
    .map((c, k) => {
      const id = `s${sc.i}-cab${k}`;
      return `<div class="cab" id="${id}"><span class="cab-in"><span class="cab-txt" id="${id}-t">${rich(c.t)}</span><span class="cab-faixa" id="${id}-f"></span></span></div>`;
    })
    .join("")}</div>`;
}

export function cabsAnim(tl, sc, at, ev, lista) {
  const tempos = lista.map((c, k) => (c.em == null ? sc.t0 : at(c.em, k / lista.length)));
  lista.forEach((c, k) => {
    const id = `s${sc.i}-cab${k}`;
    const t = tempos[k];
    tl.add(`gsap.set("#${id}",{opacity:1})`, t, c.em == null ? null : "pop", 0.24);
    tl.add(`gsap.fromTo("#${id}-t",{opacity:0,y:34,scale:1.18},{opacity:1,y:0,scale:1,duration:0.22,ease:"back.out(2)"})`, t);
    tl.add(`gsap.fromTo("#${id}-f",{scaleX:0},{scaleX:1,duration:0.26,ease:"power3.out"})`, num(t + 0.05));
    if (c.em != null) ev(t, false);
    const prox = tempos[k + 1];
    if (prox != null) tl.add(`gsap.to("#${id}",{opacity:0,y:-22,duration:0.1})`, num(Math.max(t + 0.2, prox - 0.1)));
  });
}

// ---------- batidas ----------
// Semente e giro do carimbo saem do id: o HTML e a animação da mesma batida sorteiam igual.
export const semente = (id) => [...String(id)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const rotDe = (id) => (semente(id) % 13) - 6;
const MOEDA = `<svg width="86" height="86" viewBox="0 0 86 86"><circle cx="43" cy="43" r="40" fill="#f6c443" stroke="#b07c12" stroke-width="5"/><circle cx="43" cy="43" r="29" fill="none" stroke="#d9a21f" stroke-width="3"/><path d="M50 30 C47 26 39 25 36 29 C32 34 37 38 43 40 C50 42 55 46 51 53 C47 59 38 58 34 53 M43 21 V65" fill="none" stroke="#3d2400" stroke-width="6" stroke-linecap="round"/></svg>`;

const ESTRELA = `<svg width="84" height="84" viewBox="0 0 100 100"><polygon points="50,4 62,36 96,38 69,59 79,93 50,74 21,93 31,59 4,38 38,36" fill="#ffd60a" stroke="#a77a00" stroke-width="4" stroke-linejoin="round"/></svg>`;

export const BATIDAS = {
  selo: {
    html: (b, id) => `<div class="selo bt-selo pos-${b.pos ?? "dir"}" id="${id}">${esc(b.texto)}</div>`,
    anim(tl, b, id, t, ev, ctx) {
      tl.add(stamp(`#${id}`, b.rot ?? rotDe(id)), t, "pop", 0.34);
      tl.som("impact-curto", t, 0.22);
      ev(t, false);
    },
    escopo: "palco",
  },
  palavra: {
    html: (b, id, ctx) => `<div class="bt-palavra" id="${id}"><span class="bt-faixa" id="${id}-f"></span><span class="bt-txt"${estiloFaixa(b.texto, ctx, "bt")}>${rich(b.texto)}</span></div>`,
    anim(tl, b, id, t, ev) {
      tl.add(`gsap.fromTo("#${id}",{opacity:0,scale:2.3,rotation:-5},{opacity:1,scale:1,rotation:-2,duration:0.2,ease:"power4.out"})`, t, "whoosh-short", 0.2);
      tl.add(`gsap.fromTo("#${id}-f",{scaleX:0},{scaleX:1,duration:0.2,ease:"power3.out"})`, num(t + 0.03));
      tl.add(`gsap.to("#${id}",{opacity:0,scale:0.85,duration:0.14,ease:"power2.in"})`, num(t + (b.dur ?? 0.85)));
      ev(t);
      ev(num(t + (b.dur ?? 0.85)));
    },
    escopo: "palco",
  },
  explosao: {
    html: (b, id, ctx) => explosaoHtml(id, semente(id), ctx.cores),
    anim(tl, b, id, t, ev, ctx, sc) {
      explosaoAnim(tl, id, t, semente(id), b.alvo ? `#s${sc.i}-${b.alvo}` : null, `#s${sc.i}-treme`);
      ev(t);
    },
    escopo: "palco",
  },
  chuva: {
    html(b, id, ctx) {
      const r = prng(semente(id));
      const n = b.n ?? 16;
      const item = b.item === "estrela" ? ESTRELA : b.item === "moeda" || !b.simbolo ? MOEDA : `<span class="gota-txt">${esc(b.simbolo)}</span>`;
      return `<div class="bt-chuva" id="${id}">${[...Array(n)].map((_, k) => `<span class="gota" id="${id}m${k}" style="left:${Math.round(40 + r() * 960)}px">${item}</span>`).join("")}</div>`;
    },
    anim(tl, b, id, t, ev, ctx) {
      const r = prng(semente(id) + 7);
      const n = b.n ?? 16;
      for (let k = 0; k < n; k++) {
        const d = num(1.1 + r() * 0.8);
        tl.add(`gsap.fromTo("#${id}m${k}",{y:-160,rotation:${Math.round((r() - 0.5) * 120)},opacity:1},{y:2150,rotation:${Math.round((r() - 0.5) * 720)},duration:${d},ease:"power1.in"})`, num(t + k * 0.05));
      }
      tl.som(ctx.temSom("moedas") ? "moedas" : "sparkle", t, 0.14);
      ev(t);
      ev(num(t + 0.6));
    },
    escopo: "tela",
  },
  confete: {
    html(b, id, ctx) {
      const r = prng(semente(id));
      return `<div class="bt-confete" id="${id}">${[...Array(36)].map((_, k) => `<span class="conf" id="${id}c${k}" style="background:${ctx.cores[k % ctx.cores.length]};width:${Math.round(12 + r() * 14)}px;height:${Math.round(18 + r() * 20)}px"></span>`).join("")}</div>`;
    },
    anim(tl, b, id, t, ev, ctx) {
      const r = prng(semente(id) + 3);
      for (let k = 0; k < 36; k++) {
        const ang = (k / 36) * Math.PI * 2 + r() * 0.4;
        const dist = 260 + r() * 420;
        const dx = Math.round(Math.cos(ang) * dist);
        const dy = Math.round(Math.sin(ang) * dist * 0.7 - 160);
        const dur = num(1.3 + r() * 0.6);
        tl.add(`gsap.fromTo("#${id}c${k}",{x:0,y:0,rotation:0,opacity:1},{x:${dx},y:${dy + 900},rotation:${Math.round((r() - 0.5) * 1080)},duration:${dur},ease:"power1.in",immediateRender:false})`, t);
        tl.add(`gsap.to("#${id}c${k}",{opacity:0,duration:0.3})`, num(t + dur - 0.3));
      }
      tl.som("sparkle", t, 0.14);
      ev(t);
    },
    escopo: "palco",
  },
  zoom: {
    html: () => "",
    anim(tl, b, id, t, ev, ctx, sc) {
      tl.add(`gsap.to("#s${sc.i}-cam",{keyframes:[{scale:${b.escala ?? 1.07},duration:0.1,ease:"power2.out"},{scale:1,duration:0.45,ease:"power2.inOut"}]})`, t, b.auto ? null : "whoosh-short", 0.1);
      ev(t);
    },
    escopo: "palco",
  },
  tremor: {
    html: () => "",
    anim(tl, b, id, t, ev, ctx, sc) {
      tl.add(`gsap.to("#s${sc.i}-treme",{keyframes:[{x:-26,duration:0.04},{x:22,duration:0.05},{x:-14,duration:0.05},{x:8,duration:0.05},{x:0,duration:0.06}]})`, t, "impact-curto", 0.4);
      ev(t);
    },
    escopo: "palco",
  },
  clarao: {
    html: () => "",
    anim(tl, b, id, t, ev) {
      if (b.cor) tl.add(`gsap.set("#clarao",{backgroundColor:"${b.cor}"})`, num(t - 0.01));
      tl.add(`gsap.to("#clarao",{keyframes:[{opacity:0.75,duration:0.04},{opacity:0,duration:0.3}]})`, t, "impact-curto", 0.35);
      ev(t);
    },
    escopo: "tela",
  },
  anel: {
    html: (b, id) => `<span class="bt-anel" id="${id}"></span>`,
    anim(tl, b, id, t, ev) {
      tl.add(`gsap.fromTo("#${id}",{scale:0.2,opacity:1},{scale:8,opacity:0,duration:0.7,ease:"power2.out",immediateRender:false})`, t, "whoosh", 0.18);
      ev(t);
    },
    escopo: "palco",
  },
  xis: {
    html: (b, id) => `<div class="bt-xis" id="${id}"><span class="xis-a" id="${id}-a"></span><span class="xis-b" id="${id}-b"></span></div>`,
    anim(tl, b, id, t, ev) {
      tl.add(`gsap.set("#${id}",{opacity:1})`, t);
      tl.add(`gsap.fromTo("#${id}-a",{scaleX:0,rotation:45},{scaleX:1,rotation:45,duration:0.14,ease:"power3.out"})`, t, "error", 0.28);
      tl.add(`gsap.fromTo("#${id}-b",{scaleX:0,rotation:-45},{scaleX:1,rotation:-45,duration:0.14,ease:"power3.out"})`, num(t + 0.1));
      ev(t);
    },
    escopo: "palco",
  },
  risco: {
    html: (b, id) => `<span class="bt-risco" id="${id}" style="top:${b.y ?? 50}%"></span>`,
    anim(tl, b, id, t, ev) {
      tl.add(`gsap.fromTo("#${id}",{scaleX:0,rotation:-4},{scaleX:1,rotation:-4,duration:0.22,ease:"power3.out"})`, t, "click", 0.3);
      ev(t, false);
    },
    escopo: "palco",
  },
  glitch: {
    html(b, id, ctx) {
      const r = prng(semente(id));
      return `<div class="bt-glitch" id="${id}">${[...Array(5)].map((_, k) => `<span class="gl" id="${id}g${k}" style="top:${Math.round(r() * 92)}%;height:${Math.round(14 + r() * 60)}px;background:${ctx.cores[k % ctx.cores.length]}"></span>`).join("")}</div>`;
    },
    anim(tl, b, id, t, ev, ctx, sc) {
      tl.add(`gsap.set("#${id}",{opacity:1})`, t, "glitch-curto", 0.35);
      tl.add(`gsap.set("#${id}",{opacity:0})`, num(t + 0.32));
      for (let k = 0; k < 5; k++) tl.add(`gsap.fromTo("#${id}g${k}",{x:${k % 2 ? 120 : -120}},{x:${k % 2 ? -60 : 60},duration:0.32,ease:"steps(4)"})`, t);
      tl.add(`gsap.to("#s${sc.i}-treme",{keyframes:[{x:18,duration:0.04},{x:-18,duration:0.04},{x:10,duration:0.04},{x:0,duration:0.05}]})`, t);
      ev(t);
    },
    escopo: "palco",
  },
  brilho: {
    html: (b, id) => `<span class="bt-brilho" id="${id}"></span>`,
    anim(tl, b, id, t, ev) {
      tl.add(`gsap.fromTo("#${id}",{x:-1300},{x:1300,duration:1.1,ease:"power1.inOut"})`, t, b.auto ? "sparkle" : "sparkle", b.auto ? 0.08 : 0.16);
      ev(t);
    },
    escopo: "brilho",
  },
  pulso: {
    html: () => "",
    anim(tl, b, id, t, ev, ctx, sc) {
      // pulso numa cor diferente do acento da cena (o texto no acento não some no fundo aceso)
      tl.add(`gsap.set("#pulso",{"--pc":"${b.cor ?? (ctx.tema.claro ? "#ffffff" : ctx.acc(sc.i + 3))}"})`, num(t - 0.01));
      tl.add(`gsap.to("#pulso",{keyframes:[{opacity:0.5,duration:0.08},{opacity:0,duration:0.45}]})`, t, b.auto ? "click-soft" : "impact-curto", b.auto ? 0.14 : 0.3);
      ev(t);
    },
    escopo: "tela",
  },
};
export const TIPOS_BATIDA = Object.keys(BATIDAS);

// `efeitos` (v1, só explosão) continua valendo como batida.
export function batidasDe(sc) {
  const lista = [...(sc.efeitos ?? []), ...(sc.batidas ?? [])];
  lista.forEach((b, k) => {
    if (!BATIDAS[b.tipo]) throw new Error(`batida ${k} da cena ${sc.i}: tipo "${b.tipo}" não existe (${TIPOS_BATIDA.join(", ")})`);
  });
  return lista;
}

export function batidasHtml(sc, ctx) {
  const grupos = { palco: [], tela: [], brilho: [] };
  batidasDe(sc).forEach((b, k) => {
    const id = `s${sc.i}-b${k}`;
    grupos[BATIDAS[b.tipo].escopo].push(BATIDAS[b.tipo].html(b, id, ctx, sc));
  });
  return { palco: grupos.palco.join(""), tela: grupos.tela.join(""), brilho: grupos.brilho.join("") };
}

export function batidasAnim(tl, sc, at, ev, ctx) {
  batidasDe(sc).forEach((b, k) => {
    const t = Math.max(sc.t0, at(b.em, b.frac ?? 0.3));
    BATIDAS[b.tipo].anim(tl, b, `s${sc.i}-b${k}`, t, ev, ctx, sc);
  });
}

// ---------- auto-ritmo ----------
// zoom primeiro: mexe o conteúdo em qualquer tema (pulso e brilho dependem do fundo e dos cards)
export const ROTACAO_AUTO = ["zoom", "brilho", "pulso"];

const tipoAuto = (k) => ROTACAO_AUTO[k % ROTACAO_AUTO.length];

export function autoHtml(sc, novos) {
  // faixa própria só para a batida automática de brilho (zoom e pulso não usam faixa; parada, ela apareceria)
  return novos.map((_, k) => (tipoAuto(k, sc.i) === "brilho" ? `<span class="bt-brilho" id="s${sc.i}-au${k}"></span>` : "")).join("");
}

export function autoAnim(tl, sc, novos, ev, ctx) {
  novos.forEach((b, k) => {
    const tipo = tipoAuto(k, sc.i);
    BATIDAS[tipo].anim(tl, { tipo, auto: true }, `s${sc.i}-au${k}`, b.t, ev, ctx, sc);
  });
}
