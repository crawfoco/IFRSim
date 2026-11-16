/**
 * Plate overlay calibration helper (dev only). Measures where a plate's plan view puts the
 * procedure's fixes, so the debrief can draw the flown track on the plate.
 *
 *   npm run plate -- candidates <id>                    anchor refs with their positions
 *   npm run plate -- crop <id> <scale> name:x,y,w,h ... zoomed crops → test-results/plates/<id>/
 *   npm run plate -- fit <id> [anchors.json]            fit and residuals (default: the anchors
 *                                                       in src/ui/chart/overlay.ts)
 *   npm run plate -- preview <id>                       the plate with every fix where the fit
 *                                                       puts it (anchors magenta, others blue),
 *                                                       the plan view box and the masked insets
 *                                                       → test-results/plates/<id>/preview.png
 *
 * anchors.json: [{ "name": "FQF", "ref": { "fix": "FQF" }, "x": 219.2, "y": 542.5 }, ...]
 * See docs/procedure-encoding.md, "Plate overlay calibration".
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { NAVDATA, procedureById } from '../../src/procedures';
import { buildScenario, type Scenario } from '../../src/sim/scenario/scenario';
import {
  fitPlate,
  PLATE_CALIBRATION,
  type PlateAnchor,
  type PlateCalibration,
} from '../../src/ui/chart/overlay';

const [cmd, id, ...rest] = process.argv.slice(2);

function scenarioFor(procId: string): Scenario {
  const p = procedureById(procId);
  if (!p) throw new Error(`unknown procedure "${procId}"`);
  return buildScenario(p, NAVDATA, {
    startId: p.starts[0]!.id,
    ceiling: 'above',
    gsOutOfService: false,
  });
}

function pngSize(file: string): { w: number; h: number } {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function candidates(sc: Scenario) {
  const out: { ref: PlateAnchor['ref']; lat: number; lon: number }[] = [];
  for (const [k, p] of Object.entries(sc.fixes))
    out.push({ ref: { fix: k }, lat: p.latDeg, lon: p.lonDeg });
  const seen = new Set<string>();
  const scan = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    for (const v of Object.values(o)) {
      if (typeof v === 'string' && !seen.has(v)) {
        const nav = NAVDATA.navaids[v];
        const loc = NAVDATA.localizers[v];
        if (nav)
          out.push({ ref: { navaid: v }, lat: nav.position.latDeg, lon: nav.position.lonDeg });
        if (loc) out.push({ ref: { loc: v }, lat: loc.position.latDeg, lon: loc.position.lonDeg });
        if (nav || loc) seen.add(v);
      }
      scan(v);
    }
  };
  scan(sc.procedure);
  return out;
}

function printFit(cal: PlateCalibration, sc: Scenario) {
  const fit = fitPlate(cal, sc);
  console.log(
    `scale ${fit.scalePxPerNm.toFixed(2)} px/NM, rotation ${fit.rotationDeg.toFixed(2)}° ` +
      `(to scale: expect ~15–25 px/NM and |rotation| < 1°)`,
  );
  cal.anchors.forEach((an, i) => {
    const r = fit.residuals[i]!.px;
    let loo = NaN;
    if (cal.anchors.length > 3) {
      const others = { ...cal, anchors: cal.anchors.filter((_, j) => j !== i) };
      const [x, y] = fitPlate(others, sc).toPx(
        (() => {
          const ref = an.ref;
          const nav = sc.world.navdata;
          return 'fix' in ref
            ? sc.fixes[ref.fix]!
            : 'loc' in ref
              ? nav.localizers[ref.loc]!.position
              : nav.navaids[ref.navaid]!.position;
        })(),
      );
      loo = Math.hypot(x - an.x, y - an.y);
    }
    console.log(
      `${an.name.padEnd(12)} residual ${r.toFixed(1)} px (${(r / fit.scalePxPerNm).toFixed(2)} NM); ` +
        `left out: ${loo.toFixed(1)} px`,
    );
  });
  console.log(
    'Aim: every residual < 5 px with at least 4 anchors spread out (not all on one line). A ' +
      'large left-out value flags a mis-measured anchor, unless the others are nearly in a line.',
  );
}

async function crop(procId: string, scale: number, regions: string[]) {
  const p = procedureById(procId);
  if (!p) throw new Error(`unknown procedure "${procId}"`);
  const file = `public/${p.chart.image}`;
  const { w, h } = pngSize(file);
  const out = `test-results/plates/${procId}`;
  mkdirSync(out, { recursive: true });
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: w * scale, height: h * scale } });
  const b64 = readFileSync(file).toString('base64');
  await page.setContent(
    `<style>body{margin:0}img{width:${w * scale}px;image-rendering:pixelated}</style>` +
      `<img src="data:image/png;base64,${b64}">`,
  );
  await page.waitForTimeout(300);
  for (const r of regions) {
    const [name, box] = r.split(':');
    const [x, y, cw, ch] = box!.split(',').map(Number) as [number, number, number, number];
    const path = `${out}/${name}.png`;
    await page.screenshot({
      path,
      clip: { x: x * scale, y: y * scale, width: cw * scale, height: ch * scale },
    });
    console.log(`${path}  (image pixel = ${x} + crop x / ${scale}, ${y} + crop y / ${scale})`);
  }
  await browser.close();
}

async function preview(procId: string) {
  const cal = PLATE_CALIBRATION[procId];
  if (!cal) throw new Error(`${procId} has no calibration in overlay.ts`);
  const sc = scenarioFor(procId);
  const fit = fitPlate(cal, sc);
  const p = procedureById(procId)!;
  const file = `public/${p.chart.image}`;
  const anchorKeys = new Set(cal.anchors.map((a) => JSON.stringify(a.ref)));
  const marks = candidates(sc)
    .map((c) => {
      const [x, y] = fit.toPx({ latDeg: c.lat, lonDeg: c.lon });
      const name = Object.values(c.ref)[0] as string;
      const anchor = anchorKeys.has(JSON.stringify(c.ref));
      const col = anchor ? '#d1149a' : '#1565ff';
      return (
        `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="${col}" stroke-width="2"/>` +
        `<text x="${x + 7}" y="${y - 6}" font-size="11" font-family="sans-serif" fill="${col}">${name}</text>`
      );
    })
    .join('');
  const a = cal.planArea;
  const insets = (cal.insets ?? [])
    .map(
      (r) =>
        `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#ff000030" stroke="red"/>`,
    )
    .join('');
  const out = `test-results/plates/${procId}`;
  mkdirSync(out, { recursive: true });
  const b64 = readFileSync(file).toString('base64');
  const S = 2;
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: cal.imageW * S, height: cal.imageH * S },
  });
  await page.setContent(
    `<style>body{margin:0}</style><svg width="${cal.imageW * S}" height="${cal.imageH * S}" viewBox="0 0 ${cal.imageW} ${cal.imageH}">` +
      `<image href="data:image/png;base64,${b64}" width="${cal.imageW}" height="${cal.imageH}"/>` +
      `<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="none" stroke="#0a0" stroke-dasharray="6 4"/>` +
      insets +
      marks +
      `</svg>`,
  );
  await page.screenshot({ path: `${out}/preview.png` });
  await browser.close();
  console.log(`${out}/preview.png (fit ${fit.scalePxPerNm.toFixed(2)} px/NM)`);
}

async function main() {
  if (!cmd || !id) throw new Error('usage: plate <candidates|crop|fit> <procedure id> ...');
  if (cmd === 'candidates') {
    const sc = scenarioFor(id);
    const p = procedureById(id)!;
    const { w, h } = pngSize(`public/${p.chart.image}`);
    console.log(
      `${id}: public/${p.chart.image} (${w}×${h})${PLATE_CALIBRATION[id] ? ', calibrated' : ''}`,
    );
    for (const c of candidates(sc))
      console.log(`${JSON.stringify(c.ref).padEnd(28)} ${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`);
  } else if (cmd === 'crop') {
    await crop(id, Number(rest[0] ?? 6), rest.slice(1));
  } else if (cmd === 'fit') {
    const sc = scenarioFor(id);
    const base = PLATE_CALIBRATION[id];
    const p = procedureById(id)!;
    const { w, h } = pngSize(`public/${p.chart.image}`);
    const cal: PlateCalibration = rest[0]
      ? {
          imageW: w,
          imageH: h,
          planArea: base?.planArea ?? { x: 0, y: 0, w, h },
          anchors: JSON.parse(readFileSync(rest[0], 'utf8')) as PlateAnchor[],
        }
      : (base ??
        (() => {
          throw new Error(`${id} has no calibration in overlay.ts`);
        })());
    printFit(cal, sc);
  } else if (cmd === 'preview') {
    await preview(id);
  } else {
    throw new Error(`unknown command "${cmd}"`);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
