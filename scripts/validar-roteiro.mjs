#!/usr/bin/env node
// Confere o roteiro antes da aprovação e de novo antes da produção, contra o que o kit aceita.
// Uso: node scripts/validar-roteiro.mjs <pasta-do-lote | pasta-do-reel>
// Erro barra a aprovação e a produção; aviso vai junto do roteiro pra você decidir.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TIPOS, norm, tokens } from "../kit/build.mjs";
import { ICONS } from "../kit/icons.mjs";
import { dividirFala } from "../kit/texto.mjs";
import { TIPOS_QUADRO, TIPOS_BATIDA } from "../kit/batidas.mjs";
import { TEMAS, DESTAQUES } from "../kit/tema.mjs";
import { climasDe, normClima } from "../kit/trilhas.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGOS = path.join(RAIZ, "kit", "assets", "logos");
// Ritmo de reel (fala corrida, ~265 palavras por minuto) e o teto do reel curto (passar dele só avisa).
const PALAVRAS_MIN = 265;
const TETO_S = 60;

const lerJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
// Travessão e traço médio, montados pelo código (o próprio arquivo não carrega os dois caracteres).
const TRAVESSAO = new RegExp(`[${String.fromCharCode(8212, 8211)}]`);
const NAO_E_SO = /n[ãa]o [ée] s[óo](?![a-zà-ú])/i;
const NAO_E_SO_TODOS = new RegExp(NAO_E_SO.source, "gi");

// Mesma regra do makeAt do kit: palavra igual ou, com 4+ letras, começo da palavra.
export function temAncora(fala, ancora) {
  const want = norm(tokens(ancora)[0] ?? "");
  if (!want) return false;
  return tokens(fala).some((w) => {
    const n = norm(w);
    return n === want || (want.length >= 4 && n.startsWith(want));
  });
}

// Âncoras explícitas de cada tipo de cena (as que caem num tempo chutado se não estiverem na fala).
export function ancoras(c) {
  const d = c.dados ?? {};
  const a = [];
  const add = (v, onde) => v != null && a.push([v, onde]);
  if (["hook", "repo"].includes(c.tipo)) add(d.selo_em, "selo_em");
  if (c.tipo === "terminal") (d.linhas ?? []).forEach((l, k) => add(l.em, `linhas[${k}].em`));
  if (["lista", "cards"].includes(c.tipo)) (d.itens ?? []).forEach((it, k) => add(it.em, `itens[${k}].em`));
  if (["numero", "cerebro", "segue", "comenta"].includes(c.tipo)) add(d.em, "em");
  if (c.tipo === "comparar") add(d.depois?.em, "depois.em");
  if (c.tipo === "cerebro") [].concat(d.chips_em ?? []).forEach((x, k) => add(x, `chips_em[${k}]`));
  if (c.tipo === "comenta") add(d.dm_em, "dm_em");
  (c.efeitos ?? []).forEach((e, k) => add(e.em, `efeitos[${k}].em`));
  // kit v2: quadros do gancho, cabeçalhos que trocam e batidas
  (d.quadros ?? []).forEach((q, k) => (add(q.em, `quadros[${k}].em`), add(q.ate_em, `quadros[${k}].ate_em`)));
  (c.cabs ?? []).forEach((x, k) => add(x.em, `cabs[${k}].em`));
  (c.batidas ?? []).forEach((b, k) => add(b.em, `batidas[${k}].em`));
  if (c.tipo === "midia") (d.imagens ?? []).forEach((im, k) => add(im.em, `imagens[${k}].em`));
  if (c.tipo === "mundo") (d.hud ?? []).forEach((h, k) => add(h.em, `hud[${k}].em`));
  return a;
}

// Texto que aparece na tela além da legenda: cabeçalhos, carimbos e quadros (kit v2: palavra, rótulos, barras,
// mês do calendário), selo e rótulo do gancho, frase grande, itens de lista e cards, rótulo e sub do número, lados
// do comparar, chips do cérebro, painel do mundo e a etiqueta do bonequinho na cena. Mockup de terminal, chat e
// repositório mostra a coisa real (comando, conversa, dados do GitHub) e não entra.
function textosDeTela(c) {
  const d = c.dados ?? {};
  const t = [];
  const add = (v) => typeof v === "string" && v.trim() && t.push(v);
  (c.cabs ?? []).forEach((x) => add(x.t));
  (c.batidas ?? []).forEach((b) => add(b.texto));
  (d.quadros ?? []).forEach((q) => {
    [q.texto, q.rotulo, q.sub, q.mes].forEach(add);
    (q.itens ?? []).forEach((it) => (add(it?.rotulo), add(it?.texto)));
  });
  add(d.selo);
  if (c.tipo === "hook") add(d.rotulo);
  if (c.tipo === "frase") add(d.texto);
  if (c.tipo === "lista") (d.itens ?? []).forEach((it) => (add(it.nome), add(it.desc)));
  if (c.tipo === "cards") (d.itens ?? []).forEach((it) => (add(it.titulo), add(it.sub), add(it.nome), add(it.desc)));
  if (c.tipo === "numero") (add(d.rotulo), add(d.sub));
  if (c.tipo === "comparar") for (const lado of [d.antes, d.depois]) if (lado && typeof lado === "object") (add(lado.rotulo), [].concat(lado.itens ?? []).forEach(add));
  if (c.tipo === "cerebro") [].concat(d.rotulos ?? []).forEach(add);
  if (c.tipo === "mundo") (d.hud ?? []).forEach((h) => (add(h.rotulo), add(h.valor)));
  add(c.mascote);
  return t;
}

// Quem aprova lê a fala, não a tela: palavra de 3+ letras na tela tem que estar na fala da cena.
// Número fica de fora (a fala diz "quatro", a tela mostra "4").
// Flexão passa: uma começa com a outra, a menor tem 3+ letras e sobram até 2 letras
// (revisa/revisar, mods/mod); "tem" não casa com "tempestade".
export function palavrasForaDaFala(fala, texto) {
  const naFala = tokens(fala ?? "").map(norm);
  const flexao = (a, b) => {
    const [curta, longa] = a.length <= b.length ? [a, b] : [b, a];
    return curta.length >= 3 && longa.length - curta.length <= 2 && longa.startsWith(curta);
  };
  const casa = (w) => naFala.some((f) => f === w || flexao(f, w));
  return tokens(String(texto).replace(/\*/g, ""))
    .map(norm)
    .filter((w) => w.length >= 3 && !/\d/.test(w) && !casa(w));
}

function icones(c) {
  const d = c.dados ?? {};
  if (c.tipo === "hook") return d.icone ? [d.icone] : [];
  if (["lista", "cards"].includes(c.tipo)) return (d.itens ?? []).map((it) => it.icone).filter(Boolean);
  return [];
}

const OBRIGATORIOS = {
  numero: ["valor"],
  repo: ["dono", "nome"],
  chat: ["pergunta"],
  comparar: ["antes", "depois"],
  frase: ["texto"],
  midia: ["imagens"],
};

export function validarReel(dir) {
  const erros = [];
  const avisos = [];
  const f = (n) => path.join(dir, n);
  if (!fs.existsSync(f("reel.json"))) return { dir, erros: ["falta reel.json"], avisos, segundos: 0 };
  const reel = lerJson(f("reel.json"));
  const cenas = reel.cenas ?? [];
  const isca = Boolean(reel.palavra);
  const palavra = String(reel.palavra ?? "").toUpperCase();

  if (!reel.slug) erros.push("reel.json sem slug");
  else if (!/^[a-z0-9][a-z0-9-]*$/.test(reel.slug)) erros.push(`slug "${reel.slug}" inválido: use minúsculas, números e hífen (ele vira o nome do vídeo)`);
  if (!reel.titulo) erros.push("reel.json sem título-tese");
  else if ((String(reel.titulo).match(/\*[^*]+\*/g) ?? []).length !== 1) avisos.push("título-tese sem exatamente 1 palavra em *itálico*");
  if (!cenas.length) erros.push("reel.json sem cenas");
  if (reel.tema != null && !TEMAS[reel.tema]) erros.push(`tema "${reel.tema}" não existe no kit (${Object.keys(TEMAS).join(", ")})`);
  // A etiqueta padrão do bonequinho aparece no reel inteiro: as palavras dela têm que estar em alguma fala.
  if (reel.mascote_rotulo) {
    const fora = palavrasForaDaFala(cenas.map((c) => c.fala ?? "").join(" "), reel.mascote_rotulo);
    if (fora.length) erros.push(`etiqueta do bonequinho "${reel.mascote_rotulo}" tem palavra que não está em nenhuma fala: ${fora.join(", ")}`);
  } else if (reel.mascote !== false && palavrasForaDaFala(cenas.map((c) => c.fala ?? "").join(" "), "CLAUDE").length) {
    // Sem etiqueta própria, o kit mostra o bonequinho de pixel com "CLAUDE" no reel inteiro (kit/efeitos.mjs).
    avisos.push(`o bonequinho de pixel aparece com a etiqueta "CLAUDE", que não está na fala: ponha "mascote": false no reel.json (ou um mascote_rotulo com palavra da fala)`);
  }
  // Cor e clima: errados, só quebrariam no produzir, depois da gravação.
  if (reel.cor != null && !DESTAQUES[reel.cor] && !/^#[0-9a-f]{6}$/i.test(String(reel.cor))) erros.push(`cor "${reel.cor}" não existe (${Object.keys(DESTAQUES).join(", ")} ou um hex como #f6b73c)`);
  const clima = reel.trilha?.clima;
  if (reel.trilha !== false && clima != null && !(normClima(clima) in climasDe())) erros.push(`clima "${clima}" não existe (${Object.keys(climasDe()).join(", ")}; clima novo nasce de uma música descrita no kit/assets/musica/musicas.json)`);

  // Cena com "antes" é conferida como as duas telas que o kit monta, cada uma com a parte da fala dela.
  const telas = cenas.flatMap((c, i) => {
    const partes = c.antes ? dividirFala(c.fala, c.antes.ate) : null;
    if (!partes) return [{ c, i, onde: `cena ${i + 1} (${c.tipo})` }];
    const { ate, ...antes } = c.antes;
    const { antes: _, ...resto } = c;
    return [
      { c: { ...antes, fala: partes[0] }, i, onde: `cena ${i + 1} (antes: ${antes.tipo})` },
      { c: { ...resto, fala: partes[1] }, i, onde: `cena ${i + 1} (${c.tipo})` },
    ];
  });
  telas.forEach(({ c, i, onde }) => {
    if (!TIPOS.includes(c.tipo)) erros.push(`cena ${i + 1}: tipo "${c.tipo}" não existe no kit (${TIPOS.join(", ")})`);
    if (!String(c.fala ?? "").trim()) erros.push(`${onde}: sem fala`);
    for (const campo of OBRIGATORIOS[c.tipo] ?? []) if (c.dados?.[campo] == null) erros.push(`${onde}: falta dados.${campo}`);
    if (c.tipo === "hook")
      for (const l of [].concat(c.dados?.logo ?? []))
        if (!fs.existsSync(path.join(LOGOS, `${l}.svg`))) erros.push(`${onde}: logo "${l}" não está em kit/assets/logos (baixar do simple-icons)`);
    if (c.tipo === "midia") for (const im of c.dados?.imagens ?? []) if (!fs.existsSync(path.join(dir, String(im.src ?? "")))) erros.push(`${onde}: imagem ${im.src} não existe na pasta do reel`);
    for (const ic of icones(c)) if (!ICONS[ic]) erros.push(`${onde}: ícone "${ic}" não existe (${Object.keys(ICONS).join(", ")})`);
    const pos = (anc) => tokens(c.fala ?? "").findIndex((w) => temAncora(w, anc));
    const ordem = (c.dados?.quadros ?? []).map((q, k) => (q.em ? pos(q.em) : k === 0 ? -1 : null)).filter((x) => x != null);
    if (ordem.some((x, k) => k > 0 && x <= ordem[k - 1])) erros.push(`${onde}: quadros fora da ordem da fala (a âncora vale na 1ª vez que a palavra aparece)`);
    for (const q of c.dados?.quadros ?? []) {
      const campo = { palavra: "texto", logo: "logo", icone: "icone", contador: "ate", calendario: "dias", barras: "itens" }[q.tipo];
      if (campo && q[campo] == null) erros.push(`${onde}: quadro ${q.tipo} sem "${campo}"`);
      if (!TIPOS_QUADRO.includes(q.tipo)) erros.push(`${onde}: quadro "${q.tipo}" não existe no kit (${TIPOS_QUADRO.join(", ")})`);
      if (q.tipo === "logo" && !fs.existsSync(path.join(LOGOS, `${q.logo}.svg`))) erros.push(`${onde}: logo "${q.logo}" não está em kit/assets/logos (baixar do simple-icons)`);
      if (q.tipo === "icone" && !ICONS[q.icone]) erros.push(`${onde}: ícone "${q.icone}" não existe (${Object.keys(ICONS).join(", ")})`);
    }
    for (const b of [...(c.efeitos ?? []), ...(c.batidas ?? [])])
      if (!TIPOS_BATIDA.includes(b.tipo)) erros.push(`${onde}: batida "${b.tipo}" não existe no kit (${TIPOS_BATIDA.join(", ")})`);
    for (const [ancora, campo] of ancoras(c))
      if (!temAncora(c.fala ?? "", ancora)) erros.push(`${onde}: ${campo} "${ancora}" não está na fala da cena`);
    for (const t of textosDeTela(c)) {
      const fora = palavrasForaDaFala(c.fala, t);
      if (fora.length) erros.push(`${onde}: texto de tela "${t}" tem palavra que não está na fala: ${fora.join(", ")}`);
    }
  });

  // Mundo 3D (kit/mundo.mjs): o arquivo da cena e as marcas [cena, palavra] que a fazem reagir à fala.
  if (reel.mundo) {
    const arquivo = reel.mundo.arquivo ?? "mundo.mjs";
    if (!fs.existsSync(f(arquivo))) erros.push(`mundo: falta ${arquivo} na pasta do reel`);
    else {
      const chk = spawnSync(process.execPath, ["--check", f(arquivo)], { encoding: "utf8" });
      if (chk.status !== 0) erros.push(`mundo: ${arquivo} não compila (${String(chk.stderr).split(/\r?\n/).find((l) => /Error/.test(l)) ?? "erro de sintaxe"})`);
      else if (!/export\s+(async\s+)?function\s+criarMundo\b|export\s*\{[^}]*\bcriarMundo\b/.test(fs.readFileSync(f(arquivo), "utf8"))) erros.push(`mundo: ${arquivo} não exporta criarMundo`);
    }
    for (const [nome, par] of Object.entries(reel.mundo.marcas ?? {})) {
      if (!Array.isArray(par) || par.length !== 2) {
        erros.push(`mundo: marca "${nome}": use [cena, palavra]`);
        continue;
      }
      const [ci, palavra] = par;
      if (!cenas[ci]) erros.push(`mundo: marca "${nome}": cena ${Number(ci) + 1} não existe`);
      else if (!temAncora(cenas[ci].fala ?? "", palavra)) erros.push(`mundo: marca "${nome}": "${palavra}" não está na fala da cena ${ci + 1}`);
    }
  }

  cenas.forEach((c, i) => {
    if (c.antes && !dividirFala(c.fala, c.antes.ate)) erros.push(`cena ${i + 1}: antes.ate "${c.antes.ate}" tem que ser uma palavra da fala, e não a última`);
  });

  const ult = cenas[cenas.length - 1];
  if (isca) {
    if (ult?.tipo !== "comenta") erros.push("reel com palavra precisa fechar com a cena comenta");
    else if (!tokens(ult.fala).some((w) => norm(w) === norm(palavra))) erros.push(`a fala da cena comenta não diz ${palavra}`);
    // O "Me segue" pode estar no mesmo parágrafo do comenta (antes: { tipo: "segue", ate }: kit/build.mjs divide).
    if (cenas[cenas.length - 2]?.tipo !== "segue" && ult.antes?.tipo !== "segue") avisos.push("penúltima cena não é o segue");
    if (!reel.dm?.texto) erros.push("reel.json sem dm.texto (o card da DM no fecho)");
    if (tokens(reel.palavra).length !== 1) erros.push(`palavra "${reel.palavra}" tem que ser uma palavra só`);
    if (/[^A-Z0-9]/.test(palavra)) avisos.push(`palavra ${palavra} tem acento ou símbolo (atrito pra digitar no comentário)`);
  }

  // Texto: travessão e "não é só X, é Y" (as duas marcas mais conhecidas de texto escrito por IA).
  const falas = cenas.map((c) => c.fala ?? "").join(" ");
  const legenda = fs.existsSync(f("legenda.md")) ? fs.readFileSync(f("legenda.md"), "utf8") : null;
  const textos = { "reel.json": fs.readFileSync(f("reel.json"), "utf8"), "legenda.md": legenda ?? "" };
  for (const [n, t] of Object.entries(textos)) if (TRAVESSAO.test(t)) erros.push(`travessão em ${n}`);
  if ((falas.match(NAO_E_SO_TODOS) ?? []).length > 1) erros.push(`"não é só X, é Y" mais de 1 vez na narração`);
  if (legenda && NAO_E_SO.test(legenda)) erros.push(`"não é só X, é Y" na legenda`);

  const palavras = tokens(falas).length;
  const segundos = Math.round(((palavras / PALAVRAS_MIN) * 60 + (reel.segura_fim ?? 1.6)) * 10) / 10;
  if (segundos > TETO_S) avisos.push(`narração com ${palavras} palavras dá uns ${segundos}s no ritmo de reel, passa de ${TETO_S}s`);

  if (legenda == null) erros.push("falta legenda.md (o texto exato pra colar no post)");
  else {
    if (legenda.length > 2200) erros.push(`legenda com ${legenda.length} caracteres, o Instagram corta em 2.200`);
    if (isca && !legenda.includes(palavra)) erros.push(`legenda não pede pra comentar ${palavra}`);
    else if (isca && legenda.indexOf(palavra) > 125) avisos.push(`${palavra} aparece depois dos 125 primeiros caracteres da legenda (fica escondida no "mais")`);
    if ((legenda.match(/#\S+/g) ?? []).length > 5) avisos.push("legenda com mais de 5 hashtags");
  }

  return { dir, slug: reel.slug, palavra: isca ? palavra : null, erros, avisos, segundos, palavras };
}

function lerOpcional(f) {
  return fs.existsSync(f) ? lerJson(f) : null;
}

// Pastas de reel do lote (as que têm reel.json), em ordem.
export function reelsDoLote(loteDir) {
  return fs
    .readdirSync(loteDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(loteDir, d.name, "reel.json")))
    .map((d) => path.join(loteDir, d.name))
    .sort();
}

export function validarLote(loteDir) {
  const reels = reelsDoLote(loteDir).map((d) => validarReel(d));
  const erros = [];
  const contar = (campo) => {
    const vistos = {};
    for (const r of reels) if (r[campo]) (vistos[r[campo]] ??= []).push(path.basename(r.dir));
    return Object.entries(vistos).filter(([, v]) => v.length > 1);
  };
  for (const [p, quem] of contar("palavra")) erros.push(`palavra ${p} repetida no lote (${quem.join(", ")})`);
  return { reels, erros };
}

// Rodado direto (compara o caminho real: pasta aberta por junção ou link simbólico também conta).
if (process.argv[1] && fs.realpathSync.native(path.resolve(process.argv[1])) === fs.realpathSync.native(fileURLToPath(import.meta.url))) {
  const alvo = path.resolve(process.argv[2] ?? ".");
  if (!fs.existsSync(alvo)) {
    console.error(`não achei ${alvo}`);
    process.exit(1);
  }
  const res = fs.existsSync(path.join(alvo, "reel.json")) ? { reels: [validarReel(alvo)], erros: [] } : validarLote(alvo);
  let falhou = res.erros.length > 0;
  for (const e of res.erros) console.log(`[lote] ERRO ${e}`);
  for (const r of res.reels) {
    falhou ||= r.erros.length > 0;
    console.log(`[${path.basename(r.dir)}] ${r.erros.length ? "REPROVADO" : "ok"} · ${r.palavras} palavras · ~${r.segundos}s${r.palavra ? ` · ${r.palavra}` : " · opinião"}`);
    for (const e of r.erros) console.log(`  ERRO ${e}`);
    for (const a of r.avisos) console.log(`  aviso ${a}`);
  }
  process.exit(falhou ? 1 : 0);
}
