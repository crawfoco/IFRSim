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
| `expandedServiceVolumeNm` | optional: `{ "JNC": 50 }` when a charted route uses a VOR beyond its standard service volume |
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
| `direct` | `to`, `turn?`, `climbToFt?`, alt | "climbing right turn to 6100 direct AKO" |
| `hold` | `fix`, `inboundCourseMag`, `course`, `turn`, `legMinutes` or `legNm`, `climbInHold?`, alt | hold-in-lieu of PT, missed-approach hold |
| `procedureTurn` | `fix`, `course`, `outboundCourseMag`, `barbHeadingMag`, `inboundCourseMag`, `side`, `maxDistanceNm`, `minAltFt`, `inboundMinAltFt?` | barbed PT; `inboundMinAltFt` when the chart gives a lower altitude once established inbound |
| `final` | `faf`, `course`, `fafAltFt`, `glideslope?` (`angleDeg`, `tchFt`), `descentAngle?` (`angleDeg`, `tchFt`; advisory, non-precision), `stepDowns[]` (`fix`, `minAltFt`, `locOnly?`), `vdp?`, `map` (`fix`, `timing?` table of `groundspeedKt`/`seconds`) | final approach segment |

`track`, `procedureTurn` and `final` take an optional `dme`: the navaid whose DME the
learner must read on that leg, when the chart names one (KMTJ: `"dme": "MTJ"`). Without
it, `expectedDmeSource()` infers the source from the leg's fixes (an arc's navaid, a
`radialDme` fix's VOR, a `locDme` fix's `dmeFrom` or localizer).

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
  "transition": "fqf"
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
8. Calibrate the plate for the debrief's track overlay (next section).

## RNAV (GPS) procedures (V3)

RNAV approaches use the same file shape, plus:

- **`rnav`**: `{ "cifp": "KLAA R18", "waas": { "channel": "86613", "id": "W18A" } | null,
  "equipment": "RNP APCH." }`. `cifp` names the CIFP approach the file is cross-checked against
  (airport + CIFP ident, as in `WANTED_RNAV` in `scripts/navdata/wanted.ts`).
- **`navaids`** may be empty.
- **Fixes**: `{ "kind": "waypoint", "id": "LOLME" }` (an RNAV waypoint, a VOR used as a waypoint,
  or the runway waypoint `RW18`), resolved from the CIFP coordinates. Give `faaId` for named
  waypoints (checked against NASR) but not for the runway waypoint.
- **Course references**: `{ "rnavFrom": "OBOZU", "rnavTo": "LOLME" }` for a TF leg (the great
  circle between the waypoints), `{ "rnavFix": "OBOZU", "courseMag": 182.7 }` for a course through
  a fix (holds: use the CIFP course to the tenth).
- **Legs**:
  - each transition is the IAF's legs to the IF: `track` legs with `rnavFrom`/`rnavTo` (the first
    leg's `rnavFrom` is the IAF), or a single `hold` for a hold-in-lieu transition (CIFP `HF`);
  - `approach` holds the IF → FAF `track` legs, then the `final` with
    `course: { rnavFrom: FAF, rnavTo: MAP }`, `gp` (`angleDeg`, `tchFt`) when the plate has LPV or
    LNAV/VNAV, `descentAngle` for an advisory-only angle, and `stepDowns` (`lnavOnly` for an
    LNAV-only step-down, CIFP altitude description "V");
  - `missed`: `climb` (CIFP `CA`, the CIFP altitude), `direct` (`DF`, with `climbToFt`, `turn` and
    `flyOver` as coded), `track` (`TF`), and the `hold` (`HM`, `legNm`).
- **Minimums**: kinds `LPV` and `LNAV/VNAV` (DA), `LP` and `LNAV` (MDA), categories A and B.
- **Starts**: `position` is usually `{ "kind": "waypoint", "id": IAF }` with a lead-in; vectors
  starts have no `transition`.
- **TAA** (optional): `taa: { iaf, areas: [{ name, fromCourseMag, toCourseMag, noPT, rings:
  [{ withinNm, minAltFt }] }] }`, courses TO the IAF, clockwise from → to, rings inside out.

Register the file in `RNAV_PROCEDURES` (`src/procedures/index.ts`). Tests:

- `tests/procedures/cifp-check.test.ts` runs `checkAgainstCifp()` on every RNAV procedure: fix
  order, leg types, altitudes, holds, the glidepath and the minimums lines must match the CIFP.
- Golden GPS readings at every fix (`tests/procedures/klaa-rnav18.test.ts` is the model): desired
  track within 1° of the charted course, cross-track ~0, charted distances, GP at the TCH.
- Headless runs (`tests/integration/klaa-rnav18.test.ts`): load, activate, CDI on GPS, NAV/APR;
  LPV to a landing; LNAV with WAAS unavailable, GA, SUSP and the missed hold; perfect runs score
  100%.

Plate images for RNAV plates are kept at their native size (655 × 1010); the calibration stores
`imageW`/`imageH`, so expect about 17.8 px per NM instead of 19.4.

## Plate overlay calibration

The debrief's **Plate** tab draws the flown track on the plate's plan view. The plan view of an
FAA plate is drawn to scale and north-up (about 19.4 px per NM on our 715×1100 images), except
for insets and anything beyond a break symbol. Each plate gets a calibration in
`src/ui/chart/overlay.ts` (`PLATE_CALIBRATION`): anchor points measured on the image, fitted to
the sim's geography (scale, rotation, offset) at runtime.

1. `npm run plate -- candidates <id>` lists every anchor you can use (`{ "fix": … }`,
   `{ "navaid": … }`, `{ "loc": … }`) with its position, and the image size.
2. Read the whole plate. Find the plan view (between the frequency boxes and the profile) and
   what is **not to scale** inside it: the MSA circle, the airport sketch, and any leg or IAF
   beyond a zigzag break symbol. The plate's profile box is never to scale.
3. Pick at least four crisp anchors spread across the to-scale area, not all on one line:
   navaid symbol centres, fix triangles or ticks where they sit on the course, arc IAFs where the
   arc meets its radial, the runway threshold and the localizer antenna (if the runway is drawn
   in the plan view). Watch for: an arc's tangent point is not the fix (KLAR ECECU is the tick
   further along the course); arrow-line ends are not ticks (KSNY CHAKO).
4. Measure each to about a pixel with zoomed crops:
   `npm run plate -- crop <id> 6 name:x,y,w,h ...` writes `test-results/plates/<id>/name.png`;
   image pixel = crop origin + crop pixel ÷ scale.
5. Write the anchors to a JSON file and check them with
   `npm run plate -- fit <id> anchors.json`: expect 15–25 px/NM, |rotation| < 1°, every
   residual under 5 px. A large "left out" value marks a mis-measured anchor (unless the other
   anchors are nearly in a line).
6. Add the calibration with the plan view's rectangle (`planArea`) and the not-to-scale
   `insets` to mask (they must lie inside `planArea`). `tests/ui/plate-overlay.test.ts` checks
   every calibration against the same limits.

A plate with no calibration simply shows no track on the Plate tab.
