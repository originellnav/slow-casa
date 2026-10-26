// api/place-page.js
// One page per recommended place: /mallorca/places/celler-sa-sini
// Data: Airtable Places (name, description, photos, town, links, coordinates).
// The page keeps readers on Slow Casa and gives each place somewhere for
// guides, the map and "we featured you" emails to link to. Around the place
// itself it shows the guides that mention it, homes to rent nearby, car hire
// and more places close by.
// A page is only indexed once it has a photo and a proper description
// (see M.placeIndexable). Until then it is live but noindex.

const { nav, footer } = require('../lib/nav');
const { houseCard, placeOf } = require('../lib/card');
const M = require('../lib/magazine');
const { titleCase } = require('../lib/titlecase');

const esc = M.esc;
const SANITY_PARTNERS_URL = 'https://hchp27po.apicdn.sanity.io/v2024-01-01/data/query/production?query=' +
  encodeURIComponent('*[_type == "partners"][0]{ carHireUrl, carHireHeading, carHireText, carHireButton }');

// schema.org type per Places category. First match wins.
const SCHEMA_TYPES = {
  'Eat': 'Restaurant', 'Drink': 'BarOrPub', 'Bakery': 'Bakery',
  'Swim': 'Beach', 'See': 'TouristAttraction', 'Do': 'TouristAttraction',
  'Play': 'TouristAttraction', 'Experience': 'TouristAttraction',
  'Beach Club': 'LocalBusiness', 'Stay': 'LodgingBusiness'
};

let PARTNERS_CACHE = null;
let PARTNERS_AT = 0;
async function getPartners() {
  if (PARTNERS_CACHE && Date.now() - PARTNERS_AT < 5 * 60 * 1000) return PARTNERS_CACHE;
  try {
    const r = await fetch(SANITY_PARTNERS_URL);
    const data = r.ok ? await r.json() : {};
    PARTNERS_CACHE = data.result || {};
    PARTNERS_AT = Date.now();
  } catch (e) { PARTNERS_CACHE = PARTNERS_CACHE || {}; }
  return PARTNERS_CACHE;
}

function notFound(res) {
  res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><title>Place not found | Slow Casa</title><meta name="robots" content="noindex" /></head>
<body style="font-family: system-ui, sans-serif;max-width:600px;margin:80px auto;padding:0 24px;text-align:center;">
<h1>Place Not Found</h1>
<p>We couldn't find that place. <a href="/magazine">Browse the Magazine</a> or <a href="/">return home</a>.</p>
</body></html>`);
}

function paras(txt) {
  return String(txt || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p>${esc(p)}</p>`).join('');
}

// Image in the text column, with sizes for phones and retina screens.
function placeImg(url, alt, eager) {
  const srcset = [600, 900, 1200, 1600].map(w => M.imgUrl(url, w) + ' ' + w + 'w').join(', ');
  return `<figure class="pl-image"><img src="${esc(M.imgUrl(url, 1200))}" srcset="${esc(srcset)}" sizes="(max-width: 768px) calc(100vw - 48px), 584px" alt="${esc(alt)}" ${eager ? 'fetchpriority="high" loading="eager"' : 'loading="lazy"'} /></figure>`;
}

function trim(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

module.exports = async function handler(req, res) {
  const slug = String((req.query && req.query.slug) || '').trim().toLowerCase();
  const island = String((req.query && req.query.island) || '').trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) return notFound(res);

  let props, places;
  try {
    props = await M.getProperties();
    places = await M.getPlaces(props, { all: true });
  } catch (e) {
    return res.status(500).send('Error loading place');
  }

  const place = places.find(p => p.slug === slug && p.islandKey);
  if (!place) return notFound(res);
  // One place, one URL: the wrong island in the path 301s to the right one.
  if (place.islandKey !== island) {
    res.statusCode = 301;
    res.setHeader('Location', M.placeUrl(place));
    return res.end();
  }

  const f = place.fields;
  const name = String(f['Name']).trim();
  const town = String(f['Town'] || '').trim();
  const islandLabel = M.ISLANDS[place.islandKey] || (place.islandKey.charAt(0).toUpperCase() + place.islandKey.slice(1));
  const cats = M.placeCategories(f);
  const text = M.placeText(f);
  const images = M.placeImages(f);
  const website = M.placeLink(f);
  const coords = M.placeCoords(f);
  const mapsRaw = String(f['Google Maps'] || '').trim();
  const mapsUrl = /^https?:\/\//i.test(mapsRaw) ? mapsRaw
    : coords ? `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lon}` : '';
  const path = M.placeUrl(place);
  const canonicalUrl = 'https://slowcasa.com' + path;
  const indexable = M.placeIndexable(place);

  const where = [town, islandLabel].filter(Boolean).join(', ');
  const metaTitle = `${name}${town ? ', ' + town : ''} | Slow Casa`;
  const metaDesc = text
    ? trim(text, 155)
    : `${name}${where ? ' in ' + where : ''}: a place we love, close to the houses in the Slow Casa collection.`;

  // ---- Guides that mention this place (link to its website or to this page) ----
  let featuredHtml = '';
  let guides = [];
  try {
    guides = await M.getGuides();
    const keys = [M.linkKey(website), M.linkKey(canonicalUrl), M.linkKey(path)].filter(k => k && k.length > 3);
    const featured = guides.filter(g => (g.links || []).some(h => keys.indexOf(M.linkKey(h)) !== -1)).slice(0, 3);
    featuredHtml = M.row({ title: 'Featured in', cards: featured.map(g => M.storyCard(g)) });
  } catch (e) { featuredHtml = ''; }

  // ---- Homes to rent nearby ----
  // Houses this place is linked to first, then the closest houses on the island.
  let homesHtml = '';
  try {
    const linked = Array.isArray(f['Properties']) ? f['Properties'] : [];
    const houses = (props || []).filter(r => {
      const hf = r.fields || {};
      return hf['Slug'] && hf['Name'] && M.islandOf(hf['Island']) === place.islandKey;
    });
    const dist = r => M.distanceKm(coords, M.placeCoords(r.fields));
    houses.sort((a, b) => {
      const la = linked.indexOf(a.id) !== -1 ? 0 : 1;
      const lb = linked.indexOf(b.id) !== -1 ? 0 : 1;
      return la - lb || dist(a) - dist(b);
    });
    const cards = houses.slice(0, 2).map(r => {
      const hf = r.fields;
      const hero = hf['Hero Image'] || String(hf['Gallery Images'] || '').split('\n')[0].trim();
      return houseCard({
        url: '/' + place.islandKey + '/houses/' + hf['Slug'],
        img: hero ? M.imgUrl(hero, 800) : '',
        name: hf['Name'], guests: hf['Sleeps'], place: placeOf(hf)
      });
    });
    if (cards.length) {
      homesHtml = `<section class="pl-homes"><h2>Homes to Rent Nearby</h2><div class="pl-homes-grid">${cards.join('')}</div></section>`;
    }
  } catch (e) { homesHtml = ''; }

  // ---- Car hire (same partner link as the guides) ----
  let carHtml = '';
  const partners = await getPartners();
  if (partners && partners.carHireUrl) {
    const heading = partners.carHireHeading || 'Hire a Car';
    carHtml = `<aside class="pl-cta">
      <p class="pl-cta-eyebrow">Getting Around</p>
      <p class="pl-cta-title">${esc(titleCase(heading))}</p>
      ${partners.carHireText ? `<p class="pl-cta-text">${esc(partners.carHireText)}</p>` : ''}
      <a class="pl-cta-btn" href="/go/car-hire-place-${esc(slug)}" target="_blank" rel="sponsored nofollow noopener"><span>${esc(titleCase(partners.carHireButton || 'Compare Cars'))}</span>${M.CHEVRON}</a>
    </aside>`;
  }

  // ---- More places close by (same island, nearest first) ----
  let moreHtml = '';
  try {
    const others = places.filter(p => p.id !== place.id && p.islandKey === place.islandKey && p.section);
    const near = coords
      ? others.filter(p => M.placeCoords(p.fields)).sort((a, b) =>
          M.distanceKm(coords, M.placeCoords(a.fields)) - M.distanceKm(coords, M.placeCoords(b.fields)))
      : others;
    moreHtml = M.row({
      title: 'More nearby',
      href: M.sectionUrl(place.section || 'where-to-eat', place.islandKey),
      linkLabel: 'All of ' + islandLabel,
      cards: near.slice(0, 3).map(M.placeCard)
    });
  } catch (e) { moreHtml = ''; }

  // ---- Breadcrumbs: Mallorca / Where to eat / Name ----
  const crumbList = [
    { name: 'Slow Casa', url: 'https://slowcasa.com' },
    { name: islandLabel, url: 'https://slowcasa.com/' + place.islandKey }
  ];
  if (place.section) crumbList.push({ name: M.SECTIONS[place.section].label, url: 'https://slowcasa.com' + M.sectionUrl(place.section, place.islandKey) });
  crumbList.push({ name: name, url: canonicalUrl });
  const crumbHtml = crumbList.slice(1, -1)
    .map(c => `<a href="${esc(c.url.replace('https://slowcasa.com', ''))}">${esc(c.name)}</a>`)
    .join(' <span aria-hidden="true">/</span> ');

  // ---- Structured data ----
  const schemaType = cats.map(c => SCHEMA_TYPES[c]).find(Boolean) || 'LocalBusiness';
  const ld = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    'name': name,
    'url': canonicalUrl,
    'address': { '@type': 'PostalAddress', 'addressLocality': town || undefined, 'addressRegion': islandLabel, 'addressCountry': 'ES' }
  };
  if (text) ld.description = trim(text, 300);
  if (images.length) ld.image = images.map(u => M.imgUrl(u, 1200));
  if (website) ld.sameAs = [website];
  if (coords) ld.geo = { '@type': 'GeoCoordinates', 'latitude': coords.lat, 'longitude': coords.lon };
  if (mapsUrl) ld.hasMap = mapsUrl;
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    'itemListElement': crumbList.map((c, i) => ({ '@type': 'ListItem', 'position': i + 1, 'name': c.name, 'item': c.url }))
  };

  // ---- Details: where it is and how to reach it ----
  const details = [
    where ? `<div class="pl-detail"><p class="pl-detail-k">Where</p><p class="pl-detail-v">${esc(where)}</p></div>` : '',
    website ? `<div class="pl-detail"><p class="pl-detail-k">Website</p><p class="pl-detail-v"><a href="/go/place-${esc(slug)}" target="_blank" rel="noopener">${esc(M.linkKey(website).split('/')[0])}</a></p></div>` : '',
    mapsUrl ? `<div class="pl-detail"><p class="pl-detail-k">Map</p><p class="pl-detail-v"><a href="${esc(mapsUrl)}" target="_blank" rel="noopener">Open in Google Maps</a></p></div>` : ''
  ].join('');

  const kicker = [cats[0], town].filter(Boolean).map(esc).join(' <span aria-hidden="true">&#10022;</span> ');
  const ogImage = images[0] ? M.imgUrl(images[0], 1200) : '';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(metaTitle)}</title>
  <meta name="description" content="${esc(metaDesc)}" />
  <meta name="robots" content="${indexable ? 'index, follow' : 'noindex, follow'}" />
  <link rel="canonical" href="${canonicalUrl}" />
  <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="shortcut icon" href="/favicon.ico" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <meta property="og:title" content="${esc(metaTitle)}" />
  <meta property="og:description" content="${esc(metaDesc)}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Slow Casa" />
  ${ogImage ? `<meta property="og:image" content="${esc(ogImage)}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c')}</script>
  <link rel="stylesheet" href="/slow-casa.css" />
  <script async defer src="https://www.googletagmanager.com/gtag/js?id=G-B930Z6F96Z"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-B930Z6F96Z');
  </script>
  <style>
    .pl-header { max-width: 720px; margin: 0 auto; padding: 64px 48px 32px; text-align: center; }
    .pl-crumbs { font-size: 14px; letter-spacing: 0.01em; color: #888; margin-bottom: 24px; }
    .pl-crumbs a:hover { color: #0f0f0f; }
    .pl-title { font-family: var(--display); font-weight: 400; font-size: clamp(32px, 4.5vw, 52px); line-height: 1.1; letter-spacing: 0.02em; color: #0f0f0f; }
    .pl-kicker { margin-top: 18px; font-size: 14px; letter-spacing: 0.01em; color: #6f6a60; }
    .pl-body { max-width: 680px; margin: 0 auto; padding: 0 48px 24px; font-size: 18px; font-weight: 300; line-height: 1.7; color: #2a2a28; }
    .pl-body p { margin-bottom: 1.4em; }
    .pl-body a { color: #0f0f0f; border-bottom: 0.5px solid #888; }
    .pl-body a:hover { border-color: #0f0f0f; }
    .pl-image { margin: 0 0 2.4em; }
    .pl-image img { width: 100%; height: auto; max-height: min(80vh, 760px); object-fit: cover; display: block; }
    .pl-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 24px; border-top: 1px solid #e4dfd4; border-bottom: 1px solid #e4dfd4; padding: 24px 0; margin: 0.4em 0 2.4em; }
    .pl-detail-k { font-size: 14px; letter-spacing: 0.01em; color: #888; margin: 0 0 6px !important; }
    .pl-detail-v { font-size: 16px; margin: 0 !important; }
    .pl-homes { margin: 2.4em 0; }
    .pl-homes h2 { font-family: var(--display); font-weight: 400; font-size: 19px; letter-spacing: 0.01em; margin: 0 0 0.9em; color: #0f0f0f; }
    .pl-homes-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 40px 24px; }
    .pl-body .pl-homes a { border-bottom: 0; }
    .pl-homes .house-card-img { margin-bottom: 16px; }
    .pl-cta { margin: 2.4em 0; padding: 40px 36px; background: #F1ECE2; text-align: center; }
    .pl-cta-eyebrow { font-size: 14px; letter-spacing: 0.01em; color: #7a7466; margin: 0 0 0.9em !important; }
    .pl-cta-title { font-family: var(--display); font-size: 24px; letter-spacing: 0.01em; line-height: 1.2; color: #0f0f0f; margin: 0 0 0.5em !important; }
    .pl-cta-text { margin: 0 auto 1.4em; max-width: 34em; }
    .pl-body .pl-cta-btn { display: inline-flex; align-items: center; gap: 12px; padding: 15px 30px; background: #0f0f0f; color: #FFFFFF; border: 1px solid #0f0f0f; font-size: 15px; letter-spacing: 0.01em; transition: background 0.2s, color 0.2s; }
    .pl-cta-btn svg { width: 8px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.5; }
    .pl-body .pl-cta-btn:hover { background: #FFFFFF; color: #0f0f0f; }
    @media (max-width: 768px) {
      .pl-header { padding: 48px 24px 24px; }
      .pl-body { padding: 0 24px 16px; font-size: 17px; }
      .pl-cta { padding: 32px 20px; }
    }
    @media (max-width: 480px) { .pl-homes-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  ${nav()}
  <header class="pl-header">
    ${crumbHtml ? `<p class="pl-crumbs">${crumbHtml}</p>` : ''}
    <h1 class="pl-title">${esc(name)}</h1>
    ${kicker ? `<p class="pl-kicker">${kicker}</p>` : ''}
  </header>
  <article class="pl-body">
    ${images[0] ? placeImg(images[0], name, true) : ''}
    ${paras(text)}
    ${details ? `<div class="pl-details">${details}</div>` : ''}
    ${images[1] ? placeImg(images[1], name, false) : ''}
    ${homesHtml}
    ${carHtml}
  </article>
  ${featuredHtml}
  ${moreHtml}
  ${footer()}
</body>
</html>`);
};
