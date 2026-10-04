# VanJS Core: State, Bindings, and DOM Ownership

Use this reference for `vanjs-core` implementation, review, and debugging. The verified runtime is **1.6.1**. Inspect the application's installed version and import/update conventions before applying version-sensitive guidance; this baseline is not a reason to upgrade the application. See [sources.md](sources.md) for versions and reproductions.

## Contents

- [Constructing DOM and setting props](#constructing-dom-and-setting-props)
- [State and dependency capture](#state-and-dependency-capture)
- [Choosing a binding and preserving its node](#choosing-a-binding-and-preserving-its-node)
- [Scheduling and asynchronous work](#scheduling-and-asynchronous-work)
- [Connectedness and resource ownership](#connectedness-and-resource-ownership)
- [Hydration](#hydration)
- [Focused verification](#focused-verification)

## Constructing DOM and setting props

Tags construct real DOM nodes immediately. A component is an ordinary function that returns DOM or a binding; invoking it does not establish a component lifecycle. `van.add(parent, ...children)` appends children to an existing element or fragment.

```js
import van from "vanjs-core"

const {input, label} = van.tags

export function SearchField({query}) {
  return label(
    "Search ",
    input({
      type: "search",
      value: query,
      class: () => query.val.length ? "has-query" : "",
      oninput: event => { query.val = event.currentTarget.value },
    }),
  )
}
```

The example receives a State, passes it through as a prop, and reads it inside a separate class binding. This keeps updates local to the input. Preserve the project's package, CDN, or local-file imports, and avoid accidentally introducing another core instance. Use `vanjs-core/debug` when compatible with the development setup; its validations help expose unsupported children, props, and node reuse. [Official tutorial](https://vanjs.org/tutorial), [1.6.1 debug source](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.debug.js).

### Props, events, and children

| Input | Interpretation and practical consequence |
|---|---|
| First plain object | Props; subsequent arguments are children. |
| Ordinary prop with a State | Bind the property's value to that State. |
| Ordinary prop with a synchronous function | Calculate a reactive value from synchronous State reads. |
| Lowercase event key, such as `onclick` | A plain function is the listener itself, including an async event handler. |
| `class` and `style` | Use class names and CSS strings; React-style style objects are unsupported. |
| Primitive child | Convert to text, including `false`, `true`, and `0`. |
| Static `null` or `undefined` child | Omit it. Reactive nullish output has a different lifetime; see below. |
| Nested child arrays | Flatten during composition. A reactive callback must return one result, not an array. |

For ordinary props, core uses a DOM property setter when available and otherwise calls `setAttribute`. Inspect live properties such as `input.value` and `checkbox.checked`, rather than inferring them from markup. A boolean property such as `disabled` handles `false` differently from an attribute-only path that writes `"false"`. `null` is not a general attribute-removal command: property setters coerce according to the DOM property, while attributes can receive `"null"`. Omit an initially absent key, or explicitly manage attribute presence with native DOM APIs when needed. See [minivan-ssr.md](minivan-ssr.md) before sharing props with a server renderer. [1.6.1 prop implementation](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js).

An ordinary handler can read current state when an event occurs. When the *selected listener* must change reactively, pass a State or derived State containing a function or `null`:

```js
import van from "vanjs-core"

const {button} = van.tags
const enabled = van.state(true)
const count = van.state(0)
const listener = van.derive(() => enabled.val
  ? () => { ++count.val }
  : null)

van.add(document.body, button({onclick: listener}, "Increment"))
```

Setting the listener State to `null` removes the old listener. Event shorthand does not expose `capture`, `passive`, `once`, or `signal`; use native `addEventListener` for these options and give external listeners an explicit owner. [Event implementation and replacement](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js).

### Namespaces and custom elements

Obtain namespaced tag helpers through `van.tags(namespaceURI)`:

```js
import van from "vanjs-core"

const {svg, path} = van.tags("http://www.w3.org/2000/svg")
export const Checkmark = () => svg(
  {viewBox: "0 0 24 24", "aria-label": "Complete"},
  path({d: "M4 12l5 5L20 6", fill: "none", stroke: "currentColor"}),
)
```

Use the MathML namespace similarly. Respect the project's custom-element registration and native `is` option where used. The current public API is `van.tags(...)`; older `tagsNS` examples are version-specific. The 1.6.1 setter-cache fix matters when investigating SVG or custom-element property collisions, so inspect the installed implementation before attributing a bug to application props. [1.6.1 release](https://github.com/vanjs-org/van/discussions/482).

## State and dependency capture

`van.state(initial)` holds a value; writing `.val` is the reactive update path. `van.derive(() => expression)` calculates a State from other States.

| State property | Meaning |
|---|---|
| `.val` | Current value; reads participate in dependency capture and writes notify when `!==` detects a change. |
| `.oldVal` | Value from before the pending update cycle; reads also participate in dependency capture. |
| `.rawVal` | Current value without capture; use for a deliberate untracked read, not for reactive writes. |

`.oldVal` is not an assignment log. Without bindings or listeners, it changes immediately with `.val`; after an update batch it matches the current value. Same-reference object mutation does not notify. Replace a core State's object/array value, or use [VanX](vanx.md) for field-level structured state:

```js
import van from "vanjs-core"

const preferences = van.state({theme: "light", density: "comfortable"})
preferences.val = {...preferences.val, theme: "dark"}
```

Core State values must not be DOM nodes or other States; the debug build rejects both. Functions can be values, as with an event-listener State. Match the published prop/child types to the use site rather than hiding unsupported values behind `any`. [State implementation](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js), [debug validation](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.debug.js), [published types](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.d.ts).

### What is captured

A binding or derive captures `.val` and `.oldVal` reads made **synchronously during that callback's execution**. Its dependencies are the States read on the branch actually taken. Nested bindings and derives establish their own capture scopes; reads in a nested callback belong to that callback.

Destructuring tag helpers or component props that contain State references is fine. Extracting `const {val} = state` reads a value at that moment: outside the intended callback, it becomes a snapshot. Preserve the State reference or move the read into the callback when the UI must keep observing it. Apply the same reasoning to ordinary helper functions called synchronously from a binding; their State reads count too.

A State written through `.val` during a callback is excluded from that callback's dependencies, even if it was also read or assigned its existing value. Avoid writes inside render calculations. A deliberate derive side effect may use this rule, but it does not prevent cycles involving several derivations. Use `.rawVal` only when changes to that value should not trigger reevaluation. [Dependency capture implementation](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js), [official advanced topics](https://vanjs.org/advanced).

## Choosing a binding and preserving its node

Use a State directly for primitive text, a State/function prop for one property, and a child callback when the output shape or combined text needs calculation. Keep live reads in the smallest binding that owns the change. Reading a child State eagerly while constructing an outer branch can make that entire branch rebuild.

A reactive child returns one primitive, one compatible DOM node, or a deliberate terminal nullish value. On initial execution its argument is `undefined`; subsequent executions receive the binding's current node. **Returning that current node is valid even while it is connected.** A different node must be disconnected before insertion; it need not have been freshly allocated. The following stateful binding deliberately keeps its span:

```js
import van from "vanjs-core"

const {div, span} = van.tags

export function Status({selected}) {
  return div(current => {
    const node = current ?? span("Status")
    node.classList.toggle("selected", selected.val)
    return node
  })
}
```

The `selected.val` read occurs on every execution, so preserving the node does not lose the dependency. Avoid creating new effects on every execution that keeps the same connected root. Review stateful callbacks on their actual behavior; a same-node return is not a defect. [Stateful binding tutorial](https://vanjs.org/tutorial), [debug result validation](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.debug.js).

Do not pass a different already-connected node through a tag call, `van.add`, or a binding result. Use native DOM movement deliberately when moving existing nodes is the task. Do not rely on cached reactive subtrees remaining reactive across a detached interval.

`DocumentFragment` is suitable for static composition, including `van.add(fragment, ...)` followed by synchronous attachment of its descendants. It is unsuitable as a reactive result in **any branch**: insertion moves out its children, the fragment stays disconnected, and the binding loses its live result. Wrap multiple changing children in a real element. Reactive arrays are also unsupported. [Core add/bind/update implementation](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js).

For absence, choose the lifetime explicitly:

- Keep a root connected and bind `hidden`/class/style to preserve its DOM and local state.
- Return a comment or empty text result to allow later remounting.
- Return `null`/`undefined` only when that binding may end permanently. This also applies to a State passed directly as a child, including an initially nullish State.

See [conditional-rendering.md](conditional-rendering.md) for complete examples and repeated-transition checks.

## Scheduling and asynchronous work

Initial bindings and derives execute synchronously. Later State writes update the source value immediately and schedule existing derivations and DOM bindings. **1.6.x uses microtasks**:

```js
import van from "vanjs-core"

const source = van.state(1)
const doubled = van.derive(() => source.val * 2)
source.val = 2
// source.val === 2; doubled.val === 2 until the scheduled batch.
await Promise.resolve()
// doubled.val === 4.
```

Synchronous writes coalesce. Changing a value and reverting it before the batch can produce no derived update. A derive can execute more than once during multi-level propagation, so it is neither an event log nor a guarantee of exactly one side effect per batch. Avoid cyclic derivations. [1.6.0 scheduling change](https://github.com/vanjs-org/van/discussions/466), [1.6.1 scheduler](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js).

Use the project's established update helper. A microtask checkpoint observes a simple 1.6.x batch already queued before the await; it does not settle requests, timers, browser paint, or a second batch scheduled by the first. Await the relevant condition when more work is involved. Preserve version-appropriate timer helpers in older projects, even when a tutorial or baseline example uses a different scheduler.

Reactive children, computed props, and derived values must be calculated synchronously. Do not supply an async render/derive callback and expect VanJS to await its Promise. Reads after `await`, in a timer, or in a later promise callback occur outside the original dependency capture. Async event handlers are supported because their functions are listeners, not reactive computations.

For reactive asynchronous loading, synchronously capture the input that should trigger work, launch the request through an explicitly owned loader, and publish its result to State. Abort superseded requests or ignore stale completions, handle rejected promises, and arrange cancellation on disposal. A synchronous derive may launch such work, but it still needs a clear lifetime and a synchronous return value. For event-driven loading, a stable handler that reads current State at event time can be simpler. Finish reactive DOM construction and attachment before awaiting external work.

## Connectedness and resource ownership

Core keeps bindings whose result nodes are connected to a Document. It filters disconnected bindings during updates as well as later collection. Construct and attach reactive DOM synchronously; do not await while it is detached. A subtree cached while disconnected can lose its nested bindings, and reattachment does not recreate them. A brief native move that preserves the intended binding lifetime is different from a detached cache. [Connectedness guidance](https://vanjs.org/advanced), [collection and update source](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js).

Derives created during a DOM child-binding callback are associated with its returned node and may be collected when that node disconnects. Derives created outside that scope are long-lived. In particular, calling `Component()` before passing its result to `van.add` does not give derives inside that ordinary factory an automatic component lifetime. Function-valued props also create derives internally; their lifetime depends on the scope in which the tag is constructed. Do not infer general effect ownership from the presence of a nearby DOM node.

Binding collection does **not** execute resource cleanup. A function returned from `van.derive` is the derived value, not a disposer; VanJS does not call it on rerun or removal. Give timers, observers, subscriptions, external listeners, and pending requests an explicit owner. For example, this mounting function owns its timer and exposes disposal to the caller:

```js
import van from "vanjs-core"

export function mountElapsed(host) {
  const seconds = van.state(0)
  const dom = van.tags.output(seconds)
  van.add(host, dom)
  const timer = setInterval(() => { ++seconds.val }, 1000)

  return {
    dom,
    dispose() {
      clearInterval(timer)
      dom.remove()
    },
  }
}
```

The caller must invoke `dispose()` when its owner ends; removing `dom` alone does not cancel the timer. Integrate with the application's existing disposal mechanism. Native custom-element lifecycle callbacks can provide ownership when appropriate, but VanJS has no general component mount/unmount hook. Hiding a connected subtree leaves its bindings and background work active. [Derive and listener ownership implementation](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js).

## Hydration

`van.hydrate(existingNode, callback)` applies the binding model to an existing node. The callback may retain that same node or replace it with a disconnected result. Read serialized state before replacement, and localize future bindings so an incidental read does not make the entire hydration root rebuild:

```js
import van from "vanjs-core"

export function hydrateCounter(existingButton) {
  const initialCount = Number(existingButton.getAttribute("data-count"))
  const id = existingButton.id
  const count = van.state(initialCount)

  van.hydrate(existingButton, () => van.tags.button(
    {id, onclick: () => { ++count.val }},
    () => "Count: " + count.val,
  ))
}
```

This example assumes the server supplied a valid numeric `data-count`. For structured state and hostile strings, use the transport recipes in [minivan-ssr.md](minivan-ssr.md). Hydration does not automatically discover state or attach behavior throughout server markup.

Treat hydration as a side effect. The 1.6.1 runtime does not provide the hydrated-node return promised by its type signature; obtain the needed node explicitly instead. Nullish results and connectedness follow the same binding rules described above. [Hydration implementation](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js), [published signature](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.d.ts), [official SSR/hydration guide](https://vanjs.org/ssr).

## Focused verification

Use the project's existing checks and test the transition responsible for the change. A connected DOM host is necessary for reactive update checks. Inspect text, live form properties, listener replacement/removal, and actual node identity where preservation matters. Cover the initial state as well as repeated toggles, clears, or removals. Use a browser for focus, layout, animation, and final integration behavior that a DOM harness cannot establish.

Watch unexpected `console.error` output: core catches errors in captured callbacks and can retain the previous node/value, so an assertion that merely expects a throw may miss a failure. Keep published types honest and use debug validation where available. The skill's [maintenance suite](sources.md) checks its recorded library contracts; it is not a required dependency or test expansion for every application change. [Error handling source](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js).
