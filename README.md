# VanJS Development Skill

**Practical VanJS, VanX, and Mini-Van guidance for coding agents.**

Build reactive interfaces, repair subtle state bugs, and make server-rendered markup work with client interaction. This skill gives your agent a concise workflow, focused references, and executable evidence for the behaviors that are easy to get wrong.

It starts with your project's installed packages and conventions, then guides the smallest responsible change. Reviews stay reviews; implementations preserve the state and DOM identity the feature needs.

[Read the skill](SKILL.md) · [Explore the references](#coverage) · [See the verification](#verification) · [MIT License](LICENSE)

## Install

Run from your project directory with Node.js, npm, and Git available. The tested installer, `skills` 1.7.0, requires Node.js 22.20.0 or later.

```sh
npx skills add kensho42/vanjs-skill
```

The installer discovers the single skill, **`vanjs-development`**, from the root `SKILL.md` and lets you choose your coding agent.

### Codex

Install for the current project:

```sh
npx skills add kensho42/vanjs-skill --skill vanjs-development --agent codex
```

Or make it available across your projects:

```sh
npx skills add kensho42/vanjs-skill --skill vanjs-development --agent codex --global
```

For another supported agent, replace `codex` with its identifier, such as `claude-code`, `cursor`, or `opencode`. See the [official installer documentation](https://github.com/vercel-labs/skills) for supported agents and options.

### Inspect and manage

```sh
# Preview the repository's skill without installing
npx skills add kensho42/vanjs-skill --list

# List installed skills
npx skills list

# Update this skill
npx skills update vanjs-development

# Remove this skill from the project
npx skills remove vanjs-development
```

Use `--global` when removing a global installation. Installation adds the agent instructions and supporting files; your application keeps its own VanJS dependencies.

## Use it

Ask your agent to use **`vanjs-development`** with a concrete task. In Codex, you can invoke it by name:

```text
Use $vanjs-development to review this component's conditional rendering.
The editor must retain its input elements and unsaved draft when hidden.
Report findings and minimal corrections without editing files.
```

```text
Use $vanjs-development to repair this VanX list's snapshot refresh.
Preserve the collection and retained row identities, apply the server's
order, and verify delete, clear, and repopulate behavior.
```

```text
Use $vanjs-development to build a shared Mini-Van form for SSR and the
browser. Preserve live form values during hydration and verify parsed
HTML, state transport, and client-side submission.
```

The skill directs the agent to identify the renderer, inspect installed versions, decide which nodes and values must survive, and check the transitions affected by the change. It also covers ordinary component implementation, asynchronous work, and focused refactoring.

## Coverage

| Area | What the agent gets | Reference |
|---|---|---|
| **VanJS core** | State and dependency tracking, scheduled updates, synchronous bindings, async work, DOM properties, events, and resource ownership | [Core guide](references/vanjs-core.md) |
| **Conditional rendering** | Persistent hiding, remounting, terminal removal, placeholders, and retained input identity | [Conditional rendering](references/conditional-rendering.md) |
| **VanX** | Optional fields, structural tracking, keyed and positional lists, compatible snapshots, calculations, and replacement aliasing | [VanX guide](references/vanx.md) |
| **Mini-Van and SSR** | Text and DOM modes, shared components, property serialization, lossless state transport, and hydration handoff | [Mini-Van and SSR](references/minivan-ssr.md) |
| **Design choices** | Choose the renderer, state model, collection identity, and subtree lifetime for the actual requirement | [Decision guide](references/decision-guide.md) |
| **Reviews** | Task-specific checks for correctness, patch scope, live DOM behavior, and evidence | [Review checklist](references/review-checklist.md) |
| **Research and maintenance** | Versioned upstream sources, documented limits, and reproducible maintenance procedures | [Sources and maintenance](references/sources.md) |

The references address concrete failure modes: bindings that disappear after a nullish result, detached reactive subtrees that stop updating, lists left attached to an old collection, absent fields that never become dependencies, and SSR values that change when HTML is parsed.

## Verification

Skill revision **2.0.0** was reviewed on **2026-10-04** against these published packages:

| Package | Verified version |
|---|---|
| `vanjs-core` | `1.6.1` |
| `vanjs-ext` | `0.6.3` |
| `mini-van-plate` | `0.6.3` |

**These versions define the evidence baseline.** The skill preserves an application's installed versions and asks the agent to investigate differences when necessary.

The bundled records document:

- **32 passing checks against actual installed packages**, covering supported behavior, working recipes, and reproduced limitations. A passing limitation check confirms the limitation exists. See [contract results](validation/contracts.json).
- **3 passing tasks performed by agents with fresh contexts**: a conditional-panel review, a VanX records repair, and a shared SSR form with client handoff. See [evaluation results](validation/agent-checks.json) and [task definitions](evals/cases.json).
- **33 JavaScript examples parsed** and **70 local links checked** in the reviewed skill documents, alongside fixture syntax and JSON/YAML checks. These historical counts precede this repository README.

The runtime evidence uses **Node 24.19.0 and jsdom 26.1.0**. Browser layout, focus, autofill, and other browser-specific behavior need appropriate browser checks. The evaluations establish results on those tasks; no comparison experiment measured improvement over an earlier skill. The additional older-version timing task remains unrun because it requires a supplied project pinned to an older version.

## Repository contents

| Path | Purpose |
|---|---|
| [`SKILL.md`](SKILL.md) | Agent entry point and working rules |
| [`references/`](references/) | Seven focused guides, including upstream evidence |
| [`scripts/check-contracts.mjs`](scripts/check-contracts.mjs) | Package-version checks and executable runtime regressions |
| [`evals/`](evals/) | Evaluation prompts, grader expectations, and raw faulty fixtures |
| [`validation/`](validation/) | Recorded results, scope, and reviewed-file checksums |
| [`agents/openai.yaml`](agents/openai.yaml), [`assets/icon.svg`](assets/icon.svg) | Agent display metadata and icon |
| [`LICENSE`](LICENSE) | MIT license and original copyright notice |

## Maintain the skill

Keep the main skill short and put detailed reasoning or recipes in the relevant reference. Review installed source when behavior changes, update the affected guidance, and rerun the checks that cover the change. The [maintenance guide](references/sources.md) explains the source baseline and evaluation process.

To reproduce the contract checks, run from this repository in a POSIX shell with a suitable Node.js runtime. This creates an isolated dependency directory:

```sh
vanjs_checks_dir="$(mktemp -d)"
npm install --prefix "$vanjs_checks_dir" --ignore-scripts --no-audit --no-fund --save-exact \
  vanjs-core@1.6.1 vanjs-ext@0.6.3 mini-van-plate@0.6.3 jsdom@26.1.0
node scripts/check-contracts.mjs --project "$vanjs_checks_dir"
```

The runner checks exact package versions and shared core resolution before executing the suite. It imports those packages, emits JSON results, and exits unsuccessfully on setup or assertion failures. The recorded Node patch version identifies the observed environment; the package versions define the enforced baseline.

These are skill-maintenance checks. Application changes should use the project's relevant tests and the smallest verification that settles the affected behavior.

## Upstream resources

- [VanJS tutorial and API](https://vanjs.org/tutorial)
- [VanX](https://vanjs.org/x)
- [Mini-Van](https://vanjs.org/minivan) and [SSR / hydration](https://vanjs.org/ssr)
- [Agent Skills specification](https://agentskills.io/specification)
- [`skills` installer](https://github.com/vercel-labs/skills)

## License

Released under the [MIT License](LICENSE). The original copyright notice is preserved in the license file.
