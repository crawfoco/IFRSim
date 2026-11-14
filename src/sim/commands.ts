/** Apply one UI command to the sim state. Out-of-range values are wrapped or clamped. */
import { modeContext } from './autopilot/autopilot';
import { pressButton } from './autopilot/modes';
import { clamp, normalize360 } from './geo/angles';
import { sense } from './sensors';
import type { Command, NavRadio, RadioId, SimState } from './state';
import type { World } from './world';

const ALT_PRESELECT_MAX_FT = 18_000;
const NAV_MIN_MHZ = 108.0;
const NAV_MAX_MHZ = 117.95;

function withRadio(s: SimState, id: RadioId, f: (r: NavRadio) => NavRadio): SimState {
  const key = id === 1 ? 'nav1' : 'nav2';
  return { ...s, radios: { ...s.radios, [key]: f(s.radios[key]) } };
}

export function applyCommand(s: SimState, c: Command, world: World): SimState {
  switch (c.type) {
    case 'button':
      return { ...s, ap: pressButton(s.ap, c.button, modeContext(s, sense(s, world))) };
    case 'headingBug':
      return { ...s, panel: { ...s.panel, headingBugDeg: normalize360(Math.round(c.deg)) } };
    case 'altPreselect':
      return {
        ...s,
        panel: {
          ...s.panel,
          altPreselectFt: clamp(Math.round(c.ft / 100) * 100, 0, ALT_PRESELECT_MAX_FT),
        },
      };
    case 'vsTarget':
      // The VS wheel only acts in VS mode.
      if (s.ap.vertical !== 'VS') return s;
      return { ...s, ap: { ...s.ap, vsRefFpm: clamp(Math.round(c.fpm / 100) * 100, -1500, 1000) } };
    case 'speed':
      return { ...s, panel: { ...s.panel, iasCmdKt: clamp(Math.round(c.kt), 90, 120) } };
    case 'course':
      return withRadio(s, c.radio, (r) => ({ ...r, obsDeg: normalize360(Math.round(c.deg)) }));
    case 'standby': {
      const mhz = Math.round(c.mhz * 20) / 20; // 50 kHz spacing
      if (mhz < NAV_MIN_MHZ || mhz > NAV_MAX_MHZ) return s;
      return withRadio(s, c.radio, (r) => ({ ...r, standbyMHz: mhz }));
    }
    case 'swap':
      return withRadio(s, c.radio, (r) => ({
        ...r,
        activeMHz: r.standbyMHz,
        standbyMHz: r.activeMHz,
      }));
    case 'dmeSource':
      return { ...s, radios: { ...s.radios, dmeSource: c.radio } };
    case 'timer':
      return {
        ...s,
        timer:
          c.action === 'reset'
            ? { running: false, elapsedS: 0 }
            : { ...s.timer, running: !s.timer.running },
      };
  }
}
