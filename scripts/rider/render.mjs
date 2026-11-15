// Daily renderer: fetches the live contribution graph, renders the 3D rider
// scene headless at 48 loop steps, and assembles assets/rider.gif.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import puppeteer from 'puppeteer';

const USER = 'legendcyber28';
const WEEKS = 11, FPS = 12, FRAMES = 48, W = 880, H = 520;
const repoRoot = process.cwd();
const scriptDir = path.join(repoRoot, 'scripts', 'rider');

const res = await fetch(`https://github.com/users/${USER}/contributions`);
if (!res.ok) throw new Error('contributions fetch failed: ' + res.status);
const html = await res.text();

const cells = [...html.matchAll(/<td[^>]*ContributionCalendar-day[^>]*>/g)].map(m => {
  const t = m[0];
  const idm = /contribution-day-component-(\d+)-(\d+)/.exec(t);
  const lv = /data-level="(\d)"/.exec(t);
  return idm && lv ? { row: +idm[1], col: +idm[2], level: +lv[1] } : null;
}).filter(Boolean);
if (cells.length < 100) throw new Error('calendar parse failed: ' + cells.length + ' cells');

const maxCol = Math.max(...cells.map(c => c.col));
if (maxCol + 1 < WEEKS) throw new Error('not enough weeks: ' + (maxCol + 1));
const grid = [];
for (let c = maxCol - WEEKS + 1; c <= maxCol; c++) {
  const col = [];
  for (let r = 0; r < 7; r++) {
    const cell = cells.find(x => x.col === c && x.row === r);
    col.push(cell ? cell.level : 0);
  }
  grid.push(col);
}

fs.copyFileSync(path.join(scriptDir, 'three.min.js'), '/tmp/three.min.js');
const scene = fs.readFileSync(path.join(scriptDir, 'scene.html'), 'utf8')
  .replace(/const GRID = \[\[[\s\S]*?\]\];/, 'const GRID = ' + JSON.stringify(grid) + ';');
if (!/const GRID = \[\[\d/.test(scene)) throw new Error('GRID injection failed');
fs.writeFileSync('/tmp/scene-live.html', scene);

const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
fs.mkdirSync('/tmp/frames', { recursive: true });
for (let i = 0; i < FRAMES; i++) {
  await page.goto('file:///tmp/scene-live.html?t=' + (i / FRAMES), { waitUntil: 'load' });
  await page.waitForFunction("document.title === 'done'", { timeout: 60000 });
  await page.screenshot({ path: '/tmp/frames/f' + String(i).padStart(2, '0') + '.png' });
}
await browser.close();

const outDir = path.join(repoRoot, 'assets');
fs.mkdirSync(outDir, { recursive: true });
execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', '/tmp/frames/f%02d.png', '-vf', 'palettegen', '/tmp/pal.png'], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', '/tmp/frames/f%02d.png', '-i', '/tmp/pal.png', '-lavfi', 'paletteuse', path.join(outDir, 'rider.gif')], { stdio: 'inherit' });
console.log('assets/rider.gif written');
