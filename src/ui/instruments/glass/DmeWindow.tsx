/**
 * Glass PFD DME window, left of the HSI: "DME", the source radio (NAV1/NAV2), the paired
 * station (ident when received, else the frequency) and the distance, or dashes with no DME.
 * Always shown; the source is the panel's DME SRC selector (the one the scoring checks).
 */
import { DME_BOX } from './layout';
import type { DmeInfo } from './pfd-data';

export function dmeLines(d: DmeInfo): { station: string; distance: string } {
  return {
    station: d.ident ?? d.freqMHz.toFixed(2),
    distance: d.dmeNm === null ? '---.- NM' : `${d.dmeNm.toFixed(1)} NM`,
  };
}

export function DmeWindow({ dme }: { dme: DmeInfo }) {
  const { x, y, w, h } = DME_BOX;
  const { station, distance } = dmeLines(dme);
  const tx = x + 8;
  return (
    <g data-testid="pfd-dme" data-no-dme={dme.dmeNm === null || undefined}>
      <rect className="g-box" x={x} y={y} width={w} height={h} rx={3} />
      <text className="g-text-sm" x={tx} y={y + 11} dominantBaseline="central">
        DME
      </text>
      <text
        className="g-dme-text"
        x={x + w - 8}
        y={y + 11}
        textAnchor="end"
        dominantBaseline="central"
        data-testid="pfd-dme-source"
      >
        {dme.source}
      </text>
      <text
        className="g-dme-text"
        x={tx}
        y={y + 27}
        dominantBaseline="central"
        data-testid="pfd-dme-station"
      >
        {station}
      </text>
      <text
        className="g-dme-nm"
        x={tx}
        y={y + 43}
        dominantBaseline="central"
        data-testid="pfd-dme-nm"
      >
        {distance}
      </text>
    </g>
  );
}
