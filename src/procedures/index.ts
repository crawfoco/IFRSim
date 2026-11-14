/** All V1 procedures, parsed and validated at load time. */
import kcfoIls26 from './kcfo-ils26.json';
import navdataJson from './navdata.json';
import type { NavData } from '../sim/navdata/types';
import { parseProcedure, type Procedure } from './schema';

export const NAVDATA = navdataJson as NavData;

export const PROCEDURES: readonly Procedure[] = [parseProcedure(kcfoIls26, 'kcfo-ils26.json')];

export function procedureById(id: string): Procedure | undefined {
  return PROCEDURES.find((p) => p.id === id);
}
