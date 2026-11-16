# IFRSim

**Fly real instrument approach plates in your browser.**

▶ **Try it: https://crawfoco.github.io/IFRSim/**

IFRSim is a procedural IFR approach trainer. The aircraft flies itself through a
generic light-aircraft autopilot; your job is the part that matters on an
instrument approach: read the plate, tune and identify the navaids, set courses,
headings and altitudes, sequence the fixes, fly the holds, arcs and procedure
turns, and either land or fly the missed approach. You then get a debrief with
your track, altitude profile and a score.

> ⚠️ **Training use only. Not for real-world navigation.** Charts and nav data
> come from a single FAA cycle and are not kept current.

## Approaches

Eighteen approaches in Colorado, Wyoming, Nebraska, New Mexico and Utah. The
chart cycle is shown in the app.

| ILS · LOC · VOR | RNAV (GPS) |
|---|---|
| KAKO VOR RWY 29 | KALS RNAV (GPS) RWY 2 |
| KCEZ VOR RWY 21 | KAPA RNAV (GPS) RWY 28 |
| KCFO ILS or LOC RWY 26 | KBFF RNAV (GPS) RWY 12 |
| KCYS ILS or LOC RWY 27 | KCNY RNAV (GPS) RWY 3 |
| KGXY ILS or LOC RWY 35 | KCOS RNAV (GPS) RWY 31 |
| KLAR VOR/DME RWY 30 | KCPR RNAV (GPS) RWY 3 |
| KMTJ ILS or LOC RWY 17 | KLAA RNAV (GPS) RWY 18 |
| KSKX VOR/DME-B (circling) | KOGA RNAV (GPS) RWY 8 (TAA) |
| KSNY VOR/DME RWY 13 | KPUB RNAV (GPS) RWY 26L |

Each has several start conditions (feeder routes, arcs, direct to an IAF off to
one side, vectors to final), and the weather at minimums, and on RNAV approaches
whether WAAS is available, is hidden until the debrief. The RNAV approaches are
flown with a generic WAAS GPS (LPV, LNAV/VNAV, LP and LNAV lines).

## How to fly

1. Pick an approach and start.
2. Read the briefing and the plate.
3. Tune and identify the navaids, or load the approach in the GPS, then fly with
   the autopilot.
4. At DA/MDA, if the runway is in sight, continue and the sim lands
   automatically; if not, press GA and fly the missed approach.
5. Review the debrief.

RNAV (GPS): PROC, pick the transition (and whether to hold at the IAF),
LOAD + ACTIVATE; CDI on GPS, then NAV and APR. SUSP (steam) or GA (glass) starts
the missed approach.

On the briefing, choose the Steam gauges or the Glass PFD.

Knobs turn by dragging, scrolling or with the keyboard. Runs on a desktop
browser or a tablet in landscape. No install, no account, and no network
needed once the page has loaded.

## Feedback

Feedback from instrument students, pilots and CFIIs is very welcome.
[Open an issue](https://github.com/crawfoco/IFRSim/issues/new/choose) and pick
**Flying feedback**, **Bug report** or **Approach data error**.

## Development

Requires Node 22.12+.

```sh
npm ci
npm run dev          # http://localhost:5173
npm test             # unit tests
npm run test:e2e     # browser tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute,
[SPEC.md](SPEC.md) for the product spec and
[docs/procedure-encoding.md](docs/procedure-encoding.md) for how approaches are
encoded.

## License

[MIT](LICENSE). FAA charts and nav data are public domain.
