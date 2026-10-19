#!/usr/bin/env node
// Kit de reel da esteira: reel.json + words.json + narração -> projeto HyperFrames 1080x1920.
// Uso: node kit/build.mjs <pasta-do-reel> [--versao teste]
//
// reel.json  -> título-tese, palavra do CTA, destaques, DM, tema e a lista de cenas (uma fala por cena).
//               Por cena: `cabs` (cabeçalho que troca na palavra), `batidas` (pontuação na palavra) e, no gancho,
//               `dados.quadros` (o palco troca de visual na palavra). Ver skill/esteira/references/roteiro.md.
// words.json -> [{ w, s, e }] uma entrada por palavra das falas, na ordem (sai do alinhamento da voz gravada).
// narracao.mp3 (ou .wav) -> a voz. A música do clima entra por baixo (kit/trilha.mjs), se houver.
// perfil.json (raiz) -> nome, @ e foto do fecho (kit/perfil.mjs).
//
// Ritmo: algo grande muda na tela a cada 1,4 s no máximo; o que sobrar de vão o auto-ritmo preenche.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bateAncora, dividirFala, norm, tokens } from "./texto.mjs";
import { KIT, num, esc, rich, icon, logo, stamp } from "./html.mjs";
import { cerebro, mascote, sfxAudio, bancoDeSons } from "./efeitos.mjs";
import { temaDe, acento, cssTema, misturar } from "./tema.mjs";
import { preencherVaos, maiorVao } from "./ritmo.mjs";
import { fundo } from "./fundo.mjs";
import { quadrosHtml, quadrosAnim, temposQuadros, cabsDe, cabsHtml, cabsAnim, batidasHtml, batidasAnim, autoHtml, autoAnim } from "./batidas.mjs";
import { prepararTrilha, faixaDoReel } from "./trilha.mjs";
import { carregarCatalogo, outraDoClima } from "./trilhas.mjs";
import { lerPerfil, iniciais, PERFIL_JSON } from "./perfil.mjs";
import { DESTAQUES } from "./tema.mjs";
import { prepararMundo, tipoMundo } from "./mundo.mjs";
import { versaoDoReel } from "./versao.mjs";

export { norm, tokens };
const W = 1080;
const H = 1920;
const MAX_VAO = 1.4;

// ---------- estilo "cinema" (o padrão) ----------
// Legenda branca sem caixa; "dourada" acende a palavra falada em dourado, "branca" deixa a frase toda branca.
// A cor de destaque varia pelo assunto (reel.cor: nome em DESTAQUES ou hex); "classico" é o estilo de antes.
function corDe(cor) {
  if (cor == null) return DESTAQUES.ouro;
  if (DESTAQUES[cor]) return DESTAQUES[cor];
  if (/^#[0-9a-f]{6}$/i.test(cor)) return cor.toLowerCase();
  throw new Error(`cor "${cor}" não existe (${Object.keys(DESTAQUES).join(", ")} ou um hex como #f6b73c)`);
}
// Legenda "branca" (versão de teste): tudo branco, até a palavra-chave.
function coresCinema(legenda, cor) {
  if (legenda === "branca") return { ativa: "#ffffff", inativa: "#ffffff", chave: "#ffffff", chaveInativa: "#ffffff" };
  return { ativa: cor, inativa: "#ffffff", chave: cor, chaveInativa: "#ffffff" };
}

// ---------- um parágrafo, duas telas ----------
// O teleprompter grava por parágrafo, e um parágrafo pode juntar "Me segue" e "comenta PALAVRA". A cena pode abrir
// com outra tela até uma palavra: "antes": { tipo: "segue", ate: "assim" } (o resto da fala fica com a cena).
// As marcas da cena 3D ([cena, palavra]) acompanham; o mundo.mjs recebe as telas já divididas.
function dividirCenas(reel) {
  if (!reel.cenas.some((c) => c.antes)) return reel;
  const novo = [];
  const partes = [];
  const cenas = reel.cenas.flatMap((c, i) => {
    novo[i] = i === 0 ? 0 : novo[i - 1] + (reel.cenas[i - 1].antes ? 2 : 1);
    if (!c.antes) return [c];
    const { ate, ...antes } = c.antes;
    partes[i] = dividirFala(c.fala, ate);
    if (!partes[i]) throw new Error(`cena ${i + 1}: antes.ate "${ate}" tem que ser uma palavra da fala, e não a última`);
    const { antes: _, ...resto } = c;
    return [{ ...antes, fala: partes[i][0] }, { ...resto, fala: partes[i][1] }];
  });
  const marcas = reel.mundo?.marcas;
  if (!marcas) return { ...reel, cenas };
  // Mesma regra de âncora do validador e do mundo.mjs: a marca vai pra tela onde a palavra aparece primeiro.
  const ondeFica = ([ci, palavra]) => {
    if (!partes[ci]) return [novo[ci] ?? ci, palavra];
    return [novo[ci] + (tokens(partes[ci][0]).some((w) => bateAncora(w, palavra)) ? 0 : 1), palavra];
  };
  return { ...reel, cenas, mundo: { ...reel.mundo, marcas: Object.fromEntries(Object.entries(marcas).map(([n, par]) => [n, Array.isArray(par) ? ondeFica(par) : par])) } };
}

// ---------- tempos ----------
function buildTiming(reel, words) {
  const ranges = [];
  let k = 0;
  for (const c of reel.cenas) {
    const n = tokens(c.fala).length;
    ranges.push([k, k + n]);
    k += n;
  }
  if (k !== words.length) {
    throw new Error(`words.json tem ${words.length} palavras e as falas somam ${k}: rode o align.mjs de novo`);
  }
  const lead = reel.antecipa ?? 0.08;
  const total = num(words[words.length - 1].e + (reel.segura_fim ?? 1.6));
  const starts = ranges.map(([a], i) => (i === 0 ? 0 : Math.max(0, words[a].s - lead)));
  const scenes = reel.cenas.map((c, i) => ({
    ...c,
    i,
    range: ranges[i],
    t0: num(starts[i]),
    t1: num(i + 1 < starts.length ? starts[i + 1] : total),
  }));
  return { scenes, total };
}

// Tempo de uma âncora (palavra falada) dentro da cena; sem achar, cai na fração da cena.
function makeAt(scene, words) {
  return (anchor, frac = 0) => {
    if (anchor) {
      const want = tokens(anchor).map(norm)[0];
      for (let j = scene.range[0]; j < scene.range[1]; j++) {
        const n = norm(words[j].w);
        if (n === want || (want.length >= 4 && n.startsWith(want))) return num(Math.max(scene.t0, words[j].s));
      }
    }
    return num(scene.t0 + (scene.t1 - scene.t0) * frac);
  };
}

// Gancho do v1 (logo/número/ícone + selo) vira quadros e batida, para um caminho só.
function normalizarHook(sc) {
  const d = sc.dados ?? {};
  if (sc.tipo !== "hook" || d.quadros) return sc;
  const quadros = [];
  const logos = [].concat(d.logo ?? []);
  if (d.numero != null) quadros.push({ tipo: "palavra", texto: String(d.numero), sub: d.rotulo });
  else if (logos.length) logos.forEach((l, k) => quadros.push({ tipo: "logo", logo: l, em: k ? null : undefined }));
  else if (d.icone) quadros.push({ tipo: "icone", icone: d.icone });
  const batidas = [...(sc.batidas ?? [])];
  if (d.selo) batidas.push({ tipo: "selo", texto: d.selo, em: d.selo_em, frac: 0.35 });
  return { ...sc, dados: { ...d, quadros }, batidas };
}

// ---------- legenda ----------
function captionBlocks(scenes, words, total) {
  const blocks = [];
  for (const sc of scenes) {
    let cur = [];
    const flush = () => cur.length && (blocks.push({ idx: cur, cena: sc.i }), (cur = []));
    for (let j = sc.range[0]; j < sc.range[1]; j++) {
      const chars = cur.reduce((n, x) => n + words[x].w.length + 1, 0);
      if (cur.length >= 5 || (cur.length >= 2 && chars + words[j].w.length > 26)) flush();
      cur.push(j);
      if (/[.,!?:;]$/.test(words[j].w) && cur.length >= 2) flush();
    }
    flush();
  }
  return blocks.map((b, k) => {
    const s = k === 0 ? 0 : words[b.idx[0]].s;
    const e = k + 1 < blocks.length ? words[blocks[k + 1].idx[0]].s : total;
    return { ...b, s: num(s), e: num(Math.max(e, s + 0.1)) };
  });
}

function coresLegenda(tema, acc) {
  if (tema.claro) return { ativa: tema.escuro, inativa: "#77718f", chave: "#d6246e", chaveInativa: "#b5527f" };
  return { ativa: tema.tinta, inativa: misturar(tema.tinta, tema.base, 0.58), chave: acc, chaveInativa: misturar(acc, tema.base, 0.45) };
}

// ---------- cenas ----------
// Cada tipo devolve { html, anim(tl, sc, at, ev) }. ev(t) registra uma mudança grande (conta pro auto-ritmo).
const TYPES = {
  mundo: tipoMundo,

  hook(sc, ctx) {
    const q = quadrosHtml(sc, ctx);
    return {
      html: q.html,
      anim(tl, sc, at, ev) {
        quadrosAnim(tl, sc, at, ev, q.partes);
      },
    };
  },

  terminal(sc) {
    const d = sc.dados ?? {};
    const p = `s${sc.i}`;
    const linhas = d.linhas ?? [];
    const html = `<div class="janela term">
      ${barra(d.titulo ?? "claude  ~/projeto")}
      <div class="term-corpo">${linhas
        .map((l, k) => {
          const kind = l.k ?? "out";
          const pre = kind === "cmd" ? `<span class="t-pre">&gt;</span> ` : kind === "ok" ? `<span class="t-ok">✓</span> ` : "";
          const chars = [...String(l.t)].map((ch, c) => `<span class="ch" id="${p}-l${k}c${c}">${esc(ch)}</span>`).join("");
          return `<div class="t-linha t-${kind}" id="${p}-l${k}">${pre}${kind === "cmd" ? chars : esc(l.t)}</div>`;
        })
        .join("")}<div class="t-cursor" id="${p}-cur"></div></div>
    </div>`;
    return {
      html,
      anim(tl, sc, at, ev) {
        let t = sc.t0 + 0.25;
        const span = sc.t1 - sc.t0 - 0.4;
        const per = Math.max(0.25, span / Math.max(1, linhas.length + 1));
        linhas.forEach((l, k) => {
          const tk = Math.max(t, at(l.em, 0));
          tl.add(`gsap.set("#${p}-l${k}",{opacity:1})`, tk, (l.k ?? "out") === "ok" ? "ping" : null, 0.2);
          if ((l.k ?? "out") === "cmd") {
            const n = [...String(l.t)].length;
            const step = Math.min(0.045, (per * 0.8) / Math.max(1, n));
            for (let c = 0; c < n; c++) tl.add(`gsap.set("#${p}-l${k}c${c}",{opacity:1})`, num(tk + c * step));
            tl.som("typing", num(tk), 0.16);
            t = tk + n * step + 0.12;
          } else {
            tl.add(`gsap.fromTo("#${p}-l${k}",{x:-30},{x:0,duration:0.2,ease:"power2.out"})`, tk);
            t = tk + Math.min(per, 0.35);
          }
        });
        tl.add(`gsap.fromTo("#${p}-cur",{opacity:1},{opacity:0,duration:0.45,ease:"steps(1)",yoyo:true,repeat:${Math.max(0, Math.floor((sc.t1 - sc.t0) / 0.45) - 1)}})`, sc.t0);
      },
    };
  },

  chat(sc, ctx) {
    const d = sc.dados ?? {};
    const p = `s${sc.i}`;
    const pw = tokens(d.pergunta ?? "");
    const resp = [].concat(d.resposta ?? []);
    const html = `<div class="janela chat">
      <div class="chat-top"><span class="chat-logo">${logo("claude", 40)}</span><b>${esc(d.app ?? "Claude")}</b></div>
      <div class="chat-corpo">
        <div class="bolha">${pw.map((w, k) => `<span class="pw" id="${p}-w${k}">${esc(w)}</span>`).join(" ")}</div>
        <div class="resp">${resp.map((r, k) => `<div class="r-linha" id="${p}-r${k}"><span class="r-ico">${icon("inteligencia", 30)}</span><span>${rich(r)}</span></div>`).join("")}</div>
      </div>
    </div>`;
    return {
      html,
      anim(tl, sc, at, ev) {
        const dur = sc.t1 - sc.t0;
        const t0 = sc.t0 + 0.2;
        const step = Math.min(0.12, (dur * 0.4) / Math.max(1, pw.length));
        pw.forEach((_, k) => tl.add(`gsap.set("#${p}-w${k}",{opacity:1})`, num(t0 + k * step)));
        if (pw.length) tl.som("typing", num(t0), 0.14);
        const tr = t0 + pw.length * step + 0.25;
        resp.forEach((_, k) => {
          const tk = num(Math.max(tr + k * 0.35, at(null, 0)));
          tl.add(`gsap.fromTo("#${p}-r${k}",{opacity:0,y:16},{opacity:1,y:0,duration:0.3,ease:"power2.out"})`, tk, "pop", 0.2);
        });
      },
    };
  },

  repo(sc) {
    const d = sc.dados ?? {};
    const p = `s${sc.i}`;
    const stats = [
      d.estrelas != null ? `★ ${esc(d.estrelas)}` : "",
      d.forks != null ? `⑂ ${esc(d.forks)}` : "",
      d.licenca ? `${esc(d.licenca)}` : "",
      d.linguagem ? `${esc(d.linguagem)}` : "",
    ].filter(Boolean);
    const html = `<div class="janela repo" id="${p}-repo">
      <div class="repo-top"><span class="repo-gh">${logo("github", 44)}</span><span class="repo-nome">${esc(d.dono)} / <b>${esc(d.nome)}</b></span><span class="badge">${esc(d.visibilidade ?? "Public")}</span></div>
      ${d.descricao ? `<div class="repo-desc">${rich(d.descricao)}</div>` : ""}
      <div class="repo-stats">${stats.map((s) => `<span>${s}</span>`).join("")}</div>
      ${(d.arquivos ?? []).length ? `<div class="repo-arq">${d.arquivos.map((a, k) => `<div class="arq" id="${p}-a${k}">${icon(a.endsWith("/") ? "contexto" : "site", 30)}<span>${esc(a)}</span></div>`).join("")}</div>` : ""}
      ${d.selo ? `<div class="selo repo-selo" id="${p}-selo">${esc(d.selo)}</div>` : ""}
    </div>`;
    return {
      html,
      anim(tl, sc, at, ev) {
        (d.arquivos ?? []).forEach((_, k) =>
          tl.add(`gsap.fromTo("#${p}-a${k}",{opacity:0,x:-24},{opacity:1,x:0,duration:0.25,ease:"power2.out"})`, num(sc.t0 + 0.35 + k * 0.12), "pop", 0.16),
        );
        if (d.selo) {
          const ts = at(d.selo_em, 0.4);
          tl.add(stamp(`#${p}-selo`, 6), ts, "pop");
          ev(ts, false);
        }
      },
    };
  },

  lista(sc) {
    const d = sc.dados ?? {};
    const p = `s${sc.i}`;
    const itens = d.itens ?? [];
    const compacto = itens.length > 6;
    const html = `<div class="lista ${compacto ? "compacta" : ""}">${itens
      .map(
        (it, k) => `<div class="item" id="${p}-i${k}"><div class="foco" id="${p}-f${k}"></div><span class="i-n">${String(it.n ?? k + 1).padStart(2, "0")}</span><div class="i-txt"><div class="i-nome">${rich(it.nome)}</div>${it.desc ? `<div class="i-desc">${rich(it.desc)}</div>` : ""}</div>${it.icone ? `<span class="i-ico" id="${p}-ic${k}">${icon(it.icone, 46)}</span>` : ""}</div>`,
      )
      .join("")}</div>`;
    return {
      html,
      anim(tl, sc, at, ev) {
        const span = sc.t1 - sc.t0;
        const times = itens.map((it, k) => Math.max(sc.t0 + 0.15, at(it.em, (k / Math.max(1, itens.length)) * 0.85)));
        itens.forEach((it, k) => {
          tl.add(`gsap.fromTo("#${p}-i${k}",{opacity:0,x:${k % 2 ? 140 : -140},scale:0.92},{opacity:1,x:0,scale:1,duration:0.3,ease:"back.out(1.5)"})`, num(times[k]), "pop", 0.26);
          tl.add(`gsap.fromTo("#${p}-f${k}",{opacity:0},{opacity:1,duration:0.15})`, num(times[k] + 0.05));
          if (it.icone) tl.add(`gsap.fromTo("#${p}-ic${k}",{rotation:-25,scale:0.4},{rotation:0,scale:1,duration:0.35,ease:"back.out(3)"})`, num(times[k] + 0.08));
          if (k + 1 < itens.length) tl.add(`gsap.to("#${p}-f${k}",{opacity:0,duration:0.15})`, num(Math.min(times[k + 1], sc.t0 + span)));
          ev(times[k]);
        });
      },
    };
  },

  numero(sc) {
    const d = sc.dados ?? {};
    const p = `s${sc.i}`;
    const chars = [...String(d.valor)];
    let dk = 0;
    const html = `<div class="nm">
      <div class="nm-linha" id="${p}-nl">${d.prefixo ? `<span class="nm-fix">${esc(d.prefixo)}</span>` : ""}${chars
        .map((ch) =>
          /\d/.test(ch)
            ? `<span class="dig"><span class="fita" data-layout-ignore id="${p}-d${dk++}">${[...Array(20)].map((_, n) => `<span>${n % 10}</span>`).join("")}</span></span>`
            : `<span class="nm-sep">${esc(ch)}</span>`,
        )
        .join("")}${d.sufixo ? `<span class="nm-fix">${esc(d.sufixo)}</span>` : ""}</div>
      ${d.rotulo ? `<div class="nm-rot">${rich(d.rotulo)}</div>` : ""}
      ${d.sub ? `<div class="nm-sub">${rich(d.sub)}</div>` : ""}
    </div>`;
    return {
      html,
      anim(tl, sc, at, ev) {
        const t = Math.max(sc.t0 + 0.1, at(d.em, 0));
        // O número só aparece quando é falado: antes disso o odômetro mostraria "0".
        tl.add(`gsap.fromTo("#${p}-nl",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.3,ease:"back.out(2.4)"})`, t, "pop");
        let k = 0;
        for (const ch of chars) {
          if (!/\d/.test(ch)) continue;
          const target = 10 + Number(ch);
          tl.add(`gsap.fromTo("#${p}-d${k}",{y:0},{y:${-target * 320},duration:${num(0.9 + k * 0.15)},ease:"power3.out"})`, t);
          k++;
        }
        ev(t);
        ev(num(t + 0.9 + (k - 1) * 0.15));
      },
    };
  },

  cards(sc) {
    const d = sc.dados ?? {};
    const p = `s${sc.i}`;
    const itens = d.itens ?? [];
    const html = `<div class="cards n${itens.length}">${itens
      .map(
        (c, k) => `<div class="card" id="${p}-c${k}"><span class="selo-icone">${icon(c.icone ?? "inteligencia", 62)}</span><div class="c-tit">${rich(c.titulo)}</div>${c.sub ? `<div class="c-sub">${rich(c.sub)}</div>` : ""}</div>`,
      )
      .join("")}</div>`;
    return {
      html,
      anim(tl, sc, at, ev) {
        itens.forEach((c, k) => {
          const tk = num(Math.max(sc.t0 + 0.1, at(c.em, k * 0.18)));
          tl.add(`gsap.fromTo("#${p}-c${k}",{opacity:0,y:120,scale:0.8,rotation:${k % 2 ? 6 : -6}},{opacity:1,y:0,scale:1,rotation:0,duration:0.38,ease:"back.out(1.6)"})`, tk, "pop", 0.26);
          ev(tk);
        });
      },
    };
  },

  comparar(sc) {
    const d = sc.dados ?? {};
    const p = `s${sc.i}`;
    const col = (lado, cls) => `<div class="cmp-col ${cls}" id="${p}-${cls}"><div class="cmp-rot">${esc(lado?.rotulo)}</div>${(lado?.itens ?? []).map((x) => `<div class="cmp-it"><span class="cmp-m">${cls === "antes" ? "✕" : "✓"}</span><span>${rich(x)}</span></div>`).join("")}</div>`;
    const html = `<div class="cmp">${col(d.antes, "antes")}${col(d.depois, "depois")}</div>`;
    return {
      html,
      anim(tl, sc, at, ev) {
        const ta = num(sc.t0 + 0.1);
        const td = num(Math.max(sc.t0 + 0.4, at(d.depois?.em, 0.4)));
        tl.add(`gsap.fromTo("#${p}-antes",{opacity:0,x:-160},{opacity:1,x:0,duration:0.3,ease:"power3.out"})`, ta, "whoosh-short", 0.12);
        tl.add(`gsap.fromTo("#${p}-depois",{opacity:0,y:160,scale:0.85},{opacity:1,y:0,scale:1,duration:0.38,ease:"back.out(1.6)"})`, td, "pop");
        ev(ta);
        ev(td);
      },
    };
  },

  frase(sc) {
    const d = sc.dados ?? {};
    const p = `s${sc.i}`;
    const parts = String(d.texto ?? "").split(/(\*[^*]+\*)/).filter(Boolean);
    let k = 0;
    const html = `<div class="fr"><div class="fr-txt">${parts
      .map((part) =>
        part.startsWith("*")
          ? `<em class="fw" id="${p}-w${k++}">${esc(part.slice(1, -1))}</em>`
          : tokens(part).map((w) => `<span class="fw" id="${p}-w${k++}">${esc(w)}</span>`).join(" "),
      )
      .join(" ")}</div>${d.assinatura ? `<div class="fr-ass"><span class="q"></span>${esc(d.assinatura)}</div>` : ""}</div>`;
    return {
      html,
      anim(tl, sc) {
        const step = Math.min(0.09, ((sc.t1 - sc.t0) * 0.5) / Math.max(1, k));
        for (let n = 0; n < k; n++) tl.add(`gsap.fromTo("#${p}-w${n}",{opacity:0,y:40,scale:1.25},{opacity:1,y:0,scale:1,duration:0.26,ease:"back.out(2)"})`, num(sc.t0 + 0.1 + n * step));
      },
    };
  },

  // Imagem real do produto (print oficial do app, foto) numa moldura de celular: o celular entra com
  // pulo, cada tela entra na palavra marcada (`em`) deslizando por cima da anterior e todas têm zoom
  // lento até a próxima.
  midia(sc, ctx) {
    const d = sc.dados ?? {};
    const p = `s${sc.i}`;
    const imgs = d.imagens ?? [];
    for (const im of imgs) {
      if (ctx.dir && !fs.existsSync(path.join(ctx.dir, im.src))) throw new Error(`cena ${sc.i + 1}: imagem ${im.src} não existe na pasta do reel`);
    }
    const telas = imgs.map((im, k) => `<div class="md-tela" id="${p}-t${k}"><img src="${esc(im.src)}" alt="" id="${p}-i${k}"></div>`).join("");
    const html = `<div class="md"><div class="md-pers"><div class="md-cel" id="${p}-cel" data-layout-ignore>${telas}<span class="md-ilha"></span>${d.credito ? `<span class="md-cred">${esc(d.credito)}</span>` : ""}</div></div></div>`;
    return {
      html,
      anim(tl, sc, at, ev) {
        tl.add(`gsap.fromTo("#${p}-cel",{opacity:0,y:300,rotation:-8,scale:0.8},{opacity:1,y:0,rotation:0,scale:1,duration:0.42,ease:"back.out(1.4)"})`, num(sc.t0 + 0.02), "pop", 0.22);
        const tempos = imgs.map((im, k) => (k === 0 ? num(sc.t0 + 0.05) : num(Math.max(sc.t0 + 0.3, at(im.em, k / imgs.length)))));
        imgs.forEach((im, k) => {
          const t = tempos[k];
          const fim = k + 1 < imgs.length ? tempos[k + 1] : sc.t1;
          if (k === 0) {
            tl.add(`gsap.fromTo("#${p}-t0",{opacity:0,scale:1.06},{opacity:1,scale:1,duration:0.3,ease:"power2.out"})`, t);
          } else {
            const lado = k % 2 ? 1 : -1;
            tl.add(`gsap.fromTo("#${p}-t${k}",{opacity:0,x:${lado * 520},rotation:${lado * 6}},{opacity:1,x:0,rotation:0,duration:0.34,ease:"expo.out"})`, t, "whoosh-short", 0.3);
            ev(t);
          }
          tl.add(`gsap.fromTo("#${p}-i${k}",{scale:1},{scale:1.12,duration:${num(Math.max(0.3, fim - t))},ease:"none",immediateRender:false})`, t);
        });
      },
    };
  },

  segue(sc, ctx) {
    const p = `s${sc.i}`;
    const d = sc.dados ?? {};
    const html = `<div class="sg">
      <div class="sg-av" id="${p}-av"><span class="sg-anel" id="${p}-anel"></span>${avatar(ctx.autor)}</div>
      <div class="sg-nome">${esc(ctx.autor.nome)}</div>
      <div class="sg-user">@${esc(ctx.autor.user)}</div>
      <div class="sg-btn"><span class="b-seguir" id="${p}-bt1">Seguir</span><span class="b-seguindo" id="${p}-bt2">Seguindo ✓</span></div>
      <div class="selo sg-selo" id="${p}-selo">${esc(d.selo ?? "+1 SEGUIDOR")}</div>
    </div>`;
    return {
      html,
      anim(tl, sc, at, ev) {
        tl.add(`gsap.fromTo("#${p}-av",{scale:0.4,opacity:0,rotation:-20},{scale:1,opacity:1,rotation:0,duration:0.45,ease:"back.out(1.7)"})`, sc.t0 + 0.05, "pop");
        tl.add(`gsap.fromTo("#${p}-anel",{rotation:0},{rotation:540,duration:${num(Math.max(1, sc.t1 - sc.t0))},ease:"none"})`, sc.t0);
        // o Seguindo acende dentro da cena, mesmo no segue curto (senão some antes de aparecer)
        const tb = num(Math.max(sc.t0 + 0.2, Math.min(Math.max(sc.t0 + 0.6, at(d.em ?? "segue", 0.35) + 0.15), sc.t1 - 0.45)));
        tl.add(`gsap.to("#${p}-bt1",{opacity:0,duration:0.12})`, tb);
        tl.add(`gsap.to("#${p}-bt2",{opacity:1,duration:0.12})`, tb, "click-soft");
        tl.add(stamp(`#${p}-selo`, 5), tb + 0.1, "pop");
        ev(sc.t0 + 0.05);
        ev(tb);
      },
    };
  },

  comenta(sc, ctx) {
    const p = `s${sc.i}`;
    const d = sc.dados ?? {};
    const pal = [...ctx.palavra.toUpperCase()];
    const bw = Math.min(132, Math.floor((900 - (pal.length - 1) * 14) / pal.length));
    const html = `<div class="cm">
      <div class="cm-caixas" style="--bw:${bw}px">${pal
        .map((ch, k) => `<div class="cx" id="${p}-cx${k}" style="--cx:${ctx.acc(sc.i + k)}"><span class="cx-l" id="${p}-x${k}">${esc(ch)}</span><span class="cx-cur" id="${p}-k${k}"></span></div>`)
        .join("")}</div>
      <div class="cm-campo"><span class="cm-voce">você</span><span class="cm-ph" id="${p}-ph">Adicione um comentário...</span><span class="cm-txt" id="${p}-tx">${esc(ctx.palavra.toUpperCase())}</span><span class="cm-pub" id="${p}-pub">Publicar</span></div>
      <div class="dm" id="${p}-dm">
        <div class="dm-top">${avatar(ctx.autor)}<b>${esc(ctx.autor.user)}</b><span class="dm-ago">agora</span></div>
        <div class="dm-msg">${rich(ctx.dm.texto)}</div>
        <div class="dm-link">${icon("site", 34)}<span>${esc(ctx.dm.botao ?? "abrir o guia")}</span><span class="dm-seta">›</span></div>
        <div class="selo dm-selo" id="${p}-selo">${esc(d.selo ?? "NA SUA DM")}</div>
      </div>
    </div>`;
    return {
      html,
      anim(tl, sc, at, ev) {
        const tt = Math.max(sc.t0 + 0.3, at(d.em ?? ctx.palavra, 0.2));
        const step = 0.13;
        const blink = Math.max(0, Math.floor((tt - sc.t0) / 0.4) - 1);
        tl.add(`gsap.fromTo("#${p}-k0",{opacity:1},{opacity:0,duration:0.4,ease:"steps(1)",yoyo:true,repeat:${blink}})`, sc.t0);
        tl.add(`gsap.set("#${p}-k0",{opacity:0})`, num(tt - 0.01));
        pal.forEach((_, k) => {
          tl.add(`gsap.fromTo("#${p}-x${k}",{opacity:0,scale:1.8},{opacity:1,scale:1,duration:0.14,ease:"back.out(3)"})`, num(tt + k * step), "key-press");
          tl.add(`gsap.fromTo("#${p}-cx${k}",{y:0},{keyframes:[{y:-22,duration:0.08},{y:0,duration:0.18,ease:"bounce.out"}]})`, num(tt + k * step));
          if (k + 1 < pal.length) {
            tl.add(`gsap.set("#${p}-k${k + 1}",{opacity:1})`, num(tt + k * step + 0.02));
            tl.add(`gsap.set("#${p}-k${k + 1}",{opacity:0})`, num(tt + (k + 1) * step - 0.01));
          }
        });
        const tdone = tt + pal.length * step + 0.15;
        tl.add(`gsap.set("#${p}-ph",{opacity:0})`, num(tdone));
        tl.add(`gsap.set("#${p}-tx",{opacity:1})`, num(tdone));
        tl.add(`gsap.to("#${p}-pub",{color:"${ctx.acc(sc.i)}",duration:0.15})`, num(tdone));
        const tdm = Math.max(tdone + 0.5, at(d.dm_em ?? "dm", 0.75));
        tl.add(`gsap.fromTo("#${p}-dm",{opacity:0,y:160,scale:0.9},{opacity:1,y:0,scale:1,duration:0.45,ease:"back.out(1.5)"})`, num(tdm), "notification");
        tl.add(stamp(`#${p}-selo`, -5), num(tdm + 0.35), "pop");
        ev(tt, false);
        ev(tdone, false);
        ev(tdm);
      },
    };
  },
};

TYPES.cerebro = (sc, ctx) => {
  const out = cerebro(sc, ctx, { icon });
  return { html: out.html, anim: (tl, sc, at, ev) => (out.anim(tl, sc, at), ev(sc.t0 + 0.9)) };
};
export const TIPOS = Object.keys(TYPES);

// Foto do perfil (copiada pra assets/img) ou um círculo com as iniciais.
function avatar(autor) {
  return autor.foto ? `<img src="assets/img/perfil${path.extname(autor.foto).toLowerCase()}" alt="">` : `<span class="av-ini">${esc(iniciais(autor.nome))}</span>`;
}

function barra(titulo) {
  return `<div class="barra"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="b-tit">${esc(titulo)}</span></div>`;
}

// Cabeçalho de cena fixo do fecho.
const CAB_PADRAO = { segue: "ME *segue*", comenta: "COMENTA" };
const TRANSICOES = ["zoom", "chicote", "sobe"];
const WHOOSH = ["whoosh-short", "whoosh", "whoosh-short", "whoosh-cinematic"];

// ---------- montagem ----------
// versao: "perfil" (padrão) ou "teste" (Reels de teste do Instagram: mesmo áudio, vídeo um pouco diferente).
// sfx: pasta dos efeitos sonoros (padrão kit/assets/sfx; os que faltarem não tocam).
// perfil: caminho do perfil.json (padrão: o da raiz). catalogo: as músicas (padrão: kit/assets/musica/musicas.json).
export function build(dir, { versao, sfx: pastaSfx, perfil = PERFIL_JSON, catalogo } = {}) {
  const avisos = [];
  if (catalogo === undefined) {
    const lido = carregarCatalogo();
    catalogo = lido.catalogo;
    avisos.push(...lido.avisos);
  }
  const reel = dividirCenas(versaoDoReel(JSON.parse(fs.readFileSync(path.join(dir, "reel.json"), "utf8")), versao, { catalogo }));
  const words = JSON.parse(fs.readFileSync(path.join(dir, "words.json"), "utf8"));
  const audio = ["narracao.mp3", "narracao.wav"].find((f) => fs.existsSync(path.join(dir, f)));
  if (!audio) throw new Error("falta narracao.mp3 ou narracao.wav na pasta do reel");

  const tema = temaDe(reel);
  const cinema = (reel.estilo ?? "cinema") === "cinema";
  const destaque = corDe(reel.cor);
  const timing = buildTiming(reel, words);
  const total = timing.total;
  const scenes = timing.scenes.map(normalizarHook);
  const pf = lerPerfil(perfil);
  avisos.push(...pf.avisos);
  // reel.autor vence o perfil.json campo a campo (null conta como ausente), menos a foto: com reel.autor, a foto
  // só vem dele (relativa à pasta do reel), senão um convidado sairia com a foto do dono.
  const ra = reel.autor ?? null;
  const autor = { nome: ra?.nome ?? pf.nome, user: String(ra?.user ?? pf.user).replace(/^@/, ""), foto: ra ? null : pf.foto };
  if (ra?.foto) {
    const f = path.resolve(dir, ra.foto);
    if (fs.existsSync(f)) autor.foto = f;
    else avisos.push(`foto ${ra.foto} do reel.json não encontrada: o fecho sai com as iniciais`);
  }
  const sons = bancoDeSons(pastaSfx);
  const ctx = {
    dir,
    palavra: reel.palavra ?? "GUIA",
    dm: reel.dm ?? { texto: "Aqui está o passo a passo", botao: "abrir o guia" },
    autor,
    tema,
    cores: tema.cores,
    acc: (i) => acento(tema, i),
    temSom: sons.tem,
  };
  const keys = new Set([...(reel.destaques ?? []).flatMap((x) => tokens(x).map(norm)), norm(ctx.palavra)]);

  // Linha do tempo como código: "gsap.fromTo(a,b,c)" vira "tl.fromTo(a,b,c, t)" em segundos absolutos,
  // para o tween nascer dentro da timeline pausada (um gsap.set solto aplicaria na carga da página).
  // O 3º argumento opcional dispara um efeito sonoro no mesmo instante.
  const lines = [];
  const sfx = [];
  const tl = {
    add: (expr, t, som, vol) => {
      lines.push(expr.replace(/^gsap\./, "tl.").replace(/\)$/, `, ${num(t)});`));
      if (som && reel.sons !== false) sfx.push({ nome: som, t: num(t), vol });
    },
    som: (nome, t, vol) => reel.sons !== false && sfx.push({ nome, t: num(t), vol }),
  };
  // ev(t) = mudança grande (mais de 1% da tela: entrada de quadro, transição, explosão, zoom...).
  // ev(t, false) = mudança pequena (cabeçalho, carimbo, linha de terminal): não cobre vão no auto-ritmo.
  const eventos = [];
  const ev = (t, grande = true) => grande && eventos.push(num(t));
  // Mundo 3D atrás do palco (kit/mundo.mjs): cada marca da cena 3D conta como mudança grande.
  const mundo = prepararMundo(reel, scenes, words, total);
  if (mundo) Object.values(mundo.marcas).forEach((t) => ev(t));

  const partes = scenes.map((sc) => {
    const type = TYPES[sc.tipo];
    if (!type) throw new Error(`cena ${sc.i}: tipo "${sc.tipo}" não existe (${Object.keys(TYPES).join(", ")})`);
    const out = type(sc, ctx);
    const cabs = cabsDe(sc, CAB_PADRAO[sc.tipo]);
    const bt = batidasHtml(sc, ctx);
    return { sc, out, cabs, bt, at: makeAt(sc, words) };
  });

  // 1º passe: animações de cada cena, cabeçalhos, batidas e transições (registram os eventos grandes).
  for (const { sc, out, cabs, at } of partes) {
    const i = sc.i;
    if (i === 0) {
      tl.add(`gsap.fromTo("#s0-palco",{opacity:0,scale:1.12},{opacity:1,scale:1,duration:0.32,ease:"power3.out"})`, 0);
      ev(0);
    } else {
      const tipo = TRANSICOES[(i - 1) % TRANSICOES.length];
      tl.add(`gsap.to("#s${i - 1}-palco",{opacity:0,scale:0.92,duration:0.12,ease:"power2.in"})`, num(sc.t0 - 0.12));
      if (tipo === "zoom") tl.add(`gsap.fromTo("#s${i}-palco",{opacity:0,scale:1.3,filter:"blur(14px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:0.34,ease:"power3.out"})`, sc.t0);
      if (tipo === "chicote") tl.add(`gsap.fromTo("#s${i}-palco",{opacity:0,x:900,skewX:-14},{opacity:1,x:0,skewX:0,duration:0.32,ease:"expo.out"})`, sc.t0);
      if (tipo === "sobe") tl.add(`gsap.fromTo("#s${i}-palco",{opacity:0,y:380,rotation:4},{opacity:1,y:0,rotation:0,duration:0.36,ease:"back.out(1.3)"})`, sc.t0);
      tl.add(`gsap.set("#clarao",{backgroundColor:"${tema.claro ? "#ffffff" : ctx.acc(i)}"})`, num(sc.t0 - 0.01));
      tl.add(`gsap.to("#clarao",{keyframes:[{opacity:0.45,duration:0.04},{opacity:0,duration:0.26}]})`, sc.t0);
      tl.som(WHOOSH[(i - 1) % WHOOSH.length], num(sc.t0 - 0.08));
      ev(sc.t0);
    }
    out.anim(tl, sc, at, ev);
    if (cabs.length) cabsAnim(tl, sc, at, ev, cabs);
    batidasAnim(tl, sc, at, ev, ctx);
  }

  // 2º passe: auto-ritmo. Onde sobrou vão maior que o teto, entra brilho, zoom ou pulso na palavra mais perto.
  // Com mundo 3D a cena já se mexe o tempo todo: sem batida automática (o brilho virava um feixe no meio do 3D).
  const maxVao = reel.ritmo?.max_vao ?? (mundo ? Infinity : MAX_VAO);
  let batidasAuto = 0;
  const autos = partes.map(({ sc }) => {
    const ultima = sc.i === scenes.length - 1;
    const fim = ultima ? total : sc.t1;
    const naCena = eventos.filter((t) => t >= sc.t0 && t < fim);
    const palavras = words.slice(sc.range[0], sc.range[1]);
    const novos = preencherVaos(naCena, palavras, { inicio: sc.t0, fim, maxVao });
    autoAnim(tl, sc, novos, ev, ctx);
    batidasAuto += novos.length;
    return novos;
  });

  const sceneHtml = partes.map(({ sc, out, cabs, bt }, k) => {
    const grande = ["segue", "comenta"].includes(sc.tipo);
    return `<section id="s${sc.i}" class="clip cena" data-start="${sc.t0}" data-duration="${num(sc.t1 - sc.t0)}" data-track-index="${2 + (sc.i % 2)}" style="--acc:${ctx.acc(sc.i)};--acc-b:${ctx.acc(sc.i + 1)}">
      <div class="fx" id="s${sc.i}-fx">${bt.tela}</div>
      <div class="palco" id="s${sc.i}-palco"><div class="cam" id="s${sc.i}-cam"><div class="treme" id="s${sc.i}-treme">${cabsHtml(sc, cabs, grande)}<div class="miolo" id="s${sc.i}-miolo">${out.html}</div>${bt.palco}<div class="brilhos">${bt.brilho}${autoHtml(sc, autos[k])}</div></div></div></div>
    </section>`;
  });

  const tq = temposQuadros(scenes[0], makeAt(scenes[0], words));
  const masc = reel.mascote === false ? null : mascote(reel, scenes, total, { tempoQuadro: (k) => tq[k] });
  if (masc) masc.anim(tl);

  // Progresso (um segmento por cena, na cor da cena) e contador.
  const n = scenes.length;
  const segs = scenes.map((sc) => `<div class="seg"><div class="fill" id="pg${sc.i}" style="background:${ctx.acc(sc.i)}"></div></div>`).join("");
  if (!cinema) scenes.forEach((sc) => tl.add(`gsap.fromTo("#pg${sc.i}",{scaleX:0},{scaleX:1,duration:${num(sc.t1 - sc.t0)},ease:"none"})`, sc.t0));
  const cont = scenes.map((sc) => `<span class="ct" id="ct${sc.i}">${String(sc.i + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}</span>`).join("");
  if (!cinema) scenes.forEach((sc) => {
    if (sc.i > 0) tl.add(`gsap.set("#ct${sc.i}",{opacity:1})`, sc.t0);
    if (sc.i < n - 1) tl.add(`gsap.set("#ct${sc.i}",{opacity:0})`, sc.t1);
  });

  // Legenda em blocos: a palavra falada acende e dá um pulo; palavra-chave na cor da cena.
  const blocks = captionBlocks(scenes, words, total);
  const caps = blocks
    .map((b, bi) => {
      const ws = b.idx
        .map((j) => {
          const k = keys.has(norm(words[j].w));
          return `<span class="lw${k ? " kw" : ""}" id="w${j}">${esc(words[j].w)}</span>`;
        })
        .join(" ");
      return `<div id="cap${bi}" class="clip cap" data-start="${b.s}" data-duration="${num(b.e - b.s)}" data-track-index="${6 + (bi % 2)}" style="--acc:${ctx.acc(b.cena)}"><div class="cap-box">${ws}</div></div>`;
    })
    .join("\n");
  blocks.forEach((b) => {
    const cor = cinema ? coresCinema(reel.legenda, destaque) : coresLegenda(tema, ctx.acc(b.cena));
    b.idx.forEach((j, k) => {
      const isKey = keys.has(norm(words[j].w));
      tl.add(`gsap.set("#w${j}",{color:"${isKey ? cor.chave : cor.ativa}"})`, words[j].s);
      tl.add(`gsap.fromTo("#w${j}",{scale:${isKey ? 1.22 : 1.12}},{scale:1,duration:0.18,ease:"power2.out",immediateRender:false})`, words[j].s);
      if (k + 1 < b.idx.length) tl.add(`gsap.set("#w${j}",{color:"${isKey ? cor.chaveInativa : cor.inativa}"})`, words[b.idx[k + 1]].s);
    });
  });

  const fd = fundo(tema, scenes, total);
  fd.anim(tl);

  let trilhaTag = "";
  let faixaUsada = null;
  if (reel.trilha !== false) {
    // Sem faixa fixada, uma do clima sorteada pelo slug; a versão de teste toca a seguinte do mesmo clima (sem herdar
    // início e volume da do perfil). Sem volume, 22 dB abaixo da voz.
    let cfg = reel.trilha ?? {};
    let faixa = faixaDoReel(cfg, { catalogo, semente: reel.slug ?? path.basename(dir) });
    if (reel.versao === "teste" && !cfg.arquivo && faixa.arquivo) {
      const outra = outraDoClima(faixa.arquivo, cfg.clima, catalogo);
      if (outra !== faixa.arquivo) {
        const { inicio: _i, volume: _v, ...resto } = cfg;
        cfg = resto;
        faixa = { arquivo: outra };
      }
    }
    const tr = faixa.aviso ? faixa : prepararTrilha(dir, { ...cfg, ...faixa }, total, path.join(dir, audio), { catalogo });
    if (tr.aviso) avisos.push(tr.aviso);
    else {
      faixaUsada = faixa.arquivo;
      trilhaTag = `<audio id="trilha" src="${tr.src}" data-start="0" data-duration="${total}" data-track-index="11" data-volume="${tr.volume}"></audio>`;
    }
  }

  const titulo = String(reel.titulo ?? "")
    .split("|")
    .map((l) => `<div class="tt-l">${rich(l.trim())}</div>`)
    .join("");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<title>${esc(reel.slug ?? "reel")}</title>
<script src="assets/vendor/gsap.min.js"></script>
<style>
${fs.readFileSync(path.join(KIT, "assets", "fonts", "fonts.css"), "utf8").replace(/url\("fonts\//g, 'url("assets/fonts/')}
${cssTema(tema)}
${fs.readFileSync(path.join(KIT, "kit.css"), "utf8")}
</style>
</head>
<body data-tema="${tema.nome}"${cinema ? ` data-estilo="cinema" style="--destaque:${destaque}"` : ""}>
<div id="root" data-composition-id="main" data-start="0" data-width="${W}" data-height="${H}" data-duration="${total}" data-fps="30">
  ${fd.html}
  ${mundo ? mundo.canvas : ""}
  <div id="pulso"></div>
  <div id="clarao"></div>
  <div id="scrim"></div>
  ${cinema ? "" : `<div id="topo"><div class="segs">${segs}</div><div class="cont">${cont}</div></div>`}
  <div id="titulo" class="linhas-${String(reel.titulo ?? "").split("|").length}">${titulo}</div>
  ${sceneHtml.join("\n")}
  ${masc ? masc.html : ""}
  ${caps}
  ${sfxAudio(sfx, total, sons)}
  ${trilhaTag}
  <audio id="narracao" src="${audio}" data-start="0" data-duration="${total}" data-track-index="10" data-volume="1"></audio>
</div>
<script>
window.__timelines = window.__timelines || {};
${mundo ? mundo.prelude : ""}
const tl = gsap.timeline({ paused: true });
${lines.join("\n")}
${mundo ? mundo.relogio : ""}
window.__timelines["main"] = tl;
</script>
${mundo ? mundo.modulo : ""}
</body>
</html>
`;

  fs.writeFileSync(path.join(dir, "index.html"), html);
  copyAssets(dir, { sons, autor, usados: new Set(sfxUsados(html)), comTrilha: Boolean(trilhaTag) });
  avisos.push(...sons.avisos());
  for (const [f, body] of Object.entries(projectFiles(reel.slug ?? path.basename(dir)))) {
    if (!fs.existsSync(path.join(dir, f))) fs.writeFileSync(path.join(dir, f), body);
  }
  return { total, scenes: scenes.length, blocks: blocks.length, maiorVao: maiorVao(eventos, 0, total), batidasAuto, autosPorCena: autos.map((a) => a.length), trilha: faixaUsada, avisos };
}

// Bibliotecas de terceiros saem do node_modules (npm install), nunca de cópia no repositório.
const RAIZ = path.resolve(KIT, "..");
const VENDOR_NPM = {
  "gsap.min.js": ["gsap", "dist", "gsap.min.js"],
  "three.module.min.js": ["three", "build", "three.module.min.js"],
  "three.core.min.js": ["three", "build", "three.core.min.js"],
};

const sfxUsados = (html) => [...html.matchAll(/src="assets\/sfx\/([^"]+)\.mp3"/g)].map((m) => m[1]);

function copyAssets(dir, { sons, autor, usados, comTrilha }) {
  const dst = path.join(dir, "assets");
  // Montar de novo na mesma pasta não deixa foto, som ou música de antes (nem vazam pra quem receber a pasta).
  fs.rmSync(path.join(dst, "sfx"), { recursive: true, force: true });
  if (fs.existsSync(path.join(dst, "img"))) for (const f of fs.readdirSync(path.join(dst, "img"))) if (/^perfil\./i.test(f)) fs.rmSync(path.join(dst, "img", f), { force: true });
  if (!comTrilha) fs.rmSync(path.join(dst, "trilha.mp3"), { force: true });
  for (const sub of ["fonts", "vendor"]) {
    fs.mkdirSync(path.join(dst, sub), { recursive: true });
    for (const f of fs.readdirSync(path.join(KIT, "assets", sub))) {
      if (/\.(css|md|txt)$/.test(f)) continue;
      fs.copyFileSync(path.join(KIT, "assets", sub, f), path.join(dst, sub, f));
    }
  }
  for (const [f, partes] of Object.entries(VENDOR_NPM)) {
    const origem = path.join(RAIZ, "node_modules", ...partes);
    if (!fs.existsSync(origem)) throw new Error(`falta ${partes.join("/")} no node_modules: rode npm install na raiz do repositório`);
    fs.copyFileSync(origem, path.join(dst, "vendor", f));
  }
  if (autor.foto) {
    fs.mkdirSync(path.join(dst, "img"), { recursive: true });
    fs.copyFileSync(autor.foto, path.join(dst, "img", `perfil${path.extname(autor.foto).toLowerCase()}`));
  }
  if (usados.size) {
    fs.mkdirSync(path.join(dst, "sfx"), { recursive: true });
    for (const nome of usados) fs.copyFileSync(path.join(sons.dir, `${nome}.mp3`), path.join(dst, "sfx", `${nome}.mp3`));
  }
}

function projectFiles(slug) {
  return {
    "hyperframes.json": JSON.stringify(
      { $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", paths: { assets: "assets" }, media: { autoProxy: true } },
      null,
      2,
    ),
    "meta.json": JSON.stringify({ id: slug, name: slug, createdAt: new Date().toISOString() }, null, 2),
  };
}

// Rodado direto (compara o caminho real: pasta aberta por junção ou link simbólico também conta).
if (process.argv[1] && fs.realpathSync.native(path.resolve(process.argv[1])) === fs.realpathSync.native(fileURLToPath(import.meta.url))) {
  const dir = path.resolve(process.argv[2] ?? ".");
  const i = process.argv.indexOf("--versao");
  const r = build(dir, { versao: i > -1 ? process.argv[i + 1] : undefined });
  console.log(`[kit] ${dir}\\index.html: ${r.scenes} cenas, ${r.blocks} blocos de legenda, ${r.total}s, maior vão ${r.maiorVao}s, ${r.batidasAuto} batidas automáticas`);
  for (const a of r.avisos) console.log(`[kit] aviso: ${a}`);
}
