// node --test scripts/ritmo.test.mjs: a métrica de ritmo (funções puras sobre a série do ffmpeg).
import test from "node:test";
import assert from "node:assert/strict";
import { lerMetadata, analisarSerie, avaliarRitmo, analisarTrilha } from "./medir-ritmo.mjs";

test("lerMetadata junta tempo e valor do metadata=print do ffmpeg", () => {
  const txt = [
    "frame:0    pts:6      pts_time:0.2",
    "lavfi.signalstats.YAVG=2.55",
    "frame:1    pts:12     pts_time:0.4",
    "lavfi.signalstats.YAVG=0",
    "frame:2    pts:18     pts_time:0.6",
    "lavfi.astats.Overall.RMS_level=-inf",
  ].join("\n");
  assert.deepEqual(lerMetadata(txt, "lavfi.signalstats.YAVG"), [2.55, 0]);
  assert.deepEqual(lerMetadata(txt, "lavfi.astats.Overall.RMS_level"), [-120]);
});

test("analisarSerie: 1ª mudança é o primeiro passo acima do limiar", () => {
  // passo 0,2 s: o índice 0 compara o quadro de 0,2 s com o de 0 s
  const r = analisarSerie([0, 0, 3, 0, 0], { passo: 0.2 });
  assert.equal(r.primeiraMudanca, 0.6);
});

test("analisarSerie: maior trecho parado conta do início, entre mudanças e até o fim", () => {
  // mudanças em 0,2 s e 1,8 s; vídeo de 2,4 s (12 passos): maior vão = 1,6 s (de 0,2 a 1,8)
  const serie = [5, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0];
  const r = analisarSerie(serie, { passo: 0.2 });
  assert.equal(r.duracao, 2.4);
  assert.equal(r.maiorParado, 1.6);
  assert.equal(r.inicioParado, 0.2);
});

test("analisarSerie: vídeo sem nenhuma mudança fica parado do começo ao fim", () => {
  const r = analisarSerie([0, 0.2, 0.5, 0], { passo: 0.2 });
  assert.equal(r.primeiraMudanca, null);
  assert.equal(r.maiorParado, 1);
});

test("analisarSerie: tempo com a tela mudando e troca grande a cada X s", () => {
  // 10 passos (2,2 s de vídeo), 4 acima de 1%; picos acima de 5%: índices 1 e 8 (isolados por 3 passos)
  const serie = [0, 9, 2, 0, 0, 0, 0, 0, 7, 3];
  const r = analisarSerie(serie, { passo: 0.2 });
  assert.equal(r.movimentoPct, 40);
  assert.equal(r.trocasGrandes, 2);
  assert.equal(r.trocaGrandeACada, 1.1);
});

test("avaliarRitmo reprova 1ª mudança depois de 1 s e trecho parado de mais de 2 s", () => {
  assert.deepEqual(avaliarRitmo({ primeiraMudanca: 0.4, maiorParado: 1.8 }).ok, true);
  const r = avaliarRitmo({ primeiraMudanca: 1.2, maiorParado: 2.6, inicioParado: 10.2 });
  assert.equal(r.ok, false);
  assert.equal(r.motivos.length, 2);
  assert.match(r.motivos[0], /1ª mudança em 1,2 s/);
  assert.match(r.motivos[1], /2,6 s parado a partir de 10,2 s/);
  assert.equal(avaliarRitmo({ primeiraMudanca: null, maiorParado: 9 }).ok, false);
});

// AFINAÇÃO 16/10: a música desceu pra 22 dB abaixo da voz (pedido dele) e a voz gravada quase não tem pausa (o
// respiro é silêncio digital): o piso passou a ser os 2% mais baixos, acima de -70 dB. Medido nos reels de 16/10:
// só voz -100 a -120 dB; com a faixa mais calma, -52 dB.
test("analisarTrilha: piso (2% mais baixos) acima de -70 dB é trilha; só voz, com respiro em silêncio digital, não é", () => {
  const voz = Array.from({ length: 100 }, (_, k) => (k % 25 === 0 ? -120 : -40 + (k % 7)));
  const comTrilha = voz.map((x) => Math.max(x, -52));
  assert.equal(analisarTrilha(comTrilha).ok, true);
  const r = analisarTrilha(voz);
  assert.equal(r.ok, false);
  assert.ok(r.pisoDb < -100);
});

test("medir: reel sem música não reprova por falta de trilha (só avisa); com música, reprova", async () => {
  const { spawnSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { medir } = await import("./medir-ritmo.mjs");
  const video = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ritmo-")), "v.mp4");
  // 2 s de tela mexendo (testsrc) e áudio em silêncio digital.
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=360x640:rate=25:duration=2", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "2", "-shortest", video]);
  assert.equal(r.status, 0, String(r.stderr));
  const sem = medir(video, { exigeTrilha: false });
  assert.equal(sem.trilha.ok, false);
  assert.ok(!sem.motivos.some((m) => /trilha/.test(m)), sem.motivos.join(" | "));
  assert.match(sem.avisos.join(" | "), /sem trilha.*musicas\.json/);
  const com = medir(video);
  assert.equal(com.ok, false);
  assert.match(com.motivos.join(" | "), /sem trilha/);
});
