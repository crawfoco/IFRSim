# V3 acceptance (R35)

Date: 2026-11-16. Branch `v3-rnav` (from `main` at `813586d`, V2), at `649e865`
(3.0.0-beta.1). V3 is `git diff 813586d..HEAD`: commits `b057342` and `649e865`.

**Commands:** `npx prettier --check .` ("All matched files use Prettier code style!"),
`npm run typecheck` and `npm run lint` (no output, exit 0), `npm test` (98 files, 1246 tests at the
review; 102 files, 1260 tests after fixing M1–M4) and
`npm run test:e2e` (30 tests in 2.1 min, including the two Firefox performance runs) all pass.
Coverage (`npx vitest run --coverage`): `src/sim` 97.9% of lines (95.3% of statements);
`src/sim/gps` 94.3% of lines.

The e2e performance lines (all on the KCFO ILS 26 flight, no GPS):

| Browser | Panel | fps | Worst frame | Sim at 4× (target 80) |
|---|---|---|---|---|
| Chromium | Steam | 60.2 | 16.8 ms | 80.2 steps/s |
| Chromium | Glass | 60.2 | 16.8 ms | 80.3 steps/s |
| Firefox | Steam | 60.1 | 17.6 ms | 80.0 steps/s |
| Firefox | Glass | 60.1 | 17.7 ms | 80.0 steps/s |

**Independent review:** a fresh-eyes reviewer read the V3 sections of SPEC.md (objective to
decision 14), the boundaries and code style, and the V3 diff. It judged the code and tests against
the SPEC, not against the reasoning behind them. It ran the commands above and checked these
points with throwaway scripts and tests (all deleted afterwards; `git status` clean):
GPS geometry and sequencing, the hold entries, the scoring rules, CA-leg courses against the CIFP,
replay with GPS commands, and the frame rate with the GPS active. It compared six plates
(KLAA, KOGA, KCOS, KPUB, KCNY, KAPA) with their JSON: minimums, WAAS channel, equipment line,
missed-approach text, TAA areas and step-downs. It also checked for manufacturer names
(`git grep -i` for Garmin, Avidyne, Bendix, King, GTN, GNS, G1000, G500, G3X, KLN, IFD, Aspen,
Honeywell, Collins, Jeppesen, ForeFlight: none), runtime network use (none in `src`; the CIFP
download is a dev-time script pointing at `aeronav.faa.gov`) and new dependencies (none; only the
version changed in `package.json`). All navdata is FAA: NASR 2026-10-29 and CIFP 2611.
It found no high-severity defects. It found four medium findings (WAAS state shown before the
annunciation, LNAV-only step-downs judged on LPV, a fly-by state that never clears, and
`gps-approach-active` judged at the FAF) and several low ones. All are listed below and are
**open**.

## Success criteria (SPEC.md, V3)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Every start condition of the nine RNAV plates and the three V3 radio plates can be flown on both panels, to DA/MDA or through the missed approach into the hold | **Partly met** | The integration tests (`tests/integration/k*-rnav*.test.ts`, `kcez-vor21`, `kcys-ils27`, `kskx-vordme-b`) fly every start of the 12 plates except KPUB `direct-bonuh`. The reviewer flew `direct-bonuh` in a throwaway test: 100% on steam and glass. The sim branches on the panel only for GA → GPS sequencing, which is tested on glass (`klaa-rnav18.test.ts` "glass: GA at the MDA…") and in `e2e/fly-rnav.spec.ts` (KLAA vectors to final on glass, to the LPV DA). `tests/ui/glass-all-starts.test.tsx` covers the 42 radio starts only, so the Glass PFD with the GPS source has no check at the 47 RNAV starts |
| 2 | Golden tests at every fix: GPS cross-track ±0.01 NM, desired track ±0.1°, GP deviation ±0.02° | **Partly met** | `tests/procedures/k*-rnav*.test.ts` check, at each fix, that cross-track is under 0.01 NM and that the desired track is within **1°** of the charted (whole-degree) course. The GP is checked in feet (under 2 ft at the threshold crossing height, ±60 ft at the FAF), with no angular ±0.02° check. `tests/sim/gps/geometry.test.ts` checks the TF geometry. The ±0.1° and ±0.02° tolerances are not tested as written |
| 3 | Perfect runs score 100%; each bad run fails exactly the expected rule | **Partly met** | There are perfect runs on LPV, LNAV, LP and VTF for each plate (`failed(f)` is `[]`). Bad runs exist for `gps-approach-active`, `gps-approach-mode` (CDI off the GPS), `glidepath`, `missed-sequencing`, `missed-hold` (two), `taa-altitude`, `taa-reversal` and `assigned-altitude` (`tests/sim/scoring/assigned.test.ts`). Gaps: the KOGA bad run without the hold fails **two** rules (`fix-order` and `taa-reversal`, by design in the test); there is no bad run for the RNAV `final-course` or for crossing the FAF in TERM. (Findings M2 and M4, rules that passed or failed the wrong thing, are fixed.) |
| 4 | Determinism, layout, 60 fps and "sim keeps up at 4×" hold with the GPS | **Partly met** | Layout: `e2e/fly-rnav.spec.ts` (GPS unit in the radio stack, no overflow at 1366×860 and 1024×768, both panels). The behaviour holds: replaying a KPUB flight with load, activate, a hold entry, Direct-To and GA gave a state deep-equal to the original (30020 ticks). A throwaway e2e with KLAA loaded and active, NAV on the GPS and the FPL page open measured steam 60.2 fps (worst frame 16.8 ms, 80.3 steps/s) and glass 60.0 fps (16.8 ms, 80.0 steps/s). But the committed suite has no GPS replay test, and the 60 fps test still flies KCFO with no GPS panel, although the SPEC asks for one |
| 5 | Every V1/V2 test passes, changed only where a V3 decision changed the behaviour; prettier, tsc, eslint, unit and e2e pass | **Met** | All pass (see above). The 24 changed pre-existing test files trace to decisions 9 and 12–14: offset and higher starts, `assigned-altitude`, reversal sequencing, start and procedure counts, the How to fly text, and the MAP/PLATE switch. The V1 procedure JSONs changed too (starts, clearances, `assigned`), against the design note "the six V1 files do not change", but decisions 9, 12 and 13 call for those changes |

## User stories

| Story | Result | Notes |
|---|---|---|
| 13. Fly an RNAV approach with the GPS | Met | Flights start with "No approach loaded" (e2e). PROC → LOAD / LOAD + ACTIVATE, ACT, CDI on GPS, NAV/APR. Sequencing, fly-by anticipation R·tan(Δ/2), fly-over MAP, holds with direct, teardrop and parallel entries, and SUSP at the MAP are covered in `tests/sim/gps/receiver.test.ts` and the integration tests. Direct-To works from present position to any flight-plan fix. With VTF, APR intercepts from a heading. Finding M3 (the fly-by state did not clear when the aircraft did not turn) is fixed |
| 14. Know what the GPS is doing | Partly met | ENR/TERM/APR/MAPR with 2 / 1 / 0.3 NM or angular scaling and a 2 NM ramp to the FAF. Annunciations LPV, LNAV/VNAV, LP+V, LNAV(+V) from 2 NM before the FAF. SUSP. Glass: GPS source in magenta, a phase/annunciation tag by the HSI, a GP pointer, a GPS bearing pointer. Steam: the VLOC/GPS switch (decision 12), the GP on the GS pointer, and the annunciations on the GPS unit. Missing: the FPL page lists only waypoints and the active leg, with **no course, distance or altitude constraints** (L4) |
| 15. Fly the right minimums | Partly met | The minimums box, the bug and the callout use `activeMinimums(…, waas)`. LPV and LNAV/VNAV are flown to a DA on the GP; LP, LNAV and +V to an MDA, and +V is never coupled (`autopilot.ts`). The briefing choice Surprise me / Available / Not available works. LNAV-only step-downs are no longer judged on LPV (M2, fixed). RNAV VDPs are notes only (not on the final profile) |
| 16. Scenario events (LPV not available revealed only at the annunciation) | Met (after fixing M1) | Before the annunciation the briefing (minimums and weather text), the GPS (GP shown, APR arms it) and the glass minimums box are the same with and without WAAS; the annunciation (LNAV) reveals it and drops the GP arm (`tests/sim/scenario/waas-hidden.test.ts`). The debrief shows the outcome. M1 described the leak found by the review |
| 17. Score the RNAV procedure | Partly met | `gps-approach-active`, `gps-approach-mode`, the RNAV `final-course`, `glidepath`, `missed-sequencing` (steam only), `missed-hold`, `taa-altitude` and `taa-reversal` exist. GPS holds skip `hold-entry` and `hold-timing`. `gps-approach-active` is judged at the IAF (M4, fixed). `missed-sequencing` has no "before the first turn" limit (L1). `glidepath` uses the ILS 0.7° full scale, not 0.25 × GPA (L3). The KOGA skipped hold fails both `fix-order` and `taa-reversal` (L2). |
| 18. Brief the RNAV notes | Met | Equipment line (e.g. "RNP APCH - GPS. WAAS channel 73005, W12A. Minimums lines: …"; KCOS shows its plate's "DME/DME RNP-0.3 NA."). The notes have the temperature limits with the WAAS explanation, the remote altimeter and "Procedure NA". The TAA areas were taken out of the briefing (decision 12), but the KOGA note still says "see the briefing" (L6). Clearances name the fix |
| 19. Arrive through a TAA (KOGA) | Met | Starts from the northwest (straight-in area) and the southeast (course-reversal area, parallel entry, `koga-rnav8.test.ts`). The clearance gives only the altitude. "Hold at AHUFU" is offered on load, as a checkbox that defaults to Yes |

## Added during V3 (user requests)

SPEC decisions 5–14 (2026-11-16):

- **GPS unit in the radio stack** (5): beside NAV1/NAV2, with PROC, D→ and FPL popovers and ACT,
  SUSP (and CDI on steam) on the face.
- **GA sequences the GPS on glass** (6); steam keeps a manual SUSP, and `missed-sequencing` is
  scored only there.
- **`missed-hold`** (7): enter and get established in the missed hold, staying within leg + 3 NM.
- **Flight-screen tweaks** (8): LOAD and LOAD + ACTIVATE; the in-flight card leaves out the RNAV
  equipment line.
- **Offset starts** (9): `offset` (bearing, distance) with the start's own heading.
- **Straight-in arrivals at a reversal fix** (10): judged by what follows (turn outbound, or 2 NM
  on past the fix).
- **Steam timer** (11) layout.
- **Round 4 tweaks** (12): a VLOC/GPS switch at the steam HSI's upper left, with the CRS in green or
  magenta; MAP/PLATE moved onto the view; TAA areas out of the briefing; starts above the assigned
  altitude, "Descend and maintain N"; `hold-max-altitude` judged from the fix.
- **Scoring round** (13): "Hold at <fix>?" on every hold-in-lieu transition; skipped
  holds-in-lieu judged as soon as the aircraft heads inbound beyond the fix; a reversal counts
  only after 1 NM outbound; new rule `assigned-altitude`.
- **More plates and circling** (14): KCEZ VOR 21, KCYS ILS or LOC 27, KSKX VOR/DME-B (circling
  only), KALS RNAV 2 and KCNY RNAV 3 (offset final, LP/LNAV): 9 radio and 9 RNAV approaches.

## Known limitations and out of scope

As SPEC "V3 out of scope": no RF legs or RNP AR, no LP+V or LNAV+V coupling, no NDB, no enroute
planning or airways, no VNAV descent planning, no OBS mode, no baro-VNAV equipment option, no
temperature model, no wind, no GPS position error, no loss of integrity (deferred). Circling is a
decision only (the sim does not fly the circle). The notes listed in "What is hard on these
plates" item 7 are shown but not modelled.

## Review findings

All findings are **open** (not fixed in this review).

| # | Finding | Severity | Status |
|---|---|---|---|
| M1 | **The WAAS outcome shows before the annunciation** (story 16). `src/ui/screens/Flight.tsx:88-97` computes the minimums from `waasOf(options)` at the start of the flight, and `pfd-data.ts:80` shows them. On KLAA `direct-weyyi` at tick 0 the glass box shows "DA 3,945" with WAAS and "MDA 4,260" without. Also, `receiver.ts:642-651` makes `vnavAvailable` (so the GP pointer and `hasGs`, `autopilot.ts:51`) depend on WAAS from activation. On KLAA VTF 8.4 NM before the FAF, the HSI shows a flagged GP pointer with WAAS and none without, and APR arms GP only with WAAS. The README also says WAAS is hidden until the debrief. Confirmed with a script | **Fixed:** the briefing minimums (`plannedMinimums`) and the reported weather (layers that clear both the WAAS and no-WAAS minimums) no longer depend on WAAS; until the annunciation the GPS treats the best published line as expected (`vnavAvailable`, so the GP shows and APR arms it either way), and the annunciation "LNAV" drops the GP arm; the glass minimums box shows the planned minimums until the annunciation (`shownMinimums`). Tests: `tests/sim/scenario/waas-hidden.test.ts`, and the no-WAAS runs in KLAA, KPUB, KBFF, KCPR and KAPA now check APR arms the GP and the annunciation drops it | Medium | **Fixed** |
| M2 | **LNAV-only step-downs are judged on LPV and LNAV/VNAV.** `src/sim/scoring/rules/altitude.ts:37-42` treats a final as precision only if it has a `glideslope`; RNAV finals have `gp`, and `lnavOnly` is never read in scoring. On LPV, `segmentMinimum` returns 6240 at KCPR NOPTE and 6940 at KAPA FEGIB just inside the FAF. The GP is only 3 ft above NOPTE (21 ft above FEGIB), and a half-scale-low GP (0.35°, which passes `glidepath`) is 106 ft (KCPR) or 135 ft (KAPA) below the path there. So an LPV run that passes `glidepath` fails `segment-minimums` on a step-down that does not apply to LPV. Confirmed by a script and calculation | **Fixed:** `segmentMinimum` skips `lnavOnly` step-downs when the active RNAV line has a DA (LPV, LNAV/VNAV). Test: `tests/sim/scoring/lnav-only-stepdowns.test.ts` (KCPR NOPTE and KAPA FEGIB judged on LNAV only; KCNY's LP still judges FELTA) | Medium | **Fixed** |
| M3 | **The fly-by state never clears if the aircraft does not turn.** `src/sim/gps/receiver.ts:486-491` ends the fly-by only when the track is within 2° of the new leg; until then `guidance` (`:329-334`) gives arc-relative DTK and cross-track. KLAA, WEYYI → OBOZU flown on HDG: after sequencing the GPS showed DTK 034–057° instead of 092°, and twice the true cross-track, for as long as the aircraft held heading (10 min tested, and NAV could not capture). A learner on HDG or hand-flying the GPS sees a wrong course on the CDI (the CRS auto-slews to it) until Direct-To. Confirmed with a script | **Fixed:** the fly-by turn also ends once the aircraft is past the arc's exit along the new leg or more than 0.5 NM off the arc; the GPS then guides on the new leg. Test: `tests/sim/gps/flyby-no-turn.test.ts` (KLAA on HDG past WEYYI: DTK 092°, and NAV captures the leg) | Medium | **Fixed** |
| M4 | **`gps-approach-active` is judged at the FAF, not the IAF.** SPEC 17 says "activated before the IAF (or before intercepting final when vectored)". `src/sim/scoring/rules/gps.ts:57-80,100` records `loaded`/`active` only when the FAF is crossed. A KLAA `direct-weyyi` run flown on heading past WEYYI and OBOZU, then activated with Direct-To LOLME, passed ("Loaded and active at the FAF"). Confirmed with a throwaway test | **Fixed:** `gps-approach-active` is judged at the cleared transition's IAF (its first passage), on vectors when established on the final course, with the FAF as the last point. Test: `tests/sim/scoring/gps-active-timing.test.ts` (pass at WEYYI; fail when activated after WEYYI; fail when activated after intercepting the final) | Medium | **Fixed** |
| L1 | `missed-sequencing` (`rules/gps.ts:190-220`) has only the 30 s limit; SPEC 17's "or before the first turn, if earlier" is not implemented (KAPA, KCOS and KCNY turn after the CA leg). Confirmed by reading the code | Low | Open |
| L2 | A KOGA arrival from the course-reversal area without the hold fails both `fix-order` and `taa-reversal` (`rules/taa.ts:79-88`; `koga-rnav8.test.ts` expects both). That is one error with two penalties, against SC3 "fails exactly the expected rule". Also, `taa-reversal` passes as soon as the GPS *enters* its hold state at AHUFU, whatever the aircraft then does (suspected; not exercised) | Low | Open |
| L3 | The GP full scale is the ILS 0.7° (`gpsGlidepath` in `src/ui/instruments/geometry.ts`, `glidepath` half scale in `rules/gps.ts:173`), not "±0.25 × GPA" (SPEC design notes): 0.76° on KLAA (3.05°) and 0.875° on KCNY (3.5°, advisory only). The pointer and the rule are a little stricter than specified. Confirmed by reading the code | Low | Open |
| L4 | The FPL popover (`src/ui/panel/GpsPanel.tsx:296-321`) lists waypoints and the active leg only. SPEC 14 also asks for course, distance and altitude constraints, and the design note asks for a `<table>`. "Hold at <fix>" is a checkbox that defaults to Yes rather than a Yes/No question | Low | Open |
| L5 | The teardrop entry (`receiver.ts:297`) flies 30° off the outbound course for the whole leg length, so on 6–7 NM RNAV legs it ends `legNm·sin 30°` = 3–3.5 NM off the inbound course, about three times the racetrack width (2r ≈ 1.1 NM at 100 kt). A real GPS ends the teardrop on the inbound course. Within the `missed-hold` area; realism only. Confirmed by calculation | Low | Open |
| L6 | `src/procedures/koga-rnav8.json:285`: "Terminal arrival area (TAA) instead of an MSA: see the briefing", but decision 12 took the TAA areas out of the briefing | Low | Open |
| L7 | `src/procedures/kcny-rnav3.json:198,203` mark FELTA and FATPU `lnavOnly`, because `cifp-check.ts:138` maps the ARINC "V" altitude description to LNAV-only. The KCNY plate shows them without the "LNAV only" asterisk: they apply to the LP line too. No effect: with M2 fixed, `lnavOnly` step-downs are skipped only on a DA line, and KCNY has only LP and LNAV lines (`lnav-only-stepdowns.test.ts` checks FELTA is still judged on LP) | Low | Open |
| L8 | ACT while an approach is active (`receiver.ts:154-163`) restarts the plan at leg 0 (direct to the IAF) without asking. One stray click on final turns the aircraft back toward the IAF. Confirmed by reading the code; the impact is suspected | Low | Open |
| L9 | Accessibility: the GPS tag by the glass HSI (annunciation, SUSP) is inside the PFD's `role="img"` SVG and is not in `hsiSummary` (`GlassHsi.tsx:86-110`) or the live status line. The GPS unit's annunciation is plain text with no live region. The active FPL chip is white on `#d651e6` (`app.css:784-787`), about 4.1:1 at 12 px, below WCAG AA 4.5:1 | Low | Open |
| L10 | Test gaps against "V3 testing": no committed replay test with GPS commands; the 60 fps test does not run with the GPS panel; no e2e for GA + unsuspend; no RNAV `final-course` or TERM-at-FAF bad run; `glass-all-starts` leaves out RNAV starts; KPUB `direct-bonuh` is not flown; the golden tolerances are looser than SC2. The reviewer checked replay, fps and `direct-bonuh` by hand (all fine) | Low | Open |

The CIFP CA-leg courses agree with the GPS's (final course) on all nine plates, within 0.1°.
The hold entry sectors (direct −70°…+110°, teardrop, parallel) are correct.

## Not checked

- Three RNAV plates (KBFF, KCPR, KALS) and the three V3 radio plates (KCEZ, KCYS, KSKX) were not
  compared with their images by the reviewer. For the RNAV plates, `tests/procedures/cifp-check.test.ts`
  cross-checks legs, altitudes, holds, the GP and the minimums lines against the FAA CIFP, but not
  the minimums values, notes or WAAS channel.
- The plate-overlay calibrations of the new plates (only that they pass `tests/ui/plate-overlay.test.ts`).
- The minimums chime and screen-reader output (headless only); a full flight of each approach by a
  person on both panels.
- The exact LPV/LP angular limits against the AIM and RTCA (SPEC design note, R2).
