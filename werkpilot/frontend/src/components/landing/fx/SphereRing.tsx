"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/** Monochromer Ring aus dunklen Kugeln (Torus), Licht von oben links. Dreht sich langsam, folgt Maus und Scroll.
 *  `variant` (0..2) steuert Dichte und Größe: je Tarif ein anderer Ring. */
const CFG = [
  { rows: 7, cols: 34, R: 2.0, r: 0.72 },
  { rows: 10, cols: 44, R: 2.25, r: 0.95 },
  { rows: 13, cols: 54, R: 2.45, r: 1.15 },
];
const MAX = 13 * 54;

function Ring({ variant, progress }: { variant: number; progress?: { current: number } }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const cur = useRef({ ...CFG[variant] });
  const mouse = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const on = (e: PointerEvent) => { mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1; };
    window.addEventListener("pointermove", on, { passive: true });
    return () => window.removeEventListener("pointermove", on);
  }, []);
  useFrame((state, dt) => {
    const m = mesh.current; const g = group.current; if (!m || !g) return;
    const k = Math.min(1, dt * 3); const c = cur.current; const t = CFG[variant];
    c.rows += (t.rows - c.rows) * k; c.cols += (t.cols - c.cols) * k; c.R += (t.R - c.R) * k; c.r += (t.r - c.r) * k;
    const rows = Math.max(3, Math.round(c.rows)), cols = Math.max(8, Math.round(c.cols));
    const size = Math.min((2 * Math.PI * c.R) / cols, (2 * Math.PI * c.r) / rows) * 0.5 * 0.96;
    let n = 0;
    for (let i = 0; i < rows; i++) {
      const phi = (i / rows) * Math.PI * 2;
      for (let j = 0; j < cols; j++) {
        const th = (j / cols) * Math.PI * 2 + (i % 2) * (Math.PI / cols);
        const rr = c.R + c.r * Math.cos(phi);
        dummy.position.set(rr * Math.cos(th), rr * Math.sin(th), c.r * Math.sin(phi));
        dummy.scale.setScalar(size); dummy.updateMatrix(); m.setMatrixAt(n++, dummy.matrix);
      }
    }
    for (let i = n; i < MAX; i++) { dummy.scale.setScalar(0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); }
    m.count = MAX; m.instanceMatrix.needsUpdate = true;
    const p = progress?.current ?? 0;
    g.rotation.x += ((0.72 + mouse.current.y * 0.18 + p * 0.9) - g.rotation.x) * Math.min(1, dt * 2.5);
    g.rotation.y += ((mouse.current.x * 0.25) - g.rotation.y) * Math.min(1, dt * 2.5);
    g.rotation.z = state.clock.elapsedTime * 0.09;
  });
  return (
    <group ref={group}>
      <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false}>
        <sphereGeometry args={[1, 20, 16]} />
        <meshStandardMaterial color="#5c5c62" roughness={0.5} metalness={0.4} />
      </instancedMesh>
    </group>
  );
}

export function SphereRing({ variant, progress, className }: { variant: number; progress?: { current: number }; className?: string }) {
  return (
    <div className={className} aria-hidden>
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 11.5], fov: 36 }} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}>
        <ambientLight intensity={0.18} />
        <directionalLight position={[-4, 6, 5]} intensity={3.2} color="#ffffff" />
        <directionalLight position={[5, -3, -4]} intensity={0.5} color="#9a9aa0" />
        <Ring variant={variant} progress={progress} />
      </Canvas>
    </div>
  );
}
