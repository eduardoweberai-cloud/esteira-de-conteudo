// node --test kit/versao.test.mjs: versão de teste do reel (Reels de teste do Instagram).
// Mesmo áudio e mesmo gancho; o vídeo muda um pouco (tema da legenda e do fundo, trilha, enquadramento da cena 3D)
// para o Instagram não tratar como cópia do post do perfil.
import test from "node:test";
import assert from "node:assert/strict";
import { versaoDoReel, VERSOES } from "./versao.mjs";
import { TEMAS } from "./tema.mjs";

const CAT = [{ arquivo: "c1.mp3", clima: "curiosidade" }, { arquivo: "c2.mp3", clima: "curiosidade" }, { arquivo: "c3.mp3", clima: "curiosidade" }];

const reel = {
  slug: "r1-sol",
  titulo: "E SE O SOL | *SUMISSE* AGORA?",
  tema: "neon",
  voz_gravada: { acelerar: 1.15 },
  trilha: { clima: "curiosidade", arquivo: "c1.mp3" },
  mundo: { arquivo: "mundo.mjs", marcas: { some: [0, "sumisse"] } },
  cenas: [{ tipo: "mundo", fala: "E se o Sol sumisse agora?" }, { tipo: "segue", fala: "Me segue." }],
};

const faixa = (r) => r.trilha?.arquivo;

test("perfil (ou sem versão) é o reel como está", () => {
  assert.deepEqual(VERSOES, ["perfil", "teste"]);
  assert.equal(versaoDoReel(reel), reel);
  assert.equal(versaoDoReel(reel, "perfil"), reel);
});

test("teste: outro tema, outra trilha e a cena 3D mais perto; voz, texto e cenas iguais", () => {
  const t = versaoDoReel(reel, "teste", { catalogo: CAT });
  assert.notEqual(t.tema, reel.tema);
  assert.ok(TEMAS[t.tema], `tema ${t.tema} existe`);
  assert.notEqual(faixa(t), faixa(reel));
  assert.ok(t.mundo_enquadramento?.zoom > 1);
  assert.equal(t.versao, "teste");
  for (const campo of ["slug", "titulo", "voz_gravada", "mundo", "cenas"]) assert.deepEqual(t[campo], reel[campo], campo);
  assert.equal(reel.versao, undefined, "não mexe no reel original");
});

test("teste: o que o reel.json pedir em versoes.teste vence a escolha automática", () => {
  const t = versaoDoReel({ ...reel, versoes: { teste: { tema: "ouro", trilha: { arquivo: "minha.mp3" } } } }, "teste", { catalogo: CAT });
  assert.equal(t.tema, "ouro");
  assert.equal(t.trilha.arquivo, "minha.mp3");
  assert.equal(t.versoes, undefined);
});

test("teste: com uma faixa só no clima, a de teste repete a música (o vídeo ainda muda tema, cor e cena 3D)", () => {
  const t = versaoDoReel(reel, "teste", { catalogo: [CAT[0]] });
  assert.equal(faixa(t), "c1.mp3");
  assert.notEqual(t.tema, reel.tema);
});

test("teste: reel sem trilha continua sem trilha, e o tema não traz música própria", () => {
  assert.equal(versaoDoReel({ ...reel, trilha: false }, "teste", { catalogo: CAT }).trilha, false);
  for (const t of Object.values(TEMAS)) assert.equal(t.trilha, undefined, t.nome);
});

test("versão que não existe é erro", () => {
  assert.throws(() => versaoDoReel(reel, "b"), /versão "b" não existe \(perfil, teste\)/);
});
