---
name: add-approach-plate
description: Add a new FAA approach plate to IFRSim end to end, or re-check an existing one - read the plate, extract navdata, encode the procedure JSON, verify it independently against the chart, add start conditions and tests, and calibrate the plate for the debrief's track overlay. Use when the user says "add a plate", "add an approach", "encode KXXX ...", "read this plate", "new chart", "calibrate the plate overlay", or hands over an approach chart image.
---

# Add an approach plate

A new plate touches four things: the chart image, `src/procedures/navdata.json`, a procedure
JSON, and the plate overlay calibration. The reference for every field is
`docs/procedure-encoding.md` (read it first, including **Plate overlay calibration**). SPEC.md
**Boundaries** apply: adding a procedure or a start condition, or changing the procedure
schema, needs the user's OK first.

## 0. Get the user's OK and the chart

- Confirm with the user which procedure (airport, name, amendment and cycle) and which start
  conditions they want. FAA charts are public domain; record the number, amendment and
  validity dates as printed.
- Put the plate image in `public/charts/<id>.png` at the same size as the others
  (715 × 1100 px, the full plate, north up as printed). The overlay scale and the chart viewer
  assume this size.

## 1. Read the plate (write down every value)

From the plan view, profile and notes: navaids (ident, type, frequency, channel), localizer
course, every fix and how the chart defines it (radial/DME, LOC DME, intersection), courses,
altitudes (at or above, at or below, mandatory), arcs, holds (inbound course, turn, leg time,
altitudes), procedure turns, the final (FAF, step-downs, VDP, MAP by DME or timing, glideslope
angle and TCH), minimums for categories A and B, the missed approach, MSA, and notes. Note what
is drawn **not to scale** (insets, legs beyond a zigzag break): it matters for steps 6 and 7.

## 2. Nav data

Make sure every navaid, fix, localizer, glideslope and runway end the plate uses is in
`src/procedures/navdata.json` (the FAA NASR extract: `npm run navdata:download`, then
`npm run navdata`; add the airport, runway ends, navaids, localizers and fixes to the
`WANTED` lists in `scripts/navdata/wanted.ts` first). `docs/navdata-review.md`
shows the expected detail. The navdata tests cross-check frequencies, courses, TDZE and TCH
against values typed from the plate.

## 3. Encode the procedure

Follow `docs/procedure-encoding.md`: copy an existing file, define every fix the way the chart
does, encode legs, minimums and start conditions (each with a clearance a controller would
give), and register it in `src/procedures/index.ts`. The zod schema reports every problem with
its path.

## 4. Verify against the chart independently

Use a subagent that gets **only the plate image and the encoding checklist** (not your JSON)
and returns its own reading of every value. Compare field by field and resolve every mismatch
against the plate. This catches transcription errors the schema can't.

## 5. Tests

- Golden receiver tests at every fix: `tests/procedures/<id>.test.ts` (radial/DME and LOC
  deviation where the chart puts each fix).
- Fly every start condition headlessly to DA/MDA or through the missed approach:
  `tests/integration/` (see the `starts-*.test.ts` files and `tests/sim/scripted.ts`). A perfect
  run scores 100%; add at least one bad run that fails exactly the expected rule.

## 6. Calibrate the plate overlay

So the debrief's Plate tab can draw the flown track on the plate (details in the guide):

1. `npm run plate -- candidates <id>`: the anchors you can use, with their positions.
2. Pick at least four crisp, spread-out anchors in the to-scale plan view (navaid symbol
   centres, fix ticks on the course, arc IAFs where the arc meets its radial, the runway ends
   and localizer antenna if the runway is drawn). Not the MSA circle, the airport sketch, the
   profile, or anything beyond a break.
3. Measure each to about a pixel with zoomed crops:
   `npm run plate -- crop <id> 6 name:x,y,w,h` (image pixel = crop origin + crop pixel ÷ 6).
4. Check with `npm run plate -- fit <id> anchors.json`: about 19.4 px/NM on 715-px plates,
   |rotation| < 1°, every residual < 5 px. A big "left out" value marks a bad measurement.
   Common slips: an arc's tangent point is not the fix (KLAR ECECU); an arrow-line end is not a
   fix tick (KSNY CHAKO).
5. Add the entry to `PLATE_CALIBRATION` in `src/ui/chart/overlay.ts` with `planArea` and the
   not-to-scale `insets` to mask (MSA circle, airport sketch, legs beyond a break).
6. `npm run plate -- preview <id>` writes `test-results/plates/<id>/preview.png`: every fix where
   the fit puts it (anchors magenta, the rest blue), the plan view box and the masks. Look at
   it: the blue fixes are an independent check.
7. `tests/ui/plate-overlay.test.ts` checks every calibration against the same limits.

## 7. Finish

`npx prettier --check .`, `npm run typecheck`, `npm run lint`, `npm test` and
`npm run test:e2e` all pass. Fly it once in the app on both panels (Steam and Glass) and open
the debrief's Plate tab. Update SPEC.md's content table and tell the user what was added and
what is not covered (for example RNAV-only transitions, which need GPS).
