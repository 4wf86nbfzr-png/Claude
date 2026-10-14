"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/** Partikeltunnel in Schwarzweiß: Punkte auf einer Röhre fliegen auf die Kamera zu; Tempo folgt der Scrollgeschwindigkeit,
 *  die Kamera folgt leicht der Maus. Ohne Farben, ohne Leuchteffekt. */
const N = 3200, LEN = 140;

/** Deterministischer Zufall (mulberry32): gleiche Verteilung bei jedem Aufbau, ohne Math.random im Render. */
function prng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function dotTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const g = c.getContext("2d")!; const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.5, "rgba(255,255,255,0.6)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function Tunnel({ velocity }: { velocity: { current: number } }) {
  const points = useRef<THREE.Points>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const tex = useMemo(() => dotTexture(), []);
  const { pos, speedBias } = useMemo(() => {
    const rnd = prng(7); const pos = new Float32Array(N * 3); const speedBias = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2; const rad = 4.5 + Math.pow(rnd(), 0.6) * 5.5;
      pos[i * 3] = Math.cos(a) * rad; pos[i * 3 + 1] = Math.sin(a) * rad; pos[i * 3 + 2] = -rnd() * LEN;
      speedBias[i] = 0.6 + rnd() * 0.8;
    }
    return { pos, speedBias };
  }, []);
  useEffect(() => {
    const on = (e: PointerEvent) => { mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1; };
    window.addEventListener("pointermove", on, { passive: true });
    return () => window.removeEventListener("pointermove", on);
  }, []);
  useFrame(({ camera }, dt) => {
    const p = points.current; if (!p) return;
    const arr = p.geometry.attributes.position.array as Float32Array;
    const speed = 14 + Math.min(60, Math.abs(velocity.current) * 0.03);
    for (let i = 0; i < N; i++) { let z = arr[i * 3 + 2] + speed * speedBias[i] * dt; if (z > 1) z -= LEN; arr[i * 3 + 2] = z; }
    p.geometry.attributes.position.needsUpdate = true;
    camera.position.x += (mouse.current.x * 0.9 - camera.position.x) * Math.min(1, dt * 2);
    camera.position.y += (-mouse.current.y * 0.6 - camera.position.y) * Math.min(1, dt * 2);
    camera.lookAt(0, 0, -40);
  });
  return (
    <points ref={points}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry>
      <pointsMaterial map={tex} size={0.26} color="#ffffff" transparent opacity={0.9} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

export function ParticleTunnel({ velocity, className }: { velocity: { current: number }; className?: string }) {
  return (
    <div className={className} aria-hidden>
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 0], fov: 70, near: 0.1, far: 200 }} gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}>
        <fog attach="fog" args={["#050505", 20, 120]} />
        <Tunnel velocity={velocity} />
      </Canvas>
    </div>
  );
}
