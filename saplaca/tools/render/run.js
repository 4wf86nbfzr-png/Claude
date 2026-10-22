// node run.js <mode wide|tall> <outDir> <frames> [p-list for preview]
const { chromium } = require('playwright');
const fs = require('fs');
const [mode, outDir, framesArg, list] = process.argv.slice(2);
const F = +framesArg || 200;
const size = mode === 'tall' ? [720, 1280] : [1280, 720];
fs.mkdirSync(outDir, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await b.newPage({ viewport: { width: size[0], height: size[1] } });
  pg.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  pg.on('pageerror', e => console.log('PAGEERR', e.message));
  await pg.goto('http://127.0.0.1:8765/scene.html');
  await pg.waitForFunction(() => typeof window.setup === 'function');
  await pg.evaluate(([w, h]) => window.setup(w, h, 1.5), size);
  const ps = list ? list.split(',').map(Number) : [...Array(F).keys()].map(i => i / (F - 1));
  const anchors = [];
  const t0 = Date.now();
  for (let k = 0; k < ps.length; k++) {
    const a = await pg.evaluate(p => window.renderFrame(p), ps[k]);
    const url = await pg.evaluate(() => window.grab());
    fs.writeFileSync(`${outDir}/f${String(k).padStart(4, '0')}.png`, Buffer.from(url.split(',')[1], 'base64'));
    anchors.push(a);
    if (k % 10 === 0) console.log(mode, k, '/', ps.length, ((Date.now() - t0) / (k + 1) / 1000).toFixed(2) + 's/frame');
  }
  fs.writeFileSync(`${outDir}/anchors.json`, JSON.stringify(anchors));
  await b.close();
})();
