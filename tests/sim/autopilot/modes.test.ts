import { describe, expect, it } from 'vitest';
import {
  annunciation,
  AP_OFF,
  pressButton,
  updateModes,
  type ApButton,
  type ApModes,
  type ModeContext,
  type CaptureSignals,
} from '../../../src/sim/autopilot/modes';

const VOR: ModeContext = {
  navKind: 'VOR',
  hasGs: false,
  altitudeFt: 7000,
  vsFpm: -480,
  altPreselectFt: 5000,
};
const ILS: ModeContext = { ...VOR, navKind: 'LOC', hasGs: true };
const LOC_ONLY: ModeContext = { ...ILS, hasGs: false };
const NONE: ModeContext = { ...VOR, navKind: null };

const on = (over: Partial<ApModes> = {}): ApModes => ({
  ...AP_OFF,
  engaged: true,
  vsRefFpm: -500,
  holdAltFt: 7000,
  ...over,
});

// [name, start, button, context, expected changes]
type Row = [string, ApModes, ApButton, ModeContext, Partial<ApModes>];

const rows: Row[] = [
  // --- engage / disengage
  [
    'AP engages in ROL + PIT holding the current VS',
    AP_OFF,
    'AP',
    VOR,
    { engaged: true, lateral: 'ROL', vertical: 'PIT', vsRefFpm: -500 },
  ],
  [
    'AP disengages and clears everything',
    on({ lateral: 'APR', vertical: 'GS' }),
    'AP',
    ILS,
    { ...AP_OFF, vsRefFpm: -500, holdAltFt: 7000 },
  ],
  // --- buttons are ignored while the AP is off
  ...(['HDG', 'NAV', 'APR', 'ALT', 'VS'] as const).map((b): Row => [
    `${b} is ignored with the AP off`,
    AP_OFF,
    b,
    ILS,
    {},
  ]),
  // --- HDG
  ['ROL → HDG', on(), 'HDG', VOR, { lateral: 'HDG' }],
  ['HDG → ROL', on({ lateral: 'HDG' }), 'HDG', VOR, { lateral: 'ROL' }],
  [
    'HDG keeps NAV armed when toggling to ROL',
    on({ lateral: 'HDG', lateralArmed: 'NAV' }),
    'HDG',
    VOR,
    { lateral: 'ROL', lateralArmed: 'NAV' },
  ],
  ['NAV → HDG', on({ lateral: 'NAV' }), 'HDG', VOR, { lateral: 'HDG' }],
  [
    'APR + GS → HDG drops the approach and the glideslope',
    on({ lateral: 'APR', vertical: 'GS' }),
    'HDG',
    ILS,
    { lateral: 'HDG', vertical: 'PIT', vsRefFpm: -500 },
  ],
  [
    'APR active with GS armed → HDG disarms GS',
    on({ lateral: 'APR', vertical: 'ALT', gsArmed: true }),
    'HDG',
    ILS,
    { lateral: 'HDG', gsArmed: false },
  ],
  // --- NAV
  [
    'NAV arms from HDG',
    on({ lateral: 'HDG' }),
    'NAV',
    VOR,
    { lateralArmed: 'NAV', navKind: 'VOR' },
  ],
  [
    'NAV arms on a localizer too',
    on({ lateral: 'HDG' }),
    'NAV',
    ILS,
    { lateralArmed: 'NAV', navKind: 'LOC' },
  ],
  [
    'NAV again disarms',
    on({ lateral: 'HDG', lateralArmed: 'NAV' }),
    'NAV',
    VOR,
    { lateralArmed: null },
  ],
  ['NAV active → NAV reverts to ROL', on({ lateral: 'NAV' }), 'NAV', VOR, { lateral: 'ROL' }],
  ['NAV is ignored with no station tuned', on({ lateral: 'HDG' }), 'NAV', NONE, {}],
  [
    'NAV is ignored while APR is armed',
    on({ lateral: 'HDG', lateralArmed: 'APR', gsArmed: true }),
    'NAV',
    ILS,
    {},
  ],
  ['NAV is ignored while APR is active', on({ lateral: 'APR' }), 'NAV', ILS, {}],
  // --- APR
  [
    'APR arms LOC and GS on an ILS',
    on({ lateral: 'HDG', vertical: 'ALT' }),
    'APR',
    ILS,
    { lateralArmed: 'APR', gsArmed: true, navKind: 'LOC' },
  ],
  [
    'APR on a LOC without GS arms only the localizer',
    on({ lateral: 'HDG' }),
    'APR',
    LOC_ONLY,
    { lateralArmed: 'APR', gsArmed: false, navKind: 'LOC' },
  ],
  ['APR is ignored on a VOR', on({ lateral: 'HDG' }), 'APR', VOR, {}],
  ['APR is ignored with nothing tuned', on({ lateral: 'HDG' }), 'APR', NONE, {}],
  [
    'APR replaces an armed NAV',
    on({ lateral: 'HDG', lateralArmed: 'NAV', navKind: 'LOC' }),
    'APR',
    ILS,
    { lateralArmed: 'APR', gsArmed: true },
  ],
  [
    'APR upgrades an active NAV on a localizer',
    on({ lateral: 'NAV', navKind: 'LOC' }),
    'APR',
    ILS,
    { lateral: 'APR', gsArmed: true },
  ],
  [
    'APR is ignored while NAV tracks a VOR (select HDG first)',
    on({ lateral: 'NAV', navKind: 'VOR' }),
    'APR',
    ILS,
    {},
  ],
  [
    'APR again disarms LOC and GS',
    on({ lateral: 'HDG', lateralArmed: 'APR', gsArmed: true }),
    'APR',
    ILS,
    { lateralArmed: null, gsArmed: false },
  ],
  [
    'APR active → APR reverts to ROL and drops GS',
    on({ lateral: 'APR', vertical: 'GS' }),
    'APR',
    ILS,
    { lateral: 'ROL', vertical: 'PIT', vsRefFpm: -500 },
  ],
  // --- ALT
  ['PIT → ALT holds the current altitude', on(), 'ALT', VOR, { vertical: 'ALT', holdAltFt: 7000 }],
  ['VS → ALT', on({ vertical: 'VS' }), 'ALT', VOR, { vertical: 'ALT', holdAltFt: 7000 }],
  ['ALT → PIT', on({ vertical: 'ALT' }), 'ALT', VOR, { vertical: 'PIT', vsRefFpm: -500 }],
  [
    'GS → ALT cancels the glideslope',
    on({ lateral: 'APR', vertical: 'GS' }),
    'ALT',
    ILS,
    { vertical: 'ALT', holdAltFt: 7000 },
  ],
  [
    'ALT keeps GS armed',
    on({ lateral: 'APR', vertical: 'PIT', gsArmed: true }),
    'ALT',
    ILS,
    { vertical: 'ALT', gsArmed: true },
  ],
  // --- VS
  [
    'PIT → VS syncs the target to the current VS',
    on({ vsRefFpm: 0 }),
    'VS',
    VOR,
    { vertical: 'VS', vsRefFpm: -500 },
  ],
  ['ALT → VS', on({ vertical: 'ALT' }), 'VS', VOR, { vertical: 'VS', vsRefFpm: -500 }],
  ['VS → PIT', on({ vertical: 'VS' }), 'VS', VOR, { vertical: 'PIT', vsRefFpm: -500 }],
  [
    'GS → VS cancels the glideslope',
    on({ lateral: 'APR', vertical: 'GS' }),
    'VS',
    ILS,
    { vertical: 'VS', vsRefFpm: -500 },
  ],
];

describe('button presses (transition table)', () => {
  it.each(rows)('%s', (_name, start, button, ctx, changes) => {
    expect(pressButton(start, button, ctx)).toEqual({ ...start, ...changes });
  });

  it('covers every button from every lateral and vertical mode without throwing', () => {
    const laterals = ['ROL', 'HDG', 'NAV', 'APR'] as const;
    const verticals = ['PIT', 'VS', 'ALT', 'GS'] as const;
    const buttons = ['AP', 'HDG', 'NAV', 'APR', 'ALT', 'VS'] as const;
    for (const lateral of laterals)
      for (const vertical of verticals)
        for (const button of buttons)
          for (const ctx of [VOR, ILS, LOC_ONLY, NONE]) {
            if (vertical === 'GS' && lateral !== 'APR') continue; // not a reachable state
            const next = pressButton(on({ lateral, vertical }), button, ctx);
            // GS can only be active while APR is.
            if (next.vertical === 'GS') expect(next.lateral).toBe('APR');
          }
  });
});

const NO_SIGNALS: CaptureSignals = {
  navValid: true,
  lateralCapture: false,
  gsValid: true,
  gsCapture: false,
  altCapture: false,
};

describe('automatic transitions', () => {
  const LEVEL = { ...VOR, altPreselectFt: VOR.altitudeFt }; // no ALT preselect pending

  it('armed NAV captures when the law says so', () => {
    const m = on({ lateral: 'HDG', lateralArmed: 'NAV', navKind: 'VOR' });
    expect(updateModes(m, NO_SIGNALS, LEVEL)).toEqual(m);
    expect(updateModes(m, { ...NO_SIGNALS, lateralCapture: true }, LEVEL)).toEqual({
      ...m,
      lateral: 'NAV',
      lateralArmed: null,
    });
  });

  it('does not capture on a flagged needle', () => {
    const m = on({ lateral: 'HDG', lateralArmed: 'NAV', navKind: 'VOR' });
    expect(updateModes(m, { ...NO_SIGNALS, navValid: false, lateralCapture: true }, LEVEL)).toEqual(
      m,
    );
  });

  it('GS captures only after the localizer', () => {
    const armed = on({ lateral: 'HDG', lateralArmed: 'APR', vertical: 'ALT', gsArmed: true });
    expect(updateModes(armed, { ...NO_SIGNALS, gsCapture: true }, ILS)).toEqual(armed);
    const locked = on({ lateral: 'APR', vertical: 'ALT', gsArmed: true, navKind: 'LOC' });
    expect(updateModes(locked, { ...NO_SIGNALS, gsCapture: true }, ILS)).toEqual({
      ...locked,
      vertical: 'GS',
      gsArmed: false,
    });
  });

  it('ALT preselect arms when climbing or descending toward it, and captures', () => {
    const m = on({ vertical: 'VS', vsRefFpm: -500 });
    const armed = updateModes(m, NO_SIGNALS, VOR); // 7000 → 5000 descending
    expect(armed.altArmed).toBe(true);
    expect(updateModes(armed, { ...NO_SIGNALS, altCapture: true }, VOR)).toEqual({
      ...armed,
      vertical: 'ALT',
      holdAltFt: 5000,
      altArmed: false,
    });
    // Climbing away from a lower preselect: not armed.
    expect(updateModes(on({ vertical: 'VS', vsRefFpm: 500 }), NO_SIGNALS, VOR).altArmed).toBe(
      false,
    );
    // Already holding altitude: not armed.
    expect(updateModes(on({ vertical: 'ALT' }), NO_SIGNALS, VOR).altArmed).toBe(false);
  });

  it('GS capture wins over a pending ALT capture', () => {
    const m = on({ lateral: 'APR', vertical: 'VS', gsArmed: true, altArmed: true });
    const next = updateModes(m, { ...NO_SIGNALS, gsCapture: true, altCapture: true }, ILS);
    expect(next).toMatchObject({ vertical: 'GS', altArmed: false, gsArmed: false });
  });

  it('retuning away from the localizer drops the approach', () => {
    const m = on({ lateral: 'APR', vertical: 'GS' });
    expect(updateModes(m, NO_SIGNALS, VOR)).toMatchObject({
      lateral: 'ROL',
      vertical: 'PIT',
      vsRefFpm: -500,
    });
    const armed = on({ lateral: 'HDG', lateralArmed: 'APR', gsArmed: true });
    expect(updateModes(armed, NO_SIGNALS, NONE)).toMatchObject({
      lateral: 'HDG',
      lateralArmed: null,
      gsArmed: false,
    });
  });

  it('losing the station drops NAV to ROL', () => {
    expect(updateModes(on({ lateral: 'NAV', navKind: 'VOR' }), NO_SIGNALS, NONE)).toMatchObject({
      lateral: 'ROL',
      navKind: null,
    });
  });

  it('retuning NAV1 from a VOR to a localizer drops NAV', () => {
    expect(updateModes(on({ lateral: 'NAV', navKind: 'VOR' }), NO_SIGNALS, LOC_ONLY)).toMatchObject(
      { lateral: 'ROL', navKind: null },
    );
    expect(
      updateModes(on({ lateral: 'HDG', lateralArmed: 'NAV', navKind: 'VOR' }), NO_SIGNALS, ILS),
    ).toMatchObject({ lateralArmed: null });
  });

  it('GS does not capture while the localizer needle is flagged', () => {
    const m = on({ lateral: 'APR', vertical: 'ALT', gsArmed: true, navKind: 'LOC' });
    expect(updateModes(m, { ...NO_SIGNALS, navValid: false, gsCapture: true }, ILS).vertical).toBe(
      'ALT',
    );
  });

  it('a glideslope that goes out of service reverts GS to PIT', () => {
    expect(updateModes(on({ lateral: 'APR', vertical: 'GS' }), NO_SIGNALS, LOC_ONLY)).toMatchObject(
      { vertical: 'PIT' },
    );
  });

  it('does nothing while disengaged', () => {
    expect(updateModes(AP_OFF, { ...NO_SIGNALS, altCapture: true }, VOR)).toEqual(AP_OFF);
  });
});

describe('annunciation', () => {
  it('shows active and armed modes', () => {
    expect(
      annunciation(on({ lateral: 'HDG', lateralArmed: 'APR', vertical: 'ALT', gsArmed: true })),
    ).toEqual({
      ap: true,
      lateral: 'HDG',
      lateralArmed: 'LOC',
      vertical: 'ALT',
      verticalArmed: ['GS'],
    });
    expect(annunciation(on({ lateral: 'APR', vertical: 'VS', altArmed: true }))).toMatchObject({
      lateral: 'LOC',
      verticalArmed: ['ALT'],
    });
    expect(annunciation(AP_OFF)).toEqual({
      ap: false,
      lateral: null,
      lateralArmed: null,
      vertical: null,
      verticalArmed: [],
    });
  });
});
