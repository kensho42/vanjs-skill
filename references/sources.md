# Sources and Maintenance

Skill revision **2.0.0**. Evidence reviewed **2026-10-04**. These versions define the tested baseline; preserve an application's own installed versions and verify differences in its source or runtime.

## Published implementation baseline

| Package | Version | Immutable source |
|---|---|---|
| `vanjs-core` | 1.6.1 | [Revision 08f67468](https://github.com/vanjs-org/van/tree/08f67468ddcc67c08a59e2be433e556fc889aebf/src) |
| `vanjs-ext` | 0.6.3 | [Revision 5b40e4fc](https://github.com/vanjs-org/van/tree/5b40e4fc177054b11267326fb6d3d747dc6e9955/x/src) |
| `mini-van-plate` | 0.6.3 | [Release 0.6.3](https://github.com/vanjs-org/mini-van/tree/0.6.3/src) |

The examined published implementations match these retrieved sources. Published VanX 0.6.3 declares core `^1.5.5`; later repository metadata declares `^1.6.1`. A dependency range and repository `main` do not establish which core version an application actually runs.

### Source, types, and tests

- Core: [runtime](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js), [types](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.d.ts), [debug wrapper](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.debug.js), and [tests](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/test/van.test.ts).
- VanX: [runtime](https://github.com/vanjs-org/van/blob/5b40e4fc177054b11267326fb6d3d747dc6e9955/x/src/van-x.js) and [types](https://github.com/vanjs-org/van/blob/5b40e4fc177054b11267326fb6d3d747dc6e9955/x/src/van-x.d.ts).
- Mini-Van: [text renderer](https://github.com/vanjs-org/mini-van/blob/0.6.3/src/van-plate.js), [DOM renderer](https://github.com/vanjs-org/mini-van/blob/0.6.3/src/mini-van.js), [shared adapter](https://github.com/vanjs-org/mini-van/blob/0.6.3/src/shared.js), and [text tests](https://github.com/vanjs-org/mini-van/blob/0.6.3/test/deno/van-plate.test.ts).

### Official documentation and change context

- [VanJS tutorial/API](https://vanjs.org/tutorial), [advanced topics](https://vanjs.org/advanced), [VanX](https://vanjs.org/x), [Mini-Van](https://vanjs.org/minivan), and [SSR/hydration](https://vanjs.org/ssr).
- [Core 1.6.0 microtask scheduling](https://github.com/vanjs-org/van/discussions/466) and [1.6.1 release](https://github.com/vanjs-org/van/discussions/482).
- [VanX release discussion](https://github.com/vanjs-org/van/discussions/311), [missing-property tracking report](https://github.com/vanjs-org/van/issues/470), and [fragment list-row failure](https://github.com/vanjs-org/van/issues/431).
- [Mini-Van 0.6.3 release](https://github.com/vanjs-org/mini-van/releases/tag/0.6.3).
- [Agent Skills format](https://agentskills.io/specification) and [evaluation guidance](https://agentskills.io/skill-creation/evaluating-skills).

Use documentation to locate the intended interface, then resolve discrepancies with installed source and a focused reproduction. Older prose can describe synchronous derivation or timer scheduling; 1.6.1 schedules updates with microtasks. Types can admit values whose runtime behavior is unsuitable, including fragments, nullish outputs, and hydration return values.

## Contract runner

`scripts/check-contracts.mjs` imports the actual installed packages, verifies their exact versions and shared core resolution, and emits a JSON result. It does not install dependencies, use the network, mutate the supplied project, or reproduce library internals in a substitute implementation. Setup/version errors and assertion failures produce nonzero exit codes.

Run from the skill directory using a suitable existing runtime, or prepare an isolated one:

```sh
vanjs_checks_dir="$(mktemp -d)"
npm install --prefix "$vanjs_checks_dir" --ignore-scripts --no-audit --no-fund --save-exact \
  vanjs-core@1.6.1 vanjs-ext@0.6.3 mini-van-plate@0.6.3 jsdom@26.1.0
node scripts/check-contracts.mjs --project "$vanjs_checks_dir"
```

Keep this maintenance runtime outside the application. When investigating another version, update the relevant baseline deliberately after reviewing changed behavior; do not upgrade an application merely to make this runner accept it.

The runner labels checks as contracts, working recipes, or known limitations. A passing limitation check confirms that the limitation was reproduced. It does not endorse the failing application pattern.

`validation/contracts.json` records the actual run, runtime/package versions, and the runner's checksum. Historical results describe that exact run; a changed runner or package needs corresponding verification.

## Fresh-agent evaluation

`evals/cases.json` supplies maintenance tasks and grader expectations. The panel and records cases include deliberately faulty raw inputs in `evals/fixtures/`. The shared-form case starts in an empty ES-module workspace. Give the first three cases the baseline packages and jsdom 26.1.0. The older-version timing case requires a supplied project and retains that project's dependencies.

Give each fresh agent only its task prompt, raw inputs, runtime context, and the skill path. Keep expected outcomes, earlier solutions, and validation reports outside its context. Inspect actual patch scope and behavior. Do not grade success by whether the answer repeats the skill's terminology.

`validation/agent-checks.json` records completed cases and their limits. Passing these cases demonstrates performance on those tasks. Measuring improvement requires an appropriate comparison against the earlier skill or another baseline.

## Limits and maintenance decisions

The contract runtime uses Node **24.19.0** and jsdom **26.1.0**. This is not real-browser coverage. Use actual browsers for focus, layout, animation, browser-specific behavior, and final UI integration when relevant.

After changing guidance, check the affected examples, local links, and task cases. After changing a contract or package baseline, rerun the relevant runtime suite and update the evidence. Keep the main skill concise and task-oriented; place detail in the relevant reference. Application work does not inherit all of these skill-maintenance checks.
