// Auto-ritmo do kit: garante que a tela nunca fique mais que `maxVao` segundos sem um evento visual.
// Algo muda a cada 1 a 2 s. O teto de 1,4 s deixa folga para a métrica de 2 s.
import { norm } from "./texto.mjs";

const r3 = (x) => Math.round(x * 1000) / 1000;

// Maior intervalo entre início, eventos (dentro do trecho) e fim.
export function maiorVao(eventos, inicio, fim) {
  const pts = [inicio, ...eventos.filter((t) => t > inicio && t < fim).sort((a, b) => a - b), fim];
  let m = 0;
  for (let k = 1; k < pts.length; k++) m = Math.max(m, pts[k] - pts[k - 1]);
  return r3(m);
}

// Batidas novas para os vãos acima do teto. Cada uma cai no ponto ideal (vão dividido por igual) ou na palavra
// falada mais perto dele (até `raio` s), desde que não estoure o teto para trás nem deixe vão impossível à frente.
export function preencherVaos(eventos, palavras, { inicio = 0, fim, maxVao = 1.4, raio = 0.35, folga = 0.25 } = {}) {
  const alvo = [...eventos.filter((t) => t > inicio && t < fim).sort((a, b) => a - b), fim];
  const novos = [];
  let ultimo = inicio;
  for (const prox of alvo) {
    while (prox - ultimo > maxVao + 1e-9) {
      const vao = prox - ultimo;
      const faltam = Math.ceil(vao / maxVao - 1e-9) - 1;
      const ideal = ultimo + vao / (faltam + 1);
      let melhor = -1;
      palavras.forEach((p, j) => {
        const s = p.s;
        if (Math.abs(s - ideal) > raio || s - ultimo > maxVao || s - ultimo < folga || prox - s > faltam * maxVao) return;
        if (melhor < 0 || Math.abs(s - ideal) < Math.abs(palavras[melhor].s - ideal)) melhor = j;
      });
      const t = r3(melhor >= 0 ? palavras[melhor].s : ideal);
      novos.push({ t, j: melhor });
      ultimo = t;
    }
    ultimo = Math.max(ultimo, prox);
  }
  return novos;
}

// Índice da palavra mais forte cujo início cai em [a, b]: destaque > número > a mais longa (4+ letras). -1 se nada.
export function palavraChave(palavras, a, b, chaves = new Set()) {
  let melhor = -1;
  let nota = -1;
  palavras.forEach((p, j) => {
    if (p.s < a || p.s > b) return;
    const n = norm(p.w);
    if (!n) return;
    const v = chaves.has(n) ? 3000 + n.length : /\d/.test(p.w) ? 2000 + n.length : n.length >= 4 ? 1000 + n.length : -1;
    if (v > nota) (nota = v), (melhor = j);
  });
  return melhor;
}
