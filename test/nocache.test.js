/* The gate's answer depends entirely on the cookie, so it must never be
   cached — not by the CDN, not by the browser, not by anything in between.
   Shipped as `public` with no Vary, Chrome re-served a stale {"open":false}
   from memory cache and the lock screen came back after every login. */
const test = require('node:test');
const assert = require('node:assert');

process.env.GATE_PW = 'correct horse';
const gate = require('../api/_gate.js');
const handler = require('../api/gate.js');

const mkRes = () => ({
  h: {}, code: 0, body: null,
  setHeader(k, v) { this.h[k.toLowerCase()] = v; },
  status(c) { this.code = c; return this; },
  json(b) { this.body = b; return this; }
});

const cases = [
  ['GET  with no cookie', { method: 'GET', headers: {} }],
  ['GET  with a valid cookie', { method: 'GET', headers: { cookie: `ltp_gate=${encodeURIComponent(gate.issue(true))}` } }],
  ['POST with the right password', { method: 'POST', headers: {}, body: { password: 'correct horse' } }],
  ['POST with a wrong password', { method: 'POST', headers: {}, body: { password: 'nope' } }],
  ['DELETE', { method: 'DELETE', headers: {} }]
];

for (const [name, req] of cases) {
  test(`${name} is never cacheable`, async () => {
    const res = mkRes();
    await handler(req, res);
    const cc = res.h['cache-control'] || '';
    assert.match(cc, /no-store/, `Cache-Control was "${cc}"`);
    assert.doesNotMatch(cc, /public/, 'a cookie-dependent answer must not be public');
    assert.match(String(res.h['vary'] || ''), /Cookie/i, 'must Vary on Cookie');
  });
}

test('the GET still answers correctly either way', async () => {
  const out = mkRes();
  await handler({ method: 'GET', headers: {} }, out);
  assert.equal(out.body.open, false);

  const inn = mkRes();
  await handler({ method: 'GET', headers: { cookie: `ltp_gate=${encodeURIComponent(gate.issue(false))}` } }, inn);
  assert.equal(inn.body.open, true);
});
