const { nav, footer } = require('../lib/nav');

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = 'appndrnWrdlgxRJAG';

const SANITY_PROJECT_ID = 'hchp27po';
const SANITY_DATASET = 'production';
const SANITY_API_VERSION = '2024-01-01';

const CACHE_TTL_MS = 5 * 60 * 1000;
let PROP_CACHE = { data: null, expiresAt: 0 };
let GUIDE_CACHE = { data: null, expiresAt: 0 };

// The three islands. `intro` is placeholder copy, meant to be replaced with
// 400-700 words of real writing per island. Everything else is derived.
const ISLANDS = {
  mallorca: {
    name: 'Mallorca',
    title: 'Design houses to rent in Mallorca',
    metaDesc: 'Design-led houses to rent across Mallorca, from the Tramuntana to the villages of the central plain, with guides to the places around them.',
    intro: [
      'Mallorca is the largest of the three islands and the most varied. The Tramuntana runs the length of the north-west coast in a wall of limestone, with Deia, Soller and Valldemossa stacked along it. The middle of the island, Es Pla, is flat farmland and working villages that most visitors drive straight through. The south has the quiet coves, and Palma sits in the bay with the rest of it within an hour.',
      'The houses here are mostly old: fincas, village houses, barns and mills that have been rebuilt rather than replaced. We look for the ones where that work was done carefully, and we link straight to the owner.'
    ]
  },
  ibiza: {
    name: 'Ibiza',
    title: 'Design houses to rent in Ibiza',
    metaDesc: 'Design-led houses to rent across Ibiza, from the valleys of the north to the quieter south, with guides to the villages around them.',
    intro: [
      'Ibiza splits in two. The north, inland from Sant Joan and Sant Carles, is terraced orchards, carob and almond, dry-stone walls and roads that take longer than the map says. The south and west carry the reputation, and the island everyone argues about is mostly a few kilometres of it.',
      'The traditional Ibizan finca is thick whitewashed walls and ceilings of sabina juniper, built to stay cool without help. The best modern work on the island still starts there. Those are the houses we look for.'
    ]
  },
  menorca: {
    name: 'Menorca',
    title: 'Design houses to rent in Menorca',
    metaDesc: 'Design-led houses to rent across Menorca, from Ciutadella to Mao, with guides to the villages and beaches around them.',
    intro: [
      'Menorca is the quiet one, and it has stayed that way on purpose: the whole island is a UNESCO biosphere reserve, and the building rules that come with it are why the coast still looks like it does. Ciutadella sits at one end and Mao at the other, with farmland, stone walls and the Cami de Cavalls bridle path running the whole way round the edge.',
      'There is less here than on the other two islands, in every sense. Fewer houses, fewer people, and a short season. The houses worth staying in are usually old farm buildings, rebuilt in the island sandstone.'
    ]
  }
};

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function responsiveImageUrl(url, width) {
  if (!url) return url;
  if (url.indexOf('res.cloudinary.com') >= 0) {
    try {
      const parts = url.split('/upload/');
      if (parts.length !== 2) return url;
      const rest = parts[1];
      const versionIdx = rest.search(/\/v\d+\//);
      const trail = versionIdx >= 0 ? rest.substring(versionIdx) : '/' + rest;
      return parts[0] + '/upload/c_fill,w_' + width + ',g_auto,q_auto,f_auto' + trail;
    } catch (e) { return url; }
  }
  if (url.indexOf('cdn.sanity.io') >= 0) {
    const separator = url.indexOf('?') >= 0 ? '&' : '?';
    return url + separator + 'w=' + width + '&auto=format&fit=max&q=80';
  }
  return url;
}

function getImageUrl(record, index) {
  index = index || 0;
  const f = (record && record.fields) || {};
  const heroImg = f['Hero Image'];
  const galleryStr = f['Gallery Images'];
  const galleryUrls = galleryStr ? galleryStr.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const combined = [];
  if (heroImg) combined.push(heroImg);
  for (const u of galleryUrls) combined.push(u);
  if (combined.length > index) return combined[index];
  return null;
}

// Paginated. Airtable returns at most 100 records per request.
async function fetchAllProperties() {
  let allRecords = [];
  let offset = null;
  let attempts = 0;
  do {
    let url = `https://api.airtable.com/v0/${BASE_ID}/Properties?pageSize=100`;
    if (offset) url += `&offset=${encodeURIComponent(offset)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });
    if (!response.ok) throw new Error('Airtable fetch failed: ' + response.status);
    const data = await response.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset;
    attempts++;
  } while (offset && attempts < 10);
  return allRecords;
}

async function getProperties() {
  if (PROP_CACHE.data && Date.now() < PROP_CACHE.expiresAt) return PROP_CACHE.data;
  const records = await fetchAllProperties();
  PROP_CACHE = { data: records, expiresAt: Date.now() + CACHE_TTL_MS };
  return records;
}

async function fetchGuides() {
  if (GUIDE_CACHE.data && Date.now() < GUIDE_CACHE.expiresAt) return GUIDE_CACHE.data;
  const query = `*[_type == "guide" && defined(publishedAt) && defined(slug.current)] | order(publishedAt desc) {
    title,
    "slug": slug.current,
    excerpt,
    island,
    publishedAt
  }`;
  const url = `https://${SANITY_PROJECT_ID}.apicdn.sanity.io/v${SANITY_API_VERSION}/data/query/${SANITY_DATASET}?query=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Sanity fetch failed: ' + response.status);
  const data = await response.json();
  const result = data.result || [];
  GUIDE_CACHE = { data: result, expiresAt: Date.now() + CACHE_TTL_MS };
  return result;
}

module.exports = async function handler(req, res) {
  const key = String((req.query && req.query.island) || '').trim().toLowerCase();
  const config = ISLANDS[key];
  if (!config) return res.status(404).send('Island not found');

  let records = [];
  let guides = [];
  try {
    const [props, allGuides] = await Promise.all([
      getProperties(),
      fetchGuides().catch(() => [])
    ]);
    records = props || [];
    guides = allGuides || [];
  } catch (e) {
    return res.status(500).send('Error loading island');
  }

  const houses = records
    .filter(r => {
      const f = (r && r.fields) || {};
      return String(f['Island'] || '').trim().toLowerCase() === key && f['Slug'] && f['Name'];
    })
    .sort((a, b) => {
      const da = a.fields['Date added'] ? new Date(a.fields['Date added']) : new Date(0);
      const db = b.fields['Date added'] ? new Date(b.fields['Date added']) : new Date(0);
      return db - da;
    });

  const islandGuides = guides.filter(g =>
    String(g.island || '').trim().toLowerCase() === key && g.slug
  );

  const canonicalUrl = `https://slowcasa.com/${key}`;
  const houseCount = houses.length;

  const cardsHtml = houses.map(record => {
    const f = record.fields;
    const name = escapeHtml(f['Name'] || '');
    const slug = f['Slug'] || '';
    const locationLabel = escapeHtml(f['Location label'] || '');
    const descRaw = String(f['Description'] || '');
    const desc = escapeHtml(descRaw.substring(0, 100) + (descRaw.length > 100 ? '...' : ''));
    const imgUrl = getImageUrl(record, 0) || '';
    const url = `/${key}/houses/${slug}`;
    return `<a href="${url}" class="card-link" style="text-decoration:none;color:inherit;">
      <div class="property-card">
        <div class="card-img">
          ${imgUrl ? `<img src="${escapeHtml(responsiveImageUrl(imgUrl, 600))}" alt="${name}" loading="lazy" />` : '<div class="card-img-placeholder"></div>'}
        </div>
        <p class="card-location">${locationLabel}</p>
        <p class="card-name">${name}</p>
        <p class="card-detail">${desc}</p>
      </div>
    </a>`;
  }).join('');

  const gridHtml = houses.length
    ? `<div class="property-grid">${cardsHtml}</div>`
    : `<p class="isl-empty">We are still adding houses on ${escapeHtml(config.name)}. <a href="/houses">See the whole directory</a>.</p>`;

  const guidesHtml = islandGuides.length
    ? `<section class="section isl-guides">
        <div class="section-header"><span class="section-label">Guides to ${escapeHtml(config.name)}</span></div>
        <ul class="isl-guide-list">
          ${islandGuides.map(g => `<li>
            <a href="/${key}/${escapeHtml(g.slug)}">
              <span class="isl-guide-title">${escapeHtml(g.title || '')}</span>
              ${g.excerpt ? `<span class="isl-guide-excerpt">${escapeHtml(g.excerpt)}</span>` : ''}
            </a>
          </li>`).join('')}
        </ul>
      </section>`
    : '';

  const otherIslands = Object.keys(ISLANDS).filter(k => k !== key);
  const otherHtml = `<section class="section isl-other">
    <div class="section-header"><span class="section-label">The other islands</span></div>
    <div class="isl-other-links">
      ${otherIslands.map(k => `<a href="/${k}">${escapeHtml(ISLANDS[k].name)}</a>`).join('')}
      <a href="/houses">All houses</a>
    </div>
  </section>`;

  const introHtml = config.intro.map(p => `<p>${escapeHtml(p)}</p>`).join('');

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: config.title,
    description: config.metaDesc,
    url: canonicalUrl,
    isPartOf: { '@type': 'WebSite', name: 'Slow Casa', url: 'https://slowcasa.com' }
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Slow Casa', item: 'https://slowcasa.com' },
      { '@type': 'ListItem', position: 2, name: 'Houses', item: 'https://slowcasa.com/houses' },
      { '@type': 'ListItem', position: 3, name: config.name, item: canonicalUrl }
    ]
  };

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(config.title)} | Slow Casa</title>
  <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="shortcut icon" href="/favicon.ico" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <meta name="apple-mobile-web-app-title" content="Slow Casa" />
  <link rel="manifest" href="/site.webmanifest" />
  <meta name="description" content="${escapeHtml(config.metaDesc)}" />
  <link rel="canonical" href="${canonicalUrl}" />
  <meta property="og:title" content="${escapeHtml(config.title)} | Slow Casa" />
  <meta property="og:description" content="${escapeHtml(config.metaDesc)}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Slow Casa" />
  <meta name="twitter:card" content="summary_large_image" />
  <script type="application/ld+json">${JSON.stringify(collectionSchema)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
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
  <script async src="https://plausible.io/js/pa-aahRJ1iMPfiu0NJteNWEg.js"></script>
  <script>
    window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
    plausible.init()
  </script>
  <style>
    .isl-hero { max-width: 1200px; margin: 0 auto; padding: 48px 48px 0; }
    .isl-crumb { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--grey-1); margin-bottom: 24px; }
    .isl-crumb a { color: var(--grey-1); }
    .isl-crumb a:hover { color: var(--black); }
    .isl-hero h1 { font-family: var(--serif); font-size: 46px; line-height: 1.12; margin: 0 0 24px; max-width: 16ch; }
    .isl-intro { max-width: 62ch; }
    .isl-intro p { font-size: 16px; line-height: 1.65; color: var(--black); margin: 0 0 16px; }
    .isl-count { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--grey-1); margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--grey-3); }
    .isl-houses { padding-top: 40px; }
    .isl-empty { font-size: 15px; color: var(--grey-1); }
    .isl-empty a { text-decoration: underline; }
    .isl-guide-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--grey-3); }
    .isl-guide-list li { border-bottom: 1px solid var(--grey-3); }
    .isl-guide-list a { display: block; padding: 20px 0; }
    .isl-guide-title { display: block; font-size: 17px; margin-bottom: 4px; }
    .isl-guide-excerpt { display: block; font-size: 13px; color: var(--grey-1); line-height: 1.5; max-width: 70ch; }
    .isl-guide-list a:hover .isl-guide-title { text-decoration: underline; }
    .isl-other-links { display: flex; gap: 28px; flex-wrap: wrap; }
    .isl-other-links a { font-size: 14px; border-bottom: 1px solid var(--grey-3); padding-bottom: 2px; }
    .isl-other-links a:hover { border-color: var(--black); }
    @media (max-width: 768px) {
      .isl-hero { padding: 32px 16px 0; }
      .isl-hero h1 { font-size: 32px; max-width: none; }
      .section { padding-left: 16px; padding-right: 16px; }
    }
  </style>
</head>
<body>
${nav()}

<header class="isl-hero">
  <p class="isl-crumb"><a href="/">Slow Casa</a> / <a href="/houses">Houses</a> / ${escapeHtml(config.name)}</p>
  <h1>${escapeHtml(config.title)}</h1>
  <div class="isl-intro">${introHtml}</div>
  <p class="isl-count">${houseCount} ${houseCount === 1 ? 'house' : 'houses'} on ${escapeHtml(config.name)}</p>
</header>

<section class="section isl-houses">
  ${gridHtml}
</section>

${guidesHtml}

${otherHtml}

${footer()}
</body>
</html>`;

  res.status(200).send(html);
};
