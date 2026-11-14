/** All V1 procedures, parsed and validated at load time. */
import kakoVor29 from './kako-vor29.json';
import kcfoIls26 from './kcfo-ils26.json';
import kgxyIls35 from './kgxy-ils35.json';
import klarVor30 from './klar-vor30.json';
import kmtjIls17 from './kmtj-ils17.json';
import ksnyVor13 from './ksny-vor13.json';
import navdataJson from './navdata.json';
import type { NavData } from '../sim/navdata/types';
import { parseProcedure, type Procedure } from './schema';

export const NAVDATA = navdataJson as NavData;

/** In the order the select screen lists them: ILS approaches, then VOR approaches. */
export const PROCEDURES: readonly Procedure[] = [
  parseProcedure(kcfoIls26, 'kcfo-ils26.json'),
  parseProcedure(kgxyIls35, 'kgxy-ils35.json'),
  parseProcedure(kmtjIls17, 'kmtj-ils17.json'),
  parseProcedure(kakoVor29, 'kako-vor29.json'),
  parseProcedure(klarVor30, 'klar-vor30.json'),
  parseProcedure(ksnyVor13, 'ksny-vor13.json'),
];

export function procedureById(id: string): Procedure | undefined {
  return PROCEDURES.find((p) => p.id === id);
}
