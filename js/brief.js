/* Brief assembly + export.
 *
 * A deterministic brief is always available from the entered answers; "Draft
 * with Gemini" upgrades it to prose. Either way the export is the handoff to
 * LTP Strategy, and it has two readers that want opposite things: a strategist
 * and the model they drop it on read the prose, while Strategy's start screen
 * reads the block at the foot and can register the plan without anybody
 * retyping four fields.
 */

const Brief = (() => {
  const F = {};
  const SECTION_OF = {};
  SCHEMA.sections.forEach(s => s.fields.forEach(f => {
    F[f.id] = f.label; SECTION_OF[f.id] = s.title;
  }));

  function val(data, id) {
    const v = data[id];
    if (v == null || v === '') return '';
    if (Array.isArray(v)) return v.filter(Boolean).join(', ');
    return String(v).trim();
  }

  /* A select with an Other escape answers in two fields. What the client typed
     is the real answer; "Other" is only how they got to the box. */
  function chosen(data, id) {
    const v = val(data, id);
    if (v !== 'Other') return v;
    return val(data, id + 'Other');
  }

  function budgetLine(data) {
    const b = data.budget;
    if (!b || typeof b !== 'object') return val(data, 'budget');
    const money = n => (n == null ? '' : '$' + Number(n).toLocaleString('en-US'));
    if (b.low == null && b.high == null) return '';
    if (b.low === b.high) return money(b.low);
    return `${money(b.low)} – ${money(b.high)}`;
  }

  function assetLines(data) {
    const rows = Array.isArray(data.assets) ? data.assets : [];
    return rows.filter(r => r && (r.name || r.ready)).map(r => {
      const bits = [r.type, r.count ? `×${r.count}` : '', r.status || 'status TBD',
        r.ready ? `ready ${r.ready}` : ''].filter(Boolean);
      return `- **${r.name || 'Untitled asset'}** — ${bits.join(', ')}`;
    });
  }

  function linkLines(data) {
    const rows = Array.isArray(data.links) ? data.links : [];
    return rows.filter(r => r && (r.url || r.label)).map(r =>
      `- **${r.label || r.url}** — ${r.url}${r.why ? ` · ${r.why}` : ''}`);
  }

  function docLines(data) {
    const rows = Array.isArray(data.docs) ? data.docs.filter(d => d && d.name) : [];
    return rows.map(d => `- **${d.name}**${d.note ? ` — ${d.note}` : ''}`);
  }

  /* Rendered by type rather than by name, so a field added to the schema
     appears in the export without this file being touched. */
  function fieldLines(data, f) {
    if (f.type === 'dropzone') return [];
    if (f.type === 'budget') { const b = budgetLine(data); return b ? [`- **${f.label}:** ${b}`] : []; }
    if (f.type === 'assets') return assetLines(data);
    if (f.type === 'links') return linkLines(data);
    if (f.type === 'docs') return docLines(data);
    if (f.type === 'select') { const v = chosen(data, f.id); return v ? [`- **${f.label}:** ${v}`] : []; }
    const v = val(data, f.id);
    return v ? [`- **${f.label}:** ${v}`] : [];
  }

  function title(data) {
    return [chosen(data, 'productArea'), chosen(data, 'market'), val(data, 'cycle')]
      .filter(Boolean).join(' · ');
  }

  /* The prose. This is what the brief view shows and what the client can edit,
     so it carries no machine block — see `toExport`. */
  function toMarkdown(data) {
    const head = title(data);
    const L = [`# LTP Brief Intake${head ? ' — ' + head : ''}`, ''];

    SCHEMA.sections.forEach(s => {
      const lines = s.fields.flatMap(f => fieldLines(data, f));
      if (!lines.length) return;
      L.push(`## ${s.title}`, '', ...lines, '');
      /* Said where it is true rather than once at the foot, because a planner
         reading the research section is the person who needs to know the files
         are not attached. */
      if (s.id === 'research' && docLines(data).length) {
        L.push('_Files sit with the person who filled this in — request the originals directly._', '');
      }
    });

    return L.join('\n');
  }

  /* WHAT STRATEGY CAN REGISTER A PLAN FROM.
     Built from the answers, never from the prose: the brief view is editable,
     and an edit that reworded a heading must not be able to change what gets
     registered — or produce a block that no longer parses. */
  function handoff(data) {
    const s = SCHEMA.plan.slug;
    const plan = {};
    /* An empty answer is left out. `slug('')` is `''`, and a plan registered
       under the empty string is worse than one with a field visibly missing. */
    const put = (key, v) => { if (v) plan[key] = v; };
    put('region', val(data, 'region'));
    put('market', s(chosen(data, 'market')));
    put('pa', s(chosen(data, 'productArea')));
    put('cycle', val(data, 'cycle'));

    const out = { tool: 'ltp-brief-intake', version: 1, plan };

    const b = data.budget;
    if (b && typeof b === 'object' && (b.low != null || b.high != null)) {
      out.budget = { low: b.low, high: b.high, scope: (data.budgetScope || []).map(s) };
    }
    const dates = {};
    if (val(data, 'launchDates')) dates.launch = val(data, 'launchDates');
    if (val(data, 'internalDates')) dates.internal = val(data, 'internalDates');
    if (Object.keys(dates).length) out.dates = dates;

    const links = (Array.isArray(data.links) ? data.links : [])
      .filter(r => r && r.url)
      .map(r => ({ label: r.label || '', url: r.url, why: r.why || '' }));
    if (links.length) out.links = links;

    return out;
  }

  /* `md` is the brief as it currently stands, which may be a Gemini draft the
     client has since edited by hand. The block is appended fresh regardless. */
  function toExport(data, md) {
    const prose = (md == null ? toMarkdown(data) : md).replace(/\s+$/, '');
    return [
      prose, '', '## Handoff', '',
      '```json', JSON.stringify(handoff(data), null, 2), '```', ''
    ].join('\n');
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

  // Serialize the (edited) rendered brief back to Markdown for export.
  function inlineMd(node) {
    let s = '';
    node.childNodes.forEach(c => {
      if (c.nodeType === 3) s += c.textContent;
      else if (c.nodeName === 'STRONG' || c.nodeName === 'B') s += '**' + inlineMd(c) + '**';
      else if (c.nodeName === 'EM' || c.nodeName === 'I') s += '*' + inlineMd(c) + '*';
      else if (c.nodeName === 'BR') s += '\n';
      else s += inlineMd(c);
    });
    return s;
  }
  function htmlToMarkdown(root) {
    const lines = [];
    Array.from(root.childNodes).forEach(n => {
      const t = n.nodeName;
      if (t === 'H1') lines.push('# ' + inlineMd(n).trim(), '');
      else if (t === 'H2') lines.push('## ' + inlineMd(n).trim(), '');
      else if (t === 'H3') lines.push('### ' + inlineMd(n).trim(), '');
      else if (t === 'UL' || t === 'OL') { Array.from(n.children).forEach(li => { const s = inlineMd(li).trim(); if (s) lines.push('- ' + s); }); lines.push(''); }
      else if (t === 'P' || t === 'DIV') { const s = inlineMd(n).trim(); if (s) lines.push(s, ''); }
      else if (n.nodeType === 3) { const s = n.textContent.trim(); if (s) lines.push(s); }
    });
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  return { toMarkdown, toExport, handoff, toHtml, download, htmlToMarkdown };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Brief };
