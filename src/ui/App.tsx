import { useEffect, useState } from 'react';
import { NAVDATA, PROCEDURES, RNAV_PROCEDURES } from '../procedures';
import type { Procedure } from '../procedures/schema';
import type { LoggedCommand } from '../sim/recorder';
import { rerollWeather, type Scenario } from '../sim/scenario/scenario';
import { Debrief } from './screens/Debrief';
import { Gallery } from './dev/Gallery';
import { Briefing } from './screens/Briefing';
import { Flight } from './screens/Flight';
import { Select } from './screens/Select';

type Screen =
  | { name: 'select' }
  | { name: 'briefing'; procedure: Procedure }
  | { name: 'flight'; scenario: Scenario; key: number }
  | { name: 'debrief'; scenario: Scenario; log: readonly LoggedCommand[]; endTick: number };

/** Approach select → briefing → flight → debrief. #/gallery shows the dev instrument gallery. */
export function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  const [screen, setScreen] = useState<Screen>({ name: 'select' });
  // Load every plate up front, so the app keeps working with no network after loading.
  useEffect(() => {
    for (const p of [...PROCEDURES, ...RNAV_PROCEDURES])
      new Image().src = `${import.meta.env.BASE_URL}${p.chart.image}`;
  }, []);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // A new flight gets new hidden weather, so the outcome at minimums is not known in advance.
  const flyAgain = (sc: Scenario) =>
    setScreen({
      name: 'flight',
      scenario: rerollWeather(sc, NAVDATA, Math.random()),
      key: Date.now(),
    });

  if (hash === '#/gallery') return <Gallery />;
  switch (screen.name) {
    case 'select':
      return (
        <Select
          procedures={PROCEDURES}
          rnavProcedures={RNAV_PROCEDURES}
          onPick={(procedure) => setScreen({ name: 'briefing', procedure })}
        />
      );
    case 'briefing':
      return (
        <Briefing
          procedure={screen.procedure}
          onBack={() => setScreen({ name: 'select' })}
          onFly={(scenario) => setScreen({ name: 'flight', scenario, key: Date.now() })}
        />
      );
    case 'flight':
      return (
        <Flight
          key={screen.key}
          scenario={screen.scenario}
          onExit={() => setScreen({ name: 'briefing', procedure: screen.scenario.procedure })}
          onFlyAgain={() => flyAgain(screen.scenario)}
          onDebrief={(log, endTick) =>
            setScreen({ name: 'debrief', scenario: screen.scenario, log, endTick })
          }
        />
      );
    case 'debrief':
      return (
        <Debrief
          scenario={screen.scenario}
          log={screen.log}
          endTick={screen.endTick}
          onFlyAgain={() => flyAgain(screen.scenario)}
          onMainMenu={() => setScreen({ name: 'select' })}
        />
      );
  }
}
