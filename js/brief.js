/* Brief assembly + export.
   A deterministic fallback brief is always available from the entered data;
   "Draft with Gemini" upgrades it to prose. */

const Brief = (() => {
  const F = {}; // fieldId -> label, built from schema
  const STEP_OF = {};
  SCHEMA.steps.forEach(s => s.groups.forEach(g => g.fields.forEach(f => {
    F[f.id] = f.label; STEP_OF[f.id] = s.title;
  })));

  function val(data, id) {
    const v = data[id];
    if (v == null || v === '') return '';
    return String(v).trim();
  }

  function assetLines(data) {
    const rows = Array.isArray(data.assets) ? data.assets : [];
    return rows.filter(r => r && (r.name || r.ready)).map(r =>
      `- **${r.name || 'Untitled asset'}** — ${r.status || 'status TBD'}${r.ready ? `, ready ${r.ready}` : ''}`
    );
  }

  // Plain-markdown brief straight from the fields (no model needed).
  function toMarkdown(data) {
    const L = [];
    const title = [val(data, 'productArea'), val(data, 'market'), val(data, 'planningYear')].filter(Boolean).join(' · ');
    L.push(`# LTP Brief${title ? ' — ' + title : ''}`, '');

    L.push('## Context', '');
    [['productArea', 'Product Area'], ['market', 'Market'], ['planningYear', 'Planning year'], ['budget', 'Budget']]
      .forEach(([id, lbl]) => { if (val(data, id)) L.push(`- **${lbl}:** ${val(data, id)}`); });
    ['launchDates', 'internalDates', 'stakeholders'].forEach(id => {
      if (val(data, id)) L.push(`- **${F[id]}:** ${val(data, id)}`);
    });
    L.push('');
    L.push('### Guardrails', '');
    ['constraints', 'xpaOverlaps'].forEach(id => { if (val(data, id)) L.push(`- **${F[id]}:** ${val(data, id)}`); });
    L.push('');

    L.push('## Growth Strategy', '');
    const driver = val(data, 'growthDriver') === 'Other' ? val(data, 'growthDriverOther') : val(data, 'growthDriver');
    if (driver) L.push(`- **Source of brand growth:** ${driver}`);
    if (val(data, 'sourceAudience')) L.push(`- **${F['sourceAudience']}:** ${val(data, 'sourceAudience')}`);
    L.push('');

    L.push('## Landscape', '');
    ['competitors', 'categoryDynamics', 'whiteSpace'].forEach(id => { if (val(data, id)) L.push(`- **${F[id]}:** ${val(data, id)}`); });
    L.push('');

    L.push('## Full Funnel', '');
    const kpis = [['kpiAwareness', 'Awareness'], ['kpiConsideration', 'Consideration'], ['kpiIntent', 'Intent'], ['kpiPurchase', 'Purchase / Action'], ['kpiLoyalty', 'Loyalty']];
    kpis.forEach(([id, lbl]) => { if (val(data, id)) L.push(`- **${lbl}:** ${val(data, id)}`); });
    if (val(data, 'culturalTerritories')) L.push('', `**Cultural territories:** ${val(data, 'culturalTerritories')}`);
    L.push('');

    L.push('## Existing Assets', '');
    const a = assetLines(data);
    L.push(...(a.length ? a : ['- _None listed yet._']));
    L.push('');

    return L.join('\n');
  }

  // Minimal, safe markdown -> HTML for on-page rendering.
  function toHtml(md) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = s => esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>');
    const lines = md.split('\n');
    let html = '', inList = false;
    const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      if (/^### /.test(line)) { closeList(); html += '<h3>' + inline(line.slice(4)) + '</h3>'; }
      else if (/^## /.test(line)) { closeList(); html += '<h2>' + inline(line.slice(3)) + '</h2>'; }
      else if (/^# /.test(line)) { closeList(); html += '<h1>' + inline(line.slice(2)) + '</h1>'; }
      else if (/^[-*] /.test(line)) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(line.slice(2)) + '</li>'; }
      else if (line === '') { closeList(); }
      else { closeList(); html += '<p>' + inline(line) + '</p>'; }
    }
    closeList();
    return html;
  }

  function download(md, name) {
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { toMarkdown, toHtml, download };
})();
