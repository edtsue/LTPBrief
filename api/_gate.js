/* Shared gate logic: one password, a signed cookie, seven days.
 *
 * What this protects, honestly: the assistant and the front door. This is a
 * no-build static site, so index.html, css/ and js/ are served straight from
 * the repo root and anyone with the URL can still fetch those files — a client
 * overlay cannot change that. What it CAN do is stop the tool being used: the
 * Gemini endpoint refuses to answer without the cookie, so the key behind it
 * cannot be spent by someone who has not been let in. Briefs live in the
 * browser of whoever wrote them, so there is no stored client data behind this
 * to leak either way.
 *
 * The cookie is signed rather than stored: `exp.signature`, where the signature
 * is an HMAC of the expiry under the password itself. Nothing to persist, and
 * changing GATE_PW in Vercel invalidates every cookie already issued — which is
 * the behaviour you want from the only lever you have.
 *
 * Being remembered is a choice, and it is off unless asked for. Unticked, the
 * cookie has no Max-Age and dies with the browser, and the token inside it is
 * only good for twelve hours — so a cookie lifted off a shared machine is not
 * a week-long key. Ticked, it lasts seven days.
 */
const crypto = require('crypto');

const COOKIE = 'ltp_gate';
const DAYS = 7;
const MAX_AGE = DAYS * 24 * 60 * 60;
/** How long an un-remembered token stays valid, browser session aside. */
const SESSION_AGE = 12 * 60 * 60;

const secret = () => process.env.GATE_PW || '';
/** Whether a gate is configured at all. Without one the tool stays open. */
const enabled = () => !!secret();

function sign(exp) {
  return crypto.createHmac('sha256', secret()).update(String(exp)).digest('base64url');
}

function issue(remember) {
  const exp = Date.now() + (remember ? MAX_AGE : SESSION_AGE) * 1000;
  return `${exp}.${sign(exp)}`;
}

/** Constant-time compare, so the response time never leaks the password. */
function sameSecret(given) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(secret());
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function validToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  const expected = Buffer.from(sign(exp));
  const got = Buffer.from(sig);
  if (expected.length !== got.length) return false;
  return crypto.timingSafeEqual(expected, got);
}

/* Never let an answer that depends on the cookie be stored by anything.
   Say nothing and Vercel applies `public, max-age=0, must-revalidate`, which
   is wrong twice over: `public` invites a shared cache to hand one visitor's
   answer to the next, and Chrome's memory cache will re-serve `{open:false}`
   within a session regardless of must-revalidate. That is what made the lock
   screen reappear after a login that had genuinely succeeded — the cookie was
   good, the browser just never asked again. Vary: Cookie is belt to that
   brace, so any cache that ignores no-store still keys on the right thing. */
function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Vary', 'Cookie');
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

/** True when this request may use the tool. Open when no gate is configured. */
function passed(req) {
  if (!enabled()) return true;
  return validToken(readCookie(req, COOKIE));
}

/* No Max-Age unless we were asked to remember: a cookie without one is a
   session cookie, and the browser drops it when it closes. */
function setCookie(res, token, remember) {
  const age = remember ? `Max-Age=${MAX_AGE}; ` : '';
  res.setHeader('Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; ${age}Path=/; HttpOnly; Secure; SameSite=Lax`);
}
function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
}

module.exports = { COOKIE, DAYS, MAX_AGE, SESSION_AGE, enabled, issue, sameSecret, validToken, passed, setCookie, clearCookie, readCookie, noStore };
