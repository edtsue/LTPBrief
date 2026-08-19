/* The page is one scroll now, so the schema is the only thing that says what
   order it runs in and what is on it. A field that quietly stops existing takes
   its answer out of the export with it, and the export is the whole handoff. */
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
  return ctx.SCHEMA;
}

const ORDER = [
  'plan', 'ask', 'funnel', 'audience', 'money', 'timing',
  'people', 'principles', 'creative', 'view', 'research'
];

test('the page ships eleven sections in the order the spec sets', () => {
  const SCHEMA = load();
  assert.deepEqual(SCHEMA.sections.map(s => s.id), ORDER);
});

test('the chase list is exactly the fields the spec names', () => {
  const SCHEMA = load();
  assert.deepEqual(SCHEMA.chased().sort(), [
    'budget', 'constraints', 'creativePlatform', 'cycle', 'internalDates',
    'launchDates', 'market', 'mediaPrinciples', 'objective', 'productArea',
    'region', 'stakeholders', 'targetAudience'
  ].sort());
});

/* A plan can honestly be brand-only or DR-only, so a blank in the funnel
   section is a real answer. Chasing it would push a client into inventing a
   requirement nobody set — which is the failure this whole page is built to
   avoid, appearing in the one section most likely to invite it. */
test('nothing in the funnel section is chased', () => {
  const SCHEMA = load();
  const funnel = SCHEMA.sections.find(s => s.id === 'funnel');
  assert.ok(funnel.fields.every(f => !f.chase));
});

/* Carried over from the funnel suite when that retired. A field with no
   description is a field the client guesses the meaning of, and a guessed
   answer costs the planning team more than a blank. */
test('every field on the page offers a description', () => {
  const SCHEMA = load();
  const missing = [];
  SCHEMA.sections.forEach(s => s.fields.forEach(f => {
    if (f.type === 'dropzone') return;          // its own copy explains it
    if (!f.help || !String(f.help).trim()) missing.push(`${s.id}.${f.id}`);
  }));
  assert.deepEqual(missing, [], `fields with no hover description: ${missing.join(', ')}`);
});
