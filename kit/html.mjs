// Helpers de HTML do kit (build, batidas, efeitos): escape, destaque em itálico, ícones e logos.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ICONS } from "./icons.mjs";

export const KIT = path.dirname(fileURLToPath(import.meta.url));
export const num = (x) => Math.round(x * 1000) / 1000;
export const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// *palavra* vira o destaque em itálico serifado.
export const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>");

export function icon(name, size = 48, stroke = 1.5) {
  const inner = ICONS[name] ?? ICONS.inteligencia;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

export function logo(name, size) {
  const file = path.join(KIT, "assets", "logos", `${name}.svg`);
  if (!fs.existsSync(file)) throw new Error(`logo ${name} não está em kit/assets/logos (baixe do simple-icons)`);
  const svg = fs.readFileSync(file, "utf8").replace(/<title>.*?<\/title>/, "");
  return svg.replace("<svg ", `<svg width="${size}" height="${size}" fill="currentColor" `);
}

// Carimbo: entra grande e torto e assenta (rotação sempre pela timeline, nunca no CSS).
export function stamp(sel, rot) {
  return `gsap.fromTo("${sel}",{opacity:0,scale:1.9,rotation:${rot}},{opacity:1,scale:1,rotation:${rot},duration:0.32,ease:"back.out(2.2)"})`;
}
