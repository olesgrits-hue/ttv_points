/**
 * Generates build/icon.ico and build/icon-256.png from pixel art.
 * Run: node scripts/gen-icon.mjs
 * Deps: pngjs, to-ico (pure JS — no native compilation)
 */
import { PNG } from 'pngjs';
import toIco from 'to-ico';
import { writeFileSync, mkdirSync } from 'fs';

// Theme colors  (RGBA)
const BG = [13, 13, 13, 255];       // #0d0d0d
const FG = [0, 200, 150, 255];      // #00c896  green
const HI = [51, 255, 200, 255];     // #33ffc8  highlight (top-left edge)

// T-shape geometry per size: [x, y, w, h] for bar and stem
// Proportions: padding=12.5%, bar height=18%, stem width=25%, all centered.
const DESIGNS = {
  256: { bar: [32, 32, 192, 46], stem: [96, 78, 64, 146] },
  128: { bar: [16, 16, 96, 23], stem: [48, 39, 32, 73] },
   64: { bar: [8,   8,  48, 12], stem: [24, 20, 16, 36] },
   48: { bar: [6,   6,  36,  9], stem: [18, 15, 12, 27] },
   32: { bar: [4,   4,  24,  6], stem: [12, 10,  8, 18] },
   16: { bar: [2,   2,  12,  4], stem: [ 6,  6,  4,  8] },
};

function makePng(size) {
  const png = new PNG({ width: size, height: size, filterType: -1 });
  const { bar, stem } = DESIGNS[size];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      const inBar  = x >= bar[0]  && x < bar[0]  + bar[2]  && y >= bar[1]  && y < bar[1]  + bar[3];
      const inStem = x >= stem[0] && x < stem[0] + stem[2] && y >= stem[1] && y < stem[1] + stem[3];
      const inT    = inBar || inStem;

      // 1-pixel highlight on top and left edge of each T segment
      const isTopEdge  = inT && (y === bar[1] || (inStem && y === stem[1]));
      const isLeftEdge = inT && (x === bar[0] || (inStem && x === stem[0]));
      const isHighlight = isTopEdge || isLeftEdge;

      const [r, g, b, a] = inT ? (isHighlight ? HI : FG) : BG;
      png.data[i] = r; png.data[i+1] = g; png.data[i+2] = b; png.data[i+3] = a;
    }
  }

  return PNG.sync.write(png);
}

mkdirSync('build', { recursive: true });

const sizes = [16, 32, 48, 64, 128, 256];
const pngs  = sizes.map(makePng);

writeFileSync('build/icon-256.png', pngs[5]);
console.log('✓  build/icon-256.png');

const ico = await toIco(pngs);
writeFileSync('build/icon.ico', ico);
console.log('✓  build/icon.ico  (' + sizes.join(', ') + ' px)');
