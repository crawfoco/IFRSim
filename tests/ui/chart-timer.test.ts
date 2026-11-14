import { describe, expect, it } from 'vitest';
import { PROCEDURES } from '../../src/procedures';
import { chartCycleText, zoomAbout } from '../../src/ui/chart/ChartViewer';
import { formatTimer } from '../../src/ui/panel/Timer';

describe('chart viewer', () => {
  it('zooms about the pointer, clamped to 0.5–4×', () => {
    const v = zoomAbout({ x: 0, y: 0, zoom: 1 }, 2, 100, 50);
    expect(v).toEqual({ zoom: 2, x: -100, y: -50 }); // the point under (100, 50) stays put
    expect(zoomAbout({ x: 0, y: 0, zoom: 4 }, 2, 0, 0).zoom).toBe(4);
    expect(zoomAbout({ x: 0, y: 0, zoom: 0.5 }, 0.5, 0, 0).zoom).toBe(0.5);
  });

  it('shows chart number, amendment and cycle dates', () => {
    expect(chartCycleText(PROCEDURES[0]!)).toBe(
      'AL-6851 Amdt 6B · valid 29 OCT 2026 to 26 NOV 2026',
    );
  });
});

describe('timer', () => {
  it('formats mm:ss', () => {
    expect(formatTimer(0)).toBe('00:00');
    expect(formatTimer(59.99)).toBe('00:59');
    expect(formatTimer(60)).toBe('01:00');
    expect(formatTimer(754.2)).toBe('12:34');
  });
});
