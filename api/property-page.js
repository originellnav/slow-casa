const AIRTABLE_TOKEN = 'patgpNhgfFkQsyQj9.887202d16495ba49fad025cb888cef3eac0a6c34058675dd2516127ad083d8c6';
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

  const f = record.fields;
  const name = f['Name'] || '';
  const slugVal = f['Slug'] || slug;
  const location = f['Location label'] || '';
  const country = f['Country'] || '';
  const region = f['Region'] || '';
  const town = f['Town'] || '';
  const latitude = f['Latitude'];
  const longitude = f['Longitude'];
  const description = f['Description'] || '';
  const editorialTitle = f['Editorial Title'] || '';
  const introOne = f['Intro One'] || '';
  const introTwo = f['Intro Two'] || '';
  const sleeps = f['Sleeps'] || '';
  const tags = f['Tags'] || '';
  const bookingUrl = f['Booking URL'] || '';
  const architect = f['Architect'] || '';
  const architectUrl = f['Architect URL'] || '';
  // Places we love - pulled from the linked "Places" table.
  let places = [];
  try {
    const allPlaces = await getAllPlaces();
    places = allPlaces.filter(p => {
      const pf = p.fields || {};
      const linked = pf['Properties'];
      const isLinked = Array.isArray(linked) && linked.indexOf(record.id) !== -1;
      const status = String(pf['Status'] || '').toLowerCase();
      const notDraft = status !== 'draft'; // show Published or unset, hide Draft
      return isLinked && notDraft && pf['Name'];
    });
  } catch (e) { places = []; }

  function buildPlaces(items) {
    if (!items || !items.length) return '';
    // Category display order; anything unlisted falls to the end.
    const order = ['Eat', 'Drink', 'Stay', 'Swim', 'Play', 'See', 'Do'];
    const sorted = items.slice().sort((a, b) => {
      const ca = order.indexOf(a.fields.Category || '');
      const cb = order.indexOf(b.fields.Category || '');
      const ra = ca === -1 ? 99 : ca;
      const rb = cb === -1 ? 99 : cb;
      if (ra !== rb) return ra - rb;
      return String(a.fields.Name || '').localeCompare(String(b.fields.Name || ''));
    });

    const cards = sorted.map(p => {
      const pf = p.fields || {};
      const pName = pf['Name'] || '';
      if (!pName) return '';
      const cat = pf['Category'] || '';
      const link = pf['Link'] || '';
      const img = getPlaceImageUrl(p);
      const imgTag = img
        ? `<div class="place-img"><img src="${escapeHtml(responsiveImageUrl(img, 600))}" alt="${escapeHtml(pName)}" loading="lazy" ${IMG_ONERROR} /></div>`
        : `<div class="place-img place-img-empty"></div>`;
      const inner = `${imgTag}
            ${cat ? `<p class="place-cat">${escapeHtml(cat)}</p>` : ''}
            <h3 class="place-name">${escapeHtml(pName)}</h3>`;
      return link
        ? `<article class="place-card"><a href="${escapeHtml(link)}" target="_blank" rel="noopener">${inner}</a></article>`
        : `<article class="place-card">${inner}</article>`;
    }).join('');

    if (!cards) return '';

    return `
  <section class="prop-places">
    <div class="prop-places-inner">
      <div class="prop-places-head">
        <h2 class="prop-places-title">Places we love</h2>
        <p class="prop-places-sub">Local spots to eat, drink, stay or swim.</p>
      </div>
      <div class="prop-places-grid">
        ${cards}
      </div>
    </div>
  </section>`;
  }

  const heroImage = getImageUrl(record, 0);
  const allImages = getAllImageUrls(record);
  const galleryImages = allImages.slice(1);

  // Gallery render - apply responsive sizing
  let galleryHtml = '';
  const imgs = galleryImages;
  for (let i = 0; i < imgs.length; i += 2) {
    if (i + 1 < imgs.length) {
      galleryHtml += `
        <div class="prop-gallery-row">
          <div class="prop-gallery-img"><img src="${responsiveImageUrl(imgs[i], 1200)}" alt="${name}" loading="lazy" ${IMG_ONERROR} /></div>
          <div class="prop-gallery-img"><img src="${responsiveImageUrl(imgs[i+1], 1200)}" alt="${name}" loading="lazy" ${IMG_ONERROR} /></div>
        </div>`;
    } else {
      galleryHtml += `
        <div class="prop-gallery-row">
          <div class="prop-gallery-img"><img src="${responsiveImageUrl(imgs[i], 1600)}" alt="${name}" loading="lazy" ${IMG_ONERROR} /></div>
        </div>`;
    }
  }

  // SEO
  const title = `${name}${location ? ' — ' + location : ''} | Slow Casa`;
  const metaDescBase = description ? description.replace(/\n/g, ' ') : `${name} on Slow Casa, a curated directory of architect-designed vacation homes in rural Europe.`;
  const metaDesc = metaDescBase.length > 155 ? metaDescBase.substring(0, 152) + '...' : metaDescBase;
  const canonicalUrl = `https://slowcasa.com/properties/${slugVal}`;
  const ogImage = heroImage || '';

  // JSON-LD LodgingBusiness schema
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    "name": name,
    "description": description,
    "url": canonicalUrl
  };
  if (ogImage) structuredData.image = ogImage;
  if (latitude && longitude) {
    structuredData.geo = {
      "@type": "GeoCoordinates",
      "latitude": latitude,
      "longitude": longitude
    };
  }
  if (town || region || country) {
    structuredData.address = {
      "@type": "PostalAddress"
    };
    if (town) structuredData.address.addressLocality = town;
    if (region) structuredData.address.addressRegion = region;
    if (country) structuredData.address.addressCountry = country;
  }
  if (sleeps) {
    const sleepsNum = parseInt(sleeps);
    if (!isNaN(sleepsNum)) structuredData.maximumAttendeeCapacity = sleepsNum;
  }

  const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`;

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
  <script async defer src="https://www.googletagmanager.com/gtag/js?id=G-B930Z6F96Z"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-B930Z6F96Z');
  </script>
  <style>
    @font-face {
      font-family: 'DM Sans';
      src: url('/fonts/dm-sans-v17-latin-300.woff2') format('woff2');
      font-weight: 300;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'DM Sans';
      src: url('/fonts/dm-sans-v17-latin-300italic.woff2') format('woff2');
      font-weight: 300;
      font-style: italic;
      font-display: swap;
    }
    @font-face {
      font-family: 'DM Sans';
      src: url('/fonts/dm-sans-v17-latin-regular.woff2') format('woff2');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'DM Sans';
      src: url('/fonts/dm-sans-v17-latin-500.woff2') format('woff2');
      font-weight: 500;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'DM Serif Display';
      src: url('/fonts/dm-serif-display-v17-latin-regular.woff2') format('woff2');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'DM Serif Display';
      src: url('/fonts/dm-serif-display-v17-latin-italic.woff2') format('woff2');
      font-weight: 400;
      font-style: italic;
      font-display: swap;
    }
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
      background: #f9f7f2; z-index: 10; position: relative;
    }
    .wordmark { font-family: 'DM Serif Display', Georgia, serif; font-size: 28px; font-weight: 400; letter-spacing: 0.01em; text-align: center; color: #0f0f0f; }
    .nav-links { display: flex; gap: 32px; list-style: none; justify-content: flex-end; }
    .nav-links a { font-size: 13px; color: #0f0f0f; opacity: 0.7; letter-spacing: 0.03em; transition: opacity 0.2s; }
    .nav-links a:hover { opacity: 1; }

    .hero-split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      min-height: calc(100vh - 88px);
      max-height: 800px;
    }
    .hero-left {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #e8e8e8;
    }
    .hero-left img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .hero-right {
      padding: 80px 64px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      background: #f9f7f2;
    }
    .hero-location { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #888; margin-bottom: 16px; }
    .hero-title { font-family: 'DM Serif Display', Georgia, serif; font-size: 72px; line-height: 0.95; letter-spacing: -0.02em; color: #0f0f0f; margin-bottom: 28px; }
    .hero-meta { font-size: 11px; color: #888; letter-spacing: 0.08em; }
    .hero-meta a { border-bottom: 0.5px solid #888; padding-bottom: 1px; transition: color 0.2s, border-color 0.2s; }
    .hero-meta a:hover { color: #0f0f0f; border-color: #0f0f0f; }
    .hero-meta-sep { display: inline-block; margin: 0 12px; opacity: 0.6; }

    .prop-intro {
      max-width: 720px;
      margin: 0 auto;
      padding: 120px 48px 0;
      text-align: center;
    }
    .prop-editorial-title {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: clamp(28px, 3.6vw, 40px);
      line-height: 1.15;
      letter-spacing: -0.01em;
      color: #0f0f0f;
      margin-bottom: 56px;
    }
    .prop-intro-text {
      font-family: 'TT Norms Pro', 'DM Sans', sans-serif;
      font-size: 19px;
      font-weight: 300;
      line-height: 1.7;
      color: #2a2a28;
    }
    .prop-intro-text p { margin-bottom: 1.4em; }
    .prop-intro-text p:last-child { margin-bottom: 0; }

    .prop-gallery {
      max-width: 1200px;
      margin: 96px auto 0;
      padding: 0 48px;
    }
    .prop-gallery-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 24px;
    }
    .prop-gallery-row:has(> .prop-gallery-img:only-child) {
      grid-template-columns: 1fr;
    }
    .prop-gallery-img {
      width: 100%;
      aspect-ratio: 3/2;
      overflow: hidden;
      background: #e8e8e8;
    }
    .prop-gallery-img img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .prop-favs {
      max-width: 720px;
      margin: 96px auto 0;
      padding: 0 48px;
    }
    .prop-favs-label {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #0f0f0f;
      margin-bottom: 28px;
    }
    .favs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 32px;
    }
    .favs-group { display: flex; flex-direction: column; gap: 8px; }
    .favs-cat {
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 4px;
    }
    .favs-link {
      font-family: 'TT Norms Pro', 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      font-weight: 300;
      color: #0f0f0f;
      border-bottom: 0.5px solid #e8e8e8;
      padding-bottom: 2px;
      transition: border-color 0.2s;
      display: inline-block;
      width: fit-content;
    }
    .favs-link:hover { border-color: #0f0f0f; }

    .prop-cta {
      max-width: 720px;
      margin: 96px auto 0;
      padding: 0 48px;
      text-align: center;
    }
    .prop-cta-button {
      display: inline-block;
      padding: 18px 48px;
      background: #0f0f0f;
      color: #f9f7f2;
      font-family: 'DM Sans', sans-serif;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      transition: background 0.2s;
    }
    .prop-cta-button:hover { background: #2a2a28; }

    .prop-other {
      max-width: 1200px;
      margin: 0 auto;
      padding: 120px 48px 0;
    }
    .prop-other-header {
      text-align: center;
      margin-bottom: 64px;
    }
    .prop-other-title {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: clamp(28px, 3.6vw, 40px);
      font-weight: 400;
      color: #0f0f0f;
    }
    .prop-other-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 48px 32px;
    }
    .prop-other-grid > div { cursor: pointer; }
    .card-img {
      width: 100%;
      aspect-ratio: 4/3;
      overflow: hidden;
      margin-bottom: 16px;
      background: #e8e8e8;
    }
    .card-img img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.5s ease;
    }
    .prop-other-grid > div:hover .card-img img { transform: scale(1.03); }
    .card-location {
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 6px;
    }
    .card-name {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: 18px;
      font-weight: 400;
      line-height: 1.2;
      color: #0f0f0f;
    }

    footer {
      padding: 80px 48px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      max-width: 1200px;
      margin: 120px auto 0;
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
      .hero-split { grid-template-columns: 1fr; max-height: none; min-height: auto; }
      .hero-left { height: 60vh; }
      .hero-right { padding: 64px 32px; }
      .hero-title { font-size: 38px; }
      .prop-other-grid { grid-template-columns: repeat(2, 1fr); gap: 40px 24px; }
    }

    @media (max-width: 768px) {
      nav { padding: 20px 24px; }
      .nav-links { display: none; }
      .prop-intro { padding: 80px 24px 0; }
      .prop-intro-text { font-size: 17px; }
      .prop-gallery { padding: 0 24px; margin-top: 64px; }
      .prop-gallery-row { grid-template-columns: 1fr; gap: 16px; margin-bottom: 16px; }
      .prop-cta { padding: 0 24px; margin-top: 64px; }
      .prop-favs { padding: 0 24px; margin-top: 64px; }
      .prop-other { padding: 80px 24px 0; }
      .prop-other-grid { grid-template-columns: 1fr; gap: 40px; }
      footer { padding: 56px 24px 24px; margin-top: 80px; flex-direction: column; gap: 16px; text-align: center; }
      .footer-left { flex-direction: column; gap: 12px; }
    }

    /* --- Places we love (image-led, in its own band) --- */
    .prop-places {
      margin-top: 80px;
      padding: 80px 0 96px;
      background: #f3efe6;
      border-top: 1px solid #e3ded3;
      border-bottom: 1px solid #e3ded3;
    }
    .prop-places-inner { max-width: 1200px; margin: 0 auto; padding: 0 48px; }
    .prop-places-head { text-align: center; max-width: 640px; margin: 0 auto 56px; }
    .prop-places-title {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: clamp(30px, 3.6vw, 44px);
      line-height: 1.1;
      letter-spacing: -0.01em;
      color: #0f0f0f;
      margin-bottom: 14px;
    }
    .prop-places-sub {
      font-family: 'TT Norms Pro', 'DM Sans', sans-serif;
      font-size: 17px;
      font-weight: 300;
      color: #555;
    }
    .prop-places-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 36px 32px;
    }
    .place-card a { display: block; color: inherit; }
    .place-img {
      width: 100%;
      aspect-ratio: 4/5;
      overflow: hidden;
      background: #e6e0d4;
      margin-bottom: 18px;
    }
    .place-img img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.5s ease;
    }
    .place-card a:hover .place-img img { transform: scale(1.03); }
    .place-img-empty { background: linear-gradient(150deg, #e6ded0, #d7cdbb); }
    .place-cat {
      font-size: 10px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #8a857c;
      margin-bottom: 9px;
    }
    .place-name {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: 22px;
      line-height: 1.2;
      color: #0f0f0f;
      margin-bottom: 0;
    }
    .place-card a:hover .place-name { text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
    @media (max-width: 900px) {
      .prop-places-grid { grid-template-columns: repeat(2, 1fr); gap: 32px 24px; }
    }
    @media (max-width: 768px) {
      .prop-places { margin-top: 56px; padding: 56px 0 64px; }
      .prop-places-inner { padding: 0 24px; }
      .prop-places-grid { grid-template-columns: 1fr 1fr; gap: 24px 16px; }
      .place-name { font-size: 18px; }
    }

    /* shown when an image fails to load, in place of a broken-image icon */
    .img-fallback { background: linear-gradient(150deg, #e6ded0, #d7cdbb) !important; }
  </style>
</head>
<body>

  <nav>
    <div></div>
    <a href="/" class="wordmark">Slow Casa</a>
    <ul class="nav-links">
      <li><a href="/directory">Directory</a></li>
      <li><a href="https://slowcasa.beehiiv.com/subscribe" target="_blank" rel="noopener">Newsletter</a></li>
      <li><a href="/criteria">About</a></li>
    </ul>
  </nav>

  <div class="hero-split">
    <div class="hero-left">
      ${heroImage ? `<img src="${responsiveImageUrl(heroImage, 1400)}" alt="${name}, ${location}" fetchpriority="high" loading="eager" ${IMG_ONERROR} />` : '<div style="width:100%;height:100%;background:#e8e8e8;"></div>'}
    </div>
    <div class="hero-right">
      ${location ? `<p class="hero-location">${location}</p>` : ''}
      <h1 class="hero-title">${name}</h1>
      ${(architect || sleeps) ? `<p class="hero-meta">${[
        architect ? `Architecture by ${architect}` : null,
        sleeps ? `Sleeps ${sleeps}` : null
      ].filter(Boolean).join(' · ')}</p>` : ''}
    </div>
  </div>

  ${editorialTitle || introOne || introTwo ? `
  <section class="prop-intro">
    ${editorialTitle ? `<h2 class="prop-editorial-title">${escapeHtml(editorialTitle)}</h2>` : ''}
    <div class="prop-intro-text">
      ${introOne ? `<p>${escapeHtml(introOne)}</p>` : ''}
      ${introTwo ? `<p>${escapeHtml(introTwo)}</p>` : ''}
    </div>
  </section>` : ''}

  ${galleryImages.length > 0 ? `
  <section class="prop-gallery">
    ${galleryHtml}
  </section>` : ''}

  ${bookingUrl ? `
  <section class="prop-cta">
    <a href="${escapeHtml(bookingUrl)}" target="_blank" rel="noopener" class="prop-cta-button">Rent this house</a>
  </section>` : ''}

  ${buildPlaces(places)}

  ${await renderNearbyHouses(record)}

<footer>
    <div class="footer-left">
      <span class="footer-copy">&copy; 2026 Slow Casa</span>
      <a href="/privacy" class="footer-policy">Privacy Policy</a>
    </div>
    <div class="footer-links">
      <a href="/guides">Guides</a>
      <a href="https://www.instagram.com/theslowcasa/" target="_blank" rel="noopener">Instagram</a>
      <a href="https://newsletter.slowcasa.com/subscribe" target="_blank" rel="noopener">Newsletter</a>
    </div>
  </footer>
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

    const candidates = all.filter(r => r.id !== currentId && hasImage(r));
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
      const url = '/properties/' + slug;
      return '<div onclick="window.location=\'' + url + '\'">' +
            '<div class="card-img">' + (img ? '<img src="' + responsiveImageUrl(img, 600) + '" alt="' + (rf['Name']||'') + '" loading="lazy" ' + IMG_ONERROR + ' />' : '') + '</div>' +
            '<p class="card-location">' + (rf['Location label']||'') + '</p>' +
            '<p class="card-name">' + (rf['Name']||'') + '</p>' +
            '</div>';
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


