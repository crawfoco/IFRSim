/** V2 G5: PFD mode bar fields and the minimums alert timing. */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AP_OFF, type ApModes } from '../../src/sim/autopilot/modes';
import type { ScenarioProgress } from '../../src/sim/scenario/progress';
import { minimumsAlertOn, modeBarFields } from '../../src/ui/instruments/glass/modes';
import { MinimumsAlert, MinimumsBox } from '../../src/ui/instruments/glass/MinimumsAlert';
import { ModeBar } from '../../src/ui/instruments/glass/ModeBar';

const on = (m: Partial<ApModes>): ApModes => ({ ...AP_OFF, engaged: true, ...m });

describe('modeBarFields', () => {
  it('AP off: everything blank', () => {
    expect(modeBarFields(AP_OFF)).toEqual({
      ap: false,
      lateral: '',
      lateralArmed: '',
      vertical: '',
      verticalArmed: '',
    });
  });

  it('active and armed, lateral and vertical', () => {
    expect(
      modeBarFields(
        on({
          lateral: 'HDG',
          lateralArmed: 'APR',
          navKind: 'LOC',
          vertical: 'VS',
          vsRefFpm: -500,
          altArmed: true,
          gsArmed: true,
        }),
      ),
    ).toEqual({
      ap: true,
      lateral: 'HDG',
      lateralArmed: 'LOC',
      vertical: 'VS −500FPM',
      verticalArmed: 'ALTS GS',
    });
  });

  it('NAV on a VOR, ALT hold, GA climb', () => {
    expect(modeBarFields(on({ lateral: 'NAV', navKind: 'VOR', vertical: 'ALT' }))).toMatchObject({
      lateral: 'VOR',
      vertical: 'ALT',
    });
    expect(modeBarFields(on({ lateral: 'ROL', vertical: 'GA' }))).toMatchObject({
      lateral: 'ROL',
      vertical: 'GA',
    });
    expect(modeBarFields(on({ vertical: 'VS', vsRefFpm: 700 })).vertical).toBe('VS +700FPM');
  });
});

describe('minimumsAlertOn', () => {
  const progress = (phase: ScenarioProgress['phase'], tick: number | null): ScenarioProgress =>
    ({
      phase,
      events: tick === null ? [] : [{ tick, kind: 'minimums', text: 'Reached DA 5,689' }],
    }) as unknown as ScenarioProgress;

  it('on for 5 s of sim time after the minimums event', () => {
    expect(minimumsAlertOn(progress('approach', null), 100)).toBe(false);
    expect(minimumsAlertOn(progress('approach', 100), 100)).toBe(true);
    expect(minimumsAlertOn(progress('approach', 100), 199)).toBe(true);
    expect(minimumsAlertOn(progress('approach', 100), 200)).toBe(false);
  });

  it('off once the flight has gone missed or ended', () => {
    expect(minimumsAlertOn(progress('missed', 100), 110)).toBe(false);
    expect(minimumsAlertOn(progress('ended', 100), 110)).toBe(false);
  });
});

describe('rendering', () => {
  it('mode bar: active fields green, armed white; shown fields carry the flash class', () => {
    const f = modeBarFields(on({ lateral: 'HDG', lateralArmed: 'NAV', navKind: 'VOR' }));
    const html = renderToStaticMarkup(
      <svg>
        <ModeBar fields={f} />
      </svg>,
    );
    expect(html).toMatch(
      /class="g-ann-active g-flash"[^>]*data-testid="pfd-ann-lateral"[^>]*>HDG</,
    );
    expect(html).toMatch(
      /class="g-ann-armed g-flash"[^>]*data-testid="pfd-ann-lateral-armed"[^>]*>VOR</,
    );
    expect(html).toMatch(/data-testid="pfd-ann-ap"[^>]*>AP</);
    expect(html).toMatch(/data-testid="pfd-ann-vertical"[^>]*>PIT</);
    expect(html).not.toContain('pfd-ann-vertical-armed'); // blank fields are not drawn
  });

  it('minimums box shows the DA/MDA; the alert says MINIMUMS', () => {
    const box = renderToStaticMarkup(
      <svg>
        <MinimumsBox minimums={{ kind: 'MDA', altFt: 5880 }} />
      </svg>,
    );
    expect(box).toMatch(/data-testid="pfd-mins-box-value"[^>]*>5,880</);
    expect(box).toContain('MDA');
    expect(
      renderToStaticMarkup(
        <svg>
          <MinimumsBox minimums={null} />
        </svg>,
      ),
    ).not.toContain('pfd-mins-box');
    expect(
      renderToStaticMarkup(
        <svg>
          <MinimumsAlert on />
        </svg>,
      ),
    ).toMatch(/data-testid="pfd-minimums"[^>]*>.*MINIMUMS/s);
    expect(
      renderToStaticMarkup(
        <svg>
          <MinimumsAlert on={false} />
        </svg>,
      ),
    ).not.toContain('pfd-minimums');
  });
});
