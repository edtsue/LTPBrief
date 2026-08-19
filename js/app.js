/* LTP Brief Intake — the page controller.
   Draws every section at once, persists to localStorage, and drives the two
   things the co-pilot still does. There is no active step: navigation is
   scrolling, so nothing here re-renders when the reader moves. */

(() => {
  const STORE_KEY = 'ltpbrief.v1';

  /* A field's label, for anywhere that names one outside the form. */
  const LABEL = {};
  SCHEMA.sections.forEach(s => s.fields.forEach(f => { if (f.label) LABEL[f.id] = f.label; }));

  /* Which section owns a field, so a chase can scroll to the first one
     outstanding and a check can point at what it is about. */
  const FIELD_SECTION = {};
  SCHEMA.sections.forEach(s => s.fields.forEach(f => {
    if (f.type === 'dropzone') return;
    FIELD_SECTION[f.id] = s.id;
    if (f.otherId) FIELD_SECTION[f.otherId] = s.id;
  }));
  const el = {
    app: document.getElementById('app'),
    steps: document.getElementById('steps'),
    progLabel: document.getElementById('progLabel'),
    progFill: document.getElementById('progFill'),
    fields: document.getElementById('fields'),
    nextBtn: document.getElementById('nextBtn'),
    saveState: document.getElementById('saveState'),
    coStatus: document.getElementById('coStatus'),
    coBody: document.getElementById('coBody'),
    coAnswer: document.getElementById('coAnswer'),
    interviewBtn: document.getElementById('interviewBtn'),
    tourBtn: document.getElementById('tourBtn'),
    formView: document.getElementById('formView'),
    briefView: document.getElementById('briefView'),
    briefDoc: document.getElementById('briefDoc'),
    genBtn: document.getElementById('genBtn'),
    copyBtn: document.getElementById('copyBtn'),
    pdfBtn: document.getElementById('pdfBtn'),
    resetBriefBtn: document.getElementById('resetBriefBtn'),
    readiness: document.getElementById('readiness'),
    saveFileBtn: document.getElementById('saveFileBtn'),
    loadFileBtn: document.getElementById('loadFileBtn'),
    loadFileInput: document.getElementById('loadFileInput'),
    newBriefBtn: document.getElementById('newBriefBtn'),
    moreBtn: document.getElementById('moreBtn'),
    editBtn: document.getElementById('editBtn')
  };

  const BRIEF_KEY = 'ltpbrief.brief';
  /* DECLARED BEFORE `load()` RUNS, not beside it. `function load` hoists and
     this does not, so writing it next to the function it belongs to put the
     whole controller in the temporal dead zone: the first line of work threw,
     and the page rendered its static shell and nothing else. */
  let migrated = false;
  let data = load();
  let onBrief = false;
  let editedBrief = null;
  try { editedBrief = localStorage.getItem(BRIEF_KEY) || null; } catch {}

  /* BRIEFS SAVED AGAINST THE SIX STEPS STILL OPEN. Half those fields no longer
     exist and the ones that went were not trivial, so nothing is discarded —
     see `js/migrate.js`. The brief is told once, rather than silently.
     `migrated` is declared above, before the call that sets it. */
  function load() {
    let raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch { return {}; }
    const out = Migrate.load(raw);
    migrated = JSON.stringify(out) !== JSON.stringify(raw);
    return out;
  }
  let saveTimer = null;
  function save() {
    el.saveState.textContent = 'Saving…';
    el.saveState.classList.add('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(data));
        el.saveState.textContent = 'Saved ✓';
      } catch {
        // Almost always the quota, now that documents carry text with them.
        // Say so rather than sitting on "Saving…" forever.
        el.saveState.textContent = 'Too big to autosave — use Save to file';
      }
      el.saveState.classList.remove('saving');
    }, 400);
  }

  /* ---------- completion ---------- */
  function filled(id) {
    const v = data[id];
    if (Array.isArray(v)) return v.some(r => r && (typeof r === 'string' ? r.trim() : (r.name || r.url)));
    if (v && typeof v === 'object') return v.low != null || v.high != null;
    return v != null && String(v).trim() !== '';
  }
  function sectionFilled(section) {
    return section.fields.some(f => f.type !== 'dropzone' && filled(f.id));
  }
  function completedCount() { return SCHEMA.sections.filter(sectionFilled).length; }
  /* ---------- rail ----------
     It kept its place and changed its job. There are no steps to number, so it
     lists the sections and says where you are in them; the meter above it
     counts what the planning team will chase rather than what is left to do.
     Nothing here blocks anything — see `chased()` in the schema. */
  function renderRail() {
    el.steps.innerHTML = '';
    SCHEMA.sections.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.sec = s.id;
      b.className = 'step' + (sectionFilled(s) ? ' done' : '');
      b.innerHTML = `<span class="dot" aria-hidden="true"></span> ${escapeHtml(s.title)}`;
      b.addEventListener('click', () => goTo(s.id));
      el.steps.appendChild(b);
    });

    const div = document.createElement('div');
    div.className = 'rail-div';
    el.steps.appendChild(div);

    const brief = document.createElement('button');
    brief.type = 'button';
    brief.className = 'step brief-nav' + (onBrief ? ' active' : '');
    brief.setAttribute('data-tip', 'Review, edit and export the finished brief');
    brief.innerHTML = `<span class="num brief-ico"><svg class="gstar"><use href="#star"/></svg></span> Full Brief`;
    brief.addEventListener('click', () => {
      if (completedCount() === 0) { toast('Add some brief details first.'); return; }
      showBrief();
    });
    el.steps.appendChild(brief);

    /* Set apart from the navigation by a gap, because it is not navigation —
       it is the one control here that destroys work. */
    const nuke = document.createElement('button');
    nuke.type = 'button';
    nuke.className = 'nuke-pill';
    nuke.innerHTML = '<span class="nuke-ico">&#9762;&#65039;</span> NUCLEAR DELETE';
    nuke.setAttribute('data-tip', 'Erase every answer and start over — cannot be undone');
    nuke.addEventListener('click', openNuke);
    el.steps.appendChild(nuke);

    renderChase();
  }

  /* WHAT THE PLANNING TEAM WILL CHASE, counted and never enforced. A form that
     refuses to submit gets a made-up budget instead of an honest gap, and an
     invented number is far harder to catch later than an empty box. */
  function renderChase() {
    const done = SCHEMA.sections.filter(sectionFilled).length;
    const open = SCHEMA.chased().filter(id => !filled(id));
    const pct = Math.round((done / SCHEMA.sections.length) * 100);

    el.progLabel.innerHTML = `${done} of ${SCHEMA.sections.length} sections answered` +
      (open.length
        ? ` · <button type="button" class="chase" id="chaseBtn">${open.length} the team will chase</button>`
        : ` · <span class="chase-clear">nothing outstanding</span>`);
    el.progFill.style.width = pct + '%';

    const btn = document.getElementById('chaseBtn');
    if (btn) btn.addEventListener('click', () => goToField(open[0]));
  }
  /* ---------- field rendering ---------- */
  function makeLabel(text, help) {
    const label = document.createElement('label');
    label.textContent = text;
    if (help) {
      label.appendChild(document.createTextNode(' '));
      const i = document.createElement('span');
      i.className = 'info'; i.textContent = 'ⓘ'; i.tabIndex = 0;
      i.setAttribute('data-tip', help);
      label.appendChild(i);
    }
    return label;
  }
  // Wrap a text input/textarea with a little × clear button.
  function wrapClear(input, isTextarea) {
    const holder = document.createElement('div');
    holder.className = 'inwrap' + (isTextarea ? ' ta' : '');
    const clr = document.createElement('button');
    clr.type = 'button'; clr.className = 'clear-x'; clr.textContent = '×'; clr.tabIndex = -1; clr.setAttribute('aria-label', 'Clear');
    const sync = () => { clr.style.display = input.value ? 'grid' : 'none'; };
    clr.addEventListener('click', () => { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); sync(); input.focus(); });
    input.addEventListener('input', sync);
    holder.appendChild(input); holder.appendChild(clr);
    sync();
    return holder;
  }
  /* WHERE A SELECT'S OPTIONS COME FROM. Named rather than listed inline, so
     the region/market/area lists have exactly one definition — the copy of
     Strategy's own, in the schema. */
  function optionsFor(f) {
    if (f.source === 'regions') return SCHEMA.plan.regions.map(r => r.label);
    if (f.source === 'areas') return SCHEMA.plan.areas.filter(a => !a.other).map(a => a.label);
    if (f.source === 'markets') {
      const r = SCHEMA.plan.regions.find(x => x.label === data.region);
      /* No region chosen yet means every market, rather than none: a client who
         scrolls to Market first should not meet an empty box with no
         explanation of what is missing. */
      return r ? r.markets : SCHEMA.plan.regions.flatMap(x => x.markets);
    }
    return f.options || [];
  }

  const dependents = id => SCHEMA.fields().filter(f => f.dependsOn === id);

  /* The cycle is one value — "2027 H1" — entered as two controls, because a
     year and a half are two decisions and a single text box gets "H1" with no
     year in it often enough to matter. */
  function cycleNode(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field full std';
    wrap.dataset.field = f.id;
    wrap.appendChild(makeLabel(f.label, f.help));

    const row = document.createElement('div');
    row.className = 'cycle-row';

    const cur = String(data[f.id] || '');
    const year = document.createElement('input');
    year.type = 'text'; year.id = 'f_' + f.id; year.className = 'cycle-year';
    year.inputMode = 'numeric'; year.placeholder = String(new Date().getFullYear() + 1);
    year.value = (cur.match(/(20\d{2})/) || [''])[0];

    const half = document.createElement('select');
    half.className = 'cycle-half';
    [['', 'Full year'], ['H1', 'H1'], ['H2', 'H2']].forEach(([v, label]) => {
      const o = document.createElement('option');
      o.value = v; o.textContent = label;
      half.appendChild(o);
    });
    half.value = /\bH1\b/.test(cur) ? 'H1' : /\bH2\b/.test(cur) ? 'H2' : '';

    const sync = () => {
      const y = year.value.trim();
      /* A half with no year is not a cycle. Storing "H1" alone would put a plan
         under a cycle Strategy cannot place, so nothing is stored until the
         year is there. */
      data[f.id] = y ? (half.value ? `${y} ${half.value}` : y) : '';
      save(); markRail();
    };
    year.addEventListener('input', sync);
    half.addEventListener('change', sync);

    row.append(year, half);
    wrap.appendChild(row);
    return wrap;
  }

  /* Research arrives as a Drive link far more often than as a file. Nothing
     here can open one — a Google Doc is auth-gated to our server and to the
     model alike — so the row carries the client's own line about why it
     matters, and that line is what the planning team goes on. */
  function linksNode(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field full std';
    wrap.dataset.field = f.id;
    wrap.appendChild(makeLabel(f.label, f.help));

    const list = document.createElement('div');
    list.className = 'links';
    wrap.appendChild(list);

    if (!Array.isArray(data[f.id])) data[f.id] = [];
    const rows = data[f.id];

    function draw() {
      list.innerHTML = '';
      rows.forEach((row, i) => {
        const r = document.createElement('div');
        r.className = 'link-row';

        const mk = (key, ph, cls) => {
          const inp = document.createElement('input');
          inp.type = key === 'url' ? 'url' : 'text';
          inp.className = cls; inp.placeholder = ph;
          inp.value = row[key] || '';
          inp.addEventListener('input', () => { row[key] = inp.value; save(); markRail(); });
          return inp;
        };

        const del = document.createElement('button');
        del.type = 'button'; del.className = 'link-x';
        del.setAttribute('aria-label', 'Remove this link');
        del.textContent = '×';
        del.addEventListener('click', () => { rows.splice(i, 1); save(); draw(); markRail(); });

        r.append(mk('label', 'What it is', 'link-label'),
                 mk('url', 'https://docs.google.com/…', 'link-url'),
                 mk('why', 'Why it matters', 'link-why'), del);
        list.appendChild(r);
      });

      const add = document.createElement('button');
      add.type = 'button'; add.className = 'link-add';
      add.textContent = '+ Add a link';
      add.addEventListener('click', () => { rows.push({ label: '', url: '', why: '' }); save(); draw(); });
      list.appendChild(add);
    }
    draw();
    return wrap;
  }

  function fieldNode(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field' + (f.full ? ' full' : '');
    wrap.dataset.field = f.id;

    if (f.type === 'assets') { return assetsNode(f); }
    if (f.type === 'docs') { return docsNode(f); }
    if (f.type === 'cycle') { return cycleNode(f); }
    if (f.type === 'links') { return linksNode(f); }
    if (f.type === 'pills') { return pillsNode(f); }
    if (f.type === 'dropzone') { return dropzoneNode(f); }
    if (f.type === 'budget') { return budgetNode(f); }

    wrap.classList.add('std');
    const label = makeLabel(f.label, f.help);
    label.htmlFor = 'f_' + f.id;
    wrap.appendChild(label);

    let input;
    if (f.type === 'textarea') {
      input = document.createElement('textarea');
    } else if (f.type === 'select') {
      input = document.createElement('select');
      const blank = document.createElement('option');
      blank.value = ''; blank.textContent = 'Select…';
      input.appendChild(blank);
      const addOpt = (val, parent) => {
        const opt = document.createElement('option');
        opt.value = val; opt.textContent = val;
        parent.appendChild(opt);
      };
      optionsFor(f).forEach(o => addOpt(o, input));
      if (f.otherId) addOpt('Other', input);
    } else {
      input = document.createElement('input');
      input.type = 'text';
    }
    input.id = 'f_' + f.id;
    input.placeholder = f.placeholder || '';
    if (data[f.id] != null) input.value = data[f.id];

    input.addEventListener('input', () => {
      data[f.id] = input.value;
      save(); markRail();
      /* A market chosen under one region is not a market under another, so the
         answer is cleared with the list rather than left pointing at a country
         that is no longer on it. */
      if (dependents(f.id).length) {
        dependents(f.id).forEach(d => { delete data[d.id]; delete data[d.otherId]; });
        save();
        renderPage();
      }
    });
    if (f.type === 'select') wrap.appendChild(input);
    else wrap.appendChild(wrapClear(input, f.type === 'textarea'));

    // "Other" free-text companion for selects that allow it.
    if (f.type === 'select' && f.otherId) {
      const other = document.createElement('input');
      other.type = 'text';
      other.id = 'f_' + f.id + 'Other';
      other.placeholder = f.otherPlaceholder || 'Describe it in your own words';
      other.id = 'f_' + f.otherId;
      if (data[f.otherId] != null) other.value = data[f.otherId];
      const syncOther = () => { other.style.display = input.value === 'Other' ? 'block' : 'none'; };
      syncOther();
      other.addEventListener('input', () => { data[f.otherId] = other.value; save(); markRail(); });
      input.addEventListener('change', syncOther);
      wrap.appendChild(other);
    }

    // Optional AI helper button under the field (e.g. audience builder).
    if (f.aiAction === 'audiences') {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ai-mini';
      b.setAttribute('data-tip', 'Get 2–3 candidate audiences with a rationale for each');
      b.innerHTML = '<svg class="gstar"><use href="#star"/></svg> Suggest audiences';
      wrap.appendChild(b);
    }
    // Optional reference link that opens in an in-app viewer.
    if (f.link) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'field-link';
      b.innerHTML = '<span>↗</span> ' + escapeHtml(f.link.label);
      b.addEventListener('click', () => window.open(f.link.url, '_blank', 'noopener'));
      wrap.appendChild(b);
    }
    return wrap;
  }

  function budgetNode(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field full';
    wrap.appendChild(makeLabel(f.label, f.help));
    const MIN = 1, MAX = 1000, STEP = 5;
    /* STORED AS A PAIR OF NUMBERS, in millions — not as the string on screen.
       The handoff block multiplies them out, and a block whose budget reads
       "$4M – $6M" has moved the parsing problem rather than solved it. Briefs
       saved before this kept a string, so that shape is still read. */
    let lo = 40, hi = 55;
    const saved = data.budget;
    if (saved && typeof saved === 'object') {
      if (saved.low != null) lo = +saved.low;
      if (saved.high != null) hi = +saved.high;
    } else {
      const m = String(saved || '').match(/(\d+)\s*M[^\d]+(\d+)\s*M/i);
      if (m) { lo = +m[1]; hi = +m[2]; }
      else { const one = String(saved || '').match(/(\d+)\s*M/i); if (one) { lo = hi = +one[1]; } }
    }
    lo = Math.max(MIN, Math.min(lo, MAX)); hi = Math.max(lo, Math.min(hi, MAX));

    /* Two handles on one track is only obvious once you have already worked out
       that it is two handles. So each end carries its own labelled bubble —
       "Low" and "High" — the scale is marked at both extremes, and the readout
       says from/to rather than printing a dash between two numbers. */
    const dr = document.createElement('div');
    dr.className = 'dualrange';
    dr.innerHTML =
      '<div class="dr-bub lo"><span class="dr-cap">Low</span><b></b></div>' +
      '<div class="dr-bub hi"><span class="dr-cap">High</span><b></b></div>' +
      '<div class="dr-track"><div class="dr-fill"></div></div>' +
      '<input type="range" class="dr-min"><input type="range" class="dr-max">';
    const fill = dr.querySelector('.dr-fill');
    const mn = dr.querySelector('.dr-min');
    const mx = dr.querySelector('.dr-max');
    const bubLo = dr.querySelector('.dr-bub.lo'), bubHi = dr.querySelector('.dr-bub.hi');
    [mn, mx].forEach(r => { r.min = MIN; r.max = MAX; r.step = STEP; });
    mn.value = lo; mx.value = hi;
    mn.setAttribute('aria-label', 'Lowest budget in the range');
    mx.setAttribute('aria-label', 'Highest budget in the range');

    const fmt = v => '$' + v + 'M';
    const ends = document.createElement('div');
    ends.className = 'dr-ends';
    ends.innerHTML = `<span>${fmt(MIN)}</span><span>${fmt(MAX)}</span>`;

    const read = document.createElement('div');
    read.className = 'dr-read';
    const hint = document.createElement('div');
    hint.className = 'dr-hint';
    hint.textContent = 'Drag each end separately — a range is fine, and a single number is fine too (drag them together).';

    function update(persist) {
      let a = +mn.value, b = +mx.value;
      if (a > b) { if (document.activeElement === mn) { b = a; mx.value = b; } else { a = b; mn.value = a; } }
      const lp = (a - MIN) / (MAX - MIN) * 100, rp = (b - MIN) / (MAX - MIN) * 100;
      fill.style.left = lp + '%'; fill.style.width = (rp - lp) + '%';
      bubLo.style.left = lp + '%'; bubHi.style.left = rp + '%';
      bubLo.querySelector('b').textContent = fmt(a);
      bubHi.querySelector('b').textContent = fmt(b);
      /* Sitting on the same value the two bubbles would overlap into an
         unreadable smudge, so the pair collapses into one. */
      const together = Math.abs(rp - lp) < 9;
      bubLo.classList.toggle('merged', together);
      bubHi.classList.toggle('merged', together);
      read.textContent = a === b
        ? fmt(a) + ' working media'
        : 'From ' + fmt(a) + ' to ' + fmt(b) + ' working media';
      if (persist !== false) { data.budget = { low: a, high: b }; save(); markRail(); }
    }
    mn.addEventListener('input', () => update());
    mx.addEventListener('input', () => update());
    update(false);
    wrap.append(dr, ends, read, hint);
    return wrap;
  }

  /* ---------- other research / input ----------
     These files never leave the browser: there is no server to put them on,
     and pretending otherwise would be the worst kind of lie in an intake form.
     What the brief carries is the LIST — name, size, and why it matters — so
     the planning team knows what to ask for, plus the text of anything
     text-shaped so the co-pilot can actually reason against it. A PDF is
     recorded but not read; the "Start from a document" box on Context is the
     tool for pulling fields out of one. */
  const DOC_TEXT_CAP = 12000;    // per document
  const DOC_TOTAL_CAP = 90000;   // across all of them, to stay inside localStorage
  const isTextual = file => /^text\//.test(file.type) || /\.(csv|tsv|txt|md|json|rtf)$/i.test(file.name);
  const prettySize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

  function docsTextBudget() {
    return (data.docs || []).reduce((n, d) => n + (d.text ? d.text.length : 0), 0);
  }
  function addDocs(files, status) {
    if (!data.docs) data.docs = [];
    const queue = Array.from(files || []);
    if (!queue.length) return;
    let pending = queue.length;
    const done = () => { if (--pending === 0) { save(); renderPage(); } };
    queue.forEach(file => {
      const entry = { name: file.name, size: file.size, type: file.type || '', note: '', text: '' };
      if (!isTextual(file)) { data.docs.push(entry); done(); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const room = Math.max(0, DOC_TOTAL_CAP - docsTextBudget());
        entry.text = String(reader.result || '').slice(0, Math.min(DOC_TEXT_CAP, room));
        entry.truncated = entry.text.length < String(reader.result || '').length;
        data.docs.push(entry);
        digestDoc(entry);
        done();
      };
      reader.onerror = () => { data.docs.push(entry); done(); };
      reader.readAsText(file);
    });
    if (status) { status.hidden = false; status.textContent = queue.length === 1 ? 'Adding 1 document…' : `Adding ${queue.length} documents…`; }
  }

  /* Read the document once, when it lands. Everything downstream — the review
     on every step, the questions, the synthesis — then carries 700 characters
     of what it SAYS instead of the file itself. Failure is quiet on purpose:
     a summary that didn't come back costs the brief nothing, and the file is
     still listed. */
  async function digestDoc(entry) {
    if (!entry || !entry.text || entry.digest || entry.digesting) return;
    entry.digesting = true;
    renderPage();
    try {
      const r = await Gemini.digest(entry.name, entry.text);
      entry.digest = (r && r.digest) || '';
    } catch { /* listed but unread; the brief still carries the name */ }
    entry.digesting = false;
    save(); renderPage();
  }

  function docsNode(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field full';
    if (f.label) wrap.appendChild(makeLabel(f.label, f.help));

    const zone = document.createElement('div');
    zone.className = 'dropzone docs-zone';
    zone.innerHTML =
      '<div class="dz-inner">' +
      '<svg class="gstar"><use href="#star"/></svg>' +
      '<div class="dz-text"><b>Add research &amp; input</b>' +
      '<span>Decks, trackers, transcripts, notes — drop them in or choose files</span></div>' +
      '<button type="button" class="dz-btn">Choose files…</button>' +
      '<input type="file" multiple hidden>' +
      '</div><div class="dz-status" hidden></div>';
    const input = zone.querySelector('input[type=file]');
    const status = zone.querySelector('.dz-status');
    zone.querySelector('.dz-btn').addEventListener('click', e => { e.stopPropagation(); input.click(); });
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => addDocs(input.files, status));
    ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('over'); }));
    ['dragleave', 'dragend'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('over'); }));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('over');
      addDocs(e.dataTransfer.files, status);
    });
    wrap.appendChild(zone);

    const list = document.createElement('div');
    list.className = 'docs';
    const rows = Array.isArray(data.docs) ? data.docs : [];
    rows.forEach((d, idx) => {
      const row = document.createElement('div');
      row.className = 'doc-row';
      const meta = document.createElement('div');
      meta.className = 'doc-meta';
      const state = d.digesting ? ' · reading…' : d.digest ? ' · read — the assistant knows what it says' :
        d.text ? ' · text read' + (d.truncated ? ' (trimmed)' : '') : ' · listed only';
      meta.innerHTML = '<b>' + escapeHtml(d.name) + '</b><span>' + prettySize(d.size || 0) + state + '</span>';
      if (d.digest) meta.title = d.digest;
      const note = document.createElement('input');
      note.type = 'text';
      note.placeholder = 'Why it matters — one line';
      note.value = d.note || '';
      note.addEventListener('input', () => { d.note = note.value; save(); });
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'doc-x'; del.setAttribute('aria-label', 'Remove ' + d.name);
      del.textContent = '×';
      del.addEventListener('click', () => { data.docs.splice(idx, 1); save(); renderPage(); });
      row.append(meta, note, del);
      list.appendChild(row);
    });
    if (rows.length) {
      const foot = document.createElement('p');
      foot.className = 'docs-foot';
      foot.textContent = 'Files stay on this device. The brief lists them so the planning team knows what to ask you for — send the files on the way you normally would.';
      list.appendChild(foot);
    }
    wrap.appendChild(list);
    return wrap;
  }

  function dropzoneNode(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field full';
    const zone = document.createElement('div');
    zone.className = 'dropzone';
    zone.innerHTML =
      '<div class="dz-inner">' +
      '<svg class="gstar"><use href="#star"/></svg>' +
      '<div class="dz-text"><b>Start from a document</b><span>Drag in PDFs, CSVs or data files — Gemini fills the brief for you</span></div>' +
      '<button type="button" class="dz-btn">Choose or paste…</button>' +
      '<input type="file" accept=".pdf,.csv,.tsv,.txt,.md,.json,image/*" hidden>' +
      '</div><div class="dz-status" hidden></div>';
    const input = zone.querySelector('input[type=file]');
    const status = zone.querySelector('.dz-status');
    zone.querySelector('.dz-btn').addEventListener('click', e => { e.stopPropagation(); openIngest(); });
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { if (input.files[0]) ingestFile(input.files[0], status); });
    ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('over'); }));
    ['dragleave', 'dragend'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('over'); }));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('over');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) ingestFile(file, status);
    });
    wrap.appendChild(zone);
    return wrap;
  }
  function fileToPayload(file) {
    return new Promise(resolve => {
      const isText = /^text\//.test(file.type) || /\.(csv|tsv|txt|md|json)$/i.test(file.name);
      const reader = new FileReader();
      if (isText) {
        reader.onload = () => resolve({ text: 'Source file: ' + file.name + '\n\n' + reader.result });
        reader.readAsText(file);
      } else {
        reader.onload = () => resolve({ file: { mimeType: file.type || 'application/pdf', data: String(reader.result).split(',')[1] } });
        reader.readAsDataURL(file);
      }
    });
  }
  async function applyIngest(payload) {
    const r = await Gemini.ingest(payload);
    let filled = 0;
    const f = r.fields || {};
    const snapshot = { data: JSON.parse(JSON.stringify(data)), editedBrief: editedBrief };
    Object.keys(f).forEach(k => { if (f[k] && String(f[k]).trim()) { data[k] = String(f[k]); filled++; } });
    if (Array.isArray(r.assets) && r.assets.length) {
      data.assets = r.assets.map(a => ({ name: a.name || '', status: a.status || '', ready: a.ready || '' }));
      filled++;
    }
    if (filled) undoState = snapshot;
    save(); renderPage();
    return { filled, summary: r.summary };
  }
  async function ingestFile(file, status) {
    status.hidden = false;
    status.innerHTML = '<svg class="gstar sp"><use href="#star"/></svg> Reading ' + escapeHtml(file.name) + '…';
    try {
      const payload = await fileToPayload(file);
      const res = await applyIngest(payload);
      if (res.filled) toastAction(res.summary || `Filled ${res.filled} field${res.filled > 1 ? 's' : ''} — review your answers`, 'Undo', doUndo);
      else toast('Nothing could be extracted from that file');
    } catch (e) {
      toast(e && e.status === 503 ? 'Add the Gemini key to enable this.' : 'Could not read that file.');
    }
  }

  function pillsNode(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field full';
    wrap.appendChild(makeLabel(f.label, f.help));

    let sel = Array.isArray(data[f.id]) ? data[f.id].slice() : (data[f.id] ? [String(data[f.id])] : []);
    data[f.id] = sel;
    let syncOther = () => {};

    function toggle(val, pill) {
      const i = sel.indexOf(val);
      if (i >= 0) { sel.splice(i, 1); pill.classList.remove('on'); }
      else { sel.push(val); pill.classList.add('on'); }
      data[f.id] = sel; save(); markRail(); syncOther();
    }
    function makePill(val) {
      const p = document.createElement('button');
      p.type = 'button'; p.className = 'pill' + (sel.includes(val) ? ' on' : '');
      const ck = document.createElement('span'); ck.className = 'ck'; ck.textContent = '✓';
      p.appendChild(ck); p.appendChild(document.createTextNode(val));
      return p;
    }
    function pillRow(options) {
      const row = document.createElement('div');
      row.className = 'pill-row';
      options.forEach(o => {
        const p = makePill(o);
        p.addEventListener('click', () => toggle(o, p));
        row.appendChild(p);
      });
      return row;
    }
    const box = document.createElement('div');
    box.className = 'pill-groups';
    wrap.appendChild(box);
    const groups = f.optgroups || [{ label: null, options: f.options || [] }];
    const syncs = [];
    groups.forEach(g => {
      const set = document.createElement('div');
      set.className = 'pill-set';
      if (g.label) { const h = document.createElement('div'); h.className = 'pill-group'; h.textContent = g.label; set.appendChild(h); }
      const row = pillRow(g.options);

      /* An Other per group, each with the field that explains it. One shared
         box below all of them could not say WHICH kind of growth was meant,
         and an Other with nowhere to write is just an unanswered question. */
      if (g.otherId) {
        const val = 'Other — ' + g.label;
        const p = makePill(val);
        p.classList.add('pill-other');
        row.appendChild(p);
        set.appendChild(row);

        const other = document.createElement('input');
        other.type = 'text'; other.id = 'f_' + g.otherId;
        other.placeholder = g.otherPlaceholder || 'Describe it in your own words';
        other.setAttribute('aria-label', g.label + ' — other');
        if (data[g.otherId] != null) other.value = data[g.otherId];
        other.addEventListener('input', () => { data[g.otherId] = other.value; save(); markRail(); });
        const holder = wrapClear(other, false);
        holder.classList.add('other-holder');
        set.appendChild(holder);

        const sync = opts => {
          const on = sel.includes(val);
          holder.style.display = on ? '' : 'none';
          // asked a question, so put the cursor where the answer goes
          if (on && opts && opts.focus) other.focus();
        };
        syncs.push(sync);
        p.addEventListener('click', () => { toggle(val, p); sync({ focus: true }); });
        sync();
      } else {
        set.appendChild(row);
      }
      box.appendChild(set);
    });
    syncOther = () => syncs.forEach(fn => fn());

    if (f.otherField) {
      const set = document.createElement('div');
      set.className = 'pill-set';
      const orow = document.createElement('div');
      orow.className = 'pill-row';
      const op = makePill('Other');
      op.addEventListener('click', () => toggle('Other', op));
      orow.appendChild(op);
      set.appendChild(orow);
      box.appendChild(set);
      const other = document.createElement('input');
      other.type = 'text'; other.id = 'f_' + f.id + 'Other';
      other.placeholder = f.otherPlaceholder || 'Describe it in your own words';
      other.id = 'f_' + f.otherId;
      if (data[f.otherId] != null) other.value = data[f.otherId];
      other.addEventListener('input', () => { data[f.id + 'Other'] = other.value; save(); markRail(); });
      const otherHolder = wrapClear(other, false);
      wrap.appendChild(otherHolder);
      const legacy = () => { otherHolder.style.display = sel.includes('Other') ? '' : 'none'; };
      syncs.push(legacy);
      legacy();
    }
    return wrap;
  }

  function assetsNode(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field full';
    wrap.appendChild(makeLabel(f.label, f.help));

    const list = document.createElement('div');
    list.className = 'assets';
    wrap.appendChild(list);

    const blankRow = () => ({ name: '', type: '', count: '', status: '', ready: '' });
    if (!Array.isArray(data.assets) || !data.assets.length) data.assets = [blankRow()];

    function renderRows() {
      list.innerHTML = '';
      data.assets.forEach((row, idx) => {
        const r = document.createElement('div');
        r.className = 'asset-row';

        const name = document.createElement('input');
        name.type = 'text'; name.placeholder = 'Asset (e.g. Hero film :30)'; name.value = row.name || '';
        name.addEventListener('input', () => { row.name = name.value; save(); markRail(); });

        const status = document.createElement('select');
        const blank = document.createElement('option'); blank.value = ''; blank.textContent = 'Status…';
        status.appendChild(blank);
        SCHEMA.assetStatuses.forEach(s => {
          const o = document.createElement('option'); o.value = s; o.textContent = s;
          if (row.status === s) o.selected = true;
          status.appendChild(o);
        });
        status.addEventListener('change', () => { row.status = status.value; save(); markRail(); });

        /* WHAT IT IS AND HOW MANY. A plan built against "three films" and one
           built against "three social cutdowns" are not the same plan, and the
           count is what says whether a channel can be run at all. */
        const type = document.createElement('select');
        const noType = document.createElement('option'); noType.value = ''; noType.textContent = 'Type…';
        type.appendChild(noType);
        SCHEMA.assetTypes.forEach(t => {
          const o = document.createElement('option'); o.value = t; o.textContent = t;
          if (row.type === t) o.selected = true;
          type.appendChild(o);
        });
        type.addEventListener('change', () => { row.type = type.value; save(); markRail(); });

        const count = document.createElement('input');
        count.type = 'text'; count.inputMode = 'numeric'; count.className = 'asset-count';
        count.placeholder = 'How many'; count.value = row.count || '';
        count.addEventListener('input', () => { row.count = count.value; save(); });

        const ready = document.createElement('input');
        ready.type = 'text'; ready.placeholder = 'Ready when'; ready.value = row.ready || '';
        ready.addEventListener('input', () => { row.ready = ready.value; save(); });

        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'rm'; rm.textContent = '×'; rm.title = 'Remove';
        rm.addEventListener('click', () => {
          data.assets.splice(idx, 1);
          if (!data.assets.length) data.assets = [blankRow()];
          save(); renderRows(); markRail();
        });

        r.append(name, type, count, status, ready, rm);
        list.appendChild(r);
      });
    }
    renderRows();

    const add = document.createElement('button');
    add.type = 'button'; add.className = 'add-asset'; add.textContent = '+ Add asset';
    add.addEventListener('click', () => { data.assets.push(blankRow()); save(); renderRows(); });
    wrap.appendChild(add);
    return wrap;
  }

  /* ---------- page rendering ----------
     Every section, once, in schema order. There is no active step to keep and
     nothing to re-render on navigation — moving around the page is scrolling,
     so the only thing that changes as you type is the rail's readiness. */
  function renderPage() {
    el.fields.innerHTML = '';
    SCHEMA.sections.forEach((s, i) => {
      const sec = document.createElement('section');
      sec.className = 'sec';
      sec.id = 'sec_' + s.id;

      const head = document.createElement('header');
      head.className = 'sechead';
      head.innerHTML = `<h2><span class="secnum">${i + 1}</span> ${escapeHtml(s.title)}</h2>` +
        (s.sub ? `<p>${escapeHtml(s.sub)}</p>` : '');
      sec.appendChild(head);

      /* The dropzone is the page's own affordance rather than one of the
         plan's fields, so it renders bare, above the card. */
      const bare = s.fields.filter(f => f.type === 'dropzone');
      const rest = s.fields.filter(f => f.type !== 'dropzone');
      bare.forEach(f => { const n = fieldNode(f); n.classList.add('card-none'); sec.appendChild(n); });
      if (rest.length) {
        const card = document.createElement('div');
        card.className = 'card';
        rest.forEach(f => card.appendChild(fieldNode(f)));
        sec.appendChild(card);
      }
      el.fields.appendChild(sec);
    });
    renderRail();
    renderCoPilot();
    watchSections();
  }

  /* Which section the reader is in, for the rail's dot. Cheap and passive —
     an observer rather than a scroll handler, so a long page does no work
     between sections crossing the line. */
  let secObserver = null;
  function watchSections() {
    if (secObserver) secObserver.disconnect();
    if (typeof IntersectionObserver !== 'function') return;
    secObserver = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const id = e.target.id.replace(/^sec_/, '');
        document.querySelectorAll('.step').forEach(b =>
          b.classList.toggle('here', b.dataset.sec === id));
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    SCHEMA.sections.forEach(s => {
      const n = document.getElementById('sec_' + s.id);
      if (n) secObserver.observe(n);
    });
  }

  function goTo(id) {
    const n = document.getElementById('sec_' + id);
    if (!n) return;
    showForm();
    n.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function markRail() { renderRail(); }
  /* ---------- co-pilot ----------
     Two controls where there were six. Live per-field review came off with the
     wizard: it existed to catch a contradiction with a step you could no longer
     see, and on one page you can see it. What is left is the pair that earn
     their cost — being interviewed instead of facing the form, and the draft
     that turns answers into the brief a strategist reads. */
  function setStatus(state) {
    el.coStatus.className = 'live ' + state;
    el.coStatus.textContent = state === 'thinking' ? 'working' : 'ready';
  }

  function renderCoPilot() {
    el.coBody.innerHTML =
      `<div class="co-empty">Fill the page in any order — it saves as you go.` +
      ` <strong>Interview me</strong> asks for it a question at a time instead` +
      ` of leaving you to face the whole page.</div>`;
  }
  /* ---------- brief view ---------- */
  function showForm() { el.formView.hidden = false; el.briefView.hidden = true; onBrief = false; renderRail(); }
  function showBrief() {
    el.formView.hidden = true; el.briefView.hidden = false;
    el.briefDoc.innerHTML = editedBrief || Brief.toHtml(Brief.toMarkdown(data));
    decorateSections();
    renderHandoffReadiness();
    onBrief = true; renderRail();
  }
  /* WHAT THE PLANNING TEAM WILL CHASE, on the brief itself. The list is the
     schema's, not a second copy written out here — a hand-kept list is how a
     field gets added to the page and quietly never chased. */
  function validateBrief() {
    return SCHEMA.chased()
      .filter(id => !filled(id))
      .map(id => ({ label: LABEL[id] || id, field: id }));
  }
  function renderHandoffReadiness() {
    const box = el.readiness;
    const issues = validateBrief();
    if (!issues.length) {
      box.className = 'readiness ok';
      box.innerHTML = '<span class="rd-lead">✓ Ready to hand off</span> — everything the planning team chases is answered.';
      return;
    }
    box.className = 'readiness warn';
    /* Worded as what happens next rather than as a failure. These are gaps the
       planning team will come back about, not errors — and a client who cannot
       answer one yet should hand the brief over saying so. */
    box.innerHTML = '<span class="rd-lead">' + issues.length +
      (issues.length === 1 ? ' answer' : ' answers') + ' the planning team will chase:</span>';
    const row = document.createElement('span');
    row.className = 'readiness-chips';
    issues.forEach(is => {
      const c = document.createElement('button');
      c.type = 'button'; c.className = 'rd-chip'; c.textContent = is.label;
      if (is.field) c.addEventListener('click', () => goToField(is.field));
      row.appendChild(c);
    });
    box.appendChild(row);
  }
  function cleanBriefHtml() {
    const clone = el.briefDoc.cloneNode(true);
    clone.querySelectorAll('.sec-ai').forEach(b => b.remove());
    return clone.innerHTML;
  }
  function saveBrief() {
    editedBrief = cleanBriefHtml();
    try { localStorage.setItem(BRIEF_KEY, editedBrief); } catch {}
  }

  /* ---------- per-section refine ---------- */
  const REFINE_PRESETS = [
    { label: 'More concise', instr: 'Make this section more concise without losing key facts.' },
    { label: 'Punchier', instr: 'Make this section punchier and more energetic; tighten the language.' },
    { label: 'Expand', instr: 'Expand this section with a bit more useful detail, staying faithful to the facts.' },
    { label: 'Simplify', instr: 'Simplify the language — plain, clear, and jargon-free.' },
    { label: 'Fix grammar & flow', instr: 'Fix grammar and improve the flow; keep the meaning intact.' }
  ];
  let refineTarget = null;
  let refineOverlay = null;
  let pendingRefine = null;   // a rewrite that has been read but not accepted

  function decorateSections() {
    el.briefDoc.querySelectorAll('h2').forEach(h2 => {
      if (h2.querySelector('.sec-ai')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sec-ai';
      btn.setAttribute('contenteditable', 'false');
      btn.setAttribute('data-tip', 'Refine this section with Gemini');
      btn.innerHTML = '<svg class="gstar"><use href="#starw"/></svg>';
      btn.addEventListener('click', (e) => { e.preventDefault(); openRefine(h2); });
      h2.appendChild(btn);
    });
  }
  function sectionNodes(h2) {
    const nodes = [h2];
    let n = h2.nextSibling;
    while (n && n.nodeName !== 'H2') { nodes.push(n); n = n.nextSibling; }
    return nodes;
  }
  function sectionMarkdown(h2) {
    const tmp = document.createElement('div');
    sectionNodes(h2).forEach(n => tmp.appendChild(n.cloneNode(true)));
    tmp.querySelectorAll('.sec-ai').forEach(b => b.remove());
    return Brief.htmlToMarkdown(tmp);
  }
  function headingText(h2) {
    const clone = h2.cloneNode(true);
    clone.querySelectorAll('.sec-ai').forEach(b => b.remove());
    return (clone.textContent || 'section').trim();
  }
  function buildOverlay() {
    const ov = document.createElement('div');
    ov.className = 'refine-overlay';
    ov.hidden = true;
    ov.innerHTML =
      '<div class="refine-card" role="dialog" aria-modal="true">' +
      '<div class="refine-hd"><svg class="gstar"><use href="#star"/></svg> Refine <span class="rf-name"></span>' +
      '<button class="rf-close" type="button" aria-label="Close">×</button></div>' +
      '<div class="rf-actions"></div>' +
      '<textarea class="rf-custom" placeholder="Or type your own instruction…" rows="2"></textarea>' +
      '<div class="rf-foot"><button class="btn primary rf-apply" type="button">Apply</button></div>' +
      '<div class="rf-loading" hidden><svg class="gstar"><use href="#star"/></svg> Refining…</div>' +
      /* Nothing reaches the brief until this is committed. The rewrite is a
         proposal you read next to what it would replace — a model that
         rewrites your words should have to show them to you first. */
      '<div class="rf-preview" hidden>' +
        '<div class="rf-prev-note">Nothing has changed in your brief yet.</div>' +
        '<div class="rf-diff">' +
          '<div class="rf-col"><h4>Current</h4><div class="rf-body rf-before"></div></div>' +
          '<div class="rf-col"><h4>Proposed</h4><div class="rf-body rf-after"></div></div>' +
        '</div>' +
        '<div class="rf-prev-foot">' +
          '<button class="rf-discard" type="button">Discard</button>' +
          '<button class="rf-again" type="button">Try another instruction</button>' +
          '<button class="btn primary rf-commit" type="button">Commit to brief</button>' +
        '</div>' +
      '</div>' +
      '</div>';
    document.body.appendChild(ov);
    const actions = ov.querySelector('.rf-actions');
    REFINE_PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'rf-chip'; b.textContent = p.label;
      b.addEventListener('click', () => doRefine(p.instr));
      actions.appendChild(b);
    });
    ov.querySelector('.rf-close').addEventListener('click', closeRefine);
    ov.addEventListener('click', (e) => { if (e.target === ov) closeRefine(); });
    ov.querySelector('.rf-apply').addEventListener('click', () => {
      const c = ov.querySelector('.rf-custom').value.trim();
      if (c) doRefine(c);
    });
    ov.querySelector('.rf-commit').addEventListener('click', commitRefine);
    ov.querySelector('.rf-discard').addEventListener('click', () => { pendingRefine = null; closeRefine(); });
    ov.querySelector('.rf-again').addEventListener('click', () => { pendingRefine = null; showRefineControls(true); });
    return ov;
  }
  /* Swap between asking for a rewrite and reading the one that came back —
     they are two steps in one card, and showing both at once invites you to
     fire off another instruction while a proposal is still sitting there. */
  function showRefineControls(on) {
    const ov = refineOverlay;
    if (!ov) return;
    ['.rf-actions', '.rf-custom', '.rf-foot'].forEach(sel => { ov.querySelector(sel).hidden = !on; });
    ov.querySelector('.rf-preview').hidden = on;
    ov.querySelector('.refine-card').classList.toggle('reviewing', !on);
  }
  function openRefine(h2) {
    refineTarget = h2;
    pendingRefine = null;
    if (!refineOverlay) refineOverlay = buildOverlay();
    refineOverlay.querySelector('.rf-name').textContent = headingText(h2);
    refineOverlay.querySelector('.rf-custom').value = '';
    refineOverlay.querySelector('.rf-loading').hidden = true;
    showRefineControls(true);
    refineOverlay.hidden = false;
  }
  /* Closing always abandons an uncommitted proposal. The alternative — keeping
     it around to apply later — means a rewrite could land on a section long
     after you stopped looking at it. */
  function closeRefine() {
    if (refineOverlay) { refineOverlay.hidden = true; showRefineControls(true); }
    refineTarget = null;
    pendingRefine = null;
  }
  async function doRefine(instruction) {
    if (!refineTarget) return;
    const h2 = refineTarget;
    const heading = headingText(h2);
    const content = sectionMarkdown(h2);
    const loading = refineOverlay.querySelector('.rf-loading');
    loading.hidden = false;
    try {
      const res = await Gemini.refine(heading, content, instruction);
      let md = (res.markdown || '').trim();
      loading.hidden = true;
      if (!md) { toast('No change returned'); return; }
      if (!/^#{1,3}\s/.test(md)) md = `## ${heading}\n\n${md}`;

      /* Hold it. The section is not touched until Commit — what happens here
         is that you get to read the rewrite beside the words it would replace. */
      pendingRefine = { h2, md, heading };
      const before = refineOverlay.querySelector('.rf-before');
      const after = refineOverlay.querySelector('.rf-after');
      before.innerHTML = '';
      sectionNodes(h2).forEach(n => before.appendChild(n.cloneNode(true)));
      before.querySelectorAll('.sec-ai').forEach(b => b.remove());   // the Refine button itself is not content
      after.innerHTML = Brief.toHtml(md);
      showRefineControls(false);
    } catch (err) {
      loading.hidden = true;
      toast(err && err.status === 503 ? 'Assist is offline — add the Gemini key.' : 'Could not refine just now.');
    }
  }
  function commitRefine() {
    if (!pendingRefine) return;
    const { h2, md } = pendingRefine;
    // the heading may have been re-rendered since; bail rather than write blind
    if (!h2 || !h2.isConnected) { pendingRefine = null; closeRefine(); toast('That section is no longer open'); return; }
    pushUndo();
    const tmp = document.createElement('div');
    tmp.innerHTML = Brief.toHtml(md);
    const oldNodes = sectionNodes(h2);
    const parent = h2.parentNode;
    Array.from(tmp.childNodes).forEach(nn => parent.insertBefore(nn, h2));
    oldNodes.forEach(n => n.remove());
    decorateSections();
    saveBrief();
    pendingRefine = null;
    closeRefine();
    toastAction('Section committed', 'Undo', doUndo);
  }

  /* Drafting rewrites the whole brief, so it proposes rather than replaces:
     the draft is shown in full, and the brief on the page is left alone until
     Commit. Nothing is lost by reading it first, and a whole brief silently
     overwritten is the most expensive mistake this tool can make. */
  async function generate() {
    el.genBtn.disabled = true;
    const prev = el.genBtn.innerHTML;   // innerHTML, not text — the button holds an icon
    el.genBtn.innerHTML = '<svg class="gstar sp"><use href="#starw"/></svg> Drafting…';
    let md = null, offline = false;
    try {
      const res = await Gemini.synthesize(data);
      md = res.markdown || Brief.toMarkdown(data);
    } catch {
      md = Brief.toMarkdown(data);
      offline = true;
    }
    el.genBtn.disabled = false;
    el.genBtn.innerHTML = prev;
    if (offline) toast('Draft assist is offline — showing the brief from your inputs.');
    openDraftReview(md);
  }
  let draftModal = null, pendingDraft = null;
  function openDraftReview(md) {
    pendingDraft = md;
    if (!draftModal) draftModal = makeModal();
    draftModal.card.className = 'refine-card draft-card';
    draftModal.card.innerHTML =
      '<div class="refine-hd"><svg class="gstar"><use href="#star"/></svg> Drafted brief' +
        '<button class="rf-close" type="button" aria-label="Close">&times;</button></div>' +
      '<div class="rf-prev-note">A proposed rewrite of the whole brief. Nothing has changed yet.</div>' +
      '<div class="draft-body brief-doc"></div>' +
      '<div class="rf-prev-foot">' +
        '<button class="rf-discard" type="button">Discard</button>' +
        '<button class="btn primary rf-commit" type="button">Commit to brief</button>' +
      '</div>';
    draftModal.card.querySelector('.draft-body').innerHTML = Brief.toHtml(md);
    draftModal.card.querySelector('.rf-close').addEventListener('click', () => draftModal.close());
    draftModal.card.querySelector('.rf-discard').addEventListener('click', () => draftModal.close());
    draftModal.card.querySelector('.rf-commit').addEventListener('click', commitDraft);
    draftModal.onClose = () => { pendingDraft = null; };
    draftModal.open();
  }
  function commitDraft() {
    if (pendingDraft == null) return;
    const replaced = !!editedBrief;
    pushUndo();                       // capture before the brief on the page is replaced
    el.briefDoc.innerHTML = Brief.toHtml(pendingDraft);
    decorateSections();
    saveBrief();
    pendingDraft = null;
    draftModal.close();
    if (replaced) toastAction('Brief drafted — your earlier version was replaced', 'Undo', doUndo);
    else toastAction('Brief drafted', 'Undo', doUndo);
  }

  /* ---------- reusable modal ---------- */
  function makeModal() {
    const ov = document.createElement('div');
    ov.className = 'refine-overlay'; ov.hidden = true;
    const card = document.createElement('div');
    card.className = 'refine-card';
    ov.appendChild(card);
    /* A modal has four ways out — its ×, the backdrop, Esc, and its own code —
       and anything that must happen on close has to happen on all four. The
       interview needs to redraw the form and offer its undo, and only ever
       did on one of them. onClose is cleared before firing so a handler that
       calls close() itself does not recurse. */
    const api = {
      ov, card, onClose: null,
      open() { ov.hidden = false; },
      close() {
        ov.hidden = true;
        const fn = api.onClose;
        if (fn) { api.onClose = null; fn(); }
      }
    };
    ov.__modal = api;
    ov.addEventListener('click', e => { if (e.target === ov) api.close(); });
    document.body.appendChild(ov);
    return api;
  }
  function modalClose(m) { m.card.querySelectorAll('.rf-close').forEach(b => b.addEventListener('click', () => m.close())); }

  /* ---------- nuclear delete ----------
     The one irreversible action in the tool. Undo cannot help here: it holds a
     single snapshot in memory, and this clears the storage that snapshot would
     be written back to. So the guard is a typed phrase rather than a confirm()
     — long enough that it cannot be dismissed by reflex, and impossible to hit
     by mistake. The button stays disabled until the phrase matches. */
  const NUKE_PHRASE = 'yes, i want to reset everything';
  let nukeModal = null;
  function openNuke() {
    if (!nukeModal) nukeModal = makeModal();
    nukeModal.card.className = 'refine-card nuke-card';
    nukeModal.card.innerHTML =
      '<div class="refine-hd nuke-hd"><span class="nuke-ico">&#9762;&#65039;</span> Nuclear delete' +
        '<button class="rf-close" type="button">&times;</button></div>' +
      '<p class="nuke-warn"><b>This cannot be undone.</b> It erases every answer in every section, ' +
        'the funnel you have built, your uploaded document list and the brief itself — everything ' +
        'stored for this tool in this browser. There is no copy on a server to restore from, and ' +
        'Undo will not bring it back.</p>' +
      '<p class="nuke-save">If you might want any of it later, close this and use <b>Save to file</b> first.</p>' +
      '<label class="nuke-label">To confirm, type <code>' + NUKE_PHRASE + '</code></label>' +
      '<input class="nuke-input" type="text" autocomplete="off" autocapitalize="none" ' +
        'spellcheck="false" aria-label="Type the confirmation phrase" />' +
      '<div class="nuke-actions">' +
        '<button class="btn nuke-cancel" type="button">Cancel</button>' +
        '<button class="btn nuke-go" type="button" disabled>Delete everything</button>' +
      '</div>';
    const input = nukeModal.card.querySelector('.nuke-input');
    const go = nukeModal.card.querySelector('.nuke-go');
    /* Ends are trimmed because trailing whitespace is invisible and refusing it
       reads as a broken field; everything else must match, case included. */
    const matches = () => input.value.trim() === NUKE_PHRASE;
    const sync = () => {
      go.disabled = !matches();
      input.classList.toggle('ok', matches());
    };
    input.addEventListener('input', sync);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && matches()) detonate(); });
    go.addEventListener('click', () => { if (matches()) detonate(); });
    nukeModal.card.querySelector('.nuke-cancel').addEventListener('click', () => nukeModal.close());
    nukeModal.card.querySelector('.rf-close').addEventListener('click', () => nukeModal.close());
    nukeModal.open();
    setTimeout(() => input.focus(), 60);
  }
  function detonate() {
    data = {}; editedBrief = null; undoState = null;
    try {
      localStorage.removeItem(STORE_KEY);
      localStorage.removeItem(BRIEF_KEY);
    } catch {}
    nukeModal.close();
    showForm();
    renderPage();
    if (el.coAnswer) el.coAnswer.hidden = true;
    renderCoPilot();
    toast('Everything deleted — this is a blank brief');
  }

  /* ---------- document ingest ---------- */
  let ingestModal = null, ingestFileData = null;
  function openIngest() {
    if (!ingestModal) ingestModal = makeModal();
    ingestFileData = null;
    ingestModal.card.innerHTML =
      '<div class="refine-hd"><svg class="gstar"><use href="#star"/></svg> Start from a document<button class="rf-close" type="button">×</button></div>' +
      '<p class="co-empty" style="margin:-2px 0 10px">Paste text or upload a PDF / image / doc. Gemini fills what it can — you review before it saves.</p>' +
      '<textarea class="rf-custom ing-text" rows="5" placeholder="Paste last year&rsquo;s LTP, a research summary, a client email&hellip;"></textarea>' +
      '<div class="ing-file"><label class="rf-chip ing-pick">Choose file<input type="file" accept=".pdf,.txt,.md,image/*" hidden></label><span class="ing-name co-empty"></span></div>' +
      '<div class="rf-foot"><button class="btn primary ing-go" type="button">Extract &amp; fill</button></div>' +
      '<div class="rf-loading ing-load" hidden><svg class="gstar sp"><use href="#star"/></svg> Reading&hellip;</div>';
    modalClose(ingestModal);
    const fileInput = ingestModal.card.querySelector('input[type=file]');
    const nameEl = ingestModal.card.querySelector('.ing-name');
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0];
      if (!f) { ingestFileData = null; nameEl.textContent = ''; return; }
      const reader = new FileReader();
      reader.onload = () => { ingestFileData = { mimeType: f.type || 'application/octet-stream', data: String(reader.result).split(',')[1] }; nameEl.textContent = f.name; };
      reader.readAsDataURL(f);
    });
    ingestModal.card.querySelector('.ing-go').addEventListener('click', runIngest);
    ingestModal.open();
  }
  async function runIngest() {
    const text = ingestModal.card.querySelector('.ing-text').value.trim();
    if (!text && !ingestFileData) { toast('Paste text or choose a file first'); return; }
    const load = ingestModal.card.querySelector('.ing-load');
    const go = ingestModal.card.querySelector('.ing-go');
    load.hidden = false; go.disabled = true;
    try {
      const payload = {};
      if (text) payload.text = text;
      if (ingestFileData) payload.file = ingestFileData;
      const res = await applyIngest(payload);
      ingestModal.close();
      if (res.filled) toastAction(res.summary || `Filled ${res.filled} field${res.filled > 1 ? 's' : ''} — review your answers`, 'Undo', doUndo);
      else toast('Nothing could be extracted from that');
    } catch (e) {
      load.hidden = true; go.disabled = false;
      toast(e && e.status === 503 ? 'Add the Gemini key to enable this.' : 'Could not read that document.');
    }
  }

  /* ---------- interview mode ---------- */
  let ivModal = null, ivHistory = [], ivFilled = 0;
  function openInterview() {
    ivHistory = [];
    ivFilled = 0;
    /* One interview is one undoable act. It writes answers straight into the
       brief as you go, so anyone who tries it on a part-filled one needs a way
       back — every other action that overwrites answers offers the same. */
    pushUndo();
    if (!ivModal) ivModal = makeModal();
    ivModal.card.className = 'refine-card iv-card';
    ivModal.card.innerHTML =
      '<div class="refine-hd"><svg class="gstar"><use href="#star"/></svg> Interview me<button class="rf-close" type="button">×</button></div>' +
      '<div class="iv-log"></div>' +
      '<div class="iv-input"><input type="text" placeholder="Type your answer&hellip;" disabled><button class="btn primary iv-send" type="button" disabled>Send</button></div>' +
      '<div class="iv-foot">' +
        '<button class="iv-skip" type="button" disabled>Skip this question</button>' +
        '<span class="iv-note">Answers save as you go</span>' +
        '<button class="iv-quit" type="button">Finish &amp; close</button>' +
      '</div>';
    const input = ivModal.card.querySelector('.iv-input input');
    const send = ivModal.card.querySelector('.iv-send');
    const skip = ivModal.card.querySelector('.iv-skip');
    const submit = () => { const v = input.value.trim(); if (v) { input.value = ''; ivStep(v); } };
    send.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    /* Leaving has to be possible at every point, including mid-question: an
       interview you cannot walk out of is an interrogation. Both exits keep
       whatever it filled and offer one undo for the lot. */
    skip.addEventListener('click', () => { if (!skip.disabled) ivStep('Skip this one — ask me something else.', 'Skipped'); });
    ivModal.card.querySelector('.iv-quit').addEventListener('click', () => ivModal.close());
    ivModal.card.querySelector('.rf-close').addEventListener('click', () => ivModal.close());
    ivModal.onClose = onInterviewClosed;   // covers ×, Finish, the backdrop and Esc alike
    ivModal.open();
    ivStep(null);
  }
  function onInterviewClosed() {
    renderPage();
    if (ivFilled) toastAction(ivFilled + (ivFilled === 1 ? ' answer filled' : ' answers filled'), 'Undo', doUndo);
  }
  function ivAddMsg(role, text) {
    const log = ivModal.card.querySelector('.iv-log');
    const m = document.createElement('div');
    m.className = 'iv-msg ' + role;
    m.textContent = text;
    log.appendChild(m); log.scrollTop = log.scrollHeight;
    return m;
  }
  /* `label` is what the log shows; `userText` is what the model is told. They
     differ for a skip, where "Skipped" reads better than the instruction. */
  async function ivStep(userText, label) {
    const input = ivModal.card.querySelector('.iv-input input');
    const send = ivModal.card.querySelector('.iv-send');
    const skip = ivModal.card.querySelector('.iv-skip');
    if (userText) { ivAddMsg('user', label || userText); ivHistory.push({ role: 'user', text: userText }); }
    input.disabled = true; send.disabled = true; if (skip) skip.disabled = true;
    const thinking = ivAddMsg('ai thinking', '…');
    try {
      const r = await Gemini.interview(data, ivHistory);
      (r.updates || []).forEach(u => {
        /* ONLY A FIELD THAT EXISTS. The server's catalog is pinned to the
           schema by test, so this should never fire — but a model that invents
           an id would otherwise write an answer into storage that no control
           ever shows and no export ever reads, and the client would watch a
           question they answered fail to appear. */
        if (u.fieldId && u.value != null && FIELD_SECTION[u.fieldId]) { data[u.fieldId] = u.value; ivFilled++; }
      });
      save(); markRail();
      thinking.textContent = r.message || '';
      thinking.classList.remove('thinking');
      ivHistory.push({ role: 'assistant', text: r.message || '' });
      if (r.done) {
        input.placeholder = 'Interview complete ✓'; input.disabled = true; send.disabled = true;
        if (skip) skip.disabled = true;
        renderPage();
        if (ivFilled) toastAction('Interview complete — ' + ivFilled + ' filled', 'Undo', doUndo);
        else toast('Interview complete');
      } else {
        input.disabled = false; send.disabled = false; input.focus();
        if (skip) skip.disabled = false;
      }
    } catch (e) {
      thinking.textContent = e && e.status === 503 ? 'Add the Gemini key to enable this.' : 'Something went wrong — try again.';
      thinking.classList.remove('thinking');
      // a failed turn must not strand the interview: let them retry, skip or leave
      input.disabled = false; send.disabled = false;
      if (skip) skip.disabled = false;
    }
  }

  /* ---------- helpers ---------- */
  function escapeHtml(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  let toastTimer = null;
  function toastEl() {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    return t;
  }
  function toast(msg) {
    const t = toastEl();
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function toastAction(msg, actionLabel, fn) {
    const t = toastEl();
    t.innerHTML = '';
    const span = document.createElement('span'); span.textContent = msg; t.appendChild(span);
    const b = document.createElement('button'); b.className = 'toast-act'; b.textContent = actionLabel;
    b.addEventListener('click', () => { fn(); t.classList.remove('show'); });
    t.appendChild(b);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 6500);
  }

  /* ---------- undo for AI actions ---------- */
  let undoState = null;
  function pushUndo() { undoState = { data: JSON.parse(JSON.stringify(data)), editedBrief: editedBrief }; }
  function doUndo() {
    if (!undoState) return;
    data = undoState.data;
    editedBrief = undoState.editedBrief;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
      if (editedBrief) localStorage.setItem(BRIEF_KEY, editedBrief); else localStorage.removeItem(BRIEF_KEY);
    } catch {}
    undoState = null;
    if (onBrief) showBrief(); else renderPage();
    toast('Reverted');
  }

  /* ---------- jump to a field from a check ---------- */
  function goToField(fieldId) {
    const idx = FIELD_SECTION[fieldId];
    if (idx == null) return;
    if (onBrief) showForm();
    goTo(idx);
    setTimeout(() => {
      const input = document.getElementById('f_' + fieldId);
      if (input) {
        input.focus();
        const fld = input.closest('.field');
        if (fld) { fld.classList.add('flag'); setTimeout(() => fld.classList.remove('flag'), 1400); }
        input.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 70);
  }

  /* ---------- events ---------- */
  /* One button where there were two. There is no next step to go to, so the
     only forward move left is the one that was always the point. */
  el.nextBtn.addEventListener('click', () => {
    if (completedCount() === 0) { toast('Add some brief details before reviewing.'); return; }
    showBrief();
  });
  el.interviewBtn.addEventListener('click', openInterview);
  el.tourBtn.addEventListener('click', startTour);

  function downloadText(text, name, type) {
    const blob = new Blob([text], { type: type || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  el.saveFileBtn.addEventListener('click', () => {
    downloadText(JSON.stringify({ v: 1, data, brief: editedBrief }, null, 2),
      'LTP-Brief-' + (data.productArea || 'draft').replace(/\s+/g, '-') + '.json', 'application/json');
    toast('Saved a file — open it on any device with “Load file”');
  });
  el.loadFileBtn.addEventListener('click', () => el.loadFileInput.click());
  el.loadFileInput.addEventListener('change', () => {
    const f = el.loadFileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        // loading a file overwrites whatever is open; parse first so a bad
        // file cannot destroy the current brief on its way to failing
        const hadWork = completedCount() > 0 || !!editedBrief;
        pushUndo();
        data = parsed.data || {};
        editedBrief = parsed.brief || null;
        try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); if (editedBrief) localStorage.setItem(BRIEF_KEY, editedBrief); else localStorage.removeItem(BRIEF_KEY); } catch {}
        showForm(); renderPage();
        if (hadWork) toastAction('Brief loaded — it replaced what was open', 'Undo', doUndo);
        else toast('Brief loaded');
      } catch { toast('That file could not be read'); }
      el.loadFileInput.value = '';
    };
    reader.readAsText(f);
  });
  el.newBriefBtn.addEventListener('click', () => {
    if (!confirm('Start a new brief? This clears your current answers on this device.')) return;
    /* Was clearing undoState, which made this the one clearing action with no
       way back. It is recoverable — doUndo writes the restored answers to
       storage — so it should be offered. Nuclear delete is the one that
       genuinely is not, and says so. */
    pushUndo();
    const hadWork = completedCount() > 0 || !!editedBrief;
    data = {}; editedBrief = null;
    try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(BRIEF_KEY); } catch {}
    showForm(); renderPage();
    if (el.coAnswer) el.coAnswer.hidden = true;
    if (hadWork) toastAction('Started a new brief', 'Undo', doUndo);
    else toast('Started a new brief');
  });

  /* ---------- action sheet (consolidates secondary brief actions) ---------- */
  let sheetEl = null;
  function buildSheet() {
    const w = document.createElement('div');
    w.className = 'sheet-wrap';
    w.innerHTML =
      '<div class="sheet-scrim"></div>' +
      '<div class="sheet" role="dialog" aria-modal="true">' +
      '<div class="sheet-grab"></div>' +
      '<div class="sheet-group">' +
      '<div class="sheet-item" data-act="reset"><span class="si">↺</span> Rebuild from answers</div>' +
      '<div class="sheet-item" data-act="save"><span class="si">⤓</span> Save file</div>' +
      '<div class="sheet-item" data-act="load"><span class="si">⤒</span> Load file</div>' +
      '</div>' +
      '<div class="sheet-group"><div class="sheet-item danger" data-act="new"><span class="si">⌫</span> Start a new brief</div></div>' +
      '<button class="sheet-cancel" type="button">Cancel</button>' +
      '</div>';
    document.body.appendChild(w);
    const close = () => { w.classList.remove('open'); };
    w.querySelector('.sheet-scrim').addEventListener('click', close);
    w.querySelector('.sheet-cancel').addEventListener('click', close);
    const acts = { reset: el.resetBriefBtn, save: el.saveFileBtn, load: el.loadFileBtn, new: el.newBriefBtn };
    w.querySelectorAll('.sheet-item').forEach(it => it.addEventListener('click', () => {
      close();
      const b = acts[it.dataset.act];
      if (b) b.click();
    }));
    return w;
  }
  el.moreBtn.addEventListener('click', () => {
    if (!sheetEl) sheetEl = buildSheet();
    sheetEl.classList.add('open');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.refine-overlay:not([hidden])').forEach(o => {
        if (o.__modal) o.__modal.close(); else o.hidden = true;
      });
      document.querySelectorAll('.sheet-wrap.open').forEach(o => o.classList.remove('open'));
    }
  });
  el.editBtn.addEventListener('click', showForm);
  el.genBtn.addEventListener('click', generate);
  el.briefDoc.addEventListener('input', () => { saveBrief(); el.saveState.textContent = 'Saved ✓'; });
  el.resetBriefBtn.addEventListener('click', () => {
    // discards every inline edit; capture before, not after
    pushUndo();
    const discarded = !!editedBrief;
    editedBrief = null;
    try { localStorage.removeItem(BRIEF_KEY); } catch {}
    el.briefDoc.innerHTML = Brief.toHtml(Brief.toMarkdown(data));
    decorateSections();
    saveBrief();
    if (discarded) toastAction('Brief rebuilt — your edits were discarded', 'Undo', doUndo);
    else toast('Brief rebuilt from your answers');
  });
  el.copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(el.briefDoc.innerText); toast('Brief copied'); }
    catch { toast('Copy failed — select and copy manually'); }
  });
  // Export the brief as a PDF via the browser's print-to-PDF (print stylesheet isolates the brief).
  el.pdfBtn.addEventListener('click', () => {
    const prev = document.title;
    document.title = 'LTP Brief — ' + (data.productArea || 'Draft');
    window.print();
    setTimeout(() => { document.title = prev; }, 600);
  });

  /* ---------- hover tooltips ---------- */
  let tipEl = null;
  let tipFor = null;   // which element the visible tip belongs to (touch toggling needs to know)
  function initTooltips() {
    document.addEventListener('mouseover', e => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (t) showTip(t);
    });
    document.addEventListener('mouseout', e => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (t) hideTip();
    });
    /* A touch screen never hovers, so on a phone every one of these
       descriptions was unreachable. There a tap toggles the tip and a tap
       anywhere else dismisses it; on a mouse, click is left alone so it does
       not fight the hover. */
    document.addEventListener('click', e => {
      if (!matchMedia('(hover: none)').matches) return;
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (!t) { hideTip(); return; }
      if (tipFor === t) hideTip(); else showTip(t);
    });
    document.addEventListener('focusin', e => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (t) showTip(t);
    });
    document.addEventListener('focusout', hideTip);
    window.addEventListener('scroll', hideTip, true);
    /* A tip hanging over a control while you are using it is just something in
       the way. Mouse only: on touch, pointerdown precedes the click that
       toggles the tip, so hiding here would make it impossible to open. */
    document.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') hideTip(); });
  }
  function showTip(target) {
    const text = target.getAttribute('data-tip');
    if (!text) return;
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; document.body.appendChild(tipEl); }
    tipFor = target;
    tipEl.textContent = text;
    tipEl.style.opacity = '0';
    const r = target.getBoundingClientRect();
    const tr = tipEl.getBoundingClientRect();
    /* Sit clear of what it describes. Tight against the control, the bubble
       reads as part of it and covers whatever label sits alongside. */
    const GAP = 13;
    let top = r.top - tr.height - GAP;
    let placeBelow = false;
    if (top < 8) { top = r.bottom + GAP; placeBelow = true; }
    let left = r.left + r.width / 2 - tr.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
    tipEl.style.top = top + 'px';
    tipEl.style.left = left + 'px';
    tipEl.classList.toggle('below', placeBelow);
    tipEl.style.opacity = '1';
  }
  function hideTip() { if (tipEl) tipEl.style.opacity = '0'; tipFor = null; }

  /* ---------- coach marks (guided tour) ---------- */
  const TOUR_KEY = 'ltpbrief.tour';
  const TOUR_STEPS = [
    { sel: '#fields', title: 'One page, eleven sections', body: 'Answer in any order — it saves as you go. Nothing here blocks you from finishing, so if you do not know something yet, leave it and say so.' },
    { sel: '#steps', title: 'Jump around', body: 'The rail lists every section and fills in its dot as you answer. Above it is the count of what the planning team will chase you for — click it to go straight there.' },
    { sel: '.co-tools', title: 'Or let Gemini ask you', body: 'Facing a long page is not the only way to fill one in. Interview me asks for it a question at a time and writes the answers into the fields as you go.' },
    { sel: '.brief-nav', title: 'Finish here', body: 'Open the Full Brief to review, edit inline, refine any section, and export. Re-open this tour anytime from the “?” bottom-left.' }
  ];
  function startTour() {
    hideTip();
    let i = 0;
    const overlay = document.createElement('div');
    overlay.className = 'tour';
    const spot = document.createElement('div'); spot.className = 'tour-spot';
    const card = document.createElement('div'); card.className = 'tour-card';
    overlay.append(spot, card);
    document.body.appendChild(overlay);
    function end() { overlay.remove(); window.removeEventListener('resize', render); try { localStorage.setItem(TOUR_KEY, '1'); } catch {} }
    function render() {
      while (i < TOUR_STEPS.length && !document.querySelector(TOUR_STEPS[i].sel)) i++;
      if (i >= TOUR_STEPS.length) { end(); return; }
      const s = TOUR_STEPS[i];
      const t = document.querySelector(s.sel);
      const r = t.getBoundingClientRect();
      const pad = 6;
      spot.style.top = (r.top - pad) + 'px';
      spot.style.left = (r.left - pad) + 'px';
      spot.style.width = (r.width + pad * 2) + 'px';
      spot.style.height = (r.height + pad * 2) + 'px';
      card.innerHTML =
        `<div class="tour-t">${escapeHtml(s.title)}</div><div class="tour-b">${escapeHtml(s.body)}</div>` +
        `<div class="tour-foot"><span class="tour-count">${i + 1} / ${TOUR_STEPS.length}</span>` +
        `<span class="tour-btns"><button class="tour-skip" type="button">Skip</button>` +
        `<button class="tour-next btn primary" type="button">${i === TOUR_STEPS.length - 1 ? 'Done' : 'Next'}</button></span></div>`;
      // position card below the spot if room, else above
      const cw = 300;
      let ctop = r.bottom + 14, below = true;
      if (ctop + 150 > window.innerHeight) { ctop = r.top - 14 - 150; below = false; }
      let cleft = r.left + r.width / 2 - cw / 2;
      cleft = Math.max(12, Math.min(cleft, window.innerWidth - cw - 12));
      card.style.top = Math.max(12, ctop) + 'px';
      card.style.left = cleft + 'px';
      card.querySelector('.tour-next').onclick = () => { i++; render(); };
      card.querySelector('.tour-skip').onclick = end;
    }
    window.addEventListener('resize', render);
    render();
  }
  /* Wait for the door, don't race it. Whether a gate is configured is an
     answer that comes back over the network, so a timer set at boot would
     start the tour on top of the lock screen every time. js/gate.js fires
     `ltp:unlocked` on every path that leaves the tool usable — gate passed,
     gate absent, gate unreachable — so this stays correct with no gate too. */
  function maybeTour() {
    let seen = null;
    try { seen = localStorage.getItem(TOUR_KEY); } catch {}
    if (seen) return;
    document.addEventListener('ltp:unlocked', () => setTimeout(startTour, 700), { once: true });
  }

  /* ---------- theme ---------- */
  const THEME_KEY = 'ltpbrief.theme';
  const themeToggle = document.getElementById('themeToggle');
  const themeLabel = document.getElementById('themeLabel');
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    themeToggle.setAttribute('aria-checked', String(t === 'dark'));
    themeLabel.textContent = t === 'dark' ? 'Dark' : 'Light';
    try { localStorage.setItem(THEME_KEY, t); } catch {}
  }
  setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  themeToggle.addEventListener('click', () => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  // Mobile: tap the co-pilot header to open/close the drawer.
  const cohdEl = document.querySelector('.cohd');
  if (cohdEl) cohdEl.addEventListener('click', e => {
    if (e.target.closest('.co-toggle')) return;   // desktop collapse has its own handler
    document.getElementById('copilot').classList.toggle('open');
  });

  /* Collapsing the Gemini panel. Open by default — it is the point of the tool
     — but it holds a third of the width, and someone writing long answers
     wants that back. The choice is remembered, because re-collapsing it on
     every load would be its own small annoyance. */
  const CO_KEY = 'ltpbrief.copilot';
  const coToggle = document.getElementById('coToggle');
  function setCopilot(collapsed) {
    el.app.classList.toggle('co-collapsed', collapsed);
    if (coToggle) {
      coToggle.setAttribute('aria-expanded', String(!collapsed));
      const label = (collapsed ? 'Expand' : 'Collapse') + ' the Gemini panel';
      coToggle.setAttribute('aria-label', label);
      coToggle.setAttribute('data-tip', label);
    }
    try { localStorage.setItem(CO_KEY, collapsed ? '1' : '0'); } catch {}
  }
  if (coToggle) {
    coToggle.addEventListener('click', e => {
      e.stopPropagation();   // the header click toggles the mobile drawer
      setCopilot(!el.app.classList.contains('co-collapsed'));
    });
    let saved = null;
    try { saved = localStorage.getItem(CO_KEY); } catch {}
    if (saved === '1') setCopilot(true);
  }

  /* ---------- boot ---------- */
  renderPage();
  initTooltips();
  /* Written back straight away. A migration that only lives in memory runs
     again on the next load, and the second run would append the parked answers
     a second time. */
  if (migrated) {
    save();
    toast('This brief was written on the older form — your answers were kept, and anything without a field now sits under “Research and data”.');
  }
  maybeTour();
})();
