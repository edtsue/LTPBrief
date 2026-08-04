/* An author `display` declaration outranks the browser's [hidden]{display:none},
   so any element that is styled with `display` AND toggled via the `hidden`
   attribute needs its own [hidden] rule or the attribute does nothing at all.
   The gate shipped without one: every login succeeded and the lock screen never
   moved. This checks the whole file rather than that one case. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');

/* Strip comments so a `display:` inside prose never counts as a declaration. */
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Classes on elements carrying a bare `hidden` attribute (not aria-hidden). */
function togglableClasses() {
  const found = new Set();
  for (const tag of html.match(/<[a-z][^>]*>/gi) || []) {
    if (!/\shidden(?=[\s/>])/i.test(tag)) continue;
    const cls = tag.match(/\sclass="([^"]*)"/i);
    if (cls) for (const c of cls[1].split(/\s+/).filter(Boolean)) found.add(c);
  }
  return [...found];
}

/** Does any rule set `display` on a bare `.cls` selector? */
const setsDisplay = cls =>
  (rules.match(new RegExp(`\\.${cls}(?![\\w-])[^{}]*\\{[^}]*\\}`, 'g')) || [])
    .some(block => !/\[hidden\]/.test(block.split('{')[0]) && /display\s*:/.test(block));

/** Is there a rule whose selector includes `.cls[hidden]`? */
const hasHiddenRule = cls =>
  new RegExp(`\\.${cls}\\[hidden\\]`).test(rules);

test('the gate can actually hide itself', () => {
  assert.ok(setsDisplay('gate'), 'precondition: .gate sets display');
  assert.ok(hasHiddenRule('gate'),
    '.gate sets display, so it needs .gate[hidden]{display:none} or the hidden attribute is inert');
});

test('every display-styled element toggled by [hidden] re-asserts display:none', () => {
  const broken = togglableClasses().filter(c => setsDisplay(c) && !hasHiddenRule(c));
  assert.deepEqual(broken, [],
    `these set display but have no [hidden] rule, so toggling .hidden does nothing: ${broken.join(', ')}`);
});
