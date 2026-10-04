---
name: vanjs-development
description: Use when building, reviewing, debugging, or refactoring VanJS, VanX/vanjs-ext, or Mini-Van/mini-van-plate code, including reactive DOM, structured state, lists, conditional lifetimes, asynchronous work, SSR, shared components, and hydration. Apply to Van-family projects and integration boundaries, not unrelated frontend frameworks.
---

# VanJS Development

Make the requested interface work through the smallest responsible state, binding, and DOM change. Preserve the project's installed versions, architecture, module style, and JavaScript or TypeScript conventions.

## Establish the task

1. Read project instructions, manifests, lockfiles, imports, and the affected code. Resolve actual packages or local/CDN builds; repository `main` may differ from published packages.
2. Identify the renderer and execution environment: reactive browser DOM, static browser DOM, string SSR, server DOM, or an SSR/client handoff.
3. Identify the required lifetime and identity: which values must update, which nodes must survive, and which subtree may be recreated.
4. Follow the user's requested scope. For a review, report findings and minimal corrections. For an implementation, edit the responsible path and verify its behavior.

The verified baseline is core **1.6.1**, VanX **0.6.3**, and Mini-Van **0.6.3**. Consult [sources and maintenance checks](references/sources.md) when behavior or versions differ. Do not upgrade an application to match this baseline.

## Select the library and reference

| Task | Starting point |
|---|---|
| Reactive browser components, scalar state, DOM bindings | [VanJS core](references/vanjs-core.md) |
| Hide/show, conditional children, remounting, node preservation | [Conditional rendering](references/conditional-rendering.md) |
| Structured reactive fields, dynamic lists, server snapshots | [VanX](references/vanx.md) |
| Static HTML, server DOM, shared markup, hydration | [Mini-Van and SSR](references/minivan-ssr.md) |
| Choose a layer, collection model, or integration approach | [Decision guide](references/decision-guide.md) |

Start with core for reactive UI. Introduce VanX for a concrete structured-state or list need. Choose Mini-Van text mode for ordinary HTML generation and DOM mode when server-side DOM traversal or mutation is required. Mini-Van's static browser mode omits ordinary function event props; use native listeners deliberately or use core.

## Core rules that prevent common failures

- Tags construct real DOM nodes; components are ordinary functions. Use DOM-compatible properties, lowercase built-in event names, CSS strings, and native DOM APIs.
- Assign `state.val` to update core state. Mutating a plain object or array inside a core State does not notify its bindings; replace the value or choose granular state.
- Capture dependencies by reading inside the callback that needs them. `rawVal` is untracked. A state written during a callback is excluded from that run's dependencies, including a state also read in the callback.
- Keep reactive render and derivation callbacks synchronous. They do not await Promises, and tracking ends before work after `await`. Run asynchronous work separately, then update state; handle errors and stale results where relevant.
- Return a primitive or one persistent node from a reactive child. Static arrays compose children; reactive arrays and fragments are unsuitable binding results.
- A callback may return its current node. A different replacement node must be disconnected. Construct and attach reactive DOM synchronously; updates while a subtree is detached can retire its bindings.
- Initial derivation runs immediately. Later work is scheduled; core 1.6.x uses microtasks. One `await Promise.resolve()` covers a simple queued batch, not every reentrant or asynchronous chain. Reuse the project's appropriate update helper.
- Own external resources explicitly. A function returned from `van.derive` is not a cleanup callback, and binding garbage collection does not cancel timers, requests, listeners, or subscriptions.

## Choose a conditional lifetime

| Required behavior | Implementation |
|---|---|
| Preserve mounted inputs, local state, and nodes | Keep the subtree connected; bind `hidden`, a class, or style |
| Remove the subtree and construct it again later | Return a comment/text placeholder while absent; construct a fresh subtree when shown |
| Remove the binding permanently | Return `null` or `undefined` intentionally |

In the verified baseline, nullish output is terminal even when the binding starts absent, and the same rule applies to a State used directly as a child. Static nullish children are simply omitted. Avoid `condition && Component()` for reactive children because `false` can become visible text. A reusable disconnected placeholder can be safe; a cached detached reactive subtree can lose its bindings. Use the conditional reference's complete recipes.

## VanX rules

- Use the proxy returned by `reactive`. Initialize optional UI fields before binding them, and clear fixed fields by assignment. For dynamic keys, read structure inside the binding that must notice additions and deletions.
- Put reactive reads in their consuming binding. Captured primitives are snapshots; captured nested proxies can outlive replacement of their parent field. Destructuring inside VanX's tracked list callback is supported.
- Preserve the collection passed to `vanX.list`. Apply a compatible full snapshot with `vanX.replace(existingCollection, snapshot)`; assigning a new parent collection does not retarget the mounted list.
- Use keyed ordinary objects for entity identity and arrays for positional identity. Prefix numeric-looking entity keys when supplied display order matters. Return one persistent DOM node per item and preserve retained nodes on snapshot updates.
- Array deletion leaves holes. Count entries with `Object.keys(items).length`; clear a bound array with `vanX.replace(items, [])`. Do not truncate its `length` in 0.6.3.
- Replace whole records through the collection proxy, not an exposed core State. Keep array/record shapes compatible and calculated fields outside replaceable snapshots. For positional transforms of object-valued arrays, normalize independent snapshot data; reused proxies can alias replacement inputs, including nested fields.
- Use `raw` and `stateFields` for deliberate dependency or API needs. Use `noreactive` for proxy-hostile values. `compact` removes holes but is not a universal clone or serializer; its exact array, prototype, and opaque-object behavior is version-specific.

Read the VanX reference before changing list identity, optional fields, snapshots, calculations, or serialization.

## Mini-Van and shared-rendering rules

- Treat Mini-Van as a snapshot renderer. Text-mode props resolve during construction; State/function children resolve during rendering. DOM mode resolves its inputs when nodes are constructed.
- Register a stable renderer at each server/client entry point and read `env.van` when the component is invoked. Keep request data local. Prepare server data before using `dummyVanX`; its mutation helpers do not provide client reactivity.
- Use ordinary wrappers around async shared event work, or omit server event props. Mini-Van 0.6.3 may serialize async/generator handler source.
- Distinguish live DOM properties from serialized attributes. Stringify ARIA/data booleans; omit false HTML boolean attributes where required. Nullish values do not have one portable attribute-removal meaning. Round-trip text-mode string attributes, including input values, when exact content matters.
- Use `""` for portable empty State/function children. Mini-Van text mode can throw for nullish results even though it ignores direct nullish children.
- Use the SSR reference's encoded-attribute or escaped inert-JSON recipes for complex hydration state. Raw JSON in text-rendered attributes is not reliably lossless. Keep untrusted content out of raw script/style bodies.
- Extract transported state and any live form values before replacing the hydration root. Make preservation or replacement of existing DOM state an explicit choice.

## Verify and finish

Use the project's existing checks and relevant debug build. Verify the transitions affected by the change: repeated hide/show, list update/delete/reorder, optional-field cycles, or parsed SSR followed by client interaction. Inspect live DOM properties as well as markup, and fail on unexpected console errors; reactive callback errors can leave previous output visible.

Apply the relevant [review checklist](references/review-checklist.md). Stop when the affected behavior and required project checks are sufficiently verified. The bundled regression runner and evaluation fixtures are for skill maintenance or baseline investigation, not mandatory gates for every application edit.
