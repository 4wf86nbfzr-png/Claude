// Macht aus den Fotos in tools/video/photos/ je einen 4K-Clip mit langsamer Kamerafahrt (Ken-Burns-Effekt)
// und legt ihn als footage/<file> ab, damit prepare-footage.mjs ihn wie jeden anderen Clip schneidet.
// Aufruf aus frontend/:  node tools/video/stills-to-clips.mjs && node tools/video/prepare-footage.mjs
// Die Fotos (1408×768) werden mit Lanczos auf 4K hochgerechnet; echtes 4K-Material wäre schärfer.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const manifest = JSON.parse(readFileSync(path.join(here, "footage.json"), "utf8"));
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
const FPS = 30, W = 3840, H = 2160, UP = 4224; // Arbeitsbreite über 4K, damit die Fahrt Spielraum hat
mkdirSync(path.join(here, "footage"), { recursive: true });

for (const s of manifest.scenes ?? []) {
  const frames = Math.round(s.seconds * FPS);
  const upH = Math.round(UP * H / W);
  // z: Zoom linear von z0 nach z1; x/y: Bildmittelpunkt der Fahrt (Anteil der Bildgröße), ebenfalls linear
  const t = `(on/${frames - 1})`;
  const z = `(${s.z0}+(${s.z1}-${s.z0})*${t})`;
  const cx = `(${s.x0}+(${s.x1}-${s.x0})*${t})*iw`, cy = `(${s.y0}+(${s.y1}-${s.y0})*${t})*ih`;
  const vf = [
    `scale=${UP}:${upH}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${UP}:${upH}`,
    `zoompan=z='${z}':x='max(0,min(iw-iw/zoom,${cx}-iw/zoom/2))':y='max(0,min(ih-ih/zoom,${cy}-ih/zoom/2))':d=${frames}:s=${W}x${H}:fps=${FPS}`,
    "format=yuv420p",
  ].join(",");
  const out = path.join(here, "footage", s.file);
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", path.join(here, "photos", s.photo), "-vf", vf, "-frames:v", String(frames), "-r", String(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-an", out], { stdio: "inherit" });
  console.log("Szene:", s.file, `${s.seconds}s`, s.title);
}
console.log("fertig → node tools/video/prepare-footage.mjs");
