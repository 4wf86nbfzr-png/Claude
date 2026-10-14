// 3D-Szene der Landingpage (vanilla three.js) für die Einzeldatei-Vorschau.
// Wird mit esbuild zu einem IIFE gebündelt und in landing-preview.html eingebettet.
import * as THREE from "three";

const LANES = [
  { x: -2.55, color: "#e18147" }, { x: -0.85, color: "#708da9" }, { x: 0.85, color: "#a1ab7c" }, { x: 2.55, color: "#5a5955" },
];
const COUNT = 32;
// Schriftzug CLAIRIFY als Textur je Spur; Rückseite gespiegelt, damit er beim Drehen lesbar bleibt
function makeLabels() {
  return LANES.map((lane, i) => {
    const c = document.createElement("canvas"); c.width = 512; c.height = 168;
    const ctx = c.getContext("2d");
    ctx.fillStyle = lane.color; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = i === 0 ? "#1b1408" : "#f3f2f1";
    ctx.font = "600 78px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.letterSpacing = "10px";
    ctx.fillText("CLAIRIFY", c.width / 2 + 5, c.height / 2 + 4);
    const front = new THREE.CanvasTexture(c); front.colorSpace = THREE.SRGBColorSpace; front.anisotropy = 4;
    const back = front.clone(); back.repeat.x = -1; back.offset.x = 1; back.needsUpdate = true;
    return { front, back };
  });
}
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function mountScene(container, state) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 10.5);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" }); }
  catch { container.classList.add("no-webgl"); return () => {}; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const l1 = new THREE.PointLight(0xffffff, 40); l1.position.set(4, 5, 6); scene.add(l1);
  const l2 = new THREE.PointLight(0x708da9, 25); l2.position.set(-6, -3, 4); scene.add(l2);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.03, 12, 120), new THREE.MeshStandardMaterial({ color: 0x708da9, emissive: 0x708da9, emissiveIntensity: 0.8, transparent: true, opacity: 0.3 }));
  ring.position.z = -1.5; scene.add(ring);

  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const group = new THREE.Group(); scene.add(group);
  const geo = new THREE.BoxGeometry(1.35, 0.44, 0.06);
  const labels = makeLabels();
  const cardMaterials = (lane) => {
    const side = () => new THREE.MeshStandardMaterial({ color: LANES[lane].color, emissive: LANES[lane].color, emissiveIntensity: 0.15, roughness: 0.35, metalness: 0.2 });
    const face = (tex) => new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, emissive: LANES[lane].color, emissiveMap: tex, emissiveIntensity: 0.15, roughness: 0.35, metalness: 0.2 });
    return [side(), side(), side(), side(), face(labels[lane].front), face(labels[lane].back)];
  };
  const items = Array.from({ length: COUNT }, (_, i) => {
    const lane = i % 4, idx = Math.floor(i / 4);
    const it = {
      lane,
      chaos: new THREE.Vector3((rnd() - 0.5) * 9, (rnd() - 0.5) * 5.5, (rnd() - 0.5) * 5),
      chaosRot: new THREE.Euler((rnd() - 0.5) * 1.6, (rnd() - 0.5) * 2.2, (rnd() - 0.5) * 0.8),
      sorted: new THREE.Vector3(LANES[lane].x, 2.1 - idx * 0.6, 0),
      drift: rnd() * Math.PI * 2,
      mesh: new THREE.Mesh(geo, cardMaterials(lane)),
    };
    it.mesh.position.copy(it.chaos); it.mesh.rotation.copy(it.chaosRot); group.add(it.mesh);
    return it;
  });
  const focusTarget = new THREE.Vector3(0, 0.2, 2.6), tmp = new THREE.Vector3();
  const clock = new THREE.Clock();

  const resize = () => { const w = container.clientWidth, h = container.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  resize(); window.addEventListener("resize", resize);

  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime(), p = state.progress;
    const sortK = easeInOut(clamp01((p - 0.12) / 0.4)), focusK = easeInOut(clamp01((p - 0.62) / 0.22));
    items.forEach((it, i) => {
      const m = it.mesh;
      tmp.copy(it.chaos).lerp(it.sorted, sortK);
      tmp.y += Math.sin(t * 0.8 + it.drift) * 0.06 * (1 - sortK * 0.7);
      let scale = 1;
      if (i === 0) { tmp.lerp(focusTarget, focusK); scale = 1 + focusK * 1.1; } else if (focusK > 0) tmp.z -= focusK * 1.2;
      m.position.lerp(tmp, 0.09);
      m.rotation.x += (it.chaosRot.x * (1 - sortK) - m.rotation.x) * 0.08;
      m.rotation.y += (it.chaosRot.y * (1 - sortK) - m.rotation.y) * 0.08;
      m.rotation.z += (it.chaosRot.z * (1 - sortK) - m.rotation.z) * 0.08;
      m.scale.setScalar(THREE.MathUtils.lerp(m.scale.x, scale, 0.1));
      const k = it.lane === 0 ? 0.35 + sortK * 0.5 : 0.12 + sortK * 0.15;
      m.material.forEach((mat) => { mat.emissiveIntensity = k; });
    });
    group.rotation.y += (state.px * 0.35 - group.rotation.y) * 0.05;
    group.rotation.x += (-state.py * 0.2 - group.rotation.x) * 0.05;
    ring.rotation.z = t * 0.25; ring.rotation.x = Math.PI / 2.4 + Math.sin(t * 0.3) * 0.1;
    const k = clamp01((p - 0.1) / 0.3); ring.scale.setScalar(0.6 + k * 0.8); ring.material.opacity = 0.25 + k * 0.4;
    camera.position.x += (state.px * 0.6 - camera.position.x) * 0.04;
    camera.position.y += (state.py * 0.3 - camera.position.y) * 0.04;
    camera.lookAt(0, 0.2, 0);
    renderer.render(scene, camera);
  });

  // WebXR: Knöpfe nur, wenn das Gerät eine Sitzung unterstützt
  const xr = navigator.xr;
  if (xr) {
    Promise.all(["immersive-vr", "immersive-ar"].map((m) => xr.isSessionSupported(m).then((ok) => (ok ? m : null)).catch(() => null))).then((modes) => {
      const wrap = document.createElement("div"); wrap.className = "xr-buttons";
      modes.filter(Boolean).forEach((mode) => {
        const b = document.createElement("button"); b.type = "button"; b.textContent = mode === "immersive-vr" ? "In VR ansehen" : "In AR ansehen";
        b.onclick = async () => { const s = await xr.requestSession(mode, { optionalFeatures: ["local-floor"] }); await renderer.xr.setSession(s); };
        wrap.appendChild(b);
      });
      if (wrap.childElementCount) container.appendChild(wrap);
    });
  }
  return () => { renderer.setAnimationLoop(null); renderer.dispose(); };
}

/* ---- Kugelring (Produktbild der Tarife) ---------------------------------------------------- */
const RING_CFG = [{ rows: 7, cols: 34, R: 2.0, r: 0.72 }, { rows: 10, cols: 44, R: 2.25, r: 0.95 }, { rows: 13, cols: 54, R: 2.45, r: 1.15 }];
const RING_MAX = 13 * 54;
export function mountRing(container, state) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" }); } catch { return () => {}; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100); camera.position.set(0, 0, 11.5);
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(-4, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9a9aa0, 0.5); rim.position.set(5, -3, -4); scene.add(rim);
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 16), new THREE.MeshStandardMaterial({ color: 0x5c5c62, roughness: 0.5, metalness: 0.4 }), RING_MAX);
  mesh.frustumCulled = false; const group = new THREE.Group(); group.add(mesh); scene.add(group);
  const dummy = new THREE.Object3D(); const cur = { ...RING_CFG[state.variant || 0] }; const mouse = { x: 0, y: 0 };
  const onMove = (e) => { mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = (e.clientY / window.innerHeight) * 2 - 1; };
  window.addEventListener("pointermove", onMove, { passive: true });
  container.appendChild(renderer.domElement); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "100%";
  const resize = () => { const w = container.clientWidth || 1, h = container.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  resize(); window.addEventListener("resize", resize);
  let last = performance.now(), raf = 0, running = true;
  const frame = (now) => {
    if (!running) return; raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = RING_CFG[state.variant || 0], k = Math.min(1, dt * 3);
    cur.rows += (t.rows - cur.rows) * k; cur.cols += (t.cols - cur.cols) * k; cur.R += (t.R - cur.R) * k; cur.r += (t.r - cur.r) * k;
    const rows = Math.max(3, Math.round(cur.rows)), cols = Math.max(8, Math.round(cur.cols)); const size = Math.min((2 * Math.PI * cur.R) / cols, (2 * Math.PI * cur.r) / rows) * 0.48;
    let n = 0;
    for (let i = 0; i < rows; i++) { const phi = (i / rows) * Math.PI * 2; for (let j = 0; j < cols; j++) { const th = (j / cols) * Math.PI * 2 + (i % 2) * (Math.PI / cols); const rr = cur.R + cur.r * Math.cos(phi); dummy.position.set(rr * Math.cos(th), rr * Math.sin(th), cur.r * Math.sin(phi)); dummy.scale.setScalar(size); dummy.updateMatrix(); mesh.setMatrixAt(n++, dummy.matrix); } }
    for (let i = n; i < RING_MAX; i++) { dummy.scale.setScalar(0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); }
    mesh.instanceMatrix.needsUpdate = true;
    group.rotation.x += ((0.72 + mouse.y * 0.18 + (state.progress || 0) * 0.9) - group.rotation.x) * Math.min(1, dt * 2.5);
    group.rotation.y += ((mouse.x * 0.25) - group.rotation.y) * Math.min(1, dt * 2.5);
    group.rotation.z = now / 1000 * 0.09;
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);
  return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener("pointermove", onMove); window.removeEventListener("resize", resize); renderer.dispose(); container.innerHTML = ""; };
}

/* ---- Partikeltunnel (Schlussbild) --------------------------------------------------------- */
export function mountTunnel(container, state) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" }); } catch { return () => {}; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const N = 3200, LEN = 140; const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x050505, 20, 120);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
  let seed = 7; const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pos = new Float32Array(N * 3), bias = new Float32Array(N);
  for (let i = 0; i < N; i++) { const a = rnd() * Math.PI * 2, rad = 4.5 + Math.pow(rnd(), 0.6) * 5.5; pos[i * 3] = Math.cos(a) * rad; pos[i * 3 + 1] = Math.sin(a) * rad; pos[i * 3 + 2] = -rnd() * LEN; bias[i] = 0.6 + rnd() * 0.8; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d"); const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16); grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.5, "rgba(255,255,255,0.6)"); grd.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, size: 0.26, color: 0xffffff, transparent: true, opacity: 0.9, sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(points);
  const mouse = { x: 0, y: 0 }; const onMove = (e) => { mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = (e.clientY / window.innerHeight) * 2 - 1; };
  window.addEventListener("pointermove", onMove, { passive: true });
  container.appendChild(renderer.domElement); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "100%";
  const resize = () => { const w = container.clientWidth || 1, h = container.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  resize(); window.addEventListener("resize", resize);
  let last = performance.now(), raf = 0, running = true;
  const frame = (now) => {
    if (!running) return; raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const speed = 14 + Math.min(60, Math.abs(state.velocity || 0) * 0.03); const arr = geo.attributes.position.array;
    for (let i = 0; i < N; i++) { let z = arr[i * 3 + 2] + speed * bias[i] * dt; if (z > 1) z -= LEN; arr[i * 3 + 2] = z; }
    geo.attributes.position.needsUpdate = true;
    camera.position.x += (mouse.x * 0.9 - camera.position.x) * Math.min(1, dt * 2); camera.position.y += (-mouse.y * 0.6 - camera.position.y) * Math.min(1, dt * 2); camera.lookAt(0, 0, -40);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);
  return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener("pointermove", onMove); window.removeEventListener("resize", resize); renderer.dispose(); container.innerHTML = ""; };
}
