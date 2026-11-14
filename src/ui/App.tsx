import { useEffect, useState } from 'react';
import { PROCEDURES } from '../procedures';
import type { Procedure } from '../procedures/schema';
import type { LoggedCommand } from '../sim/recorder';
import type { Scenario } from '../sim/scenario/scenario';
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
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (hash === '#/gallery') return <Gallery />;
  switch (screen.name) {
    case 'select':
      return (
        <Select
          procedures={PROCEDURES}
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
          onFlyAgain={() =>
            setScreen({ name: 'flight', scenario: screen.scenario, key: Date.now() })
          }
          onBriefing={() => setScreen({ name: 'briefing', procedure: screen.scenario.procedure })}
        />
      );
  }
}
