import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NAVDATA, PROCEDURES, procedureById } from '../../src/procedures';
import { briefing, buildScenario } from '../../src/sim/scenario/scenario';
import { Briefing, BriefingCard } from '../../src/ui/screens/Briefing';
import { Select } from '../../src/ui/screens/Select';

/** Text of every match of a tag inside an HTML fragment (static markup, no nesting). */
const textsOf = (html: string, tag: string) =>
  [...html.matchAll(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'gs'))].map((m) => m[1]!);

const escape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

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
      'At DA/MDA, if the runway is in sight, continue and the sim lands automatically; if not, press GA and fly the missed approach.',
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
  // KAKO has both chart notes and a trainer hint (MAP by DME).
  const p = procedureById('kako-vor29')!;
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

  it('the compact (flight) card leaves minimums and the missed approach to the plate', () => {
    const compact = renderToStaticMarkup(<BriefingCard scenario={sc} compact />);
    expect(compact).not.toContain('brief-minimums');
    expect(compact).not.toContain('Missed approach');
    expect(compact).toContain('brief-weather');
    const full = renderToStaticMarkup(<BriefingCard scenario={sc} />);
    expect(full).toContain('brief-minimums');
    expect(full).toContain('Missed approach');
  });
});

describe('briefing choices', () => {
  const html = renderToStaticMarkup(
    <Briefing procedure={procedureById('kcfo-ils26')!} onBack={() => {}} onFly={() => {}} />,
  );

  it('runway at minimums: Surprise me (random, the default), in sight, or not in sight', () => {
    expect(html).toContain('Runway at minimums');
    expect(html).toMatch(/data-testid="weather-random"[^>]*\/>Surprise me</);
    expect(html).toMatch(/<input[^>]*data-testid="weather-random"[^>]*checked=""/);
    expect(html).not.toMatch(/<input[^>]*data-testid="weather-above"[^>]*checked=""/);
    expect(html).toContain('data-testid="weather-above"');
    expect(html).toContain('data-testid="weather-below"');
  });

  it('panel: steam gauges or Glass PFD', () => {
    expect(html).toContain('data-testid="panel-steam"');
    expect(html).toContain('data-testid="panel-glass"');
  });
});

describe('approach list order', () => {
  it('lists the approaches alphabetically by airport', () => {
    const html = renderToStaticMarkup(<Select procedures={PROCEDURES} onPick={() => {}} />);
    const airports = [...html.matchAll(/class="select-airport">([^<]*)</g)].map((m) => m[1]!);
    expect(airports).toHaveLength(PROCEDURES.length);
    expect(airports).toEqual([...airports].sort());
    expect(airports[0]).toBe('KAKO');
  });
});
