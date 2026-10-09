const { nav, footer } = require('../lib/nav');
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = 'appndrnWrdlgxRJAG';
const PROPERTIES_TABLE = 'Properties';
const PLACES_TABLE = 'Places';

const PROPERTY_CACHE = new Map();
let ALL_PROPERTIES_CACHE = null;
let ALL_PROPERTIES_CACHED_AT = 0;
let ALL_PLACES_CACHE = null;
let ALL_PLACES_CACHED_AT = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// If an image 404s, hide the broken graphic and let its tile show a sand
// colour instead, so a bad URL never renders as a broken-image icon.
const IMG_ONERROR = "onerror=\"this.onerror=null;this.style.display='none';this.parentElement.classList.add('img-fallback');\"";

function getCached(slug) {
  const entry = PROPERTY_CACHE.get(slug);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    PROPERTY_CACHE.delete(slug);
    return null;
  }
  return entry.data;
}

function setCached(slug, data) {
  if (!data) return;
  PROPERTY_CACHE.set(slug, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function getAllProperties() {
  if (ALL_PROPERTIES_CACHE && (Date.now() - ALL_PROPERTIES_CACHED_AT) < CACHE_TTL_MS) {
    return ALL_PROPERTIES_CACHE;
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
    if (!response.ok) throw new Error('Airtable fetch failed: ' + response.status);
    const data = await response.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset;
    attempts++;
  } while (offset && attempts < 10);
  if (allRecords.length > 0) {
    ALL_PROPERTIES_CACHE = allRecords;
    ALL_PROPERTIES_CACHED_AT = Date.now();
  }
  return allRecords;
}

async function fetchPropertyBySlug(slug) {
  const allProperties = await getAllProperties();
  return allProperties.find(r => r.fields && r.fields.Slug === slug);
}

// Fetch all Places records. Fails soft: never throws, so a problem here
// can never stop a property page from rendering.
async function getAllPlaces() {
  if (ALL_PLACES_CACHE && (Date.now() - ALL_PLACES_CACHED_AT) < CACHE_TTL_MS) {
    return ALL_PLACES_CACHE;
  }
  let allRecords = [];
  let offset = null;
  let attempts = 0;
  try {
    do {
      let url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(PLACES_TABLE)}?pageSize=100`;
      if (offset) url += `&offset=${encodeURIComponent(offset)}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) return ALL_PLACES_CACHE || [];
      const data = await response.json();
      allRecords = allRecords.concat(data.records || []);
      offset = data.offset;
      attempts++;
    } while (offset && attempts < 10);
  } catch (e) {
    return ALL_PLACES_CACHE || [];
  }
  if (allRecords.length > 0) {
    ALL_PLACES_CACHE = allRecords;
    ALL_PLACES_CACHED_AT = Date.now();
  }
  return allRecords;
}

// Pull the image URL for a Place. Prefers a hosted URL stored as text
// (stable, like the property Hero Image). Also tolerates an Airtable
// attachment, but note those URLs expire, so a text URL is recommended.
function getPlaceImageUrl(place) {
  const f = (place && place.fields) || {};
  const img = f['Image'];
  if (!img) return '';
  if (typeof img === 'string') return img.trim();
  if (Array.isArray(img) && img.length) {
    const a = img[0] || {};
    if (a.thumbnails && a.thumbnails.large) return a.thumbnails.large.url;
    return a.url || '';
  }
  return '';
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Responsive image URL helper - injects sensible width into Cloudinary URLs
function responsiveImageUrl(url, width) {
  if (!url) return url;
  if (url.indexOf('res.cloudinary.com') >= 0) {
    try {
      const parts = url.split('/upload/');
      if (parts.length !== 2) return url;
      const rest = parts[1];
      const versionIdx = rest.search(/\/v\d+\//);
      let trail;
      if (versionIdx >= 0) {
        trail = rest.substring(versionIdx);
      } else {
        // No version number in the stored URL. Drop any size or crop settings
        // already in it (e.g. w_1400/), or they override the width asked for here.
        const segs = rest.split('/');
        const isTransform = s => s.split(',').every(p => /^(c|w|h|g|q|f|ar|dpr|e|fl|x|y|z|r|o|b|t|a)_[^,]+$/.test(p));
        while (segs.length > 1 && isTransform(segs[0])) segs.shift();
        trail = '/' + segs.join('/');
      }
      return parts[0] + '/upload/c_fill,w_' + width + ',g_auto,q_auto,f_auto' + trail;
    } catch (e) { return url; }
  }
  if (url.indexOf('cdn.sanity.io') >= 0) {
    const separator = url.indexOf('?') >= 0 ? '&' : '?';
    return url + separator + 'w=' + width + '&auto=format&fit=max&q=80';
  }
  return url;
}

// Only treat absolute http(s) links as real images. This filters out blank
// or malformed lines in the Gallery Images field, which is what was rendering
// an empty grey cell in the gallery.
function isValidImageUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u.trim());
}

function getImageUrl(record, index) {
  index = index || 0;
  const f = record.fields || {};
  const heroImg = f['Hero Image'];
  const galleryStr = f['Gallery Images'];
  const galleryUrls = galleryStr ? galleryStr.split('\n').map(s => s.trim()).filter(isValidImageUrl) : [];
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

function getAllImageUrls(record) {
  const f = record.fields || {};
  const heroImg = f['Hero Image'];
  const galleryStr = f['Gallery Images'];
  const galleryUrls = galleryStr ? galleryStr.split('\n').map(s => s.trim()).filter(isValidImageUrl) : [];
  const combined = [];
  if (heroImg) combined.push(heroImg);
  for (const u of galleryUrls) combined.push(u);
  if (combined.length > 0) return combined;
  const images = f['Images'] || [];
  return images.map(img => {
    if (img.thumbnails && img.thumbnails.full) return img.thumbnails.full.url;
    return img.url;
  });
}

// --- Geo helpers for the "Nearby houses" ranking ---
function toRad(deg) { return (deg * Math.PI) / 180; }
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function getCoords(record) {
  const f = (record && record.fields) || {};
  const lat = parseFloat(f['Latitude']);
  const lon = parseFloat(f['Longitude']);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  return null;
}

module.exports = async function handler(req, res) {
  const { slug } = req.query;
  if (!slug) return res.status(400).send('Missing slug');

  let record = getCached(slug);

  if (!record) {
    try {
      record = await fetchPropertyBySlug(slug);
    } catch (e) {
      return res.status(500).send('Error fetching property');
    }
    if (!record) return res.status(404).send('Property not found');
    setCached(slug, record);
  }

  // Old /properties/:slug URLs 301 to the island path for Balearic houses.
  // Driven by the Island field, so it stays correct as houses are added.
  if (req.query && req.query.legacy && record.fields && record.fields['Island']) {
    const island = String(record.fields['Island']).trim().toLowerCase();
    const slugVal2 = record.fields['Slug'];
    if (['mallorca','ibiza','menorca','formentera'].indexOf(island) !== -1 && slugVal2) {
      res.statusCode = 301;
      res.setHeader('Location', '/' + island + '/houses/' + slugVal2);
      return res.end();
    }
  }


  const f = record.fields;
  const name = f['Name'] || '';
  const slugVal = f['Slug'] || slug;
  const location = f['Location label'] || '';
  const country = 'ES';
  const region = f['Island'] || '';
  const town = f['Town'] || '';
  const latitude = f['Latitude'];
  const longitude = f['Longitude'];
  const description = f['Description'] || '';
  const editorialTitle = f['Editorial Title'] || '';
  const sleeps = f['Sleeps'] || '';
  const bookingUrl = f['Booking URL'] || '';
  const ownerName = String(f['Owner name'] || '').trim();

  // Text sections. Intro and Location text read their new names first and fall
  // back to the old ones, so the Airtable renames can happen after this deploys.
  const introText    = f['Intro'] || f['Intro Two'] || '';
  const locationText = f['Location text'] || f['Intro One'] || '';
  const livingText   = f['Living text'] || '';
  const bedroomsText = f['Bedrooms text'] || '';
  const outdoorText  = f['Outdoor text'] || '';

  // Key facts
  const bedrooms  = f['Bedrooms'];
  const bathrooms = f['Bathrooms'];
  const houseType = f['Type'] || '';
  const features  = Array.isArray(f['Features'])
    ? f['Features']
    : String(f['Features'] || '').split(',').map(s => s.trim()).filter(Boolean);

  // Images. One Cloudinary URL per line in each field.
  const urlLines = (v) => String(v || '').split('\n').map(s => s.trim()).filter(isValidImageUrl);
  const heroImage   = getImageUrl(record, 0);
  const overviewSet = urlLines(f['Overview images']);
  const livingSet   = urlLines(f['Living images']);
  const bedroomsSet = urlLines(f['Bedrooms images']);
  const outdoorSet  = urlLines(f['Outdoor images']);
  const hasSections = overviewSet.length || livingSet.length || bedroomsSet.length || outdoorSet.length;
  // Houses not yet moved to the new image fields lay out Gallery Images as the overview.
  const legacySet   = getAllImageUrls(record).slice(1);
  const overviewImgs = hasSections ? overviewSet : legacySet;

  const allImgs = [];
  [heroImage].concat(overviewImgs, livingSet, bedroomsSet, outdoorSet).forEach(u => {
    if (u && allImgs.indexOf(u) === -1) allImgs.push(u);
  });

  const img = (src, w, cls, eager) =>
    `<img${cls ? ` class="${cls}"` : ''} src="${escapeHtml(responsiveImageUrl(src, w))}" alt="${escapeHtml(name)}" ${eager ? 'fetchpriority="high" loading="eager"' : 'loading="lazy"'} ${IMG_ONERROR} />`;

  const paras = (txt) => String(txt || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p>${escapeHtml(p)}</p>`).join('');

  // ---- Neighbourhood recs: linked Places ----
  let places = [];
  try {
    const allPlaces = await getAllPlaces();
    places = allPlaces.filter(p => {
      const pf = p.fields || {};
      const linked = pf['Properties'];
      const isLinked = Array.isArray(linked) && linked.indexOf(record.id) !== -1;
      const status = String(pf['Status'] || '').toLowerCase();
      return isLinked && status !== 'draft' && pf['Name'];
    });
  } catch (e) { places = []; }

  const catOrder = ['Eat', 'Drink', 'Stay', 'Swim', 'Play', 'See', 'Do'];
  places.sort((a, b) => {
    const ra = catOrder.indexOf(a.fields.Category || ''); const rb = catOrder.indexOf(b.fields.Category || '');
    return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
  });

  const recsHtml = places.length ? `
  <section class="pp-section pp-recs">
    <div class="pp-recs-head">
      <h2 class="pp-h2">Neighbourhood Recs</h2>
      ${ownerName ? `<p class="pp-recs-from">From ${escapeHtml(ownerName)}</p>` : ''}
    </div>
    <div class="pp-recs-grid">
      ${places.map(p => {
        const pf = p.fields || {};
        const pName = pf['Name'] || '';
        const sub = [pf['Category'], pf['Area']].filter(Boolean).map(escapeHtml).join(' <span class="pp-dot">&bull;</span> ');
        const raw = String(pf['Link'] || '').trim();
        const link = /^https?:\/\//i.test(raw) ? raw : '';
        const pimg = getPlaceImageUrl(p);
        const inner = `
          <div class="pp-rec-img">${pimg ? `<img src="${escapeHtml(responsiveImageUrl(pimg, 900))}" alt="${escapeHtml(pName)}" loading="lazy" ${IMG_ONERROR} />` : ''}</div>
          <h3 class="pp-rec-name">${escapeHtml(pName)}</h3>
          ${sub ? `<p class="pp-rec-sub">${sub}</p>` : ''}`;
        return link
          ? `<a class="pp-rec" href="${escapeHtml(link)}" target="_blank" rel="noopener">${inner}</a>`
          : `<div class="pp-rec">${inner}</div>`;
      }).join('')}
    </div>
  </section>` : '';

  // ---- Key facts ----
  const facts = [
    sleeps ? ['Max guests', sleeps] : null,
    (bedrooms !== undefined && bedrooms !== null && bedrooms !== '') ? ['Bedrooms', bedrooms] : null,
    (bathrooms !== undefined && bathrooms !== null && bathrooms !== '') ? ['Bathrooms', bathrooms] : null,
    houseType ? ['Type', houseType] : null
  ].filter(Boolean);
  const factsHtml = facts.length ? `
  <div class="pp-facts" style="--cols:${facts.length}">
    ${facts.map(([k, v]) => `<div class="pp-fact"><p class="pp-fact-k">${escapeHtml(k)}</p><p class="pp-fact-v">${escapeHtml(String(v))}</p></div>`).join('')}
  </div>` : '';

  const featuresHtml = features.length ? `
  <div class="pp-features">
    ${features.map(t => `<div class="pp-feature">${escapeHtml(t)}</div>`).join('')}
  </div>` : '';

  // ---- Overview mosaic: rows of three, alternating wide/narrow ----
  let overviewHtml = '';
  if (overviewImgs.length) {
    const rows = [];
    for (let i = 0; i < overviewImgs.length; i += 3) rows.push(overviewImgs.slice(i, i + 3));
    overviewHtml = `
  <section class="pp-section pp-overview">
    <h2 class="pp-h2">Overview</h2>
    ${rows.map((row, r) => `<div class="pp-mosaic pp-mosaic-${row.length}${r % 2 ? ' pp-mosaic-flip' : ''}">${row.map(s => `<figure>${img(s, 1100)}</figure>`).join('')}</div>`).join('')}
  </section>`;
  }

  // ---- Story sections: heading left, paragraph right, images below ----
  const imagesBelow = (set) => {
    if (!set.length) return '';
    const first = `<figure class="pp-wide">${img(set[0], 1800)}</figure>`;
    let pairs = '';
    const rest = set.slice(1);
    for (let i = 0; i < rest.length; i += 2) {
      const pair = rest.slice(i, i + 2);
      pairs += `<div class="pp-pair pp-pair-${pair.length}">${pair.map(s => `<figure>${img(s, 1400)}</figure>`).join('')}</div>`;
    }
    return first + pairs;
  };
  const pairsOnly = (set) => {
    let out = '';
    for (let i = 0; i < set.length; i += 2) {
      const pair = set.slice(i, i + 2);
      out += `<div class="pp-pair pp-pair-${pair.length}">${pair.map(s => `<figure>${img(s, 1400)}</figure>`).join('')}</div>`;
    }
    return out;
  };
  const story = (heading, text, imagesHtml, cls) => (text || imagesHtml) ? `
  <section class="pp-section pp-story ${cls || ''}">
    <div class="pp-split">
      <h2 class="pp-h2">${heading}</h2>
      <div class="pp-prose">${paras(text)}</div>
    </div>
    ${imagesHtml}
  </section>` : '';

  const livingHtml   = story('Living Spaces', livingText, imagesBelow(livingSet));
  const bedroomsHtml = story('Bedrooms &amp; Bathrooms', bedroomsText, pairsOnly(bedroomsSet));

  // The environment: big image right, paragraph tucked bottom left, as on the reference
  let outdoorHtml = '';
  if (outdoorText || outdoorSet.length) {
    const lead = outdoorSet[0];
    outdoorHtml = `
  <section class="pp-section pp-env">
    <h2 class="pp-h2">The Environment</h2>
    <div class="pp-env-grid${lead ? '' : ' pp-env-noimg'}">
      <div class="pp-prose pp-env-text">${paras(outdoorText)}</div>
      ${lead ? `<figure class="pp-env-img">${img(lead, 1800)}</figure>` : ''}
    </div>
    ${pairsOnly(outdoorSet.slice(1))}
  </section>`;
  }

  const viewAllHtml = allImgs.length > 1 ? `
  <div class="pp-viewall-wrap"><button class="pp-btn" type="button" id="pp-viewall">View all images</button></div>
  <div class="pp-lightbox" id="pp-lightbox" hidden>
    <button class="pp-lightbox-close" type="button" id="pp-lightbox-close" aria-label="Close">&times;</button>
    <div class="pp-lightbox-inner">
      ${allImgs.map(s => `<figure>${img(s, 1800)}</figure>`).join('')}
    </div>
  </div>` : '';

  const coords = getCoords(record);
  const locationHtml = (coords || locationText) ? `
  <section class="pp-section pp-location">
    <h2 class="pp-h2">The Location</h2>
    <div class="pp-loc-grid${coords ? '' : ' pp-loc-nomap'}">
      ${coords ? `<div class="pp-map" id="pp-map"></div>` : ''}
      <div class="pp-prose pp-loc-text">${paras(locationText)}</div>
    </div>
  </section>` : '';

  const mapData = coords
    ? JSON.stringify({ lat: coords.lat, lon: coords.lon }).replace(/</g, '\\u003c')
    : 'null';

  // SEO
  const title = `${name}${location ? ' — ' + location : ''} | Slow Casa`;
  const metaDescBase = description ? description.replace(/\n/g, ' ') : `${name} on Slow Casa, a curated collection of houses to rent in Mallorca, Ibiza and Menorca.`;
  const metaDesc = metaDescBase.length > 155 ? metaDescBase.substring(0, 152) + '...' : metaDescBase;
  const canonIsland = String((f['Island'] || '')).trim().toLowerCase();
  const canonicalUrl = ['mallorca','ibiza','menorca','formentera'].indexOf(canonIsland) !== -1
    ? `https://slowcasa.com/${canonIsland}/houses/${slugVal}`
    : `https://slowcasa.com/properties/${slugVal}`;
  const ogImage = heroImage || '';

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    "name": name,
    "description": description,
    "url": canonicalUrl
  };
  if (ogImage) structuredData.image = ogImage;
  if (latitude && longitude) {
    structuredData.geo = { "@type": "GeoCoordinates", "latitude": latitude, "longitude": longitude };
  }
  if (town || region || country) {
    structuredData.address = { "@type": "PostalAddress" };
    if (town) structuredData.address.addressLocality = town;
    if (region) structuredData.address.addressRegion = region;
    if (country) structuredData.address.addressCountry = country;
  }
  if (sleeps) {
    const sleepsNum = parseInt(sleeps);
    if (!isNaN(sleepsNum)) structuredData.maximumAttendeeCapacity = sleepsNum;
  }

  const crumbIsland = String((f['Island'] || '')).trim();
  const crumbItems = [
    { "@type": "ListItem", "position": 1, "name": "Slow Casa", "item": "https://slowcasa.com" },
    { "@type": "ListItem", "position": 2, "name": "Houses", "item": "https://slowcasa.com/houses" }
  ];
  if (crumbIsland) {
    crumbItems.push({ "@type": "ListItem", "position": 3, "name": crumbIsland, "item": "https://slowcasa.com/" + crumbIsland.toLowerCase() });
  }
  crumbItems.push({ "@type": "ListItem", "position": crumbItems.length + 1, "name": name, "item": canonicalUrl });
  const breadcrumb = { "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": crumbItems };

  const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
  const jsonLdScript = `<script type="application/ld+json">${safeJson(structuredData)}</script>
  <script type="application/ld+json">${safeJson(breadcrumb)}</script>`;

  const nearbyHtml = await renderNearbyHouses(record);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="shortcut icon" href="/favicon.ico" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <meta name="apple-mobile-web-app-title" content="Slow Casa" />
  <link rel="manifest" href="/site.webmanifest" />
  <meta name="description" content="${escapeHtml(metaDesc)}" />
  <link rel="canonical" href="${canonicalUrl}" />
  ${f['Island'] ? '' : '<meta name="robots" content="noindex, follow" />'}
  ${jsonLdScript}
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(metaDesc)}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Slow Casa" />
  ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(metaDesc)}" />
  ${ogImage ? `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />` : ''}
  <link rel="preload" as="font" type="font/woff2" href="/fonts/dm-serif-display-v17-latin-regular.woff2" crossorigin />
  <link rel="preload" as="font" type="font/woff2" href="/fonts/dm-sans-v17-latin-regular.woff2" crossorigin />
  <link rel="stylesheet" href="/slow-casa.css" />
  <script async src="https://plausible.io/js/pa-aahRJ1iMPfiu0NJteNWEg.js"></script>
  <script>
    window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
    plausible.init()
  </script>
  <script async defer src="https://www.googletagmanager.com/gtag/js?id=G-B930Z6F96Z"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-B930Z6F96Z');
  </script>
  <style>
    @font-face { font-family: 'DM Sans'; src: url('/fonts/dm-sans-v17-latin-300.woff2') format('woff2'); font-weight: 300; font-style: normal; font-display: swap; }
    @font-face { font-family: 'DM Sans'; src: url('/fonts/dm-sans-v17-latin-300italic.woff2') format('woff2'); font-weight: 300; font-style: italic; font-display: swap; }

    body { background: #FDFCF8; }
    /* Every block uses the nav's side gutter (48px, 16px on phones) so all edges line up. */
    .pp { padding: 0 48px; }
    .pp figure, .pp-hero-wrap figure { margin: 0; overflow: hidden; background: var(--grey-4); }
    .pp figure img, .pp-hero-wrap figure img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .img-fallback { background: var(--grey-4); }

    /* Hero */
    /* Hero runs edge to edge with the same side gutter as the nav,
       so its left edge lines up with the wordmark at every width. */
    .pp-hero-wrap { padding: 0 48px; }
    .pp-hero { aspect-ratio: 16 / 8.5; max-height: 86vh; width: 100%; }

    /* Title row */
    .pp-titlebar { display: flex; justify-content: space-between; align-items: flex-start; gap: 32px; padding: 64px 0 88px; }
    .pp-name { font-family: var(--sans); font-weight: 400; font-size: 28px; letter-spacing: 0.04em; text-transform: uppercase; margin: 0 0 6px; line-height: 1.15; }
    .pp-where { font-size: 15px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--grey-1); margin: 0; }
    .pp-editorial { font-family: var(--serif); font-size: 21px; line-height: 1.35; margin: 22px 0 0; max-width: 32ch; }
    .pp-actions { display: flex; align-items: center; gap: 28px; flex-shrink: 0; }
    .pp-share { background: none; border: 0; padding: 0; cursor: pointer; font-family: var(--sans); font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--black); }
    .pp-btn {
      display: inline-block; border: 1px solid var(--black); background: transparent; color: var(--black);
      padding: 17px 34px; font-family: var(--sans); font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
      cursor: pointer; transition: background 0.2s, color 0.2s;
    }
    .pp-btn:hover { background: var(--black); color: #fff; }

    /* Key facts + features, full-bleed rules */
    .pp-band { border-top: 1px solid var(--grey-3); }
    .pp-facts { display: grid; grid-template-columns: repeat(var(--cols), 1fr); padding: 0 48px; }
    .pp-fact { text-align: center; padding: 30px 12px; }
    .pp-fact-k { font-size: 11.5px; letter-spacing: 0.12em; text-transform: uppercase; margin: 0 0 14px; }
    .pp-fact-v { font-size: 22px; margin: 0; }
    .pp-features-band { border-top: 1px solid var(--grey-3); border-bottom: 1px solid var(--grey-3); }
    .pp-features { display: grid; grid-template-columns: repeat(4, 1fr); gap: 26px; padding: 26px 48px; }
    .pp-feature { border: 1px solid var(--grey-3); padding: 22px 12px; text-align: center; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; }

    /* Shared section rhythm */
    .pp-section { padding-top: 150px; }
    .pp-h2 { font-family: var(--serif); font-weight: 400; font-size: clamp(32px, 3.6vw, 52px); line-height: 1.05; margin: 0; text-transform: uppercase; letter-spacing: 0.01em; }
    .pp-prose p { font-size: 17px; line-height: 1.75; margin: 0 0 16px; text-indent: 3.5em; }
    .pp-prose p:last-child { margin-bottom: 0; }

    /* Intro: right column only */
    .pp-intro { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; padding-top: 170px; }
    .pp-intro .pp-prose { grid-column: 2; }

    /* Overview mosaic */
    .pp-overview .pp-h2 { margin-bottom: 72px; }
    .pp-mosaic { display: grid; gap: 18px; margin-bottom: 18px; }
    .pp-mosaic figure { height: clamp(220px, 26vw, 470px); }
    .pp-mosaic-3 { grid-template-columns: 3fr 3fr 2fr; }
    .pp-mosaic-3.pp-mosaic-flip { grid-template-columns: 2fr 3fr 3fr; }
    .pp-mosaic-2 { grid-template-columns: 1fr 1fr; }
    .pp-mosaic-1 { grid-template-columns: 1fr; }

    /* Story sections */
    .pp-split { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: start; margin-bottom: 120px; }
    .pp-wide { margin-left: 26% !important; aspect-ratio: 16 / 10; margin-bottom: 18px !important; }
    .pp-pair { display: grid; gap: 70px; margin-bottom: 18px; }
    .pp-pair-2 { grid-template-columns: 1fr 1fr; }
    .pp-pair-1 { grid-template-columns: 1fr; }
    .pp-pair figure { aspect-ratio: 4 / 4.6; }
    .pp-pair-1 figure { aspect-ratio: 16 / 9; }

    /* The environment */
    .pp-env .pp-h2 { margin-bottom: 64px; }
    .pp-env-grid { display: grid; grid-template-columns: 1fr 2.65fr; gap: 56px; align-items: end; margin-bottom: 18px; }
    .pp-env-grid.pp-env-noimg { grid-template-columns: 1fr 1fr; }
    .pp-env-noimg .pp-env-text { grid-column: 2; }
    .pp-env-img { aspect-ratio: 16 / 10; }
    .pp-env-text p { font-size: 16px; }

    /* View all */
    .pp-viewall-wrap { text-align: center; padding-top: 110px; }
    .pp-lightbox { position: fixed; inset: 0; background: #FDFCF8; z-index: 100; overflow-y: auto; }
    .pp-lightbox[hidden] { display: none; }
    .pp-lightbox-inner { max-width: 1100px; margin: 0 auto; padding: 80px 24px; display: grid; gap: 20px; }
    .pp-lightbox-inner figure { margin: 0; }
    .pp-lightbox-inner img { width: 100%; height: auto; display: block; }
    .pp-lightbox-close { position: fixed; top: 18px; right: 26px; background: #FDFCF8; border: 0; font-size: 40px; line-height: 1; cursor: pointer; z-index: 101; }

    /* Location */
    .pp-location .pp-h2 { margin-bottom: 72px; }
    .pp-loc-grid { display: grid; grid-template-columns: 2.6fr 1fr; gap: 56px; align-items: end; }
    .pp-loc-grid.pp-loc-nomap { grid-template-columns: 1fr 1fr; }
    .pp-loc-nomap .pp-loc-text { grid-column: 2; }
    .pp-map { aspect-ratio: 16 / 11; background: var(--grey-4); border: 1px solid var(--grey-3); }
    .pp-loc-text p { font-size: 16px; text-indent: 0; text-align: center; }
    .pp-marker { width: 22px; height: 22px; background: var(--black); transform: rotate(45deg); border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.25); }

    /* Neighbourhood recs */
    .pp-recs-head { margin-bottom: 72px; }
    .pp-recs-from { font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--grey-1); margin: 14px 0 0; }
    .pp-recs-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 72px; }
    .pp-rec { display: block; color: inherit; }
    .pp-rec-img { aspect-ratio: 1 / 1; overflow: hidden; background: var(--grey-4); margin-bottom: 26px; }
    .pp-rec-img img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.5s ease; }
    a.pp-rec:hover .pp-rec-img img { transform: scale(1.03); }
    .pp-rec-name { font-family: var(--sans); font-weight: 400; font-size: 22px; letter-spacing: 0.05em; text-transform: uppercase; margin: 0 0 10px; }
    .pp-rec-sub { font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--grey-1); margin: 0; }
    .pp-dot { margin: 0 8px; font-size: 10px; }

    /* Nearby houses */
    .prop-other { padding: 150px 48px 0; }
    .prop-other-header { margin-bottom: 56px; }
    .prop-other-title { font-family: var(--serif); font-weight: 400; font-size: clamp(28px, 3vw, 40px); text-transform: uppercase; margin: 0; }
    .prop-other-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 48px 32px; }
    .prop-other-grid > a { display: block; color: inherit; }
    .prop-other-grid > a:hover .card-img img { transform: scale(1.03); }
    footer { margin-top: 140px; }

    @media (max-width: 900px) {
      .pp-titlebar { flex-direction: column; padding: 40px 0 56px; }
      .pp-facts { grid-template-columns: repeat(2, 1fr); }
      .pp-features { grid-template-columns: repeat(2, 1fr); gap: 14px; }
      .pp-section, .pp-intro { padding-top: 90px; }
      .pp-intro, .pp-split { grid-template-columns: 1fr; gap: 28px; }
      .pp-intro .pp-prose { grid-column: 1; }
      .pp-split { margin-bottom: 48px; }
      .pp-wide { margin-left: 0 !important; }
      .pp-mosaic-3, .pp-mosaic-3.pp-mosaic-flip { grid-template-columns: 1fr 1fr; }
      .pp-mosaic-3 figure:first-child { grid-column: 1 / -1; }
      .pp-pair { gap: 18px; }
      .pp-env-grid, .pp-loc-grid { grid-template-columns: 1fr; gap: 28px; }
      .pp-env-noimg .pp-env-text, .pp-loc-nomap .pp-loc-text { grid-column: 1; }
      .pp-env-text { order: 2; }
      .pp-loc-text p { text-align: left; }
      .pp-recs-grid { grid-template-columns: 1fr 1fr; gap: 32px; }
      .prop-other { padding-top: 90px; }
      .prop-other-grid { grid-template-columns: 1fr 1fr; gap: 32px 20px; }
      .pp-overview .pp-h2, .pp-env .pp-h2, .pp-location .pp-h2, .pp-recs-head { margin-bottom: 36px; }
    }
    @media (max-width: 560px) {
      .pp-hero { aspect-ratio: 4 / 5; max-height: none; }
      .pp-name { font-size: 23px; }
      .pp-fact-v { font-size: 19px; }
      .pp-features { grid-template-columns: 1fr; }
      .pp-mosaic-3, .pp-mosaic-3.pp-mosaic-flip, .pp-mosaic-2, .pp-pair-2 { grid-template-columns: 1fr; }
      .pp-recs-grid, .prop-other-grid { grid-template-columns: 1fr; }
      .pp-prose p { text-indent: 2em; }
    }
      /* Phone gutters: must stay last so they win over the base rules. */
    @media (max-width: 768px) {
      .pp-hero-wrap, .pp, .pp-facts { padding-left: 16px; padding-right: 16px; }
      .pp-features { padding: 20px 16px; }
      .prop-other { padding-left: 16px; padding-right: 16px; }
    }
  </style>
</head>
<body>

  ${nav()}

  <main>
    ${heroImage ? `<div class="pp-hero-wrap"><figure class="pp-hero">${img(heroImage, 2400, '', true)}</figure></div>` : ''}
    <div class="pp">

      <div class="pp-titlebar">
        <div>
          <h1 class="pp-name">${escapeHtml(name)}</h1>
          ${location ? `<p class="pp-where">${escapeHtml(location)}</p>` : ''}
          ${editorialTitle ? `<p class="pp-editorial">${escapeHtml(editorialTitle)}</p>` : ''}
        </div>
        <div class="pp-actions">
          <button class="pp-share" type="button" id="pp-share">Share</button>
          ${bookingUrl ? `<a class="pp-btn" href="/go/${encodeURIComponent(slugVal)}" target="_blank" rel="noopener">Book</a>` : ''}
        </div>
      </div>
    </div>

    ${factsHtml ? `<div class="pp-band">${factsHtml}</div>` : ''}
    ${featuresHtml ? `<div class="pp-features-band">${featuresHtml}</div>` : (factsHtml ? '<div class="pp-band"></div>' : '')}

    <div class="pp">
      ${introText ? `<section class="pp-intro"><div class="pp-prose">${paras(introText)}</div></section>` : ''}
      ${overviewHtml}
      ${livingHtml}
      ${bedroomsHtml}
      ${outdoorHtml}
      ${viewAllHtml}
      ${locationHtml}
      ${recsHtml}
    </div>
  </main>

  ${nearbyHtml}

${footer()}

  <script>
  (function () {
    // Share: native sheet on phones, copy link elsewhere
    var share = document.getElementById('pp-share');
    if (share) share.addEventListener('click', function () {
      var url = window.location.href;
      if (navigator.share) { navigator.share({ title: document.title, url: url }).catch(function () {}); return; }
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          share.textContent = 'Link copied';
          setTimeout(function () { share.textContent = 'Share'; }, 2000);
        });
      }
    });

    // View all images
    var open = document.getElementById('pp-viewall');
    var box = document.getElementById('pp-lightbox');
    var close = document.getElementById('pp-lightbox-close');
    function shut() { box.hidden = true; document.body.style.overflow = ''; }
    if (open && box) {
      open.addEventListener('click', function () { box.hidden = false; document.body.style.overflow = 'hidden'; });
      close.addEventListener('click', shut);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) shut(); });
    }

    // Location map, loaded only when it scrolls near the viewport
    var HOUSE = ${mapData};
    var el = document.getElementById('pp-map');
    if (!HOUSE || !el) return;
    var TOKEN = 'pk.eyJ1IjoibHVrZXJ5YSIsImEiOiJjbG96cmZ3OTMwMHRyMmlzNHc1bTZkZzI4In0.8Pmo8eeUh48QHBpzqHwNuQ';
    var STYLE = 'mapbox://styles/lukerya/cmoime20s006m01r68jvia13j';
    var started = false;
    function start() {
      if (started) return; started = true;
      var css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css';
      document.head.appendChild(css);
      var s = document.createElement('script');
      s.src = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js';
      s.onload = function () {
        try {
          mapboxgl.accessToken = TOKEN;
          var map = new mapboxgl.Map({ container: 'pp-map', style: STYLE, center: [HOUSE.lon, HOUSE.lat], zoom: 8.6, attributionControl: true, cooperativeGestures: true });
          map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
          var m = document.createElement('div'); m.className = 'pp-marker';
          new mapboxgl.Marker({ element: m }).setLngLat([HOUSE.lon, HOUSE.lat]).addTo(map);
        } catch (e) { console.error('map error', e); }
      };
      document.head.appendChild(s);
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { start(); io.disconnect(); }
      }, { rootMargin: '400px' });
      io.observe(el);
    } else { start(); }
  })();
  </script>
</body>
</html>`;

  res.status(200).send(html);
};

async function renderNearbyHouses(currentRecord) {
  try {
    const all = await getAllProperties();
    const currentId = currentRecord.id;

    const hasImage = (r) => {
      const rf = r.fields || {};
      if (!rf['Name']) return false;
      return !!rf['Hero Image'] || !!rf['Gallery Images'] || (rf['Images'] && rf['Images'].length > 0);
    };

    // Only suggest houses on the same island group. If the current property has
    // no Island value, fall back to everything so older records still work.
    const thisIsland = (currentRecord.fields || {})['Island'];
    const candidates = all.filter(r => {
      if (r.id === currentId || !hasImage(r)) return false;
      if (!thisIsland) return true;
      return !!(r.fields && r.fields['Island']);
    });
    if (candidates.length === 0) return '';

    const byRecency = (a, b) => {
      const da = a.fields['Date added'] ? new Date(a.fields['Date added']) : new Date(0);
      const db = b.fields['Date added'] ? new Date(b.fields['Date added']) : new Date(0);
      return db - da;
    };

    // Rank by great-circle distance from this house. Houses missing
    // coordinates drop to the back (most recent first), and if this house
    // has no coordinates at all we fall back to recency entirely, so the
    // section always fills.
    const origin = getCoords(currentRecord);
    let ordered;
    if (origin) {
      const withDist = [];
      const withoutDist = [];
      candidates.forEach(r => {
        const c = getCoords(r);
        if (c) withDist.push({ r, dist: haversineKm(origin.lat, origin.lon, c.lat, c.lon) });
        else withoutDist.push(r);
      });
      withDist.sort((a, b) => a.dist - b.dist);
      withoutDist.sort(byRecency);
      ordered = withDist.map(x => x.r).concat(withoutDist);
    } else {
      ordered = candidates.slice().sort(byRecency);
    }

    const nearest = ordered.slice(0, 3);
    if (nearest.length === 0) return '';

    const cardsHtml = nearest.map(r => {
      const rf = r.fields;
      const img = getImageUrl(r, 0) || '';
      const slug = rf['Slug'] || '';
      const isl = String((rf['Island'] || '')).trim().toLowerCase();
      const url = ['mallorca','ibiza','menorca','formentera'].indexOf(isl) !== -1
        ? '/' + isl + '/houses/' + slug
        : '/properties/' + slug;
      return '<a class="prop-other-card" href="' + escapeHtml(url) + '">' +
            '<div class="card-img">' + (img ? '<img src="' + escapeHtml(responsiveImageUrl(img, 900)) + '" alt="' + escapeHtml(rf['Name']||'') + '" loading="lazy" ' + IMG_ONERROR + ' />' : '') + '</div>' +
            '<p class="card-location">' + escapeHtml(rf['Location label']||'') + '</p>' +
            '<p class="card-name">' + escapeHtml(rf['Name']||'') + '</p>' +
            '</a>';
    }).join('');

    return `
    <section class="prop-other">
      <div class="prop-other-header">
        <h2 class="prop-other-title">Nearby houses</h2>
      </div>
      <div class="prop-other-grid">
        ${cardsHtml}
      </div>
    </section>`;
  } catch (e) {
    return '';
  }
}
