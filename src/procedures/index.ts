/** All procedures, parsed and validated at load time. */
import kakoVor29 from './kako-vor29.json';
import kcfoIls26 from './kcfo-ils26.json';
import kgxyIls35 from './kgxy-ils35.json';
import kcysIls27 from './kcys-ils27.json';
import klarVor30 from './klar-vor30.json';
import kcezVor21 from './kcez-vor21.json';
import kskxVordmeB from './kskx-vordme-b.json';
import kmtjIls17 from './kmtj-ils17.json';
import ksnyVor13 from './ksny-vor13.json';
import klaaRnav18 from './klaa-rnav18.json';
import kogaRnav8 from './koga-rnav8.json';
import kbffRnav12 from './kbff-rnav12.json';
import kpubRnav26l from './kpub-rnav26l.json';
import kcprRnav3 from './kcpr-rnav3.json';
import kapaRnav28 from './kapa-rnav28.json';
import kcosRnav31 from './kcos-rnav31.json';
import kalsRnav2 from './kals-rnav2.json';
import kcnyRnav3 from './kcny-rnav3.json';
import navdataJson from './navdata.json';
import type { NavData } from '../sim/navdata/types';
import { parseProcedure, type Procedure } from './schema';

export const NAVDATA = navdataJson as NavData;

/** In the order the select screen lists them: ILS approaches, then VOR approaches. */
export const PROCEDURES: readonly Procedure[] = [
  parseProcedure(kcfoIls26, 'kcfo-ils26.json'),
  parseProcedure(kgxyIls35, 'kgxy-ils35.json'),
  parseProcedure(kmtjIls17, 'kmtj-ils17.json'),
  parseProcedure(kcysIls27, 'kcys-ils27.json'),
  parseProcedure(kakoVor29, 'kako-vor29.json'),
  parseProcedure(klarVor30, 'klar-vor30.json'),
  parseProcedure(ksnyVor13, 'ksny-vor13.json'),
  parseProcedure(kcezVor21, 'kcez-vor21.json'),
  parseProcedure(kskxVordmeB, 'kskx-vordme-b.json'),
];

/** RNAV (GPS) approaches (V3), listed on the select screen's RNAV tab. */
export const RNAV_PROCEDURES: readonly Procedure[] = [
  parseProcedure(klaaRnav18, 'klaa-rnav18.json'),
  parseProcedure(kogaRnav8, 'koga-rnav8.json'),
  parseProcedure(kbffRnav12, 'kbff-rnav12.json'),
  parseProcedure(kpubRnav26l, 'kpub-rnav26l.json'),
  parseProcedure(kcprRnav3, 'kcpr-rnav3.json'),
  parseProcedure(kapaRnav28, 'kapa-rnav28.json'),
  parseProcedure(kcosRnav31, 'kcos-rnav31.json'),
  parseProcedure(kalsRnav2, 'kals-rnav2.json'),
  parseProcedure(kcnyRnav3, 'kcny-rnav3.json'),
];

export function procedureById(id: string): Procedure | undefined {
  return [...PROCEDURES, ...RNAV_PROCEDURES].find((p) => p.id === id);
}
