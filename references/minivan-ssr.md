# Mini-Van Rendering, State Transport, and Hydration

Preserve the project's installed versions. The differences below are verified for
**`mini-van-plate` 0.6.3** and **`vanjs-core` 1.6.1**, using their published source
and a jsdom 26.1.0 harness. Treat version-specific limitations as reproduction
targets, not as reasons to upgrade an application. See [sources](sources.md) for
the full verification baseline.

## Contents

- [Select the rendering target](#select-the-rendering-target)
- [Compare the three implementations](#compare-the-three-implementations)
- [Separate construction from serialization](#separate-construction-from-serialization)
- [Write portable props and callbacks](#write-portable-props-and-callbacks)
- [Transport initialization data losslessly](#transport-initialization-data-losslessly)
- [Register shared renderers once](#register-shared-renderers-once)
- [Bound the dummy VanX adapter](#bound-the-dummy-vanx-adapter)
- [Extract state before hydration](#extract-state-before-hydration)
- [Verify the modes the application uses](#verify-the-modes-the-application-uses)
- [Primary sources](#primary-sources)

## Select the rendering target

| Target | API | Result |
|---|---|---|
| HTML strings without a DOM | Default import from `mini-van-plate/van-plate` | Tag objects expose `.render()`; `van.html(...)` adds `<!DOCTYPE html>` |
| Static DOM construction | Default import from `mini-van-plate`, then `mini.vanWithDoc(document)` | Actual nodes; serialize an element with `.outerHTML` |
| Reactive browser UI | Default import from `vanjs-core` | Actual nodes, reactive bindings, event listeners, and `hydrate` |
| Shared component environment | `env`, `registerEnv`, and optionally `dummyVanX` from `mini-van-plate/shared` | A bridge to the renderer selected by the entry point |

Start with text mode for ordinary SSR when its serialization semantics fit the
markup. Choose DOM mode when the server needs actual DOM operations or the
application benefits from its DOM attribute serializer; it is not an SSR requirement.

Supply a compatible DOM implementation when using server DOM mode; Mini-Van does
not create a document. Its default browser export uses `window.document` when
available at import time. Use Mini-Van for static browser content only when its
snapshot behavior is sufficient. Neither Mini-Van mode supplies core's reactive
updates or hydration. [Mode documentation](https://vanjs.org/minivan).

## Compare the three implementations

Apply this table to **text/DOM 0.6.3 and core 1.6.1**. “Ordinary function” means a
function whose prototype matches the implementation's `Function.prototype`
check; async and generator functions have different prototypes.

| Input or operation | Mini-Van text (`van-plate`) | Mini-Van DOM | Browser core |
|---|---|---|---|
| State or ordinary non-event function prop | Resolve during tag construction | Resolve during tag construction | Resolve initially and establish reactive bindings |
| State or ordinary function child | Resolve on every `.render()` | Resolve when added/constructed | Bind synchronously, then update when tracked state changes |
| Child callback argument | No current-node argument | No current-node argument | Receive the previous node on update |
| Static `null` / `undefined` child | Omit | Omit | Omit |
| State/ordinary callback child resolves to nullish | Throw during rendering | Omit | No initial node, or remove the current node; that binding cannot subsequently revive itself |
| Nullish prop, including a resolved State/callback value | Serialize `"null"` / `"undefined"` | Throw `TypeError` | Pass to the relevant DOM setter or `setAttribute`; no general omission rule |
| Ordinary function in an `on*` prop | Omit the attribute | Omit the attribute; do not install a listener | Install an event listener |
| Async/generator function in an `on*` prop | Serialize its source as attribute text | Set its source as attribute text | Install a listener; do not await its Promise or iterate a returned generator |
| HTML boolean prop, such as `disabled` | `true`: bare attribute; `false`: omit | Write `"true"` / `"false"`; both mean the HTML boolean attribute is present | Use the DOM property setter where available; `false` disables the flag |
| `aria-*` / `data-*` boolean prop | `true`: bare attribute; `false`: omit | Write `"true"` / `"false"` | Set the attribute to `"true"` / `"false"` |
| `state`, `derive` | Mutable value container; `derive(f)` runs once | Same snapshot API | Reactive state and dependency tracking |
| `tags(namespaceURI)` | Generate tag names; do not create namespace-aware nodes | Use `createElementNS` | Use `createElementNS` |

Source: [text renderer](https://github.com/vanjs-org/mini-van/blob/0.6.3/src/van-plate.js),
[DOM renderer](https://github.com/vanjs-org/mini-van/blob/0.6.3/src/mini-van.js), and
[core](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js).
The boolean-presence rule describes HTML semantics; the recorded property checks
use jsdom. It is not evidence about real-browser focus, form restoration, or layout.

## Separate construction from serialization

Finalize request data before constructing markup. In text mode, changing a State
between construction and rendering can put two versions of it into one element:

```js
import plate from "mini-van-plate/van-plate"

const status = plate.state("draft")
const node = plate.tags.div({"data-status": status}, () => status.val)
status.val = "ready"
console.log(node.render()) // <div data-status="draft">ready</div>
```

Create a fresh component tree for each request. Repeated `.render()` calls may
reevaluate child functions; they do not rerun the constructor, refresh its props,
or establish subscriptions. In both Mini-Van modes, `oldVal` and `rawVal` simply
read the current value, and `derive(f)` does not recalculate after assignments.
Keep rendering callbacks synchronous and free of request-changing side effects.
Resolve asynchronous data before constructing the component; an async child or
prop function is not a supported awaitable rendering operation.

## Write portable props and callbacks

Both Mini-Van modes handle props as attributes. Core prefers DOM setters and treats
`on*` props as listeners. Use shared attribute names such as `class` and `for`.
Do not expect `className`, `textContent`, `innerHTML`, or a custom property to have
the same effect in all modes. Supply ordinary text as children. Check form-specific
initialization: for example, a `textarea` uses child text in HTML, while a browser
can also set its live `.value` property.

Omit absent prop keys explicitly. Build initial HTML boolean attributes
conditionally, and stringify ARIA/data booleans:

```js
export const checkboxProps = checked => ({
  type: "checkbox",
  ...(checked ? {checked: true} : {}),
})

export const disclosureProps = open => ({
  "aria-expanded": String(open),
  "data-open": String(open),
})
```

These helpers produce initial snapshots. When a browser property must keep
changing, bind it with core, for example `checked: checkedState`. For reactive
ARIA/data values, use an ordinary callback such as
`"aria-expanded": () => String(openState.val)`.

Keep event props as ordinary functions in shared 0.6.3 code, or exclude them on the
server. Async/generator source serialization is a package limitation; it is not
listener installation or a general prohibition on async client listeners. Keep
asynchronous error handling in an ordinary wrapper:

```js
export const submitHandler = (save, reportError) => event => {
  event.preventDefault()
  const data = new FormData(event.currentTarget)
  void Promise.resolve().then(() => save(data)).catch(reportError)
}
// Use as onsubmit: submitHandler(save, reportError).
```

Mini-Van omits this ordinary `onsubmit` function. Core registers it as a listener.
Capture event data before deferred work; `currentTarget` is only meaningful during
dispatch. A generator listener needs application-defined iteration to execute its
body; registering one does not consume it. Avoid inline string event handlers.

For empty shared child branches, return `""` from an ordinary callback. A callback
returning `null` throws in text 0.6.3 and removes its binding in core. An empty SSR
string does not itself install a live client anchor: establish the client binding
during hydration. See [conditional rendering](conditional-rendering.md) for
persistent subtrees and remountable DOM anchors.

## Transport initialization data losslessly

Serialize a defined, JSON-compatible value using the application's schema.
Normalize values that JSON does not preserve, and send only data intended for the
client. Use `JSON.parse`, never evaluation, to read the result.

Do not put arbitrary `JSON.stringify(data)` directly into a **van-plate 0.6.3**
attribute. Its quote escaping and JSON-style attribute quoting do not form a
lossless HTML attribute serializer: existing character references can decode,
and backslashes or line breaks can change. JSON with escaped quotes can fail to
parse after the HTML is parsed. This limitation comes from the
[text serializer](https://github.com/vanjs-org/mini-van/blob/0.6.3/src/van-plate.js);
do not generalize it to DOM `setAttribute`.

### Encoded attribute

Encode the JSON before passing it to the tag constructor. Decode exactly once
after reading the parsed attribute. The encoded characters avoid this serializer's
attribute pitfalls.

```js
// state-attribute.js: usable by the server and browser.
export const encodeState = value => {
  const json = JSON.stringify(value)
  if (json === undefined) throw new TypeError("Expected a JSON value")
  return encodeURIComponent(json)
}

export const readState = root => {
  const encoded = root.getAttribute("data-state")
  if (encoded === null) throw new Error("Missing data-state")
  return JSON.parse(decodeURIComponent(encoded))
}
```

```js
// Server: render-shell.js
import plate from "mini-van-plate/van-plate"
import {encodeState} from "./state-attribute.js"

export const renderShell = initial => plate.tags.div({
  id: "app",
  "data-state": encodeState(initial),
}).render()
```

Read with `readState(root)` before replacing that root during hydration.

### Escaped inert JSON

For a separate data block, serialize JSON and replace **every literal `<`** with
the JSON escape `\u003c`. Text-mode `script` and `style` children deliberately bypass
HTML text escaping. Without this replacement, a value containing `</script>` can
terminate an `application/json` block during HTML parsing.

```js
// state-json.js: server serializer and browser reader.
export const inertJSON = value => {
  const json = JSON.stringify(value)
  if (json === undefined) throw new TypeError("Expected a JSON value")
  return json.replace(/</g, "\\u003c")
}

export const readJSONBlock = element => {
  if (!element) throw new Error("Missing JSON state block")
  return JSON.parse(element.textContent)
}
```

```js
import plate from "mini-van-plate/van-plate"
import {inertJSON} from "./state-json.js"

export const renderStateBlock = initial => plate.tags.script({
  type: "application/json",
  id: "app-state",
}, inertJSON(initial)).render()
```

Read the block through `textContent`, then `JSON.parse`. Do not HTML-escape the JSON
instead: script raw text does not decode character references. This recipe is for
inert data; it does not make interpolated executable JavaScript, CSS, URLs, or
arbitrary HTML safe. Plain child text outside `script`/`style` is escaped by the
text renderer.

## Register shared renderers once

Resolve `env.van` inside component invocation, after registration. Keep state and
request data inside that invocation. This example's property/child bindings stay
fine-grained when core renders it. Treat `initial.name` as a one-line string under
the application's input schema:

```js
// name-editor.js
import {env} from "mini-van-plate/shared"

export const NameEditor = ({id, initial}) => {
  const van = env.van
  const name = van.state(initial.name)
  return van.tags.div({id},
    van.tags.label("Name ", van.tags.input({
      name: "name",
      value: name,
      oninput: event => { name.val = event.target.value },
    })),
    van.tags.p("Preview: ", name),
  )
}
```

```js
// Server entry: call initializeRenderer(document) once at startup.
import mini from "mini-van-plate"
import {dummyVanX, registerEnv} from "mini-van-plate/shared"
import {NameEditor} from "./name-editor.js"
import {inertJSON} from "./state-json.js"

export const initializeRenderer = document => {
  const serverVan = mini.vanWithDoc(document)
  registerEnv({van: serverVan, vanX: dummyVanX})
  return initial => {
    const root = NameEditor({id: "profile", initial})
    serverVan.add(root, serverVan.tags.script({
      type: "application/json", id: "profile-state",
    }, inertJSON(initial)))
    return root.outerHTML
  }
}
```

Supply the document from the server's existing DOM setup and retain the returned
render function. This form example uses DOM mode so quotes, entity text, and
backslashes in the input's `value` pass through the DOM serializer. The text
renderer's attribute limitation affects ordinary text attributes too; safe state
transport alone does not fix an incorrectly serialized form value. Keep actual
form normalization separate from serialization guarantees.

For a text-mode multiline form, put the value in a `textarea` child, where normal
HTML text escaping applies. With line endings already normalized to LF in the
application's data, prepend one LF to the serialized child because HTML parsing
discards the first LF immediately after a `textarea` opening tag:

```js
import plate from "mini-van-plate/van-plate"

export const renderNote = note => plate.tags.textarea(
  {name: "note"}, "\n" + note,
).render()
```

Pair it with either state transport above. On the client, initialize/bind the live
`.value` from the intended text or the captured user edit. Add the extra LF only
to the server markup, not to that live value. Check leading-newline cases through
the parser; do not treat this as a portable `textarea` `value` attribute recipe.

`env` is a mutable module singleton. Do not destructure `env.van.tags` at module
scope before entry-point registration, store request data in `env`, or switch
renderers between overlapping asynchronous requests. Register one stable renderer
per execution environment. If concurrent work requires different renderers, pass
the renderer explicitly or isolate those environments. Register real `vanjs-ext`
on the client when components use `env.vanX`; omit either adapter when unused.
[Shared bridge source](https://github.com/vanjs-org/mini-van/blob/0.6.3/src/shared.js).

## Bound the dummy VanX adapter

Treat **0.6.3 `dummyVanX`** as a partial adapter for complete initial snapshots:

| API | Actual server adapter behavior |
|---|---|
| `reactive`, `noreactive`, `raw` | Return the original object |
| `calc` | Call the function once and return its result |
| `stateFields` | Create separate States from current enumerable fields; assigning their `.val` does not write the field back |
| `list` | Visit current entries once, wrap each value in a State, and supply a no-op deleter; array keys become numbers |
| `replace` | Return the original object; ignore the replacement |
| `compact` | Return the original object; do not remove holes or normalize it |

Prepare the complete data before constructing the shared component. Initializing
`reactive({})` and then calling dummy `replace` leaves an empty server list. Do not
depend on later recalculation, proxy tracking, field writeback, deletion, or
compaction. Normalize data with server logic first. A passing server rendering
check cannot establish real VanX update behavior; exercise that behavior using
the client implementation. These wrappers do not clone nested values; object
references can still alias the input. [Adapter source](https://github.com/vanjs-org/mini-van/blob/0.6.3/src/shared.js).

## Extract state before hydration

Core `hydrate(root, callback)` invokes the callback with the current node and uses
its result for that binding. Returning a different node replaces `root`; returning
the current node preserves it. Hydration does not diff arbitrary markup, attach
all template listeners automatically, or restore browser-managed state. Do not
use its return value to obtain the replacement node.
[Hydration documentation](https://vanjs.org/ssr) and
[core implementation](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js).

Extract serialized state **before** replacement, especially when its attribute or
script block is inside the root. Then capture live form properties: `.value` and
`.checked` can differ from server attributes after typing, autofill, or user
interaction. Choose whether live user input or server data wins. The following
client entry deliberately preserves the current name, focus, text selection, and
local scroll positions when replacing the preceding editor:

```js
// Client entry: separate execution environment from the server.
import van from "vanjs-core"
import * as vanX from "vanjs-ext"
import {registerEnv} from "mini-van-plate/shared"
import {NameEditor} from "./name-editor.js"
import {readJSONBlock} from "./state-json.js"

registerEnv({van, vanX})

const root = document.getElementById("profile")
if (!root) throw new Error("Missing profile root")
const initial = readJSONBlock(root.querySelector("#profile-state"))
const input = root.querySelector('input[name="name"]')
if (!input) throw new Error("Missing name input")
const id = root.id
const live = {
  name: input.value,
  focused: document.activeElement === input,
  start: input.selectionStart,
  end: input.selectionEnd,
  direction: input.selectionDirection,
  inputScroll: input.scrollLeft,
  scrollTop: root.scrollTop,
  scrollLeft: root.scrollLeft,
}

let replacement
van.hydrate(root, () => {
  replacement = NameEditor({id, initial: {...initial, name: live.name}})
  return replacement
})

const nextInput = replacement.querySelector('input[name="name"]')
if (live.focused) nextInput.focus({preventScroll: true})
if (live.start !== null && live.end !== null)
  nextInput.setSelectionRange(live.start, live.end, live.direction ?? "none")
nextInput.scrollLeft = live.inputScroll
replacement.scrollTop = live.scrollTop
replacement.scrollLeft = live.scrollLeft
```

Adapt the captured fields to the actual form: checkboxes, selected options, and
application state need their own handoff. Prefer retaining and enhancing existing
nodes when identity or browser state such as file selection must survive. Make
listener/resource setup idempotent if a hydration callback can run again.

Hydrate the smallest useful root. State reads directly in the callback can bind
the entire returned root and cause later replacements; place changing values in
child/property bindings as in `NameEditor`. Restoring focus, selection, and scroll
is a deliberate browser operation, subject to actual layout and browser behavior;
serializer or jsdom checks alone do not guarantee that experience.

## Verify the modes the application uses

Check the relevant boundary using existing project tools. For state transport,
round-trip quotes, entity text such as `&amp;`, backslashes, line breaks, Unicode,
and `</script><script>` through **rendered HTML and an HTML parser**, then compare
the decoded value. Confirm the expected data block count and absence of serialized
event-function props. Check nullish/false initial values and the first client event.

For hydration, verify state extraction before replacement and subsequent reactive
updates. Assert node identity when the requirement is preservation; copying a
value into a fresh node is a different operation. Use actual browsers for focus,
selection, autofill, scroll, and form behavior relevant to the task. Do not require
all renderers or the skill's maintenance suite for an unrelated application edit.

## Primary sources

- [Official Mini-Van documentation](https://vanjs.org/minivan).
- [Official SSR and hydration documentation](https://vanjs.org/ssr).
- [Mini-Van 0.6.3 text implementation](https://github.com/vanjs-org/mini-van/blob/0.6.3/src/van-plate.js), [DOM implementation](https://github.com/vanjs-org/mini-van/blob/0.6.3/src/mini-van.js), and [shared adapter](https://github.com/vanjs-org/mini-van/blob/0.6.3/src/shared.js).
- [Mini-Van 0.6.3 text-renderer tests](https://github.com/vanjs-org/mini-van/blob/0.6.3/test/deno/van-plate.test.ts).
- [Core 1.6.1 published-source revision](https://github.com/vanjs-org/van/blob/08f67468ddcc67c08a59e2be433e556fc889aebf/src/van.js).
