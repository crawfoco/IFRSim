/**
 * Glass PFD mode annunciator bar: lateral active (green) and armed (white) on the left, AP in
 * the middle, vertical active and armed on the right. Each field's text is keyed by its value,
 * so a change remounts it and replays the CSS flash (about 3 s; a steady highlight when the
 * user prefers reduced motion). Blank fields are not drawn.
 */
import type { ModeBarFields } from './modes';
import { MODE_BAR } from './layout';

const { x, y, w, h } = MODE_BAR;
const MID = y + h / 2;
const SLOTS = {
  lateral: x + 56,
  lateralArmed: x + 150,
  ap: x + w / 2,
  vertical: x + w - 170,
  verticalArmed: x + w - 56,
} as const;

function Field({
  id,
  text,
  cls,
  flashKey = text,
}: {
  id: keyof typeof SLOTS;
  text: string;
  cls: 'g-ann-active' | 'g-ann-armed';
  /** What a change must touch to replay the flash; default the text. */
  flashKey?: string;
}) {
  if (!text) return null;
  const testId = {
    lateral: 'pfd-ann-lateral',
    lateralArmed: 'pfd-ann-lateral-armed',
    ap: 'pfd-ann-ap',
    vertical: 'pfd-ann-vertical',
    verticalArmed: 'pfd-ann-vertical-armed',
  }[id];
  return (
    <text
      key={flashKey}
      className={`${cls} g-flash`}
      x={SLOTS[id]}
      y={MID}
      textAnchor="middle"
      dominantBaseline="central"
      data-testid={testId}
    >
      {text}
    </text>
  );
}

export function ModeBar({ fields }: { fields: ModeBarFields }) {
  return (
    <g data-testid="pfd-modes" aria-hidden="true">
      <rect className="g-modebar" x={x} y={y} width={w} height={h} />
      {[w / 2 - 40, w / 2 + 40].map((sx) => (
        <line
          key={sx}
          className="g-modebar-sep"
          x1={x + sx}
          y1={y + 3}
          x2={x + sx}
          y2={y + h - 3}
        />
      ))}
      <Field id="lateral" text={fields.lateral} cls="g-ann-active" />
      <Field id="lateralArmed" text={fields.lateralArmed} cls="g-ann-armed" />
      <Field id="ap" text={fields.ap ? 'AP' : ''} cls="g-ann-active" />
      {/* Keyed on the mode, so changing the VS target ("VS −500FPM" → "VS −1000FPM") doesn't flash. */}
      <Field
        id="vertical"
        text={fields.vertical}
        cls="g-ann-active"
        flashKey={fields.vertical.split(' ')[0] ?? ''}
      />
      <Field id="verticalArmed" text={fields.verticalArmed} cls="g-ann-armed" />
    </g>
  );
}
