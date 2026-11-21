/**
 * NAV1 / NAV2: active and standby frequencies, flip-flop, MHz and kHz tuning knobs, a
 * standby window that takes a typed frequency (click it, type 113.85, Enter), and
 * the ident button, which plays the received station's Morse ident and shows it as
 * dots and dashes (decoding it against the chart is the learner's job).
 */
import { useState, type ReactNode } from 'react';
import { morse } from '../../sim/nav/morse';
import type { RadioId, SimState } from '../../sim/state';
import { playIdent } from '../audio/ident';
import { formatMHz, frequencyKnob, parseFrequency, type Send } from './controls';
import { Knob } from './Knob';
import { ValueEntry } from './ValueEntry';

export type Idents = Record<RadioId, string | null>;

function IdentRow({
  id,
  ident,
  send,
  autoId,
}: {
  id: RadioId;
  ident: string | null;
  send: Send;
  /** Glass panel: show the decoded ident while the station is received. */
  autoId: boolean;
}) {
  // The text belongs to the station it was heard from; retuning clears it.
  const [heard, setHeard] = useState<{ ident: string | null; text: string } | null>(null);
  const shown = heard && heard.ident === ident ? heard.text : null;
  const onIdent = () => {
    send({ type: 'ident', radio: id });
    if (!ident) {
      setHeard({ ident, text: 'no ident' });
      return;
    }
    playIdent(ident);
    setHeard({
      ident,
      text: morse(ident)
        .map(([, code]) => code)
        .join('   '),
    });
  };
  return (
    <div className="radio-ident">
      <button
        type="button"
        className="seg-btn"
        aria-label={`Listen to NAV${id} ident`}
        data-testid={`nav${id}-ident`}
        onClick={onIdent}
      >
        ID
      </button>
      {autoId && (
        <span
          className="radio-autoid"
          data-testid={`nav${id}-autoid`}
          title="Station ident decoded automatically"
        >
          {ident ?? '----'}
        </span>
      )}
      <span className="radio-morse" data-testid={`nav${id}-morse`} aria-live="polite">
        {shown ?? ''}
      </span>
    </div>
  );
}

function NavRadio({
  id,
  state,
  send,
  ident,
  autoId,
}: {
  id: RadioId;
  state: SimState;
  send: Send;
  ident: string | null;
  autoId: boolean;
}) {
  const r = state.radios[id === 1 ? 'nav1' : 'nav2'];
  return (
    <div className="radio" role="group" aria-label={`NAV${id} radio`} data-testid={`nav${id}`}>
      <span className="radio-name">NAV{id}</span>
      <div className="radio-freq">
        <span className="radio-label">ACT</span>
        <span className="radio-active" data-testid={`nav${id}-active`}>
          {formatMHz(r.activeMHz)}
        </span>
      </div>
      <button
        type="button"
        className="radio-swap"
        aria-label={`Swap NAV${id} active and standby`}
        data-testid={`nav${id}-swap`}
        onClick={() => send({ type: 'swap', radio: id })}
      >
        ⇆
      </button>
      <ValueEntry
        testId={`nav${id}-standby`}
        text={formatMHz(r.standbyMHz)}
        parse={parseFrequency}
        onSet={(mhz) => send({ type: 'standby', radio: id, mhz })}
        name={`NAV${id} standby`}
        rangeHint="a NAV frequency, 108.00 to 117.95, in 0.05 steps"
        label="STBY"
        className="radio-freq"
        labelClassName="radio-label"
        valueClassName="radio-standby"
        maxLength={6}
        title="Click to type a frequency"
      />
      <div className="radio-knobs">
        <Knob
          small
          label="MHz"
          valueText={`NAV${id} standby ${formatMHz(r.standbyMHz)}`}
          testId={`nav${id}-mhz`}
          onTurn={(n) => send((s) => frequencyKnob(s, id, 'mhz', n))}
        />
        <Knob
          small
          label="kHz"
          valueText={`NAV${id} standby ${formatMHz(r.standbyMHz)}`}
          testId={`nav${id}-khz`}
          onTurn={(n) => send((s) => frequencyKnob(s, id, 'khz', n))}
        />
      </div>
      <IdentRow id={id} ident={ident} send={send} autoId={autoId} />
    </div>
  );
}

export function NavRadios({
  state,
  send,
  idents,
  autoId = false,
  gps,
}: {
  state: SimState;
  send: Send;
  idents: Idents;
  /** Glass panel: decoded idents shown next to the radios (auto-ID). */
  autoId?: boolean;
  /** RNAV flights (V3): the GPS unit, beside the radios, which then stack one per line. */
  gps?: ReactNode;
}) {
  const radios = (
    <>
      <NavRadio id={1} state={state} send={send} ident={idents[1]} autoId={autoId} />
      <NavRadio id={2} state={state} send={send} ident={idents[2]} autoId={autoId} />
    </>
  );
  if (!gps)
    return (
      <section className="radios" aria-label="Nav radios">
        {radios}
      </section>
    );
  return (
    <section className="radios radios-gps" aria-label="Nav radios and GPS">
      <div className="radios-col">{radios}</div>
      {gps}
    </section>
  );
}
