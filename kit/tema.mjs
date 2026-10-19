// Temas do kit: paleta e fundo vivo. `reel.tema` escolhe; sem ele, vale o TEMA_PADRAO.
// Cada cena pega um acento em rodízio (`--acc`), e o fundo muda de tom a cada cena. A música não vem do tema:
// sai do clima do reel (kit/trilhas.mjs).

// Cor de destaque do estilo "cinema": a palavra-chave do título, o número e a palavra falada na legenda.
// Varia pelo assunto: `reel.cor` com um destes nomes ou um hex. A versão de teste pega a próxima da lista.
export const DESTAQUES = {
  ouro: "#f6b73c",
  laranja: "#ff8a3d",
  coral: "#ff6b6b",
  rosa: "#ff7ab6",
  lilas: "#b794f6",
  ciano: "#4fd1e8",
  verde: "#5ee38a",
  amarelo: "#ffd60a",
};

export const TEMAS = {
  // Quase preto com manchas de cor andando e brilho neon.
  neon: {
    nome: "neon",
    base: "#07060d",
    painel: "#13111d",
    painel2: "#1c1929",
    linha: "rgba(255, 255, 255, 0.13)",
    tinta: "#f7f5ff",
    nevoa: "#cdc8e0",
    cinza: "#8f8aa8",
    escuro: "#0b0a12",
    cores: ["#ff3d8b", "#22d3ee", "#a3e635", "#ff8a3d", "#a78bfa", "#facc15"],
    manchas: ["#ff3d8b", "#22d3ee", "#8b5cf6", "#ff8a3d"],
    fundo: "manchas",
    claro: false,
    brilho: true,
    fonteNumero: "serif",
  },
  // Fundo inteiro em degradê vivo andando, cards claros com texto escuro: o mais colorido.
  gradiente: {
    nome: "gradiente",
    base: "#4c1d95",
    painel: "#ffffff",
    painel2: "#f3efff",
    linha: "rgba(20, 14, 48, 0.14)",
    tinta: "#ffffff",
    nevoa: "#f4f0ff",
    cinza: "#5c5577",
    escuro: "#160f33",
    cores: ["#ffd60a", "#00e5c0", "#ff4d6d", "#3a86ff", "#fb5607", "#c77dff"],
    degrades: [
      ["#6d28d9", "#db2777", "#f97316"],
      ["#0ea5e9", "#6366f1", "#d946ef"],
      ["#be123c", "#9d174d", "#6d28d9"],
      ["#10b981", "#0ea5e9", "#6366f1"],
      ["#8b5cf6", "#ec4899", "#f43f5e"],
      ["#2563eb", "#7c3aed", "#db2777"],
    ],
    fundo: "degrade",
    claro: true,
    brilho: false,
    fonteNumero: "serif",
  },
  // Pixel art e fliperama: paleta retrô saturada, estrelas, chão de grade andando, scanline. Casa com o bonequinho.
  fliperama: {
    nome: "fliperama",
    base: "#0b0b2b",
    painel: "#17174d",
    painel2: "#22226a",
    linha: "rgba(255, 255, 255, 0.16)",
    tinta: "#fdfcff",
    nevoa: "#d6d4ff",
    cinza: "#9b98d8",
    escuro: "#06061a",
    cores: ["#ffd23f", "#ee4266", "#3bceac", "#ff8811", "#9d4edd", "#0ead69"],
    manchas: ["#7b2ff7", "#ee4266", "#3bceac"],
    fundo: "pixel",
    claro: false,
    brilho: false,
    fonteNumero: "pixel",
  },
  // Preto quente e ouro.
  ouro: {
    nome: "ouro",
    base: "#0c0a0b",
    painel: "#131013",
    painel2: "#1b1714",
    linha: "rgba(244, 239, 231, 0.14)",
    tinta: "#f4efe7",
    nevoa: "#c7c1b6",
    cinza: "#8a8378",
    escuro: "#050405",
    cores: ["#e0ae3a", "#e9c247", "#d97757", "#c98a2b"],
    manchas: ["#e0ae3a", "#d97757"],
    fundo: "manchas",
    claro: false,
    brilho: false,
    fonteNumero: "serif",
  },
};

export const TEMA_PADRAO = "neon";

export function temaDe(reel = {}) {
  const nome = reel.tema ?? TEMA_PADRAO;
  const t = TEMAS[nome];
  if (!t) throw new Error(`tema "${nome}" não existe (${Object.keys(TEMAS).join(", ")})`);
  return t;
}

// Mistura duas cores "#rrggbb" (t = 0 dá a, t = 1 dá b).
export function misturar(a, b, t) {
  const p = (h) => [0, 2, 4].map((k) => parseInt(h.replace("#", "").slice(k, k + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, k) => Math.round(v + (y[k] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

export const acento = (tema, i) => tema.cores[((i % tema.cores.length) + tema.cores.length) % tema.cores.length];

export function cssTema(t) {
  const v = {
    base: t.base,
    painel: t.painel,
    painel2: t.painel2,
    linha: t.linha,
    tinta: t.tinta,
    nevoa: t.nevoa,
    cinza: t.cinza,
    escuro: t.escuro,
    // texto sobre painel: escuro quando o painel é claro
    ptinta: t.claro ? t.escuro : t.tinta,
    pnevoa: t.claro ? t.cinza : t.nevoa,
    ...Object.fromEntries(t.cores.map((c, k) => [`acc${k}`, c])),
  };
  return `:root { ${Object.entries(v).map(([k, x]) => `--${k}: ${x};`).join(" ")} }`;
}
