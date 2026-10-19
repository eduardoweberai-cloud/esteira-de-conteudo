// Versões de um reel: "perfil" é o reel como está; "teste" vai para os Reels de teste do Instagram.
// A gravação é uma só, então as duas têm o mesmo áudio e o mesmo gancho. O Instagram trata o mesmo arquivo
// subido duas vezes como cópia e só a primeira ganha alcance; a de teste muda o que aparece e o que toca por
// baixo: outro tema (cor da legenda, títulos, selos e fundo), outra música do mesmo clima e a cena 3D mais perto.
// O reel.json pode fixar a escolha em `versoes.teste` (ex.: { tema: "ouro" }) quando a automática não combinar.
import { TEMAS, TEMA_PADRAO, DESTAQUES } from "./tema.mjs";
import { outraDoClima } from "./trilhas.mjs";

export const VERSOES = ["perfil", "teste"];

const ORDEM = Object.keys(TEMAS);

export function versaoDoReel(reel, nome, { catalogo } = {}) {
  if (!nome || nome === "perfil") return reel;
  if (!VERSOES.includes(nome)) throw new Error(`versão "${nome}" não existe (${VERSOES.join(", ")})`);
  const base = reel.tema ?? TEMA_PADRAO;
  const tema = ORDEM[(ORDEM.indexOf(base) + 1) % ORDEM.length];
  // Outra música do mesmo clima (com uma faixa só no clima, repete); sem faixa fixada, o build sorteia a do perfil
  // e toca a seguinte do clima.
  let trilha = reel.trilha;
  if (reel.trilha?.arquivo) {
    const outra = outraDoClima(reel.trilha.arquivo, reel.trilha.clima, catalogo);
    // Faixa nova não herda o início nem o volume escolhidos pra do perfil.
    if (outra !== reel.trilha.arquivo) {
      const { inicio: _i, volume: _v, ...resto } = reel.trilha;
      trilha = { ...resto, arquivo: outra };
    }
  }
  // Estilo cinema: a próxima cor da paleta e a legenda toda branca (no perfil a palavra falada acende).
  const cores = Object.keys(DESTAQUES);
  const cor = cores[(Math.max(0, cores.indexOf(reel.cor ?? "ouro")) + 1) % cores.length];
  const { versoes, ...resto } = reel;
  const { trilha: trilhaFixa, ...fixo } = versoes?.[nome] ?? {};
  return {
    ...resto,
    tema,
    trilha: trilhaFixa === false ? false : trilhaFixa ? { ...(trilha || {}), ...trilhaFixa } : trilha,
    cor,
    legenda: "branca",
    mundo_enquadramento: { zoom: 1.12, y: -2 },
    ...fixo,
    versao: nome,
  };
}
