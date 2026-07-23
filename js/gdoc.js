/* One-click "Export to Google Doc".
   Uses Google Identity Services for a browser OAuth token (drive.file scope),
   then creates a formatted Google Doc in the signed-in user's Drive by uploading
   the brief as HTML and letting Drive convert it. No server-side token storage. */

const GDoc = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  let clientId = null;         // fetched from /api/config
  let tokenClient = null;
  let gisReady = false;

  // Load the Google Identity Services library once.
  function loadGis() {
    return new Promise((resolve, reject) => {
      if (gisReady) return resolve();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true;
      s.onload = () => { gisReady = true; resolve(); };
      s.onerror = () => reject(new Error('Could not load Google sign-in.'));
      document.head.appendChild(s);
    });
  }

  async function getClientId() {
    if (clientId !== null) return clientId;
    try {
      const r = await fetch('/api/config');
      const j = await r.json();
      clientId = j.googleClientId || '';
    } catch { clientId = ''; }
    return clientId;
  }

  function requestToken() {
    return new Promise((resolve, reject) => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp && resp.access_token) resolve(resp.access_token);
          else reject(new Error('Sign-in was cancelled.'));
        },
        error_callback: () => reject(new Error('Sign-in was cancelled.'))
      });
      // Always show the account chooser so the user signs into the right Google account.
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    });
  }

  // Wrap the brief HTML in a minimal document Drive can convert cleanly.
  function wrapHtml(innerHtml, title) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeAttr(title)}</title></head>` +
      `<body>${innerHtml}</body></html>`;
  }

  async function createDoc(accessToken, html, title) {
    const boundary = 'ltpbrief_' + Math.random().toString(36).slice(2);
    const metadata = { name: title, mimeType: 'application/vnd.google-apps.document' };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n` +
      html +
      `\r\n--${boundary}--`;

    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'multipart/related; boundary=' + boundary
      },
      body
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error('Google Drive rejected the request (' + r.status + '). ' + t.slice(0, 140));
    }
    return r.json(); // { id, ... }
  }

  // Public: run the full export. `getHtml`/`getTitle` are lazy so we use the latest brief.
  async function exportDoc(getHtml, getTitle, onStatus) {
    const status = onStatus || (() => {});
    const id = await getClientId();
    if (!id) {
      throw Object.assign(new Error('not-configured'), { code: 'not-configured' });
    }
    status('Connecting to Google…');
    await loadGis();
    const token = await requestToken();
    status('Creating your Google Doc…');
    const title = getTitle();
    const doc = await createDoc(token, wrapHtml(getHtml(), title), title);
    const url = 'https://docs.google.com/document/d/' + doc.id + '/edit';
    window.open(url, '_blank', 'noopener');
    return url;
  }

  function escapeAttr(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  return { exportDoc };
})();
