/* The gate itself.
 *   GET    → { open, gated }  — is this browser already let in?
 *   POST   → { ok } and a seven-day cookie, or 401
 *   DELETE → forgets this browser
 */
const gate = require('./_gate');

module.exports = async (req, res) => {
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

  gate.setCookie(res, gate.issue());
  res.status(200).json({ ok: true, days: gate.DAYS });
};
