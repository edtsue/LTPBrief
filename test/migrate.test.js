/* Briefs already saved in somebody's browser were written against six steps.
   Half those fields no longer exist, and the ones that went were not trivial —
   five funnel KPIs and a comms strategy are an afternoon of somebody's
   thinking. Losing them silently on the next page load is the worst possible
   version of this change: the client cannot tell it happened, and the answers
   are not recoverable from anywhere.

   So nothing is discarded. Fields that still exist carry over; fields that went
   are parked somewhere a person will read them. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function load() {
  const ctx = vm.createContext({});
  const src = ['js/schema.js', 'js/migrate.js']
    .map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  vm.runInContext(src + '\n;globalThis.SCHEMA = SCHEMA; globalThis.Migrate = Migrate;', ctx);
  return ctx;
}

test('a field that still exists carries over untouched', () => {
  const { Migrate } = load();
  const out = Migrate.load({ stakeholders: 'Priya — CMO, cares about share' });
  assert.equal(out.stakeholders, 'Priya — CMO, cares about share');
});

test('the five funnel KPIs land in the Brand field, not the catch-all', () => {
  const { Migrate } = load();
  const out = Migrate.load({
    kpiAwareness: 'Ad recall +4pt',
    kpiConsideration: 'Consideration +6pt',
    kpiIntent: 'App-store visits',
    kpiPurchase: 'Installs / CPI',
    kpiLoyalty: 'D30 retention'
  });
  assert.match(out.brRequirements, /Ad recall \+4pt/);
  assert.match(out.brRequirements, /D30 retention/);
  assert.ok(!/Ad recall/.test(out.researchNotes || ''),
    'the KPIs belong in the funnel section, not buried in the catch-all');
});

test('the source-of-growth audience joins the target audience', () => {
  const { Migrate } = load();
  const out = Migrate.load({ sourceAudience: 'Switchers on older Android handsets' });
  assert.match(out.targetAudience, /Switchers on older Android handsets/);
});

test('an answered target audience is added to, never overwritten', () => {
  const { Migrate } = load();
  const out = Migrate.load({
    targetAudience: 'W25-44, urban',
    sourceAudience: 'Switchers on older Android handsets'
  });
  assert.match(out.targetAudience, /W25-44, urban/);
  assert.match(out.targetAudience, /Switchers on older Android handsets/);
});

test('a planning year seeds the cycle', () => {
  const { Migrate } = load();
  assert.equal(Migrate.load({ planningYear: 'FY2027' }).cycle, '2027');
});

test('a planning year that names no year is parked rather than guessed at', () => {
  const { Migrate } = load();
  const out = Migrate.load({ planningYear: 'next planning round' });
  assert.ok(!out.cycle, 'inventing a year is worse than leaving the field blank');
  assert.match(out.researchNotes, /next planning round/);
});

test('everything else retired is parked where a person will read it', () => {
  const { Migrate } = load();
  const out = Migrate.load({
    commsStrategy: 'Barrier is belief, not awareness',
    positioning: 'The assistant that already knows'
  });
  assert.match(out.researchNotes, /From your earlier draft/);
  assert.match(out.researchNotes, /Barrier is belief, not awareness/);
  assert.match(out.researchNotes, /The assistant that already knows/);
});

test('no retired field survives into the saved shape', () => {
  const { SCHEMA, Migrate } = load();
  const out = Migrate.load({
    kpiAwareness: 'x', commsStrategy: 'y', positioning: 'z',
    platform: 'p', categoryDynamics: 'c', culturalTerritories: 't',
    growthDriver: ['Increase user base'], sourceAudience: 's', planningYear: '2027'
  });
  const known = new Set(SCHEMA.fields().map(f => f.id));
  const strays = Object.keys(out).filter(k => !known.has(k) && !/^(marketOther|productAreaOther)$/.test(k));
  assert.deepEqual(strays, [], `these would sit in storage forever: ${strays.join(', ')}`);
});

test('a brief already on the new shape is left exactly as it is', () => {
  const { Migrate } = load();
  const before = { objective: 'Grow paid subs', brRequirements: 'Build fame' };
  assert.deepEqual(Migrate.load(before), before);
});
