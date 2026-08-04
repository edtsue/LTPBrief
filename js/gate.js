/* The front door.
   The overlay is a courtesy, not the lock — the lock is the cookie check on
   /api/gemini. What this does is ask once, optionally remember, and keep the
   form out of the way of anyone who has already been let in.

   It also announces when the way is clear. Anything that greets a first-time
   visitor — the tour, most obviously — has to wait for that, because whether
   a gate is even configured is an answer that arrives over the network, and
   a timer started at boot will always win that race and land on top of the
   lock screen. `ltp:unlocked` fires exactly once, on every path that leaves
   the tool usable, including the ones where the door was never there. */
(() => {
  const gate = document.getElementById('gate');
  const form = document.getElementById('gateForm');
  const pw = document.getElementById('gatePw');
  const err = document.getElementById('gateErr');
  const go = document.getElementById('gateGo');
  const remember = document.getElementById('gateRemember');

  let announced = false;
  const unlocked = () => {
    if (announced) return;
    announced = true;
    document.dispatchEvent(new CustomEvent('ltp:unlocked'));
  };

  if (!gate || !form) { unlocked(); return; }

  const show = () => { gate.hidden = false; document.body.classList.add('gated'); setTimeout(() => pw.focus(), 60); };
  const hide = () => { gate.hidden = true; document.body.classList.remove('gated'); unlocked(); };

  // Ask first, so a remembered browser never sees the lock screen at all.
  fetch('/api/gate')
    .then(r => r.json())
    .then(j => { if (j && j.gated && !j.open) show(); else unlocked(); })
    .catch(() => { /* no gate configured, or offline — the tool still works */ unlocked(); });

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
        body: JSON.stringify({ password: pw.value, remember: !!(remember && remember.checked) })
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
