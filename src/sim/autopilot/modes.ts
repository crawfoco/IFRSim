/**
 * Autopilot mode state machine (SPEC.md: generic GA autopilot). Pure: button presses and
 * automatic captures map one ApModes to the next. The control laws decide *when* a capture
 * is due (CaptureSignals); this module decides *what* the modes become.
 *
 * Lateral: ROL (wings level), HDG, NAV (VOR or LOC), APR (LOC, with GS).
 * Vertical: PIT (holds the VS present when entered), VS (selected VS), ALT, GS, GA (go-around
 * climb).
 * Armed: NAV/APR lateral, ALT preselect capture, GS.
 *
 * GA (TOGA) is the learner's positive go-around decision: it engages the autopilot if needed,
 * levels the wings (ROL), drops NAV/APR/GS and climbs at GA_CLIMB_FPM. ALT preselect still
 * captures. HDG/NAV then steer the missed approach.
 */

export type LateralMode = 'ROL' | 'HDG' | 'NAV' | 'APR';
export type VerticalMode = 'PIT' | 'VS' | 'ALT' | 'GS' | 'GA';
export type ApButton = 'AP' | 'HDG' | 'NAV' | 'APR' | 'ALT' | 'VS' | 'GA';

/** Go-around climb rate. */
export const GA_CLIMB_FPM = 800;

export interface ApModes {
  engaged: boolean;
  lateral: LateralMode;
  lateralArmed: 'NAV' | 'APR' | null;
  vertical: VerticalMode;
  /** ALT preselect will capture (ALTS). */
  altArmed: boolean;
  gsArmed: boolean;
  /** Kind of station NAV/APR was armed on; a retune to another kind drops the mode. */
  navKind: 'VOR' | 'LOC' | null;
  /** Vertical speed held in PIT and VS. */
  vsRefFpm: number;
  /** Altitude held in ALT. */
  holdAltFt: number;
}

/** What the mode logic needs to know about the aircraft and radios. */
export interface ModeContext {
  /** Kind of station tuned on the autopilot's nav source (the CDI's radio), or null. */
  navKind: 'VOR' | 'LOC' | null;
  /** The tuned localizer has a usable glideslope. */
  hasGs: boolean;
  altitudeFt: number;
  vsFpm: number;
  altPreselectFt: number;
}

/** Capture decisions from the control laws, evaluated on the current step. */
export interface CaptureSignals {
  navValid: boolean;
  lateralCapture: boolean;
  gsValid: boolean;
  gsCapture: boolean;
  altCapture: boolean;
}

export const AP_OFF: ApModes = {
  engaged: false,
  lateral: 'ROL',
  lateralArmed: null,
  vertical: 'PIT',
  altArmed: false,
  gsArmed: false,
  navKind: null,
  vsRefFpm: 0,
  holdAltFt: 0,
};

/** Vertical speed rounded the way the VS wheel reads (100 fpm). */
const syncVs = (ctx: ModeContext) => Math.round(ctx.vsFpm / 100) * 100;

/** Leave GS (active or armed) and fall back to PIT if it was active. */
function dropGs(m: ApModes, ctx: ModeContext): ApModes {
  const out = { ...m, gsArmed: false };
  if (m.vertical === 'GS') return { ...out, vertical: 'PIT', vsRefFpm: syncVs(ctx) };
  return out;
}

export function pressButton(m: ApModes, button: ApButton, ctx: ModeContext): ApModes {
  if (button === 'AP') {
    return m.engaged
      ? { ...AP_OFF, vsRefFpm: m.vsRefFpm, holdAltFt: m.holdAltFt }
      : { ...AP_OFF, engaged: true, vsRefFpm: syncVs(ctx), holdAltFt: m.holdAltFt };
  }
  if (button === 'GA')
    return {
      ...AP_OFF,
      engaged: true,
      vertical: 'GA',
      vsRefFpm: GA_CLIMB_FPM,
      holdAltFt: m.holdAltFt,
    };
  if (!m.engaged) return m;

  switch (button) {
    case 'HDG':
      if (m.lateral === 'HDG') return { ...m, lateral: 'ROL' };
      if (m.lateral === 'APR') return { ...dropGs(m, ctx), lateral: 'HDG' };
      return { ...m, lateral: 'HDG' };

    case 'NAV':
      if (m.lateral === 'APR' || m.lateralArmed === 'APR') return m;
      if (m.lateral === 'NAV') return { ...m, lateral: 'ROL' };
      if (m.lateralArmed === 'NAV') return { ...m, lateralArmed: null };
      if (ctx.navKind === null) return m;
      return { ...m, lateralArmed: 'NAV', navKind: ctx.navKind };

    case 'APR': {
      if (m.lateral === 'APR') return { ...dropGs(m, ctx), lateral: 'ROL' };
      if (m.lateralArmed === 'APR') return { ...m, lateralArmed: null, gsArmed: false };
      if (ctx.navKind !== 'LOC') return m;
      const gsArmed = ctx.hasGs;
      if (m.lateral === 'NAV' && m.navKind === 'LOC') return { ...m, lateral: 'APR', gsArmed };
      if (m.lateral === 'NAV') return m; // NAV on a VOR: select HDG first
      return { ...m, lateralArmed: 'APR', gsArmed, navKind: 'LOC' };
    }

    case 'ALT':
      if (m.vertical === 'ALT') return { ...m, vertical: 'PIT', vsRefFpm: syncVs(ctx) };
      return { ...m, vertical: 'ALT', holdAltFt: ctx.altitudeFt };

    case 'VS':
      if (m.vertical === 'VS') return { ...m, vertical: 'PIT', vsRefFpm: syncVs(ctx) };
      return { ...m, vertical: 'VS', vsRefFpm: syncVs(ctx) };
  }
}

/**
 * The CDI (nav source) changed. NAV or APR active drops to ROL; NAV or APR armed is cancelled
 * and the active lateral mode (e.g. HDG on a vector) is kept. GS (active or armed) drops with
 * APR. Vertical modes other than GS are kept.
 */
export function cdiSourceChanged(m: ApModes, ctx: ModeContext): ApModes {
  if (!m.engaged) return m;
  const navActive = m.lateral === 'NAV' || m.lateral === 'APR';
  if (!navActive && !m.lateralArmed) return m;
  const n = m.lateral === 'APR' || m.lateralArmed === 'APR' ? dropGs(m, ctx) : m;
  return { ...n, lateral: navActive ? 'ROL' : n.lateral, lateralArmed: null, navKind: null };
}

/** Preselect is ahead of the aircraft in the direction it is climbing or descending. */
function preselectAhead(m: ApModes, ctx: ModeContext): boolean {
  if (m.vertical !== 'PIT' && m.vertical !== 'VS' && m.vertical !== 'GA') return false;
  const toGo = ctx.altPreselectFt - ctx.altitudeFt;
  return Math.abs(toGo) > 50 && m.vsRefFpm !== 0 && Math.sign(toGo) === Math.sign(m.vsRefFpm);
}

/** Automatic transitions: station changes, captures, ALT preselect arming. */
export function updateModes(m: ApModes, sig: CaptureSignals, ctx: ModeContext): ApModes {
  if (!m.engaged) return m;
  let n = m;

  // Station changes invalidate modes that depended on it.
  if (ctx.navKind !== 'LOC' && (n.lateral === 'APR' || n.lateralArmed === 'APR')) {
    n = dropGs(n, ctx);
    n = n.lateral === 'APR' ? { ...n, lateral: 'ROL' } : { ...n, lateralArmed: null };
  }
  if (ctx.navKind !== n.navKind) {
    if (n.lateral === 'NAV') n = { ...n, lateral: 'ROL' };
    if (n.lateralArmed === 'NAV') n = { ...n, lateralArmed: null };
  }
  if (n.lateral !== 'NAV' && n.lateral !== 'APR' && !n.lateralArmed && n.navKind !== null)
    n = { ...n, navKind: null };
  if (!ctx.hasGs && (n.vertical === 'GS' || n.gsArmed)) n = dropGs(n, ctx);

  // Lateral capture.
  if (n.lateralArmed && sig.navValid && sig.lateralCapture) {
    n = { ...n, lateral: n.lateralArmed, lateralArmed: null };
  }

  // Glideslope capture (only once the localizer is captured).
  if (n.gsArmed && n.lateral === 'APR' && sig.navValid && sig.gsValid && sig.gsCapture) {
    return { ...n, vertical: 'GS', gsArmed: false, altArmed: false };
  }

  // ALT preselect.
  if (
    n.altArmed &&
    sig.altCapture &&
    (n.vertical === 'PIT' || n.vertical === 'VS' || n.vertical === 'GA')
  ) {
    return { ...n, vertical: 'ALT', holdAltFt: ctx.altPreselectFt, altArmed: false };
  }
  const altArmed = preselectAhead(n, ctx);
  return altArmed === n.altArmed ? n : { ...n, altArmed };
}

export interface Annunciation {
  ap: boolean;
  lateral: 'ROL' | 'HDG' | 'VOR' | 'LOC' | null;
  lateralArmed: 'VOR' | 'LOC' | null;
  vertical: VerticalMode | null;
  verticalArmed: ('ALT' | 'GS')[];
}

/**
 * Annunciator text. NAV and APR show the kind of signal they track: APR is always LOC;
 * NAV shows VOR (a NAV capture on a localizer is shown by the caller, which knows the source).
 */
export function annunciation(m: ApModes, navKind: 'VOR' | 'LOC' | null = 'VOR'): Annunciation {
  if (!m.engaged)
    return { ap: false, lateral: null, lateralArmed: null, vertical: null, verticalArmed: [] };
  const navLabel = navKind === 'LOC' ? 'LOC' : 'VOR';
  const label = (mode: 'NAV' | 'APR') => (mode === 'APR' ? 'LOC' : navLabel);
  const verticalArmed: ('ALT' | 'GS')[] = [];
  if (m.altArmed) verticalArmed.push('ALT');
  if (m.gsArmed) verticalArmed.push('GS');
  return {
    ap: true,
    lateral: m.lateral === 'NAV' || m.lateral === 'APR' ? label(m.lateral) : m.lateral,
    lateralArmed: m.lateralArmed ? label(m.lateralArmed) : null,
    vertical: m.vertical,
    verticalArmed,
  };
}
