import { describe, expect, it } from 'vitest';
import navdataJson from '../../src/procedures/navdata.json';
import type { NavData } from '../../src/sim/navdata/types';
import { distanceNm } from '../../src/sim/geo/geodesy';

const navdata = navdataJson as unknown as NavData;
const cifp = navdata.cifp!;

describe('CIFP extract in navdata.json', () => {
  it('has the nine V3 RNAV approaches from one cycle', () => {
    expect(cifp.cycle).toBe('2611');
    expect(Object.keys(cifp.approaches).sort()).toEqual([
      'KALS R02',
      'KAPA R28',
      'KBFF R12',
      'KCNY R03',
      'KCOS R31',
      'KCPR R03',
      'KLAA R18',
      'KOGA R08',
      'KPUB R26L',
    ]);
  });

  it('every RNAV waypoint is within 0.01 NM of the same fix in NASR', () => {
    for (const [key, wp] of Object.entries(cifp.waypoints)) {
      if (wp.region === 'NAVAID' || key.includes('/RW')) continue;
      const nasr = navdata.fixes[wp.id];
      expect(nasr, `${wp.id} missing from the NASR extract`).toBeDefined();
      expect(distanceNm(wp.position, nasr!.position), wp.id).toBeLessThan(0.01);
    }
  });

  it('VOR waypoints match the NASR navaid', () => {
    for (const wp of Object.values(cifp.waypoints).filter((w) => w.region === 'NAVAID')) {
      const nav = navdata.navaids[wp.id];
      expect(nav, wp.id).toBeDefined();
      expect(distanceNm(wp.position, nav!.position), wp.id).toBeLessThan(0.01);
    }
  });

  it('runway waypoints are within 0.01 NM of the NASR threshold, and the path point LTP too (FTP for an offset final)', () => {
    for (const a of Object.values(cifp.approaches)) {
      const rwy = a.runway.replace(/^RW0?/, '');
      const end = navdata.runwayEnds.find(
        (r) => `K${r.airport}` === a.airport && r.runway.replace(/^0/, '') === rwy,
      );
      expect(end, a.airport + a.runway).toBeDefined();
      const thr = end!.displacedThreshold?.position ?? end!.threshold;
      const wp = cifp.waypoints[`${a.airport}/${a.runway}`]!;
      expect(distanceNm(wp.position, thr), `${a.airport} ${a.runway}`).toBeLessThan(0.01);
      // An offset final (KCNY) ends at a waypoint MAP; its FAS data block uses a fictitious
      // threshold point (FTP) on the final course, not the runway threshold.
      const offset = !a.routes.some((r) => r.legs.some((g) => g.fixSection === 'PG'));
      const ltpNm = distanceNm(a.pathPoint!.ltp, thr);
      if (offset) expect(ltpNm, `${a.airport} FTP`).toBeLessThan(0.5);
      else expect(ltpNm, `${a.airport} LTP`).toBeLessThan(0.01);
    }
  });
});
