// Aprovação do roteiro no arquivo: cada reel ganha um roteiro.md pra você revisar e editar do seu jeito. Ele abre
// com "Aprovado: não"; quando estiver pronto, você troca para "Aprovado: sim" e roda "npm run lote -- aprovados <data>",
// que leva o texto exato pros arquivos do reel. Nada é gravado nem produzido sem isso: o gravar.mjs e o produzir.mjs
// chamam checarAprovacao, que confere a aprovação, a versão aplicada e o próprio texto (reel.json igual ao aprovado).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { paraMarkdown, deMarkdown } from "./roteiro-md.mjs";
import { reelsDoLote } from "./validar-roteiro.mjs";
import { gravacaoDoReel } from "../kit/voz-gravada.mjs";

const lerJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null);
const lerTexto = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);
const gravarJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + "\n");
const mesmo = (a, b) => String(a ?? "").replace(/\r\n?/g, "\n").trim() === String(b ?? "").replace(/\r\n?/g, "\n").trim();
const comando = (sub, data) => `npm run lote -- ${sub} ${data}`;
// A data do lote é o nome da pasta dele (lotes/<AAAA-MM-DD>/<reel>).
const dataDoReel = (reelDir) => path.basename(path.dirname(reelDir));

// A primeira linha com texto, antes do roteiro, decide: "Aprovado: sim" aprova; qualquer outra coisa não.
export function aprovadoNo(md) {
  const primeira = String(md ?? "").replace(/\r\n?/g, "\n").split("\n").find((l) => l.trim());
  return /^\s*aprovado:\s*sim\s*$/i.test(primeira ?? "");
}

export const hashRoteiro = (md) => crypto.createHash("sha1").update(String(md ?? "").replace(/\r\n?/g, "\n").trimEnd()).digest("hex");

export function roteiroParaRevisar(arquivos, { data }) {
  return [
    "Aprovado: não",
    "",
    "> Revise o texto do seu jeito: cada parágrafo da Narração vira uma cena, e a tela só mostra palavras da fala.",
    `> Quando estiver pronto, troque a primeira linha para "Aprovado: sim" e rode: ${comando("aprovados", data)}`,
    "",
    paraMarkdown(arquivos),
  ].join("\n");
}

export function lerArquivos(reelDir) {
  return { reel: lerJson(path.join(reelDir, "reel.json")), legenda: lerTexto(path.join(reelDir, "legenda.md")) ?? "" };
}

/**
 * Texto aprovado por cima dos arquivos do reel. Campo visual de cena só sobrevive se a quantidade de falas não
 * mudou (se mudou, o reel fica marcado pra remontar as cenas). Sem "Comenta e DM" no aprovado, a palavra e a DM saem;
 * a DM do vídeo fica exatamente como aprovada (linha apagada no roteiro sai do reel).
 * manterFalas: as falas aprovadas não mudaram e o reel tem o que você falou lendo elas (fala livre): fica o falado.
 */
export function aplicarAprovado(arquivos, ap, { manterFalas = false } = {}) {
  const { reel: velho } = arquivos;
  const mesmaContagem = ap.falas.length === velho.cenas.length;
  const cenas = ap.falas.map((fala, i) => {
    const antiga = velho.cenas[i];
    if (mesmaContagem) return { ...antiga, fala: manterFalas ? antiga.fala : fala };
    return antiga ? { tipo: antiga.tipo, fala } : { tipo: "frase", fala };
  });
  const reel = { ...velho, titulo: ap.titulo, cenas };
  if (mesmaContagem) delete reel.remontar_cenas;
  else reel.remontar_cenas = true;
  if (!ap.palavra) {
    delete reel.palavra;
    delete reel.dm;
  } else {
    reel.palavra = ap.palavra;
    if (ap.dm_video) reel.dm = { ...ap.dm_video };
    else delete reel.dm;
  }
  return { reel, legenda: ap.legenda + "\n", remontar_cenas: !mesmaContagem };
}

/** Linhas para a calibração da voz: o texto anterior e o seu, só onde mudou. */
export function diffCalibracao(antes, depois, { data, reel }) {
  const l = [];
  const par = (rotulo, a, b) => { if (a !== b) l.push(`- **${rotulo}.** Antes: "${a ?? ""}" · Seu: "${b ?? ""}"`); };
  par("Título", antes.titulo, depois.titulo);
  if (antes.falas.length === depois.falas.length) {
    antes.falas.forEach((f, i) => par(`Fala ${i + 1}`, f, depois.falas[i]));
  } else if (antes.falas.join("\n") !== depois.falas.join("\n")) {
    l.push(`- **Narração** (de ${antes.falas.length} para ${depois.falas.length} falas). Antes: "${antes.falas.join(" / ")}" · Seu: "${depois.falas.join(" / ")}"`);
  }
  par("Legenda", antes.legenda, depois.legenda);
  par("Palavra", antes.palavra, depois.palavra);
  par("DM", antes.dm_video?.texto, depois.dm_video?.texto);
  return l.length ? [`### ${data} · ${reel}`, ...l] : [];
}

/**
 * Escreve o roteiro.md de cada reel do lote, pra revisar. Não pisa no que você já mexeu (texto diferente do que
 * foi escrito aqui) nem no que você aprovou, salvo com { forcar: true }.
 */
export function escreverRoteiros(loteDir, { data = path.basename(loteDir), forcar = false } = {}) {
  const out = [];
  for (const reelDir of reelsDoLote(loteDir)) {
    const reel = path.basename(reelDir);
    const f = path.join(reelDir, "roteiro.md");
    const atual = lerTexto(f);
    if (!forcar && atual != null) {
      if (aprovadoNo(atual)) { out.push({ reel, estado: "mantido: já aprovado", arquivo: f }); continue; }
      if (!mesmo(atual, lerTexto(path.join(reelDir, "roteiro-enviado.md")))) { out.push({ reel, estado: "mantido: você já mexeu", arquivo: f }); continue; }
    }
    const md = roteiroParaRevisar(lerArquivos(reelDir), { data });
    fs.writeFileSync(f, md);
    fs.writeFileSync(path.join(reelDir, "roteiro-enviado.md"), md);
    out.push({ reel, estado: "pra revisar", arquivo: f });
  }
  return out;
}

/**
 * Leva o texto aprovado de cada roteiro.md pros arquivos do reel. Um reel com erro não derruba os outros, e
 * rodar de novo não aplica nem registra a calibração outra vez (o reel.json guarda a versão aplicada).
 */
export function processarAprovados(loteDir, { calibracao, data, agora = new Date().toISOString() } = {}) {
  const out = [];
  for (const reelDir of reelsDoLote(loteDir)) {
    const nome = path.basename(reelDir);
    try {
      const md = lerTexto(path.join(reelDir, "roteiro.md"));
      if (md == null) { out.push({ reel: nome, estado: "sem roteiro.md", remontar_cenas: false }); continue; }
      if (!aprovadoNo(md)) { out.push({ reel: nome, estado: "pra revisar", remontar_cenas: false }); continue; }
      const hash = hashRoteiro(md);
      const arquivos = lerArquivos(reelDir);
      const ap = deMarkdown(md);
      if (arquivos.reel?.aprovado?.roteiro === hash) {
        // Já aplicado. Se o reel.json ou a legenda saíram do texto aprovado depois, volta pro aprovado (é o conserto
        // que a trava manda fazer); a parte visual das cenas fica.
        let onde = null;
        try {
          checarAprovacao(reelDir);
        } catch (e) {
          if (!e.difere) throw e;
          onde = e.onde;
        }
        if (!onde) { out.push({ reel: nome, estado: "já aplicado", remontar_cenas: Boolean(arquivos.reel.remontar_cenas) }); continue; }
        const r = aplicarAprovado(arquivos, ap);
        gravarJson(path.join(reelDir, "reel.json"), { ...r.reel, aprovado: arquivos.reel.aprovado });
        fs.writeFileSync(path.join(reelDir, "legenda.md"), r.legenda);
        out.push({ reel: nome, estado: `reaplicado: o reel tinha saído do texto aprovado (${onde})`, remontar_cenas: r.remontar_cenas });
        continue;
      }
      // Diferença contra a última versão aprovada (ou a escrita aqui): reaprovar não repete o que já foi registrado.
      const anterior = lerTexto(path.join(reelDir, "roteiro-aprovado.md")) ?? lerTexto(path.join(reelDir, "roteiro-enviado.md"));
      const antes = deMarkdown(anterior ?? paraMarkdown(arquivos));
      // Falas aprovadas iguais às da aprovação anterior e o reel com o que você falou lendo elas: a fala fica (reaprovar
      // só a legenda ou o título não desfaz a gravação).
      const anteriorAprovado = lerTexto(path.join(reelDir, "roteiro-aprovado.md"));
      const mesmasFalas = anteriorAprovado != null && JSON.stringify(deMarkdown(anteriorAprovado).falas) === JSON.stringify(ap.falas);
      const r = aplicarAprovado(arquivos, ap, { manterFalas: mesmasFalas && faladoDoAprovado(reelDir, arquivos.reel, ap.falas) });
      gravarJson(path.join(reelDir, "reel.json"), { ...r.reel, aprovado: { roteiro: hash, em: agora } });
      fs.writeFileSync(path.join(reelDir, "legenda.md"), r.legenda);
      fs.writeFileSync(path.join(reelDir, "roteiro-aprovado.md"), md);
      const linhas = calibracao ? diffCalibracao(antes, ap, { data, reel: nome }) : [];
      if (linhas.length) {
        fs.mkdirSync(path.dirname(calibracao), { recursive: true });
        const cabecalho = fs.existsSync(calibracao) ? "\n" : "# Calibração da voz (o que você mudou no texto escrito pela IA)\n\nLeia antes de escrever o próximo lote: é assim que a esteira aprende o seu jeito de falar.\n\n";
        fs.appendFileSync(calibracao, cabecalho + linhas.join("\n") + "\n");
      }
      out.push({ reel: nome, estado: "aplicado", remontar_cenas: r.remontar_cenas });
    } catch (err) {
      out.push({ reel: nome, estado: `erro: ${err.message}`, remontar_cenas: false });
    }
  }
  return out;
}

// Fala livre: a fala do reel pode ser o que você falou na gravação escolhida, se ela é do texto de hoje, foi lida do
// texto aprovado e o reel tem exatamente o que a transcrição ouviu (o tomada-N.json guarda o que estava no
// teleprompter em "falas" e o que foi falado em "falado"). Texto mexido à mão depois, mesmo reprocessado com
// --literal, não é falado: precisa ir pro roteiro.md e ser aprovado.
const iguais = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
function faladoDoAprovado(reelDir, reel, aprovadas) {
  const g = gravacaoDoReel(reelDir, reel);
  if (g?.estado !== "valida") return false;
  const meta = lerJson(path.join(path.dirname(g.arquivo), `${path.basename(g.arquivo, path.extname(g.arquivo))}.json`));
  return iguais(meta?.falas, aprovadas) && iguais(meta?.falado, reel.cenas.map((c) => c.fala));
}

/** Trava do gravar.mjs e do produzir.mjs. Devolve as falas aprovadas (o texto do teleprompter). */
export function checarAprovacao(reelDir) {
  const nome = path.basename(reelDir);
  const data = dataDoReel(reelDir);
  const reel = lerJson(path.join(reelDir, "reel.json"));
  if (!reel) throw new Error(`não achei reel.json em ${reelDir}`);
  if (reel.remontar_cenas) {
    throw new Error(`as falas aprovadas de ${nome} mudaram de quantidade: remontar as cenas (tipo e batidas de cada fala) e tirar "remontar_cenas" do reel.json`);
  }
  const f = path.join(reelDir, "roteiro.md");
  const md = lerTexto(f);
  if (md == null) throw new Error(`${nome} está sem roteiro.md: rode ${comando("roteiros", data)}, revise e aprove`);
  if (!aprovadoNo(md)) throw new Error(`o roteiro de ${nome} não está aprovado: revise ${f}, troque a primeira linha para "Aprovado: sim" e rode ${comando("aprovados", data)}`);
  if (reel.aprovado?.roteiro !== hashRoteiro(md)) throw new Error(`o roteiro.md de ${nome} mudou depois do último "aprovados" (ou acabou de ser aprovado): rode ${comando("aprovados", data)}`);
  const ap = deMarkdown(md);
  const difere = (onde) => Object.assign(new Error(`o reel.json de ${nome} difere do roteiro aprovado (${onde}): rode ${comando("aprovados", data)} pra voltar ao texto aprovado, ou leve a mudança pro roteiro.md e aprove de novo`), { difere: true, onde });
  if (reel.titulo !== ap.titulo) throw difere("título");
  if (reel.cenas.length !== ap.falas.length) throw difere(`${reel.cenas.length} falas no reel, ${ap.falas.length} no aprovado`);
  if (!faladoDoAprovado(reelDir, reel, ap.falas)) reel.cenas.forEach((c, i) => { if (c.fala !== ap.falas[i]) throw difere(`fala ${i + 1}`); });
  if (!mesmo(lerTexto(path.join(reelDir, "legenda.md")), ap.legenda)) throw difere("legenda");
  if ((reel.palavra ?? null) !== (ap.palavra ?? null)) throw difere("palavra");
  // A DM aparece no fecho do vídeo: texto e botão também são o aprovado.
  if (ap.palavra && ["texto", "botao"].some((k) => (reel.dm?.[k] ?? null) !== (ap.dm_video?.[k] ?? null))) throw difere("DM");
  return { roteiro: f, falas: ap.falas };
}
