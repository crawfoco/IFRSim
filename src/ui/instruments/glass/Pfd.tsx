/**
 * Glass PFD: attitude, airspeed and altitude tapes, VSI, HSI with bearing pointers, and the
 * selected-value boxes, in one SVG (layout.ts). Props are derived by pfdData().
 */
import { AltTape } from './AltTape';
import { BearingBoxes } from './BearingBoxes';
import './hsi.css';
import { Attitude } from './Attitude';
import { GlassHsi } from './GlassHsi';
import { PFD_H, PFD_W } from './layout';
import type { PfdData } from './pfd-data';
import { SelectedBoxes } from './SelectedBoxes';
import { SpeedTape } from './SpeedTape';
import { VsiScale } from './VsiScale';
import './glass.css';

export function Pfd({ data }: { data: PfdData }) {
  const { attitude, speed, alt, vsi, hsi, boxes, brg1, brg2 } = data;
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
        <BearingBoxes brg1={brg1} brg2={brg2} />
      </svg>
    </figure>
  );
}
