# LTP Brief

An assisted intake for the long-term media planning process. The client completes a
six-step brief; an AI co-pilot reviews inputs as they go — flagging contradictions with
earlier answers and offering pre-fills — then synthesizes a clean brief to hand off.

## Flow

1. **Context** — product area, market, year, budget (range ok), launch & internal dates, stakeholders, guardrails
2. **Growth Strategy** — path to growth + source-of-growth audience
3. **Landscape** — competitors, category dynamics, white space
4. **Full Funnel** — a KPI per funnel stage + cultural territories
5. **Platform, Positioning and Creative** — the idea the brand stands on, how it's positioned, and the creative that carries it — what's available or in production, and when it's ready
6. **Other Research/Input** — internal research and documents the planning team should read alongside the brief

A document is read **once**, when it lands: the assistant returns a short summary of what
a planner would act on, and every call after that carries the summary rather than the file.
So the co-pilot knows what your research says without paying for it on every keystroke.

Documents added on **Other Research/Input** stay on the sender's device — there is nowhere
to put them — so the brief carries the manifest (name + why it matters) for the planning
team to request. Text-shaped files (csv, txt, md, json) also have their contents read, up
to 12k characters each and 90k in total, so the co-pilot can reason against them.

Answers autosave to the browser. The final step generates an exportable brief
(copy / download Markdown; one-click Google Doc export planned).

## Stack

- Static front end (`index.html`, `css/`, `js/`) — no build step
- One serverless function (`api/gemini.js`) proxies the model so the key stays server-side

## The gate

Set `GATE_PW` in the host environment and the tool asks for it. There is nothing to store —
the cookie carries its own expiry and a signature made with the password, so
changing `GATE_PW` invalidates every session already issued.

Being remembered is a choice and it is **off by default**. Leave the box
unticked and the cookie has no `Max-Age`: it dies when the browser closes, and
the token inside it is only good for twelve hours regardless. Tick it and the
browser is remembered for seven days.

**Changing `GATE_PW` needs a redeploy.** Environment variables are baked into
a deployment when it builds, so a password changed after the last build is not
the password the running function compares against — the gate keeps
working, on the old value, and the new one is refused.

It is enforced on `/api/gemini`, not only in the browser. This is a no-build
static site: `index.html`, `css/` and `js/` are served from the repo root and
stay publicly fetchable whatever the overlay does. What the gate actually
protects is the use of the tool and the Gemini key behind it. Briefs live in
the browser of whoever wrote them, so there is no stored client data behind
this either way.

## Local development

```bash
cp .env.example .env      # add your GEMINI_API_KEY
npm run dev               # local dev server
npm test                  # gate + cache-header tests
```

## Environment

| Variable | Purpose |
| --- | --- |
| `GATE_PW` | Password for the front door. Leave it unset and the tool is open. Changing it signs everyone out — and needs a redeploy to take effect. |
| `GEMINI_KEY` | Server-side key for the assistant (required for live assist). `GEMINI_API_KEY` also accepted. |
| `GEMINI_MODEL` | Optional model override for synthesis, refine, ingest and ask (default `gemini-3.6-flash`) |
| `GEMINI_FAST_MODEL` | Optional model for the structured, high-frequency calls — review, funnel KPIs, audiences, document digests (default `gemini-flash-lite-latest`) |
| `LTP_DAILY_CAP` | Assistant calls allowed per IP per day (default 300) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Optional Upstash Redis, so the daily cap holds across serverless instances rather than per instance |

## Open in Google Docs

The **Open in Google Docs** button copies the brief as formatted content and opens a new
Google Doc (`docs.new`) to paste into. Google Docs handles its own sign-in — no OAuth or
Cloud setup required.

Without a key the form still works, saves, and exports — only the live assist is disabled.

## Deploy

Production domain: `ltpbrief.mfgpilots.com`.
