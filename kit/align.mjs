// Alinha as palavras do roteiro (falas do reel.json) às palavras ouvidas num áudio, com tempo de cada uma.
// Palavra do roteiro que não casou herda o tempo por interpolação entre as vizinhas que casaram.
import { norm } from "./texto.mjs";

export function align(script, heard) {
  const a = script.map(norm);
  const b = heard.map((h) => norm(h.w));
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const match = new Array(n).fill(-1);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) match[i++] = j++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const out = script.map((w, i) => (match[i] >= 0 ? { w, s: heard[match[i]].s, e: heard[match[i]].e } : { w, s: null, e: null }));
  // Interpola os buracos entre o fim da palavra casada anterior e o início da próxima.
  for (let i = 0; i < n; ) {
    if (out[i].s != null) { i++; continue; }
    let k = i;
    while (k < n && out[k].s == null) k++;
    const from = i > 0 ? out[i - 1].e : 0;
    const to = k < n ? out[k].s : heard.length ? heard[heard.length - 1].e : from + 0.3 * (k - i);
    const step = (to - from) / (k - i);
    for (let x = i; x < k; x++) {
      out[x].s = Math.round((from + step * (x - i)) * 1000) / 1000;
      out[x].e = Math.round((from + step * (x - i + 1)) * 1000) / 1000;
    }
    i = k;
  }
  const casou = match.map((x) => x >= 0);
  return { words: out, casadas: casou.filter(Boolean).length, total: n, casou, match };
}
