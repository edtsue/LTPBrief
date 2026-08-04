/* The gate itself.
 *   GET    → { open, gated }  — is this browser already let in?
 *   POST   → { ok } and a cookie, or 401. `remember: true` makes the cookie
 *            last seven days; without it the cookie dies with the browser.
 *   DELETE → forgets this browser
 */
const gate = require('./_gate');

module.exports = async (req, res) => {
  gate.noStore(res);

  if (req.method === 'GET') {
    res.status(200).json({ open: gate.passed(req), gated: gate.enabled(), days: gate.DAYS });
    return;
  }

  if (req.method === 'DELETE') {
    gate.clearCookie(res);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  if (!gate.enabled()) { res.status(200).json({ ok: true, gated: false }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  if (!gate.sameSecret(body && body.password)) {
    // Deliberately slow and deliberately vague: no hint about length, no hint
    // about how close it was.
    await new Promise(r => setTimeout(r, 600));
    res.status(401).json({ error: "That's not it." });
    return;
  }

  const remember = !!(body && body.remember);
  gate.setCookie(res, gate.issue(remember), remember);
  res.status(200).json({ ok: true, remembered: remember, days: remember ? gate.DAYS : 0 });
};
