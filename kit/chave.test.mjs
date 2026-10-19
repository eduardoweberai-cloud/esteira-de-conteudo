// node --test kit/chave.test.mjs: a chave da ElevenLabs vem do ambiente ou do .env, nunca do código.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lerEnv, apiKey } from "./chave.mjs";

const QUEBRA = String.fromCharCode(13, 10);

test("lerEnv: lê KEY=valor com aspas, export, comentário e CRLF; sem arquivo, vazio", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "env-")), ".env");
  assert.deepEqual(lerEnv(f), {});
  fs.writeFileSync(f, ["# minhas chaves", "ELEVENLABS_API_KEY=\"sk_teste_123\"", "export OUTRA = 'x y'", "  # ELEVENLABS_API_KEY=comentada", "VAZIA="].join(QUEBRA));
  assert.deepEqual(lerEnv(f), { ELEVENLABS_API_KEY: "sk_teste_123", OUTRA: "x y", VAZIA: "" });
});

test("apiKey: o ambiente vence o .env; sem chave nenhuma, o erro diz onde pôr", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "env-")), ".env");
  assert.throws(() => apiKey({ env: {}, arquivo: f }), /ELEVENLABS_API_KEY=sua-chave/);
  fs.writeFileSync(f, "ELEVENLABS_API_KEY=do_arquivo");
  assert.equal(apiKey({ env: {}, arquivo: f }), "do_arquivo");
  assert.equal(apiKey({ env: { ELEVENLABS_API_KEY: "do_ambiente" }, arquivo: f }), "do_ambiente");
  fs.writeFileSync(f, "ELEVENLABS_API_KEY=");
  assert.throws(() => apiKey({ env: {}, arquivo: f }), /falta a chave/);
});
