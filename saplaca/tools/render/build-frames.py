"""Gerenderte PNG-Frames (RGBA) auf die Seitenfarbe legen, als WebP für den
Scroll-Film und als MP4 (H.264) ausgeben.

Aufruf:  python3 build-frames.py <render-out> <saplaca/assets/film>
         <render-out> enthält wide/ und tall/ mit f0000.png … und anchors.json
"""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image

BG = (243, 239, 230)  # #F3EFE6, Seitenhintergrund

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
for mode, size in (("wide", (1280, 720)), ("tall", (720, 1280))):
    frames = sorted((src / mode).glob("f*.png"))
    out = dst / mode
    out.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp())
    for i, f in enumerate(frames, 1):
        im = Image.open(f).convert("RGBA")
        bg = Image.new("RGBA", im.size, BG + (255,))
        bg.alpha_composite(im)
        rgb = bg.convert("RGB").resize(size, Image.LANCZOS)
        rgb.save(out / f"{i:04d}.webp", quality=80, method=6)
        rgb.save(tmp / f"{i:04d}.png")
    shutil.copy(src / mode / "anchors.json", dst / f"anchors-{mode}.json")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "30", "-i", str(tmp / "%04d.png"),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow",
                    "-movflags", "+faststart", str(dst / f"pasta-{mode}.mp4")], check=True)
    shutil.rmtree(tmp)
    print(mode, len(frames), "frames")
