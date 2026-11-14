# Procedure encoding

Each approach is one JSON file in `src/procedures/<id>.json`, validated by the zod
schema in `src/procedures/schema.ts` when the app loads (`src/procedures/index.ts`).
A file that does not match fails with every problem and its path, for example:

```
kcfo-ils26.json is invalid:
✖ Too big: expected number to be <=120
  → at starts[0].iasKt
✖ unknown fix "NOWHERE"
  → at approach[0].faf
```

## Conventions

- Courses, radials and headings are **magnetic**, as printed on the chart. VOR radials
  use the station's declination; localizer courses use the localizer's variation.
- Altitudes are feet MSL. `minAltFt` = at or above (underlined on the chart),
  `maxAltFt` = at or below (overlined). Both = mandatory block.
- Distances are NM. DME values are as charted.
- Navaid identifiers match `navdata.json`: VORs by ident (`FQF`), localizers with the
  `I-` prefix (`I-FTG`).

## Top level

| Field | Meaning |
|---|---|
| `id` | kebab-case file id, e.g. `kcfo-ils26` |
| `airport`, `runway` | ICAO airport (`KCFO`) and runway (`26`) |
| `name` | chart title |
| `chart` | `number` (AL-6851), `amendment`, `validFrom`/`validTo` (chart cycle, ISO dates), `image` (path under `public/`) |
| `navaids` | every navaid the procedure is flown on (used by the tuning/ident checks) |
| `fixes` | named fixes, defined chart-style (below) |
| `transitions` | feeder / initial routes, each ending where `approach` starts |
| `approach` | legs everyone flies: the final (and anything after the transitions) |
| `missed`, `missedText` | missed-approach legs, and the instructions as printed |
| `minimums` | straight-in minimums per approach type, categories A and B |
| `starts` | start conditions offered in free practice |
| `notes` | chart notes shown in the briefing |

## Fixes

```json
"SKIPI": { "def": { "kind": "locDme", "loc": "I-FTG", "dmeNm": 7 }, "faaId": "SKIPI" }
```

| `kind` | Fields | Meaning |
|---|---|---|
| `navaid` | `navaid` | the station itself |
| `radialDme` | `navaid`, `radialMag`, `dmeNm` | on a VOR radial (or a magnetic bearing from a localizer antenna) at a distance |
| `locDme` | `loc`, `dmeNm`, `dmeFrom?` | on the localizer course at a DME reading; `dmeFrom` names a VOR/DME when the DME is not the ILS's own (KMTJ: `"dmeFrom": "MTJ"`) |
| `threshold` | — | the landing threshold (displaced threshold if there is one) |

Give `faaId` for every named waypoint. `checkAgainstNavdata()` (run by the tests)
fails if the chart-style definition resolves more than **0.1 NM** from the FAA
coordinate, which catches typos in radials and DME values.

## Course references

- VOR: `{ "navaid": "FQF", "courseMag": 45, "toFrom": "FROM" }`
- Localizer front course: `{ "loc": "I-FTG" }`

## Legs

| `type` | Fields | Use |
|---|---|---|
| `track` | `to`, `course`, alt | feeder, intermediate, missed-approach course to a fix |
| `arc` | `to`, `navaid`, `radiusNm`, `fromRadialMag`, `toRadialMag`, `turn`, `leadRadialMag?`, alt | DME arc (flown in HDG; no arc mode) |
| `heading` | `headingMag`, `turn?`, `intercept?`, `climbToFt?`, alt | heading to intercept, missed-approach heading |
| `climb` | `toAltFt` | straight-ahead climb before the first missed-approach turn |
| `direct` | `to`, alt | "direct AKO" |
| `hold` | `fix`, `inboundCourseMag`, `course`, `turn`, `legMinutes` or `legNm`, `climbInHold?`, alt | hold-in-lieu of PT, missed-approach hold |
| `procedureTurn` | `fix`, `course`, `outboundCourseMag`, `barbHeadingMag`, `inboundCourseMag`, `side`, `maxDistanceNm`, `minAltFt` | barbed PT |
| `final` | `faf`, `course`, `fafAltFt`, `glideslope?` (`angleDeg`, `tchFt`), `stepDowns[]` (`fix`, `minAltFt`, `locOnly?`), `vdp?`, `map` (`fix`, `timing?` table of `groundspeedKt`/`seconds`) | final approach segment |

The course reversal belongs to the transition that needs it (KCFO: the FQF feeder
ends with the SKIPI hold-in-lieu). A route marked NoPT on the chart sets
`"noPT": true`; flying a reversal on it is reported in the debrief as a note.

## Minimums

```json
{ "kind": "ILS", "label": "S-ILS 26", "A": { "altFt": 5689, "visibilitySm": 0.5 }, "B": { ... } }
```

`ILS` minimums are a decision altitude; `LOC` and `VOR` are an MDA. The power
selector sets the category: A at 90 KIAS or less, B above.

## Start conditions

```json
{
  "id": "over-fqf",
  "name": "Over FQF, via the R-045 feeder",
  "clearance": "Cross FQF at or above 8000, cleared ILS runway 26 approach via the FQF 045 radial.",
  "position": { "kind": "navaid", "navaid": "FQF" },
  "altitudeFt": 8000, "headingMag": 360, "iasKt": 100,
  "transition": "fqf",
  "nav1MHz": 116.3, "nav2MHz": 116.3
}
```

`position` uses the same definitions as fixes. Omit `transition` for radar vectors to
final. Radios start as the learner would find them; tuning is part of the exercise.
Weather (ceiling above or below minimums) and a glideslope outage are scenario
options chosen on the briefing screen, not part of the start condition.

## Checklist for a new procedure

1. Copy an existing file; set `id`, airport, runway, chart block and image.
2. Define every charted fix with its chart definition and `faaId`.
3. Encode transitions, the final and the missed approach, leg by leg from the plan
   and profile views.
4. Copy the straight-in minimums (A and B).
5. Add start conditions, each with a clearance a controller would actually give.
6. Register the file in `src/procedures/index.ts`.
7. `npm test`: the schema and the navdata cross-check must pass, then add golden
   receiver tests at every fix (`tests/procedures/<id>.test.ts`).
