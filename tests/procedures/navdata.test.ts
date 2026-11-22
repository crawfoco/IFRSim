/**
 * Cross-checks FAA NASR navdata against values hand-typed from the approach plates in public/charts/.
 * Fix geometry is checked by computing each fix's radial/DME from its defining navaid.
 */
import { describe, expect, it } from 'vitest';
import navdataJson from '../../src/procedures/navdata.json';
import { normalize360, signedAngleDiff, trueToMag } from '../../src/sim/geo/angles';
import { distanceNm, initialBearingTrueDeg, type LatLon } from '../../src/sim/geo/geodesy';
import type { NavData } from '../../src/sim/navdata/types';

const nav = navdataJson as NavData;

const navaid = (id: string) => {
  const n = nav.navaids[id];
  if (!n) throw new Error(`navaid ${id} missing`);
  return n;
};
const loc = (id: string) => {
  const l = nav.localizers[id];
  if (!l) throw new Error(`localizer ${id} missing`);
  return l;
};
const fix = (id: string) => {
  const f = nav.fixes[id];
  if (!f) throw new Error(`fix ${id} missing`);
  return f.position;
};

describe('source', () => {
  it('records the NASR cycle the charts were drawn from', () => {
    expect(nav.source.dataset).toBe('FAA NASR');
    expect(nav.source.cycle).toBe('2026-10-29');
  });
});

describe('navaids match the plates', () => {
  it.each([
    ['FQF', 116.3, '110X'],
    ['GLL', 114.2, '89X'],
    ['AKO', 114.4, '91X'],
    ['LAR', 117.6, '123X'],
    ['SNY', 115.9, '106X'],
    ['MTJ', 117.1, '118X'],
    ['JNC', 112.4, '71X'],
    ['CYS', 113.1, '78X'],
    ['DVV', 114.7, '94X'],
  ])('%s %s MHz, channel %s', (id, freq, chan) => {
    expect(navaid(id).freqMHz).toBe(freq);
    expect(navaid(id).dmeChannel).toBe(chan);
  });
});

describe('localizers match the plates', () => {
  it.each([
    ['I-FTG', 'CFO', '26', 109.3, 263, '30X'],
    ['I-DCI', 'GXY', '35', 110.3, 350, '40X'],
    ['I-MTJ', 'MTJ', '17', 111.3, 168, undefined],
  ])('%s (%s %s) %s MHz, course %s°', (id, apt, rwy, freq, course, dmeChan) => {
    const l = loc(id);
    expect(l.airport).toBe(apt);
    expect(l.runway).toBe(rwy);
    expect(l.freqMHz).toBe(freq);
    expect(Math.abs(signedAngleDiff(l.courseMagDeg, course))).toBeLessThan(0.5);
    expect(l.glideslope?.angleDeg).toBe(3);
    expect(l.dme?.channel).toBe(dmeChan);
  });
});

describe('runways match the plates', () => {
  it.each([
    ['CFO', '26', 5489, 50],
    ['GXY', '35', 4665, 51],
    ['MTJ', '17', 5708, null], // ILS TCH 56 on the plate; NASR's VGSI TCH differs, see note below
    ['AKO', '29', 4683, 43],
    ['LAR', '30', 7278, 41],
    ['SNY', '13', 4313, 45],
  ])('%s %s TDZE %s', (apt, rwy, tdze, vgsiTch) => {
    const end = nav.runwayEnds.find((e) => e.airport === apt && e.runway === rwy);
    expect(end).toBeDefined();
    expect(Math.abs(end!.tdzeFt - tdze)).toBeLessThan(1.5);
    // The plates' VGSI TCH (VOR approaches) and GS TCH (KCFO, KGXY) agree with NASR's VGSI TCH.
    if (vgsiTch !== null) expect(end!.vgsiTchFt).toBe(vgsiTch);
  });
});

// ---- Fix geometry: each fix as the plate defines it -------------------------------------

/** Radial (magnetic, using station declination) and DME of a point from a VOR. */
function radialDme(stationId: string, p: LatLon) {
  const s = navaid(stationId);
  const radial = trueToMag(initialBearingTrueDeg(s.position, p), s.declinationEastDeg);
  return { radial, dme: distanceNm(s.dmePosition ?? s.position, p) };
}

/** DME from an ILS DME antenna, and the magnetic bearing from the localizer antenna. */
function locDme(locId: string, p: LatLon) {
  const l = loc(locId);
  if (!l.dme) throw new Error(`${locId} has no DME`);
  return {
    bearingFromLoc: trueToMag(initialBearingTrueDeg(l.position, p), l.magVarEastDeg),
    dme: distanceNm(l.dme.position, p),
  };
}

// Plate DME values are rounded to 0.1 NM; plates use slant range, we use ground distance.
const DME_TOL_NM = 0.2;
const RADIAL_TOL_DEG = 1.5;

describe('fixes on VOR radials / DME (plate definitions)', () => {
  it.each([
    // [fix, station, radial | null, dme | null]
    ['CEDUK', 'GLL', 136, 16],
    ['WAVDI', 'GLL', null, 17.5],
    ['WELDS', 'GLL', null, 17.5],
    ['KROMM', 'CYS', 154, 26.3],
    ['PAGRE', 'MTJ', 297, 14.8],
    ['BRUUK', 'MTJ', 349, 14.8],
    ['BRUUK', 'JNC', null, 46],
    ['HAQHY', 'JNC', 98, 36],
    // WIDRU and ZIMVI are MTJ DME on the I-MTJ localizer (not an MTJ radial): course checked below.
    ['WIDRU', 'MTJ', null, 8.8],
    ['ZIMVI', 'MTJ', null, 4.7],
    ['GERON', 'AKO', 110, 10],
    ['POVOH', 'LAR', 55, 18],
    ['JESAR', 'LAR', 86, 18],
    ['ECECU', 'LAR', 112, 18],
    ['DUCBE', 'LAR', 112, 14.1],
    ['HEMBI', 'LAR', 112, 11.2],
    ['GARBE', 'LAR', 112, 6],
    ['FLEMS', 'LAR', null, 28.8],
    ['DMYIH', 'LAR', 112, null],
    ['JUNAD', 'SNY', 310, 11],
    ['CHAKO', 'SNY', 310, 5],
    ['JIKUT', 'SNY', 310, 0.8],
    ['RIYOP', 'SNY', 78, 11],
    ['OGJUN', 'SNY', 202, 11],
  ] as const)('%s = %s R-%s / %s DME', (fixId, station, radial, dme) => {
    const got = radialDme(station, fix(fixId));
    if (dme !== null) expect(Math.abs(got.dme - dme)).toBeLessThan(DME_TOL_NM);
    if (radial !== null) {
      // Very close to the station a 1.5° radial tolerance is tighter than the data allows.
      const tol = got.dme < 2 ? 6 : RADIAL_TOL_DEG;
      expect(Math.abs(signedAngleDiff(got.radial, radial))).toBeLessThan(tol);
    }
  });
});

describe('fixes on localizer courses (plate definitions)', () => {
  it.each([
    // [fix, localizer, ILS DME]: fixes lie on the localizer extended outbound (back of the course)
    ['SKIPI', 'I-FTG', 7],
    ['WELDS', 'I-DCI', 14.5],
    ['BUFFS', 'I-DCI', 7.6],
    ['ARTSS', 'I-DCI', 3.7],
  ] as const)('%s = %s %s DME on the localizer', (fixId, locId, dme) => {
    const got = locDme(locId, fix(fixId));
    expect(Math.abs(got.dme - dme)).toBeLessThan(DME_TOL_NM);
    const outbound = normalize360(loc(locId).courseMagDeg + 180);
    expect(Math.abs(signedAngleDiff(got.bearingFromLoc, outbound))).toBeLessThan(0.5);
  });

  it('KMTJ fixes lie on the I-MTJ course', () => {
    const l = loc('I-MTJ');
    const outbound = normalize360(l.courseMagDeg + 180);
    for (const id of ['BRUUK', 'WIDRU', 'ZIMVI']) {
      const b = trueToMag(initialBearingTrueDeg(l.position, fix(id)), l.magVarEastDeg);
      expect(Math.abs(signedAngleDiff(b, outbound))).toBeLessThan(0.5);
    }
  });
});
