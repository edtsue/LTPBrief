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
      docs: data.docs.map(d => ({ name: d.name, note: d.note, hasText: !!(d && d.text) }))
    });
  }

  async function call(action, payload) {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e = new Error(err.error || ('Request failed (' + res.status + ')'));
      e.status = res.status;
      throw e;
    }
    return res.json();
  }

  return {
    // Review the active step against everything entered so far.
    // -> { checks: [{severity,title,body}], suggestions: [{fieldId,label,value,rationale}] }
    assist(stepId, data) {
      return call('assist', { stepId, data: lean(data) });
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
    funnelKpis(data) {
      return call('funnel-kpis', { data: lean(data) });
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
