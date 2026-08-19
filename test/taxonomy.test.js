/* The identity fields are the whole of the handoff to LTP Strategy, and they
   are the one part of it that fails silently. A brief saying "US" when Strategy
   registers plans under "USA" does not error — it produces a plan nobody can
   find, and the strategist retypes the field believing they mistyped it.

   So the lists here are checked against Strategy's own, and the slug every
   emitted value takes is checked against the function Strategy reads it with. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function load() {
  const ctx = vm.createContext({});
  const src = fs.readFileSync(path.join(root, 'js/schema.js'), 'utf8');
  vm.runInContext(src + '\n;globalThis.SCHEMA = SCHEMA;', ctx);
  return ctx;
}

test('the Intake offers the four regions Strategy registers plans under', () => {
  const { SCHEMA } = load();
  assert.deepEqual(
    SCHEMA.plan.regions.map(r => r.id),
    ['na', 'emea', 'apac', 'global']
  );
});

test('a market emits the slug Strategy reads it back from', () => {
  const { SCHEMA } = load();
  assert.equal(SCHEMA.plan.slug('USA'), 'usa');
  assert.equal(SCHEMA.plan.slug('Saudi Arabia'), 'saudi-arabia');
  assert.equal(SCHEMA.plan.slug('B2B'), 'b2b');
});

/* THE CHECK AGAINST THE SOURCE OF TRUTH.
   Skipped rather than failed when Strategy is not checked out beside this repo,
   because a test that fails on a machine holding only one of the two repos
   would be turned off, and a test that is off guards nothing. On a machine
   holding both — which is where the drift would be introduced — it runs. */
const STRATEGY = path.join(root, '..', 'ltpstrategy', 'js', 'schema.js');
const haveStrategy = fs.existsSync(STRATEGY);

function loadStrategy() {
  const ctx = vm.createContext({});
  vm.runInContext(
    fs.readFileSync(STRATEGY, 'utf8') + '\n;globalThis.SCHEMA = SCHEMA;', ctx);
  return ctx.SCHEMA;
}

test('the region and market lists still match Strategy\'s own', { skip: !haveStrategy && 'ltpstrategy is not a sibling of this repo' }, () => {
  const ours = load().SCHEMA.plan;
  const theirs = loadStrategy().plan;
  assert.deepEqual(
    ours.regions.map(r => ({ id: r.id, label: r.label, markets: r.markets })),
    theirs.regions.map(r => ({ id: r.id, label: r.label, markets: r.markets }))
  );
});

test('the product areas still match Strategy\'s own', { skip: !haveStrategy && 'ltpstrategy is not a sibling of this repo' }, () => {
  const ours = load().SCHEMA.plan;
  const theirs = loadStrategy().plan;
  assert.deepEqual(ours.areas.map(a => a.label), theirs.areas.map(a => a.label));
});

test('every market we offer survives the round trip through Strategy', { skip: !haveStrategy && 'ltpstrategy is not a sibling of this repo' }, () => {
  const ours = load().SCHEMA.plan;
  const theirs = loadStrategy().plan;
  ours.regions.forEach(r => r.markets.forEach(m => {
    const slug = ours.slug(m);
    assert.equal(theirs.market(slug), m, `${m} came back as "${theirs.market(slug)}"`);
    assert.equal(theirs.regionOf(slug), r.id, `${m} lands in the wrong region`);
  }));
});

test('every product area we offer survives the round trip through Strategy', { skip: !haveStrategy && 'ltpstrategy is not a sibling of this repo' }, () => {
  const ours = load().SCHEMA.plan;
  const theirs = loadStrategy().plan;
  ours.areas.forEach(a => {
    const slug = ours.slug(a.label);
    assert.equal(theirs.name(slug), a.label, `${a.label} came back as "${theirs.name(slug)}"`);
  });
});
