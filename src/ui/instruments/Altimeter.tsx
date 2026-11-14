import { altimeterHandsDeg } from './geometry';
import { Dial, Hub, Label, Needle, Tick } from './dial';

export function Altimeter({ altitudeFt }: { altitudeFt: number }) {
  const { hundreds, thousands } = altimeterHandsDeg(altitudeFt);
  const marks = [];
  for (let i = 0; i < 50; i++) {
    const deg = i * 7.2;
    const major = i % 5 === 0;
    marks.push(<Tick key={i} deg={deg} r1={major ? 76 : 84} r2={90} w={major ? 3 : 1.5} />);
    if (major)
      marks.push(
        <Label key={`l${i}`} deg={deg} r={64}>
          {i / 5}
        </Label>,
      );
  }
  const shown = Math.round(altitudeFt / 10) * 10;
  return (
    <Dial label="Altimeter" summary={`${shown} feet`} testId="altimeter">
      {marks}
      <rect className="inst-window" x={64} y={112} width={72} height={24} rx={3} />
      <text
        className="inst-digits"
        x={100}
        y={125}
        textAnchor="middle"
        dominantBaseline="central"
        data-testid="altimeter-digits"
      >
        {shown.toLocaleString('en-US')}
      </text>
      <text className="inst-unit inst-small" x={100} y={84} textAnchor="middle">
        FEET
      </text>
      <Needle deg={thousands} length={52} width={8} testId="altimeter-thousands" />
      <Needle deg={hundreds} length={84} testId="altimeter-hundreds" />
      <Hub />
    </Dial>
  );
}
