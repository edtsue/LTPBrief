/* LTP Brief — intake schema.
   Single source of truth for steps, fields, and the taxonomy the assist layer reasons over. */

const SCHEMA = {
  steps: [
    {
      id: 'context',
      name: 'Context',
      title: 'Context',
      sub: 'The basics for this plan — plus the guardrails the planning team must work within.',
      groups: [
        {
          fields: [
            { id: '_dropzone', type: 'dropzone' }
          ]
        },
        {
          fields: [
            { id: 'productArea', label: 'Product Area', type: 'text', placeholder: 'e.g. Gemini App',
              help: 'The product this plan is for. It sets who else you might collide with, so name the PA as the business names it rather than the campaign.' },
            { id: 'market', label: 'Market', type: 'text', placeholder: 'e.g. United States',
              help: 'One market per brief. Media costs, competitors and culture do not travel, so a plan written for two at once is written for neither.' },
            { id: 'planningYear', label: 'Planning year', type: 'text', placeholder: 'e.g. FY2027',
              help: 'The fiscal year this plan runs in. It anchors every date below and tells the planning team which budget cycle they are working against.' },
            { id: 'budget', label: 'Budget range', type: 'budget', help: 'The working-media envelope, not the total marketing budget. Drag the Low handle and the High handle separately — a range is what the planning team expects at this stage. If you know the exact number, drag both ends to it.' },
            { id: 'launchDates', label: 'Key launch dates', type: 'textarea', placeholder: 'Product launches / moments this plan must land around',
              help: 'The moments media has to land against. These are what creative readiness gets checked against later — a date here with no asset ready for it is a gap worth finding now.' },
            { id: 'internalDates', label: 'Critical internal dates', type: 'textarea', placeholder: 'Strat sprint, exec reviews, lock dates…',
              help: 'When decisions get made, not when media runs. Lock dates and exec reviews decide how much time the plan actually has.' },
            { id: 'stakeholders', label: 'Stakeholders', type: 'textarea', full: true, placeholder: 'Client-side and agency owners — name + role',
              help: 'Who signs off and who needs to be in the room. Name and role — \'marketing\' is not a stakeholder.' }
          ]
        },
        {
          title: 'Guardrails',
          fields: [
            { id: 'constraints', label: 'Constraints & mandatories', type: 'textarea', full: true, placeholder: 'Brand-safety exclusions, non-negotiables, channel mandates, full-funnel requirement…',
              help: 'The things that are not up for debate. Say them now: a constraint discovered late invalidates work that was already done.' },
            { id: 'xpaOverlaps', label: 'Cross-PA overlaps to watch', type: 'textarea', full: true, placeholder: 'Domains, audiences, or flighting other Product Areas may collide on', help: 'Where another Product Area might collide with this plan — shared domains, overlapping audiences, or clashing flighting.' }
          ]
        }
      ]
    },
    {
      id: 'growth',
      name: 'Growth Strategy',
      title: 'Growth Strategy',
      sub: 'Start with the path to growth, then get specific about the audience behind it.',
      groups: [
        {
          fields: [
            {
              id: 'growthDriver', label: 'Source of brand growth (select all that apply)', type: 'pills', full: true,
              help: 'Where growth will come from. Pick every driver that applies; each group has an Other if the real answer is not on the list.',
              // Each group carries its own Other, and its own field to explain it —
              // one shared box could not say WHICH kind of growth was meant.
              optgroups: [
                { label: 'Increase purchase volume', otherId: 'growthDriverOtherVolume',
                  otherPlaceholder: 'What else grows the volume here?',
                  options: ['Increase user base', 'Recruit new users', 'Steal competitive share', 'Increase volume of transactions or engagements', 'Increase volume of use', 'Increase frequency of use'] },
                { label: 'Increase purchase value', otherId: 'growthDriverOtherValue',
                  otherPlaceholder: 'What else grows the value of a purchase?',
                  options: ['Increase revenue per purchase', 'Convince people to pay more'] },
                { label: 'Brand extension', otherId: 'growthDriverOtherExtension',
                  otherPlaceholder: 'What else does the brand extend into?',
                  options: ['A diversified product range', 'Open new products and services'] }
              ]
            },
            {
              id: 'sourceAudience', label: 'Source-of-growth audience', type: 'textarea', full: true, aiAction: 'audiences',
              placeholder: 'Go deeper than the broad definition. Who, specifically, will drive growth — and why you have the right to win them.',
              help: 'Go deeper than a demographic — the specific people who will drive growth, and why the brand has the right to win them.'
            },
            {
              id: 'commsStrategy', label: 'Comms Strategy', type: 'textarea', full: true,
              placeholder: 'Barriers to overcome · planning principles · the role of channels',
              help: 'Three things: what belief or habit is in the way, the principles that decide where money goes, and what each channel is actually for. This is where a plan stops being a budget split.'
            }
          ]
        }
      ]
    },
    {
      id: 'landscape',
      name: 'Landscape',
      title: 'Landscape',
      sub: 'Where the brand leads, where it lags, and the white space that follows.',
      groups: [
        {
          fields: [
            { id: 'competitors', label: 'Key competitors', type: 'textarea', full: true, placeholder: 'Category leader, disruptors, and how they show up',
              help: 'Who you are actually taking share from, and how they show up in media. The category leader matters even when they are not the direct rival — they set what the audience expects.' },
            { id: 'categoryDynamics', label: 'Category dynamics', type: 'textarea', full: true, placeholder: 'Where the brand leads vs. lags the leader on the metrics that matter',
              help: 'Where the brand leads and where it lags, on the measures that move business. Be honest about the lag — it is what the funnel gets built to fix.' },
            { id: 'whiteSpace', label: 'Where we can win', type: 'textarea', full: true, placeholder: 'The white space the strategy can own',
              help: 'The gap the competition has left open and the brand has the right to take. If everyone could claim it, it is not white space.' },
            {
              id: 'culturalTerritories', label: 'Cultural territories & community angles', type: 'textarea', full: true,
              placeholder: 'Ownable moments, communities, and spaces the brand has permission to play in',
              help: 'The moments and communities the brand can join without looking like a guest. Tyrion is the reference for what is live right now.',
              link: { label: 'Open Tyrion', url: 'https://sites.google.com/mediafuturesgroup.com/tyrion/home' }
            }
          ]
        }
      ]
    },
    {
      id: 'funnel',
      name: 'Full Funnel',
      title: 'Full Funnel',
      sub: 'A KPI for every stage — full-funnel is mandatory.',
      groups: [
        {
          title: 'Full-funnel KPIs',
          fields: [
            {
              id: 'funnelKpis', type: 'funnel',
              help: 'One measurable KPI per stage. The five stages are a starting point — rename them, reorder them by dragging the grip, remove one, or add your own so the funnel matches how this business actually converts. The shape re-tapers itself.',
              stages: [
                { id: 'kpiAwareness', label: 'Awareness', color: '#EA4335', placeholder: 'e.g. Ad recall lift' },
                { id: 'kpiConsideration', label: 'Consideration', color: '#34A853', placeholder: 'e.g. Consideration +6pt' },
                { id: 'kpiIntent', label: 'Intent', color: '#FBBC04', placeholder: 'e.g. App-store visits' },
                { id: 'kpiPurchase', label: 'Purchase / Action', color: '#4285F4', placeholder: 'e.g. Installs / CPI' },
                { id: 'kpiLoyalty', label: 'Loyalty', color: '#9B72CB', placeholder: 'e.g. DAU / D30 retention' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'platform',
      name: 'Platform, Positioning and Creative',
      title: 'Platform, Positioning and Creative',
      sub: 'What the brand stands on, how it is positioned against the competition, and the creative that carries it — including when each asset lands, so flighting is planned against real availability.',
      groups: [
        {
          title: 'Platform & positioning',
          fields: [
            { id: 'platform', label: 'Brand platform', type: 'textarea', full: true,
              placeholder: 'The idea the brand stands on — the throughline everything ladders back to',
              help: 'The one idea every execution ladders back to. It should survive a change of channel, a change of asset and a change of year — if it reads like a campaign line, go up a level.' },
            { id: 'positioning', label: 'Positioning', type: 'textarea', full: true,
              placeholder: 'Who it is for, what it replaces, and the claim it makes against the alternative',
              help: 'The sentence the plan has to make land. If Landscape says where you can win, this is what you say when you get there.' }
          ]
        },
        {
          title: 'Creative',
          fields: [
            { id: 'assets', label: 'Creative assets', type: 'assets',
              help: 'What exists, what is coming, and when each one is ready. Readiness is checked against your launch dates — an asset landing after the moment it was made for is the gap this catches.' }
          ]
        }
      ]
    },
    {
      id: 'research',
      name: 'Other Research/Input',
      title: 'Other Research/Input',
      sub: 'Internal research, decks, trackers, anything else the planning team should read alongside this brief.',
      groups: [
        {
          fields: [
            { id: 'docs', label: 'Documents', type: 'docs', full: true,
              help: 'Research the planning team should read alongside this. Files stay on your device — the brief carries the name and why it matters, so say why in a line. Text files are also read by the co-pilot.' }
          ]
        },
        {
          fields: [
            { id: 'researchNotes', label: 'Anything else the planning team should know', type: 'textarea', full: true,
              placeholder: 'Findings that shaped the brief, debates still open, work already ruled out…',
              help: 'The context that never makes it into a field: what you already tried, what was ruled out and why, what is still being argued about. It stops the planning team re-running work you have done.' }
          ]
        }
      ]
    }
  ],

  assetStatuses: ['Available now', 'In production', 'Briefed', 'Concept only']
};
