/**
 * Glass PFD: attitude, airspeed and altitude tapes, VSI, HSI with bearing pointers, and the
 * selected-value boxes, DME window and bearing boxes, in one SVG (layout.ts). Props are derived by pfdData().
 */
import { AltTape } from './AltTape';
import { BearingBoxes } from './BearingBoxes';
import { DmeWindow } from './DmeWindow';
import { MinimumsAlert, MinimumsBox } from './MinimumsAlert';
import { ModeBar } from './ModeBar';
import type { ModeBarFields } from './modes';
import './hsi.css';
import { Attitude } from './Attitude';
import { GlassHsi } from './GlassHsi';
import { PFD_H, PFD_W } from './layout';
import type { PfdData } from './pfd-data';
import { SelectedBoxes } from './SelectedBoxes';
import { SpeedTape } from './SpeedTape';
import { VsiScale } from './VsiScale';
import './glass.css';

export function Pfd({
  data,
  modes,
  minimumsAlert = false,
}: {
  data: PfdData;
  /** Mode bar text; null shows an empty bar (e.g. the dev gallery). */
  modes: ModeBarFields | null;
  minimumsAlert?: boolean;
}) {
  const { attitude, speed, alt, vsi, hsi, boxes, dme, brg1, brg2 } = data;
  return (
    <figure className="glass-pfd" data-testid="pfd">
      <svg
        viewBox={`0 0 ${PFD_W} ${PFD_H}`}
        role="img"
        aria-label={`Glass PFD: ${Math.round(speed.iasKt)} knots, ${Math.round(alt.altitudeFt)} feet, heading ${Math.round(hsi.headingMagDeg)}`}
      >
        <Attitude {...attitude} />
        <SpeedTape {...speed} />
        <AltTape {...alt} />
        <VsiScale {...vsi} />
        <GlassHsi {...hsi} />
        <SelectedBoxes {...boxes} />
        <MinimumsBox minimums={alt.minimums} />
        <DmeWindow dme={dme} />
        <BearingBoxes brg1={brg1} brg2={brg2} />
        <ModeBar
          fields={
            modes ?? { ap: false, lateral: '', lateralArmed: '', vertical: '', verticalArmed: '' }
          }
        />
        <MinimumsAlert on={minimumsAlert} />
      </svg>
    </figure>
  );
}
