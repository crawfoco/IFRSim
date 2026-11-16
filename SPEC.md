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
     "arriving on the GLL 17.5 DME arc"). Starts that fly to an initial fix begin
     about 5 NM before it, so the learner has time to set up.
   - The briefing shows the clearance text, the reported weather (a ceiling and
     visibility range around minimums, and the cloud tops) and whether the
     glideslope is in service. The actual weather is picked at random when the
     flight starts and is revealed only in the debrief. In free practice, the user picks the start condition
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
   - NAV/APR use the HSI course pointer (CRS) as the course datum, also on a
     localizer, as an HSI-coupled autopilot does: the learner must set CRS to the
     localizer course. The HSI shows reverse sensing with CRS on the reciprocal.
   - Mode logic includes **armed vs. active** states: NAV/APR arm and then capture
     when the needle comes alive; GS arms in APR and captures from below; ALT
     preselect captures and levels off. The mode annunciator shows lateral and
     vertical modes, active and armed.
   - Power selector for target airspeed (80–110 KIAS, default 100). Speed
     determines the approach category used for minimums (A ≤ 90, B 91–110).

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
   - Weather and the decision at minimums: every flight starts above the cloud
     tops and descends into the overcast. A small out-the-window view shows clear
     sky, cloud, or the ground below the base with the runway once it is in sight.
     Whether the runway comes into sight by DA/MDA is random and hidden. Going
     missed is the learner's positive action: the GA (TOGA) button, which levels
     the wings and climbs. Continuing below DA, below the MDA or past the MAP
     without GA means the learner is landing: with the runway in sight the
     approach ends as a landing; without it the flight ends and the decision is
     scored as a failure. After GA the learner flies the published missed
     approach, enters the missed-approach hold and flies one full circuit; the
     scenario then ends. Missed-approach hold entry and leg timing
     are scored like any other hold.

5. **Debrief and score.**
   *As a learner, I want an objective debrief so that I know what I did wrong.*
   - Debrief shows the flown track over a plan view of the procedure (or the
     plate), an altitude profile over time, a final-approach profile against
     distance with the chart's descent path, and a timeline of events.
   - Scored items, each with pass/fail and the measured value:
     - descended below a segment's minimum altitude (by more than 100 ft);
     - wrong or missed navaid tuning/identification before use, or the navaid
       not tuned for more than 10 s while a leg depends on it;
     - fixes flown out of order or skipped;
     - localizer deviation more than half scale inside the FAF;
     - glideslope deviation more than half scale inside the FAF (ILS only);
     - hold entry type matches the correct entry for the arrival heading;
     - hold outbound legs timed to the charted leg time (±15 s);
     - not more than 100 ft above a hold's maximum altitude;
     - climb-in-hold: at the charted altitude by the end of the hold circuit;
     - procedure turn flown on the correct side, within the charted distance,
       and not below its minimum altitude;
     - DME read from the wrong source (e.g. KMTJ: DME on the localizer instead
       of MTJ VOR/DME);
     - the decision at minimums: continued below DA/MDA or past the MAP without
       the runway in sight (going missed is always acceptable);
     - missed approach flown per the published instructions;
     - moving map used (informational, not a penalty);
     - course reversal flown on a NoPT route (informational note explaining
       why it needs ATC approval, not a penalty).
   - The debrief can be replayed at 1×, 4× or 16× speed.

6. **Control time.**
   *As a learner, I want to pause and speed up time so that long legs don't waste
   my practice time.*
   - Pause, 1×, 2× and 4× simulation speed. Restart the scenario (with new
     hidden weather).

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

---

# V2: Glass PFD, "How to fly" and briefing tidy-up

Status: approved (V2), 2026-11-15

## V2 objective

Let the learner fly any approach on a **Glass PFD** (a glass primary flight display in the
style of modern integrated avionics, with original artwork) instead of the V1 steam gauges,
chosen per flight on the briefing. Both panels run the same sim, scoring and debrief. V2 also
adds a short "How to fly" guide to the home screen and tidies the briefing screen.

## V2 user stories and acceptance criteria

7. **Choose the panel.**
   *As a learner, I want to choose steam gauges or a glass PFD so that I practise on the panel I
   fly.*
   - The briefing has a **Panel: Steam / Glass** choice (radio buttons, default Steam). It applies
     to that flight; Restart and Fly again keep it.
   - The steam panel is unchanged: same instruments, same behaviour (the autopilot always flies
     NAV1), same test ids.
   - The debrief shows which panel was flown. Scoring is the same for both.

8. **Fly on the Glass PFD.**
   *As a learner, I want a glass PFD with the information a real one shows so that the scan
   transfers to the aircraft.*
   - The PFD takes the steam instruments' area (ASI, HSI, altimeter, VSI and the NAV2 CDI). It
     shows:
     - **attitude**: sky/ground, pitch ladder (every 2.5°, labelled every 10°), bank scale
       (10/20/30/45/60°) with pointer, fixed aircraft symbol. Pitch is a display pitch (see
       "Display pitch" below);
     - **airspeed tape**: sized for the 80–110 KIAS range (the tape spans about 60–130 kt),
       rolling digit box, and a **trend vector** showing the speed expected in 6 s;
     - **altitude tape**: rolling digit box, the **selected-altitude bug** and readout above the
       tape, and the **minimums bug** (DA or MDA for the scenario and category);
     - **VSI**: vertical-speed scale (±2000 fpm) beside the altitude tape with a pointer and
       digits, and the selected-VS bug when VS mode is active;
     - **HSI**: rotating compass rose with heading readout and heading bug, course pointer and CDI
       with a two-dot deviation scale, TO/FROM, the CDI source label (**VLOC1 / VLOC2**), a NAV
       flag when invalid, and a **glideslope indicator** when the CDI source is an ILS with a
       valid glideslope (GS flag when tuned but invalid);
     - **bearing pointers** BRG1 (single line) and BRG2 (double line), drawn on the HSI with the
       CDI;
     - **AP mode annunciator bar** across the top: AP status, lateral active (green) and armed
       (white), vertical active (green, with the VS target) and armed (white); **GA** shown in a
       go-around; a mode that changes **flashes for about 3 s** (a steady highlight when the user
       prefers reduced motion);
     - **selected-value boxes**: HDG (bug), CRS (for the current CDI source), selected ALT and
       BARO;
     - **minimums alert**: "MINIMUMS" shown on the PFD, and an aural alert, when the existing
       "Minimums." callout fires (from `progress.ts`, not duplicated).
   - It fits the same desktop (1366×860) and tablet-landscape (1024×768) viewports as V1 with no
     page scroll or panel overflow, and keeps 60 fps (Chromium and Firefox perf tests).
   - Its name in the UI, code and docs is **Glass PFD**. No manufacturer names, logos or
     trademarked styling.

9. **CDI and bearing sources (glass panel).**
   *As a learner, I want to select the HSI's nav source and the bearing pointers so that I can fly
   approaches that use two radios.*
   - A **CDI** button toggles the HSI's nav source between VLOC1 (NAV1) and VLOC2 (NAV2).
   - **BRG1** and **BRG2** buttons each cycle OFF → NAV1 → NAV2 → OFF.
   - Each pointer that is on has an **info box**: the source (NAV1/NAV2), the ident when received
     (the frequency otherwise), and DME for that radio's station when available. For a localizer,
     or no usable station, the pointer is hidden and the box reads **NO BRG**.
   - The pointer shows the magnetic bearing to the station (using the VOR's station declination),
     within ±1° of the golden geometry.
   - **The autopilot follows the CDI source.** NAV/APR track the selected radio using that radio's
     CRS. Switching the CDI while NAV or APR is **active** drops the lateral mode to **ROL**; while
     NAV or APR is only **armed**, the armed mode is cancelled and the active mode (e.g. HDG on a
     vector) is kept (decided 2026-11-15). GS, active or armed, drops with APR (falling back to
     PIT). The annunciator shows the change. The steam panel never changes the CDI source, so it keeps flying NAV1.
   - The CDI and BRG selections are recorded in the debrief timeline.
   - The existing **CRS1 / CRS2** knobs, the **DME** unit (with its NAV1/NAV2 source, still used
     by the wrong-DME-source rule) and the **timer** stay as HTML controls beside the PFD. No
     bezel, no softkeys.
   - **Heading sync (both panels, added 2026-11-15):** double-clicking the HDG knob (or Enter
     when it has focus) sets the heading bug to the current heading. The HDG mode button is
     unchanged. It is a sim command (`syncHeadingBug`), so it is logged and replays exactly.

10. **Know what to do (home screen).**
    *As a first-time student, I want a short guide on the home screen so that I know what I am
    about to do.*
    - A **How to fly** panel on the approach select screen with five numbered steps in plain
      words, and one line about choosing Steam or Glass:
      1. Pick an approach and start.
      2. Read the briefing and the plate.
      3. Tune and identify the navaids, then fly with the autopilot.
      4. At DA/MDA, land if the runway is in sight; otherwise press GA and fly the missed
         approach.
      5. Review the debrief.

      "On the briefing, choose the Steam gauges or the Glass PFD."
    - *Decided:* a compact side panel (about 260 px) to the right of the approach list, not a
      collapsible box. It is always visible and needs no remembered state, and at 1024×768 the six
      approach cards still fit (two columns, three rows) with no page scroll. Below 900 px wide it
      stacks above the list.
    - The README's "How to fly" matches it, including the panel choice.

11. **Briefing tidy-up.**
    - The briefing column is about 10% wider: desktop `minmax(420px, 620px)` (was 560 px max),
      tablet `minmax(380px, 505px)` (was 460 px max). The plate keeps the rest and Fit still
      works.
    - The technical chart notes (`b.notes`) go inside a `<details>` element labelled **"Details
      about this approach chart"**, closed by default and not remembered. The hints (`b.hints`)
      stay visible.

## V2 design notes

- **Nav sources (GPS-ready).** `src/sim/nav/source.ts` defines `NavSourceId = 'NAV1' | 'NAV2'`,
  `CdiSource = NavSourceId` and `BearingSource = NavSourceId | null` (null = OFF). Cycling is done
  by helpers over an ordered list, so adding `'GPS'` later means adding it to the union and the
  list, plus a reading for it, with no command or UI rework.
- **State and commands.** `SimState.panel` gains `cdiSource` (initially `'NAV1'`), `brg1` and
  `brg2` (initially OFF). New commands: `{ type: 'cdi' }` (next CDI source) and
  `{ type: 'bearing'; pointer: 1 | 2 }` (next bearing source). Old command logs replay exactly.
- **Autopilot.** A helper `apNavSource(state, sensors)` returns the reading and CRS of the CDI
  source. `modeContext`, `runAutopilot` and the `navCourseTrue` call use it instead of the
  hard-coded `nav1`. A pure `cdiSourceChanged(modes, ctx)` in `modes.ts` does the drop to ROL.
- **Scoring.** The tuning, stay-tuned and DME-source rules already look at both radios and the
  DME source, not at the CDI. A new integration test flies an ILS with the localizer on NAV2 and
  the CDI on VLOC2, and it must score 100%. Existing tests must pass unchanged.
- **Panel choice.** `ScenarioOptions.panel: 'steam' | 'glass'` (default steam) travels with the
  scenario and is shown in the debrief. The sim does not branch on it.
- **Display pitch.** The sim models bank but not pitch. A pure function in
  `src/sim/aircraft/attitude.ts` gives a display pitch: the flight-path angle (from VS and TAS)
  plus a nominal angle of attack that falls from about 4° at 80 kt to 2° at 110 kt, clamped to
  ±20°. The flight model does not change. Tested.
- **Speed trend.** Also pure: the speed in 6 s, from the model's 2 kt/s acceleration toward the
  power-selector target (`clamp(cmd − ias, ±12 kt)`); hidden below 1 kt.
- **Bearing to station.** A pure receiver function returns the magnetic bearing to a tuned VOR
  (station declination), and null for a localizer or out of range. Golden tests at known
  positions.
- **Minimums.** The bug value comes from `activeMinimums` (already exported). The PFD alert shows
  while the latest `minimums` event is less than 5 s old (sim time) and the flight has not gone
  missed or ended; the aural alert plays once per event. Both read `progress.events`, so nothing
  in `progress.ts` is duplicated.
- **Aural alert.** `src/ui/audio/alert.ts`: a short two-tone chime made with Web Audio, sharing the
  ident's `AudioContext`. No audio files and no speech synthesis (browser voices may use the
  network). Silent where audio is unavailable.
- **BARO.** There is no altimeter-setting model. *Decided:* the BARO box shows a fixed
  **29.92 IN** and the altitude tape shows the sim's altitude, as now. Alternatives: (b) the
  briefing weather reports a random altimeter setting and the BARO box shows it already set
  (display only, no altitude error); (c) a BARO knob the learner must set, with an altitude error
  when it is wrong (changes the sim and needs new scoring; not recommended for V2).
- **Rendering.** SVG components under `src/ui/instruments/glass/`, driven by props like the V1
  instruments. Tapes and the rose move by `transform` only, and static parts are memoised, to keep
  60 fps.
- **Annunciator on the glass panel.** The PFD bar shows the modes, so the AP panel's own
  annunciator row is hidden on the glass panel. It stays on steam.

## V2 testing

- Unit (test-first): nav-source cycling, the CDI and BRG commands, the AP following the CDI
  source, the CDI switch (NAV/APR active → ROL, armed → cancelled with HDG kept, GS dropped), bearing to station, display pitch,
  speed trend, the scenario panel option.
- Integration: the NAV2-coupled ILS run scores 100%; every V1 test still passes.
- UI (Vitest): glass components render the right values (tapes, bugs, boxes, NO BRG, flash class);
  the How to fly section renders; the briefing notes are in a closed `<details>`.
- E2E: fly KCFO ILS 26 on the glass panel to minimums (alert shown); a CDI switch drops NAV to
  ROL; a BRG pointer points at the station; the glass flight screen, the home screen and the
  briefing screen fit desktop and tablet; 60 fps with the glass panel (Chromium and Firefox).
- Dev gallery: glass PFD states (level cruise, ILS established, LOC only with MDA, VOR FROM with
  BRG pointers, NO BRG, minimums alert, GA, flags).

## V2 success criteria

1. A learner can fly every start condition of all six procedures on the glass panel, as on steam.
2. The steam panel behaves exactly as in V1 (all V1 tests pass unchanged).
3. AP coupling to the CDI source and the drop to ROL are covered by unit and e2e tests.
4. BRG pointers agree with the golden bearing within ±1°.
5. The layout and performance criteria (no overflow, 60 fps, the sim keeps up at 4×) hold on the
   glass panel.
6. `prettier`, `tsc`, `eslint`, unit and e2e tests all pass.

## V2 out of scope

MFD, engine strip, GPS/RNAV (the types are ready for it), bezel and softkeys, an altimeter-setting
model, wind, synthetic vision, flight director.

## V2 open questions

1. ~~**BARO.**~~ *Resolved:* a fixed 29.92 IN display; no altimeter-setting model.
2. ~~**How to fly placement.**~~ *Resolved:* a compact side panel beside the approach list.
