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

## Approaches in V1

All in Colorado, Wyoming and Nebraska. The chart cycle is shown in the app.

| Airport | Procedure |
|---|---|
| KCFO Colorado Air and Space Port | ILS or LOC RWY 26 |
| KGXY Greeley-Weld County | ILS or LOC RWY 35 |
| KMTJ Montrose Regional | ILS or LOC RWY 17 |
| KAKO Colorado Plains Regional | VOR RWY 29 |
| KLAR Laramie Regional | VOR/DME RWY 30 |
| KSNY Sidney Municipal | VOR/DME RWY 13 |

Each has several start conditions (feeder routes, arcs, vectors to final), and
the weather at minimums is hidden until the debrief.

## How to fly

1. Pick an approach and start.
2. Read the briefing and the plate.
3. Tune and identify the navaids, then fly with the autopilot.
4. At DA/MDA, if the runway is in sight, continue and the sim lands
   automatically; if not, press GA and fly the missed approach.
5. Review the debrief.

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
