/**
 * Track overlay on an approach plate (prototype). A plate's plan view is drawn to scale (holds
 * and course reversals excepted), so it can be fitted to the sim's geography with a similarity
 * transform (scale, rotation, offset) from a few anchor points measured on the plate image.
 * Calibrations are hand-measured per plate; plates without one get no overlay.
 */
import type { LatLon } from '../../sim/geo/geodesy';
import { METRES_PER_NM } from '../../sim/geo/geodesy';
import { LocalFrame } from '../../sim/geo/projection';
import type { Scenario } from '../../sim/scenario/scenario';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type AnchorRef = { fix: string } | { loc: string } | { navaid: string };

export interface PlateAnchor {
  name: string;
  ref: AnchorRef;
  /** Pixel position on the plate image. */
  x: number;
  y: number;
}

export interface PlateCalibration {
  imageW: number;
  imageH: number;
  /** The plan view's box on the image; the overlay is clipped to it. */
  planArea: Rect;
  /** Insets inside the plan view that are not to scale (MSA circle, airport sketch): masked out. */
  insets?: Rect[];
  anchors: PlateAnchor[];
}

/**
 * Measured on 6× zoomed crops of the plate images (`npm run plate`; see
 * docs/procedure-encoding.md, "Plate overlay calibration"). KCFO (AL-6851 Amdt 6B): FQF VORTAC symbol,
 * SKIPI (I-FTG 7 DME) tick on the localizer course, the runway 26 threshold (east end of the
 * drawn runway) and the I-FTG antenna (west end of the course line).
 */
export const PLATE_CALIBRATION: Record<string, PlateCalibration> = {
  'kcfo-ils26': {
    imageW: 715,
    imageH: 1100,
    planArea: { x: 34, y: 238, w: 656, h: 462 },
    insets: [{ x: 548, y: 585, w: 142, h: 115 }], // MSA circle
    anchors: [
      { name: 'FQF', ref: { fix: 'FQF' }, x: 219.2, y: 542.5 },
      { name: 'SKIPI', ref: { fix: 'SKIPI' }, x: 395.3, y: 423 },
      { name: 'RW26', ref: { fix: 'RW26' }, x: 299, y: 422 },
      { name: 'I-FTG', ref: { loc: 'I-FTG' }, x: 267.5, y: 422 },
    ],
  },
  // KGXY (AL-325 Amdt 3A): GLL VOR/DME, the drawn runway's ends (RW35 threshold and I-DCI
  // antenna), the ARTSS, BUFFS and WELDS ticks on the localizer, CEDUK and WAVDI. 19.3 px/NM, all
  // anchors within 4 px. The KROMM "alternate missed approach fix" box is an inset.
  'kgxy-ils35': {
    imageW: 715,
    imageH: 1100,
    planArea: { x: 34, y: 229, w: 650, h: 508 },
    insets: [
      { x: 34, y: 229, w: 141, h: 166 }, // alternate missed approach fix (KROMM)
      { x: 35, y: 520, w: 140, h: 135 }, // MSA circle
      { x: 34, y: 655, w: 208, h: 82 }, // airport sketch
    ],
    anchors: [
      { name: 'GLL', ref: { navaid: 'GLL' }, x: 429.6, y: 241.3 },
      { name: 'RW35', ref: { fix: 'RW35' }, x: 359.8, y: 330 },
      { name: 'I-DCI', ref: { loc: 'I-DCI' }, x: 359.4, y: 294.5 },
      { name: 'ARTSS', ref: { fix: 'ARTSS' }, x: 362.5, y: 366.5 },
      { name: 'BUFFS', ref: { fix: 'BUFFS' }, x: 364.5, y: 440.5 },
      { name: 'WELDS', ref: { fix: 'WELDS' }, x: 369.2, y: 574.5 },
      { name: 'CEDUK', ref: { fix: 'CEDUK' }, x: 587.3, y: 507.3 },
      { name: 'WAVDI', ref: { fix: 'WAVDI' }, x: 601.7, y: 531.7 },
    ],
  },
  // KMTJ (AL-668 Amdt 3A): MTJ VOR/DME, RW17, the I-MTJ antenna, ZIMVI, WIDRU and BRUUK on the
  // localizer, and the feeder IAFs PAGRE and HAQHY. 19.4 px/NM, all anchors within 2 px. The
  // DIRDY and MEYRS feeders (RNAV, not used by any start) are beyond break symbols: masked.
  'kmtj-ils17': {
    imageW: 715,
    imageH: 1100,
    planArea: { x: 34, y: 265, w: 650, h: 504 },
    insets: [
      { x: 40, y: 355, w: 140, h: 135 }, // MSA circle
      { x: 34, y: 657, w: 208, h: 112 }, // airport sketch
      { x: 590, y: 265, w: 94, h: 75 }, // DIRDY beyond the break
      { x: 610, y: 540, w: 74, h: 80 }, // MEYRS beyond the break
    ],
    anchors: [
      { name: 'MTJ', ref: { navaid: 'MTJ' }, x: 353.4, y: 723 },
      { name: 'RW17', ref: { fix: 'RW17' }, x: 359.7, y: 694.7 },
      { name: 'I-MTJ', ref: { loc: 'I-MTJ' }, x: 359.5, y: 731.5 },
      { name: 'ZIMVI', ref: { fix: 'ZIMVI' }, x: 359.2, y: 632.2 },
      { name: 'WIDRU', ref: { fix: 'WIDRU' }, x: 359.2, y: 552.8 },
      { name: 'BRUUK', ref: { fix: 'BRUUK' }, x: 358.3, y: 436.8 },
      { name: 'PAGRE', ref: { fix: 'PAGRE' }, x: 128.3, y: 544.5 },
      { name: 'HAQHY', ref: { fix: 'HAQHY' }, x: 180.8, y: 358.3 },
    ],
  },
  // KAKO (AL-5054 Orig-C): AKO VOR/DME, GERON, and the two arc IAFs where the AKO 10 DME arcs
  // meet R-050 and R-170. 19.4 px/NM, all anchors within 1 px.
  'kako-vor29': {
    imageW: 715,
    imageH: 1100,
    planArea: { x: 34, y: 217, w: 649, h: 539 },
    insets: [
      { x: 475, y: 664, w: 208, h: 92 }, // airport sketch
      { x: 35, y: 615, w: 140, h: 120 }, // MSA circle
    ],
    anchors: [
      { name: 'AKO', ref: { navaid: 'AKO' }, x: 357.3, y: 465.2 },
      { name: 'GERON', ref: { fix: 'GERON' }, x: 518.5, y: 572.3 },
      { name: 'AKO R-050/10', ref: { fix: 'AKO R-050/10' }, x: 529.5, y: 376.7 },
      { name: 'AKO R-170/10', ref: { fix: 'AKO R-170/10' }, x: 346.7, y: 659.3 },
    ],
  },
  // KLAR (AL-225 Amdt 7B): LAR VOR/DME, the arc IAFs POVOH and JESAR, the course ticks at
  // ECECU, GARBE, HEMBI and DUCBE, and DMYIH. 19.5 px/NM, all anchors within 2 px. FLEMS is drawn
  // beyond a break symbol (not to scale), so that strip is masked; note ECECU is the tick on the
  // course, not where the arc joins it.
  'klar-vor30': {
    imageW: 715,
    imageH: 1100,
    planArea: { x: 33, y: 216, w: 651, h: 555 },
    insets: [
      { x: 33, y: 663, w: 208, h: 108 }, // airport sketch
      { x: 40, y: 525, w: 135, h: 120 }, // MSA circle
      { x: 545, y: 733, w: 70, h: 38 }, // FLEMS feeder beyond the break symbol
    ],
    anchors: [
      { name: 'LAR', ref: { navaid: 'LAR' }, x: 178.3, y: 406.5 },
      { name: 'POVOH', ref: { fix: 'POVOH' }, x: 505.5, y: 282.5 },
      { name: 'JESAR', ref: { fix: 'JESAR' }, x: 521.8, y: 467 },
      { name: 'ECECU', ref: { fix: 'ECECU' }, x: 462.8, y: 611.2 },
      { name: 'DMYIH', ref: { fix: 'DMYIH' }, x: 571.7, y: 689.7 },
      { name: 'GARBE', ref: { fix: 'GARBE' }, x: 272.5, y: 474.5 },
      { name: 'HEMBI', ref: { fix: 'HEMBI' }, x: 355.8, y: 534.2 },
      { name: 'DUCBE', ref: { fix: 'DUCBE' }, x: 402.5, y: 567.5 },
    ],
  },
  // KSNY (AL-875 Amdt 5D): SNY VOR/DME, the arc IAFs RIYOP and OGJUN, JUNAD (R-310 on the
  // 130° course) and the CHAKO tick. 19.4 px/NM, all anchors within 1.4 px.
  'ksny-vor13': {
    imageW: 715,
    imageH: 1100,
    planArea: { x: 35, y: 229, w: 648, h: 538 },
    insets: [
      { x: 545, y: 245, w: 125, h: 130 }, // MSA circle
      { x: 475, y: 662, w: 208, h: 105 }, // airport sketch
    ],
    anchors: [
      { name: 'SNY', ref: { navaid: 'SNY' }, x: 340.5, y: 511 },
      { name: 'RIYOP', ref: { fix: 'RIYOP' }, x: 552.5, y: 514.5 },
      { name: 'OGJUN', ref: { fix: 'OGJUN' }, x: 219.5, y: 686.5 },
      { name: 'JUNAD', ref: { fix: 'JUNAD' }, x: 211.7, y: 340.8 },
      { name: 'CHAKO', ref: { fix: 'CHAKO' }, x: 283.3, y: 432.5 },
    ],
  },
};

export interface PlateFit {
  toPx(p: LatLon): [number, number];
  scalePxPerNm: number;
  /** Rotation of the plate against true north, degrees (+ = clockwise). */
  rotationDeg: number;
  /** Distance of each anchor from the fitted position, px. */
  residuals: { name: string; px: number }[];
}

function anchorLatLon(ref: AnchorRef, sc: Scenario): LatLon {
  const nav = sc.world.navdata;
  const p =
    'fix' in ref
      ? sc.fixes[ref.fix]
      : 'loc' in ref
        ? nav.localizers[ref.loc]?.position
        : nav.navaids[ref.navaid]?.position;
  if (!p) throw new Error(`plate anchor ${JSON.stringify(ref)} not found`);
  return p;
}

/** Solve a small square system (Gaussian elimination with partial pivoting). */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let j = i + 1; j < n; j++) if (Math.abs(m[j]![i]!) > Math.abs(m[p]![i]!)) p = j;
    [m[i], m[p]] = [m[p]!, m[i]!];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const f = m[j]![i]! / m[i]![i]!;
      for (let k = i; k <= n; k++) m[j]![k]! -= f * m[i]![k]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/**
 * Least-squares similarity fit: x = a·E − b·N + c, y = −(b·E + a·N) + d, with E/N in NM east and
 * north of the first anchor (image y grows downward).
 */
export function fitPlate(cal: PlateCalibration, sc: Scenario): PlateFit {
  const frame = new LocalFrame(anchorLatLon(cal.anchors[0]!.ref, sc));
  const en = (p: LatLon): [number, number] => {
    const l = frame.toLocal(p);
    return [l.eastM / METRES_PER_NM, l.northM / METRES_PER_NM];
  };
  const pts = cal.anchors.map((an) => ({ an, e: en(anchorLatLon(an.ref, sc)) }));
  const ata = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
  const atb = [0, 0, 0, 0];
  const add = (row: number[], v: number) => {
    for (let p = 0; p < 4; p++) {
      atb[p]! += row[p]! * v;
      for (let q = 0; q < 4; q++) ata[p]![q]! += row[p]! * row[q]!;
    }
  };
  for (const { an, e } of pts) {
    add([e[0], -e[1], 1, 0], an.x);
    add([-e[1], -e[0], 0, 1], an.y);
  }
  const [a, b, c, d] = solve(ata, atb) as [number, number, number, number];
  const map = ([e, n]: [number, number]): [number, number] => [
    a * e - b * n + c,
    -(b * e + a * n) + d,
  ];
  return {
    toPx: (p) => map(en(p)),
    scalePxPerNm: Math.hypot(a, b),
    rotationDeg: (Math.atan2(b, a) * 180) / Math.PI,
    residuals: pts.map(({ an, e }) => {
      const [x, y] = map(e);
      return { name: an.name, px: Math.hypot(x - an.x, y - an.y) };
    }),
  };
}
