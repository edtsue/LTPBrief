// Serverless proxy for the intake assistant.
// Keeps the API key server-side and shapes two actions: `assist` and `synthesize`.

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const API_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;

// Condensed long-term-planning framework the model reasons against.
const FRAMEWORK = `
You assist a marketing team completing an intake brief that kicks off an annual Long-Term Plan (LTP) for a Product Area (PA).
Principles: full-funnel is mandatory; plans are annual (not per-campaign); watch for cross-PA (X-PA) tension where PAs collide on domains, audiences, or flighting.
The brief has five steps:
1. Context — product area, market, planning year, budget (a range is fine), launch dates, critical internal dates, stakeholders; plus guardrails (constraints/mandatories, X-PA overlaps).
2. Growth Strategy — how the brand grows (increase purchase volume / value / brand extension); where growth comes from (recruit new users, steal competitive share, increase volume/frequency, pay more, new products); and the source-of-growth audience (should be specific, not a broad demo).
3. Landscape — key competitors, category dynamics (where the brand leads vs. lags the leader), and the white space to win.
4. Full Funnel — a KPI per stage (Awareness, Consideration, Intent, Purchase, Loyalty). Every stage should have one; a missing stage is a gap. Plus cultural territories to plan around.
5. Existing Assets — creative available or in production, its status, and readiness dates (flag when readiness misses a launch date).
`;

const FIELD_IDS = {
  context: ['productArea', 'market', 'planningYear', 'budget', 'launchDates', 'internalDates', 'stakeholders', 'constraints', 'xpaOverlaps'],
  growth: ['howGrows', 'whereGrowth', 'sourceAudience'],
  landscape: ['competitors', 'categoryDynamics', 'whiteSpace'],
  funnel: ['kpiAwareness', 'kpiConsideration', 'kpiIntent', 'kpiPurchase', 'kpiLoyalty', 'culturalTerritories'],
  assets: ['assets']
};

const ASSIST_SCHEMA = {
  type: 'object',
  properties: {
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['tension', 'gap', 'fyi'] },
          title: { type: 'string' },
          body: { type: 'string' }
        },
        required: ['severity', 'title', 'body']
      }
    },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fieldId: { type: 'string' },
          label: { type: 'string' },
          value: { type: 'string' },
          rationale: { type: 'string' }
        },
        required: ['fieldId', 'value', 'label']
      }
    }
  },
  required: ['checks', 'suggestions']
};

async function callGemini(body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Gemini ${r.status}: ${t.slice(0, 300)}`);
  }
  const j = await r.json();
  return j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
}

function assistPrompt(stepId, data) {
  const ids = FIELD_IDS[stepId] || [];
  return `${FRAMEWORK}

The user is on step "${stepId}". Here is everything entered across the whole brief so far (JSON):
${JSON.stringify(data, null, 2)}

Do two things, grounded ONLY in what they wrote:
1) checks — flag genuine contradictions or tensions between THIS step and any earlier step, plus real gaps or opportunities. Be specific and reference the actual values. Severity: "tension" (conflicts), "gap" (something required is missing, e.g. an empty funnel stage), "fyi" (a helpful observation/opportunity). Return 0–3. Do NOT invent problems; if it's consistent, return none.
2) suggestions — offer up to 2 concrete pre-fill values for EMPTY or thin fields on this step only. Valid fieldId values for this step: ${ids.join(', ')}. "value" is the exact text to drop into the field; keep it tight and editable; "label" is a short button title; "rationale" is one line on why. Only suggest where you can add real value from context. Never suggest for the "assets" field.

Be concise. If nothing is worth saying, return empty arrays.`;
}

function synthesizePrompt(data) {
  return `${FRAMEWORK}

Turn the intake below into a clean, well-structured Long-Term Planning brief in Markdown, ready to hand to the planning team.
Use only the information provided — do not fabricate figures or facts. Where something important is missing, note it as "_To confirm._" rather than inventing it.
Structure with a top "# LTP Brief — <PA · Market · Year>" title, then "## Context" (with a "### Guardrails" subsection), "## Growth Strategy", "## Landscape", "## Full Funnel", "## Existing Assets". Tighten the user's phrasing into crisp prose and bullets. Keep it faithful.

Intake (JSON):
${JSON.stringify(data, null, 2)}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!API_KEY) { res.status(503).json({ error: 'Assistant not configured' }); return; }

  let payload = req.body;
  if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { payload = {}; } }
  const { action, stepId, data } = payload || {};

  try {
    if (action === 'assist') {
      const text = await callGemini({
        contents: [{ role: 'user', parts: [{ text: assistPrompt(stepId, data || {}) }] }],
        generationConfig: {
          temperature: 0.35,
          responseMimeType: 'application/json',
          responseSchema: ASSIST_SCHEMA
        }
      });
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = { checks: [], suggestions: [] }; }
      res.status(200).json(parsed);
      return;
    }

    if (action === 'synthesize') {
      const markdown = await callGemini({
        contents: [{ role: 'user', parts: [{ text: synthesizePrompt(data || {}) }] }],
        generationConfig: { temperature: 0.4 }
      });
      res.status(200).json({ markdown });
      return;
    }

    if (action === 'models') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}&pageSize=200`);
      const j = await r.json();
      const models = (j.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => m.name.replace('models/', ''));
      res.status(200).json({ current: MODEL, models });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
