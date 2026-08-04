const test = require('node:test');
const assert = require('node:assert');

process.env.GATE_PW = 'correct horse';
const gate = require('../api/_gate.js');

const resStub = () => ({ h: {}, setHeader(k, v) { this.h[k] = v; } });
const reqWith = token => ({ headers: { cookie: `ltp_gate=${encodeURIComponent(token)}` } });

test('the right password is accepted, a wrong one is not', () => {
  assert.equal(gate.sameSecret('correct horse'), true);
  assert.equal(gate.sameSecret('correct horse '), false, 'trailing space must not pass');
  assert.equal(gate.sameSecret(''), false);
  assert.equal(gate.sameSecret(undefined), false);
});

test('a cookie issued either way lets the holder back in', () => {
  assert.equal(gate.passed(reqWith(gate.issue(true))), true, 'remembered');
  assert.equal(gate.passed(reqWith(gate.issue(false))), true, 'not remembered');
  assert.equal(gate.passed({ headers: {} }), false, 'no cookie');
  assert.equal(gate.passed(reqWith('9999999999999.forged')), false, 'forged signature');
});

test('remember me is what decides whether the cookie outlives the browser', () => {
  const on = resStub(); gate.setCookie(on, gate.issue(true), true);
  const off = resStub(); gate.setCookie(off, gate.issue(false), false);

  assert.match(on.h['Set-Cookie'], new RegExp(`Max-Age=${gate.MAX_AGE}`), 'ticked → persists 7 days');
  assert.doesNotMatch(off.h['Set-Cookie'], /Max-Age/, 'unticked → session cookie, dies with the browser');

  for (const c of [on.h['Set-Cookie'], off.h['Set-Cookie']]) {
    assert.match(c, /HttpOnly/); assert.match(c, /Secure/); assert.match(c, /SameSite=Lax/);
  }
});

test('an un-remembered token also expires on its own, well before seven days', () => {
  const exp = Number(gate.issue(false).split('.')[0]) - Date.now();
  assert.ok(exp <= gate.SESSION_AGE * 1000 + 1000 && exp > 0, `got ${exp}ms`);
  assert.ok(exp < gate.MAX_AGE * 1000, 'shorter than the remembered token');
});

test('changing the password invalidates cookies already issued', () => {
  const before = gate.issue(true);
  process.env.GATE_PW = 'something else';
  assert.equal(gate.passed(reqWith(before)), false);
  process.env.GATE_PW = 'correct horse';
});
