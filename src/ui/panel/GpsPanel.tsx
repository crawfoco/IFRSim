/**
 * GPS unit (V3): a generic WAAS GPS in the radio stack, beside NAV1/NAV2. The face shows the
 * CDI scaling and approach annunciations, the active waypoint with DTK, distance, ground speed
 * and ETE, and the buttons. PROC (pick an approach transition or vectors-to-final, then LOAD it to activate later
 * with ACT, or LOAD + ACTIVATE at once), D→ (Direct-To
 * a flight-plan waypoint) and FPL (the flight plan) open small popovers; ACT activates the loaded
 * approach and SUSP sequences into the missed approach. (The steam panel's NAV1/GPS CDI switch
 * is beside the HSI.)
 */
import { useEffect, useRef, useState } from 'react';
import { legFix, VTF, type GpsLeg, type GpsPlan } from '../../sim/gps/flightplan';
import { activePlan, planKey, type GpsReading, type GpsWorld } from '../../sim/gps/receiver';
import type { Command, SimState } from '../../sim/state';

const pad3 = (d: number) => String(Math.round(d) % 360 || 360).padStart(3, '0');

function legLabel(l: GpsLeg): string {
  switch (l.kind) {
    case 'ca':
      return `${l.altFt.toLocaleString('en-US')} ft`;
    case 'hold':
      return `HOLD ${l.fix}`;
    default:
      return l.to;
  }
}

/** ETE at the ground speed, m:ss. */
function ete(nm: number | null, gsKt: number): string {
  if (nm === null || gsKt < 20) return '--:--';
  const s = Math.round((nm / gsKt) * 3600);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

type Pop = 'proc' | 'dto' | 'fpl' | null;

export function GpsPanel({
  world,
  state,
  gps,
  send,
}: {
  world: GpsWorld;
  state: SimState;
  gps: GpsReading;
  send: (c: Command) => void;
}) {
  const db = world.db;
  const [pick, setPick] = useState<string>(db.transitions[0]?.id ?? VTF);
  const [hold, setHold] = useState(true);
  const [direct, setDirect] = useState<string>('');
  const [pop, setPop] = useState<Pop>(null);
  const unitRef = useRef<HTMLElement>(null);

  // A popover closes on Escape or a click anywhere outside the unit.
  useEffect(() => {
    if (!pop) return;
    const onDown = (e: PointerEvent) => {
      if (unitRef.current && !unitRef.current.contains(e.target as Node)) setPop(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPop(null);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pop]);

  const offersHold = db.transitions.find((t) => t.id === pick)?.offersHold ?? false;
  const plan: GpsPlan | null = activePlan(state.gps, world);
  // Before loading, the FPL page previews the chosen transition's flight plan.
  const preview =
    plan ??
    world.plans[
      planKey(
        pick === VTF
          ? { transition: VTF }
          : offersHold
            ? { transition: pick, hold }
            : { transition: pick },
      )
    ] ??
    null;
  const loadedName = state.gps.loaded
    ? state.gps.loaded.transition === VTF
      ? 'Vectors to final'
      : (db.transitions.find((t) => t.id === state.gps.loaded!.transition)?.name ?? '')
    : null;
  const fixes = (plan?.legs ?? []).map(legFix).filter((f): f is string => f !== null);
  const uniqueFixes = [...new Set(fixes)];
  const load = (activate: boolean) => {
    send(
      pick === VTF || !offersHold
        ? { type: 'gpsLoad', transition: pick }
        : { type: 'gpsLoad', transition: pick, hold },
    );
    if (activate) send({ type: 'gpsActivate' });
    setPop(null);
  };
  const toggle = (p: Exclude<Pop, null>) => setPop((cur) => (cur === p ? null : p));

  return (
    <section className="gps-unit" aria-label="GPS" data-testid="gps-panel" ref={unitRef}>
      <div className="gps-line">
        <strong className="gps-title">GPS</strong>
        <span className="gps-ann" data-testid="gps-phase" title="Flight phase (CDI scaling)">
          {gps.phase}
        </span>
        <span
          className={`gps-ann${gps.annunciation ? ' gps-ann-on' : ''}`}
          data-testid="gps-annunciation"
          title="Approach annunciation: the minimums line the GPS is flying"
        >
          {gps.annunciation ?? '—'}
        </span>
        {(gps.suspended || gps.missedArmed) && (
          <span className="gps-ann gps-ann-susp" data-testid="gps-susp-ann">
            {gps.suspended ? 'SUSP' : 'MAPR'}
          </span>
        )}
        <span
          className="gps-loaded"
          data-testid="gps-loaded"
          title={loadedName ?? 'No approach loaded'}
        >
          {loadedName
            ? `${loadedName}${state.gps.active ? '' : ' (loaded, not active)'}`
            : 'No approach loaded'}
        </span>
      </div>

      <div className="gps-line gps-data" data-testid="gps-data">
        {gps.flag ? (
          <span>No active leg</span>
        ) : (
          <>
            <span>
              → <strong data-testid="gps-wpt">{gps.activeWaypoint ?? '—'}</strong>
            </span>
            <span title="Desired track">DTK {pad3(gps.dtkMagDeg)}°</span>
            <span data-testid="gps-dis" title="Distance to the active waypoint">
              {gps.distanceNm === null ? '--.-' : gps.distanceNm.toFixed(1)} NM
            </span>
            <span title="Ground speed">{Math.round(gps.groundSpeedKt)} kt</span>
            <span title="Time to the active waypoint">
              {ete(gps.distanceNm, gps.groundSpeedKt)}
            </span>
          </>
        )}
      </div>

      <div className="gps-line gps-keys">
        <button
          type="button"
          className={pop === 'proc' ? 'on' : ''}
          data-testid="gps-proc"
          aria-expanded={pop === 'proc'}
          title="Procedures: load the approach with a transition, or vectors to final"
          onClick={() => toggle('proc')}
        >
          PROC
        </button>
        <button
          type="button"
          className={pop === 'dto' ? 'on' : ''}
          data-testid="gps-dto"
          aria-expanded={pop === 'dto'}
          disabled={!plan}
          title="Direct-To a waypoint in the flight plan"
          onClick={() => toggle('dto')}
        >
          D→
        </button>
        <button
          type="button"
          className={pop === 'fpl' ? 'on' : ''}
          data-testid="gps-fpl-btn"
          aria-expanded={pop === 'fpl'}
          title="Flight plan"
          onClick={() => toggle('fpl')}
        >
          FPL
        </button>
        <button
          type="button"
          data-testid="gps-activate"
          disabled={!state.gps.loaded}
          title="Activate the loaded approach"
          onClick={() => send({ type: 'gpsActivate' })}
        >
          ACT
        </button>
        <button
          type="button"
          className={gps.suspended ? 'on' : ''}
          data-testid="gps-susp"
          disabled={!state.gps.active}
          title="SUSP: over the MAP, sequence into the missed approach (pressed earlier, it arms it)"
          onClick={() => send({ type: 'gpsSusp' })}
        >
          SUSP
        </button>
      </div>

      {pop === 'proc' && (
        <div
          className="gps-pop gps-pop-proc"
          role="dialog"
          aria-label="Load approach"
          data-testid="gps-pop"
        >
          <label className="gps-field">
            <span>Approach</span>
            <select
              data-testid="gps-transition"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
            >
              {db.transitions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value={VTF}>Vectors to final</option>
            </select>
          </label>
          {offersHold && (
            <label
              className="gps-check"
              title="Fly the hold-in-lieu (course reversal), or leave it out"
            >
              <input
                type="checkbox"
                checked={hold}
                onChange={(e) => setHold(e.target.checked)}
                data-testid="gps-hold"
              />
              Hold at {db.transitions.find((t) => t.id === pick)?.holdFix}
            </label>
          )}
          <div className="gps-pop-actions">
            <button
              type="button"
              data-testid="gps-load"
              title="Load the approach (activate it later with ACT)"
              onClick={() => load(false)}
            >
              LOAD
            </button>
            <button
              type="button"
              data-testid="gps-load-activate"
              title="Load the approach and activate it now"
              onClick={() => load(true)}
            >
              LOAD + ACTIVATE
            </button>
          </div>
        </div>
      )}

      {pop === 'dto' && (
        <div className="gps-pop" role="dialog" aria-label="Direct-To" data-testid="gps-pop">
          <label className="gps-field">
            <span>D→</span>
            <select
              data-testid="gps-direct-fix"
              value={direct}
              onChange={(e) => setDirect(e.target.value)}
            >
              <option value="">—</option>
              {uniqueFixes.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            data-testid="gps-direct"
            disabled={!plan || !direct}
            onClick={() => {
              send({ type: 'gpsDirect', fix: direct });
              setPop(null);
            }}
          >
            Direct
          </button>
        </div>
      )}

      {pop === 'fpl' && (
        <div className="gps-pop" role="dialog" aria-label="Flight plan" data-testid="gps-pop">
          {preview ? (
            <ol className="gps-fpl" data-testid="gps-fpl" aria-label="Flight plan">
              {preview.legs.map((l, i) => {
                const active = state.gps.active && i === state.gps.leg;
                const past = state.gps.active && i < state.gps.leg;
                return (
                  <li
                    key={i}
                    className={`${active ? 'active' : ''}${past ? ' past' : ''}${
                      i === preview.mapLeg ? ' map' : ''
                    }${i === preview.missedLeg ? ' missed-start' : ''}`}
                    aria-current={active ? 'step' : undefined}
                  >
                    {legLabel(l)}
                  </li>
                );
              })}
            </ol>
          ) : (
            <span>No flight plan</span>
          )}
          {!plan && preview && <span className="gps-note">Preview: not loaded</span>}
        </div>
      )}
    </section>
  );
}
