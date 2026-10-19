// O roteiro que você revisa e aprova (roteiro.md na pasta do reel), de e para markdown.
// Só texto: título na tela, narração (um parágrafo por cena), legenda e, se o reel pede comentário, a palavra e a DM.
// A parte visual (tipo de cena, batidas, tema) não aparece aqui e é montada depois da aprovação.

export const SECOES = {
  titulo: "Título na tela",
  narracao: "Narração",
  legenda: "Legenda do post",
  comenta: "Comenta e DM",
};
const OBRIGATORIAS = [SECOES.titulo, SECOES.narracao, SECOES.legenda];
const DICA_NARRACAO = "(cada parágrafo vira uma cena)";

// Rótulo no markdown -> [onde guarda, campo]
const CAMPOS_DM = [
  ["Palavra", "reel", "palavra"],
  ["DM no vídeo", "dm_video", "texto"],
  ["Botão no vídeo", "dm_video", "botao"],
];

export function paraMarkdown({ reel, legenda }) {
  const l = [`## ${SECOES.titulo}`, ...String(reel.titulo).split(" | "), "", `## ${SECOES.narracao}`, DICA_NARRACAO];
  for (const c of reel.cenas) l.push("", c.fala);
  l.push("", `## ${SECOES.legenda}`, String(legenda ?? "").trim());
  if (reel.palavra) {
    const fonte = { reel, dm_video: reel.dm ?? {} };
    l.push("", `## ${SECOES.comenta}`);
    for (const [rotulo, onde, campo] of CAMPOS_DM) {
      const v = fonte[onde]?.[campo];
      if (v !== undefined && v !== null && v !== "") l.push(`${rotulo}: ${v}`);
    }
  }
  return l.join("\n") + "\n";
}

// ─── volta ────────────────────────────────────────────────────────────────────

// Título "## " fora da lista ou repetido é erro: em silêncio ele cortaria a seção anterior.
// O que vem antes do primeiro "## " (a linha "Aprovado:" e a dica) não é roteiro.
function secoes(md) {
  const out = new Map();
  const desconhecidas = [];
  const conhecidas = Object.values(SECOES);
  let atual = null;
  for (const linha of md.replace(/\r\n?/g, "\n").split("\n")) {
    const m = /^## (?!#)(.+?)\s*$/.exec(linha);
    if (m) {
      atual = m[1];
      if (!conhecidas.includes(atual)) desconhecidas.push(atual);
      else if (out.has(atual)) throw new Error(`seção "${atual}" aparece 2 vezes`);
      out.set(atual, []);
    } else if (atual) out.get(atual).push(linha);
  }
  return { mapa: out, desconhecidas };
}

const usarSo = () => `use só: ${Object.values(SECOES).join(", ")}`;

/** Blocos separados por linha em branco; linhas de um bloco viram uma só, com espaço. */
function paragrafos(linhas) {
  const out = [];
  let buf = [];
  for (const l of [...linhas, ""]) {
    if (l.trim()) buf.push(l.trim());
    else if (buf.length) {
      out.push(buf.join(" "));
      buf = [];
    }
  }
  return out;
}

function lerComenta(linhas) {
  const dados = { reel: {}, dm_video: {} };
  for (const l of linhas) {
    if (!l.trim()) continue;
    const k = l.indexOf(": ");
    const rotulo = k > 0 ? l.slice(0, k).trim() : null;
    const campo = CAMPOS_DM.find(([r]) => r === rotulo);
    if (!campo) throw new Error(`linha não reconhecida em "${SECOES.comenta}": ${l.trim()} (use ${CAMPOS_DM.map(([r]) => `"${r}: ..."`).join(", ")})`);
    dados[campo[1]][campo[2]] = l.slice(k + 2).trim();
  }
  if (!dados.reel.palavra) throw new Error(`"${SECOES.comenta}" precisa da linha "Palavra: ..."`);
  return dados;
}

export function deMarkdown(md) {
  const { mapa: s, desconhecidas } = secoes(String(md ?? ""));
  const achei = desconhecidas.length ? ` (achei ${desconhecidas.map((d) => `"${d}"`).join(", ")}, que não existe; ${usarSo()})` : "";
  for (const nome of OBRIGATORIAS) if (!s.has(nome)) throw new Error(`falta a seção "${nome}"${achei}`);
  if (desconhecidas.length) {
    throw new Error(`seção "${desconhecidas[0]}" não existe (${usarSo()}); se era texto, tire o "## " do começo da linha`);
  }

  const titulo = s.get(SECOES.titulo).map((l) => l.trim()).filter(Boolean).join(" | ");
  if (!titulo) throw new Error(`"${SECOES.titulo}" está vazio`);
  // A dica sai linha a linha: colada na 1ª fala, ela viraria narração.
  const falas = paragrafos(s.get(SECOES.narracao).filter((l) => l.trim() !== DICA_NARRACAO));
  if (!falas.length) throw new Error(`"${SECOES.narracao}" está vazia`);
  const legenda = s.get(SECOES.legenda).join("\n").trim();
  if (!legenda) throw new Error(`"${SECOES.legenda}" está vazia`);

  let palavra = null, dm_video = null;
  if (s.has(SECOES.comenta)) {
    const c = lerComenta(s.get(SECOES.comenta));
    palavra = c.reel.palavra;
    dm_video = Object.keys(c.dm_video).length ? c.dm_video : null;
  }
  return { titulo, falas, legenda, palavra, dm_video };
}
