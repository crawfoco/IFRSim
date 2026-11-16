/**
 * V2 acceptance, criterion 1: every start condition of every procedure on the glass panel.
 * The sim does not branch on the panel (the V1 integration tests fly all starts); this checks
 * the Glass PFD shows sane values for each start: after a minute on the autopilot, with both
 * bearing pointers on, the PFD renders with no NaN/Infinity and the readouts match the state.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NAVDATA, PROCEDURES } from '../../src/procedures';
import { SimRunner } from '../../src/sim/recorder';
import { activeMinimums, buildScenario, panelOf } from '../../src/sim/scenario/scenario';
import { sense } from '../../src/sim/sensors';
import { modeBarFields } from '../../src/ui/instruments/glass/modes';
import { Pfd } from '../../src/ui/instruments/glass/Pfd';
import { pfdData } from '../../src/ui/instruments/glass/pfd-data';

const starts = PROCEDURES.flatMap((p) => p.starts.map((s) => [p, s] as const));

describe('Glass PFD at every start condition', () => {
  it('covers all 20 starts', () => {
    expect(starts).toHaveLength(20);
  });

  for (const [p, start] of starts) {
    it(`${p.id} / ${start.id}`, () => {
      const sc = buildScenario(p, NAVDATA, {
        startId: start.id,
        ceiling: 'above',
        gsOutOfService: false,
        panel: 'glass',
      });
      expect(panelOf(sc.options)).toBe('glass');
      const r = new SimRunner(sc.initial, sc.world);
      r.enqueue({ type: 'button', button: 'AP' });
      r.enqueue({ type: 'button', button: 'HDG' });
      r.enqueue({ type: 'bearing', pointer: 1 });
      r.enqueue({ type: 'bearing', pointer: 2 });
      r.enqueue({ type: 'bearing', pointer: 2 });
      r.runSeconds(60);
      const s = r.state;
      const mins = activeMinimums(p, false, s.panel.iasCmdKt);
      const d = pfdData(s, sense(s, sc.world), sc.world, mins);
      const html = renderToStaticMarkup(<Pfd data={d} modes={modeBarFields(s.ap)} />);
      expect(html).not.toMatch(/NaN|Infinity|undefined/);
      expect(html).toMatch(/data-testid="pfd-ann-lateral"[^>]*>HDG</);
      expect(html).toMatch(/data-testid="pfd-brg1-box"/);
      expect(html).toMatch(/data-testid="pfd-brg2-box"/);
      expect(html).toMatch(
        new RegExp(`data-testid="pfd-mins-box-value"[^>]*>${mins.altFt.toLocaleString('en-US')}<`),
      );
      expect(html).toMatch(
        new RegExp(`data-testid="pfd-ias"[^>]*>${Math.round(s.aircraft.iasKt)}<`),
      );
    });
  }
});
