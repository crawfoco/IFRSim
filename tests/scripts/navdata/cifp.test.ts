import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCifp,
  cifpCycle,
  parseLatLon,
  parseLatLonHp,
  parseMagVar,
} from '../../../scripts/navdata/cifp';

const TEXT = readFileSync(join(import.meta.dirname, '../../fixtures/cifp/FAACIFP18'), 'latin1');

describe('ARINC 424 field parsers', () => {
  it('reads coordinates in both precisions', () => {
    const p = parseLatLon('N38095556', 'W102401240');
    expect(p.latDeg).toBeCloseTo(38 + 9 / 60 + 55.56 / 3600, 9);
    expect(p.lonDeg).toBeCloseTo(-(102 + 40 / 60 + 12.4 / 3600), 9);
    const hp = parseLatLonHp('N3804294875', 'W10241223985');
    expect(hp.latDeg).toBeCloseTo(38 + 4 / 60 + 29.4875 / 3600, 9);
    expect(hp.lonDeg).toBeCloseTo(-(102 + 41 / 60 + 22.3985 / 3600), 9);
  });

  it('reads magnetic variation', () => {
    expect(parseMagVar('E0062')).toBeCloseTo(6.2);
    expect(parseMagVar('W0105')).toBeCloseTo(-10.5);
  });

  it('reads the cycle from the header', () => {
    expect(cifpCycle(TEXT)).toBe('2611');
  });
});

describe('buildCifp (KLAA RNAV (GPS) RWY 18)', () => {
  const data = buildCifp(TEXT, [{ airport: 'KLAA', ident: 'R18' }]);
  const apch = data.approaches['KLAA R18']!;

  it('lists the minimums lines and the runway', () => {
    expect(data.cycle).toBe('2611');
    expect(apch.runway).toBe('RW18');
    expect(apch.minimumsLines).toEqual(['LPV', 'LNAV/VNAV', 'LNAV']);
  });

  it('reads the transitions and the final route', () => {
    const ids = apch.routes.map((r) => `${r.routeType}:${r.transition}`);
    expect(ids).toEqual(['A:OBOZU', 'A:WEYYI', 'A:WIZGE', 'R:']);
    const weyyi = apch.routes.find((r) => r.transition === 'WEYYI')!;
    expect(weyyi.legs.map((l) => `${l.pathTerminator} ${l.fix}`)).toEqual(['IF WEYYI', 'TF OBOZU']);
    expect(weyyi.legs[0]!.role).toBe('IAF');
    expect(weyyi.legs[1]).toMatchObject({ altDesc: '+', alt1Ft: 6000, role: 'IF' });
  });

  it('reads the hold-in-lieu at OBOZU', () => {
    const hold = apch.routes.find((r) => r.transition === 'OBOZU')!.legs[0]!;
    expect(hold).toMatchObject({
      pathTerminator: 'HF',
      fix: 'OBOZU',
      turn: 'R',
      courseMagDeg: 182.7,
      distanceNm: 6,
      holdMinutes: null,
      alt1Ft: 6000,
      role: 'IAF',
    });
  });

  it('reads the final and the missed approach', () => {
    const final = apch.routes.find((r) => r.routeType === 'R')!;
    expect(final.legs.map((l) => `${l.pathTerminator} ${l.fix ?? '-'}`)).toEqual([
      'IF OBOZU',
      'TF LOLME',
      'TF RW18',
      'CA -',
      'DF IHIYO',
      'HM IHIYO',
    ]);
    const [, faf, map, ca, df, hm] = final.legs;
    expect(faf).toMatchObject({ role: 'FAF', alt1Ft: 5500, flyOver: false });
    expect(map).toMatchObject({ role: 'MAP', flyOver: true, verticalAngleDeg: -3.05, rnpNm: 0.3 });
    expect(ca).toMatchObject({ missedStart: true, courseMagDeg: 182.6, alt1Ft: 3945 });
    expect(df).toMatchObject({ flyOver: true, alt1Ft: 6200 });
    expect(hm).toMatchObject({ turn: 'R', courseMagDeg: 2.6, distanceNm: 7, alt1Ft: 6200 });
  });

  it('reads the FAS data block', () => {
    const pp = apch.pathPoint!;
    expect(pp).toMatchObject({ runway: 'RW18', referencePathId: 'W18A', approachLabel: 'LPV' });
    expect(pp.gpaDeg).toBeCloseTo(3.05);
    expect(pp.tchFt).toBeCloseTo(41);
    expect(pp.courseWidthM).toBeCloseTo(106.75);
    expect(pp.ltp.latDeg).toBeCloseTo(38 + 4 / 60 + 29.4875 / 3600, 8);
  });

  it('resolves every fix the legs name', () => {
    expect(Object.keys(data.waypoints).sort()).toEqual([
      'KLAA/IHIYO',
      'KLAA/LOLME',
      'KLAA/OBOZU',
      'KLAA/RW18',
      'WEYYI',
      'WIZGE',
    ]);
    expect(data.waypoints['KLAA/LOLME']!.magVarEastDeg).toBeCloseTo(6.2);
    expect(data.waypoints.WEYYI!.region).toBe('ENRT');
  });

  it('skips minimums lines the coding marks not authorised (KCOS: LP, no LNAV/VNAV, LNAV)', () => {
    const kcos = readFileSync(
      join(import.meta.dirname, '../../fixtures/cifp/kcos-lines.txt'),
      'latin1',
    );
    const d = buildCifp(kcos, [{ airport: 'KCOS', ident: 'R31' }]);
    expect(d.approaches['KCOS R31']!.minimumsLines).toEqual(['LP', 'LNAV']);
  });

  it('takes the runway from the path point when the final ends at a waypoint (KCNY offset final)', () => {
    const kcny = readFileSync(
      join(import.meta.dirname, '../../fixtures/cifp/kcny-lines.txt'),
      'latin1',
    );
    const d = buildCifp(kcny, [{ airport: 'KCNY', ident: 'R03' }]);
    const a = d.approaches['KCNY R03']!;
    expect(a.runway).toBe('RW03');
    expect(a.pathPoint).toBeDefined();
    expect(d.waypoints['KCNY/RW03']).toBeDefined();
  });

  it('fails loudly when an approach is missing', () => {
    expect(() => buildCifp(TEXT, [{ airport: 'KLAA', ident: 'R36' }])).toThrow(
      /KLAA R36 not in CIFP/,
    );
  });
});
