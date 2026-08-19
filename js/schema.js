/* LTP Brief Intake — the page.
 *
 * One page, eleven sections, in the order they are declared here. This file is
 * the only thing that says what the intake asks and what order it asks it in;
 * the renderer draws whatever is here and the export reads whatever was
 * answered, so a field removed from this list leaves the handoff silently.
 *
 * WHAT IS ON THIS PAGE AND WHAT IS NOT is a question of ownership, not subject.
 * The client is asked for what only the client can answer — the plan's
 * identity, the money, the dates, the people, the constraints, the creative,
 * what Brand and Direct Response are each on the hook for, and their own read
 * on the category. Growth drivers, comms strategy, category dynamics, cultural
 * territories, per-stage funnel KPIs, brand platform and positioning came off
 * this page: they are what LTP Strategy exists to produce, and a client can
 * only guess at them. A guess on the page is worse than a blank, because
 * Strategy then spends its session arguing with it.
 */

const SCHEMA = {
  sections: [
    {
      id: 'plan',
      title: 'The plan',
      sub: 'Which plan this is. These four are how the planning team files it, so they are the ones worth getting exactly right.',
      fields: [
        { id: '_dropzone', type: 'dropzone' },
        { id: 'region', label: 'Region', type: 'select', chase: true, source: 'regions',
          help: 'Sets the market list below.' },
        { id: 'market', label: 'Market', type: 'select', chase: true, source: 'markets',
          dependsOn: 'region', otherId: 'marketOther', otherPlaceholder: 'Which market?',
          help: 'If the plan is genuinely for more than one market, pick Other and name them.' },
        { id: 'productArea', label: 'Product Area', type: 'select', chase: true, source: 'areas',
          otherId: 'productAreaOther', otherPlaceholder: 'What is it called?',
          help: 'The product this plan is for, as the business names it rather than as the campaign does.' },
        { id: 'cycle', label: 'Cycle', type: 'cycle', chase: true,
          help: 'The year this plan covers, and whether it is the full year or one half.' }
      ]
    },

    {
      id: 'ask',
      title: 'The ask',
      sub: 'What the money is for.',
      fields: [
        { id: 'objective', label: 'What this plan has to achieve', type: 'textarea', full: true, chase: true,
          placeholder: 'The business outcome this plan is accountable for…',
          help: 'A budget, a date and a product area describe the job; this says what it is for. It is the most expensive blank on the page — without it the planning team starts from nothing.' },
        { id: 'successMeasure', label: 'How success will be judged', type: 'textarea', full: true,
          placeholder: 'The measures you will be held to — and any study already bought: BLS, MMM, incrementality, a named tracker…',
          help: 'Measurement already committed constrains the plan, so it is cheaper to know now. If Brand and Direct Response both run, say whether the methodology can tell them apart — they share channels and timing, and contamination in the MMM is far cheaper to design out than to unpick later.' }
      ]
    },

    {
      id: 'funnel',
      title: 'Full funnel',
      /* NOT THE KPI GRID AGAIN. That asked for a metric per stage, which is the
         answer Strategy produces. This asks what Brand and DR are each on the
         hook for — which only the client can set, and which every allocation
         downstream is made against. */
      sub: 'What Brand and Direct Response are each on the hook for. The plan gets built across four parts — Priming / Awareness, Trigger, Active / Consideration, Purchase — but you do not need to answer part by part here.',
      fields: [
        { id: 'brRequirements', label: 'What Brand (BR) has to deliver', type: 'textarea', full: true,
          placeholder: 'The job brand work is being asked to do…',
          help: 'What brand is accountable for in this cycle. Leave it empty if this plan genuinely has no brand ask — a blank here is a real answer.' },
        { id: 'drRequirements', label: 'What Direct Response (DR) has to deliver', type: 'textarea', full: true,
          placeholder: 'The job performance is being asked to do, and the efficiency it is held to — CPA, ROAS, CPI…',
          help: 'What performance is accountable for, and the efficiency it is judged on. An efficiency target set before the plan exists constrains every channel choice in it, so it is worth stating even roughly.' },
        /* LAST, AND WORDED AS AN INHERITANCE. Strategy's position is that brand
           and performance belong on one plan with the split set by the funnel
           part rather than by team, so a top-line ratio is the thing it argues
           against. Clients are handed one anyway, and a mandate discovered late
           is worse than one the planning team can push back on early. */
        { id: 'funnelSplit', label: 'A split you have already been given', type: 'text',
          placeholder: 'e.g. 70/30 brand to performance — or "none set"',
          help: 'Only if a ratio has been handed down to you. Say where it came from if you know. The planning team would rather set the balance by funnel part than by team, so this is something to work with, not the answer.' }
      ]
    },

    {
      id: 'audience',
      title: 'Audience',
      sub: 'Who this plan is for.',
      fields: [
        { id: 'targetAudience', label: 'Target audience', type: 'textarea', full: true, chase: true,
          placeholder: 'Who the plan is for — and, if you know it, which of them growth actually comes from…',
          help: 'Go past the demographic. If there is a specific group growth has to come from, and a reason the brand has the right to win them, that is the part the planning team cannot infer.' }
      ]
    },

    {
      id: 'money',
      title: 'Money',
      sub: 'The envelope, what it covers, and what is already spoken for.',
      fields: [
        { id: 'budget', label: 'Budget range', type: 'budget', chase: true,
          help: 'A range is what the planning team expects at this stage. Drag the Low and High handles separately; if you know the exact number, drag both ends to it.' },
        { id: 'budgetScope', label: 'What that number covers', type: 'pills', full: true,
          optgroups: [ { options: ['Working media', 'Production', 'Agency fees'] } ],
          help: 'Pick everything the number includes. A budget read as working media when it was not is the error that shows up as an overspend.' },
        { id: 'committed', label: 'What is already committed against it', type: 'textarea', full: true,
          placeholder: 'Upfronts, sponsorships, signed always-on, anything already contracted…',
          help: 'Money already spent before planning opens. It is a mandatory in the most literal sense, and it is the one clients most often forget to mention.' }
      ]
    },

    {
      id: 'timing',
      title: 'Timing',
      sub: 'What the plan has to land around, and when you need it.',
      fields: [
        { id: 'launchDates', label: 'Launches and external moments', type: 'textarea', full: true, chase: true,
          placeholder: 'Product launches, seasonal moments, anything the plan has to hit…',
          help: 'Anything in the outside world the plan has to land against. Asset readiness is checked against these dates, so a moment named here is a moment the planning team can protect.' },
        { id: 'internalDates', label: 'Internal deadlines', type: 'textarea', full: true, chase: true,
          placeholder: 'Strategy sprint, exec reviews, lock dates — plus who signs this off and the date they need it by…',
          help: 'The approval path is usually the real deadline. Name who signs off and when they need it, not only when the plan is due.' }
      ]
    },

    {
      id: 'people',
      title: 'People',
      sub: 'Who is involved, and what they care about.',
      fields: [
        { id: 'stakeholders', label: 'Stakeholders', type: 'textarea', full: true, chase: true,
          placeholder: 'Name · role · what they care about…',
          help: 'What each one cares about matters as much as their name. A plan that answers the room it is presented to survives it.' }
      ]
    },

    {
      id: 'principles',
      title: 'Principles and mandatories',
      sub: 'The rules the plan has to work inside.',
      fields: [
        { id: 'mediaPrinciples', label: 'Media principles', type: 'textarea', full: true, chase: true,
          placeholder: 'How this brand believes media should work…',
          help: 'The standing beliefs a plan is judged against, rather than this plan’s specifics.' },
        { id: 'constraints', label: 'Mandatories and exclusions', type: 'textarea', full: true, chase: true,
          placeholder: 'Must-dos, channel mandates, brand-safety exclusions, category or regulatory restrictions…',
          help: 'Both directions: what the plan must include, and what it cannot go near. Regulatory and category rules belong here too — they are easiest to design around and most expensive to discover late.' },
        { id: 'xpaOverlaps', label: 'Other product areas to watch', type: 'textarea', full: true,
          placeholder: 'Shared domains, overlapping audiences, clashing flighting…',
          help: 'Where another product area might collide with this plan — the same people reached twice, or two plans arriving in the same week.' }
      ]
    },

    {
      id: 'creative',
      title: 'Creative',
      sub: 'What the work is, what exists, and when it lands.',
      fields: [
        { id: 'creativePlatform', label: 'Creative platform', type: 'textarea', full: true, chase: true,
          placeholder: 'The idea the work runs on…',
          help: 'The creative thought the plan carries. If it is not settled yet, say that — an unsettled platform changes what the plan can commit to.' },
        { id: 'assets', label: 'Assets', type: 'assets',
          help: 'What exists, what is coming, and when each is ready. Readiness is checked against your launch dates — an asset landing after the moment it was made for is the gap this catches.' },
        { id: 'localisation', label: 'Languages and localisation', type: 'textarea', full: true,
          placeholder: 'Which languages assets exist in, and whether localisation is funded…',
          help: 'An asset that exists in one language and a plan that runs in three is a gap nobody sees until the buy.' }
      ]
    },

    {
      id: 'view',
      title: 'Your own read',
      /* THE THIN STRATEGIC LAYER, and it is framed as raw material on purpose.
         Asking a client where they can win invites an answer they will then be
         held to; asking what they think invites the one thing the planning team
         cannot get anywhere else. */
      sub: 'Your view, for the planning team to work from. Not the answer — they will do that work — but the thing they cannot get anywhere else.',
      fields: [
        { id: 'competitors', label: 'Who you see as the competition', type: 'textarea', full: true,
          placeholder: 'The category leader, the disruptors, and how they show up…',
          help: 'Who you actually watch, which is often not who a category report would name. The planning team will do their own analysis — this says where to start.' },
        { id: 'whiteSpace', label: 'Where you think you can win', type: 'textarea', full: true,
          placeholder: 'The space you believe is open…',
          help: 'A hunch is useful here. You are not being held to it — the planning team will test it, and knowing what you believe is quicker than them arriving at it independently.' }
      ]
    },

    {
      id: 'research',
      title: 'Research and data',
      sub: 'Anything the planning team should read alongside this.',
      fields: [
        /* FIRST, BECAUSE IT IS WHAT CLIENTS ACTUALLY HAVE. Research arrives as
           a Drive link far more often than as a file. Nothing here can open one
           — a Google Doc is auth-gated to the server and to the model alike —
           so the brief carries the link and what the client says about it, and
           nothing anywhere implies it was read. */
        { id: 'links', label: 'Links', type: 'links', full: true,
          help: 'Google Docs, Sheets, Drive folders, dashboards. Say why each one matters — nobody here can open them, so your line about it is what the planning team goes on until they can.' },
        { id: 'researchNotes', label: 'Anything else worth knowing', type: 'textarea', full: true,
          placeholder: 'Findings that shaped this, debates still open, work already ruled out…',
          help: 'The context that never fits a field: what you already tried, what was ruled out and why, what is still being argued about. It stops the planning team re-running work you have done.' },
        { id: 'docs', label: 'Files', type: 'docs', full: true,
          help: 'Data files — csv, txt, md, json — are read and travel with the brief. A PDF or deck is summarised and the summary travels, but the file itself stays on your device, so send originals to the planning team separately.' }
      ]
    }
  ],

  /* Strategy's four funnel parts, named here only so the intake speaks the same
     language the plan will be built in. Nothing on this page asks part by part
     — four boxes to fill is the KPI grid again wearing different labels. */
  funnelParts: ['Priming / Awareness', 'Trigger', 'Active / Consideration', 'Purchase'],

  assetStatuses: ['Available now', 'In production', 'Briefed', 'Concept only'],
  assetTypes: ['Video', 'Static', 'Audio', 'Social', 'Display', 'OOH', 'Other']
};

/* THE PLAN'S IDENTITY, AND IT IS NOT OURS.
 *
 * These lists are a copy of LTP Strategy's `SCHEMA.plan` (`ltpstrategy/js/
 * schema.js`), which is the source of truth. Strategy registers every plan
 * under a region, a market, a product area and a cycle; a brief that names any
 * of them differently produces a plan the strategist cannot find, and nothing
 * anywhere errors.
 *
 * Copied rather than shared because both repos are no-build static sites with
 * nothing between them to import from. Strategy's own schema warns that a
 * second copy of these names drifts into printing something the other tool
 * never offered — this is that second copy, and `test/taxonomy.test.js` is what
 * stops the drift: it checks this against Strategy's file directly whenever the
 * two repos sit side by side on disk.
 */
SCHEMA.plan = {
  regions: [
    /* First, and the default. Most plans through these tools are for it. */
    { id: 'na', label: 'North America', markets: ['USA', 'Canada', 'Mexico'] },
    { id: 'emea', label: 'EMEA', markets: [
      'UK', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Belgium',
      'Ireland', 'Switzerland', 'Austria', 'Portugal', 'Poland', 'Czechia',
      'Romania', 'Greece', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Turkey',
      'Israel', 'UAE', 'Saudi Arabia', 'Egypt', 'South Africa', 'Nigeria', 'Kenya'
    ] },
    { id: 'apac', label: 'APAC', markets: [
      'Australia', 'New Zealand', 'Japan', 'South Korea', 'India', 'Singapore',
      'Malaysia', 'Indonesia', 'Thailand', 'Vietnam', 'Philippines', 'Taiwan',
      'Hong Kong'
    ] },
    /* A real answer rather than an absence. */
    { id: 'global', label: 'Global', markets: ['Global'] }
  ],

  areas: [
    { label: 'Search' },
    { label: 'Gemini' },
    { label: 'Pixel' },
    { label: 'Chrome' },
    { label: 'Android' },
    { label: 'B2B' },
    { label: 'YouTube' },
    /* Last, and the only one that asks for anything. */
    { label: 'Other', other: true }
  ],

  /* The one way a name becomes a value in the handoff block. Matches how
     Strategy's `market()` and `name()` read a slug back — lowercased, with
     every run of non-alphanumerics collapsed to a single hyphen. */
  slug(name) {
    return String(name == null ? '' : name).trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
};

/* Every field on the page, flattened, in page order. Everything downstream —
   the export, the readiness count, the migration — wants the fields and not the
   sections they happen to sit in. */
SCHEMA.fields = () => SCHEMA.sections.flatMap(s => s.fields);

/* WHAT THE PLANNING TEAM WILL CHASE. Marked, counted, and never enforced: a
   form that refuses to submit gets a made-up budget instead of an honest gap,
   and an invented number is harder to catch than an empty box. */
SCHEMA.chased = () => SCHEMA.fields().filter(f => f.chase).map(f => f.id);

if (typeof module !== 'undefined' && module.exports) module.exports = { SCHEMA };
