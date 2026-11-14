# Encoding gaps: KGXY ILS 35 and KMTJ ILS 17

> **Resolved after the merge (schema update):** items 1 (`procedureTurn.inboundMinAltFt`), 9 (leg `dme` + `expectedDmeSource()`) and 10 (`expandedServiceVolumeNm`, JNC 50 NM).

What the procedure schema (`src/procedures/schema.ts`) or the sim cannot express exactly
for `kgxy-ils35.json` (AL-325, Amdt 3A) and `kmtj-ils17.json` (AL-668, Amdt 3A), and how
each was approximated.

## Schema gaps

1. **KMTJ: procedure-turn altitude vs. the inbound altitude to BRUUK.** The profile shows
   12500 for the procedure turn (outbound 348°, barb 303°, remain within 10 NM) and 9400
   on the inbound leg to BRUUK. `procedureTurn` has a single `minAltFt`. It is encoded as
   12500. The inbound 9400 is not represented. Descent below 12500 on the inbound leg
   needs a segment altitude, e.g. an optional `inboundMinAltFt` on `procedureTurn`.
2. **KGXY: remote altimeter setting.** "VDP NA when using Northern Colorado Rgnl
   altimeter setting… increase DA to 4950 and all visibilities 1/4 SM; increase all MDAs
   100 feet…". Minimums have no altimeter-source variant. The note text is in `notes`, and
   the minimums are the local-altimeter values.
3. **KGXY: alternate missed approach fix (KROMM, CYS R-154 / 26.3 DME).** There is no
   alternate missed approach. KROMM is defined as a fix and named in `notes`. It is not
   used by any leg.
4. **Whole-degree radials far from the station.** The chart prints radials rounded to
   whole degrees. Far from the station that rounding exceeds the 0.1 NM navdata
   cross-check:
   - HAQHY is charted JNC R-098 / 36 DME. NASR puts it on R-098.3, so R-098 misses by
     0.21 NM.
   - KROMM is charted CYS R-154 / 26.3. NASR puts it on R-153.6, so R-154 misses by
     0.17 NM.

   Both fix definitions use the NASR radial (98.3, 153.6) so that the FAA cross-check
   holds. Each note gives the charted value. The courses flown (the HAQHY feeder's
   OBS 098) stay as charted. BRUUK is also "JNC 46" on the chart, which is 0.26 NM from
   JNC R-098 at 46 for the same reason. BRUUK is defined on the localizer, where it
   matches NASR exactly.
5. **Unlabelled hold leg lengths.** The CEDUK (KGXY) and PAGRE (KMTJ) missed-approach
   holds give no leg length. `legMinutes: 1` (the standard at or below 14,000 ft) is
   assumed. The WELDS hold-in-lieu is charted "One Minute Holding Pattern".
6. **Arc turn direction.** The guide does not define `turn` on an `arc` leg. Both arcs
   use `"R"` for clockwise around the station (radials increasing: GLL R-136 → R-177 and
   MTJ R-297 → R-349). With clockwise flight the station is on the pilot's right.
7. **Circling minimums and circling restrictions** are not in the schema (`kind` is
   ILS/LOC/VOR, straight-in only). They are kept as text in `notes`.
8. **"Procedure NA for arrivals…" and the RNAV feeders** (DIRDY, MYERS/MEYRS, GEJYU on
   KMTJ) are notes only. No transition or start uses them (SPEC.md V1 Content).
9. **DME source per segment.** KGXY uses GLL DME on the arc and in the missed approach,
   and I-DCI DME on the localizer. KMTJ uses MTJ DME everywhere. The fix definitions
   (`radialDme` on GLL or `locDme` with `dmeFrom`) imply the source, but no field says
   "set the DME source to NAV2". The scenario engine must infer it from `dmeFrom` and
   the arc navaid.

## Sim (receiver) gaps, not schema

10. **JNC service volume on the HAQHY feeder.** BRUUK is JNC 46 DME. `vorServiceRangeNm`
    gives an H VOR 40 NM below 14,500 ft AGL, so the JNC needle and DME flag for the last
    6 NM of the HAQHY → BRUUK feeder. The charted route implies usable signal (an
    expanded service volume). The localizer captures near BRUUK, so the approach is
    still flyable. A learner tracking JNC R-098 will see the flag about 6 NM before
    BRUUK. The golden test checks the feeder at JNC 39 DME.
11. **KMTJ vectors-to-final altitude.** The clearance uses "maintain 10000 until
    established". That keeps the glideslope intercept from below on a localizer that is
    only usable inside 18 NM. 10000 is below the 11600 MSA for that sector, which
    assumes a radar MVA we do not have. Raise it if the MVA chart says otherwise.
