const { nav, footer } = require('../lib/nav');
const { balearicIsland, gone } = require('../lib/scope');
const { houseCard, placeOf } = require('../lib/card');
const { icon } = require('../lib/icons');
const { placeCategories, placeIslandName, placeLink, placeImages, placeSlug, islandOf } = require('../lib/magazine');
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
  return placeImages((place && place.fields) || {})[0] || '';
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

  // Balearic houses only. A house outside the islands is gone (410), whichever
  // URL it is asked for on. A Balearic house has one URL, /{island}/houses/{slug}:
  // the old /properties/ path and the wrong island both 301 there.
  const houseIsland = balearicIsland(record.fields && record.fields['Island']);
  if (!houseIsland) return gone(res, 'house');
  {
    const slugVal2 = String(record.fields['Slug'] || slug).trim();
    const asked = String((req.query && req.query.island) || '').trim().toLowerCase();
    if ((req.query && req.query.legacy) || asked !== houseIsland) {
      res.statusCode = 301;
      res.setHeader('Location', '/' + houseIsland + '/houses/' + slugVal2);
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
    const ra = catOrder.indexOf(placeCategories(a.fields)[0] || ''); const rb = catOrder.indexOf(placeCategories(b.fields)[0] || '');
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
        const sub = [placeCategories(pf)[0], String(pf['Town'] || '').trim() || placeIslandName(pf)].filter(Boolean).map(escapeHtml).join(' <span class="pp-dot">&bull;</span> ');
        // Each rec opens its place page on Slow Casa (island from the place, else this house).
        const pIsland = islandOf(placeIslandName(pf)) || islandOf(region);
        const link = pIsland && placeSlug(pf) ? '/' + pIsland + '/places/' + placeSlug(pf) : '';
        const pimg = getPlaceImageUrl(p);
        const inner = `
          <div class="pp-rec-img">${pimg ? `<img src="${escapeHtml(responsiveImageUrl(pimg, 900))}" alt="${escapeHtml(pName)}" loading="lazy" ${IMG_ONERROR} />` : ''}</div>
          <h3 class="pp-rec-name"><span>${escapeHtml(pName)}</span></h3>
          ${sub ? `<p class="pp-rec-sub">${sub}</p>` : ''}`;
        return link
          ? `<a class="pp-rec" href="${escapeHtml(link)}">${inner}</a>`
          : `<div class="pp-rec">${inner}</div>`;
      }).join('')}
    </div>
  </section>` : '';

  // ---- Key facts ----
  const facts = [
    sleeps ? ['guests', sleeps + ' guests'] : null,
    (bedrooms !== undefined && bedrooms !== null && bedrooms !== '') ? ['bedrooms', bedrooms + (Number(bedrooms) === 1 ? ' bedroom' : ' bedrooms')] : null,
    (bathrooms !== undefined && bathrooms !== null && bathrooms !== '') ? ['bathrooms', bathrooms + (Number(bathrooms) === 1 ? ' bathroom' : ' bathrooms')] : null,
    houseType ? ['type', houseType] : null
  ].filter(Boolean);
  const factsHtml = facts.length ? `
  <ul class="pp-facts">
    ${facts.map(([k, v]) => `<li>${icon(k, 22)}<span>${escapeHtml(String(v))}</span></li>`).join('')}
  </ul>` : '';

  const featuresHtml = features.length ? `
  <ul class="pp-features">
    ${features.map(t => `<li>${icon(t, 26)}<span>${escapeHtml(t)}</span></li>`).join('')}
  </ul>` : '';

  // ---- Gallery: one big photo and four small, Boutique Homes style ----
  // Uses every image on the record in order, so no sorting into rooms is needed.
  const gal = allImgs.slice(0, 5);
  const galCls = gal.length >= 5 ? 'pp-gal-5' : gal.length >= 3 ? 'pp-gal-3' : gal.length === 2 ? 'pp-gal-2' : 'pp-gal-1';
  const galShown = galCls === 'pp-gal-3' ? gal.slice(0, 3) : gal;
  const galleryHtml = galShown.length ? `
  <div class="pp-gallery ${galCls}">
    ${galShown.map((s, i) => `<button class="pp-gal-tile" type="button" data-i="${i}" aria-label="Open photo ${i + 1} of ${allImgs.length}">${img(s, i === 0 ? 1800 : 900, '', i === 0)}</button>`).join('')}
    ${allImgs.length > 1 ? `<button class="pp-gal-all" type="button" data-i="0">${icon('grid', 16)}See All ${allImgs.length} Photos</button>` : ''}
  </div>` : '';

  // ---- Image grids ----
  // Every section uses the same grid. Images go in rows of three; the rule
  // below picks the row sizes so there is never a lone image on the last row:
  //   1 -> [1]   2 -> [2]   3 -> [3]   4 -> [2,2]   5 -> [3,2]   6 -> [3,3]
  //   7 -> [3,2,2]   8 -> [3,3,2]   9 -> [3,3,3]   10 -> [3,3,2,2] ...
  const rowSizes = (n) => {
    if (n <= 0) return [];
    if (n <= 3) return [n];
    const out = [];
    let left = n;
    while (left > 0) {
      if (left === 4) { out.push(2, 2); break; }
      if (left <= 3) { out.push(left); break; }
      out.push(3); left -= 3;
    }
    return out;
  };
  const grid = (set) => {
    if (!set.length) return '';
    let i = 0;
    const rows = rowSizes(set.length).map((size, r) => {
      const row = set.slice(i, i + size); i += size;
      // Wide and narrow images alternate row by row, as on the reference:
      // row 1 wide-wide-narrow, row 2 narrow-wide-wide, and so on.
      const flip = r % 2 ? ' pp-grid-flip' : '';
      return `<div class="pp-grid-row pp-grid-${size}${flip}">${row.map(s => `<figure>${img(s, size === 3 ? 1200 : 1600)}</figure>`).join('')}</div>`;
    });
    return `<div class="pp-grid">${rows.join('')}</div>`;
  };

  // ---- Overview ----
  const overviewHtml = overviewImgs.length ? `
  <section class="pp-section pp-overview">
    <h2 class="pp-h2">Overview</h2>
    ${grid(overviewImgs)}
  </section>` : '';

  // ---- Story sections: heading left, paragraph right, grid below ----
  const story = (heading, text, set, cls) => (text || set.length) ? `
  <section class="pp-section pp-story ${cls || ''}">
    <div class="pp-split">
      <h2 class="pp-h2">${heading}</h2>
      <div class="pp-prose">${paras(text)}</div>
    </div>
    ${grid(set.slice(0, 3))}
  </section>` : '';

  const livingHtml   = story('Living Spaces', livingText, livingSet);
  const bedroomsHtml = story('Bedrooms &amp; Bathrooms', bedroomsText, bedroomsSet);
  const outdoorHtml  = story('The Environment', outdoorText, outdoorSet, 'pp-env');

  const viewAllHtml = allImgs.length > 1 ? `
  <div class="pp-lightbox" id="pp-lightbox" hidden>
    <button class="pp-lightbox-close" type="button" id="pp-lightbox-close" aria-label="Close">&times;</button>
    <div class="pp-lightbox-inner">
      ${allImgs.map((s, i) => `<figure id="pp-photo-${i}">${img(s, 1800)}</figure>`).join('')}
    </div>
  </div>` : '';

  const bookHref = bookingUrl ? `/go/${encodeURIComponent(slugVal)}` : `/contact?topic=house-${encodeURIComponent(slugVal)}`;
  const bookHtml = `
  <aside class="pp-book">
    <p class="pp-book-title">Book This House</p>
    ${facts.length ? `<p class="pp-book-meta">${facts.filter(x => x[0] !== 'type').map(x => escapeHtml(String(x[1]))).join(' &middot; ')}</p>` : ''}
    <a class="pp-book-btn" id="pp-book" href="${bookHref}"${bookingUrl ? ' target="_blank" rel="noopener"' : ''}>${bookingUrl ? 'Check Availability' : 'Ask About This House'} <span aria-hidden="true">&rarr;</span></a>
    <p class="pp-book-note">${bookingUrl ? 'You book directly with the owner or the people who look after the house.' : 'Send us a message and we will put you in touch.'}</p>
  </aside>`;

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

    body { background: #FFFFFF; }
    /* Every block uses the nav's side gutter (48px, 16px on phones) so all edges line up. */
    .pp { padding: 0 var(--gutter); }
    .pp figure, .pp-hero-wrap figure { margin: 0; overflow: hidden; background: var(--grey-4); }
    .pp figure img, .pp-hero-wrap figure img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .img-fallback { background: var(--grey-4); }

    /* Gallery: one big photo and four small. Grid cells crop, so photos that
       are not wide enough for a full-width hero still look right. */
    .pp-gallery { position: relative; display: grid; gap: 8px; padding: 0 48px; height: clamp(320px, 46vw, 640px); }
    .pp-gal-5 { grid-template-columns: 2fr 1fr 1fr; grid-template-rows: 1fr 1fr; }
    .pp-gal-5 .pp-gal-tile:first-child, .pp-gal-3 .pp-gal-tile:first-child { grid-row: 1 / span 2; }
    .pp-gal-3 { grid-template-columns: 2fr 1fr; grid-template-rows: 1fr 1fr; }
    .pp-gal-2 { grid-template-columns: 1fr 1fr; }
    .pp-gal-1 { grid-template-columns: 1fr; }
    .pp-gal-tile { position: relative; display: block; padding: 0; border: 0; margin: 0; overflow: hidden; background: var(--grey-4); cursor: zoom-in; min-height: 0; }
    .pp-gal-tile img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.6s ease, opacity 0.3s; }
    .pp-gal-tile:hover img { transform: scale(1.02); opacity: 0.94; }
    .pp-gal-all {
      position: absolute; right: 68px; bottom: 20px; display: inline-flex; align-items: center; gap: 10px;
      background: #fff; color: var(--black); border: 1px solid var(--black); padding: 11px 16px;
      font-family: var(--body); font-size: 14px; letter-spacing: 0.01em; cursor: pointer; transition: background 0.2s, color 0.2s;
    }
    .pp-gal-all:hover { background: var(--black); color: #fff; }

    /* Title, facts, features and intro on the left; booking card on the right */
    .pp-top { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: clamp(40px, 6vw, 96px); align-items: start; padding-top: 64px; }
    .pp-name { font-family: var(--display); font-weight: 400; font-size: clamp(32px, 3.6vw, 48px); letter-spacing: 0.02em; margin: 0 0 10px; line-height: 1.1; }
    .pp-where { font-size: 16px; letter-spacing: 0.01em; color: var(--grey-1); margin: 0; }
    .pp-editorial { font-family: var(--display); font-size: 21px; line-height: 1.4; margin: 24px 0 0; max-width: 34ch; }
    .pp-facts { list-style: none; margin: 36px 0 0; padding: 24px 0; display: flex; flex-wrap: wrap; gap: 14px 36px; border-top: 1px solid var(--grey-3); border-bottom: 1px solid var(--grey-3); }
    .pp-facts li { display: inline-flex; align-items: center; gap: 10px; font-size: 16px; letter-spacing: 0.01em; }
    .pp-features { list-style: none; margin: 36px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
    .pp-features li { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; border: 1px solid var(--grey-3); padding: 22px 12px; font-size: 14px; letter-spacing: 0.01em; }
    .ico { flex-shrink: 0; }
    .pp-intro { margin-top: 56px; }

    /* Booking card */
    .pp-book { position: sticky; top: 112px; border: 1px solid var(--black); padding: 32px 28px; }
    .pp-book-title { font-family: var(--display); font-size: 24px; letter-spacing: 0.01em; margin: 0 0 8px; }
    .pp-book-meta { font-size: 14px; color: var(--grey-1); margin: 0 0 24px; letter-spacing: 0.01em; }
    .pp-book-btn {
      display: flex; align-items: center; justify-content: center; gap: 12px; width: 100%;
      padding: 18px 20px; background: var(--black); color: #fff; border: 1px solid var(--black);
      font-family: var(--body); font-size: 16px; letter-spacing: 0.01em; transition: background 0.2s, color 0.2s;
    }
    .pp-book-btn:hover { background: #fff; color: var(--black); }
    .pp-book-note { font-size: 13px; line-height: 1.5; color: var(--grey-1); margin: 14px 0 0; }
    .pp-btn {
      display: inline-block; border: 1px solid var(--black); background: transparent; color: var(--black);
      padding: 17px 34px; font-family: var(--body); font-size: 14px; letter-spacing: 0.01em;
      cursor: pointer; transition: background 0.2s, color 0.2s;
    }
    .pp-btn:hover { background: var(--black); color: #fff; }

    /* Shared section rhythm */
    .pp-section { padding-top: 150px; }
    .pp-h2 { font-family: var(--display); font-weight: 400; font-size: clamp(32px, 3.6vw, 52px); line-height: 1.05; margin: 0; letter-spacing: 0.01em; letter-spacing: 0.02em; }
    .pp-prose p { font-size: 17px; line-height: 1.75; margin: 0 0 16px; text-indent: 3.5em; }
    .pp-prose p:last-child { margin-bottom: 0; }


    /* Story sections */
    .pp-split { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: start; margin-bottom: 120px; }

    /* The environment */

    /* All photos */
    .pp-lightbox { position: fixed; inset: 0; background: #FFFFFF; z-index: 100; overflow-y: auto; }
    .pp-lightbox[hidden] { display: none; }
    .pp-lightbox-inner { max-width: 1100px; margin: 0 auto; padding: 80px 24px; display: grid; gap: 20px; }
    .pp-lightbox-inner figure { margin: 0; }
    .pp-lightbox-inner img { width: 100%; height: auto; display: block; }
    .pp-lightbox-close { position: fixed; top: 18px; right: 26px; background: #FFFFFF; border: 0; font-size: 40px; line-height: 1; cursor: pointer; z-index: 101; }

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
    .pp-recs-from { font-size: 14px; letter-spacing: 0.01em; color: var(--grey-1); margin: 14px 0 0; }
    .pp-recs-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 72px; }
    .pp-rec { display: block; color: inherit; }
    .pp-rec-img { aspect-ratio: 10 / 7; overflow: hidden; background: var(--grey-4); margin-bottom: 26px; }
    .pp-rec-img img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.5s ease; }
    a.pp-rec:hover .pp-rec-img img { transform: scale(1.03); }
    .pp-rec-name { font-family: var(--body); font-weight: 400; font-size: 22px; letter-spacing: 0.01em; margin: 0 0 10px; }
    .pp-rec-sub { font-size: 14px; letter-spacing: 0.01em; color: var(--grey-1); margin: 0; }
    .pp-dot { margin: 0 8px; font-size: 10px; }

    /* Nearby houses */
    .prop-other { padding: 150px var(--gutter) 0; }
    .prop-other-header { margin-bottom: 56px; }
    .prop-other-title { font-family: var(--display); font-weight: 400; font-size: clamp(28px, 3vw, 40px); margin: 0; letter-spacing: 0.02em; }
    .prop-other-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 48px 32px; }
    .prop-other-grid > a { display: block; color: inherit; }
    .prop-other-grid > a:hover .card-img img { transform: scale(1.03); }
    footer { margin-top: 140px; }

    @media (max-width: 900px) {
      .pp-top { grid-template-columns: 1fr; gap: 40px; padding-top: 40px; }
      .pp-book { position: static; }
      .pp-section { padding-top: 90px; }
      .pp-split { grid-template-columns: 1fr; gap: 28px; }
      .pp-split { margin-bottom: 48px; }
      .pp-loc-grid { grid-template-columns: 1fr; gap: 28px; }
      .pp-loc-nomap .pp-loc-text { grid-column: 1; }
      .pp-loc-text p { text-align: left; }
      .pp-recs-grid { grid-template-columns: 1fr 1fr; gap: 32px; }
      .prop-other { padding-top: 90px; }
      .prop-other-grid { grid-template-columns: 1fr 1fr; gap: 32px 20px; }
      .pp-overview .pp-h2, .pp-location .pp-h2, .pp-recs-head { margin-bottom: 36px; }
    }
    @media (max-width: 560px) {
      .pp-features { grid-template-columns: repeat(2, 1fr); }
      .pp-recs-grid, .prop-other-grid { grid-template-columns: 1fr; }
      .pp-prose p { text-indent: 2em; }
    }
    /* Image grid (all sections). Only the hero is full width. */
    .pp-grid { display: grid; gap: 18px; margin-top: 56px; }
    .pp-overview .pp-grid { margin-top: 0; }
    /* Every image in a row shares one height; wide images are 3:2, narrow ones close to square. */
    .pp-grid-row { display: grid; gap: 18px; height: clamp(220px, 24vw, 520px); }
    .pp-grid-row figure { height: 100%; }
    .pp-grid-3 { grid-template-columns: 3fr 3fr 2fr; }
    .pp-grid-3.pp-grid-flip { grid-template-columns: 2fr 3fr 3fr; }
    .pp-grid-2 { grid-template-columns: 3fr 2fr; height: clamp(260px, 36vw, 760px); }
    .pp-grid-2.pp-grid-flip { grid-template-columns: 2fr 3fr; }
    .pp-grid-1 { grid-template-columns: 3fr 2fr; height: clamp(260px, 36vw, 760px); }
    @media (max-width: 560px) {
      .pp-grid, .pp-grid-row { gap: 10px; }
      .pp-grid { margin-top: 32px; }
      .pp-grid-row { height: auto; }
      .pp-grid-row figure { height: auto; aspect-ratio: 4 / 3; }
      .pp-grid-3, .pp-grid-3.pp-grid-flip, .pp-grid-2, .pp-grid-2.pp-grid-flip { grid-template-columns: repeat(2, 1fr); }
      .pp-grid-3 figure:first-child { grid-column: 1 / -1; }
      .pp-grid-1 { grid-template-columns: 1fr; }
    }

    /* Floating CTA */
    .pp-cta {
      position: fixed; right: 48px; bottom: calc(32px + env(safe-area-inset-bottom, 0px)); z-index: 800;
      display: inline-flex; align-items: center; justify-content: center; gap: 14px;
      padding: 20px 32px; background: var(--black); color: #FFFFFF;
      font-family: var(--body); font-size: 15px; font-weight: 400;
      letter-spacing: 0.01em;
      box-shadow: 0 6px 24px rgba(15, 15, 15, 0.18);
      opacity: 0; transform: translateY(16px); pointer-events: none;
      transition: opacity 0.3s ease, transform 0.3s ease, background 0.2s;
    }
    .pp-cta.is-on { opacity: 1; transform: none; pointer-events: auto; }
    .pp-cta:hover { background: #2a2a28; }
    .pp-cta:focus-visible { outline: 1px solid var(--black); outline-offset: 4px; }
    @media (prefers-reduced-motion: reduce) { .pp-cta { transition: none; } }

      /* Phone gutters: must stay last so they win over the base rules. */
    @media (max-width: 768px) {
      .pp { padding-left: 16px; padding-right: 16px; }
      /* Phones: just the first photo, with the See All button on it */
      .pp-gallery { padding: 0; height: auto; display: block; }
      .pp-gal-tile { display: none; aspect-ratio: 4 / 3; width: 100%; }
      .pp-gal-tile:first-child { display: block; }
      .pp-gal-all { right: 16px; bottom: 16px; }
      .prop-other { padding-left: 16px; padding-right: 16px; }
      .pp-cta { left: 16px; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); padding: 18px 20px; }
    }
  </style>
</head>
<body>

  ${nav()}

  <main>
    ${galleryHtml}
    <div class="pp">
      <div class="pp-top">
        <div class="pp-main">
          <h1 class="pp-name">${escapeHtml(name)}</h1>
          ${location ? `<p class="pp-where">${escapeHtml(location)}</p>` : ''}
          ${editorialTitle ? `<p class="pp-editorial">${escapeHtml(editorialTitle)}</p>` : ''}
          ${factsHtml}
          ${featuresHtml}
          ${introText ? `<div class="pp-prose pp-intro">${paras(introText)}</div>` : ''}
        </div>
        ${bookHtml}
      </div>
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

  ${bookingUrl ? `<a class="pp-cta" id="pp-cta" href="/go/${encodeURIComponent(slugVal)}" target="_blank" rel="noopener" aria-hidden="true" tabindex="-1">Check Availability <span aria-hidden="true">&rarr;</span></a>` : ''}

  <script>
  (function () {
    // Floating CTA: shows whenever the booking card is off screen (on phones that
    // is most of the page; on desktop the card is sticky, so rarely), and hides
    // while the footer is on screen.
    var cta = document.getElementById('pp-cta');
    var book = document.getElementById('pp-book');
    var foot = document.querySelector('footer');
    if (cta && book && 'IntersectionObserver' in window) {
      var pastBook = false, footVisible = false;
      var update = function () {
        var on = pastBook && !footVisible;
        cta.classList.toggle('is-on', on);
        cta.setAttribute('aria-hidden', on ? 'false' : 'true');
        cta.tabIndex = on ? 0 : -1;
      };
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { pastBook = !e.isIntersecting; });
        update();
      }).observe(book);
      if (foot) new IntersectionObserver(function (es) {
        es.forEach(function (e) { footVisible = e.isIntersecting; });
        update();
      }).observe(foot);
    }
  })();
  (function () {
    // Gallery: any photo, or See All, opens every photo at that one
    var box = document.getElementById('pp-lightbox');
    var close = document.getElementById('pp-lightbox-close');
    function shut() { box.hidden = true; document.body.style.overflow = ''; }
    if (box) {
      document.querySelectorAll('.pp-gal-tile, .pp-gal-all').forEach(function (b) {
        b.addEventListener('click', function () {
          box.hidden = false; document.body.style.overflow = 'hidden';
          var fig = document.getElementById('pp-photo-' + (b.getAttribute('data-i') || 0));
          box.scrollTop = fig && b.classList.contains('pp-gal-tile') ? fig.offsetTop - 60 : 0;
        });
      });
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
      return houseCard({
        url,
        img: img ? responsiveImageUrl(img, 1000) : '',
        name: rf['Name'] || '',
        guests: rf['Sleeps'],
        place: placeOf(rf),
        imgAttrs: IMG_ONERROR
      });
    }).join('');

    return `
    <section class="prop-other">
      <div class="prop-other-header">
        <h2 class="prop-other-title">Nearby Houses</h2>
      </div>
      <div class="house-grid">
        ${cardsHtml}
      </div>
    </section>`;
  } catch (e) {
    return '';
  }
}
