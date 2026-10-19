// Texto compartilhado pelo kit (build, ritmo, validador): normalização de palavra e quebra em tokens.
export const norm = (w) =>
  String(w).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
export const tokens = (t) => String(t).split(/\s+/).filter(Boolean);

// Âncora (palavra falada que dispara um efeito): o 1º token dela, inteiro ou como começo de palavra com 4+ letras.
export function bateAncora(w, ancora) {
  const want = norm(tokens(ancora ?? "")[0] ?? "");
  const n = norm(w);
  return Boolean(want) && (n === want || (want.length >= 4 && n.startsWith(want)));
}

// Cena com "antes" (um parágrafo, duas telas): a fala até a palavra `ate` e o resto. null se `ate` não está na fala
// ou é a última palavra.
export function dividirFala(fala, ate) {
  const t = tokens(fala ?? "");
  const want = norm(tokens(ate ?? "")[0] ?? "");
  const k = want ? t.findIndex((w) => norm(w) === want) : -1;
  return k < 0 || k === t.length - 1 ? null : [t.slice(0, k + 1).join(" "), t.slice(k + 1).join(" ")];
}
