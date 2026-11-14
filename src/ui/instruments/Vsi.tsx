import { vsiNeedleDeg } from './geometry';
import { Dial, Hub, Label, Needle, Tick } from './dial';

export function Vsi({ vsFpm }: { vsFpm: number }) {
  const marks = [];
  for (let fpm = -2000; fpm <= 2000; fpm += 100) {
    const deg = vsiNeedleDeg(fpm);
    const major = fpm % 500 === 0;
    marks.push(<Tick key={fpm} deg={deg} r1={major ? 74 : 82} r2={90} w={major ? 3 : 1.5} />);
    if (major) {
      marks.push(
        <Label key={`l${fpm}`} deg={deg} r={62}>
          {Math.abs(fpm) / 100}
        </Label>,
      );
    }
  }
  const rounded = Math.round(vsFpm / 10) * 10;
  return (
    <Dial
      label="Vertical speed"
      summary={
        rounded === 0
          ? 'level'
          : `${rounded > 0 ? 'climbing' : 'descending'} ${Math.abs(rounded)} feet per minute`
      }
      testId="vsi"
    >
      {marks}
      <text className="inst-unit" x={128} y={72} textAnchor="middle">
        UP
      </text>
      <text className="inst-unit" x={128} y={134} textAnchor="middle">
        DN
      </text>
      <text className="inst-unit inst-small" x={112} y={103} textAnchor="start">
        FPM ×100
      </text>
      <Needle deg={vsiNeedleDeg(vsFpm)} length={86} testId="vsi-needle" />
      <Hub />
    </Dial>
  );
}
