# LTP Brief Intake — design

**Date:** 2026-08-19
**Status:** approved, not yet implemented

## What changes

The six-step wizard becomes a single page called **LTP Brief Intake**. A client
fills it in one sitting and exports a brief that a strategist drops onto LTP
Strategy.

The tool stops asking the client to pre-answer strategy. Growth drivers, comms
strategy, category dynamics, cultural territories, funnel KPIs, brand platform
and positioning are what LTP Strategy exists to produce; asking a client to
guess at them means Strategy spends its session arguing with a guess. What
stays is what the client alone owns — the plan's identity, the money, the
dates, the people, the constraints, the creative, and their own read on the
category.

## Why one page

The wizard's value was enforcing completeness: it could gate "Continue". A
client-facing intake trades that for being able to see the whole ask at once,
answer in any order, and stop worrying about what is behind the next button.
Completeness moves to a readiness meter that counts but never blocks.

## The seam with LTP Strategy

LTP Strategy identifies a plan by `region → market → product area → cycle`
(`ltpstrategy/js/schema.js`, `ltpstrategy/js/pa.js`). Region is a closed list
(`na`, `emea`, `apac`, `global`) with markets nested under each; product area is
a closed list with an `Other` escape. Cycle is free text, placeholder `2026`.

Strategy already reads dropped text files whole into its model context
(`ltpstrategy/js/files.js`), so a Markdown export works today with no change on
that side. What a dropped file cannot do is register a plan — identity comes
from Strategy's start screen. The strategist re-types those four fields for now.

So: the Intake emits the structured block from day one, Strategy ignores it
until someone teaches its start screen to read it, and that becomes a small
change rather than a redesign.

### Slugs

Emitted values match what `SCHEMA.plan.market()` and `SCHEMA.plan.name()`
expect: lowercased, non-alphanumerics collapsed to hyphens. `USA` → `usa`,
`Gemini` → `gemini`, `Saudi Arabia` → `saudi-arabia`. Region emits the id
(`na`), not the label.

### The taxonomy copy

The Intake carries its own copy of Strategy's region/market/area lists.
Strategy's schema warns in a comment that a second copy drifts into printing
names the other tool never offered — this is that second copy, and it is a
deliberate trade to avoid coupling two no-build repos.

Two guards, both tests:

1. A snapshot test that always runs and fails if the local copy's shape changes.
2. A test that reads `../ltpstrategy/js/schema.js` when that repo is a sibling
   on disk and asserts the two lists agree, skipping when it is absent. On a
   machine holding both repos this checks against the source of truth; anywhere
   else it is a no-op rather than a false failure.

The README names `ltpstrategy/js/schema.js` as the origin.

## The page

Ten sections, scrolled, in this order.

### 1 · The plan

| id | type | notes |
| --- | --- | --- |
| `region` | select | Closed list. Defaults to North America. |
| `market` | select | Filtered by region, plus `Other` with a text escape. |
| `productArea` | select | Strategy's area list, plus `Other` with a text escape. |
| `cycle` | cycle | Year input plus Full year / H1 / H2. Emits `2027 H1` or `2027`. |

`cycle` replaces the old free-text `planningYear`.

### 2 · The ask

| id | type | notes |
| --- | --- | --- |
| `objective` | textarea | What this plan has to achieve. |
| `successMeasure` | textarea | How success will be judged, including measurement already bought — BLS, MMM, incrementality, a named tracker. |

### 3 · Audience

| id | type | notes |
| --- | --- | --- |
| `targetAudience` | textarea | Helper text folds in the source-of-growth prompt rather than asking twice. |

### 4 · Money

| id | type | notes |
| --- | --- | --- |
| `budget` | budget | Existing dual-handle range component, unchanged. |
| `budgetScope` | pills | Multi-select: working media / production / agency fees. |
| `committed` | textarea | What is already committed against the budget — upfronts, sponsorships, signed always-on. |

### 5 · Timing

| id | type | notes |
| --- | --- | --- |
| `launchDates` | textarea | Launches and external moments the plan must land around. |
| `internalDates` | textarea | Placeholder prompts the approval path and the sign-off date. |

### 6 · People

| id | type | notes |
| --- | --- | --- |
| `stakeholders` | textarea | Name, role, and what they care about. |

### 7 · Principles and mandatories

| id | type | notes |
| --- | --- | --- |
| `mediaPrinciples` | textarea | New. |
| `constraints` | textarea | Mandatories and exclusions. Placeholder prompts brand safety and any regulatory or category restriction. |
| `xpaOverlaps` | textarea | Where another product area may collide — shared domains, overlapping audiences, clashing flighting. |

### 8 · Creative

| id | type | notes |
| --- | --- | --- |
| `creativePlatform` | textarea | The creative idea the work runs on. Distinct from the retired `platform` (brand platform). |
| `assets` | assets | Existing table, extended with a **type** column and a **count** column. Columns: name, type, count, status, ready date. |
| `localisation` | textarea | Which languages assets exist in, and whether localisation is funded. |

### 9 · Your own read

The thin strategic layer. Framed as the client's view for the planning team to
work from, never as an answer.

| id | type | notes |
| --- | --- | --- |
| `competitors` | textarea | Who the client sees as the competition. |
| `whiteSpace` | textarea | Relabelled "Where you think we can win". Id kept for migration. |

### 10 · Research and data

Ordered by what clients actually have.

| id | type | notes |
| --- | --- | --- |
| `links` | links | New repeatable rows: label, URL, why it matters. Google Docs and Sheets, Drive folders, dashboards. |
| `researchNotes` | textarea | Findings and context typed directly. Also the landing place for migrated answers. |
| `docs` | docs | Existing component. Data files carried; documents digested. |

#### What a link is, and is not

A Google Doc or Sheet link is auth-gated. Nothing here can open it — not the
server, not Gemini. The brief carries the URL and the client's note about why it
matters. The co-pilot must never imply it read what is behind a link.

#### What an upload does

Unchanged from today, but the copy at the point of upload must be honest rather
than buried in help text:

- Text-shaped files (`.csv`, `.txt`, `.md`, `.json`) have their contents read
  into the brief, up to 12k characters each and 90k in total (`DOC_TEXT_CAP`
  and `DOC_TOTAL_CAP`, `js/app.js`). These genuinely travel. The total cap
  exists to keep the saved brief inside localStorage, so the new `links` and
  `researchNotes` fields share that ceiling and the cap stays as it is.
- A PDF, deck or image is read once when it lands; Gemini returns a summary of
  what a planner would act on, and that summary is what every later call
  carries. **The file itself never leaves the client's browser.** The upload
  control says so, and asks the client to share originals separately.

## Readiness

The fields the planning team will chase if they are blank:

`region`, `market`, `productArea`, `cycle`, `objective`, `targetAudience`,
`budget`, `launchDates`, `internalDates`, `stakeholders`, `mediaPrinciples`,
`constraints`, `creativePlatform`.

`objective` is on this list although it was not on the original critical list.
A brief carrying a budget, a date and a product area but no statement of what
the money is for leaves Strategy starting from nothing, which makes it the most
expensive blank on the page.

The rail shows a persistent count — "6 of 10 sections answered · 3 fields the
planning team will chase you for" — and clicking the count jumps to the first
outstanding one. **Nothing blocks.** A client who does not yet know the budget
must be able to finish and say so; a form that refuses to proceed gets a made-up
number instead of an honest gap.

## The shell

- The `#ic-brief` tile replaces the Gemini star in the top-left. The wordmark
  becomes **LTP Brief Intake**, matching what the module row already calls this
  tool. `<title>` follows.
- The favicon is corrected. It currently draws a blue brief tile while
  `#ic-brief` renders red, so the tab and the header disagree.
- The left rail keeps its place and changes job: the ten section names as anchor
  links, each with a state dot (untouched / started / done) that scroll-spies.
  The stepper and progress bar are deleted.
- The co-pilot stays on the right, still collapsible, with two controls:
  **Interview me** and **Draft the brief**. Per-section refine survives with its
  undo intact.
- The brief view is unchanged — same review-then-export screen, same Copy, PDF
  and Google Docs actions.

## The export

One Markdown file. Prose first, machine-readable block last, under a `Handoff`
heading:

    # LTP Brief Intake — Gemini · USA · 2027 H1

    ...prose sections...

    ## Handoff

    ```json
    { "tool": "ltp-brief-intake", "version": 1,
      "plan": { "region": "na", "market": "usa", "pa": "gemini", "cycle": "2027 H1" },
      "budget": { "low": 4000000, "high": 6000000, "scope": ["working-media"] },
      "dates": { "launch": "...", "internal": "..." },
      "links": [ { "label": "...", "url": "...", "why": "..." } ] }
    ```

Last, not front matter, deliberately: Strategy reads dropped files whole into
Gemini's context, so anything at the top shapes the model's first impression of
the brief. Prose leads.

## The co-pilot

`api/gemini.js` drops from nine actions to five: `interview`, `digest`,
`ingest`, `synthesize`, `refine`.

Removed: `assist` (live per-field review — the contradictions it caught are
visible on one page anyway), `funnel-kpis` (the stages are gone), `audiences`
(strategy's job), `ask` (free chat; the co-pilot now speaks only when asked to
interview or draft).

## Migrating saved briefs

Answers already in a browser include fields that will not exist. On load:

- Surviving ids carry over unchanged.
- `sourceAudience` appends into `targetAudience` — the closest semantic match.
- `planningYear` seeds `cycle` where it parses as a year.
- Everything else dropped — `growthDriver` and its other-ids, `commsStrategy`,
  `categoryDynamics`, `culturalTerritories`, the five `kpi*` stages, `platform`,
  `positioning` — is parked into `researchNotes` under a **From your earlier
  draft** heading.
- The client is told once, in the readiness area, that this happened.

Nothing is silently discarded.

## Testing

The 31 existing tests keep passing; none touch what is changing. They cover the
gate, cache headers, the delete confirmation, and the refine/commit contract.

New:

- **Taxonomy snapshot** — the local region/market/area copy matches a checked-in
  fixture.
- **Taxonomy against source** — agrees with `../ltpstrategy/js/schema.js` when
  that repo is a sibling; skips when absent.
- **Slug round-trip** — every market and area the Intake offers survives
  Strategy's `market()`, `name()` and `regionOf()` unchanged.
- **Structured block** — parses as JSON and carries all four identity fields.
- **Readiness counting** — the chase list is counted correctly, and never blocks
  export.
- **Migration** — an old-shape save loads with surviving fields intact and
  dropped answers parked rather than lost.

## Open item carried in

`api/gemini.js` defaults to `gemini-3.6-flash` and `gemini-flash-lite-latest`.
If either name has drifted, every action returns 502 from the catch-all at the
foot of the handler — which matches the standing bug. One call to the `models`
action settles it. Needs a `GEMINI_KEY` in a local `.env`, or one authenticated
request against production.

## Deliberately not included

- **Stored uploads.** Vercel Blob would make files travel, but the gate is one
  shared password, so it would put client research behind a credential several
  people hold. That needs its own access model, not a field on an intake form.
- **Teaching Strategy to read the handoff block.** Deferred by choice; the block
  ships so this stays a small change later.
- **Product news, regulatory constraints and the approval path as their own
  fields.** Each is a placeholder prompt inside an existing field instead —
  creative platform, mandatories, and internal dates respectively.
