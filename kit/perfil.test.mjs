// node --test kit/perfil.test.mjs: o fecho (Me segue e a DM) usa nome, @ e foto do perfil.json da raiz.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lerPerfil, iniciais, PERFIL_PADRAO } from "./perfil.mjs";
import { perfilDeTeste } from "./apoio-teste.mjs";

test("lerPerfil: sem perfil.json, o padrão com aviso pra preencher", () => {
  const p = lerPerfil(path.join(os.tmpdir(), "nao-existe", "perfil.json"));
  assert.equal(p.nome, PERFIL_PADRAO.nome);
  assert.equal(p.user, PERFIL_PADRAO.user);
  assert.equal(p.foto, null);
  assert.ok(p.avisos.some((a) => /perfil\.json/.test(a)), p.avisos.join(" | "));
});

test("lerPerfil: tira o @ do usuário e resolve a foto a partir da pasta do perfil.json", () => {
  const arquivo = perfilDeTeste({ nome: "Ana Teste", user: "@ana.teste", foto: true });
  const p = lerPerfil(arquivo);
  assert.equal(p.nome, "Ana Teste");
  assert.equal(p.user, "ana.teste");
  assert.equal(p.foto, path.join(path.dirname(arquivo), "foto.png"));
  assert.deepEqual(p.avisos, []);
});

test("lerPerfil: foto que não existe vira aviso e o fecho sai com as iniciais", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "perfil-"));
  fs.writeFileSync(path.join(dir, "perfil.json"), JSON.stringify({ nome: "Ana", user: "ana", foto: "sumiu.jpg" }));
  const p = lerPerfil(path.join(dir, "perfil.json"));
  assert.equal(p.foto, null);
  assert.ok(p.avisos.some((a) => /sumiu\.jpg/.test(a)));
});

test("lerPerfil: perfil.json quebrado para dizendo qual arquivo", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "perfil-"));
  fs.writeFileSync(path.join(dir, "perfil.json"), "{ nome: ");
  assert.throws(() => lerPerfil(path.join(dir, "perfil.json")), /perfil\.json/);
});

test("iniciais: primeira e última palavra do nome, em maiúscula", () => {
  assert.equal(iniciais("Ana Maria Teste"), "AT");
  assert.equal(iniciais("ana"), "A");
  assert.equal(iniciais("  Érica  souza "), "ÉS");
  assert.equal(iniciais(""), "?");
});

test("revisão: perfil.json ainda com o nome ou o @ de exemplo avisa pra preencher", () => {
  const p = lerPerfil(perfilDeTeste({ nome: PERFIL_PADRAO.nome, user: PERFIL_PADRAO.user }));
  assert.ok(p.avisos.some((a) => /preencha/.test(a)), p.avisos.join(" | "));
});
