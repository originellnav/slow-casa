const AIRTABLE_TOKEN = 'patgpNhgfFkQsyQj9.887202d16495ba49fad025cb888cef3eac0a6c34058675dd2516127ad083d8c6';
const BASE_ID = 'appndrnWrdlgxRJAG';
const ARCHITECTS_TABLE = 'Architects';
const PROPERTIES_TABLE = 'Properties';

// In-memory caches (persist for lifetime of warm function instance)
const ARCHITECT_CACHE = new Map(); // slug -> { data, expiresAt }
let PROPERTIES_CACHE = null;
let PROPERTIES_CACHED_AT = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getArchitectCached(slug) {
  const entry = ARCHITECT_CACHE.get(slug);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    ARCHITECT_CACHE.delete(slug);
    return null;
  }
  return entry.data;
}

function setArchitectCached(slug, data) {
  if (!data) return;
  ARCHITECT_CACHE.set(slug, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function getAllProperties() {
  if (PROPERTIES_CACHE && (Date.now() - PROPERTIES_CACHED_AT) < CACHE_TTL_MS) {
    return PROPERTIES_CACHE;
  }
  let allRecords = [];
  let offset = null;
  let attempts = 0;
  do {
    let url = `https://api.airtable.com/v0/${BASE_ID}/${PROPERTIES_TABLE}?pageSize=100`;
    if (offset) url += `&offset=${encodeURIComponent(offset)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Cache-Control': 'no-cache' }
    });
    if (!response.ok) throw new Error('Airtable properties fetch failed: ' + response.status);
    const data = await response.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset;
    attempts++;
  } while (offset && attempts < 10);
  if (allRecords.length > 0) {
    PROPERTIES_CACHE = allRecords;
    PROPERTIES_CACHED_AT = Date.now();
  }
  return allRecords;
}

async function fetchArchitectBySlug(slug) {
  const formula = encodeURIComponent(`{Slug} = "${slug}"`);
  const url = `https://api.airtable.com/v0/${BASE_ID}/${ARCHITECTS_TABLE}?filterByFormula=${formula}&maxRecords=1`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Cache-Control': 'no-cache' }
  });
  if (!response.ok) throw new Error('Airtable architect fetch failed: ' + response.status);
  const data = await response.json();
  return data.records && data.records[0];
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Simple markdown-to-HTML converter for the Philosophy field
// Handles: **bold**, *italic*, paragraphs (double line breaks), single line breaks
// Also handles Airtable's \|text\| escape pattern (legacy from rich text → plain text conversion)
function formatMarkdown(text) {
  if (!text) return '';

  // Normalize line endings
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Convert Airtable's \|text\| escape pattern to standard **text** markdown
  text = text.replace(/\\\|(.+?)\\\|/g, '**$1**');

  // Split into paragraphs (double line breaks)
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  return paragraphs.map(p => {
    // Convert **bold** to <strong>
    let html = p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Convert *italic* to <em>
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    // Single line breaks within paragraph become <br>
    html = html.replace(/\n/g, '<br>');
    return `<p>${html}</p>`;
  }).join('');
}

function getPropertyImageUrl(record, index) {
  index = index || 0;
  const f = record.fields || {};
  const heroImg = f['Hero Image'];
  const galleryStr = f['Gallery Images'];
  const galleryUrls = galleryStr ? galleryStr.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const combined = [];
  if (heroImg) combined.push(heroImg);
  for (const u of galleryUrls) combined.push(u);
  if (combined.length > index) return combined[index];
  const images = f['Images'];
  if (images && images.length > index) {
    if (images[index].thumbnails && images[index].thumbnails.full) return images[index].thumbnails.full.url;
    return images[index].url;
  }
  return null;
}

module.exports = async function handler(req, res) {
  const { slug } = req.query;
  if (!slug) return res.status(400).send('Missing slug');

  let architect = getArchitectCached(slug);

  if (!architect) {
    try {
      architect = await fetchArchitectBySlug(slug);
    } catch (e) {
      return res.status(500).send('Error fetching architect');
    }
    if (!architect) return res.status(404).send('Architect not found');
    setArchitectCached(slug, architect);
  }

  const f = architect.fields;

  // Only render Published architects (unless ?preview=true for testing)
  const status = f['Status'] || 'Draft';
  const isPreview = req.query.preview === 'true';
  if (status !== 'Published' && !isPreview) {
    return res.status(404).send('Architect not found');
  }

  const name = f['Name'] || '';
  const location = f['Location'] || '';
  const country = f['Country'] || '';
  const studioUrl = f['Studio URL'] || '';
  const bio = f['Bio'] || '';
  const philosophy = (f['Philosophy'] || '').trim();
  const studioPhoto = f['Studio Photo'] || '';
  const linkedPropertyIds = f['Properties'] || []; // Array of property record IDs

  // Fetch all properties and filter to ones linked to this architect
  let linkedProperties = [];
  if (linkedPropertyIds.length > 0) {
    try {
      const allProperties = await getAllProperties();
      linkedProperties = allProperties.filter(p => linkedPropertyIds.includes(p.id));
      // Filter to valid properties (has name + image)
      linkedProperties = linkedProperties.filter(p => {
        const pf = p.fields || {};
        if (!pf['Name']) return false;
        return !!pf['Hero Image'] || !!pf['Gallery Images'] || (pf['Images'] && pf['Images'].length > 0);
      });
      // Sort by Date added descending
      linkedProperties.sort((a, b) => {
        const da = a.fields['Date added'] ? new Date(a.fields['Date added']) : new Date(0);
        const db = b.fields['Date added'] ? new Date(b.fields['Date added']) : new Date(0);
        return db - da;
      });
    } catch (e) {
      console.error('Error fetching properties:', e);
    }
  }

  // SEO
  const title = `${name} | Architect on Slow Casa`;
  const metaDescBase = bio ? bio.substring(0, 155).replace(/\n/g, ' ') : `${name} is an architect featured on Slow Casa, a curated directory of architect-designed vacation homes in rural Europe.`;
  const metaDesc = metaDescBase.length > 155 ? metaDescBase.substring(0, 152) + '...' : metaDescBase;
  const canonicalUrl = `https://slowcasa.com/architects/${slug}`;
  const ogImage = studioPhoto || (linkedProperties[0] ? (linkedProperties[0].fields['Hero Image'] || '') : '');

  // JSON-LD Organization schema
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": name,
    "description": bio,
    "url": canonicalUrl
  };
  if (studioUrl) structuredData.sameAs = [studioUrl];
  if (location) {
    structuredData.address = {
      "@type": "PostalAddress",
      "addressLocality": location.split(',')[0].trim()
    };
    if (country) structuredData.address.addressCountry = country;
  }
  if (studioPhoto) structuredData.image = studioPhoto;
  if (linkedProperties.length > 0) {
    structuredData.subjectOf = linkedProperties.slice(0, 6).map(p => ({
      "@type": "LodgingBusiness",
      "name": p.fields['Name'] || '',
      "url": `https://slowcasa.com/properties/${p.fields['Slug'] || ''}`
    }));
  }

  const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`;

  // Render property cards
  const propertyCardsHtml = linkedProperties.map(record => {
    const pf = record.fields;
    const pname = escapeHtml(pf['Name'] || '');
    const pslug = pf['Slug'] || '';
    const plocation = escapeHtml(pf['Location label'] || '');
    const pimg = getPropertyImageUrl(record, 0) || '';
    const purl = '/properties/' + pslug;
    return `<a href="${purl}" class="prop-card">
      <div class="prop-card-img">
        ${pimg ? `<img src="${escapeHtml(pimg)}" alt="${pname}" loading="lazy" />` : ''}
      </div>
      <p class="prop-card-location">${plocation}</p>
      <p class="prop-card-name">${pname}</p>
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
  <meta property="og:type" content="profile" />
  <meta property="og:site_name" content="Slow Casa" />
  ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(metaDesc)}" />
  ${ogImage ? `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />` : ''}
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

    /* Architect hero */
    .arch-hero {
      max-width: 1200px;
      margin: 0 auto;
      padding: 80px 48px 0;
      text-align: center;
    }
    .arch-eyebrow {
      font-family: 'DM Sans', sans-serif;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 24px;
    }
    .arch-name {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: clamp(48px, 6vw, 72px);
      line-height: 1.0;
      letter-spacing: -0.02em;
      color: #0f0f0f;
      margin-bottom: 24px;
    }
    .arch-meta {
      font-family: 'TT Norms Pro', 'DM Sans', sans-serif;
      font-size: 15px;
      font-weight: 300;
      color: #888;
      letter-spacing: 0.02em;
    }
    .arch-meta a {
      border-bottom: 0.5px solid #888;
      padding-bottom: 1px;
      transition: color 0.2s, border-color 0.2s;
    }
    .arch-meta a:hover { color: #0f0f0f; border-color: #0f0f0f; }
    .arch-meta-sep { display: inline-block; margin: 0 12px; opacity: 0.6; }

    /* Studio photo */
    .arch-photo {
      max-width: 1200px;
      margin: 80px auto 0;
      padding: 0 48px;
    }
    .arch-photo-inner {
      width: 100%;
      aspect-ratio: 16/9;
      background: #e8e8e8;
      overflow: hidden;
    }
    .arch-photo-inner img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    /* Bio */
    .arch-bio {
      max-width: 680px;
      margin: 0 auto;
      padding: 96px 48px 0;
      text-align: center;
    }
    .arch-bio-text {
      font-family: 'TT Norms Pro', 'DM Sans', sans-serif;
      font-size: 19px;
      font-weight: 300;
      line-height: 1.7;
      color: #2a2a28;
    }
    .arch-bio-text p { margin-bottom: 1.4em; }
    .arch-bio-text p:last-child { margin-bottom: 0; }

    /* Philosophy */
    .arch-philosophy {
      max-width: 680px;
      margin: 0 auto;
      padding: 96px 48px 0;
    }
    .arch-section-label {
      font-family: 'DM Sans', sans-serif;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #0f0f0f;
      margin-bottom: 36px;
      text-align: center;
    }
    .arch-philosophy-content {
      font-family: 'TT Norms Pro', 'DM Sans', sans-serif;
      font-size: 17px;
      font-weight: 300;
      line-height: 1.85;
      color: #333;
    }
    .arch-philosophy-content p { margin-bottom: 1.4em; }
    .arch-philosophy-content strong {
      font-weight: 500;
      color: #0f0f0f;
      display: block;
      margin-top: 1em;
      margin-bottom: 0.4em;
      font-size: 16px;
      letter-spacing: 0.01em;
    }
    .arch-philosophy-content p:first-child strong { margin-top: 0; }

    /* Properties */
    .arch-properties {
      max-width: 1200px;
      margin: 0 auto;
      padding: 96px 48px 0;
    }
    .arch-properties-header {
      text-align: center;
      margin-bottom: 64px;
    }
    .arch-properties-title {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: clamp(32px, 4vw, 44px);
      font-weight: 400;
      line-height: 1.1;
      color: #0f0f0f;
    }
    .arch-properties-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 48px 32px;
    }
    .prop-card {
      display: block;
      cursor: pointer;
    }
    .prop-card-img {
      width: 100%;
      aspect-ratio: 4/3;
      overflow: hidden;
      margin-bottom: 16px;
      background: #e8e8e8;
    }
    .prop-card-img img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.5s ease;
    }
    .prop-card:hover .prop-card-img img { transform: scale(1.03); }
    .prop-card-location {
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 6px;
    }
    .prop-card-name {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: 18px;
      font-weight: 400;
      line-height: 1.2;
      color: #0f0f0f;
    }

    .arch-empty-properties {
      text-align: center;
      padding: 48px 0;
      color: #888;
      font-size: 14px;
      font-style: italic;
    }

    /* Footer */
    footer {
      padding: 80px 48px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      max-width: 1200px;
      margin: 96px auto 0;
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
      .arch-properties-grid { grid-template-columns: repeat(2, 1fr); gap: 40px 24px; }
    }

    @media (max-width: 768px) {
      nav { padding: 20px 24px; }
      .nav-links { display: none; }
      .arch-hero { padding: 48px 24px 0; }
      .arch-name { font-size: clamp(36px, 9vw, 48px); }
      .arch-photo { padding: 0 24px; margin-top: 56px; }
      .arch-bio { padding: 64px 24px 0; }
      .arch-bio-text { font-size: 17px; }
      .arch-philosophy { padding: 64px 24px 0; }
      .arch-properties { padding: 64px 24px 0; }
      .arch-properties-grid { grid-template-columns: 1fr; gap: 40px; }
      footer { padding: 56px 24px 24px; margin-top: 64px; flex-direction: column; gap: 16px; text-align: center; }
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
      <li><a href="/journal">Journal</a></li>
      <li><a href="https://slowcasa.beehiiv.com/subscribe" target="_blank" rel="noopener">Newsletter</a></li>
      <li><a href="/criteria">About</a></li>
    </ul>
  </nav>

  <section class="arch-hero">
    <p class="arch-eyebrow">Architect</p>
    <h1 class="arch-name">${escapeHtml(name)}</h1>
    <p class="arch-meta">
      ${location ? escapeHtml(location) : ''}
      ${location && studioUrl ? '<span class="arch-meta-sep">·</span>' : ''}
      ${studioUrl ? `<a href="${escapeHtml(studioUrl)}" target="_blank" rel="noopener">Visit studio</a>` : ''}
    </p>
  </section>

  ${studioPhoto ? `
  <section class="arch-photo">
    <div class="arch-photo-inner">
      <img src="${escapeHtml(studioPhoto)}" alt="${escapeHtml(name)}" />
    </div>
  </section>` : ''}

  ${bio ? `
  <section class="arch-bio">
    <div class="arch-bio-text">${formatMarkdown(bio)}</div>
  </section>` : ''}

  ${philosophy ? `
  <section class="arch-philosophy">
    <p class="arch-section-label">In Conversation</p>
    <div class="arch-philosophy-content">${formatMarkdown(philosophy)}</div>
  </section>` : ''}

  <section class="arch-properties">
    <div class="arch-properties-header">
      <h2 class="arch-properties-title">Properties on Slow Casa</h2>
    </div>
    ${linkedProperties.length > 0 ? `
      <div class="arch-properties-grid">
        ${propertyCardsHtml}
      </div>
    ` : `
      <div class="arch-empty-properties">No properties currently listed.</div>
    `}
  </section>

  <footer>
    <div class="footer-left">
      <span class="footer-copy">&copy; 2026 Slow Casa</span>
      <a href="/privacy" class="footer-policy">Privacy Policy</a>
    </div>
    <div class="footer-links">
      <a href="https://www.instagram.com/theslowcasa/" target="_blank" rel="noopener">Instagram</a>
      <a href="https://slowcasa.beehiiv.com/subscribe" target="_blank" rel="noopener">Newsletter</a>
    </div>
  </footer>

</body>
</html>`;

  res.status(200).send(html);
};
