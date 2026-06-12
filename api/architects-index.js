const AIRTABLE_TOKEN = 'patgpNhgfFkQsyQj9.887202d16495ba49fad025cb888cef3eac0a6c34058675dd2516127ad083d8c6';
const BASE_ID = 'appndrnWrdlgxRJAG';
const ARCHITECTS_TABLE = 'Architects';
const PROPERTIES_TABLE = 'Properties';

// In-memory caches (persist for lifetime of warm function instance)
let ARCHITECTS_CACHE = null;
let ARCHITECTS_CACHED_AT = 0;
let PROPERTIES_CACHE = null;
let PROPERTIES_CACHED_AT = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchAllRecords(table) {
  let allRecords = [];
  let offset = null;
  let attempts = 0;
  do {
    let url = `https://api.airtable.com/v0/${BASE_ID}/${table}?pageSize=100`;
    if (offset) url += `&offset=${encodeURIComponent(offset)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Cache-Control': 'no-cache' }
    });
    if (!response.ok) throw new Error(`Airtable ${table} fetch failed: ` + response.status);
    const data = await response.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset;
    attempts++;
  } while (offset && attempts < 10);
  return allRecords;
}

async function getArchitects() {
  if (ARCHITECTS_CACHE && (Date.now() - ARCHITECTS_CACHED_AT) < CACHE_TTL_MS) {
    return ARCHITECTS_CACHE;
  }
  const records = await fetchAllRecords(ARCHITECTS_TABLE);
  if (records.length > 0) {
    ARCHITECTS_CACHE = records;
    ARCHITECTS_CACHED_AT = Date.now();
  }
  return records;
}

async function getProperties() {
  if (PROPERTIES_CACHE && (Date.now() - PROPERTIES_CACHED_AT) < CACHE_TTL_MS) {
    return PROPERTIES_CACHE;
  }
  const records = await fetchAllRecords(PROPERTIES_TABLE);
  if (records.length > 0) {
    PROPERTIES_CACHE = records;
    PROPERTIES_CACHED_AT = Date.now();
  }
  return records;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Serve index thumbnails light: inject Cloudinary transforms when possible
function thumbUrl(url) {
  if (!url) return null;
  if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', '/upload/f_auto,q_auto,w_480/');
  }
  return url;
}

function getPropertyHero(record) {
  const f = (record && record.fields) || {};
  if (f['Hero Image']) return f['Hero Image'];
  const galleryStr = f['Gallery Images'];
  if (galleryStr) {
    const first = galleryStr.split('\n').map(s => s.trim()).filter(Boolean)[0];
    if (first) return first;
  }
  const images = f['Images'];
  if (images && images.length > 0) {
    if (images[0].thumbnails && images[0].thumbnails.full) return images[0].thumbnails.full.url;
    return images[0].url;
  }
  return null;
}

module.exports = async function handler(req, res) {
  let architects, properties;
  try {
    [architects, properties] = await Promise.all([getArchitects(), getProperties()]);
  } catch (e) {
    return res.status(500).send('Error loading architects');
  }

  // Map property record id -> record, for linked lookups
  const propById = new Map();
  for (const p of properties) {
    if (p && p.id) propById.set(p.id, p);
  }

  // Published architects only, alphabetical
  const published = architects
    .filter(a => (a.fields && a.fields['Status']) === 'Published' && a.fields['Name'] && a.fields['Slug'])
    .sort((a, b) => String(a.fields['Name']).localeCompare(String(b.fields['Name'])));

  // Build card data
  const cards = published.map(a => {
    const f = a.fields;
    const linkedIds = f['Properties'] || [];
    const linkedProps = linkedIds.map(id => propById.get(id)).filter(p => p && p.fields && p.fields['Name']);
    const count = linkedProps.length;

    // Image chain: Studio Photo -> first linked property hero -> none
    let img = f['Studio Photo'] || null;
    if (!img && linkedProps.length > 0) img = getPropertyHero(linkedProps[0]);
    img = thumbUrl(img);

    let countLabel;
    if (count === 1) countLabel = '1 house on Slow Casa';
    else if (count > 1) countLabel = `${count} houses on Slow Casa`;
    else if ((f['Philosophy'] || '').trim()) countLabel = 'In conversation';
    else countLabel = '';

    return {
      name: f['Name'],
      slug: f['Slug'],
      location: f['Location'] || '',
      img,
      countLabel
    };
  });

  const canonicalUrl = 'https://slowcasa.com/design-directory';
  const title = 'Design Directory | Slow Casa';
  const metaDesc = 'The people behind the houses on Slow Casa. Starting with the architects: studios and practices working across rural Europe, from new builds to the careful rebuilding of old farms.';

  // JSON-LD ItemList
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Design Directory",
    "url": canonicalUrl,
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": cards.map((c, i) => ({
        "@type": "ListItem",
        "position": i + 1,
        "name": c.name,
        "url": `https://slowcasa.com/architects/${c.slug}`
      }))
    }
  };
  const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`;

  const cardsHtml = cards.map(c => {
    const url = `/architects/${c.slug}`;
    return `<a href="${url}" class="arch-card">
      <div class="arch-card-img">
        ${c.img ? `<img src="${escapeHtml(c.img)}" alt="${escapeHtml(c.name)}" loading="lazy" />` : ''}
      </div>
      <p class="arch-card-name">${escapeHtml(c.name)}</p>
      ${c.location ? `<p class="arch-card-location">${escapeHtml(c.location)}</p>` : ''}
      ${c.countLabel ? `<p class="arch-card-count">${escapeHtml(c.countLabel)}</p>` : ''}
    </a>`;
  }).join('');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(metaDesc)}" />
  <link rel="canonical" href="${canonicalUrl}" />
  ${jsonLdScript}
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(metaDesc)}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Slow Casa" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(metaDesc)}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/slow-casa.css" />
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-B930Z6F96Z"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-B930Z6F96Z');
  </script>
  <style>
    @font-face {
      font-family: 'TT Norms Pro';
      src: url('/TT_Norms_Pro_Regular.woff2') format('woff2');
      font-weight: 400;
      font-display: swap;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #f9f7f2; font-family: 'DM Sans', system-ui, sans-serif; color: #0f0f0f; }
    a { color: inherit; text-decoration: none; }
    h1, h2, h3, h4 { font-weight: 400; }

    nav {
      display: grid; grid-template-columns: 1fr auto 1fr;
      align-items: center; padding: 28px 48px;
      background: #f9f7f2; z-index: 10;
    }
    .wordmark { font-family: 'DM Serif Display', Georgia, serif; font-size: 28px; font-weight: 400; letter-spacing: 0.01em; text-align: center; color: #0f0f0f; }
    .nav-links { display: flex; gap: 32px; list-style: none; justify-content: flex-end; }
    .nav-links a { font-size: 13px; color: #0f0f0f; opacity: 0.7; letter-spacing: 0.03em; transition: opacity 0.2s; }
    .nav-links a:hover { opacity: 1; }

    .dir-header {
      max-width: 800px;
      margin: 0 auto;
      padding: 80px 48px 64px;
      text-align: center;
    }
    .dir-eyebrow {
      font-family: 'DM Sans', sans-serif;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 24px;
    }
    .dir-title {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: clamp(44px, 6vw, 64px);
      line-height: 1.0;
      letter-spacing: -0.02em;
      color: #0f0f0f;
      margin-bottom: 20px;
    }
    .dir-subline {
      font-family: 'TT Norms Pro', 'DM Sans', system-ui, sans-serif;
      font-size: 17px;
      font-weight: 300;
      line-height: 1.6;
      color: #888;
      max-width: 520px;
      margin: 0 auto;
    }

    .grid-section-label {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 48px 32px;
      font-family: 'DM Sans', sans-serif;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #0f0f0f;
    }

    .arch-grid {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 48px 96px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 56px 32px;
    }
    .arch-card { display: block; cursor: pointer; }
    .arch-card-img {
      width: 100%;
      aspect-ratio: 4/3;
      overflow: hidden;
      margin-bottom: 18px;
      background: #efece5;
    }
    .arch-card-img img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.5s ease;
    }
    .arch-card:hover .arch-card-img img { transform: scale(1.03); }
    .arch-card-name {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: 20px;
      font-weight: 400;
      line-height: 1.2;
      color: #0f0f0f;
      margin-bottom: 6px;
    }
    .arch-card-location {
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 6px;
    }
    .arch-card-count {
      font-family: 'TT Norms Pro', 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 300;
      color: #888;
    }

    .arch-empty {
      max-width: 680px;
      margin: 0 auto;
      padding: 0 48px 120px;
      text-align: center;
      color: #888;
      font-size: 15px;
      font-weight: 300;
    }

    footer {
      padding: 32px 48px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      max-width: 1200px;
      margin: 0 auto;
      border-top: 0.5px solid #e8e8e8;
    }
    .footer-left { display: flex; align-items: center; gap: 32px; }
    .footer-copy { font-size: 12px; color: #888; }
    .footer-policy { font-size: 12px; color: #888; letter-spacing: 0.08em; text-transform: uppercase; transition: color 0.2s; }
    .footer-policy:hover { color: #0f0f0f; }
    .footer-links { display: flex; gap: 28px; }
    .footer-links a { font-size: 12px; color: #888; letter-spacing: 0.08em; text-transform: uppercase; transition: color 0.2s; }
    .footer-links a:hover { color: #0f0f0f; }

    @media (max-width: 900px) {
      .arch-grid { grid-template-columns: repeat(2, 1fr); gap: 44px 24px; }
    }
    @media (max-width: 768px) {
      nav { padding: 20px 24px; }
      .nav-links { display: none; }
      .wordmark { font-size: 22px; }
      .dir-header { padding: 48px 24px 40px; }
      .arch-grid { grid-template-columns: 1fr; gap: 40px; padding: 0 24px 72px; }
      .grid-section-label { padding: 0 24px 24px; }
      footer { padding: 24px; flex-direction: column; gap: 16px; text-align: center; }
      .footer-left { flex-direction: column; gap: 12px; }
    }
  </style>
</head>
<body>

  <nav>
    <div></div>
    <a href="/" class="wordmark">Slow Casa</a>
    <ul class="nav-links">
      <li><a href="/directory">Directory</a></li>
      <li><a href="/design-directory">Architects</a></li>
      <li><a href="/guides">Guides</a></li>
      <li><a href="https://newsletter.slowcasa.com" target="_blank" rel="noopener">Newsletter</a></li>
      <li><a href="/criteria">About</a></li>
    </ul>
  </nav>

  <header class="dir-header">
    <h1 class="dir-title">Design Directory</h1>
    <p class="dir-subline">The people behind the houses on Slow Casa. Starting with the architects.</p>
  </header>

  ${cards.length > 0 ? `
  <p class="grid-section-label">Architects</p>
  <div class="arch-grid">
    ${cardsHtml}
  </div>` : `
  <div class="arch-empty"><p>Profiles are being added. Check back soon.</p></div>`}

  <footer>
    <div class="footer-left">
      <span class="footer-copy">&copy; 2026 Slow Casa</span>
      <a href="/privacy" class="footer-policy">Privacy Policy</a>
    </div>
    <div class="footer-links">
      <a href="https://www.instagram.com/theslowcasa/" target="_blank" rel="noopener">Instagram</a>
      <a href="https://newsletter.slowcasa.com" target="_blank" rel="noopener">Newsletter</a>
    </div>
  </footer>

</body>
</html>`;

  res.status(200).send(html);
};

