// Blocos de montar dos mundos 3D dos reels (Three.js).
// O mundo.mjs de cada reel importa daqui: import { ... } from "./assets/vendor/mundo-kit.mjs";
// Regra de ouro: tudo é função de t. Nada de Math.random, Date.now ou laço de animação; sementes fixas.
// Gotchas medidos: InstancedMesh com frustumCulled = false; disco + brilho num sprite só (cruzam em profundidade);
// câmera no chão no meio da gente vira boneco gigante (câmera alta e longe); velocidade que muda usa tempoIntegrado.

// ---------- puros (testados em kit/mundokit.test.mjs) ----------
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export function suave(a, b, x) {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
}
export const fracao = (t, a, b) => clamp((t - a) / Math.max(0.001, b - a));

// planos = [[início em s, nome], ...] em ordem: o nome do último que já começou.
export function planoEm(planos, t) {
  let atual = planos[0][1];
  for (const [ini, nome] of planos) if (t >= ini) atual = nome;
  return atual;
}

// trechos = [[início, velocidade], ...]: o "tempo de andar" acumulado, contínuo quando a velocidade muda.
export function tempoIntegrado(trechos, t) {
  let acc = 0;
  for (let i = 0; i < trechos.length; i++) {
    const [ini, v] = trechos[i];
    if (t <= ini) break;
    const fim = i + 1 < trechos.length ? Math.min(t, trechos[i + 1][0]) : t;
    acc += (fim - ini) * v;
  }
  return acc + Math.min(t, trechos[0][0]);
}

// ---------- base: renderer + câmera com movimento suave ----------
export function base(THREE, canvas, { fov = 52, fundo = null } = {}) {
  const W = 1080;
  const H = 1920;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (fundo != null) renderer.setClearColor(fundo);
  const camera = new THREE.PerspectiveCamera(fov, W / H, 0.1, 3000);
  const P = new THREE.Vector3();
  const A = new THREE.Vector3();
  const v = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  // k de 0 a 1 com ease; de/ate = posição, olhaDe/olhaAte = alvo
  function mover(k, de, ate, olhaDe, olhaAte) {
    const e = k * k * (3 - 2 * k);
    P.copy(v(de)).lerp(v(ate), e);
    A.copy(v(olhaDe)).lerp(v(olhaAte ?? olhaDe), e);
    camera.position.copy(P);
    camera.lookAt(A);
  }
  return { renderer, camera, mover, W, H };
}

// ---------- texturas desenhadas ----------
export function brilho(THREE, paradas, tam = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = tam;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(tam / 2, tam / 2, 0, tam / 2, tam / 2, tam / 2);
  for (const [p, css] of paradas) grad.addColorStop(p, css);
  g.fillStyle = grad;
  g.fillRect(0, 0, tam, tam);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}
export const BRILHO = {
  sol: [[0, "rgba(255,250,225,1)"], [0.18, "rgba(255,236,170,0.95)"], [0.42, "rgba(255,190,90,0.35)"], [1, "rgba(255,160,60,0)"]],
  solDisco: [[0, "rgba(255,252,236,1)"], [0.13, "rgba(255,246,214,1)"], [0.15, "rgba(255,226,150,0.85)"], [0.4, "rgba(255,190,90,0.3)"], [1, "rgba(255,160,60,0)"]],
  luaDisco: [[0, "rgba(240,244,252,1)"], [0.2, "rgba(232,238,250,1)"], [0.23, "rgba(210,222,250,0.35)"], [0.5, "rgba(200,215,255,0.1)"], [1, "rgba(200,210,255,0)"]],
  suave: [[0, "rgba(255,255,255,0.9)"], [0.35, "rgba(220,230,255,0.25)"], [1, "rgba(200,210,255,0)"]],
  fogo: [[0, "rgba(255,240,200,1)"], [0.25, "rgba(255,150,50,0.8)"], [0.6, "rgba(255,80,20,0.2)"], [1, "rgba(255,60,0,0)"]],
};

// Canvas 2D virando textura (tela de monitor, placa, papel). desenhar(ctx, w, h) roda uma vez.
export function telaCanvas(THREE, w, h, desenhar) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  desenhar(c.getContext("2d"), w, h);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4;
  return tx;
}

// Imagem real (tela oficial, print) como textura: carregar antes do render (criarMundo async).
export async function imagem(THREE, url) {
  const tx = await new THREE.TextureLoader().loadAsync(url);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4;
  return tx;
}

// Encaixa uma imagem real (print oficial, tela de produto) numa textura de tela sem cortar (como object-fit: contain).
// recorte = [sx, sy, sw, sh] em pixels da imagem original, opcional. Use com a textura de imagem(): caberNaTela(THREE, tx.image, ...).
export function caberNaTela(THREE, img, { w = 1600, h = 1000, fundo = "#0d0f14", recorte = null, margem = 0 } = {}) {
  const [sx, sy, sw, sh] = recorte ?? [0, 0, img.width, img.height];
  return telaCanvas(THREE, w, h, (g) => {
    g.fillStyle = fundo;
    g.fillRect(0, 0, w, h);
    const k = Math.min((w - 2 * margem) / sw, (h - 2 * margem) / sh);
    const dw = sw * k;
    const dh = sh * k;
    g.drawImage(img, sx, sy, sw, sh, (w - dw) / 2, (h - dh) / 2, dw, dh);
  });
}

export function sprite(THREE, tx, escala, cor = 0xffffff, aditivo = true) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tx, color: cor, transparent: true, depthWrite: false, blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false }),
  );
  s.scale.set(escala, escala, 1);
  return s;
}

// Texto ou emoji flutuando (balão de "?", etiqueta, número): sprite com canvas.
export function textoSprite(THREE, texto, { cor = "#ffffff", fundo = null, fonte = "700 120px 'Hanken Grotesk', sans-serif", escala = 1, raio = 40 } = {}) {
  const w = 512;
  const h = 256;
  const tx = telaCanvas(THREE, w, h, (g) => {
    if (fundo) {
      g.fillStyle = fundo;
      const r = raio;
      g.beginPath();
      g.moveTo(r, 8);
      g.arcTo(w - 8, 8, w - 8, h - 8, r);
      g.arcTo(w - 8, h - 8, 8, h - 8, r);
      g.arcTo(8, h - 8, 8, 8, r);
      g.arcTo(8, 8, w - 8, 8, r);
      g.fill();
    }
    g.fillStyle = cor;
    g.font = fonte;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(texto, w / 2, h / 2 + 6);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false }));
  s.scale.set(2 * escala, 1 * escala, 1);
  return s;
}

// ---------- céu, estrelas, chão ----------
export function estrelas(THREE, n, raio, semente, tamanho = 2, soCima = false) {
  const r = prng(semente);
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1;
    const th = r() * Math.PI * 2;
    const y = soCima ? Math.abs(u) : u;
    const s = Math.sqrt(1 - y * y);
    pos.set([raio * s * Math.cos(th), raio * y, raio * s * Math.sin(th)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: tamanho, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, fog: false }));
}

// Cúpula de céu em degradê (topo e horizonte mudam com set()).
export function ceu(THREE, cena, { topo = 0x2f7fd6, hor = 0xbfe2ff, raio = 600 } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { topo: { value: new THREE.Color(topo) }, hor: { value: new THREE.Color(hor) } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 topo; uniform vec3 hor; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.7 + 0.04, 0.0, 1.0); gl_FragColor = vec4(mix(hor, topo, pow(h, 0.65)), 1.0); \n#include <colorspace_fragment>\n }",
  });
  cena.add(new THREE.Mesh(new THREE.SphereGeometry(raio, 32, 16), mat));
  return {
    mat,
    set(t, h) {
      mat.uniforms.topo.value.copy(t);
      mat.uniforms.hor.value.copy(h);
    },
  };
}

// Chão com relevo baixo fora de um raio plano.
export function chao(THREE, cena, { cor = 0x69a84f, tamanho = 520, plano = 24, semente = 11 } = {}) {
  const r = prng(semente);
  const g = new THREE.PlaneGeometry(tamanho, tamanho, 90, 90);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const d = Math.hypot(x, z);
    p.setY(i, d < plano ? 0 : (Math.sin(x * 0.11) * Math.cos(z * 0.09) * 0.9 + (r() - 0.5) * 0.7) * clamp((d - plano) / 30));
  }
  g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: cor, flatShading: true });
  cena.add(new THREE.Mesh(g, mat));
  return mat;
}

// Chão de grade neon (fliperama / synthwave): linhas que correm na direção da câmera com t.
export function gradeNeon(THREE, cena, { cor = 0xff3fa4, cor2 = 0x3fe0ff, tamanho = 200, passo = 4 } = {}) {
  const grupo = new THREE.Group();
  const matA = new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: 0.85 });
  const matB = new THREE.LineBasicMaterial({ color: cor2, transparent: true, opacity: 0.55 });
  const pts = [];
  for (let x = -tamanho / 2; x <= tamanho / 2; x += passo) pts.push(new THREE.Vector3(x, 0, -tamanho), new THREE.Vector3(x, 0, tamanho / 4));
  grupo.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), matB));
  const linhas = new THREE.Group();
  const pts2 = [];
  for (let z = -tamanho; z <= tamanho / 4; z += passo) pts2.push(new THREE.Vector3(-tamanho / 2, 0, z), new THREE.Vector3(tamanho / 2, 0, z));
  linhas.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts2), matA));
  grupo.add(linhas);
  cena.add(grupo);
  return { atualizar: (t, vel = 3) => (linhas.position.z = (t * vel) % passo) };
}

// ---------- natureza e cidade ----------
export function arvores(THREE, cena, { n = 70, raioMin = 17, raioMax = 57, centro = [0, -6], semente = 23 } = {}) {
  const copaMat = new THREE.MeshLambertMaterial({ color: 0x3f8d3a, flatShading: true });
  const copas = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 3.4, 6), copaMat, n);
  const troncos = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.26, 1.5, 5), new THREE.MeshLambertMaterial({ color: 0x7a5636 }), n);
  const r = prng(semente);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const ang = r() * Math.PI * 2;
    const d = raioMin + r() * (raioMax - raioMin);
    const x = Math.cos(ang) * d + centro[0];
    const z = Math.sin(ang) * d + centro[1];
    const s = 0.8 + r() * 0.7;
    m.makeScale(s, s, s).setPosition(x, 2.1 * s, z);
    copas.setMatrixAt(i, m);
    m.makeScale(s, s, s).setPosition(x, 0.75 * s, z);
    troncos.setMatrixAt(i, m);
  }
  copas.frustumCulled = troncos.frustumCulled = false;
  cena.add(copas, troncos);
  return { copaMat };
}

function janelas(THREE, semente) {
  return telaCanvas(THREE, 64, 128, (g) => {
    const r = prng(semente);
    g.fillStyle = "#000";
    g.fillRect(0, 0, 64, 128);
    for (let y = 6; y < 124; y += 12)
      for (let x = 5; x < 60; x += 11)
        if (r() < 0.62) {
          g.fillStyle = r() < 0.3 ? "#ffe9b0" : "#ffcf70";
          g.fillRect(x, y, 6, 7);
        }
  });
}

// Prédios no horizonte com janelas que acendem (set(noite) de 0 a 1).
export function predios(THREE, cena, { n = 34, altMin = 10, altMax = 32, distMin = 150, distMax = 200, abertura = 2.5, semente = 37, cores = [0xd8cfc0, 0xc2c9d1, 0xe3d7c3, 0xb7bec6] } = {}) {
  const mats = [];
  const r = prng(semente);
  for (let i = 0; i < n; i++) {
    const w = 6 + r() * 10;
    const h = altMin + r() * (altMax - altMin);
    const d = 6 + r() * 8;
    const tx = janelas(THREE, 100 + i);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.repeat.set(Math.max(1, Math.round(w / 5)), Math.max(1, Math.round(h / 9)));
    const mat = new THREE.MeshLambertMaterial({ color: cores[i % cores.length], emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    const ang = -abertura / 2 + (i / (n - 1)) * abertura + (r() - 0.5) * 0.04;
    const dist = distMin + r() * (distMax - distMin);
    b.position.set(Math.sin(ang) * dist, h / 2 - 0.5, -Math.cos(ang) * dist - 10);
    b.rotation.y = -ang;
    cena.add(b);
    mats.push(mat);
  }
  return { mats, set: (noite) => mats.forEach((m) => (m.emissiveIntensity = noite * 0.95)) };
}

// ---------- gente ----------
export const ROUPAS = [0xe85d75, 0x3d7dd8, 0xf2b134, 0x46b37a, 0x8a5cf6, 0xf07d3c, 0x2f3542, 0xe9e4da];
export const PELES = [0xf1c8a5, 0xd9a07c, 0xa86f4c, 0x6e4630, 0xf5d6bd];

// Multidão andando em círculos (instanciada). atualizar(tp) com tp = tempoIntegrado(...) se a velocidade muda.
export function multidao(THREE, cena, { n = 90, raioMin = 3.6, raioMax = 13, centro = [0, -6], semente = 51 } = {}) {
  const corpos = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.24, 0.72, 3, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
  const cabecas = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
  const r = prng(semente);
  const gente = [];
  for (let i = 0; i < n; i++) {
    gente.push({ raio: raioMin + r() * (raioMax - raioMin), fase: r() * Math.PI * 2, vel: (0.05 + r() * 0.09) * (r() < 0.5 ? -1 : 1), cz: centro[1] + (r() - 0.5) * 2, cx: centro[0], passo: r() * 6 });
    corpos.setColorAt(i, new THREE.Color(ROUPAS[i % ROUPAS.length]));
    cabecas.setColorAt(i, new THREE.Color(PELES[Math.floor(r() * PELES.length)]));
  }
  corpos.frustumCulled = cabecas.frustumCulled = false;
  cena.add(corpos, cabecas);
  const m = new THREE.Matrix4();
  return {
    atualizar(tp) {
      for (let i = 0; i < n; i++) {
        const p = gente[i];
        const a = p.fase + p.vel * tp;
        const x = Math.cos(a) * p.raio + p.cx;
        const z = Math.sin(a) * p.raio + p.cz;
        const pulo = Math.abs(Math.sin(tp * 7 + p.passo)) * 0.06;
        m.makeRotationY(-a).setPosition(x, 0.6 + pulo, z);
        corpos.setMatrixAt(i, m);
        m.makeTranslation(x, 1.43 + pulo, z);
        cabecas.setMatrixAt(i, m);
      }
      corpos.instanceMatrix.needsUpdate = true;
      cabecas.instanceMatrix.needsUpdate = true;
    },
  };
}

// Uma pessoa low-poly com partes que dá pra posar (sentar, digitar, acenar): { grupo, corpo, cabeca, bracoE, bracoD, pernas }.
export function pessoa(THREE, { roupa = 0x3d7dd8, pele = 0xd9a07c, cabelo = 0x3b2a1e, calca = 0x2f3542 } = {}) {
  const grupo = new THREE.Group();
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.7, 3, 8), lam(roupa));
  corpo.position.y = 1.25;
  const cabeca = new THREE.Group();
  const rosto = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), lam(pele));
  const cab = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam(cabelo));
  cab.position.y = 0.04;
  cabeca.add(rosto, cab);
  cabeca.position.y = 1.95;
  const braco = (lado) => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 3, 6), lam(roupa));
    b.position.y = -0.3;
    const mao = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), lam(pele));
    mao.position.y = -0.62;
    g.add(b, mao);
    g.position.set(0.38 * lado, 1.6, 0);
    return g;
  };
  const bracoE = braco(-1);
  const bracoD = braco(1);
  const pernas = new THREE.Group();
  for (const lado of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.55, 3, 6), lam(calca));
    p.position.set(0.14 * lado, 0.42, 0);
    pernas.add(p);
  }
  grupo.add(corpo, cabeca, bracoE, bracoD, pernas);
  return { grupo, corpo, cabeca, bracoE, bracoD, pernas };
}

// O bonequinho do Claude Code (o mesmo pixel do kit) em voxels 3D: a nossa identidade dentro do mundo.
const CLAWD = ["000111111111111000", "000110111111011000", "011111111111111110", "000111111111111000", "000010100001010000"];
export function mascote(THREE, { cor = 0xd97757, olho = 0x1a1a1a, tamanho = 0.12, brilhoProprio = 0.45 } = {}) {
  const grupo = new THREE.Group();
  const corpo = new THREE.InstancedMesh(new THREE.BoxGeometry(tamanho, tamanho * 1.8, tamanho * 4), new THREE.MeshLambertMaterial({ color: cor, emissive: cor, emissiveIntensity: brilhoProprio, flatShading: true }), 18 * 5);
  const m = new THREE.Matrix4();
  let k = 0;
  CLAWD.forEach((linha, y) =>
    [...linha].forEach((c, x) => {
      if (c !== "1") return;
      m.makeTranslation((x - 8.5) * tamanho, (4 - y) * tamanho * 1.8, 0);
      corpo.setMatrixAt(k++, m);
    }),
  );
  corpo.count = k;
  corpo.frustumCulled = false;
  const olhos = new THREE.Group();
  for (const x of [5, 12]) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(tamanho * 0.9, tamanho * 1.6, tamanho * 0.3), new THREE.MeshBasicMaterial({ color: olho }));
    o.position.set((x - 8.5) * tamanho, 3 * tamanho * 1.8, tamanho * 2.05);
    olhos.add(o);
  }
  grupo.add(corpo, olhos);
  return grupo;
}

// ---------- objetos ----------
// Mesa + monitor + teclado. A tela é um plano com material trocável: computador.tela.material.map = textura.
export function computador(THREE, { largura = 2.4, telaCor = 0x101624 } = {}) {
  const grupo = new THREE.Group();
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const tampo = new THREE.Mesh(new THREE.BoxGeometry(largura * 1.9, 0.1, largura * 0.85), lam(0xc89f6e));
  tampo.position.y = 1.05;
  const pe = (x, z) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 0.08), lam(0x5b4636));
    p.position.set(x, 0.52, z);
    return p;
  };
  const a = largura * 0.9;
  const b = largura * 0.38;
  grupo.add(tampo, pe(-a, -b), pe(a, -b), pe(-a, b), pe(a, b));
  const alt = largura * 0.62;
  const moldura = new THREE.Mesh(new THREE.BoxGeometry(largura + 0.12, alt + 0.12, 0.08), lam(0x1d1f26));
  moldura.position.set(0, 1.15 + 0.35 + alt / 2, -0.25);
  const tela = new THREE.Mesh(new THREE.PlaneGeometry(largura, alt), new THREE.MeshBasicMaterial({ color: 0xffffff, map: null }));
  tela.material.color.set(telaCor);
  tela.position.set(0, moldura.position.y, -0.205);
  const haste = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.08), lam(0x1d1f26));
  haste.position.set(0, 1.3, -0.28);
  const teclado = new THREE.Mesh(new THREE.BoxGeometry(largura * 0.6, 0.04, 0.35), lam(0x2a2d36));
  teclado.position.set(0, 1.12, 0.25);
  grupo.add(moldura, tela, haste, teclado);
  return { grupo, tela, alturaTela: alt, centroTela: new THREE.Vector3(0, moldura.position.y, -0.2) };
}

// Pilha/chuva de moedas instanciada (posições calculadas por quem usa).
export function moedas(THREE, cena, n) {
  const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 14), new THREE.MeshLambertMaterial({ color: 0xf2c24b, emissive: 0x3a2600 }), n);
  m.frustumCulled = false;
  cena.add(m);
  return m;
}
