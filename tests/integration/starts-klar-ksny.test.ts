/**
 * Start conditions without their own test: KLAR VOR/DME 30 from the POVOH arc and from
 * FLEMS (heading 337 to join the 292° inbound, then a missed approach with climb-in-hold
 * at LAR), and KSNY VOR/DME 13 from the OGJUN arc and direct SNY (procedure turn at
 * CHAKO). Each scripted run is perfect and scores 100%.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../src/procedures';
import { normalize360 } from '../../src/sim/geo/angles';
import { buildScenario } from '../../src/sim/scenario/scenario';
import type { FlightAnalysis } from '../../src/sim/scoring/analyze';
import { Flight } from '../sim/scripted';

const failed = (a: FlightAnalysis) => a.items.filter((x) => x.status === 'fail').map((x) => x.id);
const summary = (a: FlightAnalysis) =>
  a.items.map((x) => `${x.status.padEnd(4)} ${x.id}: ${x.measured}`).join('\n');
const ids = (a: FlightAnalysis) => a.items.map((x) => x.id);
const item = (a: FlightAnalysis, prefix: string) => a.items.find((x) => x.id.startsWith(prefix))!;

const flight = (procId: string, startId: string, ceiling: 'above' | 'below') =>
  new Flight(
    buildScenario(procedureById(procId)!, NAVDATA, { startId, ceiling, gsOutOfService: false }),
  );

/** Wait for the VOR course to be captured and centred (NAV active, < 1° deviation). */
function untilCentred(f: Flight, maxS = 600) {
  const dev = () => Math.abs(f.sensors.nav1.indication?.deviationDeg ?? 10);
  expect(f.until(() => f.r.state.ap.lateral === 'NAV' && dev() < 1, maxS)).toBe(true);
}

/** NAV direct to a VOR: centre the needle with a TO indication and track it. */
function direct(f: Flight, navaid: string) {
  const deg = Math.round(normalize360(f.radialFrom(navaid).radial + 180));
  f.send({ type: 'course', radio: 1, deg }, { type: 'button', button: 'NAV' });
}

/** KLAR inbound 292° from ECECU: DUCBE, HEMBI (FAF), GARBE, then level at the MDA. */
function klarFinal(f: Flight) {
  f.crossFix('ECECU', 1.5, 900);
  f.descendOrClimb(10200, -600); // to DUCBE
  f.crossFix('DUCBE', 1.0, 600);
  f.descendOrClimb(9900, -600); // to HEMBI (FAF)
  f.crossFix('HEMBI', 1.0, 600);
  f.descendOrClimb(8300, -800); // to GARBE (8220)
  f.crossFix('GARBE', 1.0, 600);
  f.descendOrClimb(7600, -700); // the MDA
}

/** KSNY inbound 130° to CHAKO (FAF, 5800), then level at the MDA (4700). */
function ksnyFinal(f: Flight) {
  f.descendOrClimb(5800, -500);
  f.crossFix('CHAKO', 1.0, 900);
  f.descendOrClimb(4700, -700);
}

describe('KLAR VOR/DME 30 starts', () => {
  it('POVOH 18 DME arc (NoPT) to a landing scores 100%', () => {
    const f = flight('klar-vor30', 'povoh-arc', 'above');
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.tune(1, 117.6, 235); // LAR, inbound on R-055
    f.send({ type: 'button', button: 'NAV' });
    f.descendOrClimb(10600, -500);
    f.untilDme('LAR', 18.5, false, 600);
    f.flyArc('LAR', 18, 'R', 109); // clockwise via JESAR, lead 3° before R-112
    f.send({ type: 'course', radio: 1, deg: 292 });
    f.turn(262); // 30° intercept onto the 292° inbound course
    f.send({ type: 'button', button: 'NAV' });
    untilCentred(f);
    klarFinal(f);
    expect(f.until(() => f.progress.phase === 'ended', 600)).toBe(true);
    expect(f.progress.outcome).toBe('landed');
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(ids(a), summary(a)).toEqual(
      expect.arrayContaining(['ident:LAR', 'fix-order', 'segment-minimums', 'final-course']),
    );
    expect(item(a, 'fix-order').measured, summary(a)).toBe('JESAR → ECECU → DUCBE → HEMBI');
    expect(
      ids(a).some((x) => x.startsWith('procedure-turn')),
      summary(a),
    ).toBe(false);
  });

  it('FLEMS heading 337, missed approach and climb-in-hold at LAR scores 100%', () => {
    const f = flight('klar-vor30', 'flems', 'below');
    f.send({ type: 'button', button: 'AP' });
    f.turn(337); // fly the charted heading
    f.send({ type: 'altPreselect', ft: 10600 });
    f.wait(0.1);
    f.send({ type: 'button', button: 'ALT' });
    f.tune(1, 117.6, 292); // LAR, the 292° inbound course (nav1 starts on 113.1)
    f.send({ type: 'button', button: 'NAV' }); // armed: 45° intercept from heading 337
    untilCentred(f, 900);
    klarFinal(f);
    // Level at the MDA to the MAP (LAR 3.1 DME), no runway: go around.
    expect(f.until(() => f.distTo('LAR 3.1') < 0.2, 600)).toBe(true);
    expect(f.progress.phase).toBe('approach');
    f.goAround(9600);
    expect(f.progress.phase).toBe('missed');

    // Missed: climb to 9600 direct LAR (straight ahead on the 292° course).
    f.send({ type: 'button', button: 'NAV' });
    f.crossFix('LAR', 1.0, 600);
    // Hold at LAR, inbound 125, left turns: arriving on ~292 → parallel entry.
    f.turn(305); // outbound on the non-holding side
    f.wait(60);
    f.turn(35, 155); // turn right, back toward the holding side
    direct(f, 'LAR'); // and straight back to the fix
    f.crossFix('LAR', 1.0, 600); // established
    // One racetrack circuit: left to the outbound leg, a minute, left back inbound.
    f.turn(70, 305);
    f.wait(68); // the timing starts once level outbound past abeam
    f.turn(215, 125);
    direct(f, 'LAR');
    expect(f.until(() => f.progress.phase === 'ended', 600)).toBe(true);
    expect(f.progress.outcome).toBe('missedComplete');
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(ids(a), summary(a)).toEqual(
      expect.arrayContaining([
        'ident:LAR',
        'fix-order',
        'final-course',
        'missed-approach',
        'hold-timing:LAR:6',
        'climb-in-hold:LAR',
      ]),
    );
    expect(item(a, 'fix-order').measured, summary(a)).toBe('ECECU → DUCBE → HEMBI → LAR');
    expect(item(a, 'hold-entry:LAR').measured, summary(a)).toMatch(/^Flew parallel/);
    expect(item(a, 'climb-in-hold:LAR').measured, summary(a)).toMatch(/climb in hold to 9,600/);
  });
});

describe('KSNY VOR/DME 13 starts', () => {
  it('OGJUN 11 DME arc (NoPT) to a landing scores 100%', () => {
    const f = flight('ksny-vor13', 'ogjun-arc', 'above');
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.tune(1, 115.9, 22); // SNY, inbound on R-202 (nav1 starts on 114.4)
    f.send({ type: 'button', button: 'NAV' });
    f.descendOrClimb(6200, -500);
    f.untilDme('SNY', 11.5, false, 600);
    f.flyArc('SNY', 11, 'R', 305); // clockwise through west, lead 5° before R-310
    f.send({ type: 'course', radio: 1, deg: 130 });
    f.turn(100); // 30° intercept onto the 130° inbound course
    f.send({ type: 'button', button: 'NAV' });
    f.crossFix('JUNAD', 3.0, 300);
    ksnyFinal(f);
    expect(f.until(() => f.progress.phase === 'ended', 600)).toBe(true);
    expect(f.progress.outcome).toBe('landed');
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(ids(a), summary(a)).toEqual(
      expect.arrayContaining(['ident:SNY', 'fix-order', 'segment-minimums', 'final-course']),
    );
    expect(item(a, 'fix-order').measured, summary(a)).toBe('JUNAD → CHAKO');
  });

  it('direct SNY, R-310 outbound and procedure turn at CHAKO to a landing scores 100%', () => {
    const f = flight('ksny-vor13', 'direct-sny', 'above');
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.tune(1, 115.9, 320); // SNY, inbound on R-140
    f.send({ type: 'button', button: 'NAV' });
    f.descendOrClimb(6200, -500);
    f.crossFix('SNY', 1.0, 900);
    // Outbound on R-310 to CHAKO at 6200.
    f.send({ type: 'course', radio: 1, deg: 310 });
    f.turn(295);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.r.state.ap.lateral === 'NAV', 600)).toBe(true);
    f.crossFix('CHAKO', 1.0, 900);
    // Procedure turn: a minute outbound, left to 265 for a minute, right turn to 085.
    f.wait(60);
    f.turn(265);
    f.wait(60);
    f.turn(355, 85);
    f.send({ type: 'course', radio: 1, deg: 130 }, { type: 'button', button: 'NAV' });
    untilCentred(f);
    ksnyFinal(f);
    expect(f.until(() => f.progress.phase === 'ended', 600)).toBe(true);
    expect(f.progress.outcome).toBe('landed');
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(ids(a), summary(a)).toEqual(
      expect.arrayContaining(['ident:SNY', 'fix-order', 'procedure-turn:CHAKO:1', 'final-course']),
    );
    expect(item(a, 'procedure-turn:CHAKO').measured, summary(a)).toMatch(/^Left side/);
  });
});
