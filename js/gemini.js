/* Thin client for the assist + synthesis endpoints.
   All model calls are proxied server-side so the key never reaches the browser. */

const Gemini = (() => {
  /* Research documents can carry up to 90k characters of extracted text. That
     is worth sending when the model is writing the brief; it is dead weight on
     an assist call that fires every 700ms while someone types, where it was
     costing roughly eight times the tokens of the brief itself. The review
     calls get the manifest — name and why it matters — and the synthesis gets
     the substance. */
  function lean(data) {
    if (!data || !Array.isArray(data.docs)) return data;
    return Object.assign({}, data, {
      // the digest, not the document: read once on upload, carried from then on
      docs: data.docs.map(d => ({ name: d.name, note: d.note, digest: d.digest || '' }))
    });
  }

  /* One in-flight request per action. A newer review supersedes an older one,
     and the old answer is discarded anyway — aborting means we also stop
     paying for it. */
  const inflight = {};

  async function call(action, payload, opts) {
    if (inflight[action]) { inflight[action].abort(); }
    const ctrl = new AbortController();
    inflight[action] = ctrl;
    let res;
    try {
      res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
        signal: ctrl.signal
      });
    } finally {
      if (inflight[action] === ctrl) delete inflight[action];
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e = new Error(err.error || ('Request failed (' + res.status + ')'));
      e.status = res.status;
      throw e;
    }
    return res.json();
  }

  /* Cheap, stable hash of what a call would see. Two reviews of identical
     content ask the same question, and the answer cannot have changed. */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  const memo = new Map();
  async function memoised(action, key, run) {
    const k = action + ':' + key;
    if (memo.has(k)) return memo.get(k);
    const out = await run();
    if (memo.size > 60) memo.clear();
    memo.set(k, out);
    return out;
  }

  return {
    // Review the active step against everything entered so far.
    // -> { checks: [{severity,title,body}], suggestions: [{fieldId,label,value,rationale}] }
    /* Review the active step. `fields` is that step's own answers in full;
       `data` is the lean whole-brief context the review needs to spot a
       contradiction. Identical input returns the cached verdict rather than
       asking the same question twice — blur fires this far more often than
       the content actually changes. */
    assist(stepId, data, fields) {
      const payload = { stepId, data: lean(data), fields: fields || null };
      return memoised('assist', stepId + ':' + hash(JSON.stringify(payload)), () => call('assist', payload));
    },
    /* Read an uploaded document once; everything after carries the summary. */
    digest(name, text) {
      return call('digest', { name, text });
    },
    // Turn the full intake into a formatted brief.
    // -> { markdown }
    synthesize(data) {
      return call('synthesize', { data });
    },
    // Rewrite a single brief section per an instruction.
    // -> { markdown }
    refine(heading, content, instruction) {
      return call('refine', { heading, content, instruction });
    },
    // Suggest a KPI for every funnel stage. -> { kpiAwareness, ... }
    funnelKpis(data, stages) {
      return call('funnel-kpis', { data: lean(data), stages });
    },
    // Candidate source-of-growth audiences. -> { options: [{title,definition,rationale}] }
    audiences(data) {
      return call('audiences', { data: lean(data) });
    },
    // Extract a brief from pasted text or a file. -> { fields, assets, summary }
    ingest(payload) {
      return call('ingest', payload);
    },
    // One interview turn. -> { message, updates:[{fieldId,value}], done }
    interview(data, history) {
      return call('interview', { data: lean(data), history });
    },
    // Free-form question about the current step. -> { answer }
    ask(stepId, data, question) {
      return call('ask', { stepId, data: lean(data), question });
    }
  };
})();
