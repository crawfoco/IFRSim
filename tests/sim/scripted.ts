/** A scripted learner for integration tests: drives the sim with real commands. */
import { expect } from 'vitest';
import { signedAngleDiff } from '../../src/sim/geo/angles';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { SimRunner } from '../../src/sim/recorder';
import {
  initialProgress,
  updateProgress,
  type ScenarioProgress,
} from '../../src/sim/scenario/progress';
import type { Scenario } from '../../src/sim/scenario/scenario';
import { analyzeFlight } from '../../src/sim/scoring/analyze';
import { sense } from '../../src/sim/sensors';
import type { Command } from '../../src/sim/state';

export class Flight {
  r: SimRunner;
  progress: ScenarioProgress = initialProgress();
  constructor(public sc: Scenario) {
    this.r = new SimRunner(sc.initial, sc.world);
  }
  send(...cmds: Command[]) {
    cmds.forEach((c) => this.r.enqueue(c));
  }
  /** Step until `done` (checked every step) or the time limit; returns success. */
  until(done: () => boolean, maxS = 1200): boolean {
    for (let i = 0; i < maxS * 20; i++) {
      if (done()) return true;
      this.r.stepOnce();
      this.progress = updateProgress(this.progress, this.r.state, this.sc);
    }
    return done();
  }
  /** Fly on for a number of seconds. */
  wait(seconds: number) {
    this.until(() => false, seconds);
  }
  get sensors() {
    return sense(this.r.state, this.sc.world);
  }
  get hdgMag() {
    return this.sensors.headingMagDeg;
  }
  get alt() {
    return this.r.state.aircraft.altitudeFt;
  }
  /** Turn in HDG mode through intermediate bugs (forces the turn direction). */
  turn(...bugs: number[]) {
    const queued = this.r.pendingCommands.some((c) => c.type === 'button' && c.button === 'HDG');
    if (this.r.state.ap.lateral !== 'HDG' && !queued) this.send({ type: 'button', button: 'HDG' });
    for (const b of bugs) {
      this.send({ type: 'headingBug', deg: b });
      expect(this.until(() => Math.abs(signedAngleDiff(this.hdgMag, b)) < 3, 120)).toBe(true);
    }
  }
  /** VS mode to a target altitude (ALT arms and captures it). */
  descendOrClimb(toFt: number, fpm: number) {
    this.send({ type: 'altPreselect', ft: toFt }, { type: 'button', button: 'VS' });
    this.wait(0.1);
    this.send({ type: 'vsTarget', fpm });
  }
  /** Tune a radio's active frequency (via standby + swap) and listen to the ident. */
  tune(radio: 1 | 2, mhz: number, courseDeg?: number) {
    this.send({ type: 'standby', radio, mhz }, { type: 'swap', radio });
    if (courseDeg !== undefined) this.send({ type: 'course', radio, deg: courseDeg });
    this.wait(0.1);
    this.send({ type: 'ident', radio });
    this.wait(0.1);
  }
  distTo(fix: string) {
    return distanceNm(this.r.state.aircraft.position, this.sc.fixes[fix]!);
  }
  /** Fly until a fix is crossed (closest approach passed within `withinNm`). */
  crossFix(fix: string, withinNm = 1, maxS = 1200) {
    let last = Infinity;
    expect(
      this.until(() => {
        const d = this.distTo(fix);
        const crossed = d > last && d < withinNm;
        last = d;
        return crossed;
      }, maxS),
    ).toBe(true);
  }
  analyze() {
    return analyzeFlight(this.sc, this.r.log, this.r.state.tick);
  }
}
