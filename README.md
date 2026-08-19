# LTP Brief Intake

An intake for the long-term media planning process. The client fills one page and
exports a brief that a strategist drops onto LTP Strategy.

## What it asks, and what it does not

The page collects what the client alone can answer. The strategy itself — the growth
driver, the comms strategy, category dynamics, cultural territories, and the KPI for
each funnel stage — is what LTP Strategy exists to produce, so it is deliberately not
asked here. A client can only guess at those, and a guess on the page is worse than a
blank: the planning team then argues with the guess instead of with the brief.

The line is ownership, not subject. The funnel is the case in point — what Brand and
Direct Response are each on the hook for stays, because only the client sets it and
every allocation is made against it; naming the metric for each funnel part goes.

## The page

1. **The plan** — region, market, product area, cycle
2. **The ask** — what the plan has to achieve, and how success is judged
3. **Full funnel** — what Brand (BR) and Direct Response (DR) each have to deliver
4. **Audience** — who the plan is for
5. **Money** — the range, what it covers, what is already committed
6. **Timing** — launches, internal deadlines, the approval path
7. **People** — stakeholders and what they care about
8. **Principles and mandatories** — media principles, exclusions, cross-PA overlaps
9. **Creative** — the platform, the assets and when they land, localisation
10. **Your own read** — competitors and where the client thinks they can win
11. **Research and data** — links, written notes, files

Nothing blocks. The rail counts what the planning team will chase, and a client who
does not know the budget yet must be able to finish and say so — a form that refuses
to submit gets an invented number, which is harder to catch later than an empty box.

A document is read **once**, when it lands: the assistant returns a short summary of what
a planner would act on, and every call after that carries the summary rather than the file.
So the co-pilot knows what your research says without paying for it on every keystroke.

Documents added on **Other Research/Input** stay on the sender's device — there is nowhere
to put them — so the brief carries the manifest (name + why it matters) for the planning
team to request. Text-shaped files (csv, txt, md, json) also have their contents read, up
to 12k characters each and 90k in total, so the co-pilot can reason against them.

Answers autosave to the browser. The Full Brief view generates an exportable brief
(copy / download Markdown / PDF / Google Doc).

## The handoff to LTP Strategy

The export is one Markdown file with a JSON block at its foot, under a `Handoff`
heading. A strategist and the model they drop it on read the prose; the block is what
Strategy's start screen can one day register a plan from without anybody retyping
four fields. Today Strategy ignores it.

The block is built from the answers, never from the prose — the brief view is
editable, and an edit must not be able to change what gets registered.

**The region, market and product-area lists in `js/schema.js` are a copy of LTP
Strategy's own** (`ltpstrategy/js/schema.js`, which is the source of truth). A brief
saying `US` where Strategy registers `USA` does not error; it produces a plan nobody
can find. `test/taxonomy.test.js` checks the copy against Strategy's file directly
whenever the two repos sit side by side on disk, and skips when they do not.

## The module bar

Top right, and three things: the plan chip, the module row, and the button that
folds the row away.

The row, Kessel and the theme switch travel together on `#hdStrip`, which
**slides shut when the width is wanted and is open until somebody shuts it** —
a bar that started closed would give away the exact thing that keeps those
controls on screen. The plan chip sits outside the fold, because which plan
this is should stay readable however folded everything beside it gets. It is
empty and hidden until there is a plan to name.

⚠️ **`js/strip.js` and `css/strip.css` are a copy, not a fork.** They came out
of LTP Strategy and are copied between the planning modules the way
`api/_gate.js` is. Neither file knows anything about this one: it is handed a
box, a button, a key prefix and an optional `hold`, and the stylesheet asks for
four colour variables that `css/styles.css` maps to this palette. **Fix a fold
bug in one repo and carry the file across whole** — an edit made on the way in
is how two copies of a shared file stop being the same file, and
`test/wiring.test.js` fails if either one starts naming this module.

The demonstration — it opens, waits, folds itself, and reminds every fifth
visit after that — waits on `ltp:unlocked` exactly as the tour does. Whether
there is a gate at all is an answer that arrives over the network, and a fold
performed at boot lands behind the lock screen: spent, marked taught, and never
shown again.

**Kessel and the theme switch used to live in the rail foot.** They moved up
here, where LTP Strategy keeps them, because they were the two things down
there that were never about the brief. The theme is unchanged otherwise — two
states, same `ltpbrief.theme` value; a labelled switch does not fit in a pill,
so the label became the icon.

## Stack

- Static front end (`index.html`, `css/`, `js/`) — no build step
- One serverless function (`api/gemini.js`) proxies the model so the key stays server-side
- `js/strip.js` + `css/strip.css` — the fold, shared with the other planning modules

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

## Briefs saved on the old form

Answers written against the six-step version still open. Fields that survive carry
over; the five funnel KPIs move to the Brand field, the source-of-growth audience
joins the target audience, and everything else retired is parked under **Research and
data** with the question it answered. Nothing is discarded, and the client is told
once. See `js/migrate.js`.
