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
            { id: 'productArea', label: 'Product Area', type: 'text', placeholder: 'e.g. Gemini App' },
            { id: 'market', label: 'Market', type: 'text', placeholder: 'e.g. United States' },
            { id: 'planningYear', label: 'Planning year', type: 'text', placeholder: 'e.g. FY2027' },
            { id: 'budget', label: 'Budget (a range is fine)', type: 'text', placeholder: 'e.g. $40M – $55M working media' },
            { id: 'launchDates', label: 'Key launch dates', type: 'textarea', placeholder: 'Product launches / moments this plan must land around' },
            { id: 'internalDates', label: 'Critical internal dates', type: 'textarea', placeholder: 'Strat sprint, exec reviews, lock dates…' },
            { id: 'stakeholders', label: 'Stakeholders', type: 'textarea', full: true, placeholder: 'Client-side and agency owners — name + role' }
          ]
        },
        {
          title: 'Guardrails',
          fields: [
            { id: 'constraints', label: 'Constraints & mandatories', type: 'textarea', full: true, placeholder: 'Brand-safety exclusions, non-negotiables, channel mandates, full-funnel requirement…' },
            { id: 'xpaOverlaps', label: 'Cross-PA overlaps to watch', type: 'textarea', full: true, placeholder: 'Domains, audiences, or flighting other Product Areas may collide on' }
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
              id: 'growthDriver', label: 'Source of brand growth', type: 'select', full: true,
              otherField: true,
              optgroups: [
                { label: 'Increase purchase volume', options: ['Increase user base', 'Recruit new users', 'Steal competitive share', 'Increase volume of transactions or engagements', 'Increase volume of use', 'Increase frequency of use'] },
                { label: 'Increase purchase value', options: ['Increase revenue per purchase', 'Convince people to pay more'] },
                { label: 'Brand extension', options: ['A diversified product range', 'Open new products and services'] }
              ]
            },
            {
              id: 'sourceAudience', label: 'Source-of-growth audience', type: 'textarea', full: true,
              placeholder: 'Go deeper than the broad definition. Who, specifically, will drive growth — and why you have the right to win them.'
            },
            {
              id: 'commsStrategy', label: 'Comms Strategy', type: 'textarea', full: true,
              placeholder: 'Barriers to overcome · planning principles · the role of channels'
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
            { id: 'competitors', label: 'Key competitors', type: 'textarea', full: true, placeholder: 'Category leader, disruptors, and how they show up' },
            { id: 'categoryDynamics', label: 'Category dynamics', type: 'textarea', full: true, placeholder: 'Where the brand leads vs. lags the leader on the metrics that matter' },
            { id: 'whiteSpace', label: 'Where we can win', type: 'textarea', full: true, placeholder: 'The white space the strategy can own' }
          ]
        }
      ]
    },
    {
      id: 'funnel',
      name: 'Full Funnel',
      title: 'Full Funnel',
      sub: 'A KPI for every stage — full-funnel is mandatory — plus the cultural territory to plan around.',
      groups: [
        {
          title: 'Full-funnel KPIs',
          fields: [
            {
              id: 'funnelKpis', type: 'funnel',
              stages: [
                { id: 'kpiAwareness', label: 'Awareness', color: '#4285F4', placeholder: 'e.g. Ad recall lift' },
                { id: 'kpiConsideration', label: 'Consideration', color: '#9B72CB', placeholder: 'e.g. Consideration +6pt' },
                { id: 'kpiIntent', label: 'Intent', color: '#D96570', placeholder: 'e.g. App-store visits' },
                { id: 'kpiPurchase', label: 'Purchase / Action', color: '#F9AB00', placeholder: 'e.g. Installs / CPI' },
                { id: 'kpiLoyalty', label: 'Loyalty', color: '#34A853', placeholder: 'e.g. DAU / D30 retention' }
              ]
            }
          ]
        },
        {
          title: 'Cultural playground',
          fields: [
            { id: 'culturalTerritories', label: 'Cultural territories & community angles', type: 'textarea', full: true, placeholder: 'Ownable moments, communities, and spaces the brand has permission to play in' }
          ]
        }
      ]
    },
    {
      id: 'assets',
      name: 'Existing Assets',
      title: 'Existing Assets',
      sub: 'What creative you have or are making, and when each lands — so flighting is planned against real availability.',
      groups: [
        {
          fields: [
            { id: 'assets', label: 'Assets', type: 'assets' }
          ]
        }
      ]
    }
  ],

  assetStatuses: ['Available now', 'In production', 'Briefed', 'Concept only']
};
