/**
 * Minimal reader for the FAA CIFP (ARINC 424-18 fixed-width records, public domain).
 * Dev-time only: it extracts the RNAV approaches IFRSim uses, the waypoints their legs
 * reference, and each approach's path point (FAS data block) into navdata.json.
 *
 * Column numbers in comments are 1-based, as in the ARINC 424 specification.
 */
import type {
  CifpApproach,
  CifpData,
  CifpLeg,
  CifpPathPoint,
  CifpRoute,
  RnavWaypoint,
} from '../../src/sim/navdata/types';
import type { LatLon } from '../../src/sim/geo/geodesy';

/** Columns `from`..`to` (1-based, inclusive), trimmed. */
export function col(line: string, from: number, to: number): string {
  return line.slice(from - 1, to).trim();
}

/** "N38042949" / "W102412240": degrees, minutes, seconds and hundredths of a second. */
export function parseLatLon(lat: string, lon: string): LatLon {
  return { latDeg: parseCoord(lat, 2), lonDeg: parseCoord(lon, 3) };
}

/** High-precision path point form: "N3804294875" / "W10241223985" (ten-thousandths of a second). */
export function parseLatLonHp(lat: string, lon: string): LatLon {
  return { latDeg: parseCoord(lat, 2, 4), lonDeg: parseCoord(lon, 3, 4) };
}

function parseCoord(s: string, degDigits: number, fracDigits = 2): number {
  const hemi = s[0];
  const body = s.slice(1);
  const deg = Number(body.slice(0, degDigits));
  const min = Number(body.slice(degDigits, degDigits + 2));
  const sec =
    Number(body.slice(degDigits + 2, degDigits + 4)) +
    Number(body.slice(degDigits + 4, degDigits + 4 + fracDigits)) / 10 ** fracDigits;
  if (
    ![deg, min, sec].every(Number.isFinite) ||
    (hemi !== 'N' && hemi !== 'S' && hemi !== 'E' && hemi !== 'W')
  )
    throw new Error(`Bad ARINC 424 coordinate "${s}"`);
  const v = deg + min / 60 + sec / 3600;
  return hemi === 'S' || hemi === 'W' ? -v : v;
}

/** "E0062" → +6.2, "W0105" → −10.5 (tenths of a degree). */
export function parseMagVar(s: string): number {
  const v = Number(s.slice(1)) / 10;
  return s[0] === 'W' ? -v : v;
}

function numOrNull(s: string, scale = 1): number | null {
  if (s === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v / scale : null;
}

/** The cycle ("2611") from the HDR01 record. */
export function cifpCycle(text: string): string {
  const hdr = text.split(/\r?\n/, 1)[0] ?? '';
  const m = /^HDR01FAACIFP18\s+\S+?(\d{4})\s/.exec(hdr);
  if (!m) throw new Error('Not an FAA CIFP file (no HDR01 record)');
  return m[1]!;
}

const isApproachLeg = (l: string) => l.startsWith('SUSAP ') && l[12] === 'F';

/** One primary (continuation 0 or 1) approach leg record (section P, subsection F). */
export function parseLeg(line: string): CifpLeg {
  const desc = line.slice(39, 43); // 40-43 waypoint description code
  const holdField = col(line, 75, 78);
  const isTime = holdField.startsWith('T');
  const altDesc = col(line, 83, 83);
  const angle = numOrNull(col(line, 103, 106), 100);
  return {
    seq: Number(col(line, 27, 29)),
    fix: col(line, 30, 34) || null,
    fixSection: col(line, 37, 38) || null,
    descriptor: desc,
    flyOver: desc[1] === 'Y' || desc[1] === 'B',
    role: roleOf(desc[3] ?? ' '),
    missedStart: desc[2] === 'M',
    turn: ((t) => (t === 'L' || t === 'R' ? t : null))(col(line, 44, 44)),
    rnpNm: ((s) => (s.length === 3 ? Number(s.slice(0, 2)) / 10 ** Number(s[2]) : null))(
      col(line, 45, 47),
    ),
    pathTerminator: col(line, 48, 49),
    recommendedNavaid: col(line, 51, 54) || null,
    courseMagDeg: numOrNull(col(line, 71, 74), 10),
    distanceNm: isTime ? null : numOrNull(holdField, 10),
    holdMinutes: isTime ? numOrNull(holdField.slice(1), 10) : null,
    altDesc: altDesc === '' ? null : altDesc,
    alt1Ft: numOrNull(col(line, 85, 89)),
    alt2Ft: numOrNull(col(line, 90, 94)),
    speedKt: numOrNull(col(line, 100, 102)),
    verticalAngleDeg: angle,
  };
}

function roleOf(c: string): CifpLeg['role'] {
  switch (c) {
    case 'A':
      return 'IAF';
    case 'B':
      return 'IF';
    case 'C':
      return 'IAF-hold';
    case 'D':
      return 'IAF-FACF';
    case 'I':
      return 'FACF';
    case 'F':
      return 'FAF';
    case 'M':
      return 'MAP';
    case 'H':
      return 'hold';
    default:
      return null;
  }
}

/** Path point record (section P, subsection P), continuation 1. */
export function parsePathPoint(line: string, cont: string | undefined): CifpPathPoint {
  const tch = Number(col(line, 103, 108)) / 10;
  const tchUnits = col(line, 109, 109);
  return {
    runway: col(line, 20, 24),
    referencePathId: col(line, 33, 36),
    ltp: parseLatLonHp(col(line, 38, 48), col(line, 49, 60)),
    ellipsoidHeightM: Number(col(line, 61, 66)) / 10,
    gpaDeg: Number(col(line, 67, 70)) / 100,
    fpap: parseLatLonHp(col(line, 71, 81), col(line, 82, 93)),
    courseWidthM: Number(col(line, 94, 98)) / 100,
    tchFt: tchUnits === 'M' ? tch / 0.3048 : tch,
    ...(cont ? { approachLabel: col(cont, 47, 56) } : {}),
  };
}

/** Terminal (PC) or enroute (EA) waypoint. */
export function parseWaypoint(line: string): RnavWaypoint {
  return {
    id: col(line, 14, 18),
    region: col(line, 7, 10),
    position: parseLatLon(col(line, 33, 41), col(line, 42, 51)),
    magVarEastDeg: parseMagVar(col(line, 75, 79)),
  };
}

export interface WantedApproach {
  airport: string; // ICAO, e.g. KLAA
  ident: string; // CIFP procedure ident, e.g. R18
}

/**
 * Pure: pull the wanted approaches out of a CIFP file, with every waypoint, navaid or runway
 * their legs name. Throws if an approach or a referenced fix is missing.
 */
export function buildCifp(text: string, wanted: readonly WantedApproach[]): CifpData {
  const lines = text.split(/\r?\n/);
  const approaches: Record<string, CifpApproach> = {};
  const needed = new Map<string, { id: string; section: string; airport: string }>();

  for (const w of wanted) {
    const prefix = `SUSAP ${w.airport.padEnd(4)}`;
    const ident = w.ident.padEnd(6);
    const recs = lines.filter(
      (l) => l.startsWith(prefix) && isApproachLeg(l) && l.slice(13, 19) === ident,
    );
    if (recs.length === 0) throw new Error(`Approach ${w.airport} ${w.ident} not in CIFP`);
    const routes = new Map<string, CifpRoute>();
    const lines_: string[] = [];
    for (const l of recs) {
      const cont = l[38];
      const key = `${l[19]}|${col(l, 21, 25)}`;
      if (cont === '0' || cont === '1') {
        let r = routes.get(key);
        if (!r) {
          r = { routeType: l[19]!, transition: col(l, 21, 25), legs: [] };
          routes.set(key, r);
        }
        const leg = parseLeg(l);
        r.legs.push(leg);
        if (leg.fix && leg.fixSection)
          needed.set(`${leg.fixSection}|${w.airport}|${leg.fix}`, {
            id: leg.fix,
            section: leg.fixSection,
            airport: w.airport,
          });
      } else if (l[39] === 'W') {
        // Application type W: the minimums lines the approach publishes (LPV, LNAV/VNAV, LNAV, LP).
        // Each field: an authorisation flag (A authorised, N not) and the line's name.
        for (const c of [41, 52, 63, 74, 85]) {
          const label = col(l, c + 1, c + 10);
          if (l[c - 1] === 'A' && label) lines_.push(label);
        }
      }
    }
    // The runway: the final's runway fix, or (an offset final ending at a waypoint MAP, KCNY)
    // the runway its path point (FAS data block) is for.
    const allPp = lines.filter(
      (l) => l.startsWith(prefix) && l[12] === 'P' && l.slice(13, 19) === ident,
    );
    const runway = ([...routes.values()].flatMap((r) => r.legs).find((g) => g.fixSection === 'PG')
      ?.fix ?? (allPp[0] ? col(allPp[0], 20, 24) : '')) as string;
    const ppRecs = allPp.filter((l) => col(l, 20, 24) === runway);
    // The runway waypoint, even when no leg flies to it (an offset final).
    if (runway)
      needed.set(`PG|${w.airport}|${runway}`, { id: runway, section: 'PG', airport: w.airport });
    const pp1 = ppRecs.find((l) => l[26] === '1');
    const pp2 = ppRecs.find((l) => l[26] === '2');
    approaches[`${w.airport} ${w.ident}`] = {
      airport: w.airport,
      ident: w.ident,
      runway,
      minimumsLines: lines_,
      routes: [...routes.values()],
      ...(pp1 ? { pathPoint: parsePathPoint(pp1, pp2) } : {}),
    };
  }

  const waypoints: Record<string, RnavWaypoint> = {};
  for (const n of needed.values()) {
    let rec: string | undefined;
    if (n.section === 'PC')
      rec = lines.find(
        (l) =>
          l.startsWith(`SUSAP ${n.airport.padEnd(4)}`) && l[12] === 'C' && col(l, 14, 18) === n.id,
      );
    else if (n.section === 'EA')
      rec = lines.find((l) => l.startsWith('SUSAEA') && col(l, 14, 18) === n.id);
    else if (n.section === 'PG')
      rec = lines.find(
        (l) =>
          l.startsWith(`SUSAP ${n.airport.padEnd(4)}`) && l[12] === 'G' && col(l, 14, 18) === n.id,
      );
    else if (n.section === 'D ' || n.section === 'D')
      rec = lines.find((l) => l.startsWith('SUSAD ') && col(l, 14, 17) === n.id);
    if (!rec) throw new Error(`Fix ${n.id} (section ${n.section}) for ${n.airport} not in CIFP`);
    const wp = n.section.startsWith('D')
      ? {
          id: n.id,
          region: 'NAVAID',
          position: parseLatLon(col(rec, 33, 41), col(rec, 42, 51)),
          magVarEastDeg: parseMagVar(col(rec, 75, 79)),
        }
      : n.section === 'PG'
        ? {
            id: n.id,
            region: n.airport,
            position: parseLatLon(col(rec, 33, 41), col(rec, 42, 51)),
            magVarEastDeg: 0,
          }
        : parseWaypoint(rec);
    // Waypoint idents are not unique: key by airport for terminal waypoints and runways.
    const key = n.section === 'PC' || n.section === 'PG' ? `${n.airport}/${n.id}` : n.id;
    waypoints[key] = wp;
  }

  return { dataset: 'FAA CIFP', cycle: cifpCycle(text), approaches, waypoints };
}
