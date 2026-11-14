import { useEffect, useState } from 'react';
import { Gallery } from './dev/Gallery';
import { Flight } from './screens/Flight';

/** Hash routes: #/gallery is the dev instrument gallery; everything else is the flight screen. */
export function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return hash === '#/gallery' ? <Gallery /> : <Flight />;
}
