import { useEffect, useState } from 'react';
import { PROCEDURES } from '../procedures';
import type { Procedure } from '../procedures/schema';
import type { Scenario } from '../sim/scenario/scenario';
import { Gallery } from './dev/Gallery';
import { Briefing } from './screens/Briefing';
import { Flight } from './screens/Flight';
import { Select } from './screens/Select';

type Screen =
  | { name: 'select' }
  | { name: 'briefing'; procedure: Procedure }
  | { name: 'flight'; scenario: Scenario; key: number };

/** Approach select → briefing → flight. #/gallery shows the dev instrument gallery. */
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
        />
      );
  }
}
