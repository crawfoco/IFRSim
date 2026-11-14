import { describe, expect, it } from 'vitest';
import { METRES_PER_NM, destination, distanceNm } from '../../../src/sim/geo/geodesy';
import { LocalFrame } from '../../../src/sim/geo/projection';

const origin = { latDeg: 40.4333, lonDeg: -104.6333 }; // KGXY area

describe('LocalFrame (east/north metres around an origin)', () => {
  const frame = new LocalFrame(origin);

  it('maps the origin to (0, 0)', () => {
    const p = frame.toLocal(origin);
    expect(p.eastM).toBeCloseTo(0, 9);
    expect(p.northM).toBeCloseTo(0, 9);
  });

  it('round-trips lat/lon exactly', () => {
    const q = { latDeg: 40.71, lonDeg: -104.21 };
    const back = frame.toLatLon(frame.toLocal(q));
    expect(back.latDeg).toBeCloseTo(q.latDeg, 10);
    expect(back.lonDeg).toBeCloseTo(q.lonDeg, 10);
  });

  it('puts north on +north and east on +east', () => {
    const n = frame.toLocal(destination(origin, 0, 5));
    const e = frame.toLocal(destination(origin, 90, 5));
    expect(n.northM).toBeGreaterThan(9000);
    expect(Math.abs(n.eastM)).toBeLessThan(1);
    expect(e.eastM).toBeGreaterThan(9000);
    // A geodesic heading due east is on the projection's east axis by construction.
    expect(Math.abs(e.northM)).toBeLessThan(1e-6);
  });

  it('keeps distances from the origin within 0.1% out to 30 NM in every direction', () => {
    for (let bearing = 0; bearing < 360; bearing += 15) {
      for (const nm of [1, 10, 20, 30]) {
        const p = destination(origin, bearing, nm);
        const { eastM, northM } = frame.toLocal(p);
        const projectedNm = Math.hypot(eastM, northM) / METRES_PER_NM;
        expect(Math.abs(projectedNm - nm) / nm).toBeLessThan(0.001);
      }
    }
  });

  it('keeps distances between two off-origin points within 0.1%', () => {
    const a = destination(origin, 200, 25);
    const b = destination(origin, 20, 25);
    const la = frame.toLocal(a);
    const lb = frame.toLocal(b);
    const projectedNm = Math.hypot(la.eastM - lb.eastM, la.northM - lb.northM) / METRES_PER_NM;
    const trueNm = distanceNm(a, b);
    expect(Math.abs(projectedNm - trueNm) / trueNm).toBeLessThan(0.001);
  });
});
