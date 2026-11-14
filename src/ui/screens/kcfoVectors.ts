/**
 * The M3 demo scenario: radar vectors to the KCFO ILS RWY 26. Temporary until the
 * procedure files and scenario engine (M4) define start conditions.
 */
import navdataJson from '../../procedures/navdata.json';
import { magToTrue, normalize360 } from '../../sim/geo/angles';
import { destination } from '../../sim/geo/geodesy';
import type { StartCondition } from '../../sim/loop';
import type { NavData } from '../../sim/navdata/types';
import { buildWorld } from '../../sim/world';

const nav = navdataJson as NavData;
const loc = nav.localizers['I-FTG'];
if (!loc) throw new Error('I-FTG missing from navdata');

export const KCFO_DA_FT = 5689;
export const KCFO_WORLD = buildWorld(nav, { magVarEastDeg: nav.airports.KCFO?.magVarEastDeg ?? 8 });

const outboundTrue = magToTrue(normalize360(loc.courseMagDeg + 180), loc.magVarEastDeg);

/** 16 NM from the localizer antenna, about 3 NM south of the final approach course. */
export const KCFO_VECTORS_START: StartCondition = {
  position: destination(loc.position, outboundTrue + 11, 16),
  altitudeFt: 8000,
  headingMagDeg: 330,
  iasKt: 100,
  nav1MHz: 116.3,
  nav2MHz: 116.3,
  obs1Deg: 0,
  obs2Deg: 0,
};

export const KCFO_BRIEFING = {
  title: 'KCFO ILS RWY 26 — radar vectors',
  clearance:
    'Turn left heading 293, maintain 7000 until established on the localizer, cleared ILS runway 26 approach.',
  facts: [
    'Localizer I-FTG 109.3, inbound course 263°',
    'Glideslope in service',
    `Decision altitude ${KCFO_DA_FT.toLocaleString('en-US')} ft (straight-in ILS)`,
    'You start at 8000 ft, heading 330, autopilot off, NAV1 on FQF 116.3',
  ],
};
