"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/** Fortschritt (0..1) des Scrollytellings, von außen über ein Ref gesetzt – ohne React-Rerender pro Frame. */
export type ProgressRef = { current: number };

// Farben aus der Palette des Videomaterials (palette.css): Dringendes in der warmen Akzentfarbe, der Rest in Stahl- und Sandtönen.
const LANES = [
  { x: -2.55, color: "#daf1de", label: "dringend" },
  { x: -0.85, color: "#8eb69b", label: "normal" },
  { x: 0.85, color: "#4f7f68", label: "angebot" },
  { x: 2.55, color: "#235347", label: "niedrig" },
];
const COUNT = 32;

/** Schriftzug CLAIRIFY als Textur je Spur (Canvas, einmal erzeugt). Dunkle Schrift auf der warmen Akzentfarbe,
 *  helle auf den übrigen Farben. Rückseite gespiegelt, damit die Schrift beim Drehen lesbar bleibt. */
function makeLabelTextures(): { front: THREE.CanvasTexture; back: THREE.CanvasTexture }[] {
  return LANES.map((lane) => {
    const c = document.createElement("canvas"); c.width = 512; c.height = 168;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = lane.color; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = lane.label === "dringend" || lane.label === "normal" ? "#051f20" : "#eef5ef";
    ctx.font = "600 78px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.letterSpacing = "10px";
    ctx.fillText("CLAIRIFY", c.width / 2 + 5, c.height / 2 + 4);
    const front = new THREE.CanvasTexture(c); front.colorSpace = THREE.SRGBColorSpace; front.anisotropy = 4;
    const back = front.clone(); back.repeat.x = -1; back.offset.x = 1; back.needsUpdate = true;
    return { front, back };
  });
}

type Item = { lane: number; idx: number; chaos: THREE.Vector3; chaosRot: THREE.Euler; sorted: THREE.Vector3; drift: number };

/** Deterministische Startpositionen (außerhalb der Komponente, damit nichts während des Renderns mutiert). */
function buildItems(): Item[] {
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  return Array.from({ length: COUNT }, (_, i) => {
    const lane = i % 4; const idx = Math.floor(i / 4);
    return {
      lane, idx,
      chaos: new THREE.Vector3((rnd() - 0.5) * 9, (rnd() - 0.5) * 5.5, (rnd() - 0.5) * 5),
      chaosRot: new THREE.Euler((rnd() - 0.5) * 1.6, (rnd() - 0.5) * 2.2, (rnd() - 0.5) * 0.8),
      sorted: new THREE.Vector3(LANES[lane].x, 2.1 - idx * 0.6, 0),
      drift: rnd() * Math.PI * 2,
    };
  });
}

type PointerRef = { current: { x: number; y: number } };

function easeInOut(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
function clamp01(v: number) { return Math.min(1, Math.max(0, v)); }

function Cards({ progress, pointer }: { progress: ProgressRef; pointer: PointerRef }) {
  const group = useRef<THREE.Group>(null);
  const items = useMemo(() => buildItems(), []);
  const tmpV = useMemo(() => new THREE.Vector3(), []);
  const labels = useMemo(() => makeLabelTextures(), []);
  useEffect(() => () => labels.forEach((l) => { l.front.dispose(); l.back.dispose(); }), [labels]);
  useFrame((state) => {
    const g = group.current; if (!g) return;
    const p = progress.current; const t = state.clock.elapsedTime;
    const sortK = easeInOut(clamp01((p - 0.12) / 0.4));           // 0.12–0.52: sortieren
    const focusK = easeInOut(clamp01((p - 0.62) / 0.22));         // 0.62–0.84: eine Karte nach vorn (Entwurf)
    items.forEach((it, i) => {
      const m = g.children[i] as THREE.Mesh; if (!m) return;
      tmpV.copy(it.chaos).lerp(it.sorted, sortK);
      // leichtes Schweben
      tmpV.y += Math.sin(t * 0.8 + it.drift) * 0.06 * (1 - sortK * 0.7);
      let scale = 1;
      if (i === 0) { // erste dringende Karte wird zum Entwurf
        tmpV.lerp(new THREE.Vector3(0, 0.2, 2.6), focusK); scale = 1 + focusK * 1.1;
      } else if (focusK > 0) { tmpV.z -= focusK * 1.2; }
      m.position.lerp(tmpV, 0.09);
      m.rotation.x += ((it.chaosRot.x * (1 - sortK)) - m.rotation.x) * 0.08;
      m.rotation.y += ((it.chaosRot.y * (1 - sortK)) - m.rotation.y) * 0.08;
      m.rotation.z += ((it.chaosRot.z * (1 - sortK)) - m.rotation.z) * 0.08;
      m.scale.setScalar(THREE.MathUtils.lerp(m.scale.x, scale, 0.1));
      const k = it.lane === 0 ? 0.35 + sortK * 0.5 : 0.12 + sortK * 0.15;
      for (const mat of m.material as THREE.MeshStandardMaterial[]) mat.emissiveIntensity = k;
    });
    // Parallaxe zur Maus / Geräteneigung
    g.rotation.y += ((pointer.current.x * 0.35) - g.rotation.y) * 0.05;
    g.rotation.x += ((-pointer.current.y * 0.2) - g.rotation.x) * 0.05;
  });
  return (
    <group ref={group}>
      {items.map((it, i) => (
        <mesh key={i} position={it.chaos} rotation={it.chaosRot}>
          <boxGeometry args={[1.35, 0.44, 0.06]} />
          {/* Seiten einfarbig, Vorder- und Rückseite mit dem Schriftzug (Reihenfolge der Box-Flächen: +x, -x, +y, -y, +z, -z) */}
          {[0, 1, 2, 3].map((f) => <meshStandardMaterial key={f} attach={`material-${f}`} color={LANES[it.lane].color} emissive={LANES[it.lane].color} emissiveIntensity={0.15} roughness={0.35} metalness={0.2} />)}
          <meshStandardMaterial attach="material-4" color="#ffffff" map={labels[it.lane].front} emissive={LANES[it.lane].color} emissiveMap={labels[it.lane].front} emissiveIntensity={0.15} roughness={0.35} metalness={0.2} />
          <meshStandardMaterial attach="material-5" color="#ffffff" map={labels[it.lane].back} emissive={LANES[it.lane].color} emissiveMap={labels[it.lane].back} emissiveIntensity={0.15} roughness={0.35} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

function Ring({ progress }: { progress: ProgressRef }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const r = ref.current; if (!r) return;
    r.rotation.z = state.clock.elapsedTime * 0.25; r.rotation.x = Math.PI / 2.4 + Math.sin(state.clock.elapsedTime * 0.3) * 0.1;
    const k = clamp01((progress.current - 0.1) / 0.3);
    r.scale.setScalar(0.6 + k * 0.8);
    (r.material as THREE.MeshStandardMaterial).opacity = 0.25 + k * 0.4;
  });
  return (
    <mesh ref={ref} position={[0, 0, -1.5]}>
      <torusGeometry args={[3.2, 0.03, 12, 120]} />
      <meshStandardMaterial color="#8eb69b" emissive="#8eb69b" emissiveIntensity={0.8} transparent opacity={0.3} />
    </mesh>
  );
}

function Rig({ pointer }: { pointer: PointerRef }) {
  useFrame(({ camera }) => {
    camera.position.x += ((pointer.current.x * 0.6) - camera.position.x) * 0.04;
    camera.position.y += ((pointer.current.y * 0.3) - camera.position.y) * 0.04;
    camera.lookAt(0, 0.2, 0);
  });
  return null;
}

export function Scene3D({ progress }: { progress: ProgressRef }) {
  const pointer = useRef({ x: 0, y: 0 });
  const [xrModes, setXrModes] = useState<string[]>([]);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => { pointer.current.x = (e.clientX / window.innerWidth - 0.5) * 2; pointer.current.y = (e.clientY / window.innerHeight - 0.5) * 2; };
    const onTilt = (e: DeviceOrientationEvent) => { if (e.gamma == null || e.beta == null) return; pointer.current.x = Math.max(-1, Math.min(1, e.gamma / 30)); pointer.current.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30)); };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("deviceorientation", onTilt, { passive: true });
    const xr = (navigator as Navigator & { xr?: { isSessionSupported: (m: string) => Promise<boolean> } }).xr;
    if (xr) Promise.all(["immersive-vr", "immersive-ar"].map((m) => xr.isSessionSupported(m).then((ok) => (ok ? m : null)).catch(() => null))).then((r) => setXrModes(r.filter(Boolean) as string[]));
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("deviceorientation", onTilt); };
  }, []);
  const startXR = async (mode: string) => {
    const xr = (navigator as Navigator & { xr?: { requestSession: (m: string, o?: unknown) => Promise<XRSession> } }).xr;
    const gl = glRef.current; if (!xr || !gl) return;
    const session = await xr.requestSession(mode, { optionalFeatures: ["local-floor"] });
    gl.xr.enabled = true; await gl.xr.setSession(session);
  };
  return (
    <div className="relative h-full w-full">
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0, 10.5], fov: 40 }} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }} onCreated={({ gl }) => { glRef.current = gl; gl.xr.enabled = true; }} aria-hidden>
        <ambientLight intensity={0.6} />
        <pointLight position={[4, 5, 6]} intensity={40} color="#ffffff" />
        <pointLight position={[-6, -3, 4]} intensity={25} color="#8eb69b" />
        <Ring progress={progress} />
        <Cards progress={progress} pointer={pointer} />
        <Rig pointer={pointer} />
      </Canvas>
      {xrModes.length > 0 && (
        <div className="absolute bottom-3 right-3 flex gap-2">
          {xrModes.map((m) => <button key={m} onClick={() => startXR(m)} className="rounded-full border border-white/25 bg-black/40 px-3 py-1.5 text-xs text-white backdrop-blur hover:border-white/60">{m === "immersive-vr" ? "In VR ansehen" : "In AR ansehen"}</button>)}
        </div>
      )}
    </div>
  );
}
