// Fala livre: você grava a narração com as suas palavras e o texto de cada cena vira o que você falou.
// 1. Viradas de parágrafo escolhidas juntas: palavras que batem com cada parágrafo (peso maior), pausa e o
//    instante em que ele apertou Espaço no teleprompter (marcas).
// 2. Dentro de cada parágrafo, palavra por palavra: o que bate com o roteiro mantém a grafia do roteiro
//    (número em algarismo, coloquial x formal, palavra colada ou separada, ordinal, hora e moeda contam como
//    iguais); o resto é o que ele falou. Palavra de apoio que a transcrição apagou ("tipo", "aí") fica.
import { norm, tokens } from "./texto.mjs";
import { align } from "./align.mjs";

// Tomada recusada pela qualidade (parágrafo pulado, fala de outro roteiro): regravar resolve, tentar de novo não.
// Falha de rede ou de ferramenta é Error comum, e tentar de novo pode resolver.
export class Reprovada extends Error {}

// Número por extenso (a transcrição alterna "vinte" e "20" na mesma fala; o roteiro escreve por extenso).
const UNI = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CEM = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
const ate999 = (n) => (n < 20 ? UNI[n] : n < 100 ? DEZ[Math.floor(n / 10)] + (n % 10 ? ` e ${UNI[n % 10]}` : "") : n === 100 ? "cem" : CEM[Math.floor(n / 100)] + (n % 100 ? ` e ${ate999(n % 100)}` : ""));
export function porExtenso(n) {
  for (const [v, um, varios] of [[1e9, "bilhão", "bilhões"], [1e6, "milhão", "milhões"], [1e3, "mil", "mil"]]) {
    if (n < v) continue;
    const q = Math.floor(n / v);
    const r = n % v;
    const cabeca = v === 1e3 && q === 1 ? "mil" : `${ate999(q)} ${q === 1 ? um : varios}`;
    return r ? `${cabeca}${r < 100 || r % 100 === 0 ? " e " : " "}${porExtenso(r)}` : cabeca;
  }
  return ate999(n);
}

const ORDINAL = ["", "primeiro", "segundo", "terceiro", "quarto", "quinto", "sexto", "sétimo", "oitavo", "nono", "décimo"];
const MOEDA = { "R$": ["real", "reais"], "US$": ["dólar", "dólares"] };
const NUM = "(\\d{1,3}(?:\\.\\d{3})+|\\d{1,12})";
const RE_MOEDA = new RegExp(`^(R\\$|US\\$)\\s?${NUM}(?:,(\\d{1,2}))?(?:\\s(\\p{L}+))?[^\\d\\p{L}]*$`, "u");
const RE_NUM_ESCALA = new RegExp(`^${NUM}(?:,(\\d))?\\s(\\p{L}+)[^\\d\\p{L}]*$`, "u");
const RE_VEZES = /^(\d{1,3})x[^\d\p{L}]*$/u;
const RE_VALOR = /^\d[\d.]*(?:,\d{1,2})?[^\d\p{L}]*$/u;
const ESCALAS = { mil: ["mil", "mil"], milhao: ["milhão", "milhões"], milhoes: ["milhão", "milhões"], bilhao: ["bilhão", "bilhões"], bilhoes: ["bilhão", "bilhões"] };
// "100 mil", "1,5 milhão" (= "um milhão e meio"), "1,5 mil" (= "mil e quinhentos"); outro decimal não é tratado.
function comEscala(n, dec, escala) {
  if (dec && dec !== "5") return null;
  const [um, varios] = ESCALAS[escala];
  return [...(escala === "mil" && n === 1 ? [] : extenso(n)), norm(n === 1 ? um : varios), ...(dec ? ["e", escala === "mil" ? "quinhentos" : "meio"] : [])];
}
const RE_ORDINAL = /^(\d{1,2})([ºª°])[^\d\p{L}]*$/u;
const RE_HORA = /^(\d{1,2})h(\d{2})?[^\d\p{L}]*$/u;
const RE_NUMERO = new RegExp(`^${NUM}(%?)[^\\d\\p{L}]*$`, "u");
const inteiro = (s) => Number(s.replace(/\./g, ""));
const extenso = (n) => porExtenso(n).split(" ").map(norm);
// Coloquial = a forma que a transcrição às vezes escreve no lugar.
const COLOQUIAL = { pra: ["para"], pro: ["para", "o"], pros: ["para", "os"], pras: ["para", "as"], ta: ["esta"], to: ["estou"], ce: ["voce"], ces: ["voces"], num: ["em", "um"], numa: ["em", "uma"], ne: ["nao", "e"] };
// Só pra número que veio em algarismo ("2 horas" no lugar de "duas horas"); palavra dita é comparada como foi dita.
const FEMININO = { uma: "um", duas: "dois", duzentas: "duzentos", trezentas: "trezentos", quatrocentas: "quatrocentos", quinhentas: "quinhentos", seiscentas: "seiscentos", setecentas: "setecentos", oitocentas: "oitocentos", novecentas: "novecentos", quatorze: "catorze" };
// Palavras de apoio que a transcrição sem verbatim apaga mesmo quando ele falou.
const APOIO = new Set(["tipo", "ne", "ai", "entao", "assim", "olha", "cara", "mano", "bom", "ta", "sabe", "po", "enfim"]);
// O que a transcrição costuma ouvir errado em português ("Claude" vira "Cloud" em quase toda tomada). Na comparação
// valem como a mesma palavra; palavra nova que você falou sai com a grafia certa.
const OUVIDO = { cloud: "claude" };
const GRAFIA = { cloud: "Claude" };
// Nome de produto de nuvem ("Google Cloud") não é o Claude.
const MARCA_DE_NUVEM = new Set(["google", "aws", "oracle", "microsoft", "ibm", "salesforce"]);
const grafia = (w, anterior) => {
  const certa = GRAFIA[norm(w)];
  return certa && !MARCA_DE_NUVEM.has(norm(anterior ?? "")) ? w.replace(/\p{L}+/u, certa) : w;
};

export function subpalavras(w) {
  let m;
  if ((m = RE_MOEDA.exec(w))) {
    const n = inteiro(m[2]);
    if (m[4]) {
      // "R$ 100 mil" = "cem mil reais"; "R$ 1,5 milhão" = "um milhão e meio de reais".
      const esc = norm(m[4]);
      const partes = ESCALAS[esc] && comEscala(n, m[3], esc);
      if (partes) return { num: true, partes: [...partes, ...(esc === "mil" ? [] : ["de"]), norm(MOEDA[m[1]][1])] };
    } else {
      const cents = Number((m[3] ?? "0").padEnd(2, "0"));
      return { num: true, partes: [...extenso(n), norm(MOEDA[m[1]][n === 1 ? 0 : 1]), ...(cents ? ["e", ...extenso(cents), "centavos"] : [])] };
    }
  }
  if ((m = RE_NUM_ESCALA.exec(w)) && ESCALAS[norm(m[3])]) {
    const partes = comEscala(inteiro(m[1]), m[2], norm(m[3]));
    if (partes) return { num: true, partes };
  }
  if ((m = RE_VEZES.exec(w))) {
    const n = Number(m[1]);
    return { num: true, partes: [...extenso(n), n === 1 ? "vez" : "vezes"] };
  }
  if ((m = RE_ORDINAL.exec(w)) && Number(m[1]) >= 1 && Number(m[1]) <= 10) {
    const o = ORDINAL[Number(m[1])];
    return { num: true, partes: [norm(m[2] === "ª" ? `${o.slice(0, -1)}a` : o)] };
  }
  if ((m = RE_HORA.exec(w))) {
    const h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    return { num: true, partes: [...extenso(h), h === 1 ? "hora" : "horas", ...(min === 30 ? ["e", "meia"] : min ? ["e", ...extenso(min)] : [])] };
  }
  if ((m = RE_NUMERO.exec(w))) return { num: true, partes: [...extenso(inteiro(m[1])), ...(m[2] ? ["por", "cento"] : [])] };
  const k = norm(w);
  return { num: false, partes: COLOQUIAL[k] ?? (k ? [OUVIDO[k] ?? k] : []) };
}

// Retomada (16/10): ele erra, comenta ("eu errei essa parte, pode cortar", "vou falar de novo") e repete o trecho.
// Sai do trecho errado até o fim do comentário; fica a repetição. Três provas juntas (revisão de 16/10, que pegou
// corte no parágrafo errado e fala boa cortada quando ele diz "errado" ou "de novo" com as palavras dele):
// 1. o comentário: expressão que não está no roteiro;
// 2. a repetição começa logo depois dele, com as mesmas palavras do começo do trecho errado (até 60 palavras antes);
// 3. o roteiro continua coberto: cortar não pode tirar do áudio fala do roteiro que a repetição não refez (folga de
//    15% do trecho, pra palavra que ele trocou ao refazer).
// Comentário sem corte que passe nas três vira aviso pra eu ouvir.
const GATILHOS = [["errei"], ["errado"], ["cortar"], ["corta"], ["regravar"], ["repetir"], ["novamente"], ["de", "novo"], ["outra", "vez"]];
const DEPOIS_DO_COMENTARIO = 25;
const TRECHO_MAXIMO = 60;
const FOLGA_ROTEIRO = 0.15;

function temSequencia(lista, seq) {
  for (let i = 0; i + seq.length <= lista.length; i++) if (seq.every((x, k) => lista[i + k] === x)) return true;
  return false;
}

export function acharRetomadas(ouvido, falas = []) {
  const n = ouvido.map((h) => norm(h.w));
  const roteiro = falas.flatMap((f) => tokens(f).map(norm));
  const validos = GATILHOS.filter((g) => !temSequencia(roteiro, g));
  const cortes = [];
  const avisos = [];
  const folga = (i) => (i === 0 ? Math.min(0.08, ouvido[0].s) : Math.min(0.08, (ouvido[i].s - ouvido[i - 1].e) / 2));
  const igualDesde = (p, q) => {
    let k = 0;
    while (p + k < q && q + k < n.length && n[p + k] === n[q + k]) k++;
    return k;
  };
  // Quanto do roteiro a fala cobre (sem os cortes): cortar fala boa derruba esse número.
  const cobre = (fora) => lcsConta(roteiro, n.filter((_, i) => !fora.some(([a, b]) => i >= a && i < b)));
  const feitos = () => cortes.map((c) => [c.de, c.ate]);
  let base = null;
  for (let t = 0; t < n.length; t++) {
    const g = validos.find((x) => x.every((w, k) => n[t + k] === w));
    if (!g) continue;
    const inicio = Math.max(cortes.at(-1)?.ate ?? 0, t - TRECHO_MAXIMO);
    base ??= cobre(feitos());
    let achou = null;
    for (let q = t + g.length; q < Math.min(n.length, t + g.length + DEPOIS_DO_COMENTARIO) && !achou; q++) {
      const candidatos = [];
      for (let p = inicio; p < t; p++) {
        const run = igualDesde(p, q);
        if (run >= 2) candidatos.push({ p, q, run });
      }
      candidatos.sort((x, y) => y.run - x.run || y.p - x.p);
      achou = candidatos.find((c) => cobre([...feitos(), [c.p, c.q]]) >= base - Math.max(1, FOLGA_ROTEIRO * (t - c.p)));
    }
    if (!achou) {
      avisos.push({ em: ouvido[t].s, texto: ouvido.slice(Math.max(0, t - 2), t + g.length + 3).map((h) => h.w).join(" ") });
      t += g.length - 1;
      continue;
    }
    const { p, q } = achou;
    cortes.push({
      de: p,
      ate: q,
      a: Math.round((ouvido[p].s - folga(p)) * 1000) / 1000,
      b: Math.round((ouvido[q].s - folga(q)) * 1000) / 1000,
      texto: ouvido.slice(p, q).map((h) => h.w).join(" "),
    });
    base = cobre(feitos());
    t = q - 1;
  }
  return { cortes, avisos };
}

// As palavras e as marcas do Espaço no tempo do áudio sem os trechos cortados (cada corte [a, b) some).
export function semRetomadas(ouvido, cortes, marcas) {
  const mover = (t) => {
    let menos = 0;
    for (const c of cortes) {
      if (t >= c.b) menos += c.b - c.a;
      else if (t > c.a) return Math.round((c.a - menos) * 1000) / 1000;
    }
    return Math.round((t - menos) * 1000) / 1000;
  };
  const fora = new Set(cortes.flatMap((c) => Array.from({ length: c.ate - c.de }, (_, k) => c.de + k)));
  return {
    palavras: ouvido.filter((_, i) => !fora.has(i)).map((h) => ({ ...h, s: mover(h.s), e: mover(h.e) })),
    marcas: Array.isArray(marcas) ? marcas.map((t) => (t == null ? t : mover(t))) : marcas,
  };
}

// Transcrição da ElevenLabs (scribe_v2 sem verbatim): só as palavras.
export function palavrasDaTranscricao(stt) {
  return (stt.words ?? []).filter((w) => w.type === "word" && String(w.text).trim()).map((w) => ({ w: w.text, s: w.start, e: w.end }));
}

// "R$" e o número logo depois são uma palavra só, e o número e a escala que vem depois ("100 mil", "1,5 milhão").
function juntarMoeda(ws) {
  const out = [];
  for (let j = 0; j < ws.length; j++) {
    let { w, e } = ws[j];
    let k = j;
    if (/^(R\$|US\$)$/.test(w) && ws[k + 1] && RE_VALOR.test(ws[k + 1].w)) ({ e } = ws[++k]), (w = `${w} ${ws[k].w}`);
    if (/^\d[\d.]*(?:,\d{1,2})?$/.test(w.split(" ").at(-1)) && ws[k + 1] && ESCALAS[norm(ws[k + 1].w)]) ({ e } = ws[++k]), (w = `${w} ${ws[k].w}`);
    out.push({ ...ws[j], w, e });
    j = k;
  }
  return out;
}

const FIM_DE_FRASE = /[.?!…]["”']?$/;
const PONTUACAO_FINAL = /[^\p{L}\p{N}]+$/u;
const maiuscula = (w) => w.replace(/\p{L}/u, (c) => c.toUpperCase());
const minuscula = (w) => w.replace(/\p{L}/u, (c) => c.toLowerCase());
const comecaMinuscula = (w) => /^\P{L}*\p{Ll}/u.test(w);
const trocarPontuacao = (w, de) => w.replace(PONTUACAO_FINAL, "") + (PONTUACAO_FINAL.exec(de)?.[0] ?? "");

function lcsConta(a, b) {
  if (!a.length || !b.length) return 0;
  let prev = new Int32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Int32Array(b.length + 1);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

// Viradas: lim[c] = primeira palavra ouvida da cena c (lim[0] = 0, lim[n] = total).
function viradas(subCena, tamCena, heard, subOuvida, marcas) {
  const n = subCena.length;
  const H = heard.length;
  if (H < n) throw new Reprovada(`a gravação tem ${H} palavra(s) pra ${n} parágrafos: você pulou parágrafos? Regrava.`);
  if (n === 1) return [0, H];
  const gap = (b) => heard[b].s - heard[b - 1].e;
  // Toda fronteira entre palavras é candidata (a virada real pode ter só 0,14 s, menor que uma hesitação que
  // a transcrição apagou). Revisão 3 em contexto limpo, 14/10.
  const C = Array.from({ length: H + 1 }, (_, b) => b);
  // Palavras que batem entre a cena c e o trecho que começa em i, crescendo palavra a palavra.
  const memo = new Map();
  const lcsDe = (c, i) => {
    const k = c * (H + 1) + i;
    if (memo.has(k)) return memo.get(k);
    const A = subCena[c];
    let row = new Int32Array(A.length + 1);
    const out = [0];
    for (let j = i; j < Math.min(H, i + 3 * tamCena[c] + 15); j++) {
      for (const x of subOuvida[j]) {
        const nr = new Int32Array(A.length + 1);
        for (let q = 1; q <= A.length; q++) nr[q] = A[q - 1] === x ? row[q - 1] + 1 : Math.max(row[q], nr[q - 1]);
        row = nr;
      }
      out.push(row[A.length]);
    }
    memo.set(k, out);
    return out;
  };
  const lcs = (c, i, j) => lcsDe(c, C[i])[C[j] - C[i]] ?? 0;
  // Pausa vale até 4 pontos (1 s ou mais); o Espaço vale até 4 e só perto (some em 1,5 s): Espaço apertado
  // atrasado não arrasta palavra pro parágrafo errado. Pesos medidos no fuzz da revisão 3 (scratchpad\revisor3).
  const pontosVirada = (c, b) => {
    let p = 4 * Math.min(gap(b), 1);
    const t = marcas?.[c - 1];
    if (t != null) {
      const [a, z] = [heard[b - 1].e, heard[b].s];
      p += 4 * Math.max(0, 1 - (t < a ? a - t : t > z ? t - z : 0) / 1.5);
    }
    return p;
  };
  const f = Array.from({ length: n + 1 }, () => new Array(C.length).fill(-Infinity));
  const de = Array.from({ length: n + 1 }, () => new Array(C.length).fill(-1));
  f[0][0] = 0;
  for (let c = 1; c <= n; c++) {
    for (let j = 1; j < C.length; j++) {
      if ((c === n) !== (j === C.length - 1)) continue;
      for (let i = 0; i < j; i++) {
        if (f[c - 1][i] === -Infinity || C[j] - C[i] > 3 * tamCena[c - 1] + 15) continue;
        const v = f[c - 1][i] + 10 * lcs(c - 1, i, j) + (c < n ? pontosVirada(c, C[j]) : 0);
        if (v > f[c][j]) [f[c][j], de[c][j]] = [v, i];
      }
    }
  }
  if (f[n][C.length - 1] === -Infinity) throw new Reprovada("não consegui separar os parágrafos da gravação: grave com uma pausa entre eles");
  const lim = [H];
  for (let c = n, j = C.length - 1; c > 0; c--) lim.unshift(C[(j = de[c][j])]);
  return lim;
}

// Casamento dentro de uma cena: grupos {s: [i..], h: [j..]} de palavras do roteiro e ditas que são a mesma fala.
function casarCena(S, Hb) {
  const sS = S.map(subpalavras);
  const sH = Hb.map((h) => subpalavras(h.w));
  const subS = sS.flatMap((x, i) => x.partes.map((k) => ({ k, t: i })));
  const subH = sH.flatMap((x, j) => x.partes.map((k) => ({ k, t: j })));
  const { match } = align(subS.map((x) => x.k), subH.map((x) => ({ w: x.k, s: 0, e: 0 })));
  // Componentes ligados por subpalavras casadas; valem se os dois lados são seguidos e casaram inteiros.
  const pai = new Map();
  const raiz = (x) => (pai.get(x) === x ? x : (pai.set(x, raiz(pai.get(x))), pai.get(x)));
  const ligar = (a, b) => {
    for (const x of [a, b]) if (!pai.has(x)) pai.set(x, x);
    pai.set(raiz(a), raiz(b));
  };
  const casS = new Array(S.length).fill(0);
  const casH = new Array(Hb.length).fill(0);
  match.forEach((h, s) => {
    if (h < 0) return;
    casS[subS[s].t]++;
    casH[subH[h].t]++;
    ligar(`s${subS[s].t}`, `h${subH[h].t}`);
  });
  const comps = new Map();
  for (const x of pai.keys()) {
    const r = raiz(x);
    if (!comps.has(r)) comps.set(r, { s: [], h: [] });
    comps.get(r)[x[0]].push(Number(x.slice(1)));
  }
  const seguidos = (v) => v.every((x, k) => k === 0 || x === v[k - 1] + 1);
  const grupos = [];
  for (const g of comps.values()) {
    g.s.sort((a, b) => a - b);
    g.h.sort((a, b) => a - b);
    if (seguidos(g.s) && seguidos(g.h) && g.s.every((i) => casS[i] === sS[i].partes.length) && g.h.every((j) => casH[j] === sH[j].partes.length)) grupos.push(g);
  }
  grupos.sort((a, b) => a.h[0] - b.h[0]);
  // Trechos entre grupos: mesma fala escrita diferente (colada, separada, gênero de número em algarismo).
  const juntas = (lado, ini, tam, femin) => lado.slice(ini, ini + tam).flatMap((x) => x.partes.map((k) => (femin ? FEMININO[k] ?? k : k))).join("");
  const reparar = (a, b, c, d) => {
    if (a >= b || c >= d) return;
    let best = null;
    for (let la = 1; la <= Math.min(4, b - a); la++)
      for (let lb = 1; lb <= Math.min(4, d - c); lb++)
        for (let x = a; x + la <= b; x++)
          for (let y = c; y + lb <= d; y++) {
            if (best && la + lb <= best.la + best.lb) continue;
            const femin = sH.slice(y, y + lb).some((z) => z.num);
            const k = juntas(sS, x, la, femin);
            if (k && k === juntas(sH, y, lb, femin)) best = { x, la, y, lb };
          }
    if (!best) return;
    grupos.push({ s: [...Array(best.la).keys()].map((k) => best.x + k), h: [...Array(best.lb).keys()].map((k) => best.y + k) });
    reparar(a, best.x, c, best.y);
    reparar(best.x + best.la, b, best.y + best.lb, d);
  };
  const bordas = [{ s: [-1], h: [-1] }, ...grupos, { s: [S.length], h: [Hb.length] }];
  for (let k = 1; k < bordas.length; k++) reparar(bordas[k - 1].s.at(-1) + 1, bordas[k].s[0], bordas[k - 1].h.at(-1) + 1, bordas[k].h[0]);
  grupos.sort((a, b) => a.h[0] - b.h[0]);
  // Palavra dita duas vezes seguidas ("Oi tudo, tudo bem?" no lugar de "Oi gente, tudo bem?"): o casamento guloso
  // pega a primeira e parte a troca em dois trechos (some "gente", entra "tudo"); casa com a segunda pra troca
  // ficar num trecho só.
  const usadosH = new Set(grupos.flatMap((g) => g.h));
  const usadosS = new Set(grupos.flatMap((g) => g.s));
  for (const g of grupos) {
    const [i, j] = [g.s[0], g.h[0]];
    if (g.s.length !== 1 || g.h.length !== 1 || i === 0 || usadosS.has(i - 1) || usadosH.has(j + 1) || j + 1 >= Hb.length) continue;
    if (sH[j + 1].partes.join(" ") !== sH[j].partes.join(" ")) continue;
    usadosH.delete(j);
    usadosH.add(j + 1);
    g.h = [j + 1];
  }
  // Palavra do roteiro que só sumiu da transcrição (trecho sem palavra nova no lugar): 1 ou 2 seguidas, ou só
  // palavras de apoio, ficam como incertas (a transcrição sem verbatim apaga "tipo" e palavra que parece
  // repetida, como o 2º "ela" em "ela não tem luz, ela só reflete"); o alinhamento forçado decide depois.
  // 3 ou mais seguidas é corte dele.
  const cobertoS = new Set(grupos.flatMap((g) => g.s));
  const cobertoH = new Set(grupos.flatMap((g) => g.h));
  const manter = [];
  const finais = [{ s: [-1], h: [-1] }, ...grupos, { s: [S.length], h: [Hb.length] }];
  for (let k = 1; k < finais.length; k++) {
    const [s0, s1, h0, h1] = [finais[k - 1].s.at(-1) + 1, finais[k].s[0], finais[k - 1].h.at(-1) + 1, finais[k].h[0]];
    const novasNoTrecho = [...Array(Math.max(0, h1 - h0)).keys()].some((x) => !cobertoH.has(h0 + x) && sH[h0 + x].partes.length);
    if (novasNoTrecho) continue;
    for (let i = s0; i < s1; ) {
      if (cobertoS.has(i)) {
        i++;
        continue;
      }
      let f = i;
      while (f < s1 && !cobertoS.has(f)) f++;
      const run = [...Array(f - i).keys()].map((x) => i + x);
      if (run.length <= 2 || run.every((x) => APOIO.has(norm(S[x])))) manter.push(...run);
      i = f;
    }
  }
  return { grupos, manter: manter.sort((a, b) => a - b), sH };
}

export function falasDoQueFalou(reel, ouvido, { marcas } = {}) {
  const heard = juntarMoeda(ouvido);
  const cenas = reel.cenas.map((c) => tokens(c.fala));
  const n = cenas.length;
  const subCena = cenas.map((c) => c.flatMap((w) => subpalavras(w).partes));
  const subOuvida = heard.map((h) => subpalavras(h.w).partes);
  // Marca faltando (Espaço esquecido) vale null; as presentes têm que vir em ordem.
  const presentes = Array.isArray(marcas) ? marcas.filter((t) => t != null) : [];
  const marcasOk = Array.isArray(marcas) && marcas.length === n - 1 && presentes.every((t, k) => Number.isFinite(t) && (k === 0 || t > presentes[k - 1])) ? marcas : null;
  const lim = viradas(subCena, cenas.map((c) => c.length), heard, subOuvida, marcasOk);
  // Parágrafo pulado: quase nada do roteiro e bloco curto (ou ele passou pelo parágrafo em menos de 0,8 s).
  for (let c = 0; c < n; c++) {
    const casadas = lcsConta(subCena[c], subOuvida.slice(lim[c], lim[c + 1]).flat());
    // Com as marcas do Espaço em volta do parágrafo, quem diz se pulou é o tempo nele; sem elas, o tamanho do trecho.
    const a = c === 0 ? 0 : marcasOk?.[c - 1];
    const b = c === n - 1 ? heard.at(-1).e : marcasOk?.[c];
    const usaTempo = marcasOk && a != null && b != null;
    if (casadas < 0.3 * subCena[c].length && (usaTempo ? b - a < 0.8 : lim[c + 1] - lim[c] < 0.4 * cenas[c].length)) throw new Reprovada(`não achei a fala do parágrafo ${c + 1} na gravação: você pulou esse parágrafo? Regrava.`);
  }
  const falas = [];
  const mudancas = [];
  const origens = [];
  const incertas = [];
  cenas.forEach((S, c) => {
    const Hb = heard.slice(lim[c], lim[c + 1]);
    const { grupos, manter, sH } = casarCena(S, Hb);
    const minusculaNaCena = comecaMinuscula(S[0] ?? "");
    const abreFrase = new Set(S.map((_, i) => i).filter((i) => (i === 0 ? !minusculaNaCena : FIM_DE_FRASE.test(S[i - 1]))));
    // Itens na ordem da fala: palavra do roteiro (vinda de um grupo ou de apoio mantida) ou palavra nova.
    const itens = [];
    const fila = [...manter];
    const doGrupo = new Map(grupos.map((g) => [g.h[0], g]));
    const noGrupo = new Set(grupos.flatMap((g) => g.h.slice(1)));
    const soltarApoio = (ate) => {
      while (fila.length && fila[0] < ate) itens.push({ i: fila.shift(), ouvida: null, incerta: true });
    };
    Hb.forEach((h, j) => {
      if (noGrupo.has(j)) return;
      const g = doGrupo.get(j);
      if (g) {
        soltarApoio(g.s[0]);
        g.s.forEach((i, k) => itens.push({ i, ouvida: Hb[g.h[0]].w, fimDoGrupo: k === g.s.length - 1 ? Hb[g.h.at(-1)].w : null }));
      } else if (sH[j].partes.length) itens.push({ i: -1, ouvida: h.w });
    });
    soltarApoio(Infinity);
    const toks = [];
    const orig = [];
    const incertasCena = [];
    itens.forEach((it, k) => {
      const inicio = toks.length ? FIM_DE_FRASE.test(toks.at(-1)) : !minusculaNaCena;
      let w = it.i >= 0 ? S[it.i] : grafia(it.ouvida, toks.at(-1));
      if (it.i >= 0 && it.fimDoGrupo && itens[k + 1]?.i === -1) w = trocarPontuacao(w, it.fimDoGrupo);
      if (toks.length === 0 && minusculaNaCena) w = minuscula(w);
      else if (it.i >= 0 && abreFrase.has(it.i)) w = inicio ? maiuscula(w) : it.ouvida && comecaMinuscula(it.ouvida) ? minuscula(w) : w;
      else if (inicio) w = maiuscula(w);
      if (it.incerta) incertasCena.push(toks.length);
      for (const parte of w.split(/\s+/).filter(Boolean)) toks.push(parte), orig.push(it.i);
    });
    // Mudanças: trechos do roteiro que sumiram e palavras novas, entre palavras do roteiro que ficaram.
    let pi = 0;
    let depois = [];
    orig.forEach((o, k) => {
      if (o < 0) return void depois.push(toks[k]);
      if (o > pi || depois.length) mudancas.push({ cena: c, antes: S.slice(pi, o).join(" "), depois: depois.join(" ") });
      [pi, depois] = [o + 1, []];
    });
    if (pi < S.length || depois.length) mudancas.push({ cena: c, antes: S.slice(pi).join(" "), depois: depois.join(" ") });
    falas.push(toks.join(" "));
    origens.push(orig);
    incertas.push(incertasCena);
  });
  return { falas, mudancas, origens, incertas };
}
