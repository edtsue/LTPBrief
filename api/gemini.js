// Serverless proxy for the intake assistant.
// Keeps the API key server-side and shapes two actions: `assist` and `synthesize`.

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const API_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;

// Condensed long-term-planning framework the model reasons against.
const FRAMEWORK = `
You assist a marketing team completing an intake brief that kicks off an annual Long-Term Plan (LTP) for a Product Area (PA).
Principles: full-funnel is mandatory; plans are annual (not per-campaign); watch for cross-PA (X-PA) tension where PAs collide on domains, audiences, or flighting.
The brief has five steps:
1. Context — product area, market, planning year, budget (a range is fine), launch dates, critical internal dates, stakeholders; plus guardrails (constraints/mandatories, X-PA overlaps).
2. Growth Strategy — the source of brand growth (one growth driver from the taxonomy: increase purchase volume via user base / new users / competitive share / transaction volume / frequency; increase purchase value via revenue per purchase / paying more; or brand extension via new products / a diversified range — or a custom "Other"); the source-of-growth audience (should be specific, not a broad demo); and comms strategy (barriers to overcome, planning principles, and the role of channels).
3. Landscape — key competitors, category dynamics (where the brand leads vs. lags the leader), the white space to win, and cultural territories / community angles to plan around.
4. Full Funnel — a KPI per stage (Awareness, Consideration, Intent, Purchase, Loyalty). Every stage should have one; a missing stage is a gap.
5. Existing Assets — creative available or in production, its status, and readiness dates (flag when readiness misses a launch date).
`;

const FIELD_IDS = {
  context: ['productArea', 'market', 'planningYear', 'budget', 'launchDates', 'internalDates', 'stakeholders', 'constraints', 'xpaOverlaps'],
  growth: ['growthDriver', 'growthDriverOther', 'sourceAudience', 'commsStrategy'],
  landscape: ['competitors', 'categoryDynamics', 'whiteSpace', 'culturalTerritories'],
  funnel: ['kpiAwareness', 'kpiConsideration', 'kpiIntent', 'kpiPurchase', 'kpiLoyalty'],
  assets: ['assets']
};

const ASSIST_SCHEMA = {
  type: 'object',
  properties: {
    ack: { type: 'string' },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['tension', 'gap', 'fyi'] },
          title: { type: 'string' },
          body: { type: 'string' },
          field: { type: 'string' }
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

// Field catalog used by document-ingest and interview extraction.
const CATALOG = `Field ids you may fill (all optional — only include what the input clearly supports):
- productArea: Product Area / brand (e.g. Gemini App, Pixel, Search)
- market: geography (e.g. United States)
- planningYear: e.g. FY2027
- budget: budget or range (e.g. $40M-$55M)
- launchDates: key launch dates / moments
- internalDates: critical internal dates (sprints, reviews, locks)
- stakeholders: client + agency owners
- constraints: constraints & mandatories (brand safety, non-negotiables)
- xpaOverlaps: cross-PA overlaps (domains/audiences/flighting)
- growthDriver: one driver; prefer one of [Increase user base, Recruit new users, Steal competitive share, Increase volume of transactions or engagements, Increase volume of use, Increase frequency of use, Increase revenue per purchase, Convince people to pay more, A diversified product range, Open new products and services]; if none fit, set growthDriver to "Other" and put wording in growthDriverOther
- growthDriverOther: free-text growth driver when growthDriver is "Other"
- sourceAudience: specific source-of-growth audience
- commsStrategy: barriers, planning principles, role of channels
- competitors: key competitors
- categoryDynamics: where the brand leads vs lags
- whiteSpace: where the brand can win
- kpiAwareness, kpiConsideration, kpiIntent, kpiPurchase, kpiLoyalty: one KPI per funnel stage
- culturalTerritories: cultural territories / community angles`;

const FIELD_PROPS = {};
['productArea','market','planningYear','budget','launchDates','internalDates','stakeholders','constraints','xpaOverlaps','growthDriver','growthDriverOther','sourceAudience','commsStrategy','competitors','categoryDynamics','whiteSpace','kpiAwareness','kpiConsideration','kpiIntent','kpiPurchase','kpiLoyalty','culturalTerritories']
  .forEach(k => { FIELD_PROPS[k] = { type: 'string' }; });

const INGEST_SCHEMA = {
  type: 'object',
  properties: {
    fields: { type: 'object', properties: FIELD_PROPS },
    assets: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, status: { type: 'string' }, ready: { type: 'string' } } } },
    summary: { type: 'string' }
  }
};
const FUNNEL_SCHEMA = {
  type: 'object',
  properties: { kpiAwareness: { type: 'string' }, kpiConsideration: { type: 'string' }, kpiIntent: { type: 'string' }, kpiPurchase: { type: 'string' }, kpiLoyalty: { type: 'string' } },
  required: ['kpiAwareness', 'kpiConsideration', 'kpiIntent', 'kpiPurchase', 'kpiLoyalty']
};
const AUDIENCE_SCHEMA = {
  type: 'object',
  properties: { options: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, definition: { type: 'string' }, rationale: { type: 'string' } }, required: ['title', 'definition', 'rationale'] } } },
  required: ['options']
};
const INTERVIEW_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    updates: { type: 'array', items: { type: 'object', properties: { fieldId: { type: 'string' }, value: { type: 'string' } }, required: ['fieldId', 'value'] } },
    done: { type: 'boolean' }
  },
  required: ['message', 'done']
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

Do three things, grounded ONLY in what they wrote:
0) ack — one short, present-tense line acknowledging the LATEST/most important thing they've captured on this step (e.g. "Tracking a $40–55M US budget for Gemini App."). Keep it under 12 words, specific to their actual content, and reassuring. Always return one.
1) checks — flag genuine contradictions or tensions between THIS step and any earlier step, plus real gaps or opportunities. Be specific and reference the actual values. Severity: "tension" (conflicts), "gap" (something required is missing, e.g. an empty funnel stage), "fyi" (a helpful observation/opportunity). Return 0–3. Do NOT invent problems; if it's consistent, return none. If a check points at ONE specific field the user should fix, set its "field" to that exact fieldId (valid ids: ${Object.values(FIELD_IDS).flat().join(', ')}). Otherwise omit "field".
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

function askPrompt(stepId, data, question) {
  return `${FRAMEWORK}

The user is on step "${stepId}" of their LTP intake and asks you a question. Answer helpfully and concisely (2–4 sentences), grounded in the brief they've entered and the LTP framework. If they ask you to draft or word something, give a tight, ready-to-use draft. Don't invent facts they haven't provided.

Their brief so far (JSON):
${JSON.stringify(data || {}, null, 2)}

Question: ${question}`;
}

function refinePrompt(heading, content, instruction) {
  return `${FRAMEWORK}

Rewrite ONE section of an LTP brief according to the user's instruction.
Rules:
- Return the section in Markdown, starting with the exact same heading line "## ${heading}" (do not rename or drop the heading).
- Stay faithful to the facts in the current text; do not invent figures or claims.
- Return ONLY the rewritten section markdown — no preamble, no explanation, no code fences.

Instruction: ${instruction}

Current section:
${content}`;
}

function funnelPrompt(data) {
  return `${FRAMEWORK}

Propose one measurable, media-impactable KPI for EACH funnel stage (Awareness, Consideration, Intent, Purchase/Action, Loyalty), grounded in the intake so far. Keep each short — a metric, optionally a target. Return all five.

Intake (JSON):
${JSON.stringify(data, null, 2)}`;
}
function audiencePrompt(data) {
  return `${FRAMEWORK}

Propose 2-3 candidate source-of-growth audiences. Go deeper than a broad demographic — per the framework, brand love drives switching (e.g. "Pixel lovers", not just "competitive users"). For each: a short title, a specific 1-2 sentence definition, and a one-line rationale for why they'll drive growth and why the brand has the right to win them. Ground them in the intake.

Intake (JSON):
${JSON.stringify(data, null, 2)}`;
}
function ingestPrompt() {
  return `${FRAMEWORK}

You are extracting an LTP intake brief from the attached/pasted source material. Fill only fields the source clearly supports; leave the rest empty — never invent. Also extract any listed creative into "assets" (name, status, ready). Give a one-line "summary" of what you filled.

${CATALOG}`;
}
function interviewPrompt(data, history) {
  return `${FRAMEWORK}

You are running a friendly, efficient intake interview to complete the LTP brief. Ask ONE short, specific question at a time for the most valuable missing field next. From the user's latest answer, produce "updates" (fieldId + value) mapping their answer to the right field(s), then set "message" to your next question. Use valid field ids only.

${CATALOG}

When the brief has solid coverage across all five sections, set done=true and make "message" a brief wrap-up. Otherwise done=false.

Current data (JSON):
${JSON.stringify(data, null, 2)}

Conversation so far (JSON):
${JSON.stringify(history || [], null, 2)}`;
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

    if (action === 'ask') {
      const answer = await callGemini({
        contents: [{ role: 'user', parts: [{ text: askPrompt(stepId, data || {}, payload.question || '') }] }],
        generationConfig: { temperature: 0.5 }
      });
      res.status(200).json({ answer });
      return;
    }

    if (action === 'funnel-kpis') {
      const text = await callGemini({
        contents: [{ role: 'user', parts: [{ text: funnelPrompt(data || {}) }] }],
        generationConfig: { temperature: 0.4, responseMimeType: 'application/json', responseSchema: FUNNEL_SCHEMA }
      });
      res.status(200).json(JSON.parse(text));
      return;
    }

    if (action === 'audiences') {
      const text = await callGemini({
        contents: [{ role: 'user', parts: [{ text: audiencePrompt(data || {}) }] }],
        generationConfig: { temperature: 0.6, responseMimeType: 'application/json', responseSchema: AUDIENCE_SCHEMA }
      });
      res.status(200).json(JSON.parse(text));
      return;
    }

    if (action === 'ingest') {
      const parts = [{ text: ingestPrompt() }];
      if (payload.file && payload.file.data) {
        parts.push({ inline_data: { mime_type: payload.file.mimeType || 'application/pdf', data: payload.file.data } });
      }
      if (payload.text) parts.push({ text: 'Pasted source:\n' + String(payload.text).slice(0, 60000) });
      const text = await callGemini({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: INGEST_SCHEMA }
      });
      res.status(200).json(JSON.parse(text));
      return;
    }

    if (action === 'interview') {
      const text = await callGemini({
        contents: [{ role: 'user', parts: [{ text: interviewPrompt(data || {}, payload.history) }] }],
        generationConfig: { temperature: 0.5, responseMimeType: 'application/json', responseSchema: INTERVIEW_SCHEMA }
      });
      res.status(200).json(JSON.parse(text));
      return;
    }

    if (action === 'refine') {
      let md = await callGemini({
        contents: [{ role: 'user', parts: [{ text: refinePrompt(payload.heading || '', payload.content || '', payload.instruction || '') }] }],
        generationConfig: { temperature: 0.5 }
      });
      md = String(md).replace(/^```(?:markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();
      res.status(200).json({ markdown: md });
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
