/* The only irreversible control in the tool. Undo cannot cover it — undo holds
   one in-memory snapshot and this clears the storage that snapshot writes back
   to — so the typed phrase is the entire guard. These pin the parts of that
   guard a refactor could weaken without anything else failing. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'js/app.js'), 'utf8');
const PHRASE = 'yes, i want to reset everything';

test('the confirmation phrase is exactly the one the user is shown', () => {
  assert.ok(app.includes(`const NUKE_PHRASE = '${PHRASE}';`),
    'the phrase must match character for character — it is printed in the dialog and typed back');
});

test('the delete button ships disabled and is only enabled by a match', () => {
  assert.match(app, /class="btn nuke-go" type="button" disabled/,
    'it must render disabled, so a stray Enter cannot fire it before anything is typed');
  assert.match(app, /go\.disabled = !matches\(\)/);
});

test('nothing can detonate without checking the phrase first', () => {
  // every call site, not just the button — Enter and any future trigger too
  const calls = app.match(/[^\w]detonate\(\)/g) || [];
  assert.ok(calls.length >= 2, 'expected the button and the Enter key to be wired');
  for (const line of app.split('\n')) {
    if (!/[^\w]detonate\(\)/.test(line)) continue;
    if (/function detonate/.test(line)) continue;
    assert.match(line, /matches\(\)/,
      `detonate() is reachable without a phrase check on: ${line.trim()}`);
  }
});

test('the match is exact, not a loose or case-folded comparison', () => {
  assert.match(app, /input\.value\.trim\(\) === NUKE_PHRASE/);
  assert.doesNotMatch(app, /NUKE_PHRASE\.toLowerCase|toLowerCase\(\) === NUKE_PHRASE|includes\(NUKE_PHRASE\)/,
    'a substring or case-insensitive match would let a near-miss through');
});

test('it clears both stored keys, not just the answers', () => {
  const body = app.slice(app.indexOf('function detonate'), app.indexOf('function detonate') + 700);
  assert.match(body, /removeItem\(STORE_KEY\)/, 'answers must go');
  assert.match(body, /removeItem\(BRIEF_KEY\)/, 'the edited brief must go too, or it reappears on a blank form');
  assert.match(body, /undoState = null/, 'a stale undo would offer to restore what was just deleted');
});
