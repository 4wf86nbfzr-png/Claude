// Erzeugt aus den Clips in footage.json das Hintergrundvideo der Startseite in allen Varianten:
//   public/video/clairify-2160.webm  (VP9, 4K)        public/video/clairify-2160.mp4 (H.264, 4K)
//   public/video/clairify-1080.webm / .mp4            public/video/clairify-720.webm / .mp4
//   public/video/poster-2160.jpg, poster-1080.jpg, poster-720.jpg   (Standbild als Lade- und Bewegungsfallback)
//   public/video/stills/still-1.jpg …                 (Standbilder für Bild-Text-Abschnitte)
//   public/video/palette.json + src/components/landing/palette.css (Farben aus dem Material)
//   public/video/SOURCES.md                           (Quellen und Lizenzen aus dem Manifest)
// Aufruf aus frontend/: node tools/video/prepare-footage.mjs   (braucht ffmpeg mit libvpx-vp9 und libx264, Python 3 mit Pillow)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "../..");
const out = path.join(root, "public/video");
const stillsDir = path.join(out, "stills");
mkdirSync(stillsDir, { recursive: true });
const manifest = JSON.parse(readFileSync(path.join(here, "footage.json"), "utf8"));
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
const run = (args) => execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });

// 1. Clips zu einer Sequenz verbinden (weiche Überblendung), Ton entfernen, auf 16:9 bringen
const clips = manifest.clips.map((c) => ({ ...c, path: path.join(here, "footage", c.file) }));
for (const c of clips) if (!existsSync(c.path)) { console.error("Clip fehlt:", c.path); process.exit(1); }
const master = path.join(here, "footage", "_master.mkv");
const xf = manifest.crossfade_seconds ?? 0.8;
if (clips.length === 1) {
  const c = clips[0];
  run(["-ss", String(c.in ?? 0), "-to", String(c.out), "-i", c.path, "-an", "-vf", "scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,fps=30", "-c:v", "libx264", "-preset", "fast", "-crf", "14", master]);
} else {
  const inputs = clips.flatMap((c) => ["-ss", String(c.in ?? 0), "-to", String(c.out), "-i", c.path]);
  let filter = clips.map((_, i) => `[${i}:v]scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,fps=30,setpts=PTS-STARTPTS[v${i}]`).join(";");
  let prev = "v0", offset = 0;
  for (let i = 1; i < clips.length; i++) {
    offset += (clips[i - 1].out - (clips[i - 1].in ?? 0)) - xf;
    const name = i === clips.length - 1 ? "vout" : `x${i}`;
    filter += `;[${prev}][v${i}]xfade=transition=fade:duration=${xf}:offset=${offset.toFixed(3)}[${name}]`;
    prev = name;
  }
  run([...inputs, "-filter_complex", filter, "-map", "[vout]", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "14", master]);
}

// 2. Varianten: VP9 (klein, modern) und H.264 (Safari/ältere Geräte). Keyframe alle 2 s, ohne Ton.
const variants = [[2160, 3840, "4800k", 34], [1080, 1920, "2200k", 33], [720, 1280, "1100k", 33]];
for (const [h, w, bitrate, crf] of variants) {
  const scale = `scale=${w}:${h}`;
  run(["-i", master, "-vf", scale, "-c:v", "libvpx-vp9", "-b:v", bitrate, "-crf", String(crf), "-deadline", "good", "-cpu-used", "4", "-row-mt", "1", "-g", "60", "-pix_fmt", "yuv420p", "-an", path.join(out, `clairify-${h}.webm`)]);
  run(["-i", master, "-vf", scale, "-c:v", "libx264", "-preset", "slow", "-crf", String(h === 2160 ? 24 : 23), "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-g", "60", "-an", path.join(out, `clairify-${h}.mp4`)]);
  run(["-ss", String(manifest.poster_second ?? 2), "-i", master, "-frames:v", "1", "-vf", scale, "-q:v", "3", path.join(out, `poster-${h}.jpg`)]);
}
// 3. Standbilder für Bild-Text-Abschnitte (1920 breit, Qualität hoch)
(manifest.stills_seconds ?? []).forEach((t, i) => run(["-ss", String(t), "-i", master, "-frames:v", "1", "-vf", "scale=1920:1080", "-q:v", "2", path.join(stillsDir, `still-${i + 1}.jpg`)]));
// 4. Farben aus dem Material ableiten
execFileSync(process.env.PYTHON ?? "python3", [path.join(here, "palette.py"), master, path.join(out, "palette.json"), path.join(root, "src/components/landing/palette.css")], { stdio: "inherit" });
// 5. Quellen dokumentieren
const lines = ["# Quellen des Hintergrundvideos", "", "Erzeugt aus `tools/video/footage.json` durch `prepare-footage.mjs`. Reihenfolge = Schnittreihenfolge.", ""];
for (const c of manifest.clips) lines.push(`- **${c.title}** (${c.file}, ${c.in ?? 0}–${c.out} s)`, `  Quelle: ${c.source}${c.url ? " · " + c.url : ""}`, `  Urheber: ${c.author} · Lizenz: ${c.license}`, "");
lines.push("Varianten: 2160p, 1080p, 720p als WebM (VP9) und MP4 (H.264), ohne Ton. Poster und Standbilder aus demselben Material.", "");
writeFileSync(path.join(out, "SOURCES.md"), lines.join("\n"));
console.log("fertig:", out);
