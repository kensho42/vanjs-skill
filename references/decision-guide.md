# Choose the Layer, State Model, and DOM Lifetime

Use these decisions when a task changes architecture or data representation. Routine component edits usually need only the relevant API reference.

## Start with the environment

| Need | Suitable starting point | Consequence |
|---|---|---|
| Interactive browser UI | `vanjs-core` | Reactive bindings update actual DOM nodes |
| Nested fields or incremental list updates | Core plus `vanjs-ext` | Proxy fields and collection mutations provide granular updates |
| HTML strings for static pages or SSR | `mini-van-plate/van-plate` | Build complete input before constructing the server tree |
| Server DOM traversal, selectors, or mutation | `mini-van-plate` with `vanWithDoc(document)` | Supply a suitable document implementation |
| Static browser DOM construction | Mini-Van browser mode | Snapshot behavior; attach ordinary native listeners explicitly |
| Markup shared between server and browser | `mini-van-plate/shared` | Stable renderer registration at each entry point and a deliberate state handoff |

Preserve a working project choice. A small form does not need structured proxies merely because VanX exists, and an existing VanX list should not be replaced with whole-container rebuilding without a concrete reason. Shared rendering is useful when both environments need the same markup; it does not automatically provide transparent hydration.

See [core](vanjs-core.md), [VanX](vanx.md), or [Mini-Van](minivan-ssr.md) for the exact interfaces and compatibility limits. Official guides: [VanJS](https://vanjs.org/tutorial), [VanX](https://vanjs.org/x), [Mini-Van](https://vanjs.org/minivan), and [SSR](https://vanjs.org/ssr).

## Decide what owns identity

| State or collection | Use when | Update strategy |
|---|---|---|
| Individual core States | A few independent values drive the UI | Assign each `.val` |
| Core State holding a snapshot | Replacing the whole value is intentional | Assign a new object/array; keep the binding scope small |
| VanX fixed-shape record | Fields update independently | Initialize optional fields and assign through the proxy |
| VanX dynamic record | Keys are added and removed | Track structure where needed; use keyed list identity |
| VanX array | Index/position is the intended identity | Use supported collection mutations and compatible replacement |
| Keyed ordinary object | Records have stable entity IDs and DOM must follow them | Prefix keys when needed for order; replace the existing keyed proxy |

An array of records with an `id` field still has positional identity in `vanX.list`. For an editor that must retain the same input element as records reorder, normalize to a keyed record. A full server snapshot also removes omitted entries; a partial patch should assign only the changed fields instead of using full replacement.

Do not switch between arrays and records inside one `replace` operation. Decide the representation at the ownership boundary and keep it compatible for the lifetime of the mounted list.

When a positional array transform filters or reorders object-valued entries, build independent normalized replacement data. A shallow array of existing proxies is not a detached snapshot, and a shallow object spread still retains nested aliases. The VanX reference explains the verified replacement and calculated-array hazards and the supported alternatives.

## Decide what survives absence

Use a connected persistent root when temporary hiding must preserve inputs, local state, and DOM identity. Verify focus and selection in a browser when they are part of the feature's contract. Use a text/comment anchor when absence should remove the subtree and later create it again. Use terminal nullish output only when the binding should be deleted permanently.

State can survive outside a remounted subtree while the subtree's actual DOM is recreated. Ask which identity the feature needs. The [conditional-rendering reference](conditional-rendering.md) gives separate recipes for those lifetimes.

## Decide where asynchronous work belongs

Keep reactive callbacks synchronous. Event handlers, explicit request functions, or application lifecycle code can launch asynchronous work and write the result to state. Where multiple requests can overlap, choose whether completion order or the newest request should win, and implement cancellation or a stale-result guard accordingly.

Put external resource ownership where setup and teardown are both reachable. Ordinary component invocation creates no automatic disposal scope. Add an abstraction only when the project has repeated ownership needs; a one-off request does not require a new lifecycle framework.

## Decide the verification scope

Match checks to the affected failure mode:

- Conditional changes: initially hidden, repeated hide/show, and retained state or node identity as required.
- Structured state: missing field, update, clear, and re-add where supported.
- Lists: edits, deletion, additions, reordering, empty state, and retained nodes.
- SSR: parse the generated HTML, inspect live properties, round-trip transported data, then exercise hydration and an event.
- Scheduling: inspect the installed runtime and use the existing test helper. Avoid arbitrary sleeps or assuming one flush covers every callback chain.

The skill's baseline runner is useful for maintaining these contracts. Application changes should use the smallest checks that settle the actual risk.
