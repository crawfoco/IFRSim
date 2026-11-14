/**
 * Local frame: east/north metres around an origin using an azimuthal-equidistant
 * projection on the WGS84 ellipsoid. Distance and bearing from the origin are exact;
 * distances between other points within 30 NM are good to ~0.002%. Used for maps,
 * debrief tracks and simple kinematics. Navigation calculations use geodesy.ts.
 */
import { DEG } from './angles';
import { METRES_PER_NM, destination, inverse, type LatLon } from './geodesy';

export interface LocalPoint {
  eastM: number;
  northM: number;
}

export class LocalFrame {
  readonly origin: LatLon;

  constructor(origin: LatLon) {
    this.origin = { ...origin };
  }

  toLocal(p: LatLon): LocalPoint {
    const { distanceM, initialBearingDeg } = inverse(this.origin, p);
    const az = initialBearingDeg * DEG;
    return { eastM: distanceM * Math.sin(az), northM: distanceM * Math.cos(az) };
  }

  toLatLon(p: LocalPoint): LatLon {
    const distM = Math.hypot(p.eastM, p.northM);
    if (distM === 0) return { ...this.origin };
    const bearingDeg = Math.atan2(p.eastM, p.northM) / DEG;
    return destination(this.origin, bearingDeg, distM / METRES_PER_NM);
  }
}
