/**
 * Bearing pointer info boxes: BRG1 bottom left, BRG2 bottom right. Each shows the pointer
 * symbol, its source (NAV1/NAV2), the station ident when received (the frequency otherwise)
 * and DME when available. A localizer or no usable station: "NO BRG" (no pointer drawn).
 */
import type { BearingInfo } from '../../../sim/nav/bearing';
import { BRG1_BOX, BRG2_BOX } from './layout';

type Box = { x: number; y: number; w: number; h: number };

/** One- or two-line pointer symbol, pointing right, drawn in the box header. */
function Symbol({ x, y, double }: { x: number; y: number; double: boolean }) {
  const shaft = double ? `M ${x} ${y - 3} h 16 M ${x} ${y + 3} h 16` : `M ${x} ${y} h 18`;
  return (
    <path
      className="g-hsi-brg"
      d={`${shaft} M ${x + 13} ${y - 6} L ${x + 21} ${y} L ${x + 13} ${y + 6}`}
    />
  );
}

export function bearingLines(info: BearingInfo): [string, string, string] {
  const station = info.ident ?? info.freqMHz.toFixed(2);
  const dme = info.dmeNm === null ? '---.- NM' : `${info.dmeNm.toFixed(1)} NM`;
  return [info.source, info.bearingMagDeg === null ? `${station}  NO BRG` : station, dme];
}

function BearingBox({ n, box, info }: { n: 1 | 2; box: Box; info: BearingInfo }) {
  const [source, station, dme] = bearingLines(info);
  const noBrg = info.bearingMagDeg === null;
  const { x, y, w, h } = box;
  const right = n === 2;
  // BRG1 reads left to right; BRG2 is mirrored toward the screen edge.
  const tx = right ? x + w - 8 : x + 8;
  const anchor = right ? 'end' : 'start';
  return (
    <g data-testid={`pfd-brg${n}-box`} data-no-brg={noBrg || undefined}>
      <rect className="g-box" x={x} y={y} width={w} height={h} rx={3} />
      <Symbol x={right ? x + 8 : x + w - 30} y={y + 11} double={n === 2} />
      <text className="g-brg-text" x={tx} y={y + 12} textAnchor={anchor} dominantBaseline="central">
        BRG{n} {source}
      </text>
      <text
        className={noBrg ? 'g-brg-nobrg' : 'g-brg-text'}
        x={tx}
        y={y + 30}
        textAnchor={anchor}
        dominantBaseline="central"
        data-testid={`pfd-brg${n}-station`}
      >
        {station}
      </text>
      <text
        className="g-brg-text"
        x={tx}
        y={y + 48}
        textAnchor={anchor}
        dominantBaseline="central"
        data-testid={`pfd-brg${n}-dme`}
      >
        {dme}
      </text>
    </g>
  );
}

export function BearingBoxes({
  brg1,
  brg2,
}: {
  brg1: BearingInfo | null;
  brg2: BearingInfo | null;
}) {
  return (
    <g data-testid="pfd-brg-boxes">
      {brg1 && <BearingBox n={1} box={BRG1_BOX} info={brg1} />}
      {brg2 && <BearingBox n={2} box={BRG2_BOX} info={brg2} />}
    </g>
  );
}
