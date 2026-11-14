/** Shared drawing pieces for round instruments (viewBox 0 0 200 200, centre 100,100). */
import type { ReactNode } from 'react';

export const C = 100;

/** Point at `r` from the centre, `deg` clockwise from 12 o'clock. */
export function polar(deg: number, r: number, cx = C, cy = C): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

export const fmt = (n: number) => Number(n.toFixed(2));

/** SVG rotate() about a centre, rounded so markup is stable. */
export const rotate = (deg: number, cx = C, cy = C) => `rotate(${fmt(deg)} ${cx} ${cy})`;

export function Tick({ deg, r1, r2, w = 2 }: { deg: number; r1: number; r2: number; w?: number }) {
  const [x1, y1] = polar(deg, r1);
  const [x2, y2] = polar(deg, r2);
  return <line className="inst-mark" x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={w} />;
}

export function Label({ deg, r, children }: { deg: number; r: number; children: ReactNode }) {
  const [x, y] = polar(deg, r);
  return (
    <text className="inst-label" x={x} y={y} textAnchor="middle" dominantBaseline="central">
      {children}
    </text>
  );
}

/** A round instrument case with an accessible name and a live text summary. */
export function Dial({
  label,
  summary,
  children,
  testId,
}: {
  label: string;
  summary: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <figure className="inst" data-testid={testId}>
      <svg viewBox="0 0 200 200" role="img" aria-label={`${label}: ${summary}`}>
        <circle className="inst-bezel" cx={C} cy={C} r={99} />
        <circle className="inst-face" cx={C} cy={C} r={92} />
        {children}
      </svg>
      <figcaption className="inst-caption">{label}</figcaption>
    </figure>
  );
}

/** Needle drawn pointing to 12 o'clock, then rotated. */
export function Needle({
  deg,
  length,
  width = 4,
  className = 'inst-needle',
  testId,
}: {
  deg: number;
  length: number;
  width?: number;
  className?: string;
  testId: string;
}) {
  const w = width / 2;
  return (
    <g data-testid={testId} transform={rotate(deg)}>
      <path
        className={className}
        d={`M ${C - w} ${C + 14} L ${C - w} ${C - length + 8} L ${C} ${C - length} L ${C + w} ${C - length + 8} L ${C + w} ${C + 14} Z`}
      />
    </g>
  );
}

export function Hub() {
  return <circle className="inst-hub" cx={C} cy={C} r={6} />;
}
