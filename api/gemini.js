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
  digest:       { model: FAST_MODEL, temperature: 0.2,  cap: 500,  think: false },
  interview:    { model: FAST_MODEL, temperature: 0.5,  cap: 700,  think: false },
  ingest:       { model: MODEL,      temperature: 0.2,  cap: 2500, think: true  },
  synthesize:   { model: MODEL,      temperature: 0.4,  cap: 4000, think: true  },
  refine:       { model: MODEL,      temperature: 0.5,  cap: 2000, think: true  }
};
const API_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;

// Condensed long-term-planning framework the model reasons against.
const FRAMEWORK = `
You assist a client completing an intake brief that kicks off an annual Long-Term Plan (LTP) for a Product Area (PA). The client is the marketer; the reader is the media planning team.
Principles: full-funnel is mandatory; plans are annual, not per-campaign; watch for cross-PA tension where product areas collide on domains, audiences or flighting.

WHAT THIS PAGE IS FOR, AND WHAT IT IS NOT. It collects only what the client alone can answer. The strategy itself — the growth driver, the comms strategy, category dynamics, cultural territories, the audience work, and the KPI for each funnel stage — is produced later, in Strategy Discovery, and is deliberately absent here. Never ask the client for one of those and never volunteer one. A guess on this page is worse than a blank, because the planning team then argues with it instead of with the brief.

The plan is built across four funnel parts: Priming / Awareness, Trigger, Active / Consideration, Purchase. Name them if it helps the client picture the shape, but never ask for an answer part by part.

The page has eleven sections:
1. The plan — region, market, product area, and the cycle (a year, optionally a half: "2027 H1").
2. The ask — what the plan has to achieve, and how success is judged including any measurement already bought. Brand and DR often run in the same channels at the same time, so it matters whether the methodology can tell them apart.
3. Full funnel — what Brand (BR) and Direct Response / performance (DR) are each on the hook for, and any brand/DR split the client has ALREADY been handed. A plan can honestly be brand-only or DR-only; a blank here is a real answer.
4. Audience — who the plan is for, and where growth comes from within them.
5. Money — the budget range, what that number covers, and what is already committed against it.
6. Timing — launches and external moments, internal deadlines, the approval path.
7. People — stakeholders, and what each of them cares about.
8. Principles and mandatories — media principles, mandatories and exclusions including brand safety and regulatory limits, and other product areas that may collide.
9. Creative — the creative platform, the assets and when each is ready, and localisation. Flag when an asset lands after the moment it was made for.
10. Their own read — who the client sees as the competition, and where they think they can win. This is raw material for the planning team, not an answer they are held to.
11. Research and data — links the client holds, anything they want to write down, and files.

A link to a Google Doc, Sheet or Drive folder cannot be opened by you or by this server. Carry what the client says about it. Never imply you have read what is behind a link, and never summarise one.
`;

/* WHAT THE MODEL MAY FILL, and it has to match the page exactly. Interview
   mode writes what comes back straight into the form, so an id here that is
   not on the page fails silently: the model answers confidently, the update
   lands on nothing, and the client watches a question they answered never
   appear. `test/catalog.test.js` pins this against `js/schema.js`.

   Kept by hand rather than imported from the schema because a serverless
   function reaching across the repo at runtime is a dependency that passes
   every local test and can still fail to trace on deploy. */
const FIELD_IDS = {
  plan: ['region', 'market', 'marketOther', 'productArea', 'productAreaOther', 'cycle'],
  ask: ['objective', 'successMeasure'],
  funnel: ['brRequirements', 'drRequirements', 'funnelSplit'],
  audience: ['targetAudience'],
  money: ['committed'],
  timing: ['launchDates', 'internalDates'],
  people: ['stakeholders'],
  principles: ['mediaPrinciples', 'constraints', 'xpaOverlaps'],
  creative: ['creativePlatform', 'localisation'],
  view: ['competitors', 'whiteSpace'],
  research: ['researchNotes']
};

const CATALOG = `Field ids you may fill (all optional \u2014 only include what the input clearly supports):
- region: one of North America, EMEA, APAC, Global
- market: the country (e.g. USA, UK, Japan). Use "Other" and put the real answer in marketOther if it is not a single country.
- productArea: one of Search, Gemini, Pixel, Chrome, Android, B2B, YouTube \u2014 otherwise "Other" with the name in productAreaOther
- cycle: the year, optionally with a half (e.g. "2027" or "2027 H1"). Never a half on its own.
- objective: what this plan has to achieve \u2014 the business outcome
- successMeasure: how success is judged, and any measurement already bought (BLS, MMM, incrementality, a tracker)
- brRequirements: what Brand (BR) has to deliver
- drRequirements: what Direct Response / performance (DR) has to deliver, including efficiency targets (CPA, ROAS, CPI)
- funnelSplit: only a brand/DR split the client has ALREADY been handed (e.g. "70/30"). Never propose one.
- targetAudience: who the plan is for, and where growth comes from within them
- committed: money already committed against the budget (upfronts, sponsorships, signed always-on)
- launchDates: launches and external moments the plan must land around
- internalDates: internal deadlines, the approval path, and who signs off when
- stakeholders: name, role, and what each cares about
- mediaPrinciples: how this brand believes media should work
- constraints: mandatories and exclusions, including brand safety and any regulatory or category restriction
- xpaOverlaps: other product areas that may collide (shared domains, audiences, flighting)
- creativePlatform: the creative idea the work runs on
- localisation: which languages assets exist in, and whether localisation is funded
- competitors: who the client sees as the competition
- whiteSpace: where the client thinks they can win
- researchNotes: anything else the planning team should know

Never fill a strategy answer the client has not given you. Growth drivers, comms
strategy, cultural territories and per-funnel-stage KPIs are produced later in
the process and are deliberately not on this page \u2014 do not reintroduce them.`;

const FIELD_PROPS = {};
Object.keys(FIELD_IDS).forEach(k => FIELD_IDS[k].forEach(id => { FIELD_PROPS[id] = { type: 'string' }; }));

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
/* Which models have already told us they will not take a thinking budget.
   Learned once per warm instance rather than rediscovered on every call: the
   retry below costs a whole extra round trip to Gemini, and `assist` fires
   while someone is typing. A cold start pays it once and no call after that. */
const rejectsThinkingConfig = new Set();

async function callGemini(body, opts = {}) {
  const model = opts.model || MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
  let last;
  let payload = body;
  let droppedThinking = false;
  if (rejectsThinkingConfig.has(model) && payload.generationConfig && payload.generationConfig.thinkingConfig) {
    const gc = Object.assign({}, payload.generationConfig);
    delete gc.thinkingConfig;
    payload = Object.assign({}, payload, { generationConfig: gc });
    droppedThinking = true;   // already known bad; do not spend a request proving it again
  }
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
      if (!rejectsThinkingConfig.has(model)) {
        rejectsThinkingConfig.add(model);
        console.warn('[gemini] model=%s rejects thinkingConfig; dropping it for this model from now on', model);
      }
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

function synthesizePrompt(data) {
  return `${FRAMEWORK}

Turn the intake below into a clean, well-structured Long-Term Planning brief in Markdown, ready to hand to the planning team.
Use only the information provided — do not fabricate figures or facts. Where something important is missing, note it as "_To confirm._" rather than inventing it.
Structure with a top "# LTP Brief — <PA · Market · Year>" title, then "## Context" (with a "### Guardrails" subsection), "## Growth Strategy", "## Landscape", "## Full Funnel", "## Existing Assets". Tighten the user's phrasing into crisp prose and bullets. Keep it faithful.

Intake (JSON):
${JSON.stringify(data, null, 2)}`;
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

function ingestPrompt() {
  return `${FRAMEWORK}

You are extracting an LTP intake brief from the attached/pasted source material. Fill only fields the source clearly supports; leave the rest empty — never invent. Also extract any listed creative into "assets" (name, status, ready). Give a one-line "summary" of what you filled.

${CATALOG}`;
}
function interviewPrompt(data, history) {
  return `${FRAMEWORK}

You are running a friendly, efficient intake interview to complete the LTP brief. Ask ONE short, specific question at a time for the most valuable missing field next. From the user's latest answer, produce "updates" (fieldId + value) mapping their answer to the right field(s), then set "message" to your next question. Use valid field ids only.

${CATALOG}

If the user skips a question, move on: ask about something else, never re-ask what was skipped or press for it later, and return no updates for it. A skip is an answer about their priorities, not a gap to fill.

When the brief has solid coverage across all five sections, set done=true and make "message" a brief wrap-up. Otherwise done=false. If everything left has been skipped, set done=true rather than looping.

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
  const { action } = payload || {};
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

    if (action === 'synthesize') {
      const markdown = await callGemini({
        contents: [{ role: 'user', parts: [{ text: synthesizePrompt(data || {}) }] }],
        generationConfig: cfg('synthesize')
      });
      res.status(200).json({ markdown });
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
