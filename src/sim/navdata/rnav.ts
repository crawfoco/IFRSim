/** Look up RNAV waypoints (from the FAA CIFP extract) by ident. */
import type { NavData, RnavWaypoint } from './types';

const cache = new WeakMap<NavData, Map<string, RnavWaypoint | 'ambiguous'>>();

function index(nav: NavData): Map<string, RnavWaypoint | 'ambiguous'> {
  let m = cache.get(nav);
  if (m) return m;
  m = new Map();
  for (const wp of Object.values(nav.cifp?.waypoints ?? {})) {
    const prev = m.get(wp.id);
    if (prev === undefined) m.set(wp.id, wp);
    else if (
      prev === 'ambiguous' ||
      prev.position.latDeg !== wp.position.latDeg ||
      prev.position.lonDeg !== wp.position.lonDeg
    )
      m.set(wp.id, 'ambiguous');
  }
  cache.set(nav, m);
  return m;
}

/**
 * The RNAV waypoint (terminal or enroute waypoint, VOR, or runway threshold "RW18") with this
 * ident. Throws if it is unknown or if two different waypoints share the ident.
 */
export function rnavWaypoint(nav: NavData, id: string): RnavWaypoint {
  const wp = index(nav).get(id);
  if (wp === undefined) throw new Error(`unknown RNAV waypoint ${id}`);
  if (wp === 'ambiguous') throw new Error(`RNAV waypoint ${id} is ambiguous in the CIFP extract`);
  return wp;
}

export function hasRnavWaypoint(nav: NavData, id: string): boolean {
  const wp = index(nav).get(id);
  return wp !== undefined && wp !== 'ambiguous';
}

const scoped = new WeakMap<NavData, Map<string, NavData>>();

/**
 * The navdata as one airport's procedures see it: terminal waypoints and runway thresholds of
 * other airports left out (CIFP keys them "KCPR/RW03"), so idents shared between airports
 * (RW03 at KCPR and KCNY) resolve to this airport's. `icao` is e.g. "KCPR".
 */
export function navdataForAirport(nav: NavData, icao: string): NavData {
  if (!nav.cifp) return nav;
  let m = scoped.get(nav);
  if (!m) scoped.set(nav, (m = new Map()));
  const hit = m.get(icao);
  if (hit) return hit;
  const waypoints = Object.fromEntries(
    Object.entries(nav.cifp.waypoints).filter(
      ([key]) => !key.includes('/') || key.startsWith(`${icao}/`),
    ),
  );
  const out: NavData = { ...nav, cifp: { ...nav.cifp, waypoints } };
  m.set(icao, out);
  return out;
}

/** `navdataForAirport` for a procedure's airport (FAA id, e.g. "CPR"). */
export function navdataForProcedure(nav: NavData, p: { airport: string }): NavData {
  const icao = nav.airports[p.airport]?.id;
  return icao ? navdataForAirport(nav, icao) : nav;
}
