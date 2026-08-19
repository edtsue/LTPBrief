/* Bringing a six-step brief onto the one-page intake.
 *
 * NOTHING IS DISCARDED. Half the old fields have no home on the new page, and
 * the ones that went were not trivial — five funnel KPIs and a comms strategy
 * are an afternoon of somebody's thinking. Dropping them on the next page load
 * is the worst version of this change, because the client cannot tell it
 * happened and the answers are not recoverable from anywhere.
 *
 * So every retired answer is parked somewhere a person will read it, under a
 * heading that says where it came from.
 */

const Migrate = (() => {
  const txt = v => (v == null ? '' : String(v)).trim();

  /* The old funnel stages, in the order they were asked. */
  const KPIS = [
    ['kpiAwareness', 'Awareness'],
    ['kpiConsideration', 'Consideration'],
    ['kpiIntent', 'Intent'],
    ['kpiPurchase', 'Purchase'],
    ['kpiLoyalty', 'Loyalty']
  ];

  /* Retired fields, with the label they were asked under. A parked answer
     without its question is a sentence nobody can place. */
  const RETIRED = [
    ['growthDriver', 'Source of brand growth'],
    ['growthDriverOtherVolume', 'Source of growth — other (volume)'],
    ['growthDriverOtherValue', 'Source of growth — other (value)'],
    ['growthDriverOtherExtension', 'Source of growth — other (extension)'],
    ['commsStrategy', 'Comms strategy'],
    ['categoryDynamics', 'Category dynamics'],
    ['culturalTerritories', 'Cultural territories'],
    ['platform', 'Brand platform'],
    ['positioning', 'Positioning'],
    ['funnelStages', 'Renamed funnel stages']
  ];

  /* The pills field saved an array; everything else saved a string. */
  const flatten = v => (Array.isArray(v) ? v.filter(Boolean).join(', ') : v);

  function append(into, heading, lines) {
    if (!lines.length) return into;
    const block = [heading, ''].concat(lines).join('\n');
    return txt(into) ? `${txt(into)}\n\n${block}` : block;
  }

  function load(saved) {
    const out = Object.assign({}, saved);

    /* THE KPIS GO TO THE BRAND FIELD, NOT THE CATCH-ALL. It is the closest
       thing on the new page to where that thinking belongs, and burying five
       considered answers under "anything else" reads as having lost them.

       They are NOT split across Brand and DR by stage. Guessing that awareness
       is brand and purchase is DR would put words in the client's mouth, and
       the old five stages do not map onto the four parts Strategy runs anyway
       — there was no Trigger, and Strategy has no Intent or Loyalty. */
    const kpis = KPIS
      .filter(([id]) => txt(saved[id]))
      .map(([id, label]) => `- ${label}: ${txt(saved[id])}`);
    if (kpis.length) {
      out.brRequirements = append(out.brRequirements, 'Stage KPIs you entered earlier', kpis);
    }
    KPIS.forEach(([id]) => delete out[id]);

    /* The closest semantic match on the new page, and added to rather than
       written over — an answered target audience is the client's, and losing it
       to a migration would be the same fault in miniature. */
    if (txt(saved.sourceAudience)) {
      out.targetAudience = append(out.targetAudience,
        'Source-of-growth audience you entered earlier', [txt(saved.sourceAudience)]);
    }
    delete out.sourceAudience;

    /* A YEAR, OR NOTHING. `FY2027` and `2027 planning` both name a year and
       seed the cycle. "next planning round" does not, and inventing one would
       put a plan under a cycle nobody chose — so it is parked like any other
       answer that no longer has a field. */
    const year = txt(saved.planningYear).match(/(20\d{2})/);
    if (year && !txt(out.cycle)) out.cycle = year[1];
    const yearParked = txt(saved.planningYear) && !year
      ? [`- Planning year: ${txt(saved.planningYear)}`] : [];
    delete out.planningYear;

    /* Everything else that has no home. Named with its old label, because
       "Barrier is belief, not awareness" on its own tells a reader nothing
       about which question it was answering. */
    const parked = RETIRED
      .filter(([id]) => txt(flatten(saved[id])))
      .map(([id, label]) => `- ${label}: ${txt(flatten(saved[id]))}`)
      .concat(yearParked);
    if (parked.length) {
      out.researchNotes = append(out.researchNotes, 'From your earlier draft', parked);
    }
    RETIRED.forEach(([id]) => delete out[id]);

    return out;
  }

  return { load };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Migrate };
