# V2 acceptance (G7)

Date: 2026-11-15. Branch `v2-glass` (from `main` at `b27667c`, v1.0.0-beta.1).

**Commands:** `npx prettier --check .`, `npm run typecheck`, `npm run lint`, `npm test`
(595 tests) and `npm run test:e2e` (23 tests, including the Firefox performance run)
all pass.

**Independent review:** a fresh-eyes reviewer read the whole V2 diff against the SPEC (not the
reasoning behind it), ran the tests and looked for steam regressions, coupling and bearing errors,
display, React, layout and accessibility problems, and manufacturer branding. It found no
high-severity defects; its findings and what was done are below.

## Success criteria (SPEC.md, V2)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Every start condition of all six procedures can be flown on the glass panel, as on steam | **Met** | The sim never reads the panel choice (`panelOf` is used only by the UI), so the V1 integration tests that fly all 20 starts apply to both panels. `tests/ui/glass-all-starts.test.tsx` runs each start for a minute on the autopilot with both bearing pointers on and checks the Glass PFD renders sane values. `e2e/fly-glass.spec.ts` flies KCFO ILS 26 on the glass panel from vectors to DA with the real controls |
| 2 | The steam panel behaves exactly as in V1 | **Met** | Only two pre-existing test files changed: `tests/ui/controls.test.tsx` (tests added, none removed) and `e2e/layout-performance.spec.ts` (its assertions are unchanged and now run for both panels). All V1 unit, integration and e2e tests pass. One steam regression was found and fixed during V2 (see below) |
| 3 | AP coupling to the CDI source and the CDI switch are covered by unit and e2e tests | **Met** | `tests/sim/nav-sources.test.ts` (mode cases: NAV/APR active → ROL, armed → cancelled with HDG kept, GS dropped; GS from the CDI radio; replay), `tests/integration/glass-nav2.test.ts` (ILS flown on NAV2 scores 100%), `e2e/glass-sources.spec.ts` |
| 4 | Bearing pointers agree with the golden bearing within ±1° | **Met** | `tests/sim/nav/bearing.test.ts`: six VOR radials at 8–20 NM within 0.1°. `e2e/glass-sources.spec.ts`: the drawn BRG1 pointer is within 1° of a bearing computed independently in the test |
| 5 | Layout and performance hold on the glass panel | **Met** | `e2e/layout-performance.spec.ts`: no page scroll or panel overflow at 1366×860 and 1024×768 for both panels; ≥ 55 fps measured (Chromium and Firefox), the sim keeping up at 4×. Final run: 60.0–60.2 fps, worst frame 16.8 ms (Chromium) and 17.4–17.6 ms (Firefox). Over repeated runs Firefox shows an occasional single ~33 ms frame, the same before and after G5 and on both panels; runs made while the dev server or another test run was busy showed 33–67 ms frames on both panels |
| 6 | prettier, tsc, eslint, unit and e2e tests all pass | **Met** | See the commands above |

## User stories

| Story | Result | Notes |
|---|---|---|
| 7. Choose the panel | Met | Steam / Glass on the briefing (default Steam, kept while you go back and forth in one visit). Restart and Fly again keep it. The debrief shows "Panel: Steam gauges" or "Panel: Glass PFD". Scoring is the same |
| 8. Fly on the Glass PFD | Met | Attitude (display pitch from VS and TAS plus a nominal angle of attack; the flight model is unchanged), airspeed tape with 6 s trend, altitude tape with selected-altitude and minimums bugs, VSI with the VS bug, HSI with CDI, TO/FROM, VLOC label, flags and glideslope, HDG/CRS/BARO boxes, DME window, minimums box, mode bar (green/white, ~3 s flash, steady highlight with reduced motion), MINIMUMS alert for 5 s of sim time and a chime once per event. No manufacturer names (checked with `git grep`) |
| 9. CDI and bearing sources | Met | CDI toggles VLOC1/VLOC2; BRG1 (single line) and BRG2 (double line) cycle OFF → NAV1 → NAV2 with info boxes (NO BRG on a localizer). The autopilot follows the CDI source; the steam panel never changes it. CDI and BRG changes are in the debrief timeline. CRS1/CRS2, DME SRC and the timer stayed beside the PFD (after the first test flight: one CRS knob for the CDI source, see below) |
| 10. How to fly | Met | Side panel on the home screen with the five steps and the panel line; README matches. Layout e2e: all cards and the panel in view at both sizes |
| 11. Briefing tidy-up | Met | Wider briefing column (620 px desktop, 505 px tablet; after the first test flight: a 50/50 split), Fit still works (e2e); chart notes in a closed "Details about this approach chart" disclosure; hints visible |

## Added during V2 (user requests)

- **Heading sync:** double-click the HDG knob (or Enter) sets the bug to the current heading. A sim
  command, so it is logged and replays exactly. Both panels.
- **DME window** on the Glass PFD, from the existing DME source (scoring unchanged).
- **CDI switch with NAV/APR only armed** cancels it and keeps HDG (active NAV/APR still drops to
  ROL).

## Open issues (G6)

- [#7](https://github.com/crawfoco/IFRSim/issues/7) Moving map squeezed the plate: fixed; the map
  takes the plate's place while on (e2e at both sizes).
- [#8](https://github.com/crawfoco/IFRSim/issues/8) No number for the selected heading on steam:
  fixed; the AP mode row shows "HDG nnn°".
- Both issues have a comment and stay open until V2 reaches `main`.

## Fixed during V2

- **The steam panel's DME readout was hidden** by the DME-window change (`7f0ca6e`): a text
  replacement matched the steam line as well as the glass one. Restored in `fba0650`; the layout
  e2e now checks the DME display on both panels.
- **`docs/v1-acceptance.md` said 21 start conditions**; there have been 20 since `direct-skipi`.
  Corrected.

## Review findings

| Finding | Severity | Done |
|---|---|---|
| The PFD's mode bar and MINIMUMS alert were inside the SVG's `role="img"`, so screen readers never announced them (and on glass the AP panel's own status row is hidden) | Medium | Fixed: a visually hidden status line (modes as a sentence) and alert ("Minimums") outside the SVG; the SVG's label now includes the HSI summary (course, needle, TO/FROM, GS). Tests in `tests/ui/glass-modes.test.tsx` |
| Debrief timeline: two commands in one step were both described from the state after the whole step (e.g. two BRG presses logged "BRG1 NAV2" twice) | Low | Fixed: each command's text comes from the state just after it. `tests/sim/scoring/timeline.test.ts` (fails without the fix) |
| Stale comment in `src/sim/commands.ts` said armed NAV/APR drops to ROL | Low | Fixed |
| Suggestion: turning the VS wheel replayed the mode flash | — | Done: the vertical field flashes on a mode change only |
| Suggestion: resume a suspended audio context before the chime | — | Done |
| Suggestion: a localizer without a glideslope shows a permanent GS flag on the HSI | — | Kept: same as the steam HSI in V1. Could hide the scale instead in a later version |
| Suggestion: the speed tape shows about ±27 kt around the current speed (SPEC said "about 60–130") | — | Kept: the whole 80–110 KIAS range plus margin is always in view |
| Suggestion: no test that the chime plays exactly once per event | — | Kept: the effect is keyed on the event's tick and guarded by the panel; it can't be heard in headless browsers anyway |

The reviewer's Playwright run also hit `ENOENT` errors closing trace files under `test-results/` while
another run was using the same folder (not assertion failures); with one run at a time, all pass.

## Not checked by machine

- The minimums chime has not been listened to (headless browsers have no audio).
- Performance on a real 60 Hz display by eye (as in V1, Firefox is measured headless at 60 Hz).
- A full flight of each approach on the glass panel by a person (the user's checkpoint flights).

## After the first test flight (2026-11-15)

The user flew V2 and asked for these changes (SPEC story 12 and the notes on stories 9–11).
All are covered by tests:

| Change | Tests |
|---|---|
| Version 2.0.0-beta.1 | `tests/app-info.test.ts` (version from package.json) |
| How to fly step 4: "continue and the sim lands automatically" (home screen and README) | `tests/ui/home-briefing.test.tsx` |
| Briefing: 50/50 split; Runway at minimums: Random / In sight / Not in sight (Restart keeps a chosen outcome) | `tests/sim/scenario/scenario.test.ts`, `tests/ui/home-briefing.test.tsx`, layout e2e |
| CRS hint off the briefing; `loc-crs` debrief note when CRS was more than 10° off the localizer | `tests/sim/scoring/loc-crs.test.ts` |
| Flight card without minimums and missed approach; GA callout "Going missed." | `tests/ui/home-briefing.test.tsx`, `tests/sim/scenario/scenario.test.ts` |
| Glass: one CRS knob for the CDI source | `e2e/glass-sources.spec.ts`, `e2e/fly-glass.spec.ts` |
| Glass: auto-ID shown next to the radios, and it counts as identification | `tests/sim/scoring/auto-id.test.ts` (glass passes, steam still needs ID), e2e |
| Debrief: Plan / Plate switches the whole column | `e2e/debrief.spec.ts` |
