/**
 * Approach plate viewer: drag to pan, wheel or +/− to zoom (about the pointer), Fit to
 * reset. Keyboard: arrows pan, +/− zoom, 0 fits. Always carries the training banner and
 * the chart's cycle dates.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { TRAINING_DISCLAIMER } from '../../app-info';
import type { Procedure } from '../../procedures/schema';
import './chart.css';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;
const PAN_STEP_PX = 60;

interface View {
  x: number;
  y: number;
  zoom: number;
}

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Zoom by `factor` keeping the content point under (px, py) fixed. */
export function zoomAbout(v: View, factor: number, px: number, py: number): View {
  const zoom = clampZoom(v.zoom * factor);
  const k = zoom / v.zoom;
  return { zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
}

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
    .toUpperCase();

export function chartCycleText(p: Procedure): string {
  return `${p.chart.number} ${p.chart.amendment} · valid ${fmtDate(p.chart.validFrom)} to ${fmtDate(p.chart.validTo)}`;
}

export function ChartViewer({ procedure }: { procedure: Procedure }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const f = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      setView((v) => zoomAbout(v, f, e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomCentre = (f: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    setView((v) => zoomAbout(v, f, (r?.width ?? 0) / 2, (r?.height ?? 0) / 2));
  };
  const fit = () => setView({ x: 0, y: 0, zoom: 1 });

  const onPointerDown = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const pan = (dx: number, dy: number) => setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    const actions: Record<string, () => void> = {
      ArrowLeft: () => pan(PAN_STEP_PX, 0),
      ArrowRight: () => pan(-PAN_STEP_PX, 0),
      ArrowUp: () => pan(0, PAN_STEP_PX),
      ArrowDown: () => pan(0, -PAN_STEP_PX),
      '+': () => zoomCentre(ZOOM_STEP),
      '=': () => zoomCentre(ZOOM_STEP),
      '-': () => zoomCentre(1 / ZOOM_STEP),
      '0': fit,
    };
    const a = actions[e.key];
    if (a) {
      e.preventDefault();
      a();
    }
  };

  return (
    <div className="chart">
      <div className="chart-banner" role="note">
        {TRAINING_DISCLAIMER} · <span data-testid="chart-cycle">{chartCycleText(procedure)}</span>
      </div>
      <div
        ref={boxRef}
        className="chart-box"
        tabIndex={0}
        role="img"
        aria-label={`${procedure.airport} ${procedure.name} approach plate. Drag or use arrow keys to pan, plus and minus to zoom, 0 to fit.`}
        data-testid="chart"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={onKeyDown}
      >
        <img
          src={`${import.meta.env.BASE_URL}${procedure.chart.image}`}
          alt=""
          draggable={false}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        />
      </div>
      <div className="chart-tools">
        <button type="button" onClick={() => zoomCentre(ZOOM_STEP)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoomCentre(1 / ZOOM_STEP)} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={fit}>
          Fit
        </button>
        <span className="chart-zoom">{Math.round(view.zoom * 100)}%</span>
      </div>
    </div>
  );
}
