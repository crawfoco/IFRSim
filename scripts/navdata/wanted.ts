/**
 * The navaids, fixes, localizers and runways the V1 approaches use (SPEC.md → V1 Content).
 * Adding an approach means adding its items here and re-running `npm run navdata`.
 */
export const WANTED = {
  airports: ['CFO', 'GXY', 'MTJ', 'AKO', 'LAR', 'SNY'],
  runwayEnds: [
    ['CFO', '26'],
    ['GXY', '35'],
    ['MTJ', '17'],
    ['AKO', '29'],
    ['LAR', '30'],
    ['SNY', '13'],
  ] as const,
  navaids: ['FQF', 'GLL', 'AKO', 'LAR', 'SNY', 'MTJ', 'JNC', 'CYS', 'DVV'],
  /** Localizer idents without the I- prefix, with airport to disambiguate. */
  localizers: [
    ['FTG', 'CFO'],
    ['DCI', 'GXY'],
    ['MTJ', 'MTJ'],
  ] as const,
  /** Fix idents are not unique nationally: key on ident + state. */
  fixes: [
    // KCFO ILS 26
    ['SKIPI', 'CO'],
    ['CFNRM', 'CO'],
    // KGXY ILS 35
    ['WELDS', 'CO'],
    ['BUFFS', 'CO'],
    ['ARTSS', 'CO'],
    ['CEDUK', 'CO'],
    ['WAVDI', 'CO'],
    ['KROMM', 'CO'],
    // KMTJ ILS 17
    ['BRUUK', 'CO'],
    ['WIDRU', 'CO'],
    ['ZIMVI', 'CO'],
    ['PAGRE', 'CO'],
    ['HAQHY', 'CO'],
    ['GEJYU', 'CO'],
    ['DIRDY', 'CO'],
    ['MEYRS', 'CO'],
    // KAKO VOR 29
    ['GERON', 'CO'],
    // KLAR VOR/DME 30
    ['POVOH', 'WY'],
    ['JESAR', 'WY'],
    ['ECECU', 'WY'],
    ['DMYIH', 'WY'],
    ['FLEMS', 'WY'],
    ['GARBE', 'WY'],
    ['HEMBI', 'WY'],
    ['DUCBE', 'WY'],
    // KSNY VOR/DME 13
    ['JUNAD', 'NE'],
    ['CHAKO', 'NE'],
    ['JIKUT', 'NE'],
    ['RIYOP', 'NE'],
    ['OGJUN', 'CO'],
  ] as const,
};

export type Wanted = typeof WANTED;
