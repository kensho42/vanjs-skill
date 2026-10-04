# Conditional Rendering: Choose the DOM Lifetime

Use this reference when a panel, branch, or item can disappear. The verified behavior below is **VanJS 1.6.1**; retain the application's installed version and update helper. The deciding question is whether the existing DOM must survive, may be recreated, or should be removed permanently.

## Contents

- [The three lifetimes](#the-three-lifetimes)
- [Persistent mounted subtree](#persistent-mounted-subtree)
- [Remountable placeholder](#remountable-placeholder)
- [Terminal removal](#terminal-removal)
- [Keep branch dependencies local](#keep-branch-dependencies-local)
- [Result-node rules](#result-node-rules)
- [Shared rendering and verification](#shared-rendering-and-verification)

## The three lifetimes

A reactive child binding is retained through its connected result node. Returning `null` or `undefined` leaves no node to retain, so that binding cannot respond to a later change. A persistent root or placeholder supplies the connected node needed for reversible absence. [Core bind/update/collection implementation](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js), [official advanced topics](https://vanjs.org/advanced).

| Intended lifetime | Pattern | What survives while absent? | Can the same binding show content later? |
|---|---|---|---|
| Persistent mounted subtree | Bind `hidden`, class, or style on its root | The subtree, its DOM identity, and component-local State | Yes |
| Remountable subtree | Return a comment/text placeholder while absent; call the factory on remount | External model state; the removed subtree is recreated | Yes |
| Terminal removal | Return `null` or `undefined` | Any state separately owned by the model | No |

Choose the pattern from the user's intended behavior. A review should preserve valid current-node bindings and report the actual lifetime defect; an implementation should change only the responsible binding/owner.

## Persistent mounted subtree

For a settings panel that must preserve its draft and input node, create the panel once and bind its visibility. This works even when initially hidden:

```js
import van from "vanjs-core"

const {button, input, section} = van.tags

export function Settings({visible}) {
  const draft = van.state("")
  return section(
    {hidden: () => !visible.val},
    input({
      "aria-label": "Draft",
      value: draft,
      oninput: event => { draft.val = event.currentTarget.value },
    }),
  )
}

const visible = van.state(false)
van.add(document.body,
  button({onclick: () => { visible.val = !visible.val }}, "Toggle settings"),
  Settings({visible}),
)
```

The root remains connected, including when `hidden` is true, so nested bindings stay active. Choose a class or CSS string instead when the application's animation or layout requires it. Identity preserves the existing control, but focus restoration is a separate browser interaction; handle focus according to the product's behavior. Hiding also leaves timers and other background work running unless their owner explicitly pauses them. [Core prop bindings](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js).

Do not replace this with a cached panel that alternates between the DOM and a detached slot. Once detached, its nested bindings can be discarded during an update or collection; simply reinserting it does not restore them. Keep it connected to preserve it, or recreate it on remount. [Connectedness](https://vanjs.org/advanced).

## Remountable placeholder

When removing the subtree is intended and fresh component-local state is acceptable, keep a real node in the absent branch. This client-only helper uses one comment per binding:

```js
import van from "vanjs-core"

const {button, div, input, section} = van.tags

export function when(test, render) {
  const anchor = document.createComment("van:when")
  return () => test() ? render() : anchor
}

function Details() {
  const draft = van.state("")
  return section(input({
    "aria-label": "Temporary draft",
    value: draft,
    oninput: event => { draft.val = event.currentTarget.value },
  }))
}

const open = van.state(false)
van.add(document.body,
  button({onclick: () => { open.val = !open.val }}, "Toggle details"),
  div(when(() => open.val, Details)),
)
```

The initially absent comment is inserted into the document. Opening replaces it with `Details()`; closing replaces that subtree with the same now-detached comment. Repeated absent executions may return the comment while it is already the current node. Both are valid. The comment must belong to this binding alone; sharing it across binding instances would move their anchor.

The helper is a recommended pattern compatible with the verified implementation, not a separate VanJS API. `render()` must return one supported non-nullish node or primitive. It creates a reactive subtree anew after removal. External State passed into the factory can still preserve model values across mounts; State allocated by the factory is fresh. Explicitly owned resources still need disposal when the subtree is removed. [Binding semantics](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js), [resource ownership](vanjs-core.md#connectedness-and-resource-ownership).

For a smaller pattern, an empty string becomes a Text node on the client:

```js
import van from "vanjs-core"

const open = van.state(false)
van.add(document.body,
  van.tags.div(() => open.val ? van.tags.p("Details") : ""),
)
```

A per-binding `document.createTextNode("")` can also be reused like the comment. A different replacement node only needs to be disconnected; there is no rule requiring a new allocation on every run.

## Terminal removal

Use nullish output when an item should never reappear through that binding. For model-owned collections, remove the model entry and let its list owner remove the row; see [vanx.md](vanx.md). A standalone one-way removal can be expressed directly:

```js
import van from "vanjs-core"

const {button, div, span} = van.tags
const deleted = van.state(false)

van.add(document.body, div(() => deleted.val ? null : span(
  "Temporary notice ",
  button({onclick: () => { deleted.val = true }}, "Dismiss"),
)))
```

After the null result has been processed, setting `deleted.val` back to false will not restore the notice. A same-batch change that reverts before any nullish result is rendered is different; test removal after its update checkpoint. [Removal API](https://vanjs.org/tutorial), [update filtering](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js).

### A State child has the same boundary

`van.tags.span(message)` binds the State's value directly. If `message` starts as `null`/`undefined`, it starts without a connected result; later assignment does not make text appear. If it starts as text and later becomes nullish, the text binding ends at that update.

For a reversible optional message, normalize the result inside a binding:

```js
import van from "vanjs-core"

const message = van.state(null)
van.add(document.body, van.tags.span(() => message.val ?? ""))
```

This can show, clear, and show again. Static children such as `div(null, undefined)` merely omit those values during construction; they never represented a future reactive slot. The nullish behavior above is reproduced on 1.6.1 and follows its result-node retention. [State child handling](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js).

## Keep branch dependencies local

A conditional callback also captures synchronous State reads made by its selected factory. The `when` helper does not isolate those reads. Bind content inside nested callbacks so changing content does not unintentionally replace the branch root. Derive a coarse selector when many source changes should keep the same branch:

```js
import van from "vanjs-core"

const {div, p} = van.tags
const query = van.state("")
const empty = van.derive(() => query.val.trim() === "")

function Results({query}) {
  return p("Results for ", () => query.val)
}

van.add(document.body, div(() => empty.val
  ? p("Enter a query")
  : Results({query})))
```

Here the branch reads `empty`, while the nested text binding reads `query`. Changing one nonempty query to another preserves the results paragraph. Changing between empty and nonempty selects another real branch. The app-level selector in this example is intentionally long-lived; use the appropriate scope when components are recreated. [Dependency and derive ownership](vanjs-core.md#state-and-dependency-capture).

## Result-node rules

- **Same current node:** valid. Stateful callbacks may mutate and return their connected current node; keep the required State reads on every relevant execution path. See [Status](vanjs-core.md#choosing-a-binding-and-preserving-its-node).
- **Different node:** must be disconnected before insertion. A reusable detached comment is valid; an unrelated connected element is not a valid replacement.
- **Boolean short-circuit:** `() => open.val && Details()` can display `false`; use an explicit ternary with the chosen absent result.
- **Array:** unsupported as one reactive result. Use a suitable element around multiple children.
- **DocumentFragment:** unsuitable as either visible result or placeholder. Its children move into the parent while the fragment stays disconnected, so it cannot retain the binding. Static fragment composition is supported when descendants are attached synchronously.

These distinguish supported node reuse from detached reactive-subtree caching. They do not require every binding to construct a fresh node. [Debug result checks](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.debug.js), [core fragment/result handling](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js).

## Shared rendering and verification

Comment creation requires a DOM. For Mini-Van text rendering, prefer a supported empty-string result or deterministic alternate markup, and establish the client binding during hydration/construction. An empty server string does not serialize a durable client anchor. Audit `hidden` and other boolean props for renderer differences rather than assuming server/client parity. Follow [minivan-ssr.md](minivan-ssr.md) for nullish callback results, boolean serialization, and initial-state handoff.

Verify the selected lifetime using a host connected to a Document and the project's update helper:

| Pattern | Relevant transition and observation |
|---|---|
| Persistent | Start hidden; show, edit, hide, and show repeatedly. Assert the **same input node** and draft value remain. |
| Remountable | Start absent; open, edit, close, and open again. Assert content returns, the subtree was recreated, and any intended external model state survives. |
| Terminal | Render nullish output, await its update, then change the dependency. Assert the removed node stays absent. |
| Optional text | Start nullish; show, clear, and show again through the normalized text binding. |
| Local content | Change content while keeping the selector unchanged. Assert the branch node retains identity where intended. |

Simple 1.6.x updates can use a microtask checkpoint; follow the [scheduling caveats](vanjs-core.md#scheduling-and-asynchronous-work) for additional batches and older versions. DOM assertions establish structure, values, and identity; use an actual browser for focus, layout, media, and animation behavior.
