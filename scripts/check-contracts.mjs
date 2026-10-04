#!/usr/bin/env node
// Focused skill-maintenance checks against installed, unmodified package exports.
// Usage: node scripts/check-contracts.mjs --project /path/to/isolated/test-project
// Does not install packages, access the network, or modify the supplied project.
import assert from 'node:assert/strict';
import {readFileSync, realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const expected = {
  'vanjs-core': '1.6.1',
  'vanjs-ext': '0.6.3',
  'mini-van-plate': '0.6.3',
  jsdom: '26.1.0',
};
const report = {
  suite: 'vanjs-development-contracts',
  runtime: process.version,
  coverage: 'Node with jsdom; no real-browser or coding-agent evaluation',
  baseline: expected,
  checks: [],
};
let dom;
const savedGlobals = new Map();
const savedConsoleError = console.error;
const consoleErrors = [];
const ticks = async () => { await Promise.resolve(); await Promise.resolve(); };

function packageInfo(require, name) {
  const entry = realpathSync(require.resolve(name));
  for (let dir = dirname(entry); ; dir = dirname(dir)) {
    try {
      const data = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      if (data.name === name) return {entry, version: data.version};
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (dirname(dir) === dir) throw new Error(`Cannot locate ${name}'s package.json`);
  }
}

async function check(name, kind, run, expectedErrors = 0) {
  const errorsBefore = consoleErrors.length;
  try {
    await run();
    await ticks();
    assert.equal(consoleErrors.length - errorsBefore, expectedErrors, 'console.error count');
    report.checks.push({name, kind, status: 'passed'});
  } catch (error) {
    report.checks.push({name, kind, status: 'failed', error: error.message,
      consoleErrors: consoleErrors.slice(errorsBefore)});
  } finally {
    dom.window.document.body.replaceChildren();
    await ticks();
  }
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--project') {
    throw new Error('Usage: node check-contracts.mjs --project /path/to/test-project');
  }
  const project = resolve(args[1]);
  const require = createRequire(join(project, 'package.json'));
  const packages = Object.fromEntries(Object.keys(expected).map(name => [name, packageInfo(require, name)]));
  report.versions = Object.fromEntries(Object.entries(packages).map(([name, info]) => [name, info.version]));
  const mismatches = Object.entries(expected).filter(([name, version]) => packages[name].version !== version);
  if (mismatches.length) {
    throw new Error('Baseline mismatch; no behavior checks ran. Use the pinned test project or review '
      + 'the new versions before updating expectations: '
      + mismatches.map(([name, version]) => `${name}: expected ${version}, found ${packages[name].version}`).join('; '));
  }
  const extRequire = createRequire(packages['vanjs-ext'].entry);
  if (realpathSync(extRequire.resolve('vanjs-core')) !== packages['vanjs-core'].entry) {
    throw new Error('VanX resolves a different vanjs-core installation; use a deduplicated test project.');
  }
  const {JSDOM} = require('jsdom');
  dom = new JSDOM('<!doctype html><html><body></body></html>');
  for (const name of ['window', 'document', 'Node', 'Text']) {
    savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {configurable: true, writable: true, value: dom.window[name]});
  }
  const importFromProject = specifier => import(pathToFileURL(require.resolve(specifier)).href);
  const [{default: van}, vanX, {default: plate}, {default: mini}, shared] = await Promise.all([
    importFromProject('vanjs-core'), importFromProject('vanjs-ext'),
    importFromProject('mini-van-plate/van-plate'), importFromProject('mini-van-plate'),
    importFromProject('mini-van-plate/shared'),
  ]);
  const domVan = mini.vanWithDoc(document);
  const {div, span, p, input, ul, li, section} = van.tags;
  const mount = node => (van.add(document.body, node), node);
  console.error = (...args) => consoleErrors.push(args.map(arg => String(arg?.message ?? arg)).join(' '));

  await check('core.comment-placeholder-repeated-toggle', 'recipe', async () => {
    const open = van.state(false), anchor = document.createComment('when');
    const host = mount(div(() => open.val ? p('open') : anchor));
    for (const next of [true, false, true, false]) {
      open.val = next;
      await ticks();
      assert.equal(host.textContent, next ? 'open' : '');
      assert.equal(host.firstChild.isConnected, true);
      if (!next) assert.equal(host.firstChild, anchor);
    }
  });
  await check('core.hidden-preserves-input-node-and-value', 'recipe', async () => {
    const open = van.state(true), field = input({value: 'initial'});
    const host = mount(section({hidden: () => !open.val}, field));
    field.value = 'unsaved';
    open.val = false; await ticks(); assert.equal(host.hidden, true);
    open.val = true; await ticks();
    assert.equal(host.hidden, false); assert.equal(host.firstChild, field);
    assert.equal(field.value, 'unsaved');
  });
  await check('core.null-removal-does-not-reappear', 'known-limitation', async () => {
    const open = van.state(true), value = van.state(null);
    const host = mount(div(() => open.val ? p('open') : null, value));
    open.val = false; await ticks();
    open.val = true; value.val = 'later'; await ticks();
    assert.equal(host.childNodes.length, 0);
  });
  await check('core.reactive-fragment-loses-binding', 'known-limitation', async () => {
    const text = van.state('first'); let calls = 0;
    const host = mount(div(() => {
      calls++;
      const fragment = document.createDocumentFragment(); fragment.append(p(text.val));
      return fragment;
    }));
    text.val = 'second'; await ticks();
    assert.equal(calls, 1); assert.equal(host.textContent, 'first');
  });
  await check('core.detached-subtree-loses-binding', 'known-limitation', async () => {
    const text = van.state('first'), child = p(text), host = mount(div(child));
    child.remove(); text.val = 'second'; await ticks();
    host.append(child); text.val = 'third'; await ticks();
    assert.equal(child.textContent, 'first');
  });
  await check('core.derived-values-update-after-microtask', 'contract', async () => {
    const source = van.state(1), double = van.derive(() => source.val * 2);
    assert.equal(double.val, 2);
    source.val = 2; assert.equal(double.val, 2);
    await Promise.resolve(); assert.equal(double.val, 4);
  });
  await check('core.reentrant-binding-needs-later-batch', 'known-limitation', async () => {
    const a = van.state(0), b = van.state(0);
    const host = mount(div(span(b), () => { b.val = a.val; return ''; }));
    a.val = 1;
    await Promise.resolve(); assert.equal(host.textContent, '0');
    await Promise.resolve(); assert.equal(host.textContent, '1');
  });
  await check('core.written-state-excluded-from-dependencies', 'contract', async () => {
    const count = van.state(0), seen = [];
    van.derive(() => { seen.push(count.val); count.val = count.val; });
    count.val = 1; await ticks(); assert.deepEqual(seen, [0]);
  });
  await check('core.derive-returned-function-is-not-cleanup', 'contract', async () => {
    const count = van.state(0); let runs = 0, cleanups = 0;
    const result = van.derive(() => { count.val; runs++; return () => cleanups++; });
    count.val++; await ticks();
    assert.equal(runs, 2); assert.equal(cleanups, 0); assert.equal(typeof result.val, 'function');
  });
  await check('core.read-after-await-is-untracked', 'known-limitation', async () => {
    const count = van.state(0); let runs = 0;
    const result = van.derive(async () => { runs++; await Promise.resolve(); return count.val; });
    assert.equal(await result.val, 0);
    count.val = 1; await ticks();
    assert.equal(runs, 1); assert.equal(await result.val, 0);
  });
  await check('core.binding-errors-logged-and-previous-node-kept', 'contract', async () => {
    const fail = van.state(false);
    const host = mount(div(() => { if (fail.val) throw new Error('expected binding failure'); return 'old'; }));
    fail.val = true; await ticks();
    assert.equal(host.textContent, 'old');
    assert.equal(consoleErrors.at(-1), 'expected binding failure');
  }, 1);

  await check('vanx.absent-field-and-delete-readd-stay-stale', 'known-limitation', async () => {
    const missing = vanX.reactive({}), existing = vanX.reactive({title: 'old'});
    const a = mount(div(() => missing.title ?? 'missing'));
    const b = mount(div(() => existing.title ?? 'missing'));
    missing.title = 'added'; delete existing.title; await ticks();
    existing.title = 'new'; await ticks();
    assert.equal(a.textContent, 'missing'); assert.equal(b.textContent, 'old');
  });
  await check('vanx.initialized-field-remains-reactive', 'recipe', async () => {
    const errors = vanX.reactive({email: ''}), host = mount(span(() => errors.email));
    errors.email = 'Invalid email'; await ticks(); assert.equal(host.textContent, 'Invalid email');
    errors.email = ''; await ticks(); assert.equal(host.textContent, '');
  });
  await check('vanx.structural-read-tracks-add-delete-readd', 'recipe', async () => {
    const data = vanX.reactive({});
    const host = mount(div(() => { Object.keys(data); return data.title ?? 'missing'; }));
    data.title = 'added'; await ticks(); assert.equal(host.textContent, 'added');
    delete data.title; await ticks(); assert.equal(host.textContent, 'missing');
    data.title = 'again'; await ticks(); assert.equal(host.textContent, 'again');
  });
  await check('vanx.array-length-truncation-leaves-rows', 'known-limitation', async () => {
    const items = vanX.reactive([1, 2]), host = mount(vanX.list(ul, items, s => li(s)));
    items.length = 0; await ticks();
    assert.equal(items.length, 0); assert.equal(host.children.length, 2);
  });
  await check('vanx.replace-clears-connected-list', 'recipe', async () => {
    const items = vanX.reactive([1, 2]), host = mount(vanX.list(ul, items, s => li(s)));
    vanX.replace(items, []); await ticks();
    assert.equal(items.length, 0); assert.equal(host.children.length, 0);
  });
  await check('vanx.parent-reassignment-retains-old-list-source', 'known-limitation', async () => {
    const data = vanX.reactive({items: [1]});
    const host = mount(vanX.list(ul, data.items, s => li(s)));
    data.items = [2, 3]; await ticks(); assert.equal(host.textContent, '1');
  });
  await check('vanx.replace-retains-list-source', 'recipe', async () => {
    const data = vanX.reactive({items: [1]}), original = data.items;
    const host = mount(vanX.list(ul, data.items, s => li(s)));
    vanX.replace(data.items, [2, 3]); await ticks();
    assert.equal(data.items, original); assert.equal(host.textContent, '23');
  });
  await check('vanx.primitive-and-fragment-rows-break-deletion', 'known-limitation', async () => {
    for (const row of [s => s.val, s => {
      const fragment = document.createDocumentFragment(); fragment.append(li(s)); return fragment;
    }]) {
      const items = vanX.reactive(['A']); mount(vanX.list(ul, items, row));
      assert.throws(() => { delete items[0]; }, TypeError);
    }
  });
  await check('vanx.persistent-element-rows-support-edit-and-delete', 'recipe', async () => {
    const items = vanX.reactive({a: {text: 'A'}, b: {text: 'B'}});
    const host = mount(vanX.list(ul, items, ({val: item}) => li(() => item.text)));
    const a = host.firstChild;
    items.a.text = 'updated'; await ticks();
    assert.equal(host.firstChild, a); assert.equal(a.textContent, 'updated');
    delete items.a; await ticks(); assert.equal(host.textContent, 'B'); assert.equal(a.isConnected, false);
  });
  await check('vanx.row-state-assignment-bypasses-deep-reactivity', 'known-limitation', async () => {
    const items = vanX.reactive([{text: 'A'}]); let rowState;
    const host = mount(vanX.list(ul, items, s => { rowState = s; return li(() => s.val.text); }));
    rowState.val = {text: 'B'}; await ticks();
    items[0].text = 'C'; await ticks();
    assert.equal(host.textContent, 'B'); assert.equal(vanX.stateFields(items[0]), undefined);
  });
  await check('vanx.collection-assignment-converts-new-object', 'recipe', async () => {
    const items = vanX.reactive([{text: 'A'}]);
    const host = mount(vanX.list(ul, items, s => li(() => s.val.text)));
    items[0] = {text: 'B'}; await ticks(); items[0].text = 'C'; await ticks();
    assert.equal(host.textContent, 'C'); assert.ok(vanX.stateFields(items[0]));
  });
  await check('vanx.array-index-versus-record-key-identity', 'contract', async () => {
    const rows = vanX.reactive([{id: 'a'}, {id: 'b'}]);
    const arrayHost = mount(vanX.list(ul, rows, s => li(() => s.val.id)));
    const first = arrayHost.firstChild;
    vanX.replace(rows, [{id: 'b'}, {id: 'a'}]); await ticks();
    assert.equal(arrayHost.firstChild, first); assert.equal(first.textContent, 'b');
    const snapshot = records => Object.fromEntries(records.map(record => [`id:${record.id}`, {...record}]));
    const data = vanX.reactive({rows: snapshot([
      {id: '10', text: 'A'}, {id: '2', text: 'B'}, {id: 'old', text: 'Removed'},
    ])});
    const bound = data.rows;
    const keyedHost = mount(vanX.list(ul, bound, ({val: item}) => li(
      {'data-id': item.id}, input({value: () => item.text,
        oninput: event => item.text = event.currentTarget.value}),
    )));
    const original = new Map([...keyedHost.children].map(node => [node.dataset.id, node]));
    const inputs = new Map([...original].map(([id, node]) => [id, node.firstChild]));
    assert.deepEqual([...keyedHost.children].map(node => node.dataset.id), ['10', '2', 'old']);
    vanX.replace(data.rows, snapshot([
      {id: '2', text: 'B updated'}, {id: '3', text: 'C'}, {id: '10', text: 'A updated'},
    ])); await ticks();
    assert.equal(data.rows, bound);
    assert.deepEqual([...keyedHost.children].map(node => node.dataset.id), ['2', '3', '10']);
    for (const [index, id, text] of [[0, '2', 'B updated'], [2, '10', 'A updated']]) {
      assert.equal(keyedHost.children[index], original.get(id));
      assert.equal(keyedHost.children[index].firstChild, inputs.get(id));
      assert.equal(inputs.get(id).value, text);
    }
    assert.equal(original.get('old').isConnected, false);
    inputs.get('2').value = 'Edited after refresh';
    inputs.get('2').dispatchEvent(new dom.window.Event('input', {bubbles: true})); await ticks();
    assert.equal(bound['id:2'].text, 'Edited after refresh');
    vanX.replace(data.rows, {}); await ticks();
    assert.equal(data.rows, bound); assert.equal(keyedHost.children.length, 0);
  });
  await check('vanx.object-array-aliasing-and-detached-replacements', 'known-limitation', async () => {
    const initial = () => [{id: 'a', details: {label: 'A'}}, {id: 'b', details: {label: 'B'}}];
    const normalize = rows => rows.map(({id, details: {label}}) => ({id, details: {label}}));
    const aliased = vanX.reactive(initial());
    vanX.replace(aliased, current => current.slice().reverse());
    assert.deepEqual(normalize(aliased), [
      {id: 'b', details: {label: 'B'}}, {id: 'b', details: {label: 'B'}},
    ]);
    const detached = vanX.reactive(initial());
    vanX.replace(detached, current => normalize(current).reverse());
    assert.deepEqual(normalize(detached), initial().reverse());

    const filterInitial = () => [
      {id: 0, done: true}, {id: 1, done: false, meta: {label: 'B'}},
      {id: 2, done: false, meta: {label: 'C'}},
    ];
    const detachFilterRows = rows => rows.map(({id, done, meta}) =>
      ({id, done, ...(meta ? {meta: {label: meta.label}} : {})}));
    const filtered = vanX.reactive(filterInitial());
    vanX.replace(filtered, current => current.filter(row => !row.done));
    assert.deepEqual(detachFilterRows(filtered), [
      {id: 1, done: false, meta: {label: 'C'}}, {id: 2, done: false, meta: {label: 'C'}},
    ]);
    const detachedFiltered = vanX.reactive(filterInitial());
    vanX.replace(detachedFiltered, current => detachFilterRows(current).filter(row => !row.done));
    assert.deepEqual(detachFilterRows(detachedFiltered), filterInitial().filter(row => !row.done));

    const source = vanX.reactive([{id: 1}, {id: 2}]), cutoff = van.state(0);
    const view = vanX.reactive({rows: vanX.calc(() => source.filter(row => row.id > cutoff.val))});
    cutoff.val = 1; await ticks();
    assert.deepEqual(source.map(row => row.id), [2, 2]);
    assert.deepEqual(view.rows.map(row => row.id), [2]);
    const safeSource = vanX.reactive([{id: 1}, {id: 2}]), safeCutoff = van.state(0);
    const safeView = vanX.reactive({rows: vanX.calc(() =>
      safeSource.filter(row => row.id > safeCutoff.val).map(({id}) => ({id})))});
    const originalView = safeView.rows;
    safeCutoff.val = 1; await ticks();
    assert.equal(safeView.rows, originalView);
    assert.deepEqual(safeSource.map(row => row.id), [1, 2]);
    assert.deepEqual(safeView.rows.map(row => row.id), [2]);
  });
  await check('vanx.compact-preserves-prototype-and-opaque-identity', 'contract', () => {
    class Person { constructor() { this.name = 'A'; } }
    const opaque = vanX.noreactive(new Date('2025-01-01T00:00:00Z'));
    const opaqueArray = vanX.noreactive([1, , 3]);
    const data = vanX.reactive({person: new Person(), opaque, opaqueArray, sparse: [1, , 3]});
    const copy = vanX.compact(data);
    assert.notEqual(copy, data); assert.ok(copy.person instanceof Person);
    assert.equal(copy.opaque, opaque); assert.deepEqual(copy.sparse, [1, 3]);
    assert.equal(data.opaqueArray, opaqueArray);
    assert.notEqual(copy.opaqueArray, opaqueArray); assert.deepEqual(copy.opaqueArray, [1, 3]);
    assert.equal(1 in opaqueArray, false);
  });

  await check('mini.snapshot-props-and-render-time-children', 'contract', () => {
    const value = plate.state('old'), tree = plate.tags.div({title: value}, value);
    value.val = 'new'; assert.equal(tree.render(), '<div title="old">new</div>');
    const clientValue = domVan.state('old'), node = domVan.tags.div(clientValue);
    clientValue.val = 'new'; assert.equal(node.textContent, 'old');
  });
  await check('mini.null-compatibility-table', 'known-limitation', () => {
    assert.equal(plate.tags.div(null).render(), '<div></div>');
    assert.equal(domVan.tags.div(null).outerHTML, '<div></div>');
    assert.throws(() => plate.tags.div(() => null).render(), TypeError);
    assert.throws(() => plate.tags.div(plate.state(null)).render(), TypeError);
    assert.equal(domVan.tags.div(() => null).outerHTML, '<div></div>');
    assert.equal(domVan.tags.div(domVan.state(null)).outerHTML, '<div></div>');
    assert.equal(plate.tags.div({title: null}).render(), '<div title="null"></div>');
    assert.throws(() => domVan.tags.div({title: null}), TypeError);
    assert.equal(plate.tags.div(() => '').render(), '<div></div>');
    assert.equal(domVan.tags.div(() => '').outerHTML, '<div></div>');
  });
  await check('mini.ordinary-handler-omitted-async-handler-serialized', 'known-limitation', () => {
    for (const renderer of [plate, domVan]) {
      const html = node => node.render ? node.render() : node.outerHTML;
      assert.equal(html(renderer.tags.button({onclick: () => 1})), '<button></button>');
      assert.match(html(renderer.tags.button({onclick: async () => 1})), /onclick=/);
      const save = async () => 1;
      assert.equal(html(renderer.tags.button({onclick: event => save(event)})), '<button></button>');
    }
  });
  await check('mini.boolean-attributes-and-explicit-aria-strings', 'known-limitation', () => {
    assert.equal(plate.tags.input({disabled: false}).render(), '<input>');
    assert.equal(domVan.tags.input({disabled: false}).disabled, true);
    assert.equal(plate.tags.div({'aria-expanded': false}).render(), '<div></div>');
    for (const renderer of [plate, domVan]) {
      const node = renderer.tags.div({'aria-expanded': 'false'});
      assert.equal(node.render ? node.render() : node.outerHTML, '<div aria-expanded="false"></div>');
    }
  });
  await check('mini.raw-json-attribute-does-not-round-trip', 'known-limitation', () => {
    const payload = {message: 'a "quoted" word\nnext line'};
    const template = document.createElement('template');
    template.innerHTML = plate.tags.div({'data-state': JSON.stringify(payload)}).render();
    assert.throws(() => JSON.parse(template.content.firstChild.dataset.state), SyntaxError);
    const value = 'A \\ B';
    template.innerHTML = plate.tags.input({value}).render();
    assert.equal(template.content.firstChild.value, 'A \\\\ B');
    assert.notEqual(template.content.firstChild.value, value);
  });
  await check('mini.encoded-attribute-and-json-script-round-trip', 'recipe', () => {
    const payload = {message: 'a "quoted" word\nnext line', extra: 'A &amp; B \\ C </script><script> D 😀'};
    const template = document.createElement('template');
    template.innerHTML = plate.tags.div({'data-state': encodeURIComponent(JSON.stringify(payload))}).render();
    assert.deepEqual(JSON.parse(decodeURIComponent(template.content.firstChild.dataset.state)), payload);
    const scriptData = JSON.stringify(payload).replace(/</g, '\\u003c');
    template.innerHTML = plate.tags.script({type: 'application/json'}, scriptData).render();
    assert.equal(template.content.querySelectorAll('script').length, 1);
    assert.deepEqual(JSON.parse(template.content.firstChild.textContent), payload);
  });
  await check('mini.dummy-adapter-noops-and-snapshots', 'known-limitation', () => {
    const {registerEnv, dummyVanX} = shared; registerEnv({van: plate, vanX: dummyVanX});
    const items = dummyVanX.reactive({});
    assert.equal(dummyVanX.replace(items, {a: 1}), items); assert.deepEqual(items, {});
    const sparse = [1, , 3]; assert.equal(dummyVanX.compact(sparse), sparse);
    assert.equal(1 in dummyVanX.compact(sparse), false);
    const object = {count: 0}, fields = dummyVanX.stateFields(object);
    object.count = 1; assert.equal(fields.count.val, 0);
    const rows = {a: 'A'}; let remove;
    dummyVanX.list(plate.tags.ul, rows, (s, deleter) => { remove = deleter; return plate.tags.li(s); });
    remove(); assert.deepEqual(rows, {a: 'A'});
  });
  report.passed = report.checks.filter(item => item.status === 'passed').length;
  report.failed = report.checks.length - report.passed;
  report.status = report.failed ? 'failed' : 'passed';
  process.exitCode = report.failed ? 1 : 0;
} catch (error) {
  report.status = 'setup-error'; report.error = error.message; process.exitCode = 2;
} finally {
  console.error = savedConsoleError;
  dom?.window.close();
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  // Upstream's short-lived internal GC timers may finish naturally after output.
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
