/* Labels are Title Case; sentences are not.
 *
 * The rail, the buttons and the chips are names for things — they read as a
 * set, and one sentence-cased item among them looks like a mistake rather than
 * a choice. Help text, placeholders and section blurbs are prose and stay as
 * they are; title-casing a sentence is the opposite error.
 *
 * Pinned as a rule rather than a list so a section or button added later has to
 * meet it too.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function schema() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'js/schema.js'), 'utf8') +
    '\n;globalThis.SCHEMA = SCHEMA;', ctx);
  return ctx.SCHEMA;
}

/* The words that stay lowercase inside a title. Articles, coordinating
   conjunctions and short prepositions — never the first word. */
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from',
  'in', 'into', 'nor', 'of', 'on', 'or', 'over', 'the', 'to', 'up', 'with']);

function offenders(label) {
  /* Strip the decoration a button carries — arrows, ellipses, plus signs,
     icons — and judge only the words. */
  const words = String(label)
    .replace(/[←→↑↓✓…&+·]/g, ' ')
    .split(/\s+/).filter(Boolean);
  return words.filter((w, i) => {
    const bare = w.replace(/[^A-Za-z'-]/g, '');
    if (!bare) return false;
    if (bare === bare.toUpperCase()) return false;      // USA, PDF, MFG, BR, DR
    if (i > 0 && SMALL.has(bare.toLowerCase())) return false;
    return bare[0] !== bare[0].toUpperCase();
  });
}

const titleCase = label => offenders(label).length === 0;

test('the rule knows a title from a sentence', () => {
  assert.ok(titleCase('Research and Data'));
  assert.ok(titleCase('Review the Brief →'));
  assert.ok(titleCase('Export as PDF'));
  assert.ok(titleCase('+ Add a Link'));
  assert.ok(!titleCase('Research and data'));
  assert.ok(!titleCase('Review the brief →'));
});

test('every section in the rail is Title Case', () => {
  const bad = schema().sections
    .map(s => s.title)
    .filter(t => !titleCase(t));
  assert.deepEqual(bad, [], `sentence-cased in the rail: ${bad.join(' | ')}`);
});

test('every pill the client picks from is Title Case', () => {
  const bad = [];
  schema().sections.forEach(s => s.fields.forEach(f => {
    (f.optgroups || []).forEach(g => (g.options || []).forEach(o => {
      if (!titleCase(o)) bad.push(o);
    }));
  }));
  assert.deepEqual(bad, [], `sentence-cased pills: ${bad.join(' | ')}`);
});

test('every button in the page is Title Case', () => {
  /* The visible text of each button, with any icon markup removed. */
  const labels = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)]
    .map(m => m[1].replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').trim())
    .filter(t => /[A-Za-z]/.test(t));
  assert.ok(labels.length > 5, 'found suspiciously few buttons to check');
  const bad = labels.filter(t => !titleCase(t));
  assert.deepEqual(bad, [], `sentence-cased buttons: ${bad.join(' | ')}`);
});

/* The chips on the brief say what is outstanding. They are names, so they read
   as a set — the field's own label is a question, which is right in the form
   and wrong on a chip. */
test('every chased field has a Title Case chip', () => {
  const S = schema();
  const bad = S.chased()
    .map(id => S.chipFor(id))
    .filter(c => !titleCase(c));
  assert.deepEqual(bad, [], `sentence-cased chips: ${bad.join(' | ')}`);
});

test('a chip is a name, not the question the form asks', () => {
  const S = schema();
  const objective = S.fields().find(f => f.id === 'objective');
  assert.equal(S.chipFor('objective'), 'Objective');
  assert.match(objective.label, /^What this plan has to achieve$/,
    'the form still asks it as a question');
});
