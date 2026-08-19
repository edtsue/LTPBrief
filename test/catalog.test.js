/* The server tells the model which field ids it may fill. Interview mode then
   writes what comes back straight into the form.

   So a field id in the catalog that is not on the page fails in the quietest
   way this tool has: the model answers confidently, the update is applied to
   nothing, and the client watches an interview ask a question whose answer
   never appears. Nothing throws and nothing logs.

   The catalog is kept by hand rather than imported from `js/schema.js`, because
   a serverless function reaching across the repo at runtime is a dependency
   that passes every local test and can still fail to trace on deploy. The
   coupling lives here instead, where it costs nothing at runtime. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'api/gemini.js'), 'utf8');

function schema() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'js/schema.js'), 'utf8') +
    '\n;globalThis.SCHEMA = SCHEMA;', ctx);
  return ctx.SCHEMA;
}
/* Read the declaration out of the source rather than requiring the module: it
   pulls in the gate and expects an environment this test has no business
   building. FIELD_PROPS is derived from FIELD_IDS, so FIELD_IDS is the thing
   worth checking — it is where a stray id would be written. */
function offeredIds() {
  const m = api.match(/const FIELD_IDS = (\{[\s\S]*?\n\});/);
  assert.ok(m, 'FIELD_IDS is not in api/gemini.js');
  return Object.values(vm.runInNewContext('(' + m[1] + ')')).flat();
}

/* Fields a client answers with a control the model cannot write into. */
const NOT_WRITABLE = new Set(['assets', 'docs', 'links', 'budget', 'budgetScope', '_dropzone']);

function writable() {
  const out = [];
  schema().sections.forEach(s => s.fields.forEach(f => {
    if (NOT_WRITABLE.has(f.id) || f.type === 'dropzone') return;
    out.push(f.id);
    if (f.otherId) out.push(f.otherId);
  }));
  return out;
}

test('every field the model may fill still exists on the page', () => {
  const known = new Set(writable().concat([...NOT_WRITABLE]));
  const strays = offeredIds().filter(id => !known.has(id));
  assert.deepEqual(strays, [], `the model would be told to fill: ${strays.join(', ')}`);
});

test('every writable field on the page is offered to the model', () => {
  const offered = new Set(offeredIds());
  const missing = writable().filter(id => !offered.has(id));
  assert.deepEqual(missing, [], `an interview can never fill: ${missing.join(', ')}`);
});

test('the catalog the model reads names every field it may fill', () => {
  const m = api.match(/const CATALOG = `([\s\S]*?)`;/);
  assert.ok(m, 'no CATALOG in api/gemini.js');
  const missing = writable().filter(id => !new RegExp('(^|[^a-zA-Z])' + id + '([^a-zA-Z]|$)', 'm').test(m[1]));
  assert.deepEqual(missing, [], `described to nobody: ${missing.join(', ')}`);
});
