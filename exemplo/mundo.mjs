// Mundo 3D do reel de exemplo: um anel de cubos em volta de um cristal, no espaço.
// Aparece só na cena "mundo" (fora dela o canvas fica transparente e o fundo vivo do tema aparece) e reage às marcas
// do reel.json: os cubos chegam no "pôr", o cristal cresce no "tudo", os cubos ondulam no "reagindo" e tudo acende
// na cor do reel no "palavra". Regra de ouro do mundo-kit: tudo é função de t (nada de Math.random nem relógio).
import { prng, suave, fracao, base, estrelas, brilho, sprite } from "./assets/vendor/mundo-kit.mjs";

export function criarMundo(THREE, canvas, dados) {
  const M = dados.marcas;
  const cenasMundo = dados.cenas.filter((c) => c.tipo === "mundo");
  const { renderer, camera, mover } = base(THREE, canvas, { fov: 50, fundo: 0x07060d });
  const cena = new THREE.Scene();
  cena.fog = new THREE.Fog(0x07060d, 18, 60);
  cena.add(estrelas(THREE, 900, 120, 7, 2));
  cena.add(new THREE.HemisphereLight(0xbfd8ff, 0x1a1030, 1.1));
  const luz = new THREE.PointLight(0x4fd1e8, 60, 40);
  cena.add(luz);

  // cristal no centro, com halo
  const cristal = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), new THREE.MeshStandardMaterial({ color: 0x4fd1e8, emissive: 0x0b3a44, flatShading: true, roughness: 0.35 }));
  const halo = sprite(THREE, brilho(THREE, [[0, "rgba(79,209,232,0.9)"], [0.4, "rgba(79,209,232,0.25)"], [1, "rgba(79,209,232,0)"]]), 9);
  cena.add(cristal, halo);

  // anel de cubos (InstancedMesh com frustumCulled desligado, como pede o mundo-kit)
  const N = 42;
  const r = prng(11);
  const cubos = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.5 }), N);
  cubos.frustumCulled = false;
  const CORES = [0xff3d8b, 0x22d3ee, 0xa3e635, 0xff8a3d, 0xa78bfa, 0xfacc15].map((c) => new THREE.Color(c));
  const ACESO = new THREE.Color(0x4fd1e8);
  const sementes = [...Array(N)].map((_, i) => ({ ang: (i / N) * Math.PI * 2, raio: 4.2 + r() * 1.6, alt: (r() - 0.5) * 1.4, giro: r() * Math.PI * 2, longe: 25 + r() * 20, cor: CORES[i % CORES.length] }));
  cena.add(cubos);
  const obj = new THREE.Object3D();
  const cor = new THREE.Color();

  function atualizar(t) {
    const chega = suave(M.entra - 0.2, M.entra + 0.9, t);
    const cresce = suave(M.tudo - 0.1, M.tudo + 0.5, t);
    const onda = suave(M.reage, M.reage + 0.6, t);
    const acende = suave(M.palavra - 0.05, M.palavra + 0.25, t);
    cristal.rotation.set(t * 0.4, t * 0.7, 0);
    cristal.scale.setScalar(1 + cresce * 0.35 + Math.sin(t * 6) * 0.04 * cresce);
    halo.scale.setScalar(8 + cresce * 3 + acende * 3);
    luz.intensity = 60 + acende * 90;
    sementes.forEach((s, i) => {
      const a = s.ang + t * 0.35;
      const raio = s.raio + (1 - chega) * s.longe;
      const y = s.alt + onda * Math.sin(t * 5 + i * 0.6) * 0.9;
      obj.position.set(Math.cos(a) * raio, y, Math.sin(a) * raio);
      obj.rotation.set(s.giro + t * 1.3, s.giro + t * 0.9, 0);
      obj.scale.setScalar(Math.max(0.001, chega) * (1 + acende * 0.2));
      obj.updateMatrix();
      cubos.setMatrixAt(i, obj.matrix);
      cubos.setColorAt(i, cor.copy(s.cor).lerp(ACESO, acende));
    });
    cubos.instanceMatrix.needsUpdate = true;
    cubos.instanceColor.needsUpdate = true;
  }

  // Visível só durante as cenas "mundo": entra em 0,3 s e sai em 0,2 s.
  function opacidade(t) {
    return Math.max(0, ...cenasMundo.map((c) => Math.min(fracao(t, c.t0, c.t0 + 0.3), 1 - fracao(t, c.t1 - 0.2, c.t1))));
  }

  const ini = cenasMundo[0]?.t0 ?? 0;
  const fim = cenasMundo[0]?.t1 ?? dados.total;
  return {
    render(t) {
      atualizar(t);
      // Câmera longe e olhando um pouco abaixo do centro: a cena fica entre o título e a legenda, sem cobrir texto.
      mover(fracao(t, ini, fim), [0, 3.2, 20], [2.5, 2.4, 16], [0, -1.6, 0], [0, -1.3, 0]);
      canvas.style.opacity = String(opacidade(t));
      renderer.render(cena, camera);
    },
  };
}
