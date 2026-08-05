/* Gemini rewriting the brief is the one place the tool puts words in someone
   else's mouth, so nothing it writes reaches the document until it has been
   read and committed. These pin that contract: the write must happen in the
   commit path, never in the path that fetches the rewrite. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'js/app.js'), 'utf8');

/** Body of a top-level `function name(...)`, to the next same-indent function. */
function fnBody(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const rest = app.slice(start + 1);
  const end = rest.indexOf('\n  function ');
  return rest.slice(0, end === -1 ? rest.length : end);
}

test('fetching a section rewrite does not touch the brief', () => {
  const body = fnBody('doRefine');
  assert.doesNotMatch(body, /saveBrief\(\)/, 'doRefine must not save — commitRefine does');
  assert.doesNotMatch(body, /oldNodes\.forEach\(n => n\.remove\(\)\)/, 'it must not replace the section');
  assert.match(body, /pendingRefine = \{/, 'it should hold the rewrite for review');
});

test('committing a section is what writes, undoably', () => {
  const body = fnBody('commitRefine');
  assert.match(body, /pushUndo\(\)/, 'the commit must be undoable');
  assert.match(body, /saveBrief\(\)/);
  assert.match(body, /toastAction\(/, 'and must offer the undo it just made possible');
  assert.ok(body.indexOf('pushUndo()') < body.indexOf('parent.insertBefore'),
    'the snapshot must be taken before the section is replaced, or it captures the new text');
});

test('drafting proposes the whole brief rather than replacing it', () => {
  const body = fnBody('generate');
  assert.doesNotMatch(body, /el\.briefDoc\.innerHTML = Brief\.toHtml/,
    'generate must not write into the brief — commitDraft does');
  assert.doesNotMatch(body, /saveBrief\(\)/);
  assert.match(body, /openDraftReview\(md\)/);
});

test('committing a draft is what writes, undoably', () => {
  const body = fnBody('commitDraft');
  assert.match(body, /pushUndo\(\)/);
  assert.match(body, /saveBrief\(\)/);
  assert.ok(body.indexOf('pushUndo()') < body.indexOf('el.briefDoc.innerHTML'),
    'snapshot before the replacement, or undo restores what it just wrote');
});

test('an uncommitted proposal is abandoned on close, never applied later', () => {
  assert.match(fnBody('closeRefine'), /pendingRefine = null/,
    'a rewrite left unread must not survive to land on a section later');
  assert.match(app, /draftModal\.onClose = \(\) => \{ pendingDraft = null; \}/);
});

test('commit refuses a section that is no longer on the page', () => {
  assert.match(fnBody('commitRefine'), /h2\.isConnected/,
    'the brief can re-render between proposing and committing; writing blind would corrupt it');
});
