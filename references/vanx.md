# VanX: Structured State and List Identity

Use this reference for `vanjs-ext` structured state, collection rendering, and snapshot updates. The detailed behavior below is verified against **VanX 0.6.3 with VanJS 1.6.1** and its [published source][source]. Preserve the application's installed versions and module style; use this baseline to investigate a relevant behavior, not to require an upgrade. Use core states when the task only needs a few independent values.

## Contents

- [Track fields at the point of use](#track-fields-at-the-point-of-use)
- [Keep optional fields observable](#keep-optional-fields-observable)
- [Understand the list contract](#understand-the-list-contract)
- [Preserve entity and DOM identity across snapshots](#preserve-entity-and-dom-identity-across-snapshots)
- [Apply compatible replacements and handle holes](#apply-compatible-replacements-and-handle-holes)
- [Consume calculations inside reactive fields](#consume-calculations-inside-reactive-fields)
- [Use raw and underlying states deliberately](#use-raw-and-underlying-states-deliberately)
- [Handle opaque values and serialization](#handle-opaque-values-and-serialization)
- [Verify the transition being changed](#verify-the-transition-being-changed)
- [Sources](#sources)

## Track fields at the point of use

Create structured state with `reactive` and use its returned proxy. VanX stores each converted field in a core `State` and converts nested values recursively. Reads of existing fields participate in the surrounding VanJS binding or derivation; ordinary reads outside that execution do not establish a lasting subscription. [Implementation: `buildStates`, `reactiveHandler`, and `reactive`][source].

```js
import van from "vanjs-core"
import * as vanX from "vanjs-ext"

const {input, span} = van.tags
const model = vanX.reactive({
  profile: {first: "Tao", last: "Xin"},
  filters: {query: ""},
})

van.add(document.body,
  input({
    value: () => model.filters.query,
    oninput: e => model.filters.query = e.currentTarget.value,
  }),
  span(() => {
    const {first, last} = model.profile
    return `${first} ${last}`
  }),
)
```

Allow destructuring inside a tracked callback, as above. Distinguish these capture boundaries during review:

| Capture | What later binding reads can observe |
|---|---|
| `const first = model.profile.first` outside the binding | A captured primitive; `() => first` has no reactive field read. |
| `const profile = model.profile` outside the binding | `() => profile.first` tracks that proxy's field, but misses later `model.profile = nextProfile`. This alias is useful when the nested proxy's lifetime is intentionally stable. |
| `() => { const {first} = model.profile; return first }` | Both the parent field and the nested field are read during tracking. |
| `Object.keys(proxy)` inside the binding | Key additions/deletions and relevant order changes, through the structural state. It does not read every field value. |
| `Object.entries(proxy)` inside the binding | Structure plus the enumerated field values. |

Keep the conversion boundary explicit. Mutating the original plain source object does not update the returned proxy. Do not seed `reactive` with core `State` objects; initialize ordinary values and use `stateFields` when a core State is needed later. Calling `reactive` on an existing VanX proxy preserves that proxy, but two references to the same unconverted plain object can become separate proxies. Do not rely on conversion to preserve shared aliases or cycles; normalize entity relationships by IDs when that matters.

Prefer ordinary records and arrays with own data fields. In 0.6.3, conversion uses `instanceof Object`, excludes functions and marked `noreactive` values, and leaves null-prototype records unconverted. New keys colliding with inherited names can bypass State conversion; normalize external IDs to safe prefixed keys as in the snapshot recipe. Class and native instances need separate consideration; see [opaque values](#handle-opaque-values-and-serialization). These are conversion boundaries, not reasons to redesign unrelated application state. [Published source][source].

## Keep optional fields observable

**Verified 0.6.3 limitation:** a missing field has no field State to subscribe to. Deleting an existing field removes its State from the collection without invalidating ordinary readers of that State. A direct binding can therefore miss initial creation, deletion, or a later re-addition. Optional chaining, `in`, and `Object.hasOwn` do not by themselves add the structural subscription used by `Object.keys`. See [`get`, `deleteProperty`, and `ownKeys`][source] and [the upstream report][missing-fields].

For a fixed schema, initialize the field and clear its value while retaining the key. Both controls below can be used repeatedly, including after an initially empty render:

```js
import van from "vanjs-core"
import * as vanX from "vanjs-ext"

const {button, div, span} = van.tags
const errors = vanX.reactive({email: ""})
van.add(document.body, div(
  span(() => errors.email),
  button({onclick: () => errors.email = "Invalid email"}, "Show error"),
  button({onclick: () => errors.email = ""}, "Clear error"),
))
```

For a dictionary whose keys genuinely come and go, read its structure inside every presence-sensitive binding. This version supports show → delete → show:

```js
import van from "vanjs-core"
import * as vanX from "vanjs-ext"

const {button, div, span} = van.tags
const errors = vanX.reactive({})
van.add(document.body, div(
  span(() => {
    Object.keys(errors)
    return errors.email ?? ""
  }),
  button({onclick: () => errors.email = "Invalid email"}, "Show error"),
  button({onclick: () => { delete errors.email }}, "Clear error"),
))
```

Return an empty string when the message is absent so the child binding keeps a live text anchor. Mount before changing state. Treat list-entry deletion separately: `list` has explicit row-removal handling, whereas these examples concern ordinary field bindings. See [conditional rendering](conditional-rendering.md) for DOM lifetime choices.

## Understand the list contract

Use `vanX.list(containerOrFactory, collection, (itemState, remove, key) => node)` with a reactive collection. The container is an element or a function returning one; each item callback receives the core State for that entry, a deleter, and a numeric index for arrays or string key for records. Give the list a container whose row children it can manage. [Official API][docs]; [published implementation][source] and [declarations][types].

Return one real DOM node for each row: normally an element, or an explicit Text/Comment node when appropriate. Keep that node available to the list's deletion and reordering bookkeeping. Do not return a primitive, core State, array, `null`, or `DocumentFragment` as the row result. Some of these are accepted as ordinary VanJS children, but that does not make them valid list rows; a fragment also loses its children when appended. See [the fragment report][fragments] and [`addToContainer`, `onDelete`, and `replaceInternal`][source].

The item callback runs inside a tracked binding. Destructuring its argument as `({val: item}) => ...` is supported and tracks replacement of the entry's State. To retain the row during ordinary field edits, read fields in nested child or property bindings, such as `input({value: () => item.text})`. Reading `item.text` directly while constructing the whole row makes that outer callback depend on the field and can recreate the row when it changes.

For scalar entries, a State can be passed to a property or child *inside* the returned row:

```js
import van from "vanjs-core"
import * as vanX from "vanjs-ext"

const {input, li, ul} = van.tags
const colors = vanX.reactive(["#ffffff"])
van.add(document.body, vanX.list(ul, colors, color => li(input({
  type: "color",
  value: color,
  oninput: e => color.val = e.currentTarget.value,
}))))
```

For object entries, assign replacements through `collection[key]` so VanX converts new objects. Assigning a plain object directly to `itemState.val` bypasses that conversion and loses later deep field reactivity. Whole-entry replacement can rerun the outer row callback; use compatible in-place `replace` when the existing entity and its row must survive.

Keep the collection proxy used to construct a list. If a list receives `model.items`, a later `model.items = nextItems` does not retarget it. Use `vanX.replace(model.items, nextItems)` to preserve that proxy, or intentionally rebuild the list in a binding that reads the parent field. Mount before mutations: disconnected list bindings can be pruned on mutation or garbage collection. [Implementation: `filterBindings`, `list`, and the proxy setter][source].

## Preserve entity and DOM identity across snapshots

Choose the representation for the identity the application actually needs:

| Collection | Identity followed by `list` | Consequence |
|---|---|---|
| Array | Numeric position | An `id` field inside each item does not make the list keyed by ID. Sorting, shifting, and dense replacements can associate an existing row with a different entity. |
| Record keyed by stable ID | Record key | Compatible updates retain field States; `replace` can move retained rows to the new key order. |

Use prefixed keys such as `record:10` when numeric-looking IDs must follow snapshot order. Integer-index object keys are enumerated numerically, so bare keys `"10"` and `"2"` cannot express arbitrary display order. Keep the original ID as data if the API needs it. Apply this representation only where entity identity matters; an existing positional array can remain appropriate. [VanX collection behavior][source].

The following complete browser example accepts full snapshots, supplies stable optional defaults, rejects duplicate normalized IDs, and preserves the collection, retained row, and retained input nodes through reorder and removal:

```js
import van from "vanjs-core"
import * as vanX from "vanjs-ext"

const {button, input, li, ul} = van.tags

function normalizeSnapshot(rows) {
  if (!Array.isArray(rows)) throw new TypeError("Expected an array of records")
  const seen = new Set()
  return Object.fromEntries(rows.map(({id, text = "", done = false}) => {
    if (!(typeof id === "string" && id.length > 0) && !Number.isSafeInteger(id))
      throw new TypeError("Expected a string ID or safe integer ID")
    if (typeof text !== "string" || typeof done !== "boolean")
      throw new TypeError("Expected text and done fields")
    const key = `record:${id}`
    if (seen.has(key)) throw new Error(`Duplicate ID: ${id}`)
    seen.add(key)
    return [key, {id: String(id), text, done}]
  }))
}

const records = vanX.reactive(normalizeSnapshot([
  {id: 10, text: "Ten"},
  {id: 2, text: "Two"},
]))
const listDom = vanX.list(ul, records, ({val: item}, remove, key) => li(
  {"data-key": key},
  input({
    value: () => item.text,
    oninput: e => item.text = e.currentTarget.value,
  }),
  input({
    type: "checkbox",
    checked: () => item.done,
    onchange: e => item.done = e.currentTarget.checked,
  }),
  button({onclick: remove}, "Delete"),
))
van.add(document.body, listDom)

function applySnapshot(rows) {
  const normalized = normalizeSnapshot(rows)
  vanX.replace(records, normalized)
}

const retainedRow = listDom.querySelector('[data-key="record:2"]')
const retainedInput = retainedRow.querySelector("input")
applySnapshot([{id: 2, text: "Two revised"}, {id: 10, text: "Ten"}])
applySnapshot([{id: 30, text: "Thirty"}, {id: 2, text: "Two revised"}])
console.assert(listDom.lastChild === retainedRow)
console.assert(retainedRow.querySelector("input") === retainedInput)
```

The normalizer establishes this example's wire schema; adapt it to the application's contract. Normalize the entire snapshot before applying it. Retained records keep compatible object shape and field keys, so nested field updates leave the outer item State and row intact. An ID removed and later re-added is a new list entry. Controlled input values still follow the applied data; preserving a node does not define the application's policy for unsaved edits. Field DOM updates follow core scheduling; inspect values after the project's update flush. [Implementation: `replaceInternal`][source]; [core scheduling](vanjs-core.md).

## Apply compatible replacements and handle holes

Treat `replace(existingProxy, replacement)` as a full recursive replacement: update/add supplied fields and delete omitted fields. It returns the original proxy. Do not use it as a partial-patch merge. For a small patch, assign only intended fields through the proxy, or apply `replace` to the compatible nested object whose complete contents are supplied. Keep fixed optional fields present in normalized snapshots to avoid the deletion trap above. [Implementation: `replace` and `replaceInternal`][source].

For callback replacements, distinguish the two signatures:

| Existing collection | Callback receives | Callback returns |
|---|---|---|
| Array | A dense shallow array with holes removed | The replacement array |
| Keyed record | `[key, value]` entries | Replacement entries, in the intended order |

The callback inputs still contain the existing nested reactive values; they are not deep snapshots. In 0.6.3, positional replacement using those same object values can corrupt data: replacement mutates earlier positions before reading all the aliased sources, or shares nested proxies between positions. This can affect both reordering and filtering object rows. Build independent normalized row data, including nested mutable fields, before such positional updates, or keep entity identity in a keyed record. Primitive transforms and independent keyed snapshots do not have this aliasing problem.

Preserve array-versus-record kinds at every recursively updated field. **In 0.6.3, recursive `replace` does not reliably convert those kinds:** record-to-array can keep record shape, while array-to-record can throw after earlier mutations. Validate before applying; `replace` is not an atomic operation with rollback. When a field genuinely changes kind, assign the new field through its parent proxy and handle any affected list's lifetime explicitly. Keep `calc` fields and markers outside mutable snapshot targets and payloads. [Implementation: `replaceInternal`][source].

For bound arrays, distinguish entry deletion from truncation:

- `delete items[index]` and the list deleter leave a hole; later numeric keys remain unchanged. `length` includes those holes. Use `Object.keys(items).length` for present-entry count on an ordinary array without extra enumerable properties.
- `splice`, `shift`, and other index-moving operations retain JavaScript's positional semantics; they do not become entity-keyed operations.
- **Do not clear a bound list with `items.length = 0` in 0.6.3.** The length setter truncates the backing array without removing the existing row nodes. Use `vanX.replace(items, [])`; use `vanX.replace(itemsById, {})` for a record. If truncation has already left stale rows, repair that affected list's DOM lifetime as well as its data.
- `vanX.replace(values, current => current.filter(value => value !== ""))` safely filters a primitive-valued array into dense positions. For object rows whose positions change, first produce independent normalized replacement data as described above. For a keyed record, use `entries => entries.filter(([, item]) => !item.done)` to retain entity keys.

Preserve sparse collections while they are active if their indices identify rows. Compact a copy at an output boundary when the receiver expects a dense array. [Implementation: proxy setters/deletion, callback conversion, and row removal][source].

## Consume calculations inside reactive fields

Use `calc` as a marker on a function that VanX consumes while building a reactive field, or when adding a previously absent field. `calc(f)` alone does not create a calculated State. In 0.6.3, assigning that marker to an already-existing ordinary field stores the function instead of turning the field into a calculation. Keep calculations separate from mutable snapshot state, including where initialization would otherwise reference a proxy before it has been assigned. [Implementation: `calc`, `toState`, and the setter][source].

```js
import van from "vanjs-core"
import * as vanX from "vanjs-ext"

const {input, li, ul} = van.tags
const source = vanX.reactive({query: ""})
const countries = ["Argentina", "Brazil", "Chile"]
const view = vanX.reactive({
  matches: vanX.calc(() => countries.filter(country =>
    country.toLowerCase().includes(source.query.toLowerCase()))),
})
van.add(document.body,
  input({
    value: () => source.query,
    oninput: e => source.query = e.currentTarget.value,
  }),
  vanX.list(ul, view.matches, country => li(country)),
)
```

For compatible object/array results, VanX internally applies `replace` to retain the calculated collection's proxy. Keep the result kind stable across recalculations and treat it as read-only in application code. A calculated array that returns mutable source-row proxies can share them with its source; later positional replacement can then mutate source records. Return independent normalized data for such arrays, or use keyed results with intentional shared entity ownership. This example deliberately uses positional strings. Follow core's synchronous dependency-capture and scheduled-update rules for the calculation itself. [Implementation: `toState` and `reactive`][source]; [core tracking and scheduling](vanjs-core.md).

## Use raw and underlying states deliberately

Use `raw(proxy)` as a live view for untracked reads, including nested fields and structural reads. It is not a detached snapshot or a serializer. Write through the original proxy, not through the raw view: raw access uses temporary wrappers around existing State values and is not a supported mutation path. [Implementation: `rawStates` and `raw`][source].

```js
import van from "vanjs-core"
import * as vanX from "vanjs-ext"

const {span} = van.tags
const source = vanX.reactive({fixedBase: 10, delta: 1})
const view = vanX.reactive({
  total: vanX.calc(() => vanX.raw(source).fixedBase + source.delta),
})
van.add(document.body, span(() => view.total))
```

Here, changing `fixedBase` alone does not recalculate `total`; changing `delta` reads the current base. Use that exclusion only when it matches the intended data flow.

Use `stateFields(proxy)` when an API needs an underlying core State. It exposes one layer: `stateFields(model.profile).name` is the State for a nested name. A retained State can become stale when its property is deleted and re-added. Do not mutate the returned container's keys or use it to replace object values: doing so bypasses VanX's key bookkeeping or recursive conversion. Scalar `.val` assignment is appropriate, as in the color-input example; assign new objects through the collection proxy. [Published source][source] and [types][types].

## Handle opaque values and serialization

Apply `noreactive(value)` before insertion when a native or third-party value must remain opaque. It marks and returns the same object; interior mutations do not produce VanX field updates. Replace the containing field with a new marked value when replacement should be observable. The marker is a property written onto its input, so marking frozen or non-extensible objects can fail. Do not mark ordinary mutable records merely to suppress a symptom. [Implementation: `isObject` and `noreactive`][source].

Use `compact` to copy supported structures while removing array holes. In **0.6.3**, its precise boundaries are:

| Input | `compact` behavior |
|---|---|
| Array | Return a dense new array and recursively compact present entries; explicit `undefined` entries remain. This array branch also applies to an array marked `noreactive`. |
| Convertible non-array object | Copy enumerable own string-keyed fields recursively onto a new object with the original prototype. |
| Marked non-array object | Return the original object, preserving its identity. |
| Other excluded value, including a function or null-prototype record | Return it unchanged. |

Do not describe `compact` as a universal plain-object clone, alias-preserving graph copier, or JSON-safety guarantee. It does not support arbitrary cycles, convert native internal slots, or normalize custom prototypes. Array copies discard non-index properties; object copying does not preserve property descriptors or symbol-keyed fields. Use an explicit serializer for the application's transport schema. [Published `compact` implementation][source]; [0.6.3 release notes][release].

```js
import * as vanX from "vanjs-ext"

const data = vanX.reactive({
  rows: [{text: "discard"}, {text: "keep"}],
  fetchedAt: vanX.noreactive(new Date("2026-10-04T00:00:00Z")),
})
delete data.rows[0]
const payload = {
  rows: vanX.compact(data.rows),
  fetchedAt: data.fetchedAt.toISOString(),
}
const json = JSON.stringify(payload)
```

The active array remains sparse; the payload is dense and explicitly converts the Date to a string. Keep whole-graph copying at persistence/transport boundaries instead of ordinary UI reads. For HTML transport, apply the separate escaping rules in [Mini-Van SSR](minivan-ssr.md).

## Verify the transition being changed

Use the project's existing checks or a focused reproduction of the relevant case. For optional messages, exercise initially absent/empty → present → clear/delete → present. For snapshots, include reorder, removal, re-addition, and numeric-looking IDs; assert actual retained row and input node identity when required. For arrays, verify deletion, active count, and clearing. For object assignment or calculated collections, edit a nested field after the replacement and observe the intended update. Preserve the application's versions and test scope; the skill-maintenance baseline is not a dependency or testing requirement for every change.

## Sources

- [Official VanX documentation][docs].
- [Published 0.6.3 implementation][source] and [TypeScript declarations][types], pinned to its published commit.
- [Missing-property tracking report][missing-fields] and [fragment-row report][fragments].
- [VanX release notes, including 0.6.3][release].
- [Baseline versions and reproduction records](sources.md).

[docs]: https://vanjs.org/x/
[source]: https://github.com/vanjs-org/van/blob/5b40e4fc177054b11267326fb6d3d747dc6e9955/x/src/van-x.js
[types]: https://github.com/vanjs-org/van/blob/5b40e4fc177054b11267326fb6d3d747dc6e9955/x/src/van-x.d.ts
[missing-fields]: https://github.com/vanjs-org/van/issues/470
[fragments]: https://github.com/vanjs-org/van/issues/431
[release]: https://github.com/vanjs-org/van/discussions/311
