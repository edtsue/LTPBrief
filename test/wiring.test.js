/* The controller reaches into the page by id, and the page is hand-written
   HTML. Nothing in a no-build static site checks that the two agree — a
   renamed element leaves `el.thing` as null, and the failure surfaces as a
   button that does nothing, at whatever moment somebody first clicks it.

   That is the one class of bug here that would otherwise need a browser to
   find, which makes it the one most worth catching from a test. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const gate = fs.readFileSync(path.join(root, 'js/gate.js'), 'utf8');

const idsInHtml = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));

/* Ids the controller creates at runtime rather than finding in the markup. */
const MADE_AT_RUNTIME = new Set(['chaseBtn']);

function looked(src) {
  return [...src.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]);
}

test('every element the controller looks up exists in the page', () => {
  const missing = [...new Set(looked(app))]
    .filter(id => !idsInHtml.has(id) && !MADE_AT_RUNTIME.has(id));
  assert.deepEqual(missing, [], `app.js reaches for ids the page does not have: ${missing.join(', ')}`);
});

test('every element the gate looks up exists in the page', () => {
  const missing = [...new Set(looked(gate))].filter(id => !idsInHtml.has(id));
  assert.deepEqual(missing, [], `gate.js reaches for ids the page does not have: ${missing.join(', ')}`);
});

/* A script that loads after the one that reads it is a boot-order bug, and it
   presents as an empty page rather than an error anybody can act on. */
test('migrate loads before the controller that calls it', () => {
  const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map(m => m[1]);
  assert.ok(order.indexOf('migrate.js') > -1, 'migrate.js is never loaded');
  assert.ok(order.indexOf('migrate.js') < order.indexOf('app.js'),
    'app.js reads storage through Migrate on boot, so it cannot load first');
  assert.ok(order.indexOf('schema.js') < order.indexOf('app.js'),
    'everything reads SCHEMA');
});

/* The step's own mark, rather than the generic star every tool in the set
   uses. The module row already draws it for this tool; the header disagreed. */
test('the header wears the brief icon', () => {
  const brand = html.match(/<div class="brand">[\s\S]*?<\/div>/);
  assert.ok(brand, 'no brand block');
  assert.match(brand[0], /#ic-brief/);
});

test('the tool calls itself LTP Brief Intake', () => {
  assert.match(html, /<title>LTP Brief Intake<\/title>/);
  assert.match(html, /<span class="brandtext">LTP Brief Intake<\/span>/);
});

/* The favicon is drawn inline in the link tag rather than shared with the
   symbol, so the two can disagree — and did, for as long as the tab showed a
   blue tile beside a red one in the header. */
test('the favicon is the same colour as the icon it copies', () => {
  const symbol = html.match(/<symbol id="ic-brief"[\s\S]*?<\/symbol>/);
  assert.ok(symbol, 'no ic-brief symbol');
  const colour = symbol[0].match(/rx="14\.5" fill="(#[0-9A-Fa-f]{6})"/);
  assert.ok(colour, 'the symbol has no tile colour');
  const icon = html.match(/<link rel="icon"[^>]*>/);
  assert.ok(icon, 'no favicon');
  assert.ok(icon[0].toUpperCase().includes('%23' + colour[1].slice(1).toUpperCase()),
    `the tab draws a different tile from the header (${colour[1]})`);
});

/* A field type with no branch in the renderer does not error — it falls through
   to a plain text input. So a `budget` that lost its slider, or a `links` that
   lost its rows, would render as a single empty box and save a string, and the
   only symptom is a control that looks wrong to somebody who knew what it
   should be. */
test('every field type the schema uses has a renderer', () => {
  const vm = require('node:vm');
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'js/schema.js'), 'utf8') +
    '\n;globalThis.SCHEMA = SCHEMA;', ctx);

  const PLAIN = new Set(['text', 'textarea']);   // the fall-through, deliberately
  const used = new Set(ctx.SCHEMA.sections.flatMap(s => s.fields.map(f => f.type)));
  const missing = [...used].filter(t =>
    !PLAIN.has(t) && !new RegExp(`f\\.type === '${t}'`).test(app));
  assert.deepEqual(missing, [], `these render as a plain text box: ${missing.join(', ')}`);
});
