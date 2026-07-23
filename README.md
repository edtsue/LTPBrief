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
| `GOOGLE_CLIENT_ID` | OAuth Client ID for one-click Google Doc export (public value). Export button is inert until set. |

## Google Doc export setup

The **Export to Google Doc** button signs the user in with Google (least-privilege
`drive.file` scope) and creates a formatted Doc in *their* Drive — nothing is stored server-side.

To enable it:
1. In a Google Cloud project, create an **OAuth 2.0 Client ID** of type *Web application*.
2. Add `https://ltpbrief.mfgpilots.com` as an **Authorized JavaScript origin**.
3. Enable the **Google Drive API** for that project.
4. Set `GOOGLE_CLIENT_ID` in the Vercel project to the Client ID.

Without a key the form still works, saves, and exports — only the live assist is disabled.

## Deploy

Hosted on Vercel. Production domain: `ltpbrief.mfgpilots.com`.
