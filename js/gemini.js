/* Thin client for the model endpoints.
   Every call is proxied server-side so the key never reaches the browser. */

const Gemini = (() => {
  /* Research documents can carry up to 90k characters of extracted text. That
     is worth sending when the model is writing the brief; it is dead weight on
     an interview turn, where it was costing roughly eight times the tokens of
     the brief itself. The conversational calls get the manifest — name and why
     it matters — and the synthesis gets the substance. */
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

  /* FOUR CALLS, WHERE THERE WERE NINE.
     Live per-field review, funnel-KPI suggestions, audience generation and free
     chat all came off with the wizard. Review existed to catch a contradiction
     with a step you could no longer see; on one page you can see it. The KPI
     grid and the audience builder were asking the client to produce what
     Strategy exists to produce. */
  return {
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
    // Extract a brief from pasted text or a file. -> { fields, assets, summary }
    ingest(payload) {
      return call('ingest', payload);
    },
    // One interview turn. -> { message, updates:[{fieldId,value}], done }
    interview(data, history) {
      return call('interview', { data: lean(data), history });
    }
  };
})();
