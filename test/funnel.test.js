/* The funnel's stage list belongs to the brief, not the schema — it can be
   renamed, shortened or extended. Everything downstream has to follow it, and
   the export is where getting that wrong is invisible until a planner reads a
   brief missing the stage the whole plan turns on. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
/* schema.js and brief.js are browser globals, not modules; run them in a
   context the same way index.html does. */
function load() {
  const ctx = vm.createContext({});
  const src = ['js/schema.js', 'js/brief.js']
    .map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  /* Both files declare with `const`, which is a lexical binding rather than a
     property of the global object — so run them together and hand the values
     out explicitly. */
  vm.runInContext(src + '\n;globalThis.SCHEMA = SCHEMA; globalThis.Brief = Brief;', ctx);
  return ctx;
}

const DEFAULTS = ['kpiAwareness', 'kpiConsideration', 'kpiIntent', 'kpiPurchase', 'kpiLoyalty'];

test('the schema still ships the five default stages', () => {
  const { SCHEMA } = load();
  const stages = SCHEMA.steps.find(s => s.id === 'funnel')
    .groups.flatMap(g => g.fields).find(f => f.type === 'funnel').stages;
  assert.deepEqual(stages.map(s => s.id), DEFAULTS);
  assert.ok(stages.every(s => s.label && s.color), 'every default stage needs a label and a colour');
});

test('an unedited funnel exports the default stage names', () => {
  const { Brief } = load();
  const md = Brief.toMarkdown({ kpiAwareness: 'Ad recall +4pt', kpiLoyalty: 'D30 retention' });
  assert.match(md, /\*\*Awareness:\*\* Ad recall \+4pt/);
  assert.match(md, /\*\*Loyalty:\*\* D30 retention/);
});

test('a renamed stage exports under its new name, not the schema default', () => {
  const { Brief } = load();
  const md = Brief.toMarkdown({
    funnelStages: [
      { id: 'kpiAwareness', label: 'Awareness' },
      { id: 'kpiLoyalty', label: 'Retention' }
    ],
    kpiAwareness: 'Ad recall +4pt',
    kpiLoyalty: 'D30 retention'
  });
  assert.match(md, /\*\*Retention:\*\* D30 retention/);
  assert.doesNotMatch(md, /\*\*Loyalty:\*\*/, 'the old schema label must not survive a rename');
});

test('an added stage reaches the brief', () => {
  const { Brief } = load();
  const md = Brief.toMarkdown({
    funnelStages: [
      { id: 'kpiAwareness', label: 'Awareness' },
      { id: 'kpiStage6', label: 'Advocacy' }
    ],
    kpiAwareness: 'Ad recall +4pt',
    kpiStage6: 'Referral rate'
  });
  assert.match(md, /\*\*Advocacy:\*\* Referral rate/);
});

test('a removed stage leaves no trace in the brief', () => {
  const { Brief } = load();
  const md = Brief.toMarkdown({
    funnelStages: [{ id: 'kpiAwareness', label: 'Awareness' }],
    kpiAwareness: 'Ad recall +4pt',
    kpiIntent: 'orphaned value from before the removal'
  });
  assert.match(md, /\*\*Awareness:\*\*/);
  assert.doesNotMatch(md, /orphaned value/, 'a stage no longer in the funnel must not be exported');
});

test('reordering stages reorders the brief, since the funnel is an argument in order', () => {
  const { Brief } = load();
  const md = Brief.toMarkdown({
    funnelStages: [
      { id: 'kpiLoyalty', label: 'Loyalty' },
      { id: 'kpiAwareness', label: 'Awareness' },
      { id: 'kpiIntent', label: 'Intent' }
    ],
    kpiAwareness: 'Ad recall +4pt',
    kpiIntent: 'App-store visits',
    kpiLoyalty: 'D30 retention'
  });
  const order = ['Loyalty', 'Awareness', 'Intent'].map(l => md.indexOf(`**${l}:**`));
  assert.ok(order.every(i => i >= 0), 'every stage must appear');
  assert.deepEqual(order.slice().sort((a, b) => a - b), order,
    'the brief must list stages in the funnel order, not the schema order');
});

test('every form field offers a description', () => {
  const { SCHEMA } = load();
  const missing = [];
  SCHEMA.steps.forEach(s => s.groups.forEach(g => g.fields.forEach(f => {
    if (f.type === 'dropzone') return;          // its own copy explains it
    if (!f.help || !String(f.help).trim()) missing.push(`${s.id}.${f.id}`);
  })));
  assert.deepEqual(missing, [], `fields with no hover description: ${missing.join(', ')}`);
});
