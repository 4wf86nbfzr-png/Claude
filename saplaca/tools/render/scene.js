import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b) => clamp((p - a) / (b - a));
const io = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const ss = t => t * t * (3 - 2 * t);
const eo = t => 1 - Math.pow(1 - t, 3);
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const col = s => new THREE.Color(s); // linear (ColorManagement)

let renderer, scene, camera, composer, tall = false, W = 1280, H = 720;
const BG = '#F3EFE6';
// Sauce glänzt, Pasta ist matt: Rauheit aus der Vertexfarbe ableiten (Rot >> Grün = Sauce)
function wetSauce(mat, wet = .16) {
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, ${wet.toFixed(2)}, smoothstep(.12, .35, vColor.r - vColor.g));`);
  };
  return mat;
}

/* ------------------------------------------------------------------ */
/* Röhren mit variablem Radius, Puffer werden pro Frame neu befüllt     */
/* ------------------------------------------------------------------ */
class Tubes {
  constructor(count, np, radial, material) {
    this.count = count; this.np = np; this.rad = radial;
    const nv = count * np * radial;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(nv * 3); this.nor = new Float32Array(nv * 3); this.col = new Float32Array(nv * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const idx = [];
    for (let s = 0; s < count; s++) for (let i = 0; i < np - 1; i++) for (let j = 0; j < radial; j++) {
      const a = (s * np + i) * radial + j, b = (s * np + i) * radial + (j + 1) % radial;
      const c = a + radial, d = b + radial;
      idx.push(a, b, c, b, d, c);
    }
    g.setIndex(idx);
    this.geo = g; this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.T = new Float32Array(np * 3); this.N = new Float32Array(np * 3); this.B = new Float32Array(np * 3);
  }
  // pts: Float32Array np*3, radius(i) and color(i, j) callbacks
  set(s, pts, radius, color) {
    const { np, rad, T, N, B } = this;
    for (let i = 0; i < np; i++) {
      const a = Math.max(0, i - 1) * 3, b = Math.min(np - 1, i + 1) * 3;
      let tx = pts[b] - pts[a], ty = pts[b + 1] - pts[a + 1], tz = pts[b + 2] - pts[a + 2];
      const l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
      T[i * 3] = tx; T[i * 3 + 1] = ty; T[i * 3 + 2] = tz;
      let nx, ny, nz;
      if (i === 0) { // beliebige Senkrechte
        if (Math.abs(ty) < .9) { nx = -tz; ny = 0; nz = tx; } else { nx = 0; ny = tz; nz = -ty; }
      } else { nx = N[i * 3 - 3]; ny = N[i * 3 - 2]; nz = N[i * 3 - 1]; }
      const d = nx * tx + ny * ty + nz * tz; nx -= tx * d; ny -= ty * d; nz -= tz * d;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      N[i * 3] = nx; N[i * 3 + 1] = ny; N[i * 3 + 2] = nz;
      B[i * 3] = ty * nz - tz * ny; B[i * 3 + 1] = tz * nx - tx * nz; B[i * 3 + 2] = tx * ny - ty * nx;
    }
    const tmp = [0, 0, 0];
    for (let i = 0; i < np; i++) {
      const r = radius(i);
      for (let j = 0; j < rad; j++) {
        const a = j / rad * TAU, ca = Math.cos(a), sa = Math.sin(a);
        const nx = ca * N[i * 3] + sa * B[i * 3], ny = ca * N[i * 3 + 1] + sa * B[i * 3 + 1], nz = ca * N[i * 3 + 2] + sa * B[i * 3 + 2];
        const o = ((s * np + i) * rad + j) * 3;
        this.pos[o] = pts[i * 3] + nx * r; this.pos[o + 1] = pts[i * 3 + 1] + ny * r; this.pos[o + 2] = pts[i * 3 + 2] + nz * r;
        this.nor[o] = nx; this.nor[o + 1] = ny; this.nor[o + 2] = nz;
        color(i, a, tmp, nx, ny, nz);
        this.col[o] = tmp[0]; this.col[o + 1] = tmp[1]; this.col[o + 2] = tmp[2];
      }
    }
  }
  done() {
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/* Pasta                                                               */
/* ------------------------------------------------------------------ */
const NS = 84, NP = 200, RS = 0.019;
const strands = [];
{
  const r = rng(11);
  for (let i = 0; i < NS; i++) strands.push({
    phase: i / NS * TAU + (r() - .5) * .4,
    bundle: (r() - .5) * 1.7,
    dr: (r() - .5) * .12, dy: (r() - .5) * .07, sdr: (r() - .5) * .2,
    tilt: (r() - .5) * 1.3, tax: r() * TAU,
    hang: i % 7 === 2, seed: r() * 50, w: .9 + r() * .2, len: .93 + r() * .07,
    rdr: (r() - .5) * .05, side: r() * TAU,
  });
}
const PASTA_A = col('#efbd6c'), PASTA_B = col('#d99a48'), SAUCE_A = col('#a91f0c'), SAUCE_B = col('#6f1006'), SAUCE_HI = col('#cf3a1a');
function sauceAt(s, u) {
  const v = .5 + .5 * Math.sin(u * 8.5 + s.seed) * Math.sin(u * 3.3 + s.seed * 1.7);
  return v;
}

// Zustand der Pasta (Nest-Lage, Spiral-Lage, Morph)
const PS = { m: 0, tw: 0, spin: 0, nestPos: V(), nestQ: new THREE.Quaternion(), spirPos: V(), drop: 0, k: 0, platePos: V(0, -.45, 0) };
const _mo = V();
const _v = V(), _w = V(), _ax = V();
function strandPoint(s, u, out) {
  const m = PS.m;
  // Nest um die Gabelachse (lokal y)
  const uu = s.hang ? Math.min(u, .6) : u;
  const th = s.phase + uu * TAU * 3.2 + PS.tw;
  let y = .33 - uu * .66 + s.dy;
  let r = .42 * Math.sqrt(Math.max(.1, 1 - (y / .39) ** 2)) + s.dr;
  _v.set(Math.cos(th) * r, y, Math.sin(th) * r);
  _ax.set(Math.cos(s.tax), 0, Math.sin(s.tax));
  _v.applyAxisAngle(_ax, s.tilt * .22);
  _v.applyQuaternion(PS.nestQ).add(PS.nestPos);
  if (s.hang && u > .6) {
    const k = (u - .6) / .4;
    _v.x += Math.sin(k * 3.1 + s.seed) * .13 * k + s.rdr * 2 * k;
    _v.y -= k * (.75 + (s.seed % 1) * .45);
    _v.z += Math.cos(k * 2.6 + s.seed) * .1 * k;
  }
  // Spirale
  const ph = lerp(s.phase, s.bundle, m);
  const ts = ph + u * TAU * 3.0 + PS.spin;
  const ys = 1.3 - u * 2.6 + s.dy * .9;
  const rs = .29 + .15 * Math.sin(Math.PI * u) + s.sdr + .02 * Math.sin(u * 13 + s.seed);
  _w.set(Math.cos(ts) * rs, ys, Math.sin(ts) * rs).add(PS.spirPos);
  out.lerpVectors(_v, _w, m);
  // Finale: die Spirale legt sich als gedrehtes Nest auf den Teller
  if (PS.k > 0) {
    const uu2 = s.hang ? Math.min(u, .6) : u;
    const th2 = s.phase + uu2 * TAU * 3.2 + PS.spin * .3;
    const y2 = .28 - uu2 * .5 + s.dy * .7;
    const r2 = .5 * Math.sqrt(Math.max(.14, 1 - ((y2 - .03) / .29) ** 2)) + s.dr;
    _mo.set(Math.cos(th2) * r2, y2 * .72, Math.sin(th2) * r2);
    _ax.set(Math.cos(s.tax), 0, Math.sin(s.tax));
    _mo.applyAxisAngle(_ax, s.tilt * .12);
    if (s.hang && u > .6) {
      const k = (u - .6) / .4, a = th2 + k * 2.6, rr = .45 + k * .32;
      _mo.set(Math.cos(a) * rr, -.15 + Math.sin(k * 7 + s.seed) * .02, Math.sin(a) * rr);
    }
    _mo.add(PS.platePos).add(V(0, .2, 0));
    out.lerp(_mo, PS.k);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Aufbau                                                              */
/* ------------------------------------------------------------------ */
let pasta, blobs, drips, fork, ING = {}, basil, plate, puddle, ground;
const blobSpec = [];
const pts = new Float32Array(NP * 3);
const _p = V();

function makeCanvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

function noiseDisplace(geo, amt, freq, seed = 1) {
  const p = geo.attributes.position, v = V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * freq + seed) * Math.sin(v.y * freq * 1.3 + seed * 2) * Math.sin(v.z * freq * .9 + seed * 3);
    v.multiplyScalar(1 + n * amt);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
}

function buildTomato() {
  const g = new THREE.SphereGeometry(.27, 96, 64);
  const p = g.attributes.position, v = V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const az = Math.atan2(v.z, v.x), lat = v.y / .27;
    const lobe = 1 + .035 * Math.cos(az * 5) * (1 - lat * lat);
    v.x *= lobe; v.z *= lobe; v.y *= .86;
    if (lat > .75) v.y -= (lat - .75) * .09; // Mulde am Stielansatz
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const skin = new THREE.MeshPhysicalMaterial({ color: '#c81b0b', roughness: .22, clearcoat: 1, clearcoatRoughness: .07, sheen: .35, sheenColor: '#ff6a3c', sheenRoughness: .5 });
  const grp = new THREE.Group();
  const body = new THREE.Mesh(g, skin); body.castShadow = body.receiveShadow = true; grp.add(body);
  const green = new THREE.MeshPhysicalMaterial({ color: '#3f6e22', roughness: .5, sheen: .5, sheenColor: '#9ad070', side: THREE.DoubleSide });
  for (let k = 0; k < 5; k++) {
    const sh = new THREE.Shape(); sh.moveTo(0, -.018); sh.quadraticCurveTo(.08, -.02, .14, 0); sh.quadraticCurveTo(.08, .02, 0, .018); sh.lineTo(0, -.018);
    const sg = new THREE.ShapeGeometry(sh, 12);
    const pp = sg.attributes.position;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i); pp.setZ(i, -x * x * 2.2); }
    sg.computeVertexNormals();
    const sepal = new THREE.Mesh(sg, green);
    sepal.rotation.x = -Math.PI / 2; sepal.rotation.z = 0;
    const holder = new THREE.Group(); holder.add(sepal); holder.rotation.y = k / 5 * TAU + .3; holder.position.y = .2;
    sepal.castShadow = true; grp.add(holder);
  }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.012, .016, .1, 12), green); stem.position.y = .25; stem.rotation.z = .25; grp.add(stem);
  return grp;
}

function buildTomHalf() {
  const R = .25, grp = new THREE.Group();
  const skinG = new THREE.SphereGeometry(R, 64, 32, 0, TAU, 0, Math.PI / 2);
  skinG.scale(1, .88, 1);
  const skin = new THREE.MeshPhysicalMaterial({ color: '#c41c0c', roughness: .22, clearcoat: 1, clearcoatRoughness: .08, side: THREE.DoubleSide });
  const s = new THREE.Mesh(skinG, skin); s.rotation.x = Math.PI / 2; s.castShadow = true; grp.add(s); // Kuppel zeigt nach -z
  const tex = makeCanvas(1024, 1024, (c, w) => {
    const cx = w / 2;
    let g = c.createRadialGradient(cx, cx, 0, cx, cx, cx); g.addColorStop(0, '#f6a184'); g.addColorStop(.6, '#ea4a2a'); g.addColorStop(.93, '#d7301a'); g.addColorStop(.97, '#a01408'); g.addColorStop(1, '#7d0e05');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cx, cx, 0, TAU); c.fill();
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * TAU + .4;
      c.save(); c.translate(cx, cx); c.rotate(a);
      g = c.createRadialGradient(w * .26, 0, 10, w * .26, 0, w * .2); g.addColorStop(0, '#ffd27c'); g.addColorStop(.7, '#f4a144'); g.addColorStop(1, '#e8662f');
      c.fillStyle = g; c.beginPath(); c.ellipse(w * .26, 0, w * .17, w * .12, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,240,190,.95)';
      for (let q = 0; q < 7; q++) { c.beginPath(); c.ellipse(w * (.18 + q % 3 * .07), (q - 3) * w * .022, w * .016, w * .01, (q - 3) * .3, 0, TAU); c.fill(); }
      c.restore();
    }
    g = c.createRadialGradient(cx, cx, 0, cx, cx, w * .1); g.addColorStop(0, '#ffc3a8'); g.addColorStop(1, 'rgba(240,120,90,0)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cx, w * .1, 0, TAU); c.fill();
  });
  const face = new THREE.Mesh(new THREE.CircleGeometry(R * .995, 96), new THREE.MeshPhysicalMaterial({ map: tex, roughness: .3, clearcoat: 1, clearcoatRoughness: .12, sheen: .3, sheenColor: '#ffb090' }));
  face.receiveShadow = true; grp.add(face);
  return grp;
}

function buildBasil() {
  const tex = makeCanvas(512, 1024, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const path = new Path2D(`M${w / 2} ${h * .98} C${w * .02} ${h * .7} ${w * .02} ${h * .25} ${w / 2} ${h * .02} C${w * .98} ${h * .25} ${w * .98} ${h * .7} ${w / 2} ${h * .98}Z`);
    let g = c.createLinearGradient(0, h, w, 0); g.addColorStop(0, '#2f6a1d'); g.addColorStop(.55, '#4f9a2f'); g.addColorStop(1, '#78bd4b');
    c.fillStyle = g; c.fill(path);
    c.save(); c.clip(path);
    c.strokeStyle = 'rgba(205,240,170,.55)'; c.lineWidth = 7; c.beginPath(); c.moveTo(w / 2, h); c.lineTo(w / 2, h * .04); c.stroke();
    c.lineWidth = 3; c.strokeStyle = 'rgba(200,240,160,.32)';
    for (let k = 1; k < 8; k++) { const y = h * (.9 - k * .1); c.beginPath(); c.moveTo(w / 2, y); c.quadraticCurveTo(w * .3, y - h * .04, w * .1, y - h * .1); c.moveTo(w / 2, y); c.quadraticCurveTo(w * .7, y - h * .04, w * .9, y - h * .1); c.stroke(); }
    g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(0,30,0,.25)'); g.addColorStop(.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,30,0,.2)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.restore();
  });
  const g = new THREE.PlaneGeometry(.26, .52, 30, 60);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / .13, y = p.getY(i) / .26;
    p.setZ(i, .05 * x * x - .022 * Math.abs(x) + .07 * y * y);
  }
  g.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({ map: tex, alphaTest: .5, side: THREE.DoubleSide, roughness: .38, clearcoat: .45, clearcoatRoughness: .3, sheen: .6, sheenColor: '#c9f2a0' });
  const m = new THREE.Mesh(g, mat);
  const grp = new THREE.Group(); grp.add(m);
  // zweites, kleineres Blatt
  const m2 = new THREE.Mesh(g, mat); m2.scale.setScalar(.62); m2.position.set(.08, -.2, .02); m2.rotation.set(.3, .2, -.9); grp.add(m2);
  return grp;
}

function buildPrawn() {
  const grp = new THREE.Group();
  const NPp = 90, RAD = 24;
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .3, sheen: .25, sheenColor: '#ffd0b8', specularIntensity: .7, envMapIntensity: .6 });
  const tube = new Tubes(1, NPp, RAD, mat);
  const pp = new Float32Array(NPp * 3);
  const a0 = 2.0, a1 = -2.55, Rc = .17;
  for (let i = 0; i < NPp; i++) {
    const v = i / (NPp - 1), a = lerp(a0, a1, v);
    pp[i * 3] = Math.cos(a) * Rc; pp[i * 3 + 1] = Math.sin(a) * Rc; pp[i * 3 + 2] = Math.sin(v * Math.PI) * .03;
  }
  const belly = col('#f8e3d8'), back = col('#ee7444'), stripe = col('#c63a17'), hi = col('#ffe9dc');
  tube.set(0, pp, i => {
    const v = i / (NPp - 1);
    let r = lerp(.082, .026, Math.pow(v, 1.1)) * (1 + .06 * Math.cos(v * TAU * 6.5));
    if (v > .97) r *= (1 - v) / .03 * .6 + .4;
    return r;
  }, (i, ang, out, nx, ny) => {
    const v = i / (NPp - 1), a = lerp(a0, a1, v);
    const dorsal = nx * Math.cos(a) + ny * Math.sin(a); // nach außen = Rücken
    const k = ss(clamp((dorsal + .35) / .9));
    const st = Math.pow(Math.max(0, Math.cos(v * TAU * 6.5 + Math.PI)), 14) * k;
    const c = belly.clone().lerp(back, k).lerp(stripe, st * .8);
    if (dorsal < -.6) c.lerp(hi, .4);
    out[0] = c.r; out[1] = c.g; out[2] = c.b;
  });
  tube.done(); tube.mesh.castShadow = tube.mesh.receiveShadow = true;
  grp.add(tube.mesh);
  const headPos = V(Math.cos(a0) * Rc, Math.sin(a0) * Rc, 0), ht = V(-Math.sin(a0), Math.cos(a0), 0); // Richtung zum Kopf hin (gegen Laufrichtung)
  const headMat = new THREE.MeshPhysicalMaterial({ color: '#f07a48', roughness: .3, clearcoat: .9, clearcoatRoughness: .15, sheen: .5, sheenColor: '#ffc0a0' });
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), headMat);
  head.scale.set(.12, .085, .085); head.position.copy(headPos).addScaledVector(ht, .07); head.rotation.z = a0 + Math.PI / 2; head.castShadow = true; grp.add(head);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(.016, 16, 12), new THREE.MeshPhysicalMaterial({ color: '#150a05', roughness: .1, clearcoat: 1 }));
  eye.position.copy(head.position).addScaledVector(ht, .07).add(V(.02, .02, .06)); grp.add(eye);
  const thin = new THREE.MeshPhysicalMaterial({ color: '#e4683c', roughness: .4 });
  for (const [dx, dy, len] of [[1, .4, .9], [.8, .9, .75]]) {
    const curve = new THREE.CatmullRomCurve3([head.position.clone().addScaledVector(ht, .1), head.position.clone().add(V(dx * .25, dy * .2 + .15, .05)), head.position.clone().add(V(dx * .55 * len, dy * .3 + .2, .1)), head.position.clone().add(V(dx * .85 * len, dy * .15 + .05, .12))]);
    grp.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, .0045, 6), thin));
  }
  const legMat = new THREE.MeshPhysicalMaterial({ color: '#f39a74', roughness: .45 });
  for (let k = 0; k < 7; k++) {
    const v = .08 + k * .07, a = lerp(a0, a1, v);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.006, .004, .08, 6), legMat);
    leg.position.set(Math.cos(a) * (Rc - .07), Math.sin(a) * (Rc - .07), .02);
    leg.rotation.z = a + Math.PI / 2; grp.add(leg);
  }
  const tailMat = new THREE.MeshPhysicalMaterial({ color: '#d84a20', roughness: .3, clearcoat: .8, sheen: .4, sheenColor: '#ff9a70' });
  const te = V(Math.cos(a1) * Rc, Math.sin(a1) * Rc, 0), tt = V(Math.sin(a1), -Math.cos(a1), 0);
  for (const off of [-.45, 0, .45]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), tailMat);
    f.scale.set(.085, .032, .012);
    const dir = tt.clone().applyAxisAngle(V(0, 0, 1), off);
    f.position.copy(te).addScaledVector(dir, .07);
    f.rotation.z = Math.atan2(dir.y, dir.x); f.castShadow = true; grp.add(f);
  }
  return grp;
}

function shellGeometry(L, Wd, D) {
  const g = new THREE.SphereGeometry(1, 64, 32, 0, TAU, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = (x + 1) / 2; // 0 = Scharnier
    const taper = .18 + .82 * Math.sin(Math.PI * Math.min(1, t * .92 + .08)) ** .7;
    p.setXYZ(i, t * L, y * D * (.35 + .65 * taper), z * Wd * taper * (t < .3 ? .7 + t : 1));
  }
  g.computeVertexNormals();
  return g;
}
function buildMussel() {
  const grp = new THREE.Group();
  const L = .52, Wd = .17, D = .1;
  const ext = new THREE.MeshPhysicalMaterial({ color: '#141a28', roughness: .22, clearcoat: 1, clearcoatRoughness: .1, sheen: .5, sheenColor: '#5a6a90', side: THREE.FrontSide });
  const nac = new THREE.MeshPhysicalMaterial({ color: '#cfd0d8', roughness: .25, metalness: .25, iridescence: .8, iridescenceIOR: 1.6, side: THREE.BackSide });
  const sg = shellGeometry(L, Wd, D);
  const bottom = new THREE.Group();
  const b1 = new THREE.Mesh(sg, ext), b2 = new THREE.Mesh(sg, nac);
  bottom.add(b1, b2); bottom.rotation.x = Math.PI; // Wölbung nach unten, Öffnung nach oben
  const top = new THREE.Group();
  const t1 = new THREE.Mesh(sg, ext), t2 = new THREE.Mesh(sg, nac);
  top.add(t1, t2); top.rotation.z = 1.0; // aufgeklappt um das Scharnier
  [b1, t1].forEach(m => { m.castShadow = true; m.receiveShadow = true; });
  const meatG = new THREE.SphereGeometry(1, 64, 40);
  meatG.scale(L * .4, D * .55, Wd * .62);
  noiseDisplace(meatG, .08, 24, 3);
  const meat = new THREE.Mesh(meatG, new THREE.MeshPhysicalMaterial({ color: '#e8833a', roughness: .3, clearcoat: .9, clearcoatRoughness: .15, sheen: .6, sheenColor: '#ffc080' }));
  meat.position.set(L * .52, -.005, 0); meat.castShadow = true;
  grp.add(bottom, top, meat);
  grp.children.forEach(c => c.position.x -= L * .5);
  meat.position.x = L * .02;
  return grp;
}

function buildFork() {
  const sh = new THREE.Shape();
  const S = .0046;
  const P = (x, y) => [(x - 50) * S, (600 - y) * S];
  const cmds = [['M', 38, 0], ['Q', 50, -6, 62, 0], ['L', 66, 230], ['Q', 60, 300, 54, 330], ['Q', 76, 360, 80, 400], ['L', 80, 590], ['Q', 80, 600, 75, 600], ['Q', 70, 600, 70, 590], ['L', 70, 430], ['L', 64, 430], ['L', 64, 595], ['Q', 64, 600, 59.5, 600], ['Q', 55, 600, 55, 595], ['L', 55, 430], ['L', 45, 430], ['L', 45, 595], ['Q', 45, 600, 40.5, 600], ['Q', 36, 600, 36, 595], ['L', 36, 430], ['L', 30, 430], ['L', 30, 590], ['Q', 30, 600, 25, 600], ['Q', 20, 600, 20, 590], ['L', 20, 400], ['Q', 24, 360, 46, 330], ['Q', 40, 300, 34, 230]];
  for (const c of cmds) {
    if (c[0] === 'M') sh.moveTo(...P(c[1], c[2]));
    else if (c[0] === 'L') sh.lineTo(...P(c[1], c[2]));
    else sh.quadraticCurveTo(...P(c[1], c[2]), ...P(c[3], c[4]));
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: .018, bevelEnabled: true, bevelThickness: .008, bevelSize: .006, bevelSegments: 4, curveSegments: 16 });
  g.translate(0, 0, -.009);
  // leichte Krümmung im Kopf
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < .8) p.setZ(i, p.getZ(i) + (.8 - y) ** 2 * .12); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: '#eef0f3', metalness: 1, roughness: .22, envMapIntensity: 4.5 }));
  m.castShadow = true;
  return m;
}

/* ------------------------------------------------------------------ */
window.setup = async (w, h, ssf = 1.5) => {
  W = w; H = h; tall = h > w;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(ssf); renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  
  document.body.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture;
  scene.environmentIntensity = .38;
  camera = new THREE.PerspectiveCamera(tall ? 38 : 30, w / h, .1, 100);

  const key = new THREE.DirectionalLight('#fff0dc', 3.1); key.position.set(-3, 5, 4);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -2.6, right: 2.6, top: 2.6, bottom: -2.6, near: .5, far: 20 });
  key.shadow.bias = -.0004; key.shadow.normalBias = .015; key.shadow.radius = 3;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#ffd6ad', 1.5); rim.position.set(4, 2.5, -4); scene.add(rim);
  scene.add(new THREE.HemisphereLight('#fff7ec', '#b59a7c', .35));

  const pastaMat = wetSauce(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .5, sheen: .2, sheenColor: '#ffcf8a', sheenRoughness: .7, specularIntensity: .6, envMapIntensity: .55 }));
  pasta = new Tubes(NS, NP, 8, pastaMat);
  pasta.mesh.castShadow = pasta.mesh.receiveShadow = true;
  scene.add(pasta.mesh);

  const sauceMat = new THREE.MeshPhysicalMaterial({ color: '#a3230d', roughness: .16, specularIntensity: .8, envMapIntensity: .45 });
  const bg = new THREE.IcosahedronGeometry(1, 3); noiseDisplace(bg, .18, 3.2, 2);
  const r = rng(5);
  for (let i = 0; i < 90; i++) blobSpec.push({ s: Math.floor(r() * NS), u: .05 + r() * .9, a: r() * TAU, k: .7 + r() * .9 });
  blobs = new THREE.InstancedMesh(bg, sauceMat, blobSpec.length);
  blobs.castShadow = true; blobs.receiveShadow = true; blobs.frustumCulled = false;
  scene.add(blobs);

  drips = new Tubes(2, 40, 14, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .14, specularIntensity: .8, envMapIntensity: .45 }));
  drips.mesh.castShadow = true; scene.add(drips.mesh);

  fork = buildFork(); scene.add(fork);
  ING.tomato = buildTomato();
  ING.tomhalf = buildTomHalf();
  ING.prawn1 = buildPrawn(); ING.prawn2 = buildPrawn();
  ING.mussel1 = buildMussel(); ING.mussel2 = buildMussel();
  basil = buildBasil();
  Object.values(ING).forEach(g => scene.add(g)); scene.add(basil);
  const prof = [[0, 0], [.6, 0], [.66, .03], [.95, .05], [1.24, .12], [1.3, .145], [1.28, .16], [1.2, .14], [.95, .078], [.62, .062], [0, .062]].map(q => new THREE.Vector2(q[0], q[1]));
  plate = new THREE.Mesh(new THREE.LatheGeometry(prof, 128), new THREE.MeshPhysicalMaterial({ color: '#f3f0ea', roughness: .26, clearcoat: .6, clearcoatRoughness: .15 }));
  plate.castShadow = plate.receiveShadow = true; scene.add(plate);
  const pg = new THREE.CircleGeometry(1, 96); const pp2 = pg.attributes.position;
  for (let i = 1; i < pp2.count; i++) { const x = pp2.getX(i), y = pp2.getY(i), a = Math.atan2(y, x), r = 1 + .08 * Math.sin(a * 5) + .05 * Math.sin(a * 11 + 1); pp2.setXY(i, x * r, y * r); }
  puddle = new THREE.Mesh(pg, new THREE.MeshPhysicalMaterial({ color: '#9a1d0b', roughness: .14, specularIntensity: .8, envMapIntensity: .45 }));
  puddle.rotation.x = -Math.PI / 2; puddle.receiveShadow = true; scene.add(puddle);
  ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: .22, transparent: true }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  composer = new EffectComposer(renderer);
  composer.setPixelRatio(ssf); composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, w * ssf, h * ssf);
  ao.updateGtaoMaterial({ radius: .12, distanceExponent: 1.4, thickness: 1, scale: 1.2, samples: 16 });
  ao.blendIntensity = .9;
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  return true;
};

/* ------------------------------------------------------------------ */
/* Choreografie                                                        */
/* ------------------------------------------------------------------ */
// Zutatenlagen im Kameraraum (x rechts, y oben, z zur Kamera) relativ zum Blickpunkt
const LAY = {
  wide: {
    tomato: [-1.45, .02, .3], mussel1: [-1.05, .98, -.2], tomhalf: [1.1, .98, -.2], prawn1: [1.4, -.05, .35],
    basil: [.5, .36, .6], prawn2: [-1.0, -.98, .25], mussel2: [1.05, -1.0, .25],
  },
  tall: {
    tomato: [-1.02, .28, .35], mussel1: [-.95, 1.4, -.2], tomhalf: [.98, 1.36, -.2], prawn1: [1.02, -.02, .35],
    basil: [.4, .58, .6], prawn2: [-.98, -1.1, .25], mussel2: [.98, -1.32, .25],
  },
};
const ENTER = { tomato: [.62, [-1, .1]], mussel1: [.655, [-1, .7]], tomhalf: [.69, [1, .7]], prawn1: [.725, [1, -.1]], basil: [.76, [.3, 1]], prawn2: [.79, [-1, -.7]], mussel2: [.82, [1, -.7]] };
const BASEROT = {
  tomato: [.25, .4, .1], tomhalf: [-.25, -.35, .15], prawn1: [.2, -.5, .25], prawn2: [-.2, 2.7, -.2],
  mussel1: [1.05, .5, .3], mussel2: [.95, -2.6, -.2], basil: [-.4, .3, -.5],
};

const camT = V(), camP = V(), _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _s = V(), _e = new THREE.Euler();
function cameraAt(p) {
  // [Ende, Ziel(x,y,z), Abstand, Azimut, Höhe]
  const K = tall ? [
    [0, [-.12, .62, 0], 5.0, -.3, .2], [.18, [-.1, .55, 0], 5.4, -.1, .2], [.44, [0, 0, 0], 8.4, .25, .06],
    [.5, [0, .65, 0], 6.8, .4, .02], [.62, [0, -.55, 0], 6.4, .95, -.04], [.86, [0, .05, 0], 7.9, 1.2, .1], [1, [0, .05, 0], 8.2, 1.3, .1],
  ] : [
    [0, [-.62, .02, 0], 3.7, -.35, .2], [.18, [-.55, .05, 0], 4.0, -.1, .2], [.44, [0, 0, 0], 7.1, .25, .06],
    [.5, [0, .7, 0], 5.6, .4, .02], [.62, [0, -.6, 0], 5.2, .95, -.04], [.86, [0, 0, 0], 6.5, 1.2, .1], [1, [0, 0, 0], 6.8, 1.3, .1],
  ];
  let i = 0; while (i < K.length - 2 && p > K[i + 1][0]) i++;
  const a = K[i], b = K[i + 1], t = io(seg(p, a[0], b[0]));
  camT.set(lerp(a[1][0], b[1][0], t), lerp(a[1][1], b[1][1], t), lerp(a[1][2], b[1][2], t));
  const d = lerp(a[2], b[2], t), az = lerp(a[3], b[3], t), el = lerp(a[4], b[4], t);
  camP.set(camT.x + Math.sin(az) * Math.cos(el) * d, camT.y + Math.sin(el) * d, camT.z + Math.cos(az) * Math.cos(el) * d);
  camera.position.copy(camP); camera.lookAt(camT); camera.updateMatrixWorld();
}

function project(v) { const q = v.clone().project(camera); return [+((q.x + 1) / 2).toFixed(4), +((1 - q.y) / 2).toFixed(4), q.z < 1 ? 1 : 0]; }

// Lage der Zutaten auf dem Teller (relativ zur Tellermitte) und ihre Drehung
const PLATE = {
  tomato: [[-.78, .22, .38], [.2, .6, .1], .85], tomhalf: [[.74, .14, .46], [-1.45, 0, .3], .85],
  prawn1: [[.12, .55, .12], [-1.0, .4, .2], .95], prawn2: [[-.32, .42, .34], [-1.1, 2.4, -.2], .9],
  mussel1: [[.62, .17, -.36], [.1, .8, 0], .85], mussel2: [[-.6, .16, -.32], [.1, -2.2, 0], .85],
  basil: [[.06, .64, .02], [-1.35, .2, .4], 1.0],
};
window.renderFrame = (P) => {
  const p = Math.min(1, P / .82);
  PS.k = io(seg(P, .84, .97));
  const plateIn = io(seg(P, .8, .92));
  // Pastazustand
  PS.m = io(seg(p, .2, .46));
  PS.tw = io(seg(p, 0, .22)) * Math.PI * .9;
  PS.spin = p * TAU * .9;
  PS.nestPos.set(0, .15, 0);
  PS.nestQ.setFromEuler(_e.set(.12, 0, -.42));
  PS.spirPos.set(0, 0, 0);
  PS.platePos.set(0, lerp(-4.2, -.45, plateIn), 0);
  cameraAt(p);
  if (PS.k > 0 || plateIn > 0) {
    const K = io(seg(P, .82, .98));
    const t2 = PS.platePos.clone().add(V(0, tall ? .75 : .5, 0)), d2 = tall ? 8.4 : 4.9, az2 = 1.3, el2 = .6;
    const c2 = t2.clone().add(V(Math.sin(az2) * Math.cos(el2) * d2, Math.sin(el2) * d2, Math.cos(az2) * Math.cos(el2) * d2));
    camT.lerp(t2, K); camP.lerp(c2, K);
    camera.position.copy(camP); camera.lookAt(camT); camera.updateMatrixWorld();
  }
  plate.visible = plateIn > 0; plate.position.copy(PS.platePos);
  puddle.visible = PS.k > .05; puddle.position.copy(PS.platePos).add(V(0, .064, 0)); puddle.scale.setScalar(.66 * eo(seg(P, .88, .99)) + .001);
  ground.visible = plateIn > .5; ground.position.copy(PS.platePos).add(V(0, -.002, 0)); ground.material.opacity = .2 * seg(P, .9, .97);

  // Stränge
  const hangEnds = [];
  for (let s = 0; s < NS; s++) {
    const st = strands[s];
    for (let i = 0; i < NP; i++) { strandPoint(st, i / (NP - 1) * st.len, _p); pts[i * 3] = _p.x; pts[i * 3 + 1] = _p.y; pts[i * 3 + 2] = _p.z; }
    if (st.hang) hangEnds.push([pts[(NP - 1) * 3], pts[(NP - 1) * 3 + 1], pts[(NP - 1) * 3 + 2]]);
    const cover = lerp(1, .9, PS.m);
    pasta.set(s, pts, i => {
      const u = i / (NP - 1);
      const sv = ss(clamp((sauceAt(st, u * st.len) - .25) / .4)) * cover;
      let r = RS * st.w * (1 + .3 * sv);
      if (i < 2) r *= .55 + i * .2; if (i > NP - 3) r *= .55 + (NP - 1 - i) * .2;
      return r;
    }, (i, ang, out) => {
      const u = i / (NP - 1);
      const base = sauceAt(st, u * st.len);
      const side = st.side + Math.sin(u * 4.1 + st.seed) * 1.6;
      const sideK = .6 + .4 * Math.cos(ang - side);
      const fine = .5 + .5 * Math.sin(u * 61 + st.seed * 3) * Math.sin(u * 23 + ang * 2);
      const sv = ss(clamp((base * sideK * (.75 + .5 * fine) - .2) / .3)) * cover;
      const stain = ss(clamp((base - .05) / .5)) * .35;
      const pc = PASTA_A.clone().lerp(PASTA_B, .5 + .5 * Math.sin(u * 30 + st.seed));
      const sc = SAUCE_A.clone().lerp(SAUCE_B, .5 + .5 * Math.sin(u * 17 + st.seed * 2)).lerp(SAUCE_HI, .15);
      pc.lerp(col('#e08a3c'), stain);
      pc.lerp(sc, sv);
      out[0] = pc.r; out[1] = pc.g; out[2] = pc.b;
    });
  }
  pasta.done();

  // Saucentropfen an den Strängen
  const T = pasta.T, N = pasta.N, B = pasta.B;
  blobSpec.forEach((b, k) => {
    const st = strands[b.s];
    const u = b.u * st.len;
    strandPoint(st, u, _p);
    const u2 = Math.min(st.len, u + .01); const q = V(); strandPoint(st, u2, q);
    const t = q.clone().sub(_p).normalize();
    const n = Math.abs(t.y) < .9 ? V(0, 1, 0).cross(t).normalize() : V(1, 0, 0).cross(t).normalize();
    const bb = t.clone().cross(n);
    const dir = n.clone().multiplyScalar(Math.cos(b.a)).addScaledVector(bb, Math.sin(b.a));
    const sv = sauceAt(st, u);
    const sc = RS * b.k * (sv > .5 ? 1 : .0001) * lerp(1, .8, PS.m);
    _p.addScaledVector(dir, RS * .55);
    _m4.makeBasis(n, bb, t);
    _q.setFromRotationMatrix(_m4);
    _s.set(sc * 1.5, sc * .8, sc * 4.2);
    _m4.compose(_p, _q, _s);
    blobs.setMatrixAt(k, _m4);
  });
  blobs.instanceMatrix.needsUpdate = true;

  // zwei hängende Tropfen
  const dpts = new Float32Array(40 * 3);
  const dc = col('#a3190a'), dc2 = col('#6e0d04');
  for (let d = 0; d < 2; d++) {
    const e = hangEnds[d * 3 % hangEnds.length];
    const L = lerp(.16, .26, ss(seg(p, .05, .5))) * (d ? .75 : 1);
    for (let i = 0; i < 40; i++) {
      const v = i / 39;
      dpts[i * 3] = e[0] + Math.sin(v * 2 + d) * .006; dpts[i * 3 + 1] = e[1] - v * L - .005; dpts[i * 3 + 2] = e[2];
    }
    drips.set(d, dpts, i => {
      const v = i / 39;
      let r = RS * lerp(1.15, .75, ss(clamp(v / .62)));
      if (v > .58) { const t = (v - .58) / .42; r = Math.max(r, RS * 1.9 * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)) * (1 - .25 * (1 - t))); }
      if (i === 39) r = 0;
      return r;
    }, (i, a, out) => { const c = dc.clone().lerp(dc2, i / 39 * .6); out[0] = c.r; out[1] = c.g; out[2] = c.b; });
  }
  drips.done();
  drips.mesh.visible = PS.k < .15;

  // Gabel: steckt im Nest, zieht in Szene 2 nach oben heraus
  const out = io(seg(p, .14, .3));
  fork.visible = out < 1;
  const axis = V(0, 1, 0).applyQuaternion(PS.nestQ);
  fork.quaternion.copy(PS.nestQ);
  fork.rotateY(-.25);
  fork.position.copy(PS.nestPos).addScaledVector(axis, -.5 + out * 3.6);

  // Zutaten im Kameraraum
  const lay = LAY[tall ? 'tall' : 'wide'];
  const right = V().setFromMatrixColumn(camera.matrixWorld, 0), up = V().setFromMatrixColumn(camera.matrixWorld, 1), fwd = V().setFromMatrixColumn(camera.matrixWorld, 2);
  const anchors = {};
  const gather = io(seg(p, .9, 1));
  for (const key of Object.keys(lay)) {
    const g = key === 'basil' ? basil : ING[key];
    const [st, from] = ENTER[key];
    const a = eo(seg(p, st, st + .085));
    const L = lay[key];
    const sx = L[0] * (1 - gather * .08), sy = L[1] * (1 - gather * .08);
    const pos = camT.clone().addScaledVector(right, sx + from[0] * (1 - a) * 4.2).addScaledVector(up, sy + from[1] * (1 - a) * 3).addScaledVector(fwd, L[2]);
    // leichtes Schweben, abhängig vom Fortschritt (deterministisch)
    pos.addScaledVector(up, Math.sin(p * 18 + st * 40) * .035);
    const br = BASEROT[key];
    g.quaternion.copy(camera.quaternion);
    g.rotateX(br[0] + (1 - a) * 1.4 + (p - .85) * .5); g.rotateY(br[1] + (1 - a) * 2.2 * from[0] + (p - .85) * .9); g.rotateZ(br[2] + Math.sin(p * 9 + st * 20) * .08);
    g.position.copy(pos);
    g.scale.setScalar(lerp(.6, 1, a) * (key === 'basil' ? 1.25 : tall ? 1.2 : 1.35));
    if (PS.k > 0) {
      const [o, r, sc] = PLATE[key];
      const kk = io(seg(P, .84 + ENTER[key][0] * .02 - .012, .97));
      _q.setFromEuler(_e.set(r[0], r[1], r[2]));
      g.position.lerp(PS.platePos.clone().add(V(o[0], o[1], o[2])), kk);
      g.quaternion.slerp(_q, kk);
      g.scale.setScalar(lerp(g.scale.x, sc, kk));
    }
    g.visible = a > 0;
    if (key === 'basil' && a <= 0) {
      // Hero: Basilikum liegt oben auf dem Nest, fliegt beim Aufdrehen davon
      const off = io(seg(p, .1, .24));
      g.visible = off < 1;
      g.position.copy(PS.nestPos).addScaledVector(axis, .43).add(V(-.05, off * 3.2, .12 + off * .5));
      g.quaternion.copy(PS.nestQ); g.rotateX(-1.25 + off * 2); g.rotateZ(.4 + off * 3); g.scale.setScalar(.9);
    }
    anchors[key] = project(g.position);
  }
  // Silhouetten-Anker der Pasta (rechts: Sauce, links: Pasta)
  const sil = (side, yU) => {
    const u = clamp((1.3 - yU) / 2.6);
    const rr = .29 + .15 * Math.sin(Math.PI * u) + .08;
    return project(V(0, yU, 0).addScaledVector(right, side * rr));
  };
  anchors.sauce = sil(1, tall ? -.35 : -.3);
  anchors.pasta = sil(-1, tall ? .55 : .5);

  composer.render();
  return anchors;
};
window.grab = () => renderer.domElement.toDataURL('image/png');
