# Tasks: IFRSim V1

Plan: [plan.md](plan.md). Tasks are in dependency order. "Verify" always includes
`npm test && npm run typecheck && npm run lint` unless it says otherwise.
🤖 marks tasks that use a subagent (see plan.md → Subagent use).

## Current status (updated 2026-11-14)

**Where we are:** M0–M4 are committed. The M6 data encodings (all five remaining
approaches) are merged and registered, so all six V1 approaches can be selected and
flown. M6's integration runs (perfect/bad scripted runs) wait for M5.

| Item | Status | Notes |
|---|---|---|
| M0–M2 | ✅ committed | through `16d8f90` |
| M3 (T12–T14) | ✅ committed `cd98a9e` | T14 checkpoint: user test-flight feedback still pending |
| M4 (T15–T19) | ✅ committed | T15 `d3a62c9`, T16–T19 `7ee2756` |
| M6 data (T23, T24, T26–T28) | ✅ merged | ILS branch `748d256`, VOR branch `79e79b4`; registered in `src/procedures/index.ts` |
| M6 rest | ⏳ after M5 | integration tests (one perfect run and one bad run each), T25 PT sequencer/scoring |
| M5 (T20–T22) | ⏭ next | leg sequencer, scoring, debrief |

**Last verified (M6 data merge):** 392 unit tests pass. `tests/procedures/all.test.ts`
builds every start condition of all six approaches. Typecheck, lint and Prettier are
clean. In the browser, all six briefings load with their plates.

**Next steps (in order):**
1. ~~Close the schema gaps~~: done. Added `procedureTurn.inboundMinAltFt`, `turn`/`climbToFt`
   on `direct`, leg `dme` + `expectedDmeSource()`, `final.descentAngle`, and
   `expandedServiceVolumeNm` (KMTJ: JNC 50 NM, so the HAQHY feeder no longer flags).
2. M5: T20 leg sequencer, T21 scoring rules (fresh-eyes review at the end), T22 debrief.

**Known gaps / decisions:**
- KCFO chart note "Autopilot coupled approach NA below 6250 MSL": the trainer's
  autopilot flies to DA anyway. It is shown as a briefing note only.
- Scenario end conditions are geometric (fix passage within 1 NM, inbound heading
  within 30°). Hold-entry correctness is scored in M5, not checked here.
- If the learner goes missed early (before DA/MDA or the MAP), the scenario does
  not switch to the missed phase. Revisit with the T20 sequencer.

## M0 — Scaffold

- [x] **T01 Project scaffold.** Vite + React + TS (strict), Vitest, Playwright, ESLint, Prettier, npm scripts from the spec.
  - Acceptance: every spec command exists and runs; placeholder page renders; one trivial unit test and one e2e test pass.
  - Verify: `npm run build && npm test && npm run test:e2e`
  - Files: `package.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `playwright.config.ts`, `src/main.tsx`, `tests/smoke.test.ts`, `e2e/smoke.spec.ts`

## M1 — Geo + nav data

- [x] **T02 Geo library.** Great-circle distance/bearing, destination point, local east/north projection, signed angle diff, magnetic↔true.
  - Acceptance: golden tests from known coordinate pairs (accuracy ±0.01 NM, ±0.05°).
  - Files: `src/sim/geo/*.ts`, `tests/sim/geo/*.test.ts`
- [x] **T03 NASR/CIFP download + parsers.** `scripts/navdata/` downloads the current cycle into `data/raw/` and parses the records we need: navaids, fixes, ILS (LOC/GS/DME), runway thresholds, airport magvar. _(🤖 research subagent for FAA file layouts)_
  - Acceptance: parsers tested on small checked-in sample snippets; script prints the source cycle.
  - Verify: `npm run navdata` (network, dev-only) + unit tests
  - Files: `scripts/navdata/*.ts`, `tests/scripts/navdata/*.test.ts`, `tests/fixtures/navdata/*`
- [x] **T04 Extract navdata.json for the six airports.** Every navaid, fix and runway on the six plates.
  - Acceptance: list matches the charts (identifier, frequency, position, declination); source cycle recorded.
  - Verify: unit test cross-checks frequencies/identifiers against a hand-typed list from the plates. **Checkpoint: user reviews the list.**
  - Files: `src/procedures/navdata.json`, `tests/procedures/navdata.test.ts`

## M2 — Sim core (test-first)

- [x] **T05 VOR + DME receivers.** Deviation, to/from, flag, range, DME slant range.
  - Acceptance: golden tests (e.g. FQF R-045 at 11 DME → centred FROM with OBS 045).
  - Files: `src/sim/nav/vor.ts`, `dme.ts`, tests
- [x] **T06 LOC + GS receivers.** Localizer deviation (±2.5° full scale; back-course flagged), GS deviation (±0.7°), flags.
  - Acceptance: golden tests on KCFO I-FTG final; GS centred at TCH 50 over threshold.
  - Files: `src/sim/nav/loc.ts`, `gs.ts`, tests
- [x] **T07 Aircraft model.** Turn rate/bank ramp, VS limits, speed changes, position update in lat/lon (see plan decision 6).
  - Acceptance: 360° turn takes 120 s ±2 s; VS capture and speed change rates as specified.
  - Files: `src/sim/aircraft/*.ts`, tests
- [x] **T08 Autopilot mode state machine.** ROL/HDG/NAV/APR lateral; PIT/VS/ALT/GS vertical; arm/capture transitions; annunciator state.
  - Acceptance: transition table test covers every mode pair; invalid presses are ignored.
  - Files: `src/sim/autopilot/modes.ts`, tests
- [x] **T09 Autopilot control laws.** Heading hold, VOR/LOC intercept and track (45° max), GS track, ALT capture. _(🤖 fresh-eyes review of T08–T09 at end of M2)_
  - Acceptance: LOC intercept from 30°/45° settles with < 1 dot overshoot; ALT capture ±20 ft; GS tracking within ¼ dot.
  - Files: `src/sim/autopilot/laws.ts`, tests
- [x] **T10 Sim loop, commands, recorder, replay.** Fixed 20 Hz step; command queue; time scale; input log; deterministic replay.
  - Acceptance: replay of an input log reproduces the track exactly (1e-9).
  - Files: `src/sim/loop.ts`, `src/sim/commands.ts`, `src/sim/recorder.ts`, tests
- [x] **T11 Headless KCFO vectors-to-final run.** Minimal hard-coded scenario; scripted inputs fly to DA.
  - Acceptance: at DA, LOC and GS within ½ scale.
  - Files: `tests/integration/kcfo-vectors.test.ts`

## M3 — Thin flyable slice

- [x] **T12 Instrument components.** HSI, altimeter, VSI, ASI, DME readout as SVG components driven by snapshot props. _(🤖 parallel worktree (with M6 data encoding))_
  - Acceptance: visual check in a dev gallery page; snapshot tests of rendered needle angles.
  - Files: `src/ui/instruments/*.tsx`, `src/ui/dev/Gallery.tsx`
- [x] **T13 Autopilot panel + nav radios + power selector.** Knobs (drag/scroll/keyboard), mode buttons with armed/active annunciation, active/standby frequency flip-flop. _(🤖 parallel worktree (with M6 data encoding))_
  - Acceptance: every control sends the right command; keyboard accessible.
  - Files: `src/ui/panel/*.tsx`
- [x] **T14 Flight screen wiring.** rAF render loop reading sim snapshots; KCFO vectors-to-final start.
  - Acceptance: user can fly to DA in the browser; e2e test arms APR and sees LOC capture.
  - Verify: `npm run test:e2e`. **Checkpoint: user flies it and gives feedback.** _(awaiting feedback)_
  - Also added early (from T19): pause, 1×/2×/4×, restart.
  - Files: `src/ui/screens/Flight.tsx`, `e2e/fly-kcfo-vectors.spec.ts`

## M4 — Full procedure + scenario

- [x] **T15 Procedure schema.** Zod schema for legs (feeder, arc, hold-in-lieu, heading-to-intercept, barbed PT, final with step-downs/VDP/MAP, missed with hold/climb-in-hold), minimums, start conditions.
  - Acceptance: schema documented in `docs/procedure-encoding.md`; invalid sample files fail with clear errors.
  - Files: `src/procedures/schema.ts`, `docs/procedure-encoding.md`, tests
- [x] **T16 Encode KCFO ILS/LOC 26 fully.** Feeder FQF R-045, SKIPI hold-in-lieu, ILS + LOC-only minimums, missed to SKIPI; 3 start conditions. _(🤖 independent chart-verification subagent)_
  - Acceptance: fix positions within 0.1 NM of FAA data; validates against the schema.
  - Files: `src/procedures/kcfo-ils26.json`, tests
- [x] **T17 Scenario engine.** Start conditions, briefing text, ceiling/visibility, GS outage, runway-in-sight at DA/MDA, end conditions (landed / missed + hold entry + 1 lap).
  - Files: `src/sim/scenario/*.ts`, tests
- [x] **T18 Approach select + briefing screens + chart viewer.** Pan/zoom plate with the "Training use only" banner and cycle dates.
  - Files: `src/ui/screens/Select.tsx`, `Briefing.tsx`, `src/ui/chart/*.tsx`, `public/charts/*`
- [x] **T19 Timer, Morse ident (audio + text), pause/1×/2×/4×, restart.**
  - Files: `src/ui/panel/Timer.tsx`, `src/sim/nav/morse.ts`, `src/ui/audio/ident.ts`, tests

## M5 — Scoring + debrief

- [ ] **T20 Leg sequencer.** Tracks the current procedure leg from fix passage and course alignment.
  - Acceptance: correct leg sequence on the scripted KCFO runs, including the hold and missed approach.
  - Files: `src/sim/scoring/sequencer.ts`, tests
- [ ] **T21 Scoring rules.** Every rule in the spec (altitude below segment minimum, tuning/ident, fix order, LOC/GS ½ scale inside FAF, hold entry, PT, wrong DME source, below DA/MDA, missed approach, map-use and NoPT notes). _(🤖 fresh-eyes review of T20–T21 at end of M5)_
  - Acceptance: one "bad run" test per rule loses points on exactly that rule; the perfect run scores 100%.
  - Files: `src/sim/scoring/rules/*.ts`, `tests/integration/kcfo-scoring.test.ts`
- [ ] **T22 Debrief screen.** Plan-view track over procedure, altitude profile vs chart profile, event timeline, score table, replay at 1×/4×/16×.
  - Files: `src/ui/screens/Debrief.tsx`, `src/ui/map/*.tsx`, `e2e/debrief.spec.ts`

## M6 — Remaining approaches

Each task: encode JSON, start conditions, golden receiver tests at every fix, and one scripted perfect run plus one bad run.

- [ ] **T23 KGXY ILS/LOC 35.** GLL 17.5 arc (NoPT), WELDS hold-in-lieu, missed to CEDUK. _(🤖 chart verification; data part may run in a parallel worktree)_ _Data half done (JSON, plate, golden tests); integration runs wait for M5._
- [ ] **T24 KMTJ ILS/LOC 17.** DME from MTJ VOR (wrong-source rule), MTJ 14.8 arc, HAQHY feeder, climb-in-hold at PAGRE; GPS feeders excluded. _(🤖 chart verification; data part may run in a parallel worktree)_ _Data half done (JSON, plate, golden tests); integration runs wait for M5._
- [ ] **T25 Barbed procedure turn support.** Sequencer + scoring for 45°/180° PT (side, distance, altitude). Needed by T26–T28.
- [ ] **T26 KAKO VOR 29.** FROM-station final, MAP by DME and by timing table, AKO 10 arcs, GERON PT. _(🤖 chart verification; data part may run in a parallel worktree)_ _Data half done (JSON, plate, golden tests); integration runs wait for M5._
- [ ] **T27 KLAR VOR/DME 30.** Step-downs, LAR 18 arc, ECECU PT, FLEMS heading-to-intercept, climb-in-hold. _(🤖 chart verification; data part may run in a parallel worktree)_ _Data half done (JSON, plate, golden tests); integration runs wait for M5._
- [ ] **T28 KSNY VOR/DME 13.** On-field VOR, JIKUT MAP, VDP, SNY 11 arcs, CHAKO PT. _(🤖 chart verification; data part may run in a parallel worktree)_ _Data half done (JSON, plate, golden tests); integration runs wait for M5._
  - Files (each): `src/procedures/<id>.json`, `tests/procedures/<id>.test.ts`, `tests/integration/<id>.test.ts`, `public/charts/<id>.png`

## M7 — Polish + V1 acceptance

- [ ] **T29 Optional moving map.** Toggle, aircraft over procedure; usage recorded for the debrief.
- [ ] **T30 Layout + performance.** Desktop and tablet-landscape layouts; 60 fps at 1× and the sim keeping up at 4× (measured).
- [ ] **T31 Offline + no-network check.** e2e test that blocks all non-localhost requests and flies a scenario.
- [ ] **T32 V1 acceptance.** Walk through every SPEC.md success criterion and record the results in `docs/v1-acceptance.md`. _(🤖 fresh-eyes review of the whole V1)_
