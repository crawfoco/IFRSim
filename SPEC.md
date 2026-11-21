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
     "arriving on the GLL 17.5 DME arc"). Some starts that fly to a fix begin about 5 NM
     before it, so the learner has time to set up; others (V3, offset starts) begin 10-12 NM
     off to one side on a vector heading, so the learner turns toward the fix and works out
     the arrival, the hold entry and whether a course reversal is required.
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
     and Morse ident (audio and dot/dash text). Standby is tuned with the MHz/kHz
     knobs, or by clicking or tapping the standby window: a popover with the value, a
     keypad, step buttons (MHz on the left: +1 / −1 MHz; kHz on the right: +50 / −50 kHz;
     up before down) and Set / Cancel. Typing (keyboard or keypad) takes 108.00–117.95 on the 50 kHz
     spacing; anything else is rejected, not rounded.
     The selected heading (AP strip; under the HDG knob on the glass panel) and each
     course (CRS / OBS, a window under its knob) work the same way: 1–360 (0 = 360), steps
     +10 / +1 / −1 / −10°, and for heading a sync to the current heading. So does the selected
     altitude (AP strip; under the ALT knob on the glass panel): 0–18,000 ft in hundreds
     ("4500" or "4,500"), steps +1,000 / +100 / −100 / −1,000 ft. Step buttons act at once;
     typed values need Set or Enter. A rejected entry stays, marked, and the next key
     starts a new entry (Delete clears it). The popover keeps a two-line message line
     under the field, the accepted range or (red) why an entry was rejected, so no button
     moves when an error appears or clears. Every value window has a dotted underline under its value
     to show it can be clicked. Opened by touch, the popover asks for no system keyboard,
     so the iPad keyboard doesn't cover the panel.
   - Knobs turn by drag, wheel or keyboard. Trackpad scrolling steps about once per
     50 px; a scroll that started off a knob keeps scrolling the panel when a knob passes
     under the pointer; a pinch (Ctrl+wheel) over a knob doesn't turn it. Knob tooltips
     give the small and big (Shift / Page Up/Down) step.
   - Touch screens (pointer: coarse): small controls (radio knobs, swap, ID, value
     windows) take a touch about 44 px across without changing the layout, the MHz and
     kHz knobs sit 10 px apart, and value windows keep a visible frame (no hover).
   - The approach select screen asks for bug reports and enhancement requests as issues
     at github.com/crawfoco/IFRSim/issues (a link that opens in a new tab).
   - Needles behave like real receivers: full-scale ±10° for VOR, ±2.5° for the
     localizer, ±0.7° for the glideslope, to/from logic, a flag when out of range
     or untuned.
   - The moving map is **off by default**. It can be toggled on as a training aid,
     and toggling it is recorded in the debrief.

3. **Drive the autopilot.**
   *As a learner, I want a familiar GA autopilot so that the skills transfer to
   the aircraft.*
   - Generic panel (not a replica of any brand) with AP on/off, HDG, NAV, APR, ALT,
     VS, knobs for heading bug, course and altitude preselect, and +500 / −500 FPM
     buttons (in place of a VS knob) for the vertical-speed target; they act only in VS
     mode.
   - NAV/APR use the HSI course pointer (CRS) as the course datum, also on a
     localizer, as an HSI-coupled autopilot does: the learner must set CRS to the
     localizer course. The HSI shows reverse sensing with CRS on the reciprocal.
   - Mode logic includes **armed vs. active** states: NAV/APR arm and then capture
     when the needle comes alive; GS arms in APR and captures from below; ALT
     preselect captures and levels off. The mode annunciator shows lateral and
     vertical modes, active and armed.
   - Power selector for target airspeed (default 100 KIAS): no knob; clicking or tapping
     the speed readout opens a small menu of 80, 90 and 100 KIAS (the sim accepts
     80–110). Speed determines the approach category used for minimums (A ≤ 90,
     B 91–110), so the menu reads 80 CAT A, 90 CAT A, 100 CAT B.

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

Added in V3 (radio plates, flown like the V1 ones; cycle 2611):

| Procedure | Covers |
|---|---|
| KCYS ILS or LOC RWY 27 (AL-80, Amdt 36) | Three routes to the IF/IAF COLLA: CYS R-098 (hold-in-lieu at COLLA required), EGBER (NoPT, heading 220° to the localizer) and HAMER on GLL R-350 (NoPT, lead radial CYS R-106). FAF HORSE (I-CYS 6.6), VDP I-CYS 2.7, MAP I-CYS 1.5. Missed: climb to 6800, then direct CYS and hold with climb-in-hold. The localizer is used to about 25 NM on the EGBER route (expanded service volume 30 NM) |
| KCEZ VOR RWY 21 (AL-112, Amdt 5C) | VOR approach outbound from the station with the FAF at CEZ: arrival on R-350 inbound, **barbed procedure turn** at CEZ (remain within 10 NM), 3.49° descent angle, MAP at CEZ 5.5 DME. Missed: direct CEZ and hold. No plate overlay (the plan view has only one precise anchor) |
| KSKX VOR/DME-B (AL-5863, Amdt 3B) | **Circling-only** VOR/DME approach: hold-in-lieu at TAS (NoPT from R-353), FAF RESOY (TAS 8), MAP ZUTRI (TAS 14.3), circling MDA 8000. Continuing past the MAP with the airport in sight lands on runway 13 |

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
     - **minimums box** below BARO showing DA or MDA and its value, always visible (the tape's
       minimums bug sits under the altitude readout at minimums).
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
   - **DME window** (added 2026-11-15): always shown on the PFD left of the HSI, above the BRG1
     box: "DME", the source radio (NAV1/NAV2), the paired station (ident when received, else the
     frequency) and the distance, or dashes with no DME. Its source is the existing DME source
     selector (still used by the wrong-DME-source rule); there is no DME HOLD.
   - One **CRS** knob (it sets the course of the CDI's source, VLOC1 or VLOC2; changed
     2026-11-15 from separate CRS1 / CRS2 knobs), the **DME source** buttons (labelled DME SRC; the
     separate DME readout is not shown on the glass panel) and the **timer** stay as HTML
     controls beside the PFD. No bezel, no softkeys.
   - **Heading sync (both panels, added 2026-11-15):** double-clicking the HDG knob (or Enter
     when it has focus) sets the heading bug to the current heading. The HDG mode button is
     unchanged. It is a sim command (`syncHeadingBug`), so it is logged and replays exactly.
   - **Auto-ID (glass, added 2026-11-15):** the decoded station ident shows next to each NAV
     radio while the station is received, and on the glass panel that counts as identifying the
     navaid for scoring (the learner checks it against the plate). The ID button still plays the
     Morse. On the steam panel the learner must still press ID.

10. **Know what to do (home screen).**
    *As a first-time student, I want a short guide on the home screen so that I know what I am
    about to do.*
    - A **How to fly** panel on the approach select screen with five numbered steps in plain
      words, and one line about choosing Steam or Glass:
      1. Pick an approach and start.
      2. Read the briefing and the plate.
      3. Tune and identify the navaids, then fly with the autopilot.
      4. At DA/MDA, if the runway is in sight, continue and the sim lands automatically; if
         not, press GA and fly the missed approach.
      5. Review the debrief.

      "On the briefing, choose the Steam gauges or the Glass PFD."
    - *Decided:* a compact side panel (about 260 px) to the right of the approach list, not a
      collapsible box. It is always visible and needs no remembered state, and at 1024×768 the six
      approach cards still fit (two columns, three rows) with no page scroll. Below 900 px wide it
      stacks above the list.
    - The README's "How to fly" matches it, including the panel choice.

11. **Briefing tidy-up.**
    - Plate and briefing split the width **50/50** on desktop and tablet (changed 2026-11-15 from
      a 10% wider briefing column). Fit still works.
    - The technical chart notes (`b.notes`) go inside a `<details>` element labelled **"Details
      about this approach chart"**, closed by default and not remembered. The hints (`b.hints`)
      stay visible.
    - **Runway at minimums** (added 2026-11-15): **Surprise me** (random and hidden, the default
      and the V1 behaviour), In sight, or Not in sight. Restart and Fly again keep a chosen outcome and pick
      a random one again.
    - The **HSI course hint** ("set CRS to the localizer course") is no longer on the briefing.
      The debrief notes it instead when it matters (story 12).

12. **Changes after the first test flight (2026-11-15).**
    - Version **2.0.0-beta.1**.
    - Flight screen: the briefing card there no longer shows the minimums or the missed
      approach; the student reads them from the plate. The go-around callout says only "Going
      missed.".
    - The moving map takes the plate's place while it is on (issue #7). The steam AP strip shows
      the selected heading (issue #8): its modes are on the left (the vertical mode reads just
      "VS"), and on the right one selected-value window sits over each knob: heading, altitude,
      and vertical speed (blank outside VS mode), in the knobs' order. Generic, after the common
      GA autopilot layout of modes on the left and the selected value over its knob.
    - Debrief: the Plan / Plate toggle switches the whole left column: Plan shows the track,
      replay and profiles; Plate shows the plate alone.
    - A **flight clock** in the top bar shows sim time since the start (it runs faster at 2× and
      4×). The stopwatch is unchanged.
    - **DME on glass stays separate from the CDI**, as on a typical integrated panel: DME SRC
      chooses NAV1 or NAV2, and the bearing boxes show DME for their radios. Each nav source keeps
      its own course; switching the CDI shows that radio's CRS, and the CRS knob then sets it.
    - **Track on the plate:** the debrief's Plate tab draws the flown track on the plate's plan
      view, for all six plates. Each plate is fitted to the sim's geography from four to eight
      measured anchors (19.2–19.4 px per NM, north-up, every anchor within 0.2 NM); insets and
      legs beyond a break symbol are masked. The plate's profile box is schematic, so no altitude
      overlay. Calibrations live in `src/ui/chart/overlay.ts`; new plates are calibrated with
      `npm run plate` (see docs/procedure-encoding.md and the `add-approach-plate` skill).
    - Debrief note (informational, no points), `loc-crs`: the autopilot was armed or coupled on
      a localizer while its CRS was more than 10° off the localizer course, for 5 s or more in
      total. It gives the setting, the localizer course and the effect (reverse sensing on the
      reciprocal).

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
  scenario and is shown in the debrief. The flight sim does not branch on it; only the
  identification rule does (auto-ID on glass).
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

---

# V3: RNAV (GPS) approaches

Status: approved (V3), 2026-11-15. Branch `v3-rnav`, from `main` at `813586d`
(V2 already merged).

## V3 objective

Add RNAV (GPS) approaches next to the ILS, LOC and VOR procedures. The aircraft gets a
**generic WAAS GPS** that the learner drives with plain HTML controls: load the approach,
activate it (or vectors-to-final), Direct-To, and unsuspend the missed approach. The GPS is a
third nav source for the HSI and the autopilot. The product shape stays the same: free practice,
briefing, fly, debrief with a score. Every V1 and V2 procedure, test and scoring rule keeps
working unchanged.

## V3 content (plates chosen by the user)

All nine plates are from cycle **2611** (29 Oct 2026 – 26 Nov 2026).

| Procedure | Minimums lines | What it adds |
|---|---|---|
| KLAA RNAV (GPS) RWY 18 (AL-5290, Amdt 1E) | LPV DA, LNAV/VNAV DA, LNAV MDA | **First plate (pilot).** T arrangement: WEYYI and WIZGE (both NoPT) to the IF/IAF OBOZU, with a hold-in-lieu at OBOZU (6 NM legs, 6000–14000). FAF LOLME, GP 3.05° / TCH 41, LNAV-only VDP (1.7 NM). Missed: direct IHIYO and hold |
| KPUB RNAV (GPS) RWY 26L (AL-334, Amdt 1B) | LPV, LNAV/VNAV, LNAV | Three IAFs (BONUH, REDHI NoPT, ORWAY NoPT) to the IF/IAF HELER (6 NM hold-in-lieu). Feeders from DRAKE, VIGIL and STAXX, and **PUB VORTAC → HELER (082°, 10 NM)**. LNAV-only VDP. Missed: direct MERTZ and hold |
| KBFF RNAV (GPS) RWY 12 (AL-383, Amdt 1B) | LPV, LNAV/VNAV, LNAV | Y arrangement: AYAYI and SACOP (NoPT) to the IF/IAF LEDSE (7 NM hold-in-lieu). Feeders from ALBIN and SPONS (beyond breaks). 1° course change at the FAF (125° → 126°). Remote-altimeter note. Missed: direct HAKAB (inset) and hold |
| KCPR RNAV (GPS) RWY 3 (AL-72, Amdt 1C) | LPV, LNAV/VNAV, LNAV | T arrangement: CEYFI, AXIBY and CHOMP to the IF IPEYE, **Procedure Turn NA**. LNAV step-down at NOPTE. Missed: direct KIVSE, then **track 022° to DDY VOR/DME** and hold there |
| KAPA RNAV (GPS) RWY 28 (AL-5715, Amdt 1C) | LPV, LNAV/VNAV, LNAV | IAFs EZBEL and DILVE to the IF DOCKY; step-downs MESME (7600) and the **LNAV-only** FEGIB (6940\*); FAF NIDLY; LNAV-only VDP (1.3 NM). Missed: climb to 6400, **then a climbing right turn** to 9000 direct EZBEL and hold (the missed hold is at an IAF) |
| KCOS RNAV (GPS) RWY 31 (AL-87, Amdt 2A) | **LP MDA, LNAV MDA** (no vertical minimums) | Lateral-only WAAS approach with a 3.04° / TCH 52 **advisory** glidepath (LP+V, LNAV+V). Y arrangement: IAFs ZENER and ONKIE to the IF NUTVE, **no course reversal** anywhere. Feeders from PUB VORTAC (340°, 18.4 NM) and ADANE. FAF JATOL, VDP 0.8 NM. Missed: climb to 6700, then a climbing right turn to 9000 direct ADANE and hold |
| KALS RNAV (GPS) RWY 2 (AL-18, Amdt 2) | LPV, LNAV/VNAV, LNAV | IAFs GEMKY, WAPRE and VEPUY (NoPT, ZOTOS feeder) and an ALS VORTAC feeder to the IF/IAF RODDS (7 NM hold-in-lieu, 12200–14000). FAF BREZE, LNAV-only step-down XOGSY. Missed: climb to 14600 direct APKOW, then track 317° to ICORY (inset, not to scale) and hold with climb-in-hold |
| KCNY RNAV (GPS) RWY 3 (AL-5585, Amdt 2) | **LP MDA, LNAV MDA** | **Offset final** (14.5° from the runway, MAP FOGUG off the threshold; the FAS uses a fictitious threshold point), 3.50° advisory glidepath. IAFs KIDNE and PIGSE (NoPT) and an ARCHH feeder to the IF/IAF HANOG (7 NM hold-in-lieu). Step-downs FELTA and FATPU. Missed: climb to 5800, then a climbing left turn direct HANOG and hold |
| KOGA RNAV (GPS) RWY 8 (AL-6070, Amdt 2F) | LPV, LNAV/VNAV, LNAV (Cat A/B only) | **TAA**: a single IF/IAF AHUFU with a **straight-in area** west of the 173°/353° line (NoPT; 5300 within 6 NM, 5700 to 30 NM) and a **course-reversal area** east of it (5300 within 5 NM, 5600 to 30 NM), which needs the hold-in-lieu at AHUFU (5 NM legs, 5300–6000). FAF EZIFU, step-down YEYUC, VDP 1.6 NM. Remote-altimeter note. Missed: direct TUKWY and hold |

All nine are WAAS approaches. Coverage against the V3 checklist:

- **Minimums lines:** LPV and LNAV/VNAV (KLAA, KPUB, KBFF, KCPR, KAPA, KOGA), LP (KCOS), LNAV
  (all seven).
- **Advisory glidepath (+V):** KCOS (LP+V and LNAV+V), and the LNAV lines on the others.
- **Hold-in-lieu at the IF:** KLAA, KPUB, KBFF, KOGA (from the TAA's course-reversal area).
- **T/Y arrangements:** KLAA, KCPR, KBFF, KAPA, KCOS. **TAA:** KOGA.
- **LNAV-only step-down:** KAPA (FEGIB). **No course reversal at all:** KCOS.
- **Routes:** NoPT routes; feeders from a VOR (KPUB, KCOS); missed approaches to a GPS
  waypoint, to a VOR (KCPR), to an IAF (KAPA), and with a climb then a turn (KAPA, KCOS).

**Not on any plate:** RF legs, RNP AR, an LNAV-only (non-WAAS) approach, NDB. See "V3 out of
scope".

### What is hard on these plates

1. **KOGA TAA.** The TAA is new to the schema, the scenario and the scoring:
   - the sectors are defined by courses **to** AHUFU (173° and 353°) and by distance rings (6 NM
     west, 5 NM east, 30 NM outer), each with its own minimum altitude;
   - which area the aircraft is in decides whether the hold-in-lieu at AHUFU is required
     (course-reversal area) or not allowed without ATC approval (straight-in area, NoPT);
   - the GPS loads the approach with AHUFU as the transition either way; the hold-in-lieu goes
     into the flight plan only for an arrival from the course-reversal area. Proposal: the
     learner chooses "with hold" or "straight in" when loading AHUFU (a real GPS asks the same);
   - the TAA picture on the plate is not to scale (masked on the overlay).
2. **KCOS.** LP and LNAV only, with an advisory 3.04° glidepath. LP is angular laterally with
   no coupled vertical, so the learner flies VS to the MDA and the VDP. "DME/DME RNP-0.3 NA" is
   a note only (our GPS is WAAS). The missed approach climbs straight ahead to 6700 before
   turning right: the GPS has a course-to-altitude leg before the direct-to.
3. **KAPA.** FEGIB (6940) is an LNAV-only step-down inside the FAF: it is a segment minimum
   on the LNAV line but not on LPV/LNAV-VNAV. EZBEL is both an IAF and the missed holding fix;
   whether the hold is also a hold-in-lieu for the EZBEL arrival is checked against the CIFP
   coded legs (HF vs HM) before encoding.
4. **KCPR.** The missed approach ends in a hold at a VOR (DDY), flown on GPS. The GPS database
   holds VORs as waypoints, so it is a normal GPS hold.
5. **VOR feeders.** KPUB (PUB → HELER, 082°, 10 NM) and KCOS (PUB → ONKIE, 340°, 18.4 NM) start
   at the PUB VORTAC. They are encoded as RNAV TF legs, with the VOR only as a waypoint.
6. **Not-to-scale insets.** The missed holding fixes on KBFF, KCPR, KLAA and KOGA sit in
   "MISSED APCH FIX" insets, and several feeders are beyond break symbols. The overlay masks
   them as in V2, so some plates have fewer anchors.
7. **Notes we display but do not model:**
   - remote altimeter (KBFF, KOGA);
   - "Procedure NA for arrivals on Vxx";
   - speed limits (the aircraft never exceeds 110 KIAS);
   - inop-ALS visibility increases;
   - "DME/DME RNP-0.3 NA" (KCOS).

## V3 user stories and acceptance criteria

13. **Fly an RNAV approach with the GPS.**
    *As a learner, I want to set up and fly an RNAV approach the way I would with a GA GPS, so
    that the procedure transfers to the aircraft.*
    - The flight starts with the approach **not loaded**. The learner:
      1. loads the approach with the cleared transition (an IAF, or Vectors);
      2. activates it;
      3. sets the CDI to GPS;
      4. couples the autopilot.
    - The GPS:
      - sequences the legs;
      - anticipates fly-by turns and flies over fly-over waypoints;
      - flies the hold-in-lieu when the route includes it;
      - **suspends** at the MAP.

      After GA, the learner unsuspends to get missed-approach guidance to the holding fix and the hold.
    - Direct-To works for any waypoint in the flight plan, from present position.
    - Vectors-to-final gives an extended final through the FAF. The autopilot intercepts it in NAV or
      APR from a heading.

14. **Know what the GPS is doing (both panels).**
    - Flight phase:
      - **ENR** (enroute, ±2 NM);
      - **TERM** (terminal, ±1 NM);
      - **APR** (±0.3 NM for LNAV, or angular);
      - **MAPR** (missed, ±1 NM).

      Terminal → approach scaling ramps over the last 2 NM before the FAF. Approach → missed happens on the first leg after the MAP.
    - Approach annunciation, from 2 NM before the FAF: **LPV, LNAV/VNAV, LP, LNAV+V** or **LNAV**, whichever is the best line that the plate publishes and that the GPS can fly in this scenario.
    - Status annunciations: **SUSP** when sequencing is suspended, (an integrity flag is deferred).
    - Glass PFD:
      - CDI source **GPS**, with a magenta course and deviation (the common convention for GPS);
      - phase and approach annunciation next to the HSI;
      - the GP indicator for LPV, LNAV/VNAV and +V;
      - BRG pointers can point at the active waypoint (source GPS).
    - Steam panel:
      - a **NAV/GPS** source button above the HSI. The HSI and the autopilot follow it; the NAV2 CDI stays on NAV2;
      - a small annunciator strip (phase, approach type, SUSP);
      - the glideslope pointer shows the GP.
    - The GPS panel shows:
      - the flight plan (waypoints, active leg, course and distance, altitude constraints);
      - distance and time to the active waypoint;
      - ground speed.

15. **Fly the right minimums.**
    - The minimums box (glass), the minimums bug and the "Minimums." callout use the line the GPS
      annunciates.
    - LPV and LNAV/VNAV are flown to a **DA** on the GP.
    - LP, LP+V, LNAV and LNAV+V are flown to an **MDA**, with step-downs flown in VS/ALT. The
      advisory GP of +V is shown but **not coupled**.
    - LNAV-only step-downs (KAPA FEGIB) and LNAV-only VDPs apply to the LNAV lines only.
    - The briefing sets which line the scenario uses, like the runway at minimums:
      - **WAAS: Surprise me** (default);
      - **Available** (LPV, or LP on KCOS);
      - **Not available** (the GPS annunciates LNAV at 2 NM before the FAF).

16. **Scenario events.**
    - **LPV not available** (above): revealed only when the approach annunciation appears.
    - **Loss of integrity** is deferred (see "V3 decisions").

17. **Score the RNAV procedure.** New rules, each with a "bad run" test:
    - `gps-approach-active`: the approach was loaded with the cleared transition (or vectors)
      and activated before the IAF (or before intercepting final when vectored).
    - `gps-approach-mode`: the FAF was crossed with an approach annunciation (APR scaling) and
      the CDI on GPS. Continuing past the FAF in TERM is a fail.
    - `final-course` (extended): GPS cross-track within half scale inside the FAF.
    - `glidepath` (new, like `glideslope`): GP deviation within half scale above the DA, LPV and
      LNAV/VNAV only.
    - `decision` and `segment-minimums` (existing) use the annunciated line. Going below the LPV
      DA when the GPS annunciated LNAV fails the decision. LNAV step-downs are segment minimums.
    - `missed-sequencing`: unsuspended within 30 s after GA (or before the first turn, if
      earlier), so the missed approach is flown on GPS guidance. Steam only: on glass, GA
      sequences the GPS itself, so the rule is not scored.
    - The existing `missed-approach`, `climb-in-hold`, `hold-max-altitude`, `fix-order` and
      `nopt-reversal` rules apply to RNAV legs.
    - GPS-guided holds are in NM, so `hold-timing` does not apply, and `hold-entry` is not scored (the GPS flies the entry).
    - TAA (KOGA): `taa-altitude`, never more than 100 ft below the minimum altitude of the TAA
      area and ring the aircraft is in until established on the procedure; and `taa-reversal`,
      the hold-in-lieu at AHUFU flown when arriving from the course-reversal area. Flying it
      from the straight-in area is the existing `nopt-reversal` note.

18. **Brief the RNAV notes.**
    - The briefing card has an **Equipment** line ("RNP APCH – GPS. WAAS channel 73005, W12A") and the
      minimums lines the plate publishes.
    - "Details about this approach chart" holds the temperature limits and the remote-altimeter
      and "Procedure NA" notes.
    - On a TAA plate the briefing lists the areas and their altitudes in words ("Straight-in
      area, west of 173°–353° to AHUFU: 5700 to 30 NM, 5300 within 6 NM, NoPT").
    - Baro-VNAV temperature limits are shown with an explanation: the WAAS GPS flies LNAV/VNAV
      with WAAS vertical guidance, so the limits do not apply to this aircraft.
    - Clearances name the transition ("Proceed direct WEYYI, maintain 7000 until WEYYI,
      cleared RNAV runway 18 approach").

19. **Arrive through a TAA (KOGA).**
    *As a learner, I want to work out which TAA area I'm in, so that I fly the right altitude and
    know whether a course reversal is needed.*
    - Starts in both areas: from the northwest (straight-in area, cleared direct AHUFU, NoPT)
      and from the southeast (course-reversal area, cleared direct AHUFU, the hold-in-lieu
      required, a parallel entry).
      The clearance gives the altitude, not the area: the learner reads it from the plate.
    - When loading AHUFU as the transition, the GPS asks **"Hold at AHUFU?"** (Yes / No), so the
      hold-in-lieu is in the flight plan only when the learner says so.

## V3 design notes

- **GPS state.** `SimState.gps` holds:
  - the flight plan (loaded procedure, transition, legs);
  - the active leg index;
  - `active` / `suspended`, `directTo` and `vtf`;
  - the phase and the integrity state.

  It changes only through commands and a new `stepGps()` call in `step()`. Sequencing needs state, so it cannot go in `sense()`, which stays stateless. Old command logs replay exactly: GPS state defaults to "nothing loaded", and only GPS commands change it.
- **Commands.**
  - `gpsLoad {transition | 'VTF'}`, `gpsActivate`, `gpsDirect {waypoint}` and `gpsSuspend` (toggle SUSP).
  - `cdiSet {source}` for the steam NAV/GPS button. The glass CDI button keeps cycling NAV1 → NAV2 → GPS.
  - Bearing cycle: OFF → NAV1 → NAV2 → GPS.
- **GPS reading.** `Sensors.gps` has:
  - desired track (true and magnetic);
  - cross-track in NM and the full scale (in NM, or angular);
  - TO/FROM;
  - distance and bearing to the active waypoint, and ground speed;
  - phase and approach line;
  - a vertical deviation for the GP (angular like the glideslope: ±0.25 × GPA full scale).

  The GPS has no position error and no wind.
- **CDI scaling.**
  - Linear 2 / 1 / 0.3 NM by phase. Terminal → approach ramps over the last 2 NM to the FAF.
  - LPV, LP and LNAV/VNAV finals are angular from the FAS course width at the threshold, and never wider than 1 NM. The exact limits get checked against the FAA AIM and the RTCA description in R2.
- **Autopilot.**
  - NAV and APR on the GPS source use the existing cross-track law, which already works in NM.
  - The course datum is the GPS desired track. **The CRS on the GPS source auto-slews** to it (generic GPS behaviour), so there is no `loc-crs`-style trap.
  - Fly-by turns: the GPS switches legs at the turn-anticipation distance, so the AP turns early.
  - APR on GPS arms **GP** for LPV and LNAV/VNAV, which is captured from below like GS. `navKind` gains `'GPS'`.
- **Holds on GPS.**
  - The GPS flies the hold-in-lieu and the missed hold (entry and NM legs) in NAV.
  - A hold-in-lieu is in the flight plan only on a transition that needs it (not NoPT, not
    VTF), or, for a TAA IAF, when the learner answers Yes to "Hold at <fix>?".
  - The hold-in-lieu (CIFP HF leg) ends at the fix after the entry and one return inbound, and
    the GPS sequences on by itself; the missed hold (HM) continues until the flight ends. Fly-by
    turns between legs are flown on a standard-rate arc, so the CDI stays centred through them.
  - SUSP: the GPS suspends over the MAP; pressing SUSP then sequences into the missed approach.
    Pressing it before the MAP (e.g. right after GA) arms the missed approach, so the GPS goes
    straight on into it at the MAP.
  - GA (TOGA) on the **glass** panel (an integrated installation) does the same as SUSP: it
    arms the missed approach before the MAP, or sequences into it when suspended at the MAP. On
    the **steam** panel (a panel-mount GPS that can't see the GA switch), SUSP is by hand.
- **Schema.**
  - Fix kind `waypoint` (`{ "kind": "waypoint", "id": "LOLME" }`), resolved from navdata
    (CIFP/NASR coordinates).
  - Leg types `if` (initial fix), `tf` (track to fix), `df` (direct to fix) and `ca` (course to
    altitude, missed), with a `flyOver` flag on the fix where it applies (the MAP, missed-turn
    fixes).
  - A GPS hold: `course` may be `{ "rnav": true }`, with `legNm`.
  - `final` on GPS:
    - `course: { "rnav": true }`;
    - `gp` (`angleDeg`, `tchFt`, LTP, course width) for LPV and LNAV/VNAV;
    - `descentAngle` (advisory, as now) for +V;
    - step-downs with an optional `lnavOnly`.
  - `minimums.kind` adds `LPV`, `LNAV/VNAV`, `LP` and `LNAV`. The first two are a DA, the others an MDA. A line can have an optional `note`, and a `vdp` applies only to LNAV.
  - `rnav` block: `waas: { channel, id } | null`, `rnpApch: true`.
  - `taa` (optional): the IAF, and areas, each with a course range **to** the IAF (magnetic,
    clockwise from–to), `noPT`, and rings (`withinNm`, `minAltFt`). Resolved to a pure
    "which area and ring am I in" function used by the scoring and the briefing text.
  - All additions are optional fields or new union members, so the six V1 files do not change.
- **Nav data from CIFP.**
  - The pipeline gains a CIFP download and a small ARINC 424 reader, with no new dependency. It reads:
    - terminal waypoints;
    - approach legs (path terminator, fix, fly-over, course, distance, altitudes);
    - the path-point record (LTP, GPA, TCH, course width).
  - Procedure JSON stays hand-encoded from the plate. A test **cross-checks every RNAV
    procedure against its CIFP legs**: fix order, leg types, altitudes, and courses within 1°.
  - The CIFP and NASR cycles are recorded in `navdata.json`.
- **Scenario.**
  - `ScenarioOptions.waas: 'random' | 'available' | 'unavailable'`.
  - `buildScenario` accepts GPS finals and missed holds on RNAV waypoints.
  - `activeMinimums` takes the annunciated line.
  - `CourseRef`-based geometry (`coursePosition`, `crossedInbound`, …) gets an RNAV variant: a track between two fixes.
- **Rendering.**
  - GPS colours follow the existing glass palette, with magenta for GPS.
  - The GPS panel is plain HTML (a `<table>` flight plan, `<select>` and buttons), placed where it fits both sizes.
  - The layout e2e and the 60 fps perf test cover it.
- **Version** 3.0.0-beta.1.

## V3 testing

- **Unit** (test-first):
  - ARINC 424 reader;
  - waypoint and leg resolution;
  - GPS flight plan: load, activate, VTF, Direct-To, sequencing, fly-by anticipation, fly-over, holds, SUSP;
  - CDI scaling at every phase boundary;
  - GP deviation and annunciation;
  - AP on GPS: NAV/APR, GP capture, fly-by turns without overshooting more than 1 dot;
  - `activeMinimums` per line;
  - each new scoring rule.
- **Procedure:**
  - each plate validates;
  - every waypoint is within 0.1 NM of the FAA coordinate;
  - legs match CIFP;
  - golden tests at every fix (desired track, cross-track 0, distance to next).
- **Integration:**
  - every start condition of every plate flown headlessly;
  - a perfect run scores 100% on LPV and on LNAV;
  - bad runs for every new rule.
- **E2E:**
  - load and activate an approach, then fly KLAA on glass to minimums;
  - vectors-to-final;
  - Direct-To;
  - GA + unsuspend into the missed;
  - steam NAV/GPS switch;
  - layout and 60 fps with the GPS panel.
- All V1 and V2 tests pass unchanged.

## V3 success criteria

1. A learner can fly every start condition of the nine RNAV plates and the three radio plates
   added in V3 (decision 14) on both panels, to DA/MDA or through the missed approach into the
   hold.
2. Golden tests at every fix agree within ±0.01 NM for GPS cross-track and ±0.1° for desired
   track. GP deviation agrees within ±0.02°.
3. Perfect runs score 100%. Each bad run fails exactly the expected rule.
4. Determinism, layout, 60 fps and the "sim keeps up at 4×" criteria hold with the GPS.
5. Every V1/V2 test passes, changed only where a V3 decision changed the behaviour it checks
   (offset and higher starts, `assigned-altitude`, reversal sequencing, start and procedure
   counts). `prettier`, `tsc`, `eslint`, unit and e2e tests pass.

## V3 out of scope

- RF legs and RNP AR.
- LP+V and LNAV+V coupling.
- NDB.
- Enroute flight planning and airways, VNAV descent planning, OBS mode.
- A non-WAAS (baro-VNAV) equipment option, a temperature model and cold-temperature altitude corrections.
- Wind, GPS position error, circling.
- Loss of GPS integrity (LOI) as a scenario event (deferred; in the todo backlog).

## V3 decisions (2026-11-15)

1. **Plates.** KSBS and KEGE replaced by KCOS and KAPA (simpler); KOGA added for the TAA.
2. **Holds on GPS.** The autopilot flies the GPS track, holds included (entry and NM legs).
3. **Loss of integrity.** Deferred to a later version (kept in the todo backlog).
4. **Approval.** The user approved continuing with this spec on 2026-11-15.
5. **GPS unit in the radio stack** (2026-11-16). The GPS moved from the left pane (briefing and
   plate only) to the right, beside NAV1/NAV2, which stack one per line on RNAV flights. PROC,
   D→ and FPL open popovers; ACT, SUSP (and CDI on steam) are on the face.
6. **GA sequences the GPS on glass** (2026-11-16). Glass: GA arms or sequences the missed
   approach on the GPS. Steam: manual SUSP, and `missed-sequencing` is scored only there.

7. **Missed hold scored on RNAV** (2026-11-16). New rule `missed-hold`: after crossing the
   missed-approach holding fix, enter the hold and get established without flying more than
   the leg length + 3 NM from the fix; ending the flight before established also fails.
8. **Flight-screen tweaks** (2026-11-16). Steam: the NAV1/GPS CDI switch sits at the HSI's
   upper right (press to toggle). PROC offers LOAD and LOAD + ACTIVATE below the approach
   selector. The in-flight briefing card leaves out the RNAV equipment line (a planning item;
   the GPS annunciation covers it in flight); the briefing screen keeps it.
9. **Offset starts** (2026-11-16, radio and RNAV plates). A start may use `offset`
   (`bearingMag`, `distanceNm` from its fix) with its own heading, as after radar vectors: the
   learner turns toward the fix and works out the arrival, the hold entry and whether a course
   reversal is required. Vectors-to-final and arc/radial starts are unchanged.
10. **Straight-in arrivals at a reversal fix** (2026-11-16). Crossing a hold-in-lieu or PT fix
    within 45° of the inbound course is judged by what follows: turning outbound (a direct
    entry, e.g. flown by the GPS) counts as flying it; carrying on 2 NM past the fix is a
    skipped course reversal. The hold's segment minimum is not judged in between.
11. **Steam timer** (2026-11-16): Start/Stop and Reset below the time, centred between the DME
    and the AP panel.
12. **Round 4 tweaks** (2026-11-16).
    - Steam HSI: the source switch is a small VLOC/GPS button at the HSI's upper left; the HSI
      dial is centred over the CDI below; the CRS value is green on VLOC, magenta on GPS.
    - The MAP/PLATE switch moved from the top bar to the upper right of the plate or map view.
    - The briefing no longer lists the TAA areas and altitudes: the learner reads the plate.
    - Starts (except vectors to final) begin above the assigned altitude, and the clearance
      begins "Descend and maintain N, …". Start names say where the aircraft is, never what to
      do (no NoPT, hold or procedure-turn hints). `hold-max-altitude` is judged from the fix.
13. **Scoring round** (2026-11-16).
    - "Hold at <fix>?" is asked when loading any transition with a hold-in-lieu (not only at a
      TAA IAF): the learner decides whether the course reversal is flown. Answering No where
      it is required is a skipped reversal (`fix-order`).
    - A skipped hold-in-lieu is judged as soon as the aircraft heads inbound beyond the fix,
      whatever the arrival direction, so the descent to the next minimum is not judged against
      the hold. A reversal counts only after at least 1 NM on the outbound side.
    - New rule `assigned-altitude`: each start records the altitude its clearance assigns and,
      where it applies, the fix it is kept to (`assigned: { altFt, until }`). Below it (by more
      than 100 ft) before then, or still more than 200 ft above it by then, fails. Without a
      fix it is kept until established on the route's first leg (arc, feeder course, final);
      in a TAA area, once down to it, the TAA altitudes take over.
14. **More plates and circling** (2026-11-16). KEGE and KSBS dropped for good. Added to reach 9
    radio and 9 RNAV approaches: KCEZ VOR 21, KCYS ILS or LOC 27, KSKX VOR/DME-B, KALS RNAV
    (GPS) 2, KCNY RNAV (GPS) 3 (offset final, LP/LNAV). Circling, kept simple: a `CIRCLING`
    minimums line is an MDA; on a circling-only procedure "in sight" is the airport (its
    reference point), and continuing past the MAP with it in sight circles to land on the
    procedure's `runway` (any runway; the sim does not fly the circle). The only decision is
    going around at the MAP or not.