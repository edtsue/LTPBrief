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
