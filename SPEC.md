# Spec: IFR Approach Trainer (IFRSim) — V1

Status: approved (V1)

## Objective

**Problem.** Learning to fly an instrument approach means reading a dense approach
plate, working out where you are from needles and DME alone, and then flying the
procedure fix by fix. Full flight simulators bury that skill under stick-and-rudder
workload; static chart study never makes you *fly* it.

**Solution.** A browser-based trainer where the learner flies an approach by driving
a generic light-aircraft autopilot and nav radios. The aircraft flies itself
perfectly; the learner's job is purely procedural: read the plate, tune and
identify navaids, set courses, headings and altitudes, sequence the fixes, fly
holds and arcs, and either land or execute the missed approach.

**User.** Instrument students and rated pilots keeping current. Assumed to know
basic instrument concepts (VOR, localizer, DME, glideslope). The app does not teach
these from scratch.

**Mode (V1).** Free practice only: choose an approach and a start condition, read
the briefing, fly it, and get a debrief with a score. No step-by-step coaching.

### User stories and acceptance criteria

1. **Pick and brief an approach.**
   *As a learner, I want to choose an approach and a starting situation so that I
   practise a specific scenario.*
   - The approach list shows each procedure by airport, name and chart cycle.
   - Start conditions are defined per procedure (e.g. "over FQF VOR, heading 360,
     8000 ft, cleared ILS 26 via the FQF R-045 feeder"; "radar vectors to final";
     "arriving on the GLL 17.5 DME arc").
   - The briefing shows the clearance text, ceiling/visibility and whether the
     glideslope is in service. In free practice, the user picks the start condition
     or chooses "random".
   - The approach plate image is viewable at any time (pan/zoom, side panel or
     full screen).

2. **Fly by instruments.**
   *As a learner, I want only the instruments a real pilot would have so that I
   practise building situational awareness.*
   - Instruments: HSI (course needle, to/from flag, glideslope pointer, heading
     bug), altimeter, VSI, airspeed, DME readout with selectable source (NAV1/NAV2),
     OBS/CDI for NAV2, and a stopwatch/timer.
   - Two nav radios (NAV1, NAV2), each with active/standby frequency, flip-flop
     and Morse ident (audio and dot/dash text).
   - Needles behave like real receivers: full-scale ±10° for VOR, ±2.5° for the
     localizer, ±0.7° for the glideslope, to/from logic, a flag when out of range
     or untuned.
   - The moving map is **off by default**. It can be toggled on as a training aid,
     and toggling it is recorded in the debrief.

3. **Drive the autopilot.**
   *As a learner, I want a familiar GA autopilot so that the skills transfer to
   the aircraft.*
   - Generic panel (not a replica of any brand) with AP on/off, HDG, NAV, APR, ALT,
     VS, and knobs for heading bug, course, altitude preselect and vertical-speed
     target.
   - Mode logic includes **armed vs. active** states: NAV/APR arm and then capture
     when the needle comes alive; GS arms in APR and captures from below; ALT
     preselect captures and levels off. The mode annunciator shows lateral and
     vertical modes, active and armed.
   - Power selector for target airspeed (90–120 KIAS, default 100). Speed
     determines the approach category used for minimums (A ≤ 90, B 91–120).

4. **Fly the whole procedure.**
   *As a learner, I want to fly feeder routes, DME arcs, holds, the final approach
   and the missed approach so that I practise the complete plate.*
   - Course reversals: the hold-in-lieu at SKIPI (KCFO) and at WELDS (KGXY) can be
     flown with direct, parallel or teardrop entries, using HDG mode and the timer.
   - Barbed procedure turns (KAKO at GERON, KLAR at ECECU, KSNY at CHAKO): outbound
     leg, 45° turn, timed leg, 180° turn back to intercept inbound, staying within
     the charted distance (10 NM) and at or above the procedure-turn altitude.
   - VOR finals flown both TO the station (KLAR, KSNY) and FROM it (KAKO). The MAP
     is identified by DME, or by the FAF-to-MAP timing table where the chart gives
     one (KAKO).
   - DME arcs (GLL 17.5, MTJ 14.8, AKO 10, LAR 18, SNY 11): flown in HDG mode using the lead-radial / 10°-step
     technique. The autopilot has no arc mode, by design.
   - Step-down fixes on the localizer, identified by DME.
   - "LOC only" variant: glideslope out of service. The learner flies to the MDA
     using step-downs and identifies the missed approach point.
   - At DA/MDA: if the scenario's ceiling is at or above minimums, the runway is
     reported in sight and the approach ends. Otherwise the learner must execute
     the published missed approach, enter the missed-approach hold and fly one full
     circuit; the scenario then ends. Missed-approach hold entry and leg timing
     are scored like any other hold.

5. **Debrief and score.**
   *As a learner, I want an objective debrief so that I know what I did wrong.*
   - Debrief shows the flown track over a plan view of the procedure, an altitude
     profile against the chart profile, and a timeline of events.
   - Scored items, each with pass/fail and the measured value:
     - descended below a segment's minimum altitude (by more than 100 ft);
     - wrong or missed navaid tuning/identification before use;
     - fixes flown out of order or skipped;
     - localizer deviation more than half scale inside the FAF;
     - glideslope deviation more than half scale inside the FAF (ILS only);
     - hold entry type matches the correct entry for the arrival heading;
     - procedure turn flown on the correct side, within the charted distance,
       and not below its minimum altitude;
     - DME read from the wrong source (e.g. KMTJ: DME on the localizer instead
       of MTJ VOR/DME);
     - continued below DA/MDA without runway in sight;
     - missed approach flown per the published instructions;
     - moving map used (informational, not a penalty);
     - course reversal flown on a NoPT route (informational note explaining
       why it needs ATC approval, not a penalty).
   - The debrief can be replayed at 1×, 4× or 16× speed.

6. **Control time.**
   *As a learner, I want to pause and speed up time so that long legs don't waste
   my practice time.*
   - Pause, 1×, 2× and 4× simulation speed. Restart the scenario.

### Non-goals (V1)
See **Out of Scope** below.

## Domain Model

- **Coordinate system.** Navaids and fixes stored as lat/lon. The simulation runs in
  a local flat-earth east/north projection (metres) centred on the airport. Error is
  under 0.1% within the 30 NM area of interest. All bearings on the instruments are
  **magnetic**, using each procedure's stated magnetic variation.
- **Navaids.** VOR, VOR/DME, VORTAC, localizer + DME, glideslope (angle, TCH,
  threshold position). Each has an identifier, frequency, position, service range
  and magnetic variation (VOR station declination where it differs).
- **Fixes.** Defined the way the chart defines them, e.g. *I-FTG 7 DME on the
  localizer*, *GLL R-136 / 16 DME*. Their lat/lon is derived from the navaid data
  and checked against FAA published coordinates.
- **Procedure.** Ordered legs: feeder/initial (course or radial plus altitude), arc,
  hold-in-lieu (fix, inbound course, turn direction, leg time, altitude),
  heading-to-intercept, barbed procedure turn (side, outbound course, max distance,
  min altitude), final (FAF, step-downs, VDP, DA/MDA per category, MAP by DME or
  by timing), missed approach (climb, turn, heading/radial or direct-to, hold,
  climb-in-hold). Minimums table by category. One JSON file per procedure
  under `src/procedures/`.
- **Aircraft (simple, no wind).** Point mass. Standard-rate turns (3°/s, max 25°
  bank); bank and turn rate ramp in over about 2 s. Climb/descent at the commanded
  vertical speed, limited to −1500…+1000 fpm. Airspeed set by the power selector,
  changing at about 2 kt/s. No wind, no turbulence, no failures (except the
  scripted glideslope outage).
- **Autopilot.** A deterministic state machine that is separate from the UI. Lateral
  modes: ROL (wings level), HDG, NAV (VOR/LOC), APR (LOC). Vertical modes: PIT
  (hold vertical speed), VS, ALT, GS. NAV/APR/GS have an *armed* state. Capture
  uses a standard proportional intercept law with a 45° maximum intercept angle.
- **Simulation loop.** Fixed time step (20 Hz) independent of the frame rate; the
  speed multiplier runs extra steps. Given the same scenario and the same inputs,
  the output is identical, so tests and debrief replays are exact.

## V1 Content

| Procedure | Covers |
|---|---|
| KCFO ILS or LOC RWY 26 (AL-6851, Amdt 6B) | VOR radial feeder (FQF R-045), hold-in-lieu at SKIPI, ILS and LOC-only final, missed approach to SKIPI hold |
| KGXY ILS or LOC RWY 35 (AL-325, Amdt 3A) | DME arc (GLL 17.5) from WAVDI, hold-in-lieu at WELDS, step-downs, missed approach to CEDUK hold (GLL R-136/16 DME) |
| KMTJ ILS or LOC RWY 17 (AL-668, Amdt 3A) | ILS where DME comes from a **separate VOR/DME** (MTJ), so the learner must tune NAV1 = I-MTJ and NAV2 = MTJ and set the DME source to NAV2. Also: MTJ 14.8 DME arc from PAGRE, feeder from HAQHY (JNC R-098), step-downs by MTJ DME, missed approach with climb-in-hold at PAGRE |
| KAKO VOR RWY 29 (AL-5054, Orig-C) | VOR approach flown **outbound from the station** (FROM) with the FAF at the VOR. MAP by DME (AKO 1.7) or by FAF-to-MAP timing table. AKO 10 DME arcs from two IAFs, barbed procedure turn at GERON, MDA, missed approach direct AKO and hold |
| KLAR VOR/DME RWY 30 (AL-225, Amdt 7B) | VOR/DME approach **inbound to the station** with several step-downs (GARBE, HEMBI, DUCBE) by DME and an MDA. LAR 18 DME arc from POVOH/JESAR, barbed procedure turn at ECECU, heading-to-intercept feeder from FLEMS (337° hdg to DMYIH), missed approach with climb-in-hold at LAR |
| KSNY VOR/DME RWY 13 (AL-875, Amdt 5D) | VOR/DME inbound with the VOR on the field. MAP at JIKUT (SNY 0.8), VDP at SNY 1.9. SNY 11 DME arcs from RIYOP and OGJUN, barbed procedure turn at CHAKO, missed approach direct SNY and hold |

On KMTJ, the RNAV feeders from DIRDY, MYERS and GEJYU need GPS, so no start
condition uses them. Arrivals the chart marks "Procedure NA" are also excluded.

Charts are FAA-published and public domain. Each is shown with a fixed **"Training
use only — not for navigation"** banner and its cycle dates.

## Tech Stack

- TypeScript (strict), Vite, React 19 for the UI shell and panels.
- Instruments drawn as **SVG** React components (crisp, testable, no canvas library).
- Moving map / debrief plan view: SVG with pan/zoom.
- Simulation core (`src/sim`) is **framework-free TypeScript** and does not depend
  on React or the DOM.
- Vitest for unit tests, Playwright for end-to-end tests.
- **Fully static and offline**: no backend, no accounts, no analytics or telemetry,
  no third-party CDNs at runtime. Fonts and assets are bundled.

## Commands

```
Install:    npm install
Dev:        npm run dev            # Vite dev server, http://localhost:5173
Build:      npm run build          # tsc --noEmit && vite build → dist/
Preview:    npm run preview
Unit tests: npm test               # vitest run
Watch:      npm run test:watch
Coverage:   npm test -- --coverage
E2E:        npm run test:e2e       # playwright test (against vite preview)
Lint:       npm run lint           # eslint .
Typecheck:  npm run typecheck      # tsc --noEmit
```

## Project Structure

```
SPEC.md                 → this document
docs/                   → architecture notes, procedure-encoding guide
Charts/                 → source approach plate images (FAA)
src/
  sim/
    geo/                → projection, bearings, distances, magvar
    nav/                → VOR, LOC, GS, DME receivers; CDI/flag logic; Morse ident
    aircraft/           → point-mass flight model
    autopilot/          → mode state machine and control laws
    scenario/           → scenario definition, start conditions, end conditions
    scoring/            → event recorder, rule checks, score
    loop.ts             → fixed-step simulation loop and replay
  procedures/           → one JSON per procedure + schema (zod)
  ui/
    instruments/        → HSI, altimeter, VSI, ASI, DME, timer (SVG)
    panel/              → autopilot panel, nav radios, power selector
    chart/              → plate viewer (pan/zoom)
    map/                → optional moving map, debrief plan/profile views
    screens/            → approach select, briefing, flight, debrief
  main.tsx
tests/                  → Vitest unit/integration tests, mirroring src/sim
e2e/                    → Playwright tests
public/charts/          → plate images served to the app
```

## Code Style

- Strict TypeScript, no `any`. Units in names when not obvious: `altitudeFt`,
  `distanceNm`, `headingDegMag`, `vsFpm`. Angles in degrees at module boundaries
  and radians only inside math helpers.
- Sim code is pure functions over plain state objects. The UI reads snapshots of
  that state and sends commands; it never changes sim state directly.

```ts
// src/sim/nav/vor.ts
export interface VorIndication {
  deviationDeg: number;      // + = needle right (course is to the right)
  toFrom: 'TO' | 'FROM' | 'OFF';
}

export function vorIndication(
  aircraft: LatLon, station: Vor, obsDegMag: number,
): VorIndication {
  if (distanceNm(aircraft, station.position) > station.rangeNm) {
    return { deviationDeg: 0, toFrom: 'OFF' };
  }
  const radialMag = normalize360(bearingTrueDeg(station.position, aircraft) - station.declinationDeg);
  const diff = signedAngleDiff(radialMag, obsDegMag);          // −180..180, + = clockwise of course
  const toFrom = Math.abs(diff) > 90 ? 'TO' : 'FROM';
  // FROM: clockwise of the course → course lies left → needle left (−).
  // TO:   clockwise of the reciprocal → course lies right → needle right (+).
  const offsetDeg = toFrom === 'FROM' ? -diff : signedAngleDiff(normalize360(radialMag + 180), obsDegMag);
  return { deviationDeg: clamp(offsetDeg, -10, 10), toFrom };
}
```

- Prettier defaults with ESLint (typescript-eslint recommended). File names are
  kebab-case; React components are PascalCase.

## Testing Strategy

- **Test-first for `src/sim`** (red-green-refactor, per the project's `tdd` skill).
  Target ≥ 90% line coverage for `src/sim`; no coverage target for UI.
- **Golden geometry tests**: needle deflection, to/from and DME at known positions
  for every navaid in V1 content (e.g. on the FQF R-045 at 11 DME, the CDI is
  centred with OBS 045 FROM).
- **Autopilot tests**: mode transitions as a table (armed → captured → active),
  intercepts that settle without overshooting more than 1 dot, ALT capture within
  ±20 ft.
- **Scenario integration tests**: scripted input sequences fly each V1 procedure
  end to end headlessly at high speed. Each must arrive at DA within half-scale
  localizer and glideslope deflection, and the scorer must give the expected
  results for deliberately bad runs (altitude bust, wrong hold entry, wrong
  frequency).
- **Procedure data tests**: every procedure JSON validates against the schema, and
  derived fix positions are within 0.1 NM of FAA published coordinates.
- **E2E (Playwright)**: select approach → brief → set radios and AP via the UI →
  fly a short scripted segment at 4× → debrief renders. Run in Chromium only.

## Boundaries

- **Always:** keep `src/sim` free of DOM/React imports; write a failing test before
  sim logic; run `npm test` and `npm run typecheck` before declaring a task done;
  check procedure data against the chart image.
- **Ask first:** adding any npm dependency; adding a new procedure or start
  condition; changing the procedure JSON schema; any deviation from this spec.
- **Never:** add network calls, analytics, telemetry or external CDNs to the
  app; copy branding or panel artwork from real avionics makers or flight sims;
  present the app as suitable for real-world navigation.

## Success Criteria

1. A learner can fly all six V1 procedures (KCFO, KGXY, KMTJ, KAKO, KLAR, KSNY) from every defined start
   condition to DA, or through the missed approach to the holding fix, using only
   the autopilot panel, radios and instruments.
2. Needle, flag and DME readings agree with the golden geometry tests within
   ±0.1° (VOR/LOC), ±0.02° (GS) and ±0.05 NM (DME).
3. Scripted perfect runs score 100%. Each deliberately wrong run loses points on
   exactly the expected rule.
4. The simulation is deterministic: the same scenario and inputs give the same
   track to within 1e-9.
5. Flight screen runs at ≥ 60 fps on a mid-range laptop in Chrome, Edge and
   Firefox (current versions); the sim keeps up at 4×.
6. The production build is a static `dist/` folder that runs with no network
   access after loading.
7. `npm test`, `npm run typecheck`, `npm run lint` and `npm run test:e2e` all pass.

## Out of Scope (Deferred)

- Guided lessons / step-by-step coaching (deferred by choice; V2 candidate).
- Wind, turbulence and realistic aerodynamics (V2: wind first, as it changes
  hold and arc technique).
- RNAV/GPS, LPV and NDB approaches; GPS nav source on the autopilot.
- ATC voice, radar vectors given live, other traffic.
- Out-the-window 3D view and visual landing.
- Equipment failures beyond the scripted glideslope outage.
- Marker beacons (not used on the V1 plates).
- Automatic import of FAA chart/procedure data (CIFP); V1 procedures are hand-encoded.
- User accounts, saved progress across devices, leaderboards.
- Mobile phone layout (tablet landscape and desktop only in V1).
- Public hosting / deployment (V1 runs locally; it's a static build, so hosting is easy to add).

## Open Questions

1. ~~**VOR approach chart.**~~ *Resolved:* the user added KAKO VOR 29, KLAR VOR/DME 30
   and KSNY VOR/DME 13 (plus KMTJ ILS 17). All are in V1.
2. ~~**Navaid coordinates.**~~ *Resolved:* use the FAA's public-domain NASR/CIFP data,
   downloaded from faa.gov during development only. Only the navaids/fixes needed are
   extracted into the procedure JSON (with the source cycle recorded); the raw downloads
   are not shipped and the app stays offline.
3. ~~**Hold-in-lieu "NoPT" handling.**~~ *Resolved:* flying the course reversal on a
   NoPT route is shown as a debrief note only; no points lost.
4. ~~**Missed-approach scoring endpoint.**~~ *Resolved:* scenario ends after the
   missed-approach hold entry plus one full circuit.
5. ~~**Hosting.**~~ *Resolved:* local only for V1 (`npm run dev` / `npm run preview`).
   Public hosting is deferred.
6. ~~**Version control.**~~ *Resolved:* local git repository, committed as work
   progresses; no remote for now.

All open questions are resolved.
