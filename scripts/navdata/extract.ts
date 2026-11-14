/** Build IFRSim navdata from an unzipped NASR CSV cycle. CLI: run-extract.ts */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NavData } from '../../src/sim/navdata/types';
import { readRecords } from './csv';
import { isoDate } from './cycle';
import { parseAirport, parseFix, parseLocalizer, parseNavaid, parseRunwayEnd } from './nasr';
import { WANTED } from './wanted';

type Row = Record<string, string>;

interface WantedLists {
  airports: readonly string[];
  runwayEnds: readonly (readonly [string, string])[];
  navaids: readonly string[];
  localizers: readonly (readonly [string, string])[];
  fixes: readonly (readonly [string, string])[];
}

const VOR_TYPES = new Set(['VOR', 'VOR/DME', 'VORTAC']);

function exactlyOne(rows: Row[], what: string): Row {
  if (rows.length !== 1) throw new Error(`${what}: expected 1 NASR record, found ${rows.length}`);
  return rows[0]!;
}

/** Pure: build NavData from a directory of NASR CSVs. Throws if anything wanted is missing or ambiguous. */
export function buildNavData(dir: string, cycle: string, wanted: WantedLists = WANTED): NavData {
  const load = (name: string) => readRecords(readFileSync(join(dir, `${name}.csv`), 'latin1'));

  const aptRows = load('APT_BASE').filter((r) => r.SITE_TYPE_CODE === 'A');
  const airports: NavData['airports'] = {};
  for (const id of wanted.airports) {
    const apt = parseAirport(
      exactlyOne(
        aptRows.filter((r) => r.ARPT_ID === id),
        `Airport ${id}`,
      ),
    );
    airports[apt.id] = apt;
  }

  const rwyRows = load('APT_RWY_END');
  const runwayEnds = wanted.runwayEnds.map(([apt, rwy]) =>
    parseRunwayEnd(
      exactlyOne(
        rwyRows.filter((r) => r.ARPT_ID === apt && r.RWY_END_ID === rwy),
        `Runway ${apt} ${rwy}`,
      ),
    ),
  );

  const navRows = load('NAV_BASE').filter((r) => VOR_TYPES.has(r.NAV_TYPE ?? ''));
  const navaids: NavData['navaids'] = {};
  for (const id of wanted.navaids) {
    navaids[id] = parseNavaid(
      exactlyOne(
        navRows.filter((r) => r.NAV_ID === id),
        `Navaid ${id}`,
      ),
    );
  }

  const ilsBase = load('ILS_BASE');
  const ilsGs = load('ILS_GS');
  const ilsDme = load('ILS_DME');
  const localizers: NavData['localizers'] = {};
  for (const [id, apt] of wanted.localizers) {
    const match = (r: Row) => r.ILS_LOC_ID === id && r.ARPT_ID === apt;
    const base = exactlyOne(ilsBase.filter(match), `Localizer I-${id}`);
    const loc = parseLocalizer(base, ilsGs.find(match), ilsDme.find(match));
    localizers[loc.id] = loc;
  }

  const fixRows = load('FIX_BASE');
  const fixes: NavData['fixes'] = {};
  for (const [id, state] of wanted.fixes) {
    fixes[id] = parseFix(
      exactlyOne(
        fixRows.filter((r) => r.FIX_ID === id && r.STATE_CODE === state),
        `Fix ${id}/${state}`,
      ),
    );
  }

  const effDates = new Set(aptRows.slice(0, 50).map((r) => r.EFF_DATE));
  const expected = cycle.replaceAll('-', '/');
  if (!effDates.has(expected)) {
    throw new Error(
      `NASR files in ${dir} are not cycle ${cycle} (EFF_DATE ${[...effDates].join(', ')})`,
    );
  }

  return {
    source: { dataset: 'FAA NASR', cycle, extracted: isoDate(new Date()) },
    airports,
    runwayEnds,
    navaids,
    localizers,
    fixes,
  };
}
