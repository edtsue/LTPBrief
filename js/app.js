/* App controller: renders the active step, persists to localStorage,
   drives step navigation, and orchestrates the Gemini co-pilot. */

(() => {
  const STORE_KEY = 'ltpbrief.v1';
  const steps = SCHEMA.steps;

  const el = {
    steps: document.getElementById('steps'),
    progLabel: document.getElementById('progLabel'),
    progFill: document.getElementById('progFill'),
    stepTitle: document.getElementById('stepTitle'),
    stepSub: document.getElementById('stepSub'),
    fields: document.getElementById('fields'),
    backBtn: document.getElementById('backBtn'),
    nextBtn: document.getElementById('nextBtn'),
    saveState: document.getElementById('saveState'),
    coStatus: document.getElementById('coStatus'),
    coBody: document.getElementById('coBody'),
    formView: document.getElementById('formView'),
    briefView: document.getElementById('briefView'),
    briefDoc: document.getElementById('briefDoc'),
    genBtn: document.getElementById('genBtn'),
    copyBtn: document.getElementById('copyBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    gdocBtn: document.getElementById('gdocBtn'),
    editBtn: document.getElementById('editBtn')
  };

  let data = load();
  let current = 0;
  let assistTimer = null;
  let assistSeq = 0;              // guards against out-of-order responses
  const assistCache = {};        // stepId -> last result

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch { return {}; }
  }
  let saveTimer = null;
  function save() {
    el.saveState.textContent = 'Saving…';
    el.saveState.classList.add('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
      el.saveState.textContent = 'Saved ✓';
      el.saveState.classList.remove('saving');
    }, 400);
  }

  /* ---------- completion ---------- */
  function stepFilled(step) {
    let any = false;
    step.groups.forEach(g => g.fields.forEach(f => {
      if (f.type === 'assets') { if ((data.assets || []).some(r => r && r.name)) any = true; }
      else if (data[f.id] != null && String(data[f.id]).trim() !== '') any = true;
    }));
    return any;
  }
  function completedCount() { return steps.filter(stepFilled).length; }

  /* ---------- rail ---------- */
  function renderRail() {
    el.steps.innerHTML = '';
    steps.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'step' + (i === current ? ' active' : '') + (i !== current && stepFilled(s) ? ' done' : '');
      b.innerHTML = `<span class="num">${i === current || !stepFilled(s) ? (i + 1) : '✓'}</span> ${s.name}`;
      b.addEventListener('click', () => goTo(i));
      el.steps.appendChild(b);
    });
    const pct = Math.round((completedCount() / steps.length) * 100);
    el.progLabel.textContent = `Step ${current + 1} of ${steps.length} · ${pct}% complete`;
    el.progFill.style.width = Math.max(pct, (current + 1) / steps.length * 100 * 0) + '%';
    el.progFill.style.width = pct + '%';
  }

  /* ---------- field rendering ---------- */
  function fieldNode(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field' + (f.full ? ' full' : '');
    wrap.dataset.field = f.id;

    if (f.type === 'assets') { return assetsNode(f); }

    const label = document.createElement('label');
    label.textContent = f.label;
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
      if (f.optgroups) {
        f.optgroups.forEach(g => {
          const og = document.createElement('optgroup');
          og.label = g.label;
          g.options.forEach(o => addOpt(o, og));
          input.appendChild(og);
        });
      } else {
        (f.options || []).forEach(o => addOpt(o, input));
      }
      if (f.otherField) addOpt('Other', input);
    } else {
      input = document.createElement('input');
      input.type = 'text';
    }
    input.id = 'f_' + f.id;
    input.placeholder = f.placeholder || '';
    if (data[f.id] != null) input.value = data[f.id];

    input.addEventListener('input', () => { data[f.id] = input.value; save(); scheduleAssist(); markRail(); });
    if (f.type === 'select') input.addEventListener('change', () => runAssist());
    input.addEventListener('blur', () => runAssist());
    wrap.appendChild(input);

    // "Other" free-text companion for selects that allow it.
    if (f.type === 'select' && f.otherField) {
      const other = document.createElement('input');
      other.type = 'text';
      other.id = 'f_' + f.id + 'Other';
      other.placeholder = f.otherPlaceholder || 'Describe it in your own words';
      if (data[f.id + 'Other'] != null) other.value = data[f.id + 'Other'];
      const syncOther = () => { other.style.display = input.value === 'Other' ? 'block' : 'none'; };
      syncOther();
      other.addEventListener('input', () => { data[f.id + 'Other'] = other.value; save(); scheduleAssist(); markRail(); });
      other.addEventListener('blur', () => runAssist());
      input.addEventListener('change', syncOther);
      wrap.appendChild(other);
    }
    return wrap;
  }

  function assetsNode(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field full';
    const label = document.createElement('label');
    label.textContent = f.label;
    wrap.appendChild(label);

    const list = document.createElement('div');
    list.className = 'assets';
    wrap.appendChild(list);

    if (!Array.isArray(data.assets) || !data.assets.length) data.assets = [{ name: '', status: '', ready: '' }];

    function renderRows() {
      list.innerHTML = '';
      data.assets.forEach((row, idx) => {
        const r = document.createElement('div');
        r.className = 'asset-row';

        const name = document.createElement('input');
        name.type = 'text'; name.placeholder = 'Asset (e.g. Hero film :30)'; name.value = row.name || '';
        name.addEventListener('input', () => { row.name = name.value; save(); scheduleAssist(); markRail(); });
        name.addEventListener('blur', () => runAssist());

        const status = document.createElement('select');
        const blank = document.createElement('option'); blank.value = ''; blank.textContent = 'Status…';
        status.appendChild(blank);
        SCHEMA.assetStatuses.forEach(s => {
          const o = document.createElement('option'); o.value = s; o.textContent = s;
          if (row.status === s) o.selected = true;
          status.appendChild(o);
        });
        status.addEventListener('change', () => { row.status = status.value; save(); runAssist(); markRail(); });

        const ready = document.createElement('input');
        ready.type = 'text'; ready.placeholder = 'Ready when'; ready.value = row.ready || '';
        ready.addEventListener('input', () => { row.ready = ready.value; save(); scheduleAssist(); });
        ready.addEventListener('blur', () => runAssist());

        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'rm'; rm.textContent = '×'; rm.title = 'Remove';
        rm.addEventListener('click', () => {
          data.assets.splice(idx, 1);
          if (!data.assets.length) data.assets = [{ name: '', status: '', ready: '' }];
          save(); renderRows(); markRail();
        });

        r.append(name, status, ready, rm);
        list.appendChild(r);
      });
    }
    renderRows();

    const add = document.createElement('button');
    add.type = 'button'; add.className = 'add-asset'; add.textContent = '+ Add asset';
    add.addEventListener('click', () => { data.assets.push({ name: '', status: '', ready: '' }); save(); renderRows(); });
    wrap.appendChild(add);
    return wrap;
  }

  /* ---------- step rendering ---------- */
  function renderStep() {
    const s = steps[current];
    el.stepTitle.textContent = s.title;
    el.stepSub.textContent = s.sub;
    el.fields.innerHTML = '';
    s.groups.forEach(g => {
      const group = document.createElement('div');
      group.className = 'fgroup';
      if (g.title) {
        const h = document.createElement('div');
        h.className = 'gsection';
        h.textContent = g.title;
        group.appendChild(h);
      }
      const grid = document.createElement('div');
      grid.className = 'grid';
      g.fields.forEach(f => grid.appendChild(fieldNode(f)));
      group.appendChild(grid);
      el.fields.appendChild(group);
    });
    el.backBtn.disabled = current === 0;
    el.nextBtn.textContent = current === steps.length - 1 ? 'Finish & review brief →' : 'Continue →';
    renderRail();
    renderAssist(assistCache[s.id]);   // show cached, then refresh
    runAssist();
  }

  function markRail() { renderRail(); }

  function goTo(i) {
    if (i < 0 || i >= steps.length) return;
    current = i;
    showForm();
    renderStep();
  }

  /* ---------- co-pilot ---------- */
  function setStatus(state) {
    el.coStatus.className = 'live ' + state;
    el.coStatus.textContent = state === 'thinking' ? 'reviewing' : state === 'idle' ? 'ready' : 'watching';
  }

  function scheduleAssist() {
    clearTimeout(assistTimer);
    assistTimer = setTimeout(runAssist, 1100);
  }

  async function runAssist() {
    clearTimeout(assistTimer);
    const s = steps[current];
    if (!stepFilled(s)) { renderAssist(null); setStatus('idle'); return; }
    const seq = ++assistSeq;
    setStatus('thinking');
    try {
      const res = await Gemini.assist(s.id, data);
      if (seq !== assistSeq) return;          // superseded
      assistCache[s.id] = res;
      renderAssist(res);
      setStatus('watching');
    } catch (err) {
      if (seq !== assistSeq) return;
      renderAssistError(err);
      setStatus('idle');
    }
  }

  function renderAssist(res) {
    el.coBody.innerHTML = '';
    if (!res) {
      el.coBody.innerHTML = `<div class="co-empty">Start filling in this step and I'll flag anything that clashes with earlier answers — and offer suggestions to speed you up.</div>`;
      return;
    }
    const checks = res.checks || [];
    const suggestions = res.suggestions || [];
    if (!checks.length && !suggestions.length) {
      el.coBody.innerHTML = `<div class="assist fyi"><div class="hd"><svg class="gstar"><use href="#star"/></svg> Looks consistent</div>Nothing clashes with your earlier answers. Keep going.</div>`;
      return;
    }
    checks.forEach(c => {
      const sev = ['tension', 'gap', 'fyi'].includes(c.severity) ? c.severity : 'fyi';
      const icon = sev === 'fyi' ? '<svg class="gstar"><use href="#star"/></svg>' : '⚠';
      const div = document.createElement('div');
      div.className = 'assist ' + sev;
      div.innerHTML = `<div class="hd">${icon} ${escapeHtml(c.title || 'Check')}</div>${escapeHtml(c.body || '')}`;
      el.coBody.appendChild(div);
    });
    suggestions.forEach(sg => {
      if (!sg || !sg.fieldId || sg.value == null) return;
      const div = document.createElement('div');
      div.className = 'assist sugg';
      div.innerHTML = `<div class="hd"><svg class="gstar"><use href="#star"/></svg> ${escapeHtml(sg.label || 'Suggestion')}</div>` +
        escapeHtml(sg.rationale || sg.value);
      const act = document.createElement('div');
      act.className = 'miniact';
      const fill = document.createElement('span');
      fill.className = 'b fill'; fill.textContent = 'Insert';
      fill.addEventListener('click', () => applySuggestion(sg));
      act.appendChild(fill);
      div.appendChild(act);
      el.coBody.appendChild(div);
    });
  }

  function renderAssistError(err) {
    const needsKey = err.status === 503 || err.status === 500;
    el.coBody.innerHTML = `<div class="co-empty">${needsKey
      ? 'Assist is offline — the brief still saves and exports normally. (Set the Gemini key to enable live review.)'
      : 'Could not reach the assistant just now. Your answers are safe; try again in a moment.'}</div>`;
  }

  function applySuggestion(sg) {
    data[sg.fieldId] = sg.value;
    save();
    const input = document.getElementById('f_' + sg.fieldId);
    if (input) {
      input.value = sg.value;
      const field = input.closest('.field');
      if (field) { field.classList.add('flag'); setTimeout(() => field.classList.remove('flag'), 900); }
    }
    markRail();
    runAssist();
  }

  /* ---------- brief view ---------- */
  function showForm() { el.formView.hidden = false; el.briefView.hidden = true; }
  function showBrief() {
    el.formView.hidden = true; el.briefView.hidden = false;
    el.briefDoc.innerHTML = Brief.toHtml(Brief.toMarkdown(data));
  }

  async function generate() {
    el.genBtn.disabled = true;
    el.briefDoc.innerHTML = `<div class="brief-loading"><svg class="gstar"><use href="#star"/></svg> Drafting your brief…</div>`;
    try {
      const res = await Gemini.synthesize(data);
      el.briefDoc.innerHTML = Brief.toHtml(res.markdown || Brief.toMarkdown(data));
    } catch {
      el.briefDoc.innerHTML = Brief.toHtml(Brief.toMarkdown(data));
      toast('Draft assist is offline — showing the brief from your inputs.');
    }
    el.genBtn.disabled = false;
  }

  /* ---------- helpers ---------- */
  function escapeHtml(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  let toastTimer = null;
  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- events ---------- */
  el.backBtn.addEventListener('click', () => goTo(current - 1));
  el.nextBtn.addEventListener('click', () => {
    if (current === steps.length - 1) {
      if (completedCount() === 0) { toast('Add some brief details before reviewing.'); return; }
      showBrief();
    } else goTo(current + 1);
  });
  el.editBtn.addEventListener('click', showForm);
  el.genBtn.addEventListener('click', generate);
  el.copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(el.briefDoc.innerText); toast('Brief copied'); }
    catch { toast('Copy failed — select and copy manually'); }
  });
  el.downloadBtn.addEventListener('click', () => {
    const name = 'LTP-Brief-' + (data.productArea || 'draft').replace(/\s+/g, '-') + '.md';
    Brief.download(Brief.toMarkdown(data), name);
  });
  el.gdocBtn.addEventListener('click', async () => {
    el.gdocBtn.disabled = true;
    const original = el.gdocBtn.textContent;
    try {
      await GDoc.exportDoc(
        () => el.briefDoc.innerHTML,
        () => 'LTP Brief — ' + (data.productArea || 'Draft'),
        (msg) => { el.gdocBtn.textContent = msg; }
      );
      toast('Opened your new Google Doc');
    } catch (err) {
      if (err && err.code === 'not-configured') toast('Google Doc export needs a one-time setup — coming shortly.');
      else toast(err && err.message ? err.message : 'Could not create the Google Doc.');
    } finally {
      el.gdocBtn.textContent = original;
      el.gdocBtn.disabled = false;
    }
  });

  /* ---------- boot ---------- */
  renderStep();
})();
