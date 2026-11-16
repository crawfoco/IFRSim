# Contributing to IFRSim

Thanks for helping. IFRSim is a browser-based IFR approach trainer. It is for
training only and must never be used for real-world navigation, but it still
has to be *right*: a wrong frequency or altitude teaches a wrong habit.

## Before you start

- **Small fixes** (typos, obvious bugs): open a pull request directly.
- **Anything bigger** (new feature, new approach, behaviour change): open an
  issue first so we can agree on the approach before you spend time on it.
- The product scope lives in [SPEC.md](SPEC.md), and planned work is tracked
  in [GitHub Issues](https://github.com/crawfoco/IFRSim/issues). Features
  outside the spec need discussion first.

## Setup

Requires Node 22.12 or newer.

```sh
npm ci
npm run dev        # http://localhost:5173
```

Before opening a pull request, all of these must pass:

```sh
npm test && npm run typecheck && npm run lint
npm run test:e2e   # if you touched the UI
```

CI runs the same checks on every pull request.

## How we work

- **Test first for sim code.** Anything under `src/sim/` (receivers, aircraft,
  autopilot, scoring) needs tests that pin the behaviour, ideally written
  before the code. Golden values should come from a chart or a known reference,
  not from the code under test.
- **Determinism.** The sim is a pure fixed-step function. Don't read clocks,
  random numbers or the DOM from `src/sim/`.
- **Keep pull requests focused.** One change per pull request; unrelated
  clean-ups go in their own.
- **Formatting.** Run `npm run format` before committing.

## Approach and nav data

Changes to `src/procedures/*.json` (procedures, `navdata.json`) get the
strictest review. In the pull request, please:

1. Name the chart (airport, procedure, amendment) and the FAA cycle you used.
2. Say which values changed and where each one comes from on the plate or in
   FAA NASR data.
3. Make sure the golden tests in `tests/procedures/` still pass, and add or
   update them for anything new.

Data must come from official FAA sources (d-TPP plates, NASR, CIFP). Please
don't copy from commercial chart providers.

## Reporting bugs and giving feedback

Use the issue templates: **Bug report**, **Flying feedback** or **Approach data
error**. Include the approach, the browser and what you expected versus what
happened. A screenshot helps a lot.

## Licence

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE) that covers the project.
