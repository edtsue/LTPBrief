/* The export is the whole handoff to LTP Strategy. Everything else on the page
   is in service of this file being right.

   Two readers, and they want opposite things. A strategist and the model they
   drop it on read the prose. A future version of Strategy's start screen reads
   the block at the foot and registers the plan from it without anybody
   retyping four fields. The block has to be machine-exact and it has to stay
   out of the prose's way. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function load() {
  const ctx = vm.createContext({});
  const src = ['js/schema.js', 'js/brief.js']
    .map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  vm.runInContext(src + '\n;globalThis.SCHEMA = SCHEMA; globalThis.Brief = Brief;', ctx);
  return ctx;
}

const FILLED = {
  region: 'na', market: 'USA', productArea: 'Gemini', cycle: '2027 H1',
  objective: 'Grow paid subscriptions', targetAudience: 'W25-44 urban'
};

function handoff(md) {
  const m = md.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(m, 'the export carries no handoff block');
  return JSON.parse(m[1]);
}

test('the handoff block is valid JSON', () => {
  const { Brief } = load();
  assert.doesNotThrow(() => handoff(Brief.toExport(FILLED)));
});

test('the identity fields travel as the slugs Strategy reads back', () => {
  const { Brief } = load();
  assert.deepEqual(handoff(Brief.toExport(FILLED)).plan, {
    region: 'na', market: 'usa', pa: 'gemini', cycle: '2027 H1'
  });
});

/* Prose first. Strategy reads a dropped file whole into the model's context,
   so a block of JSON at the top is the first thing the model forms an
   impression of the brief from. */
test('the block sits at the foot, below the prose', () => {
  const { Brief } = load();
  const md = Brief.toExport(FILLED);
  assert.ok(md.indexOf('Grow paid subscriptions') < md.indexOf('```json'),
    'the answers must come before the machine block');
});

/* THE BLOCK IS BUILT FROM THE ANSWERS, NOT FROM THE PROSE. The brief view is
   editable, and an edit that reworded a heading must not be able to change what
   Strategy registers — or worse, produce a block that no longer parses. */
test('editing the prose cannot corrupt what the block says', () => {
  const { Brief } = load();
  const edited = '# A brief somebody rewrote by hand\n\nNothing like the original.\n';
  assert.deepEqual(handoff(Brief.toExport(FILLED, edited)).plan.market, 'usa');
});

test('an unanswered identity field is absent rather than guessed at', () => {
  const { Brief } = load();
  const block = handoff(Brief.toExport({ region: 'na', market: 'USA' }));
  assert.equal(block.plan.region, 'na');
  assert.ok(!('pa' in block.plan), 'an empty product area must not become a slug of the empty string');
});

test('a market typed into Other travels under its own name', () => {
  const { Brief } = load();
  const block = handoff(Brief.toExport({ market: 'Other', marketOther: 'Nordics' }));
  assert.equal(block.plan.market, 'nordics');
});

/* A machine block whose budget reads "$4M – $6M" has moved the parsing problem
   rather than solved it — the next reader has to know that "M" means six
   zeroes and that the dash is an en dash. Numbers, or the field is not worth
   putting in the block. */
test('the budget travels as numbers, not as the string on screen', () => {
  const { Brief } = load();
  const block = handoff(Brief.toExport({ budget: { low: 4, high: 6 } }));
  assert.deepEqual(block.budget.low, 4000000);
  assert.deepEqual(block.budget.high, 6000000);
});

test('a budget dragged to a single number travels as one', () => {
  const { Brief } = load();
  const block = handoff(Brief.toExport({ budget: { low: 5, high: 5 } }));
  assert.equal(block.budget.low, 5000000);
  assert.equal(block.budget.high, 5000000);
});

test('a brief with no budget carries no budget key rather than a null one', () => {
  const { Brief } = load();
  assert.ok(!('budget' in handoff(Brief.toExport({ region: 'na' }))));
});

test('the prose still shows the budget the way a person reads it', () => {
  const { Brief } = load();
  assert.match(Brief.toMarkdown({ budget: { low: 4, high: 6 } }), /\$4M – \$6M/);
});

/* ── the door onto step 02 ────────────────────────────────────────────────
 *
 * ⚠️ IT WAS MISSING. Strategy Discovery reads this brief by drag and reads it
 * well — but nothing here produced the file it wants. Copy sends the rendered
 * prose, which parses to nothing, and Strategy's refusal told people to
 * "export it from the brief tool and drop the file": a file no button made.
 */
const fsH = require('node:fs');
const pathH = require('node:path');
const ROOTH = pathH.join(__dirname, '..');
const readH = (...p) => fsH.readFileSync(pathH.join(ROOTH, ...p), 'utf8');

test('the brief can be handed to Strategy Discovery in one press', () => {
  const html = readH('index.html');
  assert.match(html, /id="prepBtn"/, 'there is no way to hand the brief on');
  const bar = html.slice(html.indexOf('brief-actions'), html.indexOf('</div>', html.indexOf('brief-actions')));
  assert.ok(bar.includes('prepBtn'), 'the button is not on the action bar');
  const app = readH('js', 'app.js');
  /* Sliced to where the handler actually ends rather than a fixed number of
     characters — a window measured in characters silently stops covering the
     thing it was written to check the moment a comment is added above it. */
  const fn = app.slice(app.indexOf("el.prepBtn.addEventListener"),
                       app.indexOf('el.pdfBtn.addEventListener'));
  assert.ok(fn, 'the handler could not be found');
  assert.match(fn, /Brief\.download\(/, 'the button downloads nothing');
});

test('⚠️ it sends Markdown, not the rendered prose Copy sends', () => {
  /* The two are not interchangeable: Strategy parses the prose to nothing.
     This is the one that travels. */
  const app = readH('js', 'app.js');
  const fn = app.slice(app.indexOf("el.prepBtn.addEventListener"), app.indexOf('el.pdfBtn.addEventListener'));
  assert.match(fn, /Brief\.toExport\(/, 'it does not build the export form');
  assert.ok(!/innerText/.test(fn), 'it sends the rendered prose, which parses to nothing');
  assert.match(fn, /\.md`|\.md'/, 'the file is not named as Markdown');
});

test('it exports what is on screen, and rebuilds the handoff block regardless', () => {
  /* The brief may be a Gemini draft the client has since edited by hand, so
     exporting the answers would quietly undo their editing on the way across.
     The block is a machine's copy of the identity fields, not anybody's prose,
     so it is rebuilt from the answers either way. */
  const app = readH('js', 'app.js');
  const fn = app.slice(app.indexOf("el.prepBtn.addEventListener"), app.indexOf('el.pdfBtn.addEventListener'));
  assert.match(fn, /currentMarkdown\(\)/, 'it exports the answers rather than the edited brief');
  assert.match(app, /function currentMarkdown/, 'there is nothing that reads the brief back');
  const brief = readH('js', 'brief.js');
  assert.match(brief, /function toExport\(data, md\)/, 'toExport no longer takes the edited prose');
});

test('the assist controls do not travel to the next step', () => {
  /* They are controls, not content. */
  const app = readH('js', 'app.js');
  const fn = app.slice(app.indexOf('function currentMarkdown'), app.indexOf('function headingText'));
  assert.match(fn, /sec-ai/, 'the per-section assist buttons are exported as content');
});

test('⚠️ a press before the brief is rendered still hands over the brief', () => {
  /* The action bar lives in the review, so ordinarily briefDoc is full. But an
     empty one would produce a handoff block with no brief above it, which
     reads as the work having been lost rather than as the wrong button. */
  const app = readH('js', 'app.js');
  const fn = app.slice(app.indexOf("el.prepBtn.addEventListener"), app.indexOf('el.pdfBtn.addEventListener'));
  assert.match(fn, /shown && shown\.trim\(\) \? shown : null/,
    'an unrendered brief exports as empty');
});
