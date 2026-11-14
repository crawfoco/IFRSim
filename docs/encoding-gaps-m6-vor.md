# Encoding gaps: M6 VOR procedures (KAKO, KLAR, KSNY)

Places where `src/procedures/schema.ts` cannot say exactly what the chart says, and the
approximation used in `kako-vor29.json`, `klar-vor30.json` and `ksny-vor13.json`.

## 1. Missed-approach turn direction and climb on a `direct` leg

All three missed approaches turn to a station: "climbing right turn to 6100 direct AKO"
(KAKO), "climb to 6200 then right turn direct SNY" (KSNY), "climb to 9600 direct LAR"
(KLAR). The `direct` leg has no `turn` and no `climbToFt`.

- Encoded as `{ "type": "direct", "to": <VOR> }` followed by the hold, which carries the
  altitude as `minAltFt`. KSNY puts `{ "type": "climb", "toAltFt": 6200 }` first because
  the chart says to climb before turning.
- Lost: the right-turn requirement on KAKO and KSNY (a left turn back to the station
  would not be flagged), and the "climbing" altitude target on the direct leg. The
  printed wording is kept in `missedText`.
- Suggested fix: optional `turn` and `climbToFt` on `DirectLeg`, matching `HeadingLeg`.

## 2. Charted radial differs from the NASR fix radial (KLAR R-112)

The KLAR final course is charted 292° (R-112), but the NASR positions of ECECU, DMYIH,
DUCBE, HEMBI and GARBE all lie on R-111.6 with LAR's 1965 declination (14° E). On R-112,
ECECU resolves 0.12 NM and DMYIH 0.17 NM from the FAA coordinate, over the 0.1 NM limit.

- Encoded the fix definitions on `radialMag: 111.6` (noted "charted R-112" in each fix's
  `note`); the legs keep the charted courses 112°/292°, which is what the learner sets on
  the OBS. The unnamed VDP (LAR 4) and MAP (LAR 3.1) use 111.6 too, so every final-course
  fix is on one line.
- The golden tests allow 0.5° of needle at these fixes with OBS 292 (the NASR fixes are
  0.4° off the charted radial).
- Smaller cases within tolerance, encoded with the charted whole-degree radial: GERON
  (NASR R-110.3), JESAR (R-085.75), RIYOP (R-077.9), OGJUN (R-201.8).

## 3. FLEMS has no charted radial

The chart gives FLEMS only as "LAR 28.8" (an IAF with a not-to-scale feeder symbol). The
schema's `radialDme` needs a radial, so FLEMS uses R-118.9 from NASR. The heading leg
from FLEMS (337° for 5.1 NM to DMYIH) is a `heading` leg intercepting LAR 292 TO; the
schema has no distance for a heading leg, so "(5.1)" is only in the notes (the FLEMS–
DMYIH NASR distance is 5.15 NM, checked in the test).

## 4. KAKO procedure turn is from AKO, not GERON

SPEC.md calls it the "GERON PT". On the plate the PT barb (065°/245°) is drawn between
AKO and GERON and the profile starts it at AKO VOR/DME: outbound on R-110, remain within
10 NM (of AKO), 6000, inbound 290° to the FAF (AKO) at 5300. Arrivals at GERON via the
arcs are NoPT. Encoded as `procedureTurn` with `fix: "AKO"`, then a `track` back to AKO.
The KAKO missed-approach hold is also at AKO (inbound 290°, right turns).

## 5. Descent angles

Each plate prints a descent angle and TCH for the non-precision final (KAKO 3.22°/TCH 50,
KLAR 3.00°/TCH 41, KSNY 3.25°/TCH 44). `final.glideslope` means a precision glide path,
so these go in `notes` only.

## 6. Unnamed arc IAFs (KAKO)

The two KAKO arc IAFs (AKO R-050 and R-170 at 10 DME) are unnamed on the chart and not
NASR fixes, so they are keyed `AKO R-050/10` and `AKO R-170/10` with no `faaId`.

## 7. Altitude on the PT inbound

The schema's `procedureTurn` has a single `minAltFt` (the PT altitude). Where the chart
gives a lower altitude inbound to the FAF (KAKO 5300 to AKO), that is a following
`track` leg; at KLAR and KSNY the following approach legs carry it.
