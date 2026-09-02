const { nav } = require('../lib/nav');
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = 'appndrnWrdlgxRJAG';

// In-memory cache for the full Airtable property fetch.
// One cache entry shared across all directory requests, since we filter in memory.
let CACHED_RECORDS = null;
let CACHED_AT = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchAllPropertiesFromAirtable() {
  let allRecords = [];
  let offset = null;
  let attempts = 0;
  do {
    let url = `https://api.airtable.com/v0/${BASE_ID}/Properties?pageSize=100`;
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
  return allRecords;
}

async function getProperties() {
  // Return cached records if still fresh
  if (CACHED_RECORDS && (Date.now() - CACHED_AT) < CACHE_TTL_MS) {
    return CACHED_RECORDS;
  }

  // Otherwise fetch fresh
  const records = await fetchAllPropertiesFromAirtable();

  // Only cache if fetch returned actual data
  if (records && records.length > 0) {
    CACHED_RECORDS = records;
    CACHED_AT = Date.now();
  }

  return records;
}

function escapeHtml(str) {
  return String(str)
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

function getImageUrl(record, index) {
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
  const locationQuery = (req.query.location || '').trim();

  let allRecords;
  try {
    allRecords = await getProperties();
  } catch (e) {
    return res.status(500).send('Error fetching directory');
  }

  // Filter to valid properties (must have a name and at least one image)
  let records = (allRecords || []).filter(r => {
    const f = r.fields || {};
    if (!f['Name']) return false;
    return !!f['Hero Image'] || !!f['Gallery Images'] || (f['Images'] && f['Images'].length > 0);
  });

  // Sort by Date Added descending (newest first)
  records.sort((a, b) => {
    const da = a.fields['Date added'] ? new Date(a.fields['Date added']) : new Date(0);
    const db = b.fields['Date added'] ? new Date(b.fields['Date added']) : new Date(0);
    return db - da;
  });

  // Apply server-side location filter if URL has ?location=X
  if (locationQuery) {
    const q = locationQuery.toLowerCase();
    records = records.filter(r => {
      const f = r.fields;
      return (f['Region'] || '').toLowerCase().includes(q) ||
             (f['Country'] || '').toLowerCase().includes(q) ||
             (f['Town'] || '').toLowerCase().includes(q) ||
             (f['Location label'] || '').toLowerCase().includes(q);
    });
  }

  // Build server-rendered cards
  const PAGE_SIZE = 12;
  const cardsHtml = records.map((record, i) => {
    const f = record.fields;
    const name = escapeHtml(f['Name'] || '');
    const slug = f['Slug'] || '';
    const locationLabel = escapeHtml(f['Location label'] || '');
    const descRaw = f['Description'] || '';
    const desc = escapeHtml(descRaw.substring(0, 100) + (descRaw.length > 100 ? '...' : ''));
    const country = escapeHtml((f['Country'] || '').toLowerCase());
    const region = escapeHtml((f['Region'] || '').toLowerCase());

    const imgUrl = getImageUrl(record, 0) || '';
    const imgUrl2 = getImageUrl(record, 1) || imgUrl;

    const url = '/properties/' + slug;
    const featured = i < 2 ? '<span class="card-featured">&#9679; Featured</span>' : '';
    const pageNum = Math.floor(i / PAGE_SIZE);
    const hiddenClass = pageNum === 0 ? '' : ' card-hidden';

    return `<a href="${url}" data-page="${pageNum}" data-country="${country}" data-region="${region}" class="card-link${hiddenClass}" style="text-decoration:none;color:inherit;">
      <div class="property-card">
        <div class="card-img">
          ${imgUrl ? `<img src="${escapeHtml(responsiveImageUrl(imgUrl, 600))}" alt="${name}" loading="lazy" class="img-primary" />` : ''}
          ${featured}
        </div>
        <p class="card-location">${locationLabel}</p>
        <p class="card-name">${name}</p>
        <p class="card-detail">${desc}</p>
      </div>
    </a>`;
  }).join('');

  const gridContent = records.length === 0
    ? '<div class="no-results"><p>No properties found.</p></div>'
    : cardsHtml;

  const searchValue = escapeHtml(locationQuery);
  const clearVisible = locationQuery ? 'visible' : '';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Directory — Slow Casa</title>
  <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="shortcut icon" href="/favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-title" content="Slow Casa" />
<link rel="manifest" href="/site.webmanifest" />
  <meta name="description" content="Every design-first vacation home in the Slow Casa directory. Filter by setting — sea, mountains, farm." />
  <link rel="canonical" href="https://slowcasa.com/directory" />
  <meta property="og:title" content="Directory — Slow Casa" />
  <meta property="og:description" content="Every design-first vacation home in the Slow Casa directory." />
  <meta property="og:url" content="https://slowcasa.com/directory" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Slow Casa" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preload" as="font" type="font/woff2" href="/fonts/dm-serif-display-v17-latin-regular.woff2" crossorigin />
  <link rel="preload" as="font" type="font/woff2" href="/fonts/dm-sans-v17-latin-regular.woff2" crossorigin />
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
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --white: #ffffff;
      --black: #0f0f0f;
      --grey-1: #888888;
      --grey-2: #bbbbbb;
      --grey-3: #e8e8e8;
      --grey-4: #f5f5f3;
      --serif: 'DM Serif Display', Georgia, serif;
      --sans: 'DM Sans', system-ui, sans-serif;
    }
    html { font-size: 16px; -webkit-font-smoothing: antialiased; }
    body { font-family: var(--sans); background: #f9f7f2 !important; color: var(--black); min-height: 100vh; }
    a { color: inherit; text-decoration: none; }

    nav { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 28px 48px; background: #f9f7f2; }
    .wordmark { font-family: 'DM Serif Display', Georgia, serif; font-size: 28px; font-weight: 400; letter-spacing: 0.01em; text-align: center; color: #2a2a28; text-transform: none; }
    .nav-links { display: flex; gap: 32px; list-style: none; justify-content: flex-end; }
    .nav-links a { font-size: 13px; color: var(--grey-1); letter-spacing: 0.03em; transition: color 0.2s; }
    .nav-links a:hover { color: var(--black); }

    .page-header {
      max-width: 800px;
      margin: 0 auto;
      padding: 96px 48px 72px;
      text-align: center;
    }

    .page-subline {
      font-family: var(--serif);
      font-size: 48px;
      font-weight: 400;
      line-height: 1.1;
      letter-spacing: -0.01em;
      margin-bottom: 40px;
      transition: opacity 0.4s ease;
      color: #2a2a28;
    }

    .dir-search-wrap { position: relative; max-width: 520px; margin: 0 auto; }

    .dir-search-input {
      width: 100%;
      font-family: var(--sans);
      font-size: 15px;
      padding: 15px 90px 15px 20px;
      border: 0.5px solid var(--grey-3);
      background: var(--white);
      color: var(--black);
      outline: none;
      transition: border-color 0.2s;
      letter-spacing: 0.01em;
    }

    .dir-search-input:focus { border-color: var(--black); }
    .dir-search-input::placeholder { color: var(--grey-2); }

    .dir-search-btn {
      position: absolute;
      right: 0;
      top: 0;
      height: 100%;
      padding: 0 20px;
      font-family: var(--sans);
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      background: #8B7355;
      color: var(--white);
      border: none;
      cursor: pointer;
      transition: background 0.2s;
    }

    .dir-search-btn:hover { background: #6B5635; }

    .dir-search-clear {
      display: none;
      position: absolute;
      right: 100px;
      top: 50%;
      transform: translateY(-50%);
      font-family: var(--sans);
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--grey-1);
      background: none;
      border: none;
      cursor: pointer;
      transition: color 0.2s;
    }
    .dir-search-clear:hover { color: var(--black); }
    .dir-search-clear.visible { display: block; }

    .search-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: var(--white);
      border: 0.5px solid var(--grey-3);
      border-top: none;
      z-index: 9999;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.08);
    }

    .search-dropdown.open { display: block; }

    .dropdown-label {
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--grey-1);
      padding: 12px 20px 6px;
    }

    .dropdown-item {
      display: block;
      width: 100%;
      padding: 10px 20px;
      font-size: 14px;
      color: var(--black);
      cursor: pointer;
      transition: background 0.15s;
      text-align: left;
      border: none;
      background: none;
      font-family: var(--sans);
    }

    .dropdown-item:hover { background: var(--grey-4); }

    .dir-body {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 48px 80px;
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 0 48px;
      align-items: start;
    }

    .dir-sidebar {
      position: sticky;
      top: 40px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 8px;
    }

    .dir-main { min-width: 0; }

    .filter-btn {
      font-family: 'TT Norms Pro', 'DM Sans', system-ui, sans-serif;
      font-size: 17px;
      font-weight: 300;
      letter-spacing: 0.02em;
      text-align: left;
      padding: 10px 0;
      border: none;
      background: transparent;
      color: var(--grey-1);
      cursor: pointer;
      transition: color 0.2s;
    }

    .filter-btn:hover { color: var(--black); }
    .filter-btn.active { color: var(--black); font-weight: 500; }

    .property-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 48px 32px; }

    .property-card { cursor: pointer; }

    .card-img { width: 100%; aspect-ratio: 3/2; overflow: hidden; margin-bottom: 20px; background: var(--grey-4); position: relative; }
    .card-img img { width: 100%; height: 100%; object-fit: cover; display: block; position: absolute; top: 0; left: 0; transition: opacity 0.4s ease; }
    .card-featured { position: absolute; top: 16px; left: 16px; font-family: 'DM Sans', system-ui, sans-serif; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--white); background: rgba(0,0,0,0.35); border: 0.5px solid rgba(255,255,255,0.5); padding: 5px 12px; z-index: 2; backdrop-filter: blur(4px); }
    .card-img img.img-primary { opacity: 1; }
    .card-img-placeholder { width: 100%; height: 100%; background: var(--grey-4); }

    .card-location { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--grey-1); margin-bottom: 8px; }
    .card-name { font-size: 18px; font-weight: 400; font-family: 'DM Serif Display', Georgia, serif; margin-bottom: 6px; line-height: 1.2; }
    .card-detail { font-family: 'TT Norms Pro', 'DM Sans', system-ui, sans-serif; font-size: 14px; font-weight: 300; color: var(--grey-1); line-height: 1.6; margin-bottom: 0; }
    .card-tag { display: inline-block; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--grey-1); border: 0.5px solid var(--grey-3); padding: 4px 10px; }

    .loading { grid-column: 1 / -1; text-align: center; padding: 80px 48px; font-size: 13px; color: var(--grey-1); letter-spacing: 0.06em; }
    .no-results { grid-column: 1 / -1; text-align: center; padding: 80px 48px; }
    .no-results p { font-size: 15px; color: var(--grey-1); }
    .card-hidden { display: none; }

    footer { padding: 32px 48px; display: flex; justify-content: space-between; align-items: center; max-width: 1200px; margin: 0 auto; border-top: 0.5px solid var(--grey-3); }
    .footer-word { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--grey-1); }
    .footer-links { display: flex; gap: 28px; }
    .footer-links a { font-size: 12px; color: var(--grey-1); transition: color 0.2s; }
    .footer-links a:hover { color: var(--black); }

    .page-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 0.5px solid var(--grey-3);
      background: transparent;
      color: #2a2a28;
      font-family: 'TT Norms Pro', 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      font-weight: 300;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .page-btn:hover { border-color: #2a2a28; }

    .page-btn.active {
      background: #2a2a28;
      border-color: #2a2a28;
      color: #f9f7f2;
      font-weight: 500;
    }

    .page-btn.arrow {
      font-size: 16px;
      color: #2a2a28;
    }

    @media (max-width: 768px) {
      nav { padding: 20px 24px; }
      .nav-links { display: none; }
      .wordmark { font-size: 22px; }
      .page-header { padding: 40px 24px 32px; }
      .page-subline { font-size: 30px; }
      .dir-body { grid-template-columns: 1fr; padding: 0 24px 56px; }
      .dir-sidebar { position: static; flex-direction: row; flex-wrap: wrap; gap: 12px; padding-bottom: 32px; }
      .filter-btn { padding: 6px 0; font-size: 15px; }
      .property-grid { grid-template-columns: 1fr; gap: 40px; }
      footer { padding: 24px; flex-direction: column; gap: 20px; text-align: center; }
      .footer-links { flex-wrap: wrap; justify-content: center; gap: 16px; }
    }

    /* Directory map */
    .dir-map-wrap {
      position: relative;
      max-width: 1400px;
      margin: 0 auto 64px;
      padding: 0 48px;
    }
    .dir-map {
      width: 100%;
      height: 380px;
      background: var(--grey-4);
      border: 0.5px solid var(--grey-3);
    }
    .sc-marker {
      width: 11px; height: 11px; border-radius: 50%;
      background: #0f0f0f; border: 2px solid #f9f7f2;
      cursor: pointer; transition: transform 0.2s ease, background 0.2s ease;
    }
    .sc-marker:hover { transform: scale(1.4); }
    .sc-marker.active { background: #8B7355; transform: scale(1.4); }

    .map-popup {
      position: absolute; left: 68px; bottom: 28px; z-index: 5;
      width: 260px; background: #fff; border: 0.5px solid var(--grey-3);
      box-shadow: 0 8px 32px rgba(0,0,0,0.10);
    }
    .map-popup-img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; }
    .map-popup-body { padding: 16px 18px 18px; }
    .map-popup-location { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--grey-1); margin-bottom: 6px; }
    .map-popup-name { font-family: var(--serif); font-size: 19px; line-height: 1.2; margin-bottom: 12px; }
    .map-popup-link { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; border-bottom: 1px solid var(--black); padding-bottom: 2px; }
    .map-popup-close {
      position: absolute; top: 10px; right: 10px; width: 26px; height: 26px;
      background: rgba(255,255,255,0.9); border: none; border-radius: 50%;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
    }

    @media (max-width: 768px) {
      .dir-map-wrap { padding: 0 24px; margin-bottom: 44px; }
      .dir-map { height: 300px; }
      .map-popup { left: 44px; right: 44px; width: auto; }
    }
  </style>
  <script async defer src="https://www.googletagmanager.com/gtag/js?id=G-B930Z6F96Z"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-B930Z6F96Z');
  </script>
</head>
<body>

    ${nav()}

  <div class="page-header">
    <h1 class="page-subline" id="dir-sub">Modern vacation homes, rooted in nature.</h1>
  </div>

  <div class="dir-map-wrap">
    <div class="dir-map" id="dir-map"></div>
    <div class="map-popup" id="map-popup" style="display:none;">
      <img class="map-popup-img" id="map-popup-img" src="" alt="" loading="lazy" />
      <div class="map-popup-body">
        <p class="map-popup-location" id="map-popup-location"></p>
        <p class="map-popup-name" id="map-popup-name"></p>
        <a class="map-popup-link" id="map-popup-link" href="#">View property</a>
      </div>
      <button class="map-popup-close" onclick="document.getElementById('map-popup').style.display='none'">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1l12 12M13 1L1 13" stroke="#888" stroke-width="1" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>

  <div class="dir-body">
    <div class="dir-sidebar">
      <button class="filter-btn active" onclick="setFilter('all', this); if(locationQuery) clearSearch();">All locations</button>
      <button class="filter-btn" onclick="setFilter('Alps', this)">Alps</button>
      <button class="filter-btn" onclick="setFilter('Spain', this)">Spain</button>
      <button class="filter-btn" onclick="setFilter('Portugal', this)">Portugal</button>
      <button class="filter-btn" onclick="setFilter('Italy', this)">Italy</button>
      <button class="filter-btn" onclick="setFilter('France', this)">France</button>
      <button class="filter-btn" onclick="setFilter('Greece', this)">Greece</button>
      <button class="filter-btn" onclick="setFilter('Croatia', this)">Croatia</button>
      <button class="filter-btn" onclick="setFilter('Germany', this)">Germany</button>
    </div>
    <div class="dir-main">
      <div class="property-grid" id="property-grid">
        ${gridContent}
      </div>
    </div>
  </div>

  <div id="pagination" style="display:none;text-align:center;padding:56px 0 80px;">
    <div id="pagination-inner" style="display:inline-flex;align-items:center;gap:8px;"></div>
  </div>

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

  <script>
    var activeFilter = 'all';
    var locationQuery = ${JSON.stringify(locationQuery)};
    var PAGE_SIZE = 12;
    var currentPage = 0;
    var currentFiltered = [];

    function clearSearch() {
      window.location.href = '/directory';
    }

    function goToLocation(location) {
      if (!location) return;
      window.location.href = '/directory?location=' + encodeURIComponent(location);
    }

    var sublines = [
      'Modern vacation homes, rooted in nature.',
      'Handpicked architectural homes across Europe.',
      'Try second home locations before you buy.'
    ];
    var subIndex = 0;
    var subEl = document.getElementById('dir-sub');
    if (subEl) {
      setInterval(function() {
        subEl.style.opacity = '0';
        setTimeout(function() {
          subIndex = (subIndex + 1) % sublines.length;
          subEl.textContent = sublines[subIndex];
          subEl.style.opacity = '1';
        }, 400);
      }, 4000);
    }

    var searchInput = document.getElementById('dir-search');
    var searchDropdown = document.getElementById('dir-dropdown');

    if (searchInput && searchDropdown) {
      searchInput.addEventListener('focus', function() {
        if (!locationQuery) searchDropdown.classList.add('open');
      });
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && searchInput.value.trim()) {
          goToLocation(searchInput.value.trim());
        }
      });
      document.addEventListener('click', function(e) {
        if (!e.target.closest('.dir-search-wrap')) {
          searchDropdown.classList.remove('open');
        }
      });
    }

    function setFilter(filter, btn) {
      activeFilter = filter;
      document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      applyFilter();
    }

    function applyFilter() {
      var allCards = Array.from(document.querySelectorAll('.card-link'));
      var filtered = [];
      allCards.forEach(function(card) {
        var country = card.getAttribute('data-country') || '';
        var region = card.getAttribute('data-region') || '';
        var match = false;
        if (activeFilter === 'all') {
          match = true;
        } else {
          var f = activeFilter.toLowerCase();
          match = country === f || region === f || country.indexOf(f) !== -1 || region.indexOf(f) !== -1;
        }
        if (match) filtered.push(card);
      });
      allCards.forEach(function(card) { card.classList.add('card-hidden'); });
      filtered.forEach(function(card, i) {
        card.setAttribute('data-page', Math.floor(i / PAGE_SIZE));
      });
      currentFiltered = filtered;
      currentPage = 0;
      filtered.forEach(function(card, i) {
        if (Math.floor(i / PAGE_SIZE) === 0) card.classList.remove('card-hidden');
      });
      var existing = document.querySelector('.no-results');
      if (filtered.length === 0) {
        if (!existing) {
          var div = document.createElement('div');
          div.className = 'no-results';
          div.innerHTML = '<p>No properties found.</p>';
          document.getElementById('property-grid').appendChild(div);
        }
      } else if (existing) {
        existing.remove();
      }
      updateLoadMore();
    }

    function updateLoadMore() {
      var pagination = document.getElementById('pagination');
      var inner = document.getElementById('pagination-inner');
      var totalPages = Math.ceil(currentFiltered.length / PAGE_SIZE);
      if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
      }
      pagination.style.display = 'block';
      inner.innerHTML = '';
      var prev = document.createElement('button');
      prev.className = 'page-btn arrow';
      prev.innerHTML = '&#8592;';
      prev.disabled = currentPage === 0;
      prev.style.opacity = currentPage === 0 ? '0.3' : '1';
      prev.onclick = function() { goToPage(currentPage - 1); };
      inner.appendChild(prev);
      for (var p = 0; p < totalPages; p++) {
        (function(pageNum) {
          var btn = document.createElement('button');
          btn.className = 'page-btn' + (pageNum === currentPage ? ' active' : '');
          btn.textContent = pageNum + 1;
          btn.onclick = function() { goToPage(pageNum); };
          inner.appendChild(btn);
        })(p);
      }
      var next = document.createElement('button');
      next.className = 'page-btn arrow';
      next.innerHTML = '&#8594;';
      next.disabled = currentPage >= totalPages - 1;
      next.style.opacity = currentPage >= totalPages - 1 ? '0.3' : '1';
      next.onclick = function() { goToPage(currentPage + 1); };
      inner.appendChild(next);
    }

    function goToPage(pageNum) {
      currentPage = pageNum;
      currentFiltered.forEach(function(card, i) {
        var p = Math.floor(i / PAGE_SIZE);
        if (p === pageNum) {
          card.classList.remove('card-hidden');
        } else {
          card.classList.add('card-hidden');
        }
      });
      updateLoadMore();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    currentFiltered = Array.from(document.querySelectorAll('.card-link'));
    updateLoadMore();

    // ---- Directory map ----
    var MAPBOX_TOKEN = 'pk.eyJ1IjoibHVrZXJ5YSIsImEiOiJjbG96cmZ3OTMwMHRyMmlzNHc1bTZkZzI4In0.8Pmo8eeUh48QHBpzqHwNuQ';
    var MAPBOX_STYLE = 'mapbox://styles/lukerya/cmoime20s006m01r68jvia13j';
    var mapboxLoadPromise = null;

    function loadMapbox() {
      if (mapboxLoadPromise) return mapboxLoadPromise;
      mapboxLoadPromise = new Promise(function (resolve) {
        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css';
        document.head.appendChild(css);
        var script = document.createElement('script');
        script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js';
        script.onload = function () { resolve(); };
        document.head.appendChild(script);
      });
      return mapboxLoadPromise;
    }

    function mapImage(url, width) {
      if (!url) return '';
      if (url.indexOf('res.cloudinary.com') > -1 && url.indexOf('/upload/') > -1) {
        return url.replace('/upload/', '/upload/f_auto,q_auto,w_' + width + '/');
      }
      return url;
    }

    async function initDirectoryMap() {
      var container = document.getElementById('dir-map');
      if (!container) return;
      try {
        var res = await fetch('/api/properties?all=true');
        var data = await res.json();
        var records = (data.records || []).filter(function (r) {
          return r.fields['Latitude'] && r.fields['Longitude'] && r.fields['Name'];
        });
        if (!records.length) { container.parentElement.style.display = 'none'; return; }

        await loadMapbox();
        mapboxgl.accessToken = MAPBOX_TOKEN;
        var map = new mapboxgl.Map({
          container: 'dir-map',
          style: MAPBOX_STYLE,
          center: [8, 45],
          zoom: 3.4,
          attributionControl: false
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

        map.on('load', function () {
          records.forEach(function (r) {
            var f = r.fields;
            var el = document.createElement('div');
            el.className = 'sc-marker';
            el.addEventListener('click', function (ev) {
              ev.stopPropagation();
              document.querySelectorAll('.sc-marker').forEach(function (m) { m.classList.remove('active'); });
              el.classList.add('active');
              var imgUrl = f['Hero Image'] || '';
              var popupImg = document.getElementById('map-popup-img');
              if (imgUrl) { popupImg.src = mapImage(imgUrl, 600); popupImg.style.display = 'block'; }
              else { popupImg.style.display = 'none'; }
              document.getElementById('map-popup-location').textContent = (f['Location label'] || f['Region'] || f['Country'] || '').toUpperCase();
              document.getElementById('map-popup-name').textContent = f['Name'] || '';
              document.getElementById('map-popup-link').href = '/properties/' + (f['Slug'] || '');
              document.getElementById('map-popup').style.display = 'block';
              map.flyTo({ center: [parseFloat(f['Longitude']), parseFloat(f['Latitude'])], zoom: 7, duration: 1000 });
            });
            new mapboxgl.Marker({ element: el })
              .setLngLat([parseFloat(f['Longitude']), parseFloat(f['Latitude'])])
              .addTo(map);
          });
        });
      } catch (e) { console.error('Directory map error:', e); }
    }

    initDirectoryMap();

  </script>

</body>
</html>`;

  res.status(200).send(html);
};
