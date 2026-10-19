// Fundo vivo do kit: o fundo nunca fica parado.
// O tom de cada cena usa outra cor do tema (não o acento da cena), senão o texto no acento some no fundo.
// Três estilos: manchas de cor andando (neon), degradê inteiro girando (gradiente), pixel art com chão de
// grade andando (fliperama). Em todos, uma camada de tom por cena faz o fundo trocar de cor a cada corte.
// Tudo determinístico (PRNG com semente) e animado pela timeline, com repetições finitas.
import { num } from "./html.mjs";
import { prng } from "./efeitos.mjs";
import { acento } from "./tema.mjs";

// "#rrggbb" + alfa -> rgba()
export function rgba(hex, a) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const reps = (total, periodo) => Math.max(0, Math.floor(total / periodo) - 1);

function tons(tema, scenes) {
  if (tema.fundo === "degrade") {
    return scenes.map((sc, i) => {
      const [a, b, c] = tema.degrades[i % tema.degrades.length];
      return `<div class="tc" id="tc${i}" style="background:linear-gradient(160deg, ${a} 0%, ${b} 52%, ${c} 100%)"></div>`;
    });
  }
  return scenes.map(
    (sc, i) => `<div class="tc" id="tc${i}" style="background:radial-gradient(ellipse 820px 1050px at 50% 47%, ${rgba(acento(tema, i + 2), tema.fundo === "pixel" ? 0.2 : 0.22)}, transparent 72%)"></div>`,
  );
}

function particulas(tema, r, n, cores) {
  return [...Array(n)]
    .map((_, k) => {
      const s = tema.fundo === "pixel" ? (r() < 0.6 ? 4 : 8) : Math.round(4 + r() * 6);
      const cor = cores[k % cores.length];
      const raio = tema.fundo === "pixel" ? "0" : "50%";
      return `<span class="pt" id="pt${k}" style="left:${Math.round(r() * 1080)}px;top:${Math.round(r() * 1920)}px"><i id="pti${k}" style="width:${s}px;height:${s}px;background:${cor};border-radius:${raio}"></i></span>`;
    })
    .join("");
}

export function fundo(tema, scenes, total) {
  const r = prng(4242);
  const nPart = tema.fundo === "pixel" ? 46 : 32;
  const coresPart = tema.fundo === "degrade" ? ["#ffffff", "#fff3b0", ...tema.cores.slice(0, 2)] : tema.cores;
  const camadas = tons(tema, scenes).join("");
  let extra = "";
  const anims = [];

  if (tema.fundo === "manchas") {
    const pos = [[-260, -180], [520, 80], [-200, 900], [560, 1200]];
    extra += tema.manchas
      .map((cor, k) => {
        const tam = Math.round(980 + r() * 360);
        const [x, y] = pos[k % pos.length];
        return `<span class="mancha" id="mancha${k}" style="left:${x}px;top:${y}px;width:${tam}px;height:${tam}px;background:radial-gradient(circle, ${rgba(cor, 0.42)} 0%, ${rgba(cor, 0)} 64%)"></span>`;
      })
      .join("");
    tema.manchas.forEach((_, k) => {
      const p = num(4.6 + r() * 2.6);
      const dx = Math.round((r() - 0.5) * 520);
      const dy = Math.round((r() - 0.5) * 560);
      anims.push([`gsap.fromTo("#mancha${k}",{x:0,y:0,scale:1},{x:${dx},y:${dy},scale:${num(1.15 + r() * 0.25)},duration:${p},ease:"sine.inOut",yoyo:true,repeat:${reps(total, p)}})`, 0]);
    });
    extra += `<div id="grade"></div>`;
    anims.push([`gsap.fromTo("#grade",{y:0},{y:-96,duration:4,ease:"none",repeat:${reps(total, 4)}})`, 0]);
  }

  if (tema.fundo === "degrade") {
    extra += [...Array(3)]
      .map((_, k) => `<span class="luz" id="luz${k}" style="left:${[-300, 480, 60][k]}px;top:${[200, 700, 1350][k]}px"></span>`)
      .join("");
    [0, 1, 2].forEach((k) => {
      const p = num(5 + r() * 2.5);
      anims.push([`gsap.fromTo("#luz${k}",{x:0,y:0,scale:1},{x:${Math.round((r() - 0.5) * 600)},y:${Math.round((r() - 0.5) * 500)},scale:${num(1.2 + r() * 0.3)},duration:${p},ease:"sine.inOut",yoyo:true,repeat:${reps(total, p)}})`, 0]);
    });
    anims.push([`gsap.fromTo("#deg",{rotation:-9,scale:1},{rotation:9,scale:1.12,duration:6,ease:"sine.inOut",yoyo:true,repeat:${reps(total, 6)}})`, 0]);
  }

  if (tema.fundo === "pixel") {
    extra += `<div id="chao"><div id="chao-plano"><div id="chao-grade"></div></div></div><div id="horizonte"></div>`;
    anims.push([`gsap.fromTo("#chao-grade",{y:0},{y:120,duration:0.9,ease:"none",repeat:${reps(total, 0.9)}})`, 0]);
  }

  const parts = particulas(tema, r, nPart, coresPart);
  for (let k = 0; k < nPart; k++) {
    anims.push([`gsap.fromTo("#pt${k}",{y:0},{y:${-Math.round(220 + r() * 640)},duration:${num(total)},ease:"none"})`, 0]);
    const p = num(0.6 + r() * 1.1);
    const pisca = tema.fundo === "pixel" ? `ease:"steps(2)"` : `ease:"sine.inOut"`;
    anims.push([`gsap.fromTo("#pti${k}",{opacity:0.12},{opacity:0.95,duration:${p},${pisca},yoyo:true,repeat:${reps(total, p)}})`, num(r() * 0.8)]);
  }

  const classe = `fundo-${tema.fundo}`;
  const html = `<div id="fundo" class="${classe}">${tema.fundo === "degrade" ? `<div id="deg">${camadas}</div>` : camadas}${extra}<div id="particulas">${parts}</div><div id="vinheta"></div></div>${
    tema.fundo === "pixel" ? `<div id="scan"></div>` : ""
  }`;

  const anim = (tl) => {
    tl.add(`gsap.set("#tc0",{opacity:1})`, 0);
    scenes.forEach((sc, i) => {
      if (i === 0) return;
      tl.add(`gsap.fromTo("#tc${i}",{opacity:0},{opacity:1,duration:0.45,ease:"power2.out"})`, sc.t0);
      tl.add(`gsap.to("#tc${i - 1}",{opacity:0,duration:0.45,ease:"power2.out"})`, sc.t0);
    });
    anims.forEach(([expr, t]) => tl.add(expr, t));
  };
  return { html, anim };
}
