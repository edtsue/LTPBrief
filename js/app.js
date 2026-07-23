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
    ingestBtn: document.getElementById('ingestBtn'),
    interviewBtn: document.getElementById('interviewBtn'),
    formView: document.getElementById('formView'),
    briefView: document.getElementById('briefView'),
    briefDoc: document.getElementById('briefDoc'),
    genBtn: document.getElementById('genBtn'),
    copyBtn: document.getElementById('copyBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    gdocBtn: document.getElementById('gdocBtn'),
    resetBriefBtn: document.getElementById('resetBriefBtn'),
    editBtn: document.getElementById('editBtn')
  };

  const BRIEF_KEY = 'ltpbrief.brief';
  let data = load();
  let current = 0;
  let onBrief = false;
  let editedBrief = null;
  try { editedBrief = localStorage.getItem(BRIEF_KEY) || null; } catch {}
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
      else if (f.type === 'funnel') { if (f.stages.some(s => data[s.id] && String(data[s.id]).trim() !== '')) any = true; }
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
      b.className = 'step' + (i === current && !onBrief ? ' active' : '') + ((i !== current || onBrief) && stepFilled(s) ? ' done' : '');
      b.innerHTML = `<span class="num">${(i === current && !onBrief) || !stepFilled(s) ? (i + 1) : '✓'}</span> ${s.name}`;
      b.addEventListener('click', () => goTo(i));
      el.steps.appendChild(b);
    });

    const div = document.createElement('div');
    div.className = 'rail-div';
    el.steps.appendChild(div);

    const brief = document.createElement('button');
    brief.type = 'button';
    brief.className = 'step brief-nav' + (onBrief ? ' active' : '');
    brief.innerHTML = `<span class="num brief-ico"><svg class="gstar"><use href="#star"/></svg></span> Full Brief`;
    brief.addEventListener('click', () => {
      if (completedCount() === 0) { toast('Add some brief details first.'); return; }
      showBrief();
    });
    el.steps.appendChild(brief);

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
    if (f.type === 'funnel') { return funnelNode(f); }

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

    // Optional AI helper button under the field (e.g. audience builder).
    if (f.aiAction === 'audiences') {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ai-mini';
      b.innerHTML = '<svg class="gstar"><use href="#star"/></svg> Suggest audiences';
      b.addEventListener('click', () => openAudiences(f.id));
      wrap.appendChild(b);
    }
    return wrap;
  }

  function funnelNode(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field full';

    const suggest = document.createElement('button');
    suggest.type = 'button'; suggest.className = 'ai-mini';
    suggest.innerHTML = '<svg class="gstar"><use href="#star"/></svg> Suggest full-funnel KPIs';
    suggest.addEventListener('click', async () => {
      suggest.disabled = true;
      const orig = suggest.innerHTML;
      suggest.innerHTML = '<svg class="gstar sp"><use href="#star"/></svg> Thinking…';
      try {
        const r = await Gemini.funnelKpis(data);
        f.stages.forEach(st => {
          if (r[st.id]) { data[st.id] = r[st.id]; const inp = document.getElementById('f_' + st.id); if (inp) inp.value = r[st.id]; }
        });
        save(); markRail(); runAssist(); toast('Funnel KPIs suggested');
      } catch (e) { toast(e && e.status === 503 ? 'Add the Gemini key to enable this.' : 'Could not suggest just now.'); }
      suggest.disabled = false; suggest.innerHTML = orig;
    });
    wrap.appendChild(suggest);

    const funnel = document.createElement('div');
    funnel.className = 'funnel';
    const widths = [100, 85, 70, 57, 46];
    f.stages.forEach((st, i) => {
      const tier = document.createElement('div');
      tier.className = 'ftier';
      tier.style.setProperty('--w', (widths[i] != null ? widths[i] : 54) + '%');
      tier.style.setProperty('--c', st.color);
      const lab = document.createElement('span');
      lab.className = 'fstage';
      lab.textContent = st.label;
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'f_' + st.id;
      input.placeholder = st.placeholder || '';
      if (data[st.id] != null) input.value = data[st.id];
      input.addEventListener('input', () => { data[st.id] = input.value; save(); scheduleAssist(); markRail(); });
      input.addEventListener('blur', () => runAssist());
      tier.append(lab, input);
      funnel.appendChild(tier);
    });
    wrap.appendChild(funnel);
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
  function showForm() { el.formView.hidden = false; el.briefView.hidden = true; onBrief = false; renderRail(); }
  function showBrief() {
    el.formView.hidden = true; el.briefView.hidden = false;
    el.briefDoc.innerHTML = editedBrief || Brief.toHtml(Brief.toMarkdown(data));
    decorateSections();
    onBrief = true; renderRail();
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

  function decorateSections() {
    el.briefDoc.querySelectorAll('h2').forEach(h2 => {
      if (h2.querySelector('.sec-ai')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sec-ai';
      btn.setAttribute('contenteditable', 'false');
      btn.title = 'Refine this section with Gemini';
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
    return ov;
  }
  function openRefine(h2) {
    refineTarget = h2;
    if (!refineOverlay) refineOverlay = buildOverlay();
    refineOverlay.querySelector('.rf-name').textContent = headingText(h2);
    refineOverlay.querySelector('.rf-custom').value = '';
    refineOverlay.querySelector('.rf-loading').hidden = true;
    refineOverlay.hidden = false;
  }
  function closeRefine() { if (refineOverlay) refineOverlay.hidden = true; refineTarget = null; }
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
      if (!md) { loading.hidden = true; toast('No change returned'); return; }
      if (!/^#{1,3}\s/.test(md)) md = `## ${heading}\n\n${md}`;
      const tmp = document.createElement('div');
      tmp.innerHTML = Brief.toHtml(md);
      const oldNodes = sectionNodes(h2);
      const parent = h2.parentNode;
      Array.from(tmp.childNodes).forEach(nn => parent.insertBefore(nn, h2));
      oldNodes.forEach(n => n.remove());
      decorateSections();
      saveBrief();
      closeRefine();
      toast('Section refined');
    } catch (err) {
      loading.hidden = true;
      toast(err && err.status === 503 ? 'Assist is offline — add the Gemini key.' : 'Could not refine just now.');
    }
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
    decorateSections();
    saveBrief();
    el.genBtn.disabled = false;
  }

  /* ---------- reusable modal ---------- */
  function makeModal() {
    const ov = document.createElement('div');
    ov.className = 'refine-overlay'; ov.hidden = true;
    const card = document.createElement('div');
    card.className = 'refine-card';
    ov.appendChild(card);
    ov.addEventListener('click', e => { if (e.target === ov) ov.hidden = true; });
    document.body.appendChild(ov);
    return { ov, card, open() { ov.hidden = false; }, close() { ov.hidden = true; } };
  }
  function modalClose(m) { m.card.querySelectorAll('.rf-close').forEach(b => b.addEventListener('click', () => m.close())); }

  /* ---------- audience builder ---------- */
  let audModal = null;
  async function openAudiences(fieldId) {
    if (!audModal) audModal = makeModal();
    audModal.card.innerHTML = '<div class="refine-hd"><svg class="gstar"><use href="#star"/></svg> Candidate audiences<button class="rf-close" type="button">×</button></div><div class="rf-loading"><svg class="gstar sp"><use href="#star"/></svg> Thinking…</div>';
    modalClose(audModal); audModal.open();
    try {
      const r = await Gemini.audiences(data);
      let html = '<div class="refine-hd"><svg class="gstar"><use href="#star"/></svg> Candidate audiences<button class="rf-close" type="button">×</button></div><div class="aud-list"></div>';
      audModal.card.innerHTML = html;
      const list = audModal.card.querySelector('.aud-list');
      (r.options || []).forEach(o => {
        const c = document.createElement('div');
        c.className = 'aud-card';
        c.innerHTML = `<div class="aud-t">${escapeHtml(o.title || '')}</div><div class="aud-d">${escapeHtml(o.definition || '')}</div><div class="aud-r">${escapeHtml(o.rationale || '')}</div>`;
        const use = document.createElement('button');
        use.type = 'button'; use.className = 'rf-chip'; use.textContent = 'Use this';
        use.addEventListener('click', () => {
          data[fieldId] = o.definition || o.title;
          const inp = document.getElementById('f_' + fieldId);
          if (inp) inp.value = data[fieldId];
          save(); markRail(); runAssist(); audModal.close(); toast('Audience added');
        });
        c.appendChild(use); list.appendChild(c);
      });
      modalClose(audModal);
    } catch (e) {
      audModal.card.innerHTML = '<div class="refine-hd">Candidate audiences<button class="rf-close" type="button">×</button></div><div class="co-empty">' + (e && e.status === 503 ? 'Add the Gemini key to enable this.' : 'Could not fetch suggestions.') + '</div>';
      modalClose(audModal);
    }
  }

  /* ---------- document ingest ---------- */
  let ingestModal = null, ingestFile = null;
  function openIngest() {
    if (!ingestModal) ingestModal = makeModal();
    ingestFile = null;
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
      if (!f) { ingestFile = null; nameEl.textContent = ''; return; }
      const reader = new FileReader();
      reader.onload = () => { ingestFile = { mimeType: f.type || 'application/octet-stream', data: String(reader.result).split(',')[1] }; nameEl.textContent = f.name; };
      reader.readAsDataURL(f);
    });
    ingestModal.card.querySelector('.ing-go').addEventListener('click', runIngest);
    ingestModal.open();
  }
  async function runIngest() {
    const text = ingestModal.card.querySelector('.ing-text').value.trim();
    if (!text && !ingestFile) { toast('Paste text or choose a file first'); return; }
    const load = ingestModal.card.querySelector('.ing-load');
    const go = ingestModal.card.querySelector('.ing-go');
    load.hidden = false; go.disabled = true;
    try {
      const payload = {};
      if (text) payload.text = text;
      if (ingestFile) payload.file = ingestFile;
      const r = await Gemini.ingest(payload);
      let filled = 0;
      const f = r.fields || {};
      Object.keys(f).forEach(k => { if (f[k] && String(f[k]).trim()) { data[k] = String(f[k]); filled++; } });
      if (Array.isArray(r.assets) && r.assets.length) {
        data.assets = r.assets.map(a => ({ name: a.name || '', status: a.status || '', ready: a.ready || '' }));
        filled++;
      }
      save(); renderStep();
      ingestModal.close();
      toast(filled ? (r.summary || `Filled ${filled} field${filled > 1 ? 's' : ''} — review your answers`) : 'Nothing could be extracted from that');
    } catch (e) {
      load.hidden = true; go.disabled = false;
      toast(e && e.status === 503 ? 'Add the Gemini key to enable this.' : 'Could not read that document.');
    }
  }

  /* ---------- interview mode ---------- */
  let ivModal = null, ivHistory = [];
  function openInterview() {
    ivHistory = [];
    if (!ivModal) ivModal = makeModal();
    ivModal.card.className = 'refine-card iv-card';
    ivModal.card.innerHTML =
      '<div class="refine-hd"><svg class="gstar"><use href="#star"/></svg> Interview me<button class="rf-close" type="button">×</button></div>' +
      '<div class="iv-log"></div>' +
      '<div class="iv-input"><input type="text" placeholder="Type your answer&hellip;" disabled><button class="btn primary iv-send" type="button" disabled>Send</button></div>';
    ivModal.card.querySelector('.rf-close').addEventListener('click', () => { ivModal.close(); renderStep(); });
    const input = ivModal.card.querySelector('.iv-input input');
    const send = ivModal.card.querySelector('.iv-send');
    const submit = () => { const v = input.value.trim(); if (v) { input.value = ''; ivStep(v); } };
    send.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    ivModal.open();
    ivStep(null);
  }
  function ivAddMsg(role, text) {
    const log = ivModal.card.querySelector('.iv-log');
    const m = document.createElement('div');
    m.className = 'iv-msg ' + role;
    m.textContent = text;
    log.appendChild(m); log.scrollTop = log.scrollHeight;
    return m;
  }
  async function ivStep(userText) {
    const input = ivModal.card.querySelector('.iv-input input');
    const send = ivModal.card.querySelector('.iv-send');
    if (userText) { ivAddMsg('user', userText); ivHistory.push({ role: 'user', text: userText }); }
    input.disabled = true; send.disabled = true;
    const thinking = ivAddMsg('ai thinking', '…');
    try {
      const r = await Gemini.interview(data, ivHistory);
      (r.updates || []).forEach(u => { if (u.fieldId && u.value != null) data[u.fieldId] = u.value; });
      save(); markRail();
      thinking.textContent = r.message || '';
      thinking.classList.remove('thinking');
      ivHistory.push({ role: 'assistant', text: r.message || '' });
      if (r.done) {
        input.placeholder = 'Interview complete ✓'; input.disabled = true; send.disabled = true;
        renderStep(); toast('Interview complete — your answers are filled');
      } else { input.disabled = false; send.disabled = false; input.focus(); }
    } catch (e) {
      thinking.textContent = e && e.status === 503 ? 'Add the Gemini key to enable this.' : 'Something went wrong — try again.';
      thinking.classList.remove('thinking');
    }
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
  el.ingestBtn.addEventListener('click', openIngest);
  el.interviewBtn.addEventListener('click', openInterview);
  el.editBtn.addEventListener('click', showForm);
  el.genBtn.addEventListener('click', generate);
  el.briefDoc.addEventListener('input', () => { saveBrief(); el.saveState.textContent = 'Saved ✓'; });
  el.resetBriefBtn.addEventListener('click', () => {
    editedBrief = null;
    try { localStorage.removeItem(BRIEF_KEY); } catch {}
    el.briefDoc.innerHTML = Brief.toHtml(Brief.toMarkdown(data));
    decorateSections();
    saveBrief();
    toast('Brief rebuilt from your answers');
  });
  el.copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(el.briefDoc.innerText); toast('Brief copied'); }
    catch { toast('Copy failed — select and copy manually'); }
  });
  el.downloadBtn.addEventListener('click', () => {
    const name = 'LTP-Brief-' + (data.productArea || 'draft').replace(/\s+/g, '-') + '.md';
    Brief.download(Brief.htmlToMarkdown(el.briefDoc), name);
  });
  el.gdocBtn.addEventListener('click', async () => {
    el.gdocBtn.disabled = true;
    const original = el.gdocBtn.textContent;
    try {
      await GDoc.exportDoc(
        () => cleanBriefHtml(),
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

  /* ---------- boot ---------- */
  renderStep();
})();
