/** Dev gallery: representative Glass PFD states (built directly, not from a flight). */
import type { ModeBarFields } from '../instruments/glass/modes';
import { BARO_IN_HG, type PfdData } from '../instruments/glass/pfd-data';

type Overrides = {
  attitude?: Partial<PfdData['attitude']>;
  speed?: Partial<PfdData['speed']>;
  alt?: Partial<PfdData['alt']>;
  vsi?: Partial<PfdData['vsi']>;
  hsi?: Partial<PfdData['hsi']>;
  dme?: Partial<PfdData['dme']>;
  brg1?: PfdData['brg1'];
  brg2?: PfdData['brg2'];
};

function pfd(o: Overrides): PfdData {
  const hsi: PfdData['hsi'] = {
    headingMagDeg: 263,
    headingBugDeg: 263,
    courseDeg: 263,
    cdiSource: 'NAV1',
    deviation: { dots: 0, flag: false, toFrom: null },
    glideslope: null,
    bearing1Deg: null,
    bearing2Deg: null,
    ...o.hsi,
  };
  return {
    attitude: { pitchDeg: 2.7, bankDeg: 0, ...o.attitude },
    speed: { iasKt: 100, trendKt: 0, ...o.speed },
    alt: { altitudeFt: 8000, selectedAltFt: 8000, minimums: null, ...o.alt },
    vsi: { vsFpm: 0, selectedVsFpm: null, ...o.vsi },
    hsi,
    boxes: { headingBugDeg: hsi.headingBugDeg, courseDeg: hsi.courseDeg, baroInHg: BARO_IN_HG },
    dme: { source: 'NAV1', freqMHz: 109.3, ident: 'I-FTG', dmeNm: 7.4, ...o.dme },
    brg1: o.brg1 ?? null,
    brg2: o.brg2 ?? null,
  };
}

const modes = (m: Partial<ModeBarFields>): ModeBarFields => ({
  ap: true,
  lateral: '',
  lateralArmed: '',
  vertical: '',
  verticalArmed: '',
  ...m,
});

export const GLASS_CASES: {
  title: string;
  data: PfdData;
  modes?: ModeBarFields;
  minimumsAlert?: boolean;
}[] = [
  {
    title: 'Level cruise, 8,000 ft, 100 KIAS; HDG, ALT, LOC armed',
    data: pfd({}),
    modes: modes({ lateral: 'HDG', lateralArmed: 'LOC', vertical: 'ALT', verticalArmed: 'GS' }),
  },
  {
    title: 'At DA: MINIMUMS alert',
    data: pfd({
      speed: { iasKt: 90 },
      alt: { altitudeFt: 5689, selectedAltFt: 7200, minimums: { kind: 'DA', altFt: 5689 } },
      vsi: { vsFpm: -480 },
      hsi: { glideslope: { dots: 0.1, flag: false } },
    }),
    modes: modes({ lateral: 'LOC', vertical: 'GS' }),
    minimumsAlert: true,
  },
  {
    title: 'ILS established, slightly high, 90 KIAS',
    data: pfd({
      attitude: { pitchDeg: -0.8 },
      speed: { iasKt: 90 },
      alt: { altitudeFt: 6410, selectedAltFt: 7200, minimums: { kind: 'DA', altFt: 5689 } },
      vsi: { vsFpm: -480 },
      hsi: { glideslope: { dots: -0.4, flag: false } },
    }),
  },
  {
    title: 'LOC only, levelled at the MDA; BRG2 on the localizer (NO BRG)',
    data: pfd({
      brg2: { source: 'NAV2', freqMHz: 109.3, ident: 'I-FTG', bearingMagDeg: null, dmeNm: 3.4 },
      alt: { altitudeFt: 5900, selectedAltFt: 5900, minimums: { kind: 'MDA', altFt: 5880 } },
      hsi: {
        deviation: { dots: 0.6, flag: false, toFrom: null },
        glideslope: { dots: 0, flag: true },
      },
    }),
  },
  {
    title: 'Intercepting, turning left, decelerating, VS −700',
    data: pfd({
      attitude: { pitchDeg: -1.5, bankDeg: -18 },
      speed: { iasKt: 104, trendKt: -8 },
      alt: { altitudeFt: 7650, selectedAltFt: 7200 },
      vsi: { vsFpm: -700, selectedVsFpm: -700 },
      hsi: {
        headingMagDeg: 293,
        headingBugDeg: 280,
        deviation: { dots: -1.6, flag: false, toFrom: null },
        glideslope: { dots: 2, flag: false },
      },
    }),
  },
  {
    title: 'VOR FROM on VLOC2, BRG1 and BRG2 shown',
    data: pfd({
      hsi: {
        headingMagDeg: 40,
        headingBugDeg: 10,
        courseDeg: 45,
        cdiSource: 'NAV2',
        deviation: { dots: 1, flag: false, toFrom: 'FROM' },
        bearing1Deg: 225,
        bearing2Deg: 300,
      },
      brg1: { source: 'NAV1', freqMHz: 116.3, ident: 'FQF', bearingMagDeg: 225, dmeNm: 11.2 },
      brg2: { source: 'NAV2', freqMHz: 113.8, ident: null, bearingMagDeg: 300, dmeNm: null },
      dme: { source: 'NAV2', freqMHz: 113.8, ident: null, dmeNm: null },
    }),
  },
  {
    modes: modes({ lateral: 'ROL', vertical: 'GA', verticalArmed: 'ALTS' }),
    title: 'Go-around climb, NAV flagged',
    data: pfd({
      attitude: { pitchDeg: 7.5, bankDeg: 0 },
      speed: { iasKt: 96, trendKt: 4 },
      alt: { altitudeFt: 5820, selectedAltFt: 7200 },
      vsi: { vsFpm: 800 },
      hsi: { deviation: { dots: 0, flag: true, toFrom: null } },
    }),
  },
];
