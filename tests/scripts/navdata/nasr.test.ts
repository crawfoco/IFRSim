import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRecords } from '../../../scripts/navdata/csv';
import {
  parseAirport,
  parseFix,
  parseLocalizer,
  parseNavaid,
  parseRunwayEnd,
} from '../../../scripts/navdata/nasr';

const FIXTURES = join(import.meta.dirname, '../../fixtures/navdata');
const load = (name: string) => readRecords(readFileSync(join(FIXTURES, `${name}.csv`), 'latin1'));
const one = <T>(rows: T[], pred: (r: T) => boolean): T => {
  const found = rows.filter(pred);
  expect(found).toHaveLength(1);
  return found[0]!;
};

describe('parseNavaid (NAV_BASE)', () => {
  it('reads FQF VORTAC (KCFO feeder navaid)', () => {
    const nav = parseNavaid(one(load('NAV_BASE'), (r) => r.NAV_ID === 'FQF'));
    expect(nav).toMatchObject({
      id: 'FQF',
      type: 'VORTAC',
      freqMHz: 116.3,
      dmeChannel: '110X',
      declinationEastDeg: 11,
      declinationYear: 1995,
      serviceVolume: 'H',
    });
    expect(nav.position.latDeg).toBeCloseTo(39.69013888, 7);
    expect(nav.position.lonDeg).toBeCloseTo(-104.62097222, 7);
  });

  it('reads GLL VOR/DME', () => {
    const nav = parseNavaid(one(load('NAV_BASE'), (r) => r.NAV_ID === 'GLL'));
    expect(nav).toMatchObject({ id: 'GLL', type: 'VOR/DME', freqMHz: 114.2, dmeChannel: '89X' });
  });
});

describe('parseFix (FIX_BASE)', () => {
  it('reads SKIPI', () => {
    const fix = parseFix(one(load('FIX_BASE'), (r) => r.FIX_ID === 'SKIPI'));
    expect(fix).toMatchObject({ id: 'SKIPI', state: 'CO', use: 'RP' });
    expect(fix.position.latDeg).toBeCloseTo(39.79173055, 7);
    expect(fix.position.lonDeg).toBeCloseTo(-104.42403611, 7);
  });
});

describe('parseLocalizer (ILS_BASE + ILS_GS + ILS_DME)', () => {
  const base = load('ILS_BASE');
  const gs = load('ILS_GS');
  const dme = load('ILS_DME');

  it('joins I-FTG localizer, glideslope and DME', () => {
    const loc = parseLocalizer(
      one(base, (r) => r.ILS_LOC_ID === 'FTG'),
      gs.find((r) => r.ILS_LOC_ID === 'FTG'),
      dme.find((r) => r.ILS_LOC_ID === 'FTG'),
    );
    expect(loc).toMatchObject({
      id: 'I-FTG',
      airport: 'CFO',
      runway: '26',
      systemType: 'LD',
      freqMHz: 109.3,
      courseMagDeg: 263.17,
      magVarEastDeg: 8,
    });
    expect(loc.glideslope?.angleDeg).toBe(3);
    expect(loc.dme?.channel).toBe('30X');
  });

  it('leaves DME undefined for a LOC/GS system (I-MTJ)', () => {
    const loc = parseLocalizer(
      one(base, (r) => r.ILS_LOC_ID === 'MTJ'),
      gs.find((r) => r.ILS_LOC_ID === 'MTJ'),
      undefined,
    );
    expect(loc).toMatchObject({ id: 'I-MTJ', systemType: 'LG', courseMagDeg: 167.82 });
    expect(loc.dme).toBeUndefined();
    expect(loc.glideslope).toBeDefined();
  });
});

describe('parseAirport (APT_BASE)', () => {
  it('reads KCFO', () => {
    const apt = parseAirport(one(load('APT_BASE'), (r) => r.ARPT_ID === 'CFO'));
    expect(apt).toMatchObject({ id: 'KCFO', faaId: 'CFO', magVarEastDeg: 8, magVarYear: 2015 });
    expect(apt.elevationFt).toBeCloseTo(5515.2, 1);
  });
});

describe('parseRunwayEnd (APT_RWY_END)', () => {
  const rows = load('APT_RWY_END');

  it('reads CFO 26 with its VGSI TCH', () => {
    const end = parseRunwayEnd(one(rows, (r) => r.ARPT_ID === 'CFO' && r.RWY_END_ID === '26'));
    expect(end).toMatchObject({
      airport: 'CFO',
      runway: '26',
      trueAlignmentDeg: 271,
      vgsiTchFt: 50,
    });
    expect(end.tdzeFt).toBeCloseTo(5489.1, 1);
    expect(end.displacedThreshold).toBeUndefined();
  });

  it('reads the GXY 35 displaced threshold', () => {
    const end = parseRunwayEnd(one(rows, (r) => r.ARPT_ID === 'GXY' && r.RWY_END_ID === '35'));
    expect(end.displacedThreshold?.lengthFt).toBe(1100);
    expect(end.tdzeFt).toBeCloseTo(4664.8, 1);
  });
});
