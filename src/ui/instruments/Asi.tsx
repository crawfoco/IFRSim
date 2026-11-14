import { asiNeedleDeg, ASI_MAX_KT, ASI_MIN_KT } from './geometry';
import { Dial, Hub, Label, Needle, Tick } from './dial';

export function Asi({ iasKt }: { iasKt: number }) {
  const ticks = [];
  for (let kt = ASI_MIN_KT; kt <= ASI_MAX_KT; kt += 10) {
    const deg = asiNeedleDeg(kt);
    const major = kt % 20 === 0;
    ticks.push(<Tick key={kt} deg={deg} r1={major ? 74 : 80} r2={90} w={major ? 3 : 2} />);
    if (major)
      ticks.push(
        <Label key={`l${kt}`} deg={deg} r={60}>
          {kt}
        </Label>,
      );
  }
  return (
    <Dial label="Airspeed" summary={`${Math.round(iasKt)} knots`} testId="asi">
      {ticks}
      <text className="inst-unit" x={100} y={128} textAnchor="middle">
        KNOTS
      </text>
      <Needle deg={asiNeedleDeg(iasKt)} length={86} testId="asi-needle" />
      <Hub />
    </Dial>
  );
}
