// node --test kit/sons.test.mjs: efeitos sonoros são opcionais. O kit toca só o que existir em kit/assets/sfx
// (o repositório não traz nenhum: a licença dos bancos de som não deixa redistribuir o arquivo).
import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { bancoDeSons, sfxAudio } from "./efeitos.mjs";
import { sonsDeTeste } from "./apoio-teste.mjs";

const nomesNoHtml = (html) => [...html.matchAll(/src="assets\/sfx\/([^"]+)\.mp3"/g)].map((m) => m[1]);

test("bancoDeSons: pasta que não existe não tem som nenhum e o sfxAudio não gera <audio>", () => {
  const b = bancoDeSons(path.join(os.tmpdir(), "nao-existe-sfx"));
  assert.equal(b.tem("pop"), false);
  assert.deepEqual(b.nomes(), []);
  assert.equal(sfxAudio([{ nome: "pop", t: 0.5 }], 3, b), "");
});

test("bancoDeSons: mede a duração de cada som com ffprobe", () => {
  const b = bancoDeSons(sonsDeTeste(["pop", "whoosh"]));
  assert.deepEqual(b.nomes().sort(), ["pop", "whoosh"]);
  assert.ok(Math.abs(b.dur("pop") - 0.3) < 0.08, `pop dura ${b.dur("pop")}`);
});

test("sfxAudio: o poc roda só entre os pops que existem, e som que falta cai fora", () => {
  const b = bancoDeSons(sonsDeTeste(["pop", "pop-3", "whoosh"]));
  const ev = [0.5, 1, 1.5, 2].map((t) => ({ nome: "pop", t })).concat([{ nome: "sparkle", t: 2.5 }, { nome: "whoosh", t: 2.7 }]);
  assert.deepEqual(nomesNoHtml(sfxAudio(ev, 5, b)), ["pop", "pop-3", "pop", "pop-3", "whoosh"]);
});

test("sfxAudio: sem o pop.mp3 mas com pop-2, o poc ainda toca", () => {
  const b = bancoDeSons(sonsDeTeste(["pop-2"]));
  assert.deepEqual(nomesNoHtml(sfxAudio([{ nome: "pop", t: 0.5 }], 2, b)), ["pop-2"]);
});

test("revisão: sem ffprobe, os sons não tocam e o banco avisa por quê (em vez de sumir calado)", () => {
  const b = bancoDeSons(sonsDeTeste(["pop"]), { ffprobe: "ffprobe-que-nao-existe" });
  assert.equal(b.tem("pop"), false);
  assert.ok(b.avisos().some((a) => /ffprobe/.test(a)), b.avisos().join(" | "));
});
