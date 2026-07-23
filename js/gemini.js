/* Thin client for the assist + synthesis endpoints.
   All model calls are proxied server-side so the key never reaches the browser. */

const Gemini = (() => {
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
      return call('assist', { stepId, data });
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
    }
  };
})();
