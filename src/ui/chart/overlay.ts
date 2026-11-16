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
  // KLAA RNAV (GPS) RWY 18 (AL-5290 Amdt 1E), native 655×1010: WEYYI and WIZGE triangles, OBOZU and
  // LOLME fly-by stars, the RW18 runway waypoint. 17.8 px/NM, every anchor within 1.3 px. Masked:
  // MSA circle, airport sketch, and the "MISSED APCH FIX" inset (IHIYO).
  'klaa-rnav18': {
    imageW: 655,
    imageH: 1010,
    planArea: { x: 31, y: 232, w: 597, h: 452 },
    insets: [
      { x: 495, y: 235, w: 132, h: 125 }, // MSA circle
      { x: 31, y: 607, w: 191, h: 77 }, // airport sketch
      { x: 520, y: 585, w: 108, h: 99 }, // missed approach fix inset
    ],
    anchors: [
      { name: 'WEYYI', ref: { fix: 'WEYYI' }, x: 197.8, y: 338 },
      { name: 'WIZGE', ref: { fix: 'WIZGE' }, x: 487.8, y: 387.2 },
      { name: 'OBOZU', ref: { fix: 'OBOZU' }, x: 342, y: 360.7 },
      { name: 'LOLME', ref: { fix: 'LOLME' }, x: 322.7, y: 467.7 },
      { name: 'RW18', ref: { fix: 'RW18' }, x: 307.7, y: 564.3 },
    ],
  },
  // KOGA RNAV (GPS) RWY 8 (AL-6070 Amdt 2F), native 655×1010: AHUFU, EZIFU and YEYUC stars and
  // the RW08 runway waypoint, all on the final course (a similarity fit needs no more). 17.8 px/NM,
  // every anchor within 0.5 px. Masked: the TAA icons (not to scale), the "MISSED APCH FIX" inset
  // (TUKWY) and the top of the airport sketch.
  'koga-rnav8': {
    imageW: 655,
    imageH: 1010,
    planArea: { x: 31, y: 226, w: 597, h: 424 },
    insets: [
      { x: 95, y: 465, w: 250, h: 160 }, // TAA areas
      { x: 518, y: 497, w: 110, h: 110 }, // missed approach fix inset
      { x: 432, y: 608, w: 196, h: 42 }, // airport sketch
    ],
    anchors: [
      { name: 'AHUFU', ref: { fix: 'AHUFU' }, x: 186.7, y: 423.5 },
      { name: 'EZIFU', ref: { fix: 'EZIFU' }, x: 318.8, y: 422.7 },
      { name: 'YEYUC', ref: { fix: 'YEYUC' }, x: 372.5, y: 422.7 },
      { name: 'RW08', ref: { fix: 'RW08' }, x: 424.3, y: 422.7 },
    ],
  },
  // KBFF RNAV (GPS) RWY 12 (AL-383 Amdt 1B), native 655×1010: LEDSE, CAPGA, SACOP and AYAYI stars
  // and the RW12 runway waypoint. 17.8 px/NM, every anchor within 0.4 px. Masked: MSA circle, the
  // "MISSED APCH FIX" inset (HAKAB), and SPONS and ALBIN beyond their break symbols.
  'kbff-rnav12': {
    imageW: 655,
    imageH: 1010,
    planArea: { x: 32, y: 245, w: 595, h: 363 },
    insets: [
      { x: 500, y: 280, w: 120, h: 120 }, // MSA circle
      { x: 514, y: 543, w: 113, h: 65 }, // missed approach fix inset
      { x: 438, y: 245, w: 75, h: 35 }, // SPONS, beyond a break
      { x: 32, y: 565, w: 80, h: 43 }, // ALBIN, beyond a break
    ],
    anchors: [
      { name: 'LEDSE', ref: { fix: 'LEDSE' }, x: 243.8, y: 388.7 },
      { name: 'CAPGA', ref: { fix: 'CAPGA' }, x: 319.2, y: 465.3 },
      { name: 'SACOP', ref: { fix: 'SACOP' }, x: 180, y: 450.8 },
      { name: 'AYAYI', ref: { fix: 'AYAYI' }, x: 307, y: 326.3 },
      { name: 'RW12', ref: { fix: 'RW12' }, x: 383.8, y: 530.8 },
    ],
  },
  // KPUB RNAV (GPS) RWY 26L (AL-334 Amdt 1B), native 655×1010: BONUH, HELER, REDHI, JIKTA, MERTZ
  // and ORWAY stars and the RW26L runway waypoint. 17.8 px/NM, residuals ≤ 1.5 px. Masked: airport
  // sketch, MSA circle, and DRAKE, VIGIL and STAXX beyond their break symbols.
  'kpub-rnav26l': {
    imageW: 655,
    imageH: 1010,
    planArea: { x: 32, y: 199, w: 595, h: 470 },
    insets: [
      { x: 32, y: 610, w: 190, h: 59 }, // airport sketch
      { x: 504, y: 550, w: 112, h: 112 }, // MSA circle
      { x: 268, y: 199, w: 72, h: 34 }, // DRAKE, beyond a break
      { x: 318, y: 630, w: 60, h: 39 }, // VIGIL, beyond a break
      { x: 428, y: 636, w: 62, h: 33 }, // STAXX, beyond a break
    ],
    anchors: [
      { name: 'BONUH', ref: { fix: 'BONUH' }, x: 424.7, y: 360 },
      { name: 'HELER', ref: { fix: 'HELER' }, x: 427.5, y: 466.7 },
      { name: 'REDHI', ref: { fix: 'REDHI' }, x: 439.3, y: 574.3 },
      { name: 'JIKTA', ref: { fix: 'JIKTA' }, x: 318.3, y: 469.7 },
      { name: 'RW26L', ref: { fix: 'RW26L' }, x: 213, y: 472.7 },
      { name: 'MERTZ', ref: { fix: 'MERTZ' }, x: 67.5, y: 477 },
      { name: 'ORWAY', ref: { fix: 'ORWAY' }, x: 563.8, y: 486.7 },
    ],
  },
  // KCPR RNAV (GPS) RWY 3 (AL-72 Amdt 1C), native 655×1010: CEYFI, AXIBY, IPEYE, YIWZE, KIVSE stars
  // and the CHOMP triangle. 17.8 px/NM, residuals ≤ 1.1 px. Masked: the missed approach fix inset
  // (DDY hold), the airport sketch, the MSA circle, and HEITY and HIKOX beyond their breaks.
  'kcpr-rnav3': {
    imageW: 655,
    imageH: 1010,
    planArea: { x: 30, y: 209, w: 597, h: 445 },
    insets: [
      { x: 516, y: 209, w: 111, h: 117 }, // missed approach fix inset
      { x: 436, y: 610, w: 191, h: 44 }, // airport sketch
      { x: 585, y: 555, w: 42, h: 45 }, // HEITY, beyond a break
      { x: 85, y: 209, w: 80, h: 41 }, // HIKOX, beyond a break
      { x: 224, y: 228, w: 108, h: 112 }, // MSA circle
    ],
    anchors: [
      { name: 'CEYFI', ref: { fix: 'CEYFI' }, x: 128.7, y: 406.7 },
      { name: 'AXIBY', ref: { fix: 'AXIBY' }, x: 333.3, y: 603.3 },
      { name: 'IPEYE', ref: { fix: 'IPEYE' }, x: 230.8, y: 503.7 },
      { name: 'YIWZE', ref: { fix: 'YIWZE' }, x: 328.8, y: 402.3 },
      { name: 'KIVSE', ref: { fix: 'KIVSE' }, x: 428.3, y: 299.7 },
      { name: 'CHOMP', ref: { fix: 'CHOMP' }, x: 168.8, y: 644.2 },
    ],
  },
  // KAPA RNAV (GPS) RWY 28 (AL-5715 Amdt 1C), native 655×1010: DOCKY, EZBEL, DILVE, MESME, NIDLY
  // and FEGIB symbols. 17.8 px/NM, residuals ≤ 1.5 px. Masked: the MSA circle (the airport sketch
  // is below the plan view; the EZBEL missed hold is drawn to scale).
  'kapa-rnav28': {
    imageW: 655,
    imageH: 1010,
    planArea: { x: 30, y: 215, w: 600, h: 393 },
    insets: [{ x: 503, y: 228, w: 125, h: 122 }], // MSA circle
    anchors: [
      { name: 'DOCKY', ref: { fix: 'DOCKY' }, x: 411.7, y: 473 },
      { name: 'EZBEL', ref: { fix: 'EZBEL' }, x: 492.7, y: 436.7 },
      { name: 'DILVE', ref: { fix: 'DILVE' }, x: 495, y: 505 },
      { name: 'MESME', ref: { fix: 'MESME' }, x: 358.8, y: 454.5 },
      { name: 'NIDLY', ref: { fix: 'NIDLY' }, x: 309.8, y: 434.3 },
      { name: 'FEGIB', ref: { fix: 'FEGIB' }, x: 281, y: 422.3 },
    ],
  },
  // KCOS RNAV (GPS) RWY 31 (AL-87 Amdt 2A), native 655×1010: ADANE triangle, ZENER, NUTVE, JATOL
  // and ONKIE stars, RW31 runway waypoint. 17.8 px/NM, residuals ≤ 0.5 px. Masked: airport sketch,
  // MSA circle, PUB beyond a break.
  'kcos-rnav31': {
    imageW: 655,
    imageH: 1010,
    planArea: { x: 31, y: 199, w: 596, h: 483 },
    insets: [
      { x: 31, y: 610, w: 191, h: 72 }, // airport sketch
      { x: 500, y: 555, w: 127, h: 127 }, // MSA circle
      { x: 415, y: 633, w: 80, h: 49 }, // PUB, beyond a break
    ],
    anchors: [
      { name: 'ADANE', ref: { fix: 'ADANE' }, x: 513.7, y: 227.3 },
      { name: 'RW31', ref: { fix: 'RW31' }, x: 266.7, y: 342 },
      { name: 'JATOL', ref: { fix: 'JATOL' }, x: 329.7, y: 405.2 },
      { name: 'ZENER', ref: { fix: 'ZENER' }, x: 506, y: 437.5 },
      { name: 'NUTVE', ref: { fix: 'NUTVE' }, x: 406.3, y: 482.2 },
      { name: 'ONKIE', ref: { fix: 'ONKIE' }, x: 423.7, y: 569.7 },
    ],
  },
  // KALS RNAV (GPS) RWY 2 (AL-18 Amdt 2), native 655×1010: GEMKY and WAPRE triangles, VEPUY,
  // KROWZ and BREZE stars, RODDS (where the courses meet), RW02 and the ALS VORTAC. 17.7 px/NM,
  // residuals ≤ 2.3 px. Masked: the missed approach fix inset (not to scale), the airport sketch,
  // the MSA circle, ZOTOS beyond a break.
  'kals-rnav2': {
    imageW: 655,
    imageH: 1010,
    planArea: { x: 31, y: 213, w: 596, h: 467 },
    insets: [
      { x: 498, y: 213, w: 129, h: 173 }, // missed approach fix inset
      { x: 31, y: 610, w: 191, h: 70 }, // airport sketch
      { x: 155, y: 218, w: 118, h: 130 }, // MSA circle
      { x: 335, y: 640, w: 75, h: 40 }, // ZOTOS, beyond a break
    ],
    anchors: [
      { name: 'GEMKY', ref: { fix: 'GEMKY' }, x: 60.3, y: 477.5 },
      { name: 'WAPRE', ref: { fix: 'WAPRE' }, x: 202.8, y: 562.7 },
      { name: 'VEPUY', ref: { fix: 'VEPUY' }, x: 320.2, y: 638.3 },
      { name: 'RODDS', ref: { fix: 'RODDS' }, x: 287.3, y: 494 },
      { name: 'KROWZ', ref: { fix: 'KROWZ' }, x: 361.5, y: 374.7 },
      { name: 'BREZE', ref: { fix: 'BREZE' }, x: 380.8, y: 343.3 },
      { name: 'RW02', ref: { fix: 'RW02' }, x: 430.3, y: 260.5 },
      { name: 'ALS', ref: { navaid: 'ALS' }, x: 482, y: 344.7 },
    ],
  },
  // KCNY RNAV (GPS) RWY 3 (AL-5585 Amdt 2), native 655×1010: KIDNE, PIGSE and ARCHH triangles,
  // HANOG (fly-over) and NERRI symbols, the FOGUG MAP (offset final, not the runway). 17.8 px/NM,
  // residuals ≤ 0.8 px. Masked: the MSA circle and the top of the airport sketch.
  'kcny-rnav3': {
    imageW: 655,
    imageH: 1010,
    planArea: { x: 31, y: 212, w: 598, h: 456 },
    insets: [
      { x: 472, y: 483, w: 114, h: 122 }, // MSA circle
      { x: 436, y: 609, w: 193, h: 59 }, // airport sketch
    ],
    anchors: [
      { name: 'KIDNE', ref: { fix: 'KIDNE' }, x: 65.5, y: 460.5 },
      { name: 'PIGSE', ref: { fix: 'PIGSE' }, x: 220.3, y: 626.3 },
      { name: 'HANOG', ref: { fix: 'HANOG' }, x: 213, y: 439.7 },
      { name: 'NERRI', ref: { fix: 'NERRI' }, x: 300.8, y: 380.8 },
      { name: 'FOGUG', ref: { fix: 'FOGUG' }, x: 394.2, y: 312.3 },
      { name: 'ARCHH', ref: { fix: 'ARCHH' }, x: 554.2, y: 249.7 },
    ],
  },
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
  // KCYS ILS or LOC RWY 27 (AL-80 Amdt 36), native 655×1010: CYS VORTAC, MARKL tick, the EGBER
  // and HAMER triangles, COLLA and HORSE on the localizer, the I-CYS antenna. 17.9 px/NM,
  // rotation -0.09°, every anchor within 2.4 px. Masked: MSA circle, airport sketch.
  'kcys-ils27': {
    imageW: 655,
    imageH: 1010,
    planArea: { x: 33, y: 192, w: 594, h: 489 },
    insets: [
      { x: 498, y: 212, w: 122, h: 137 }, // MSA circle
      { x: 436, y: 605, w: 191, h: 76 }, // airport sketch
    ],
    anchors: [
      { name: 'CYS', ref: { navaid: 'CYS' }, x: 190.3, y: 402 },
      { name: 'MARKL', ref: { fix: 'MARKL' }, x: 278, y: 246 },
      { name: 'EGBER', ref: { fix: 'EGBER' }, x: 605.2, y: 433.3 },
      { name: 'HAMER', ref: { fix: 'HAMER' }, x: 399.8, y: 581.2 },
      { name: 'COLLA', ref: { fix: 'COLLA' }, x: 408.3, y: 483.7 },
      { name: 'HORSE', ref: { fix: 'HORSE' }, x: 266.7, y: 469.2 },
      { name: 'I-CYS', ref: { loc: 'I-CYS' }, x: 151.7, y: 460.3 },
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
  // KSKX (AL-5863 Amdt 3B): TAS VORTAC, the RESOY and ZUTRI ticks on the 116° course, and the
  // runway 13 end of the to-scale runway drawn at ZUTRI (the only anchor off the course line).
  // 17.86 px/NM, rotation 0.04°, all anchors within 1.5 px.
  'kskx-vordme-b': {
    imageW: 655,
    imageH: 1010,
    planArea: { x: 32, y: 199, w: 600, h: 543 },
    insets: [
      { x: 35, y: 612, w: 137, h: 128 }, // MSA circle
      { x: 435, y: 607, w: 197, h: 135 }, // airport sketch
    ],
    anchors: [
      { name: 'TAS', ref: { navaid: 'TAS' }, x: 191, y: 337.3 },
      { name: 'RESOY', ref: { fix: 'RESOY' }, x: 302.5, y: 426.3 },
      { name: 'ZUTRI', ref: { fix: 'ZUTRI' }, x: 392, y: 497.2 },
      { name: 'RW13', ref: { fix: 'RW13' }, x: 382.5, y: 499.2 },
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
