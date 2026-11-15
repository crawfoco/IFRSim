# V1 acceptance (T32)

Date: 2026-11-14.

**Commands:** `npm test` (473 tests), `npm run typecheck`, `npm run lint` and
`npm run test:e2e` (8 tests, including a Firefox performance run) all pass. `src/sim` line coverage is about 99%.

**Independent review:** a fresh-eyes review checked the implementation against every
SPEC.md acceptance and success criterion. It flew every start condition in scratch
scripts. Its findings are below, and the bugs it found are fixed (see "Fixed during
acceptance").

## Success criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Every start condition of all six procedures can be flown to DA/MDA, or through the missed approach to the holding fix, with only the panel, radios and instruments | **Met** | Repo tests fly all 21 starts end to end, several through the missed approach and one hold circuit (see below) |
| 2 | Needles, flags and DME agree with golden geometry to ±0.1° (VOR/LOC), ±0.02° (GS) and ±0.05 NM (DME) | **Met** | `tests/sim/nav/{vor,loc,gs,dme}.test.ts` use 0.1° / 0.02° / 0.002 NM. Chart-fix golden tests (`tests/procedures/*`) allow up to 0.5° and 0.1 NM where the chart rounds radials and DME |
| 3 | Scripted perfect runs score 100%; each wrong run loses points on exactly the expected rule | **Met** | Perfect runs for all six procedures. Bad runs cover these rules: ident, DME source, fix order (two kinds), segment minimum (feeder, arc, step-down), hold entry, procedure-turn side, LOC and GS deviation, below DA, missed-approach turn, and a late climb past the MAP |
| 4 | Deterministic: same scenario and inputs, same track within 1e-9 | **Met** | `tests/sim/loop.test.ts` (replay) |
| 5 | ≥ 60 fps in Chrome, Edge and Firefox; the sim keeps up at 4× | **Met** in headless runs, Chromium and Firefox | `e2e/layout-performance.spec.ts` (80 steps/s needed at 4×). Chromium: 60.1 fps, worst frame 16.8 ms, 80.1 steps/s. Edge uses the same engine. Firefox 159 (Playwright project `firefox-perf`): 59.6–60.2 fps, worst frame 17.4 ms (one run 32.9 ms), 79.9–80.3 steps/s. Headless Firefox is not tied to a display refresh: left alone it ran at about 85 frames/s, so the project sets `layout.frame_rate` to 60 to stand in for a 60 Hz display. Headed Firefox on this machine's 120 Hz display ran at 102–106 fps |
| 6 | Static `dist/` that runs with no network after loading | **Met** | `e2e/offline.spec.ts`: no external requests are made. With the network cut after loading, all six plates still open (they are preloaded) and a fly → debrief cycle works |
| 7 | All four commands pass | **Met** | See above |

### Starts flown by repo tests

All 21 start conditions, including the new KCFO `direct-skipi`, are flown by repo tests.
Most score 100%; the rest are deliberate bad runs. The tests are in `tests/integration/`
(including `starts-*.test.ts`) and `tests/sim/scenario/starts.test.ts`.

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

## Open gaps: decided by the user (2026-11-14)

1. **Hold leg timing:** now scored. Each outbound leg must be 1 min ±15 s, timed from wings level outbound (or abeam the fix) to the turn back (`hold-timing`).
2. **KAKO timing-table MAP:** kept as DME only. The briefing says the timing table is a backup.
3. **Direct hold entry:** new start, KCFO `direct-skipi`. It joins the route at SKIPI from the north, where a direct entry is correct.
4. **Debrief profile:** the time profile stays. A final-approach profile, altitude against distance to the threshold, now shows the FAF, step-downs, the glideslope or descent angle, DA/MDA, VDP and MAP.
5. **Tuning rule:** the navaid must also stay tuned. More than 10 s untuned while a leg depends on it fails. Re-tuning early for the next leg, on the same radio, is allowed.
6. **Hold altitudes:** now scored. One item fails when the aircraft is more than 100 ft above a hold's maximum (`hold-max-altitude`). Another fails when it hasn't reached the climb-in-hold altitude by the end of the circuit (`climb-in-hold`).
7. **Firefox performance:** measured with Playwright's Firefox, as a headless run held at 60 Hz (see criterion 5). It has not been checked by eye on a real 60 Hz display.
8. **Plate on the debrief:** a Plan / Plate toggle.

Other changes the user asked for at the same time:
- The autopilot holds the HSI course (CRS) on a localizer, and the briefing tells the learner to set it.
- Restart picks new hidden weather.
- The power selector covers 80–110 KIAS. Category A and B minimums are the same on all six plates.
- Starts that began over their initial fix now begin 5 NM before it.
- Every start condition is flown by a repo integration test.

## After acceptance: the decision at minimums (2026-11-14)

The user replaced the briefing's weather choice with a judgement test. The weather is
hidden and random; the briefing reports a ceiling range around minimums and the tops.
Every flight starts above the tops. An out-the-window view shows clear sky, cloud, or the
ground with the runway once it is in sight (below the base and within the visibility). Going
missed takes the GA (TOGA) button. Passing the DA, the MDA or the MAP without GA counts as
landing, which is fine with the runway in sight. Without it, the flight ends and the new
`decision` item fails. The early-missed detection by climbing was removed: GA is the only
trigger. "Fly again" picks new weather.
