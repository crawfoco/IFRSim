/** Apply one UI command to the sim state. Out-of-range values are wrapped or clamped. */
import { modeContext } from './autopilot/autopilot';
import { cdiSourceChanged, pressButton } from './autopilot/modes';
import { nextBearingSource, nextCdiSource } from './nav/source';
import { applyGpsCommand, gpsGoAround } from './gps/receiver';
import { clamp, normalize360, trueToMag } from './geo/angles';
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
    case 'button': {
      const ap = pressButton(s.ap, c.button, modeContext(s, sense(s, world)));
      if (c.button !== 'GA') return { ...s, ap };
      const ac = { position: s.aircraft.position, altitudeFt: s.aircraft.altitudeFt };
      return {
        ...s,
        ap,
        goAroundTick: s.goAroundTick ?? s.tick,
        gps: gpsGoAround(s.gps, world.gps, ac),
      };
    }
    case 'headingBug':
      return { ...s, panel: { ...s.panel, headingBugDeg: normalize360(Math.round(c.deg)) } };
    case 'syncHeadingBug': {
      const hdg = trueToMag(s.aircraft.headingTrueDeg, world.magVarEastDeg);
      return { ...s, panel: { ...s.panel, headingBugDeg: normalize360(Math.round(hdg)) } };
    }
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
      return { ...s, panel: { ...s.panel, iasCmdKt: clamp(Math.round(c.kt), 80, 110) } };
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
    case 'ident':
      return s;
    case 'map':
      return { ...s, panel: { ...s.panel, mapOn: c.on } };
    case 'cdi': {
      // A new nav source: active NAV/APR drops to ROL; armed NAV/APR is cancelled (HDG kept).
      const ap = cdiSourceChanged(s.ap, modeContext(s, sense(s, world)));
      const cdiSource = nextCdiSource(s.panel.cdiSource, world.gps !== null);
      return { ...s, ap, panel: { ...s.panel, cdiSource } };
    }
    case 'cdiSet': {
      if (c.source === s.panel.cdiSource) return s;
      if (c.source === 'GPS' && !world.gps) return s;
      const ap = cdiSourceChanged(s.ap, modeContext(s, sense(s, world)));
      return { ...s, ap, panel: { ...s.panel, cdiSource: c.source } };
    }
    case 'bearing': {
      const key = c.pointer === 1 ? 'brg1' : 'brg2';
      const src = nextBearingSource(s.panel[key], world.gps !== null);
      return { ...s, panel: { ...s.panel, [key]: src } };
    }
    case 'gpsLoad':
    case 'gpsActivate':
    case 'gpsDirect':
    case 'gpsSusp': {
      const ac = { position: s.aircraft.position, altitudeFt: s.aircraft.altitudeFt };
      return { ...s, gps: applyGpsCommand(s.gps, c, world.gps, ac) };
    }
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
