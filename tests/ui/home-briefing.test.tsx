import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NAVDATA, PROCEDURES, procedureById } from '../../src/procedures';
import { briefing, buildScenario } from '../../src/sim/scenario/scenario';
import { BriefingCard } from '../../src/ui/screens/Briefing';
import { Select } from '../../src/ui/screens/Select';

/** Text of every match of a tag inside an HTML fragment (static markup, no nesting). */
const textsOf = (html: string, tag: string) =>
  [...html.matchAll(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'gs'))].map((m) => m[1]!);

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

describe('home screen How to fly panel', () => {
  const html = renderToStaticMarkup(<Select procedures={PROCEDURES} onPick={() => {}} />);
  const panel = html.match(/<aside[^>]*data-testid="how-to-fly"[^>]*>(.*?)<\/aside>/s);

  it('is labelled and shows the five steps and the panel choice line', () => {
    expect(panel).not.toBeNull();
    expect(panel![0]).toMatch(/aria-labelledby="how-to-fly-title"/);
    expect(panel![1]).toContain('<h2 id="how-to-fly-title">How to fly</h2>');
    const ol = textsOf(panel![1]!, 'ol')[0]!;
    expect(textsOf(ol, 'li')).toEqual([
      'Pick an approach and start.',
      'Read the briefing and the plate.',
      'Tune and identify the navaids, then fly with the autopilot.',
      'At DA/MDA, land if the runway is in sight; otherwise press GA and fly the missed approach.',
      'Review the debrief.',
    ]);
    expect(textsOf(panel![1]!, 'p')).toEqual([
      'On the briefing, choose the Steam gauges or the Glass PFD.',
    ]);
  });

  it('still lists every approach', () => {
    for (const p of PROCEDURES) expect(html).toContain(`data-testid="pick-${p.id}"`);
  });
});

describe('briefing card chart notes', () => {
  const p = procedureById('kcfo-ils26')!;
  const sc = buildScenario(p, NAVDATA, {
    startId: p.starts[0]!.id,
    ceiling: 'above',
    gsOutOfService: false,
  });
  const b = briefing(sc);

  it('puts the notes in a closed details element and keeps hints visible', () => {
    expect(b.notes.length).toBeGreaterThan(0);
    expect(b.hints.length).toBeGreaterThan(0);
    const html = renderToStaticMarkup(<BriefingCard scenario={sc} />);
    const details = html.match(/<details([^>]*)>(.*?)<\/details>/s);
    expect(details).not.toBeNull();
    expect(details![1]).not.toMatch(/\bopen\b/);
    expect(textsOf(details![2]!, 'summary')).toEqual(['Details about this approach chart']);
    expect(textsOf(textsOf(details![2]!, 'ul')[0]!, 'li')).toEqual(b.notes.map(escape));
    // Hints sit outside the details, so they show without opening it.
    const before = html.slice(0, details!.index);
    expect(before).toContain('data-testid="brief-hints"');
    for (const h of b.hints) expect(before).toContain(escape(h));
  });

  it('leaves the notes out of the compact card', () => {
    const html = renderToStaticMarkup(<BriefingCard scenario={sc} compact />);
    expect(html).not.toContain('<details');
  });
});
