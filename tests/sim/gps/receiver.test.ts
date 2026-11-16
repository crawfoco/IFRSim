import { describe, expect, it } from 'vitest';
import { NAVDATA, RNAV_PROCEDURES } from '../../../src/procedures';
import { normalize360 } from '../../../src/sim/geo/angles';
import { destination, initialBearingTrueDeg } from '../../../src/sim/geo/geodesy';
import { buildPlan, gpsDatabase, VTF } from '../../../src/sim/gps/flightplan';
import {
  applyGpsCommand,
  buildGpsWorld,
  GPS_OFF,
  gpsGoAround,
  gpsReading,
  stepGps,
  turnRadiusNm,
  type GpsState,
} from '../../../src/sim/gps/receiver';

const klaa = RNAV_PROCEDURES.find((p) => p.id === 'klaa-rnav18')!;
const MV = NAVDATA.airports.KLAA!.magVarEastDeg;
const db = gpsDatabase(klaa, NAVDATA, MV)!;
const world = buildGpsWorld(db, NAVDATA, true);
const noWaas = buildGpsWorld(db, NAVDATA, false);
/** Glass panel: an integrated GPS, which GA (TOGA) sequences into the missed approach. */
const glass = buildGpsWorld(db, NAVDATA, true, { goAroundSequencesMissed: true });
const fix = (n: string) => db.fixes[n]!;
const at = (position = fix('WEYYI'), altitudeFt = 6000) => ({ position, altitudeFt });
const desc = (p: ReturnType<typeof buildPlan>) =>
  p.legs.map((l) =>
    l.kind === 'tf'
      ? `TF ${l.from}-${l.to}${l.flyOver ? '*' : ''}`
      : l.kind === 'df'
        ? `DF ${l.to}`
        : l.kind === 'ca'
          ? `CA ${l.altFt}`
          : `HOLD ${l.fix}${l.inLieu ? ' in lieu' : ''} ${l.legNm}NM ${l.turn}`,
  );

describe('GPS database and flight plans (KLAA RNAV 18)', () => {
  it('lists the transitions and the lines, best first', () => {
    expect(db.transitions.map((t) => `${t.id}:${t.fix}`)).toEqual([
      'weyyi:WEYYI',
      'wizge:WIZGE',
      'obozu:OBOZU',
    ]);
    expect(db.lines).toEqual(['LPV', 'LNAV/VNAV', 'LNAV']);
    expect(db.glidePath?.angleDeg).toBe(3.05);
    expect(db.fas?.courseWidthNm).toBeCloseTo(106.75 / 1852, 6);
  });

  it('builds a NoPT transition: direct to the IAF, the legs, the final and the missed', () => {
    const p = buildPlan(db, { transition: 'weyyi' }, NAVDATA);
    expect(desc(p)).toEqual([
      'DF WEYYI',
      'TF WEYYI-OBOZU',
      'TF OBOZU-LOLME',
      'TF LOLME-RW18*',
      'CA 3945',
      'DF IHIYO',
      'HOLD IHIYO 7NM R',
    ]);
    expect([p.fafLeg, p.mapLeg, p.missedLeg]).toEqual([2, 3, 4]);
  });

  it('builds the hold-in-lieu transition and vectors-to-final', () => {
    expect(desc(buildPlan(db, { transition: 'obozu' }, NAVDATA)).slice(0, 3)).toEqual([
      'DF OBOZU',
      'HOLD OBOZU in lieu 6NM R',
      'TF OBOZU-LOLME',
    ]);
    const vtf = buildPlan(db, { transition: VTF }, NAVDATA);
    expect(desc(vtf).slice(0, 2)).toEqual(['TF VTF-LOLME', 'TF LOLME-RW18*']);
    expect([vtf.fafLeg, vtf.mapLeg]).toEqual([0, 1]);
  });
});

describe('hold-in-lieu choice on load', () => {
  it('offers "Hold at <fix>?" on every transition with a hold-in-lieu, not on NoPT ones', () => {
    expect(db.transitions.map((t) => [t.id, t.offersHold, t.holdFix])).toEqual([
      ['weyyi', false, null],
      ['wizge', false, null],
      ['obozu', true, 'OBOZU'],
    ]);
  });

  it('loads the hold-in-lieu transition without the hold when told so', () => {
    const noHold = applyGpsCommand(
      GPS_OFF,
      { type: 'gpsLoad', transition: 'obozu', hold: false },
      world,
      at(),
    );
    expect(noHold.loaded).toEqual({ transition: 'obozu', hold: false });
    expect(desc(buildPlan(db, { transition: 'obozu', hold: false }, NAVDATA)).slice(0, 2)).toEqual([
      'DF OBOZU',
      'TF OBOZU-LOLME',
    ]);
  });

  it('ignores a hold choice the transition does not offer (loads it as published)', () => {
    const g = applyGpsCommand(
      GPS_OFF,
      { type: 'gpsLoad', transition: 'weyyi', hold: true },
      world,
      at(),
    );
    expect(g.loaded).toEqual({ transition: 'weyyi' });
  });
});

describe('GPS commands and reading', () => {
  const load = (s: GpsState, transition: string) =>
    applyGpsCommand(s, { type: 'gpsLoad', transition }, world, at());
  const activate = (s: GpsState, a = at()) => applyGpsCommand(s, { type: 'gpsActivate' }, world, a);

  it('is flagged with nothing loaded, and loading alone does not navigate', () => {
    const r0 = gpsReading(GPS_OFF, world, at(), 100, MV);
    expect(r0).toMatchObject({ flag: true, phase: 'TERM', annunciation: null });
    const loaded = load(GPS_OFF, 'weyyi');
    expect(loaded).toMatchObject({ active: false, loaded: { transition: 'weyyi' } });
    expect(gpsReading(loaded, world, at(), 100, MV).flag).toBe(true);
  });

  it('activating goes direct to the IAF, with TO and the bearing as desired track', () => {
    const start = destination(fix('WEYYI'), 270 + MV, 5);
    const s = activate(load(GPS_OFF, 'weyyi'), at(start));
    const r = gpsReading(s, world, at(start), 100, MV);
    expect(r).toMatchObject({ flag: false, activeWaypoint: 'WEYYI', toFrom: 'TO', phase: 'TERM' });
    expect(r.xtkNm).toBeCloseTo(0, 6);
    expect(r.distanceNm).toBeCloseTo(5, 3);
    expect(r.fullScaleNm).toBe(1);
    expect(Math.abs(r.dtkTrueDeg - normalize360(90 + MV))).toBeLessThan(0.1);
  });

  it('ignores a transition the database does not have', () => {
    expect(load(GPS_OFF, 'nope')).toBe(GPS_OFF);
  });

  it('Direct-To a flight-plan fix flies from present position', () => {
    const s = activate(load(GPS_OFF, 'weyyi'));
    const here = destination(fix('LOLME'), 90, 3);
    const d = applyGpsCommand(s, { type: 'gpsDirect', fix: 'LOLME' }, world, at(here));
    expect(d).toMatchObject({ leg: 2, direct: true });
    const r = gpsReading(d, world, at(here), 100, MV);
    expect(r.activeWaypoint).toBe('LOLME');
    expect(Math.abs(r.xtkNm)).toBeLessThan(1e-6);
  });
});

describe('GPS sequencing', () => {
  const weyyi = (): GpsState => {
    const s = applyGpsCommand(GPS_OFF, { type: 'gpsLoad', transition: 'weyyi' }, world, at());
    return applyGpsCommand(s, { type: 'gpsActivate' }, world, at());
  };

  it('anticipates a fly-by turn by R·tan(Δ/2) before the fix', () => {
    // On WEYYI → OBOZU (092°), OBOZU → LOLME is 183°: a 91° right turn.
    const s = { ...weyyi(), leg: 1 };
    const crs = initialBearingTrueDeg(fix('WEYYI'), fix('OBOZU'));
    const lead = turnRadiusNm(100) * Math.tan(((183 - 92) / 2) * (Math.PI / 180));
    const before = destination(fix('OBOZU'), crs + 180, lead + 0.05);
    const after = destination(fix('OBOZU'), crs + 180, lead - 0.05);
    expect(stepGps(s, world, at(before), crs, 100).leg).toBe(1);
    expect(stepGps(s, world, at(after), crs, 100).leg).toBe(2);
  });

  it('suspends over the MAP and unsuspends into the missed approach', () => {
    const s = { ...weyyi(), leg: 3 };
    const crs = initialBearingTrueDeg(fix('LOLME'), fix('RW18'));
    const past = destination(fix('RW18'), crs, 0.05);
    const susp = stepGps(s, world, at(past, 3800), crs, 100);
    expect(susp).toMatchObject({ leg: 3, suspended: true });
    const r = gpsReading(susp, world, at(past, 3800), 100, MV);
    expect(r).toMatchObject({ suspended: true, toFrom: 'FROM' });
    const un = applyGpsCommand(susp, { type: 'gpsSusp' }, world, at(past, 3800));
    expect(un).toMatchObject({ leg: 4, suspended: false });
    expect(gpsReading(un, world, at(past, 3800), 100, MV).phase).toBe('MAPR');
  });

  it('SUSP pressed before the MAP arms the missed approach: no suspension at the MAP', () => {
    const s = applyGpsCommand({ ...weyyi(), leg: 3 }, { type: 'gpsSusp' }, world, at());
    expect(s.missedArmed).toBe(true);
    const crs = initialBearingTrueDeg(fix('LOLME'), fix('RW18'));
    const past = destination(fix('RW18'), crs, 0.05);
    expect(stepGps(s, world, at(past, 4200), crs, 100)).toMatchObject({
      leg: 4,
      suspended: false,
      missedArmed: false,
    });
  });

  describe('GA (TOGA)', () => {
    const crs = () => initialBearingTrueDeg(fix('LOLME'), fix('RW18'));
    const past = () => destination(fix('RW18'), crs(), 0.05);

    it('on glass, GA before the MAP arms the missed approach (and pressing it again keeps it armed)', () => {
      const once = gpsGoAround({ ...weyyi(), leg: 3 }, glass, at());
      expect(once.missedArmed).toBe(true);
      expect(gpsGoAround(once, glass, at()).missedArmed).toBe(true);
      expect(stepGps(once, glass, at(past(), 4200), crs(), 100)).toMatchObject({
        leg: 4,
        suspended: false,
      });
    });

    it('on glass, GA while suspended at the MAP sequences into the missed approach', () => {
      const susp = stepGps({ ...weyyi(), leg: 3 }, glass, at(past(), 3800), crs(), 100);
      expect(susp.suspended).toBe(true);
      expect(gpsGoAround(susp, glass, at(past(), 3800))).toMatchObject({
        leg: 4,
        suspended: false,
      });
    });

    it('on steam, GA leaves the GPS alone: SUSP is the pilot’s job', () => {
      const s = { ...weyyi(), leg: 3 };
      expect(gpsGoAround(s, world, at())).toBe(s);
      const susp = stepGps(s, world, at(past(), 3800), crs(), 100);
      expect(gpsGoAround(susp, world, at(past(), 3800))).toBe(susp);
    });

    it('on glass, GA with no active approach or already on the missed changes nothing', () => {
      expect(gpsGoAround(GPS_OFF, glass, at())).toBe(GPS_OFF);
      const missed = { ...weyyi(), leg: 5 };
      expect(gpsGoAround(missed, glass, at())).toBe(missed);
    });
  });

  it('the CA leg ends at its altitude, then direct IHIYO', () => {
    const s = { ...weyyi(), leg: 4, legStart: fix('RW18') };
    expect(stepGps(s, world, at(fix('RW18'), 3800), 183, 100).leg).toBe(4);
    expect(stepGps(s, world, at(fix('RW18'), 3950), 183, 100).leg).toBe(5);
  });
});

describe('CDI scaling and annunciation', () => {
  const onLeg = (leg: number, w = world): GpsState => {
    const s = applyGpsCommand(GPS_OFF, { type: 'gpsLoad', transition: 'weyyi' }, w, at());
    return { ...applyGpsCommand(s, { type: 'gpsActivate' }, w, at()), leg };
  };
  const crsFinal = initialBearingTrueDeg(fix('LOLME'), fix('RW18'));
  const crsInt = initialBearingTrueDeg(fix('OBOZU'), fix('LOLME'));

  it('terminal (1 NM) more than 2 NM before the FAF, no annunciation', () => {
    const p = destination(fix('LOLME'), crsInt + 180, 4);
    expect(gpsReading(onLeg(2), world, at(p), 100, MV)).toMatchObject({
      phase: 'TERM',
      fullScaleNm: 1,
      annunciation: null,
    });
  });

  it('ramps toward approach scaling over the last 2 NM and annunciates LPV', () => {
    const p = destination(fix('LOLME'), crsInt + 180, 1);
    const r = gpsReading(onLeg(2), world, at(p), 100, MV);
    expect(r.phase).toBe('APR');
    expect(r.annunciation).toBe('LPV');
    expect(r.fullScaleNm).toBeLessThan(1);
    expect(r.fullScaleNm).toBeGreaterThan(0.3);
  });

  it('LPV is angular: narrower toward the runway', () => {
    const far = gpsReading(
      onLeg(3),
      world,
      at(destination(fix('RW18'), crsFinal + 180, 5)),
      100,
      MV,
    );
    const near = gpsReading(
      onLeg(3),
      world,
      at(destination(fix('RW18'), crsFinal + 180, 1)),
      100,
      MV,
    );
    expect(far.fullScaleNm).toBeGreaterThan(near.fullScaleNm);
    expect(far.fullScaleNm).toBeGreaterThan(0.15);
    expect(far.fullScaleNm).toBeLessThan(0.45);
    expect(far.gp).not.toBeNull();
    expect(far.gpAdvisory).toBe(false);
  });

  it('without WAAS the GPS annunciates LNAV at 0.3 NM, with no glidepath', () => {
    const p = destination(fix('RW18'), crsFinal + 180, 3);
    const r = gpsReading(onLeg(3, noWaas), noWaas, at(p), 100, MV);
    expect(r).toMatchObject({
      annunciation: 'LNAV',
      fullScaleNm: 0.3,
      gp: null,
      vnavAvailable: false,
    });
  });
});
