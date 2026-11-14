/** Dev gallery (#/gallery): every instrument in representative states, for visual checks. */
import { Altimeter } from '../instruments/Altimeter';
import { Asi } from '../instruments/Asi';
import { Cdi } from '../instruments/Cdi';
import { DmeReadout } from '../instruments/DmeReadout';
import { Hsi, type HsiProps } from '../instruments/Hsi';
import { Vsi } from '../instruments/Vsi';
import '../instruments/instruments.css';

const HSI_CASES: { title: string; props: HsiProps }[] = [
  {
    title: 'ILS established, slightly high',
    props: {
      headingMagDeg: 263,
      headingBugDeg: 263,
      courseDeg: 263,
      deviation: { dots: 0, flag: false, toFrom: null },
      glideslope: { dots: -0.5, flag: false },
    },
  },
  {
    title: 'Intercepting LOC from the left, 30° cut',
    props: {
      headingMagDeg: 293,
      headingBugDeg: 293,
      courseDeg: 263,
      deviation: { dots: -1.6, flag: false, toFrom: null },
      glideslope: { dots: 2, flag: false },
    },
  },
  {
    title: 'VOR, FROM, needle 1 dot right',
    props: {
      headingMagDeg: 40,
      headingBugDeg: 10,
      courseDeg: 45,
      deviation: { dots: 1, flag: false, toFrom: 'FROM' },
      glideslope: null,
    },
  },
  {
    title: 'Untuned / out of range',
    props: {
      headingMagDeg: 120,
      headingBugDeg: 200,
      courseDeg: 0,
      deviation: { dots: 0, flag: true, toFrom: null },
      glideslope: { dots: 0, flag: true },
    },
  },
];

export function Gallery() {
  return (
    <main className="gallery">
      <h1>Instrument gallery</h1>
      <section className="gallery-grid">
        {HSI_CASES.map((c) => (
          <div key={c.title} className="gallery-cell">
            <Hsi {...c.props} />
            <p>{c.title}</p>
          </div>
        ))}
      </section>
      <section className="gallery-grid">
        <div className="gallery-cell">
          <Cdi obsDeg={45} deviation={{ dots: 0, flag: false, toFrom: 'TO' }} />
          <p>CDI centred, TO</p>
        </div>
        <div className="gallery-cell">
          <Cdi obsDeg={136} deviation={{ dots: -2, flag: false, toFrom: 'FROM' }} />
          <p>CDI full left, FROM</p>
        </div>
        <div className="gallery-cell">
          <Cdi obsDeg={270} deviation={{ dots: 0, flag: true, toFrom: null }} />
          <p>CDI flagged</p>
        </div>
      </section>
      <section className="gallery-grid">
        <div className="gallery-cell">
          <Asi iasKt={100} />
          <p>100 KIAS</p>
        </div>
        <div className="gallery-cell">
          <Altimeter altitudeFt={7250} />
          <p>7,250 ft</p>
        </div>
        <div className="gallery-cell">
          <Vsi vsFpm={-700} />
          <p>−700 fpm</p>
        </div>
        <div className="gallery-cell">
          <Vsi vsFpm={1000} />
          <p>+1000 fpm</p>
        </div>
      </section>
      <section className="gallery-grid">
        <div className="gallery-cell">
          <DmeReadout nm={12.3} source={1} />
        </div>
        <div className="gallery-cell">
          <DmeReadout nm={null} source={2} />
        </div>
      </section>
    </main>
  );
}
