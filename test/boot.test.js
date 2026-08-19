/* ACTUALLY RUN THE PAGE.
 *
 * The wiring suite checks that every id the controller reaches for exists, and
 * that every field type has a renderer. Both passed while the page shipped
 * blank: `let data = load()` ran before `let migrated` was initialised, the
 * controller threw on its first line of work, and every static check still
 * agreed the file was fine.
 *
 * Nothing catches that except running it. So this boots the real controller
 * against a stub DOM — no browser, no dependency — and asserts it renders. A
 * stub is a poor imitation of a browser and will never prove the page looks
 * right; it proves the code runs, which is the failure that actually shipped.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function node(tag) {
  const n = {
    tagName: String(tag || 'div').toUpperCase(), nodeType: 1, children: [], childNodes: [],
    style: { setProperty() {}, removeProperty() {} }, dataset: {}, attributes: {},
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, on) { (on === undefined ? this._s.has(c) : !on) ? this._s.delete(c) : this._s.add(c); },
      contains(c) { return this._s.has(c); }
    },
    appendChild(c) { this.children.push(c); this.childNodes.push(c); return c; },
    append(...cs) { cs.forEach(c => this.appendChild(c)); },
    prepend() {}, insertBefore(c) { return this.appendChild(c); }, removeChild() {}, remove() {},
    addEventListener() {}, removeEventListener() {},
    setAttribute(k, v) { this.attributes[k] = v; }, getAttribute(k) { return this.attributes[k]; },
    removeAttribute() {}, focus() {}, click() {}, scrollIntoView() {}, after() {}, before() {},
    /* THIS IS NOT A SELECTOR ENGINE, and it does not pretend to be one. The
       controller writes markup with innerHTML and then reaches into it; a stub
       that answered null there would fail the boot on its own inadequacy
       rather than on anything wrong with the page, which is how a test like
       this becomes noise and then gets deleted.

       The cost is real and worth naming: a genuine null-dereference on a
       missing element cannot be caught here. `test/wiring.test.js` covers the
       ids; this covers whether the code runs. */
    querySelector() { return node('div'); },
    querySelectorAll() { return [node('div')]; },
    closest() { return node('div'); },
    cloneNode() { return node(tag); }, contains() { return false; },
    set innerHTML(v) { this._html = v; this.children = []; this.childNodes = []; },
    get innerHTML() { return this._html || ''; },
    set textContent(v) { this._text = v; }, get textContent() { return this._text || ''; },
    set value(v) { this._v = v; }, get value() { return this._v || ''; },
    set disabled(v) { this._d = v; }, get disabled() { return !!this._d; },
    set hidden(v) { this._h = v; }, get hidden() { return !!this._h; }
  };
  return n;
}

/* Boot the controller. `saved` is what is already in this browser's storage. */
function boot(saved) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const byId = {};
  [...html.matchAll(/\bid="([^"]+)"/g)].forEach(m => { byId[m[1]] = node('div'); });

  const store = {};
  if (saved) store['ltpbrief.v1'] = JSON.stringify(saved);

  const sandbox = {
    console, JSON, Math, Date, Object, Array, String, Number, Boolean, Promise,
    Error, Set, Map, RegExp, isNaN, isFinite, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent, setTimeout, clearTimeout, setInterval, clearInterval,
    document: {
      getElementById: id => byId[id] || null,
      createElement: node, createTextNode: t => ({ nodeType: 3, textContent: t }),
      querySelector: () => null, querySelectorAll: () => [],
      addEventListener() {}, body: node('body'), documentElement: node('html'), head: node('head')
    },
    window: {
      addEventListener() {}, scrollTo() {},
      matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
      getComputedStyle: () => ({}), location: { href: '', host: 'test' }
    },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; }
    },
    navigator: { userAgent: 'node' },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' }),
    requestAnimationFrame: cb => setTimeout(cb, 0),
    IntersectionObserver: class { observe() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    Blob: class {}, FileReader: class {},
    URL: { createObjectURL: () => '', revokeObjectURL() {} },
    alert() {}, confirm: () => true
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  for (const f of ['js/schema.js', 'js/gemini.js', 'js/migrate.js', 'js/brief.js', 'js/app.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
  }
  return { byId, store };
}

test('the controller boots without throwing', () => {
  assert.doesNotThrow(() => boot(null));
});

test('booting draws a field for every section', () => {
  const { byId } = boot(null);
  const SCHEMA = require(path.join(root, 'js/schema.js')).SCHEMA;
  assert.equal(byId.fields.children.length, SCHEMA.sections.length,
    'the page should hold one block per section');
});

test('booting fills the rail with the sections', () => {
  const { byId } = boot(null);
  const SCHEMA = require(path.join(root, 'js/schema.js')).SCHEMA;
  const named = byId.steps.children.filter(c => c.dataset && c.dataset.sec);
  assert.deepEqual(named.map(c => c.dataset.sec), SCHEMA.sections.map(s => s.id));
});

/* The migration runs on the way in and is written straight back. If it only
   lived in memory it would run again next load and append the parked answers a
   second time. */
test('an old brief opens, and is saved back in its new shape once', async () => {
  const { store } = boot({ kpiAwareness: 'Ad recall +4pt', commsStrategy: 'Belief, not awareness' });
  /* Saving is debounced, so the rewrite lands a beat after boot rather than
     during it. Worth knowing: a tab closed inside that beat keeps the old
     shape, and simply migrates again next time. */
  await new Promise(r => setTimeout(r, 600));
  const saved = JSON.parse(store['ltpbrief.v1']);
  assert.match(saved.brRequirements, /Ad recall \+4pt/);
  assert.match(saved.researchNotes, /Belief, not awareness/);
  assert.ok(!('kpiAwareness' in saved));

  const again = JSON.parse(JSON.stringify(saved));
  const { store: second } = boot(again);
  await new Promise(r => setTimeout(r, 600));
  assert.equal(JSON.parse(second['ltpbrief.v1']).brRequirements, saved.brRequirements,
    'a second load must not append the same answers again');
});
