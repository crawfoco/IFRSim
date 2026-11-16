/**
 * Start conditions: lead-in starts begin short of their fix on the reciprocal of the start
 * heading; offset starts begin off to one side, on a heading the learner must turn from; and the direct-SKIPI start calls for (and can be flown with) a direct hold entry.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, PROCEDURES, RNAV_PROCEDURES, procedureById } from '../../../src/procedures';
import { resolveFixDef } from '../../../src/procedures/resolve';
import type { Leg } from '../../../src/procedures/schema';
import { magToTrue, reciprocal, signedAngleDiff } from '../../../src/sim/geo/angles';
import { distanceNm, initialBearingTrueDeg } from '../../../src/sim/geo/geodesy';
import { buildScenario } from '../../../src/sim/scenario/scenario';
import { inboundTrueAtFix } from '../../../src/sim/scoring/geometry';
import { correctEntries } from '../../../src/sim/scoring/rules/reversal';
import { Flight } from '../scripted';

const build = (procId: string, startId: string) =>
  buildScenario(procedureById(procId)!, NAVDATA, {
    startId,
    ceiling: 'above',
    gsOutOfService: false,
  });

const ALL = [...PROCEDURES, ...RNAV_PROCEDURES].flatMap((p) =>
  p.starts.map((st) => [p.id, st] as const),
);

describe('lead-in starts', () => {
  for (const [procId, st] of ALL.filter(([, st]) => st.leadInNm))
    it(`${procId} ${st.id}: ${st.leadInNm} NM before its fix, heading toward it`, () => {
      const sc = build(procId, st.id);
      const fix = resolveFixDef(sc.start.position, { navdata: NAVDATA, procedure: sc.procedure });
      const ac = sc.initial.aircraft.position;
      expect(Math.abs(distanceNm(fix, ac) - st.leadInNm!)).toBeLessThanOrEqual(0.1);
      const mv = sc.world.magVarEastDeg;
      const back = magToTrue(reciprocal(st.headingMag), mv);
      expect(Math.abs(signedAngleDiff(initialBearingTrueDeg(fix, ac), back))).toBeLessThan(0.5);
      // Flying the start heading leads straight to the fix.
      expect(
        Math.abs(signedAngleDiff(sc.initial.aircraft.headingTrueDeg, magToTrue(st.headingMag, mv))),
      ).toBeLessThan(0.01);
    });
});

describe('offset starts', () => {
  const offset = ALL.filter(([, st]) => st.offset);
  it('exist on radio and RNAV approaches', () => {
    const procs = new Set(offset.map(([id]) => id));
    expect([...procs].some((id) => id.includes('rnav'))).toBe(true);
    expect([...procs].some((id) => !id.includes('rnav'))).toBe(true);
  });
  for (const [procId, st] of offset)
    it(`${procId} ${st.id}: ${st.offset!.distanceNm} NM from its fix, not pointed at it`, () => {
      const sc = build(procId, st.id);
      const fix = resolveFixDef(sc.start.position, { navdata: NAVDATA, procedure: sc.procedure });
      const ac = sc.initial.aircraft.position;
      const mv = sc.world.magVarEastDeg;
      expect(Math.abs(distanceNm(fix, ac) - st.offset!.distanceNm)).toBeLessThanOrEqual(0.1);
      expect(
        Math.abs(
          signedAngleDiff(initialBearingTrueDeg(fix, ac), magToTrue(st.offset!.bearingMag, mv)),
        ),
      ).toBeLessThan(0.5);
      // The learner has to turn toward the fix.
      const toFix = initialBearingTrueDeg(ac, fix);
      expect(
        Math.abs(signedAngleDiff(sc.initial.aircraft.headingTrueDeg, toFix)),
      ).toBeGreaterThanOrEqual(20);
    });
});

type HoldLeg = Extract<Leg, { type: 'hold' }>;

describe('KCFO direct-skipi start', () => {
  const sc = build('kcfo-ils26', 'direct-skipi');
  const hold = sc.procedure.transitions
    .find((t) => t.id === sc.start.transition)!
    .legs.find((l): l is HoldLeg => l.type === 'hold')!;

  it('arrives over SKIPI on a heading that calls for a direct entry', () => {
    expect(hold.fix).toBe('SKIPI');
    const fix = sc.fixes.SKIPI!;
    const ac = sc.initial.aircraft.position;
    expect(Math.abs(distanceNm(fix, ac) - 8)).toBeLessThanOrEqual(0.1); // room to descend 2000 ft
    const arrivalTrue = magToTrue(sc.start.headingMag, sc.world.magVarEastDeg);
    expect(Math.abs(signedAngleDiff(initialBearingTrueDeg(ac, fix), arrivalTrue))).toBeLessThan(
      0.5,
    );
    const inboundTrue = inboundTrueAtFix(hold.course, fix, sc.world.navdata);
    expect(correctEntries(arrivalTrue, inboundTrue, hold.turn)).toEqual(['direct']);
  });

  it('perfect run: direct entry at SKIPI, ILS to DA, scores 100%', () => {
    const f = new Flight(sc);
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.send({ type: 'headingBug', deg: 180 }, { type: 'altPreselect', ft: 8000 });
    f.wait(0.1);
    f.send({ type: 'button', button: 'ALT' });
    f.descendOrClimb(8000, -1000); // from 10000: descend and maintain 8000
    // Joining at SKIPI: FQF is not needed. NAV2 → I-FTG for the localizer and DME 7.
    f.tune(2, 109.3, 263);
    f.send({ type: 'dmeSource', radio: 2 }, { type: 'standby', radio: 1, mhz: 109.3 });
    f.crossFix('SKIPI', 1.0, 600);

    // Direct entry: turn left (the holding direction) straight to the outbound heading.
    f.send({ type: 'swap', radio: 1 }, { type: 'course', radio: 1, deg: 263 });
    f.turn(83); // left, the shorter way
    f.descendOrClimb(7200, -500);
    f.wait(60);
    // Left turn back inbound with APR armed: the localizer is captured in the turn.
    f.send({ type: 'button', button: 'APR' });
    f.turn(353); // left, continuing round to the inbound course
    f.send({ type: 'headingBug', deg: 263 });
    expect(f.until(() => f.r.state.ap.lateral === 'APR', 120)).toBe(true);
    expect(f.until(() => f.progress.phase === 'ended', 1200)).toBe(true);

    const a = f.analyze();
    const summary = a.items.map((x) => `${x.status.padEnd(4)} ${x.id}: ${x.measured}`).join('\n');
    expect(
      a.items.filter((x) => x.status === 'fail').map((x) => x.id),
      summary,
    ).toEqual([]);
    expect(a.scorePct).toBe(100);
    expect(a.items.some((x) => x.id === 'ident:FQF')).toBe(false); // joins at SKIPI
    const entry = a.items.find((x) => x.id.startsWith('hold-entry:SKIPI'))!;
    expect(entry.status).toBe('pass');
    expect(entry.measured).toMatch(/^Flew direct; arriving on heading 1[78]\d° calls for direct$/);
    const legs = a.sequencer.legs.map((l) => [a.sequencer.route[l.index]!.label, l.status]);
    expect(legs).toEqual([
      ['Hold at SKIPI', 'flown'],
      ['Final approach from SKIPI', 'active'],
    ]);
  });
});
