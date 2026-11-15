# V1 acceptance (T32)

Date: 2026-11-14.

**Commands:** `npm test` (431 tests), `npm run typecheck`, `npm run lint` and
`npm run test:e2e` (7 tests) all pass. `src/sim` line coverage is about 99%.

**Independent review:** a fresh-eyes review checked the implementation against every
SPEC.md acceptance and success criterion. It flew every start condition in scratch
scripts. Its findings are below, and the bugs it found are fixed (see "Fixed during
acceptance").

## Success criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Every start condition of all six procedures can be flown to DA/MDA, or through the missed approach to the holding fix, with only the panel, radios and instruments | **Met**, with 11 starts not yet in the repo's tests (see below) | All 20 starts were flown in the review. Integration tests in `tests/integration/` fly 9 starts end to end |
| 2 | Needles, flags and DME agree with golden geometry to ±0.1° (VOR/LOC), ±0.02° (GS) and ±0.05 NM (DME) | **Met** | `tests/sim/nav/{vor,loc,gs,dme}.test.ts` use 0.1° / 0.02° / 0.002 NM. Chart-fix golden tests (`tests/procedures/*`) allow up to 0.5° and 0.1 NM where the chart rounds radials and DME |
| 3 | Scripted perfect runs score 100%; each wrong run loses points on exactly the expected rule | **Met** | Perfect runs for all six procedures. Bad runs cover these rules: ident, DME source, fix order (two kinds), segment minimum (feeder, arc, step-down), hold entry, procedure-turn side, LOC and GS deviation, below DA, missed-approach turn, and a late climb past the MAP |
| 4 | Deterministic: same scenario and inputs, same track within 1e-9 | **Met** | `tests/sim/loop.test.ts` (replay) |
| 5 | ≥ 60 fps in Chrome, Edge and Firefox; the sim keeps up at 4× | **Met in Chromium; Firefox not measured** | `e2e/layout-performance.spec.ts`: 60.1 fps, worst frame 16.8 ms, 80.1 steps/s at 4× (80 needed). Edge uses the same engine. Firefox needs a manual check (Playwright's Firefox is not installed here) |
| 6 | Static `dist/` that runs with no network after loading | **Met** | `e2e/offline.spec.ts`: no external requests are made. With the network cut after loading, all six plates still open (they are preloaded) and a fly → debrief cycle works |
| 7 | All four commands pass | **Met** | See above |

### Starts flown by repo tests

- KCFO: `over-fqf`, `vectors-final`
- KGXY: `wavdi-arc` (and `over-gll` in a bad run)
- KMTJ: `vectors-final`, `over-mtj`
- KAKO: `direct-ako`
- KLAR: `direct-lar`
- KSNY: `riyop-arc`

The review flew the other 11 starts in scratch scripts, and all reached DA/MDA at 100%:
- KCFO `join-feeder`
- KGXY `over-gll`, `vectors-final`
- KMTJ `haqhy`, `pagre-arc`
- KAKO `north-arc`, `south-arc`
- KLAR `povoh-arc`, `flems`
- KSNY `ogjun-arc`, `direct-sny`

Moving those scripts into `tests/integration/` would lock this in.

## User stories

| Story | Result | Notes |
|---|---|---|
| 1. Pick and brief | Met | The list shows airport, name and chart cycle. Start conditions can be picked or chosen at random. The briefing shows the clearance, weather, glideslope status, minimums and missed approach. The plate can be panned and zoomed on the briefing and flight screens |
| 2. Fly by instruments | Met | HSI, CDI (NAV2), ASI, altimeter, VSI, DME with source, and timer. Two radios with flip-flop. The Morse ident plays as audio and text, only within reception range. Flags. The moving map is off by default; using it is noted in the debrief |
| 3. Drive the autopilot | Met | AP, HDG, NAV, APR, ALT and VS, armed and active. The power selector covers 90–120 KIAS and sets the approach category (A and B minimums happen to be the same on all six plates) |
| 4. Fly the whole procedure | Met, with gaps | Holds (all entries), barbed procedure turns, TO and FROM finals, DME arcs in HDG, step-downs, LOC-only, the DA/MDA outcome, and the missed approach with hold entry and one circuit. Gaps: hold leg timing, and the KAKO timing-table MAP (see below) |
| 5. Debrief and score | Met, with gaps | All scored items are there. Plan view, profile, timeline, and replay at 1×, 4× and 16×. The profile plots altitude against time with the minimum altitudes, not against distance with the chart's descent path |
| 6. Control time | Met | Pause, 1×, 2× and 4×, restart |

## Fixed during acceptance

- **The ident could be heard from stations out of range.** It now needs the station to be within reception range (the VOR service volume; 25 NM for a localizer, or the expanded service volume).
- **An early missed approach left the scenario stuck.** Climbing 300 ft above the lowest altitude on final now starts the missed approach.
- **A quick arrival at the missed-approach holding fix was ignored** (the window was 90 s). The window is now 45 s, which still ignores KSNY's straight-ahead overflight of SNY.
- **The KAKO final course went unscored on good-weather runs.** Within 1 NM of the VOR, the final course is now judged by cross-track distance.
- **The MAP is no longer announced.** On a non-precision approach the learner identifies the MAP. The missed-approach item now fails when the climb starts more than 0.5 NM past it. When the weather was good, there is still a callout if the aircraft passes the MAP too high to land.
- **The KMTJ procedure turn at BRUUK could not be flown** (the localizer flagged beyond 18 NM). The expanded service volume now applies to localizers too, set to 25 NM for I-MTJ. A scripted run scores 100%.

## Open gaps: decisions for V1 or later

1. **Hold leg timing is not scored.** The SPEC says missed-approach hold entry and leg timing are scored. Entry is scored; outbound leg time (about 1 minute) is not.
2. **KAKO timing-table MAP.** The table is encoded but not used: the MAP is identified by DME (AKO 1.7). A learner can fly the timing with the stopwatch, but it is not checked.
3. **No start condition makes a direct hold entry the correct one.** All arrivals at SKIPI, WELDS and the missed-approach holds call for parallel or teardrop. A start that arrives from the holding side would let learners practise direct entries.
4. **The debrief profile is altitude against time**, with the minimum altitude in force at each moment. The SPEC's "against the chart profile" suggests distance on the x-axis with the descent path.
5. **The tuning rule checks for an identification before use**, not that the station is still tuned while the leg is flown.
6. **Not scored:** hold maximum altitudes (`maxAltFt`, e.g. 8000 at SKIPI) and climb-in-hold completion.
7. **Firefox performance** needs a manual check.
8. **The plate is not shown on the debrief screen.** The plan view is.

## After acceptance: the decision at minimums (2026-11-14)

The user replaced the briefing's weather choice with a judgement test. The weather is
hidden and random; the briefing reports a ceiling range around minimums and the tops.
Every flight starts above the tops. An out-the-window view shows clear sky, cloud, or the
ground with the runway once it is in sight (below the base and within the visibility). Going
missed takes the GA (TOGA) button. Passing the DA, the MDA or the MAP without GA counts as
landing, which is fine with the runway in sight. Without it, the flight ends and the new
`decision` item fails. The early-missed detection by climbing was removed: GA is the only
trigger. "Fly again" picks new weather.
