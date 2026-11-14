# Nav data review (M1 checkpoint)

Source: FAA NASR, cycle **2026-10-29** (extracted 2026-11-14). Generated from `src/procedures/navdata.json`. Positions are WGS84/NAD83 decimal degrees; variation is east-positive.

Automated checks (`tests/procedures/navdata.test.ts`) confirm every frequency, channel, localizer course, TDZE and TCH below against the plates, and that every fix sits at its charted radial/DME (±1.5°, ±0.2 NM).

## Airports

| Airport | Name | Lat | Lon | Elev ft | Mag var |
|---|---|---|---|---|---|
| KCFO | COLORADO AIR AND SPACE PORT | 39.78419 | -104.53764 | 5515 | +8° (2015) |
| KGXY | GREELEY-WELD COUNTY | 40.43742 | -104.63322 | 4697 | +8° (2015) |
| KMTJ | MONTROSE RGNL | 38.50981 | -107.89425 | 5758 | +12° (1995) |
| KAKO | COLORADO PLAINS RGNL | 40.17564 | -103.22203 | 4716 | +10° (2000) |
| KLAR | LARAMIE RGNL | 41.31206 | -105.67499 | 7284 | +13° (1980) |
| KSNY | SIDNEY MUNI/LLOYD W CARR FLD | 41.09976 | -102.98499 | 4314 | +11° (1980) |

## Runway ends

| Runway | Threshold lat | lon | TDZE ft | True hdg | VGSI TCH ft | Displaced threshold |
|---|---|---|---|---|---|---|
| CFO 26 | 39.79356 | -104.53678 | 5489 | 271° | 50 | — |
| GXY 35 | 40.42883 | -104.63086 | 4665 | 357° | 51 | 1100 ft |
| MTJ 17 | 38.52983 | -107.89274 | 5708 | 180° | 55 | — |
| AKO 29 | 40.17093 | -103.21111 | 4683 | 299° | 43 | — |
| LAR 30 | 41.30760 | -105.66498 | 7278 | 315° | 41 | — |
| SNY 13 | 41.10772 | -102.99376 | 4314 | 135° | 45 | — |

## VOR navaids

| ID | Name | Type | Freq | Chan | Station declination | Service volume |
|---|---|---|---|---|---|---|
| FQF | FALCON | VORTAC | 116.3 | 110X | +11° (1995) | H |
| GLL | GILL | VOR/DME | 114.2 | 89X | +13° (1970) | H |
| AKO | AKRON | VOR/DME | 114.4 | 91X | +13° (1965) | H |
| LAR | LARAMIE | VOR/DME | 117.6 | 123X | +14° (1965) | L |
| SNY | SIDNEY | VOR/DME | 115.9 | 106X | +13° (1965) | H |
| MTJ | MONTROSE | VOR/DME | 117.1 | 118X | +12° (1995) | H |
| JNC | GRAND JUNCTION | VOR/DME | 112.4 | 71X | +15° (1965) | H |
| CYS | CHEYENNE | VORTAC | 113.1 | 78X | +13° (1965) | H |
| DVV | MILE HIGH | VORTAC | 114.7 | 94X | +8° (2015) | H |

## Localizers

| ID | Runway | Type | Freq | Course (mag) | Var | GS angle | DME |
|---|---|---|---|---|---|---|---|
| I-FTG | CFO 26 | LD | 109.3 | 263.17° | +8° | 3° | 30X |
| I-DCI | GXY 35 | LD | 110.3 | 349.81° | +8° | 3° | 40X |
| I-MTJ | MTJ 17 | LG | 111.3 | 167.82° | +12° | 3° | none (use MTJ VOR/DME) |

## Fixes

| Fix | State | Lat | Lon | Use |
|---|---|---|---|---|
| SKIPI | CO | 39.79173 | -104.42404 | RP |
| CFNRM | CO | 39.79034 | -104.33757 | CN |
| WELDS | CO | 40.21737 | -104.62033 | RP |
| BUFFS | CO | 40.33263 | -104.62606 | RP |
| ARTSS | CO | 40.39684 | -104.62926 | RP |
| CEDUK | CO | 40.27444 | -104.37477 | RP |
| WAVDI | CO | 40.25364 | -104.35868 | RP |
| KROMM | CO | 40.78473 | -104.63978 | RP |
| BRUUK | CO | 38.75265 | -107.89364 | RP |
| WIDRU | CO | 38.65293 | -107.89324 | RP |
| ZIMVI | CO | 38.58484 | -107.89296 | RP |
| PAGRE | CO | 38.66033 | -108.14528 | RP |
| HAQHY | CO | 38.82005 | -108.08862 | RP |
| GEJYU | CO | 38.78829 | -107.68545 | RP |
| DIRDY | CO | 38.93005 | -107.51509 | RP |
| MEYRS | CO | 38.47966 | -107.46276 | RP |
| GERON | CO | 40.06387 | -102.99832 | RP |
| POVOH | WY | 41.44480 | -105.34853 | RP |
| JESAR | WY | 41.28634 | -105.32874 | RP |
| ECECU | WY | 41.16260 | -105.39802 | RP |
| DMYIH | WY | 41.09472 | -105.27383 | CN |
| FLEMS | WY | 41.00981 | -105.25606 | RP |
| GARBE | WY | 41.28001 | -105.61401 | RP |
| HEMBI | WY | 41.22861 | -105.51927 | RP |
| DUCBE | WY | 41.20035 | -105.46731 | RP |
| JUNAD | NE | 41.24316 | -103.12927 | RP |
| CHAKO | NE | 41.16325 | -103.04938 | RP |
| JIKUT | NE | 41.10763 | -102.99392 | RP |
| RIYOP | NE | 41.09356 | -102.74055 | RP |
| OGJUN | CO | 40.94597 | -103.12111 | RP |

## Things to know

- **VOR declinations are old** (e.g. LAR, AKO, SNY 1965; GLL 1970). Radials are aligned to the station
  declination, not today's variation, so the sim uses each VOR's declination for radials and the
  airport/ILS variation for headings and localizer courses. All charted radials check out this way.
- **KMTJ ILS has no DME of its own** (NASR type LG = LOC/GS). The plate says to use MTJ VOR/DME, which
  is exactly the "DME from the wrong source" lesson in the spec.
- **ILS TCH vs VGSI TCH**: NASR only publishes the visual glide path TCH. It matches the plates except
  KMTJ (NASR 55 ft VGSI vs plate GS TCH 56 ft). The procedure files will carry the plate's GS TCH.
- **KGXY 35 has a 1,100 ft displaced threshold**; the glideslope geometry uses the published GS antenna position.
- CFNRM and DMYIH are computer-navigation fixes (CN) that appear on the plates; the rest are reporting points.
