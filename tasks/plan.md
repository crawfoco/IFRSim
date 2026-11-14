# Implementation Plan: IFRSim V1

Status: draft, awaiting review
Spec: [SPEC.md](../SPEC.md) (approved V1)
Tasks: [todo.md](todo.md)

## Approach

Build the simulation core first, test-first and headless, then put the thinnest
possible UI on it so a real approach can be flown in the browser early
(**Milestone 3**). After that, widen: full procedure model, scoring and debrief,
then the remaining five approaches. Every milestone ends in something runnable
and checkable.

## Components and dependencies

```
            navdata (FAA NASR/CIFP extract, dev-time only)
                 │
   geo ──► nav receivers ──► autopilot ──► sim loop / recorder ──► scoring ──► debrief UI
    │            ▲              ▲              ▲      │
    └──► aircraft model ────────┘              │      └──► flight UI (instruments, panel, radios)
                                                │
              procedure JSON + schema ──► scenario (start conditions, briefing, end conditions)
```

| Component | Location | Depends on | Notes |
|---|---|---|---|
| geo | `src/sim/geo` | — | Spherical-earth bearing/distance, local east/north projection, magnetic ↔ true |
| navdata | `scripts/navdata/`, `src/procedures/navdata.json` | geo | Dev-time script downloads NASR + CIFP into `data/raw/` (git-ignored) and writes a small JSON with only the navaids/fixes/runways we use, plus the source cycle |
| procedure model | `src/procedures/` | navdata | Zod schema + one JSON per approach; fixes defined chart-style (navaid + radial/DME, or LOC + DME) and checked against FAA coordinates |
| nav receivers | `src/sim/nav` | geo, navdata | VOR, LOC, GS, DME; flags, ranges; Morse ident strings |
| aircraft | `src/sim/aircraft` | geo | Point mass, standard-rate turns, VS and speed limits |
| autopilot | `src/sim/autopilot` | nav, aircraft | Mode state machine (armed/active) + control laws |
| sim loop | `src/sim/loop.ts` | all of the above | Fixed 20 Hz step, commands in, snapshots out, input log for replay |
| scenario | `src/sim/scenario` | procedure, loop | Start conditions, briefing text, weather/GS-outage, end conditions |
| scoring | `src/sim/scoring` | scenario, procedure | Leg sequencer + rule checks over the recorded flight |
| UI | `src/ui` | snapshots and commands only | React + SVG; never changes sim state directly |

## Key design decisions

1. **The sim is a pure reducer.** `step(state, commands, dt) → state`. The UI sends
   commands such as `setHeadingBug(263)` and `apprArm()`, and renders snapshots.
   Recording the inputs gives exact replays and lets integration tests "fly" an
   approach in milliseconds.
2. **Fixes are stored the way the chart defines them** (e.g. `{ ref: "I-FTG", dmeNm: 7, onCourse: "LOC" }`),
   with resolved lat/lon cached by the data script. A test fails if the resolved
   point is more than 0.1 NM from the FAA coordinate. This catches encoding mistakes.
3. **Leg sequencer for scoring.** The scorer tracks which procedure leg the learner
   is on (by fix passage and course alignment) and checks only that leg's rules
   (min altitude, expected navaid, PT distance). This avoids judging everything
   against every segment at once.
4. **Hold entry / procedure-turn checks are geometric and simplified**: classify the
   entry from the heading at fix crossing (70° sector rule), and check the turn side,
   maximum distance and minimum altitude. No full TERPS protected-area modelling.
5. **Magnetic variation:** each VOR uses its published station declination from
   NASR; the localizer course is the published magnetic course; the HSI and heading
   use the airport's magnetic variation. Tested per navaid.

## Proposed dependencies (approval of this plan = approval of these)

Runtime: `react`, `react-dom`, `zod`.
Dev: `typescript`, `vite`, `@vitejs/plugin-react`, `vitest`, `@vitest/coverage-v8`,
`@playwright/test`, `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`,
`prettier`, `tsx` (to run the navdata script).
Playwright downloads a Chromium build on first install (one-time, from Microsoft's CDN).
No other network use.

## Milestones and checkpoints

| # | Milestone | Ends with (checkpoint) |
|---|---|---|
| M0 | Scaffold | `npm run dev` shows a placeholder page; `npm test`, `typecheck`, `lint` and `test:e2e` all run green |
| M1 | Geo + nav data | `navdata.json` for all six airports; geo golden tests pass; **you check the extracted navaid list** |
| M2 | Sim core | Receivers, aircraft, autopilot, loop all test-first; a headless test flies KCFO "vectors to final" to DA within half-scale |
| M3 | **Thin flyable slice** | In the browser: HSI, altimeter, VSI, ASI, DME, NAV1/NAV2, AP panel; fly KCFO ILS 26 from vectors to DA. **You fly it and give feedback on feel and layout** |
| M4 | Full procedure + scenario | Procedure schema; full KCFO encoding (feeder, SKIPI hold, LOC-only, missed); approach select → briefing → flight; chart viewer, timer, Morse ident, pause/speed, ceiling and missed approach end condition |
| M5 | Scoring + debrief | All spec scoring rules; debrief plan view, profile, timeline and replay; scripted good/bad KCFO runs score as expected |
| M6 | Remaining approaches | KGXY, KMTJ, KAKO, KLAR, KSNY encoded with start conditions, golden tests and scripted runs; arcs, barbed PTs, FROM-station final, DME-from-VOR, climb-in-hold |
| M7 | Polish + V1 acceptance | Moving-map toggle, layout for tablet/desktop, perf (60 fps, 4×), offline check, full e2e; walk through every spec success criterion |

**Parallel work:** after M2, the instrument SVG components (M3) and procedure
encoding for the other airports (M6 data part) are independent and can proceed
side by side. Scoring (M5) needs the procedure model (M4).

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| NASR/CIFP file formats are awkward (fixed-width ARINC 424; CSV schemas change) | M1 slips | Only parse the few record types we need; keep the raw-file parsers small and tested on checked-in snippets |
| Real data disagrees with the chart (e.g. declination, DME offsets) | Needles look "wrong" vs the plate | Golden tests are written from the chart's own numbers; mismatches above tolerance are investigated, not tuned away |
| Autopilot laws overshoot or oscillate, especially LOC capture near the station and GS capture | Feels wrong; scripted runs fail | Tune against the M2 headless tests with explicit overshoot limits; gain-schedule on distance for LOC |
| Scoring false positives (e.g. "below segment altitude" while legitimately on a different leg) | Learner distrust | Leg sequencer (decision 3), plus a "bad run" test for every rule and a "perfect run" test that must score 100% |
| Hold/PT geometry edge cases (entry sector boundaries) | Wrong verdicts | Accept ±5° tolerance at sector boundaries, documented in the debrief text |
| Chart images for six approaches add weight | Slower load | Serve as PNGs from `public/charts/`, lazy-loaded per approach |

## Verification between milestones

Every milestone: `npm test`, `npm run typecheck`, `npm run lint` and (from M3)
`npm run test:e2e` pass, and work is committed. M1 and M3 have explicit human
checkpoints (data review, hands-on flight); M7 is the V1 acceptance review against
SPEC.md's success criteria.
