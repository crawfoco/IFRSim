/** Map NASR CSV records to IFRSim navdata types. Column names per the NASR CSV data structure files. */
import type { LatLon } from '../../src/sim/geo/geodesy';
import type {
  Airport,
  Fix,
  Localizer,
  Navaid,
  RunwayEnd,
  ServiceVolume,
  VorType,
} from '../../src/sim/navdata/types';

type Row = Record<string, string>;

function field(row: Row, name: string): string {
  const v = row[name];
  if (v === undefined) throw new Error(`NASR column ${name} missing`);
  return v;
}

function num(row: Row, name: string): number {
  const raw = field(row, name);
  const v = Number(raw);
  if (raw === '' || !Number.isFinite(v))
    throw new Error(`NASR column ${name}: not a number: "${raw}"`);
  return v;
}

function optNum(row: Row, name: string): number | undefined {
  const raw = row[name];
  return raw === undefined || raw === '' ? undefined : num(row, name);
}

function latLon(row: Row, latCol = 'LAT_DECIMAL', lonCol = 'LONG_DECIMAL'): LatLon {
  return { latDeg: num(row, latCol), lonDeg: num(row, lonCol) };
}

/** NASR gives unsigned variation plus E/W; return east-positive. */
function variation(row: Row, valueCol: string, hemiCol: string): number {
  const v = num(row, valueCol);
  const hemi = field(row, hemiCol);
  if (hemi !== 'E' && hemi !== 'W')
    throw new Error(`NASR column ${hemiCol}: bad hemisphere "${hemi}"`);
  return hemi === 'W' ? -v : v;
}

const VOR_TYPES: readonly VorType[] = ['VOR', 'VOR/DME', 'VORTAC'];

export function parseNavaid(row: Row): Navaid {
  const type = field(row, 'NAV_TYPE');
  if (!(VOR_TYPES as readonly string[]).includes(type)) {
    throw new Error(`Navaid ${field(row, 'NAV_ID')}: unsupported type ${type}`);
  }
  const altCode = field(row, 'ALT_CODE'); // VT / VL / VH
  const sv = altCode.slice(-1);
  if (sv !== 'T' && sv !== 'L' && sv !== 'H') {
    throw new Error(`Navaid ${field(row, 'NAV_ID')}: bad ALT_CODE ${altCode}`);
  }
  const nav: Navaid = {
    id: field(row, 'NAV_ID'),
    name: field(row, 'NAME'),
    type: type as VorType,
    position: latLon(row),
    elevationFt: num(row, 'ELEV'),
    freqMHz: num(row, 'FREQ'),
    declinationEastDeg: variation(row, 'MAG_VARN', 'MAG_VARN_HEMIS'),
    declinationYear: num(row, 'MAG_VARN_YEAR'),
    serviceVolume: sv as ServiceVolume,
  };
  const chan = row.CHAN;
  if (chan) nav.dmeChannel = chan;
  if (row.TACAN_DME_LAT_DECIMAL && row.TACAN_DME_LONG_DECIMAL) {
    nav.dmePosition = latLon(row, 'TACAN_DME_LAT_DECIMAL', 'TACAN_DME_LONG_DECIMAL');
  }
  return nav;
}

export function parseFix(row: Row): Fix {
  return {
    id: field(row, 'FIX_ID'),
    state: field(row, 'STATE_CODE'),
    position: latLon(row),
    use: field(row, 'FIX_USE_CODE'),
  };
}

export function parseLocalizer(base: Row, gs: Row | undefined, dme: Row | undefined): Localizer {
  const loc: Localizer = {
    id: `I-${field(base, 'ILS_LOC_ID')}`,
    airport: field(base, 'ARPT_ID'),
    runway: field(base, 'RWY_END_ID'),
    systemType: field(base, 'SYSTEM_TYPE_CODE'),
    position: latLon(base),
    elevationFt: num(base, 'SITE_ELEVATION'),
    freqMHz: num(base, 'LOC_FREQ'),
    courseMagDeg: num(base, 'APCH_BEAR'),
    magVarEastDeg: variation(base, 'MAG_VAR', 'MAG_VAR_HEMIS'),
  };
  if (gs) {
    loc.glideslope = {
      position: latLon(gs),
      elevationFt: num(gs, 'SITE_ELEVATION'),
      angleDeg: num(gs, 'G_S_ANGLE'),
    };
  }
  if (dme) {
    loc.dme = {
      position: latLon(dme),
      elevationFt: num(dme, 'SITE_ELEVATION'),
      channel: field(dme, 'CHANNEL'),
    };
  }
  return loc;
}

export function parseAirport(row: Row): Airport {
  const faaId = field(row, 'ARPT_ID');
  return {
    id: field(row, 'ICAO_ID') || `K${faaId}`,
    faaId,
    name: field(row, 'ARPT_NAME'),
    position: latLon(row),
    elevationFt: num(row, 'ELEV'),
    magVarEastDeg: variation(row, 'MAG_VARN', 'MAG_HEMIS'),
    magVarYear: num(row, 'MAG_VARN_YEAR'),
  };
}

export function parseRunwayEnd(row: Row): RunwayEnd {
  const elevationFt = num(row, 'RWY_END_ELEV');
  const end: RunwayEnd = {
    airport: field(row, 'ARPT_ID'),
    runway: field(row, 'RWY_END_ID'),
    threshold: latLon(row),
    elevationFt,
    tdzeFt: optNum(row, 'TDZ_ELEV') ?? elevationFt,
    trueAlignmentDeg: num(row, 'TRUE_ALIGNMENT'),
  };
  const tch = optNum(row, 'THR_CROSSING_HGT');
  if (tch !== undefined) end.vgsiTchFt = tch;
  const dispLen = optNum(row, 'DISPLACED_THR_LEN');
  if (dispLen !== undefined && dispLen > 0) {
    end.displacedThreshold = {
      position: latLon(row, 'LAT_DISPLACED_THR_DECIMAL', 'LONG_DISPLACED_THR_DECIMAL'),
      elevationFt: optNum(row, 'DISPLACED_THR_ELEV') ?? elevationFt,
      lengthFt: dispLen,
    };
  }
  return end;
}
