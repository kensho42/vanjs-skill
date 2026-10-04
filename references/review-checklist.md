# Review and Verification Checklist

Use only the sections relevant to the task. Record findings with their observable consequence and the smallest supported correction. If the user requested a review, keep the result a review.

## Establish the contract

- [ ] Identify the installed versions, entry points, local/CDN copies, and update helper.
- [ ] Identify the renderer and which state or DOM identity must survive.
- [ ] Preserve project architecture, module conventions, dependencies, and unrelated code.
- [ ] Separate version-specific runtime evidence from assumptions based on documentation or types.

## Core bindings and lifetime

- [ ] Reactive reads occur in the callback that consumes them. Captured primitives and `rawVal` reads are intentional.
- [ ] Core objects/arrays are replaced when changes must notify bindings; nested mutation is not assumed reactive.
- [ ] Rendering and derivation callbacks return synchronously. Async work writes results into state and handles relevant failures/races.
- [ ] Read/write dependency exclusion does not unintentionally stop future updates.
- [ ] A reactive child returns a suitable primitive or persistent node. Arrays/fragments are not treated as persistent reactive roots.
- [ ] Current-node returns are accepted. A different returned node is disconnected before replacement.
- [ ] Construction and attachment are synchronous enough for the connected-node lifetime model.
- [ ] Resource cleanup is explicit; a returned derive function is not mistaken for disposal.
- [ ] Event properties, attributes, native properties, and namespaces use their actual DOM semantics.

## Conditional rendering

- [ ] The implementation chooses persistent hiding, remounting, or terminal deletion deliberately.
- [ ] Initially hidden and repeated hide/show paths behave correctly.
- [ ] Preserved inputs retain actual node identity and the required live state.
- [ ] Remountable absence retains an anchor; terminal `null`/`undefined` is not used as a temporary placeholder.
- [ ] Direct-State children obey the same terminal-null boundary.
- [ ] A disconnected cached reactive subtree is not assumed to keep all bindings alive.
- [ ] `false` does not appear as unintended visible text.

## VanX fields and collections

- [ ] Code uses returned proxies, with original aliases and opaque values handled deliberately.
- [ ] Optional fixed fields exist before binding; clear operations retain their reactive field States.
- [ ] Dynamic-key consumers read structure where additions/deletions must trigger updates.
- [ ] Tracked callback destructuring remains allowed; stale captures outside the consuming binding are corrected.
- [ ] The list remains bound to its original collection proxy or an explicitly managed new list.
- [ ] If the feature requires retained row/input identity, snapshots update that collection without rebuilding retained nodes.
- [ ] Entity identity, array index identity, and display order are distinguished; numeric-looking IDs are included where relevant.
- [ ] Clear, delete, empty, repopulate, and reorder transitions update the mounted DOM.
- [ ] List callbacks return persistent nodes. Whole records are assigned through the proxy, not directly through an exposed State.
- [ ] Replacement shapes are compatible; full replacement is not mistaken for a partial patch.
- [ ] Calculated fields and initialization avoid self-reference and accidental replacement.
- [ ] `raw`, `stateFields`, `noreactive`, and `compact` are used within their precise contracts, including array and custom-prototype behavior.

## Mini-Van and hydration

- [ ] Text/DOM snapshot timing fits the data-preparation order.
- [ ] Entry points register stable renderers and components resolve the environment after registration.
- [ ] Request state stays local; dummy adapter mutation helpers are not expected to update server output reactively.
- [ ] Shared ordinary function handlers are omitted as intended, and async/generator source is not serialized into event attributes.
- [ ] Parsed HTML has the intended HTML boolean properties and string-valued ARIA/data attributes.
- [ ] Direct nullish children, function/State nullish results, and nullish properties are checked separately.
- [ ] Complex serialized state round-trips quotes, backslashes, entity text, line breaks, Unicode, and closing-script text.
- [ ] Raw script/style bodies do not contain untrusted executable content.
- [ ] Transported state and live form values are read before hydration replaces the root.
- [ ] The code does not assume that `van.hydrate` returns the replacement node.
- [ ] Parsed server output and post-hydration interaction are both exercised when the handoff changes.

## Evidence and finish

- [ ] Relevant project checks passed; unexpected console errors are failures, even if old output remains visible.
- [ ] Assertions inspect live values, checked state, attributes, and strict node identity where those are the feature's contract.
- [ ] Scheduler waits match the installed version and affected callback chain.
- [ ] Real-browser claims are backed by real-browser checks. Node/jsdom results are labeled accordingly.
- [ ] The final response explains what changed, why, what was verified, and any material unverified behavior.

Read the relevant [core](vanjs-core.md), [conditional](conditional-rendering.md), [VanX](vanx.md), and [Mini-Van](minivan-ssr.md) sections for the reasoning behind these checks. [Sources](sources.md) lists the verified implementations and maintenance procedures.
