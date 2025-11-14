// scripts/update-credly.js
// Uses the public Credly JSON endpoint (no Playwright needed)

const fs = require('fs');
const path = require('path');

const CREDLY_JSON_URL =
  process.env.CREDLY_JSON_URL ||
  'https://www.credly.com/users/nicola-ferrini/badges.json';

const README_PATH = path.join(__dirname, '..', 'README.md');

const START_MARK = '<!-- CREDLY-START -->';
const END_MARK = '<!-- CREDLY-END -->';

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchBadges() {
  const res = await fetch(CREDLY_JSON_URL, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Credly JSON: HTTP ${res.status}`);
  }

  const json = await res.json();
  const data = json.data || [];

  const badges = data.map(item => {
    const tpl = item.badge_template || {};
    const issuerEntities = (item.issuer && item.issuer.entities) || [];
    const issuer = issuerEntities
      .map(e => (e.entity && e.entity.name) || '')
      .filter(Boolean)
      .join(', ');

    const issuedAt = item.issued_at_date || item.issued_at || '';

    const image =
      tpl.image_url ||
      tpl.image ||
      item.image_url ||
      '';

    return {
      title: tpl.name || '',
      issuer,
      date: issuedAt,
      url: `https://www.credly.com/badges/${item.id}/public_url`,
      image
    };
  });

  // Sort by issue date descending if present
  badges.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date) - new Date(a.date);
  });

  return badges;
}

function buildMarkdown(badges) {
  if (!badges || badges.length === 0) {
    return '_No public badges found on Credly._';
  }

  const maxLatest = 5; // latest 10–15 badges
  const latest = badges.slice(0, maxLatest);

  // Group by issuer
  const issuerCounts = new Map();
  for (const b of badges) {
    const key = b.issuer || 'Other';
    issuerCounts.set(key, (issuerCounts.get(key) || 0) + 1);
  }

  const totalBadges = badges.length;
  const issuerSummary = Array.from(issuerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(
      ([issuer, count]) =>
        `- **${issuer}** · ${count} badge${count > 1 ? 's' : ''}`
    )
    .join('\n');

  const cardsHtml = latest
    .map(b => {
      const title = escapeHtml(b.title || 'Badge');
      const issuer = escapeHtml(b.issuer || '');
      const date = escapeHtml(b.date || '');
      const img = escapeHtml(b.image || '');
      const url = escapeHtml(b.url || '');

      const dateLine = date ? `<div><small>Issued: ${date}</small></div>` : '';

      return `
<div style="flex:0 0 50%; box-sizing:border-box; padding:0.75rem; text-align:center;">
  <a href="${url}" target="_blank" rel="noreferrer">
    <img src="${img}" alt="${title}" width="120" style="max-width:100%; height:auto;" />
  </a>
  <div><strong>${title}</strong></div>
  ${dateLine}
</div>`;
    })
    .join('\n');

  const gridHtml = `
<div align="center">
  <div style="display:flex; flex-wrap:wrap; justify-content:center;">
    ${cardsHtml}
  </div>
</div>
`.trim();

  const viewAllLine =
    'View the full list on Credly: ' +
    '[https://www.credly.com/users/nicola-ferrini/badges](https://www.credly.com/users/nicola-ferrini/badges)';

  return [
    `**Total Credly badges:** ${totalBadges}`,
    '',
    '### By issuer',
    '',
    issuerSummary || '_N/A_',
    '',
    `### Latest ${latest.length} badges`,
    '',
    gridHtml,
    '',
    viewAllLine
  ].join('\n');
}

function updateReadme(fragment) {
  const readme = fs.readFileSync(README_PATH, 'utf8');
  const startIndex = readme.indexOf(START_MARK);
  const endIndex = readme.indexOf(END_MARK);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error('CREDLY markers not found in README.md');
  }

  const before = readme.slice(0, startIndex + START_MARK.length);
  const after = readme.slice(endIndex);

  const newContent = `${before}\n\n${fragment}\n\n${after}`;
  fs.writeFileSync(README_PATH, newContent, 'utf8');
}

(async () => {
  try {
    const badges = await fetchBadges();
    const md = buildMarkdown(badges);
    updateReadme(md);
    console.log(`Updated README with ${badges.length} badges`);
  } catch (err) {
    console.error('Failed to update Credly badges:', err);
    process.exit(1);
  }
})();

