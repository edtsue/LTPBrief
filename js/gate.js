/* The front door.
   The overlay is a courtesy, not the lock — the lock is the cookie check on
   /api/gemini. What this does is ask once, remember for a week, and keep the
   form out of the way of anyone who has already been let in. */
(() => {
  const gate = document.getElementById('gate');
  const form = document.getElementById('gateForm');
  const pw = document.getElementById('gatePw');
  const err = document.getElementById('gateErr');
  const go = document.getElementById('gateGo');
  if (!gate || !form) return;

  const show = () => { gate.hidden = false; document.body.classList.add('gated'); setTimeout(() => pw.focus(), 60); };
  const hide = () => { gate.hidden = true; document.body.classList.remove('gated'); };

  // Ask first, so a remembered browser never sees the lock screen at all.
  fetch('/api/gate')
    .then(r => r.json())
    .then(j => { if (j && j.gated && !j.open) show(); })
    .catch(() => { /* no gate configured, or offline — the tool still works */ });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    err.hidden = true;
    go.disabled = true;
    const was = go.textContent;
    go.textContent = 'Checking…';
    try {
      const r = await fetch('/api/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw.value })
      });
      if (r.ok) { hide(); pw.value = ''; }
      else {
        const j = await r.json().catch(() => ({}));
        err.textContent = j.error || 'That did not work.';
        err.hidden = false;
        pw.select();
      }
    } catch {
      err.textContent = 'Could not reach the door. Check your connection.';
      err.hidden = false;
    }
    go.disabled = false;
    go.textContent = was;
  });
})();
