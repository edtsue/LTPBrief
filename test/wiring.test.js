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

/* The host serves the repo root on a no-build static site: anything committed
   is fetchable unless it is kept out of the deployment. index.html, css/ and
   js/ are meant to be public. Design notes and the test suite are not — this
   is a URL a client is sent. */
test('nothing but the site itself is shipped to the host', () => {
  const ignored = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8')
    .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  ['docs', 'test'].forEach(dir =>
    assert.ok(ignored.includes(dir), `${dir}/ would be readable at ${dir}/… in production`));
});

/* ── the module bar's sliding strip ──────────────────────────────────────
 *
 * Going somewhere else, stepping sideways out of the process, and the light in
 * the room. Three jobs, none of them about the answers on this page, so they
 * travel together on a rail that can slide shut — OPEN by default, because
 * being seen is the whole reason they are up here.
 *
 * The fold is `js/strip.js` and `css/strip.css`, shared with the other planning
 * modules. Its own behaviour is tested in the repo it was extracted from; what
 * these check is that the copy has not been edited on the way in, and that this
 * page hands it what it needs.
 */

test('the shared fold is a copy, not a fork', () => {
  /* ⚠️ THE WHOLE POINT IS THAT IT IS THE SAME FILE. A copy edited on the way
     in stops being a copy, and the next fix has to be found and re-made in
     however many repos took one. Both files declare what they need — a key
     prefix, four colour variables — so nothing about this module has to be
     written into them. */
  const js = fs.readFileSync(path.join(root, 'js/strip.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'css/strip.css'), 'utf8');
  assert.ok(!/ltpbrief/.test(js), 'the shared component has this module\'s storage keys baked in');
  assert.ok(!/--(?!strip-)[a-z]/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')),
    'the shared stylesheet reaches for a variable that is not its own');
});

test('the page loads the fold, and loads it before the controller', () => {
  const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.ok(order.includes('js/strip.js'), 'the fold is never loaded, so the bar cannot fold');
  assert.ok(order.indexOf('js/strip.js') < order.indexOf('js/app.js'),
    'app.js wires the strip and would run first');
  assert.match(html, /<link rel="stylesheet" href="css\/strip\.css"/,
    'the fold has no stylesheet, so it collapses with no animation');
});

test('this page maps the four colours the shared stylesheet asks for', () => {
  const css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  ['--strip-line', '--strip-ink', '--strip-ink3', '--strip-focus'].forEach(v =>
    assert.match(css, new RegExp(`${v}\\s*:`), `${v} is never given a value, so the fold is unstyled`));
});

test('the chip that says which plan this is does not fold away with the rest', () => {
  /* Whose plan this is stays on screen however folded everything beside it
     gets. It is outside `#hdStrip` on purpose. */
  const bar = html.slice(html.indexOf('class="modbar"'), html.indexOf('id="hdStripTog"'));
  const strip = bar.slice(bar.indexOf('id="hdStrip"'));
  assert.ok(bar.includes('id="paChip"'), 'there is nowhere to say which plan this is');
  assert.ok(!strip.includes('id="paChip"'), 'the plan chip folds away with the module row');
});

test('the plan chip stays hidden until there is a plan to name', () => {
  /* ⚠️ `hidden` ALONE DOES NOTHING HERE. An author `display` beats the
     browser's own `[hidden]{display:none}`, so a chip given `display:flex` by
     any rule would sit there empty on every page that has no plan yet. */
  const css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  assert.match(html, /id="paChip"[^>]*hidden/, 'the empty chip is on screen from the first load');
  assert.match(css, /\.pachip\[hidden\]\s*\{\s*display:\s*none/,
    'the hidden attribute is inert against this page\'s own display rule');
});

test('what is not about this brief travels on the strip', () => {
  const strip = html.slice(html.indexOf('id="hdStrip"'), html.indexOf('id="hdStripTog"'));
  ['<nav class="modnav"', 'id="kesselGo"', 'id="themeToggle"'].forEach(k =>
    assert.ok(strip.includes(k), `${k} is not on the strip`));
  /* And what IS about it stays in the rail. The tour explains this page and
     the save state is this page's, so neither folds away. */
  const foot = html.slice(html.indexOf('class="rail-foot"'), html.indexOf('</aside>'));
  ['id="tourBtn"', 'id="saveState"'].forEach(k =>
    assert.ok(foot.includes(k), `${k} left the rail`));
});

test('the demonstration waits for the door, exactly as the tour does', () => {
  /* ⚠️ WHETHER THERE IS A GATE ARRIVES OVER THE NETWORK. A fold performed at
     boot lands behind the lock screen, and a demonstration nobody sees is
     spent, marked taught, and never shown again. */
  assert.match(app, /ltp:unlocked'[\s\S]{0,120}Strip\.teach\(/,
    'the strip demonstrates itself behind the lock screen');
  assert.ok(!/Strip\.init[\s\S]{0,400}Strip\.teach/.test(app),
    'the strip is taught from init, which runs at boot');
});

test('the strip holds still while the tour is measuring the bar', () => {
  /* The tour rings a rect it has already taken; a bar that reflows underneath
     leaves the ring around nothing. The overlay is in the document for exactly
     as long as the tour runs, which is what `hold` watches. */
  assert.match(app, /hold:[\s\S]{0,120}querySelector\('\.tour'\)/,
    'the bar can reflow under a tour ring');
  assert.match(app, /overlay\.className = 'tour'/,
    'the tour no longer marks itself the way the strip watches for');
});

test('the theme switch kept its two states and its stored value', () => {
  /* It moved onto the bar and the label became an icon. That is all that
     changed — a third state, or a new key, would silently reset everybody. */
  assert.match(app, /THEME_KEY = 'ltpbrief\.theme'/, 'the theme moved to a key nobody has');
  assert.match(app, /aria-checked/, 'the switch stopped reporting its state');
  assert.ok(!/'system'/.test(app.slice(app.indexOf('---------- theme'), app.indexOf('module bar'))),
    'the theme grew a third state it was not asked for');
});
