// Serverless proxy for the intake assistant.
// Keeps the API key server-side and shapes two actions: `assist` and `synthesize`.

const gate = require('./_gate');
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const FAST_MODEL = process.env.GEMINI_FAST_MODEL || 'gemini-flash-lite-latest';

/* One model for everything meant a KPI suggestion and a full brief synthesis
   were priced and paced the same. Structured, schema-constrained calls take
   the fast model and no thinking budget — they are filling a shape, not
   reasoning their way to one. Synthesis and refine keep the better model,
   because that output is what the planning team actually reads.
   `cap` bounds the response: without it a bad prompt runs long on the bill. */
const PLAN = {
  assist:       { model: FAST_MODEL, temperature: 0.35, cap: 900,  think: false },
  'funnel-kpis':{ model: FAST_MODEL, temperature: 0.4,  cap: 400,  think: false },
  audiences:    { model: FAST_MODEL, temperature: 0.6,  cap: 900,  think: false },
  digest:       { model: FAST_MODEL, temperature: 0.2,  cap: 500,  think: false },
  interview:    { model: FAST_MODEL, temperature: 0.5,  cap: 700,  think: false },
  ask:          { model: MODEL,      temperature: 0.5,  cap: 800,  think: true  },
  ingest:       { model: MODEL,      temperature: 0.2,  cap: 2500, think: true  },
  synthesize:   { model: MODEL,      temperature: 0.4,  cap: 4000, think: true  },
  refine:       { model: MODEL,      temperature: 0.5,  cap: 2000, think: true  }
};
const API_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;

// Condensed long-term-planning framework the model reasons against.
const FRAMEWORK = `
You assist a marketing team completing an intake brief that kicks off an annual Long-Term Plan (LTP) for a Product Area (PA).
Principles: full-funnel is mandatory; plans are annual (not per-campaign); watch for cross-PA (X-PA) tension where PAs collide on domains, audiences, or flighting.
The brief has five steps:
1. Context — product area, market, planning year, budget (a range is fine), launch dates, critical internal dates, stakeholders; plus guardrails (constraints/mandatories, X-PA overlaps).
2. Growth Strategy — the source of brand growth (one growth driver from the taxonomy: increase purchase volume via user base / new users / competitive share / transaction volume / frequency; increase purchase value via revenue per purchase / paying more; or brand extension via new products / a diversified range — or a custom "Other"); the source-of-growth audience (should be specific, not a broad demo); and comms strategy (barriers to overcome, planning principles, and the role of channels).
3. Landscape — key competitors, category dynamics (where the brand leads vs. lags the leader), the white space to win, and cultural territories / community angles to plan around.
4. Full Funnel — a KPI per stage. The default stages are Awareness, Consideration, Intent, Purchase, Loyalty, but a brief may rename them, drop one or add its own, and that is legitimate: judge the funnel it has, not the default. Every stage present should have a KPI; a stage left empty is a gap.
5. Platform, Positioning and Creative — the idea the brand stands on, how it is positioned against the alternative, and the creative that carries it: what is available or in production, its status, and readiness dates (flag when readiness misses a launch date).
6. Other Research/Input — internal research and documents the planning team should read alongside the brief.
`;

const FIELD_IDS = {
  context: ['productArea', 'market', 'planningYear', 'budget', 'launchDates', 'internalDates', 'stakeholders', 'constraints', 'xpaOverlaps'],
  growth: ['growthDriver', 'growthDriverOtherVolume', 'growthDriverOtherValue', 'growthDriverOtherExtension', 'growthDriverOther', 'sourceAudience', 'commsStrategy'],
  landscape: ['competitors', 'categoryDynamics', 'whiteSpace', 'culturalTerritories'],
  funnel: ['kpiAwareness', 'kpiConsideration', 'kpiIntent', 'kpiPurchase', 'kpiLoyalty'],
  platform: ['platform', 'positioning', 'assets'],
  research: ['researchNotes']
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
- growthDriverOtherVolume / growthDriverOtherValue / growthDriverOtherExtension: free text explaining an "Other" chosen in that growth group
- commsStrategy: barriers, planning principles, role of channels
- competitors: key competitors
- categoryDynamics: where the brand leads vs lags
- whiteSpace: where the brand can win
- kpiAwareness, kpiConsideration, kpiIntent, kpiPurchase, kpiLoyalty: one KPI per funnel stage
- culturalTerritories: cultural territories / community angles
- platform: the brand platform — the idea everything ladders back to
- positioning: who it is for, what it replaces, the claim against the alternative
- researchNotes: anything else the planning team should know`;

const FIELD_PROPS = {};
['productArea','market','planningYear','budget','launchDates','internalDates','stakeholders','constraints','xpaOverlaps','growthDriver','growthDriverOther','growthDriverOtherVolume','growthDriverOtherValue','growthDriverOtherExtension','sourceAudience','commsStrategy','competitors','categoryDynamics','whiteSpace','kpiAwareness','kpiConsideration','kpiIntent','kpiPurchase','kpiLoyalty','culturalTerritories','platform','positioning','researchNotes']
  .forEach(k => { FIELD_PROPS[k] = { type: 'string' }; });

const INGEST_SCHEMA = {
  type: 'object',
  properties: {
    fields: { type: 'object', properties: FIELD_PROPS },
    assets: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, status: { type: 'string' }, ready: { type: 'string' } } } },
    summary: { type: 'string' }
  }
};
/* Keyed by whatever stages the brief actually has. The five defaults can be
   renamed, removed or added to, so a schema naming them would quietly fail to
   fill the ones that matter to this plan. */
const FUNNEL_SCHEMA = {
  type: 'object',
  properties: {
    kpis: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, kpi: { type: 'string' } }, required: ['id', 'kpi'] }
    }
  },
  required: ['kpis']
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 429 and 503 are the two failures worth waiting out — the first is the quota
   catching its breath, the second is the model briefly unavailable. Both used
   to surface as "could not suggest just now" and lose the user's place. */
async function callGemini(body, opts = {}) {
  const model = opts.model || MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
  let last;
  let payload = body;
  let droppedThinking = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(300 * Math.pow(3, attempt - 1));   // 300ms, 900ms
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (r.ok) {
      const j = await r.json();
      return j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    }
    const t = await r.text().catch(() => '');
    /* Not every model lets you switch thinking off, and the one that refuses
       says only "invalid argument" — it does not name the field. Turning the
       budget down is an optimisation, never a requirement, so drop it and try
       again rather than fail the call over it. Logged either way: if this
       retry succeeds, thinkingConfig was the fault; if it still fails, the
       fault is elsewhere in the request and the next log line says so. */
    if (r.status === 400 && !droppedThinking && payload.generationConfig && payload.generationConfig.thinkingConfig) {
      droppedThinking = true;
      const gc = Object.assign({}, payload.generationConfig);
      delete gc.thinkingConfig;
      payload = Object.assign({}, payload, { generationConfig: gc });
      console.warn('[gemini] model=%s rejected thinkingConfig; retrying without it', model);
      continue;
    }
    last = Object.assign(new Error(`Gemini ${r.status}: ${t.slice(0, 300)}`), { status: r.status });
    if (r.status !== 429 && r.status !== 503) throw last;
  }
  throw last;
}

/** generationConfig for an action, so no call site has to remember the policy. */
function cfg(action, extra) {
  const p = PLAN[action] || { temperature: 0.4, cap: 1200, think: true };
  const out = Object.assign({ temperature: p.temperature, maxOutputTokens: p.cap }, extra || {});
  if (!p.think) out.thinkingConfig = { thinkingBudget: 0 };
  return out;
}
const modelFor = action => (PLAN[action] || {}).model || MODEL;

function assistPrompt(stepId, data, fields) {
  const ids = FIELD_IDS[stepId] || [];
  /* The step being reviewed arrives in full; the rest of the brief is what it
     has to stay consistent with, and a review does not need every word of it
     to catch a contradiction. Sending the whole thing was most of the payload. */
  const here = fields && typeof fields === 'object' ? fields : Object.fromEntries(ids.map(id => [id, data[id]]).filter(([, v]) => v != null && v !== ''));
  const elsewhere = {};
  Object.keys(data || {}).forEach(k => {
    if (ids.includes(k) || k === 'docs') return;
    const v = data[k];
    if (v == null || v === '') return;
    elsewhere[k] = Array.isArray(v) ? v : String(v).slice(0, 220);
  });
  const docs = Array.isArray(data.docs) ? data.docs.filter(d => d && d.name) : [];
  return `${FRAMEWORK}

The user is on step "${stepId}". Their answers on THIS step (JSON):
${JSON.stringify(here, null, 2)}

The rest of the brief, abbreviated — this is what the step above must stay consistent with (JSON):
${JSON.stringify(elsewhere, null, 2)}
${docs.length ? `\nResearch attached to this brief (summarised on upload):\n${docs.map(d => `- ${d.name}${d.note ? ` (${d.note})` : ''}${d.digest ? `: ${d.digest}` : ''}`).join('\n')}` : ''}

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

function funnelPrompt(data, stages) {
  const list = (Array.isArray(stages) && stages.length ? stages : [])
    .map(s => `- id "${String(s.id).slice(0, 60)}": ${String(s.label || '').slice(0, 80)}`).join('\n');
  return `${FRAMEWORK}

This brief's funnel has the stages below. They may be renamed, reordered or added to — plan against the stages given, not the default five.

${list}

Propose one measurable, media-impactable KPI for EACH stage, grounded in the intake so far. Keep each short — a metric, optionally a target. Return one entry per stage, using the exact id given.

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

/* ── who may call this ────────────────────────────────────────────────────────
   The key lives here, but the endpoint is open to the internet: anyone who
   finds the URL can spend the quota in a loop. Two cheap gates, neither of
   which can be the whole answer alone:
   - same origin. A browser cannot forge Origin, so this stops a page on
     another site driving the key. It does nothing against curl, which is why
     there is also
   - a per-IP daily ceiling. Upstash if the project has it (KV_REST_API_*),
     otherwise a per-instance counter — imperfect across lambdas, but it still
     catches the runaway loop, which is the case that actually costs money. */
const DAILY_CAP = Number(process.env.LTP_DAILY_CAP || 300);
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const localHits = new Map();

function allowedOrigin(req) {
  const origin = req.headers.origin || '';
  if (!origin) return true;                       // same-origin fetches often omit it
  const host = req.headers.host || '';
  try { return new URL(origin).host === host; } catch { return false; }
}

async function overCap(ip) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `ltpbrief:${day}:${ip}`;
  if (KV_URL && KV_TOKEN) {
    try {
      const r = await fetch(`${KV_URL}/incr/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
      const j = await r.json();
      const n = Number(j.result || 0);
      if (n === 1) fetch(`${KV_URL}/expire/${encodeURIComponent(key)}/86400`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } }).catch(() => {});
      return n > DAILY_CAP;
    } catch { /* fall through to the local counter */ }
  }
  const cur = localHits.get(key) || 0;
  localHits.set(key, cur + 1);
  if (localHits.size > 5000) localHits.clear();
  return cur + 1 > DAILY_CAP;
}

module.exports = async (req, res) => {
  gate.noStore(res);
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!API_KEY) { res.status(503).json({ error: 'Assistant not configured' }); return; }
  if (!allowedOrigin(req)) { res.status(403).json({ error: 'Not allowed from this origin' }); return; }
  /* The gate is enforced HERE, not only in the browser. The static files are
     public whatever the overlay does; the key behind this endpoint is the
     thing that must not be spendable by someone who was never let in. */
  if (!gate.passed(req)) { res.status(401).json({ error: 'Locked' }); return; }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (await overCap(ip)) { res.status(429).json({ error: "That's the assistant's limit for today. Your answers are safe — everything still saves and exports." }); return; }

  let payload = req.body;
  if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { payload = {}; } }
  const { action, stepId } = payload || {};
  /* Clamp what arrives, whatever the client sent. Only synthesis has a reason
     to read document text, and even there it is bounded — this endpoint is
     open, so the size of a request must not be the caller's decision. */
  const DOC_TEXT_MAX = 60000;
  function clampDocs(d, keepText) {
    if (!d || !Array.isArray(d.docs)) return d || {};
    let budget = DOC_TEXT_MAX;
    return Object.assign({}, d, {
      docs: d.docs.slice(0, 40).map(doc => {
        const out = { name: String(doc && doc.name || '').slice(0, 200), note: String(doc && doc.note || '').slice(0, 400) };
        if (keepText && doc && doc.text && budget > 0) {
          out.text = String(doc.text).slice(0, budget);
          budget -= out.text.length;
        }
        return out;
      })
    });
  }
  const data = clampDocs(payload && payload.data, action === 'synthesize');

  try {
    if (action === 'assist') {
      const text = await callGemini({
        contents: [{ role: 'user', parts: [{ text: assistPrompt(stepId, data || {}, payload.fields) }] }],
        generationConfig: cfg('assist', { responseMimeType: 'application/json', responseSchema: ASSIST_SCHEMA })
      }, { model: modelFor('assist') });
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = { checks: [], suggestions: [] }; }
      res.status(200).json(parsed);
      return;
    }

    if (action === 'synthesize') {
      const markdown = await callGemini({
        contents: [{ role: 'user', parts: [{ text: synthesizePrompt(data || {}) }] }],
        generationConfig: cfg('synthesize')
      });
      res.status(200).json({ markdown });
      return;
    }

    if (action === 'ask') {
      const answer = await callGemini({
        contents: [{ role: 'user', parts: [{ text: askPrompt(stepId, data || {}, payload.question || '') }] }],
        generationConfig: cfg('ask')
      });
      res.status(200).json({ answer });
      return;
    }

    if (action === 'funnel-kpis') {
      const text = await callGemini({
        contents: [{ role: 'user', parts: [{ text: funnelPrompt(data || {}, (payload.stages || []).slice(0, 12)) }] }],
        generationConfig: cfg('funnel-kpis', { responseMimeType: 'application/json', responseSchema: FUNNEL_SCHEMA })
      }, { model: modelFor('funnel-kpis') });
      res.status(200).json(JSON.parse(text));
      return;
    }

    if (action === 'audiences') {
      const text = await callGemini({
        contents: [{ role: 'user', parts: [{ text: audiencePrompt(data || {}) }] }],
        generationConfig: cfg('audiences', { responseMimeType: 'application/json', responseSchema: AUDIENCE_SCHEMA })
      }, { model: modelFor('audiences') });
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
        generationConfig: cfg('ingest', { responseMimeType: 'application/json', responseSchema: INGEST_SCHEMA })
      }, { model: modelFor('ingest') });
      res.status(200).json(JSON.parse(text));
      return;
    }

    if (action === 'interview') {
      const text = await callGemini({
        contents: [{ role: 'user', parts: [{ text: interviewPrompt(data || {}, payload.history) }] }],
        generationConfig: cfg('interview', { responseMimeType: 'application/json', responseSchema: INTERVIEW_SCHEMA })
      }, { model: modelFor('interview') });
      res.status(200).json(JSON.parse(text));
      return;
    }

    if (action === 'refine') {
      let md = await callGemini({
        contents: [{ role: 'user', parts: [{ text: refinePrompt(payload.heading || '', payload.content || '', payload.instruction || '') }] }],
        generationConfig: cfg('refine')
      }, { model: modelFor('refine') });
      md = String(md).replace(/^```(?:markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();
      res.status(200).json({ markdown: md });
      return;
    }

    if (action === 'digest') {
      /* Read an uploaded document ONCE and keep a short brief-shaped summary.
         The alternative — shipping the file's text with every review call —
         costs its full length every 700ms while someone types. This costs it
         a single time, and everything downstream carries 700 characters. */
      const src = String(payload.text || '').slice(0, 60000);
      if (!src.trim()) { res.status(200).json({ digest: '' }); return; }
      const text = await callGemini({
        contents: [{ role: 'user', parts: [{ text: `${FRAMEWORK}

A document has been attached to a long-term planning brief: "${String(payload.name || 'untitled').slice(0, 200)}".

Summarise what a media planner needs from it, in at most 700 characters: the findings, figures and constraints that would change a plan. Facts only — no preamble, no restating the filename. If it says nothing a planner would act on, reply with one line saying so.

Document:
${src}` }] }],
        generationConfig: cfg('digest')
      }, { model: modelFor('digest') });
      res.status(200).json({ digest: String(text).trim().slice(0, 900) });
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
    /* Log it. A 502 whose only copy of the cause is in a response body nobody
       reads is a fault you cannot diagnose from the runtime logs — which is
       precisely how a broken model name stayed invisible while every action
       failed. Action and model included, because "Gemini 404" on its own does
       not say which of the two models is wrong. */
    console.error('[gemini] action=%s model=%s failed: %s', action, modelFor(action), String(e && e.message || e));
    res.status(502).json({ error: String(e.message || e) });
  }
};
