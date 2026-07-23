# LTP Brief

An assisted intake for the long-term media planning process. The client completes a
five-step brief; an AI co-pilot reviews inputs as they go — flagging contradictions with
earlier answers and offering pre-fills — then synthesizes a clean brief to hand off.

## Flow

1. **Context** — product area, market, year, budget (range ok), launch & internal dates, stakeholders, guardrails
2. **Growth Strategy** — path to growth + source-of-growth audience
3. **Landscape** — competitors, category dynamics, white space
4. **Full Funnel** — a KPI per funnel stage + cultural territories
5. **Existing Assets** — what's available or in production, and when it's ready

Answers autosave to the browser. The final step generates an exportable brief
(copy / download Markdown; one-click Google Doc export planned).

## Stack

- Static front end (`index.html`, `css/`, `js/`) — no build step
- One serverless function (`api/gemini.js`) proxies the model so the key stays server-side

## Local development

```bash
cp .env.example .env      # add your GEMINI_API_KEY
npm run dev               # vercel dev
```

## Environment

| Variable | Purpose |
| --- | --- |
| `GEMINI_KEY` | Server-side key for the assistant (required for live assist). `GEMINI_API_KEY` also accepted. |
| `GEMINI_MODEL` | Optional model override (default `gemini-2.5-flash`) |

Without a key the form still works, saves, and exports — only the live assist is disabled.

## Deploy

Hosted on Vercel. Production domain: `ltpbrief.mfgpilots.com`.
