const AIRTABLE_TOKEN = 'patgpNhgfFkQsyQj9.887202d16495ba49fad025cb888cef3eac0a6c34058675dd2516127ad083d8c6';
const BASE_ID = 'appndrnWrdlgxRJAG';

// In-memory cache (persists for the lifetime of a warm function instance)
// Keyed by slug. Each entry: { data: record, expiresAt: timestamp }
const CACHE = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(slug) {
  const entry = CACHE.get(slug);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    CACHE.delete(slug);
    return null;
  }
  return entry.data;
}

function setCached(slug, data) {
  // Only cache successful, non-empty responses
  if (!data) return;
  CACHE.set(slug, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

module.exports = async function handler(req, res) {
  const { slug } = req.query;
  if (!slug) return res.status(400).send('Missing slug');

  let record = getCached(slug);

  if (!record) {
    const formula = encodeURIComponent(`{Slug} = "${slug}"`);
    const url = `https://api.airtable.com/v0/${BASE_ID}/Properties?filterByFormula=${formula}&maxRecords=1`;

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) {
        // Don't cache failures
        return res.status(500).send('Error fetching property');
      }
      const data = await response.json();
      record = data.records && data.records[0];
    } catch(e) {
      return res.status(500).send('Error fetching property');
    }

    if (!record) return res.status(404).send('Property not found');

    // Cache the successful fetch
    setCached(slug, record);
  }

  const f = record.fields;
  const name = (f['Name'] || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const location = f['Location label'] || '';
  const description = (f['Description'] || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const architect = f['Architect'] || '';
  const heroImage = f['Hero Image'] || (f['Images'] && f['Images'][0] && f['Images'][0].url) || '';
  const bookingUrl = f['Booking URL'] || '#';
  const country = f['Country'] || '';
  const region = f['Region'] || '';
  const editorialTitle = f['Editorial Title'] || '';
  const introOne = f['Intro One'] || '';
  const introTwo = f['Intro Two'] || '';
  const architectFeature = f['Architect Feature'] || '';
  const localFavourites = f['Local Favourites'] || '';
  const galleryImagesRaw = f['Gallery Images'] || '';

  const town = f['Town'] || '';
  const latitude = f['Latitude'] || '';
  const longitude = f['Longitude'] || '';
  const sleeps = f['Sleeps'] || '';
  const architectUrl = f['Architect URL'] || '';

  const galleryImages = galleryImagesRaw
    .split('\n')
    .map(u => u.trim())
    .filter(Boolean);

  const attachmentImages = (f['Images'] || []).map(img =>
    (img.thumbnails && img.thumbnails.full) ? img.thumbnails.full.url : img.url
  );
  const images = galleryImages.length ? galleryImages : attachmentImages;

  const title = `${name} — ${location} | Slow Casa`;
  const metaDesc = description ? description.substring(0, 155) : `${name} is a design-first vacation home in ${location}. Discover it on Slow Casa — curated architect-designed homes in ${country}.`;
  const canonicalUrl = `https://slowcasa.com/properties/${slug}`;

  // Build JSON-LD structured data
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    "name": f['Name'] || '',
    "description": f['Description'] || '',
    "url": canonicalUrl,
    "address": {
      "@type": "PostalAddress",
      "addressCountry": country
    }
  };

  if (town) structuredData.address.addressLocality = town;
  if (region) structuredData.address.addressRegion = region;

  if (latitude && longitude) {
    structuredData.geo = {
      "@type": "GeoCoordinates",
      "latitude": parseFloat(latitude),
      "longitude": parseFloat(longitude)
    };
  }

  if (sleeps) {
    const sleepsNum = parseInt(sleeps);
    if (!isNaN(sleepsNum)) structuredData.maximumAttendeeCapacity = sleepsNum;
  }

  if (images.length > 0) {
    structuredData.image = images.slice(0, 6);
  }

  if (architect) {
    structuredData.creator = {
      "@type": "Organization",
      "name": architect
    };
    if (architectUrl) {
      structuredData.creator.url = architectUrl;
    }
  }

  const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`;

  function buildGallery(imgs) {
    if (!imgs.length) return '';
    let html = '<div class="prop-gallery">';
    for (let i = 0; i < imgs.length; i += 2) {
      if (i + 1 < imgs.length) {
        html += `<div class="prop-gallery-row two-col">
          <div class="prop-gallery-img"><img src="${imgs[i]}" alt="${name}" loading="lazy" /></div>
          <div class="prop-gallery-img"><img src="${imgs[i+1]}" alt="${name}" loading="lazy" /></div>
        </div>`;
      } else {
        html += `<div class="prop-gallery-row one-col">
          <div class="prop-gallery-img"><img src="${imgs[i]}" alt="${name}" loading="lazy" /></div>
        </div>`;
      }
    }
    html += '</div>';
    return html;
  }

  function buildFavourites(favs) {
    if (!favs) return '';
    const lines = favs.split('\n').map(l => l.trim()).filter(Boolean);
    const grouped = {};
    lines.forEach(line => {
      const parts = line.split(' · ');
      if (parts.length < 3) return;
      const cat = parts[0].trim();
      const name = parts[1].trim();
      const url = parts[2].trim();
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ name, url });
    });
    if (!Object.keys(grouped).length) return '';
    let html = '<div class="prop-section prop-favs"><p class="prop-section-label">Local Favourites</p><div class="favs-grid">';
    Object.keys(grouped).forEach(cat => {
      html += `<div class="favs-group"><p class="favs-cat">${cat}</p>`;
      grouped[cat].forEach(item => {
        html += `<a href="${item.url}" target="_blank" rel="noopener" class="favs-link">${item.name}</a>`;
      });
      html += '</div>';
    });
    html += '</div></div>';
    return html;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${metaDesc}" />
  <link rel="canonical" href="${canonicalUrl}" />
  ${jsonLdScript}
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${metaDesc}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Slow Casa" />
  ${heroImage ? `<meta property="og:image" content="${heroImage}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${metaDesc}" />
  ${heroImage ? `<meta name="twitter:image" content="${heroImage}" />` : ''}
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
      position: absolute; top: 0; left: 0; right: 0;
      display: grid; grid-template-columns: 1fr auto 1fr;
      align-items: center; padding: 28px 48px;
      background: transparent; z-index: 10;
    }
    .wordmark { font-family: 'DM Serif Display', Georgia, serif; font-size: 28px; font-weight: 400; letter-spacing: 0.01em; text-align: center; color: #0f0f0f; }
    .nav-links { display: flex; gap: 32px; list-style: none; justify-content: flex-end; }
    .nav-links a { font-size: 13px; color: #0f0f0f; opacity: 0.7; letter-spacing: 0.03em; transition: opacity 0.2s; }
    .nav-links a:hover { opacity: 1; }

    .hero-split { display: grid; grid-template-columns: 1fr 1fr; min-height: 100vh; }
    .hero-left { position: relative; overflow: hidden; background: #e8e8e8; }
    .hero-left img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .hero-right {
      display: flex; flex-direction: column; justify-content: center;
      align-items: center; text-align: center;
      padding: 120px 64px 64px; background: #f9f7f2;
    }
    .hero-location { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #888; margin-bottom: 16px; }
    .hero-title { font-family: 'DM Serif Display', Georgia, serif; font-size: 72px; line-height: 0.95; letter-spacing: -0.02em; color: #0f0f0f; margin-bottom: 28px; }
    .hero-meta { font-size: 11px; color: #888; letter-spacing: 0.08em; }

    .prop-editorial { max-width: 680px; margin: 0 auto; padding: 96px 48px 0; text-align: center; }
    .prop-editorial-title {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: 32px; font-weight: 400; line-height: 1.2;
      color: #2a2a28; margin-bottom: 40px;
    }
    .prop-intro {
      font-family: 'TT Norms Pro', 'DM Sans', system-ui, sans-serif;
      font-size: 17px; font-weight: 300; line-height: 1.9;
      color: #444; margin-bottom: 24px;
    }

    .prop-gallery { padding: 80px 0 0; }
    .prop-gallery-row { display: grid; gap: 16px; margin-bottom: 32px; }
    .prop-gallery-row.two-col { grid-template-columns: 1fr 1fr; }
    .prop-gallery-row.one-col { grid-template-columns: 1fr; }
    .prop-gallery-img { overflow: hidden; background: #e8e8e8; aspect-ratio: 4/3; }
    .prop-gallery-img img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.5s ease; }
    .prop-gallery-img:hover img { transform: scale(1.02); }

    .prop-section { max-width: 680px; margin: 0 auto; padding: 64px 48px 0; }
    .prop-section-label {
      font-size: 11px; font-weight: 700; letter-spacing: 0.16em;
      text-transform: uppercase; color: #0f0f0f; margin-bottom: 28px;
    }
    .prop-feature-text {
      font-family: 'TT Norms Pro', 'DM Sans', system-ui, sans-serif;
      font-size: 17px; font-weight: 300; line-height: 1.85; color: #333;
    }
    .prop-feature-text p { margin-bottom: 1.4em; }

    .prop-favs { max-width: 680px; margin: 0 auto; padding: 64px 48px 0; }
    .favs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 32px; }
    .favs-group { display: flex; flex-direction: column; gap: 8px; }
    .favs-cat { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #888; margin-bottom: 4px; }
    .favs-link { font-family: 'TT Norms Pro', 'DM Sans', system-ui, sans-serif; font-size: 14px; font-weight: 300; color: #0f0f0f; border-bottom: 0.5px solid #e8e8e8; padding-bottom: 2px; transition: border-color 0.2s; display: inline-block; }
    .favs-link:hover { border-color: #0f0f0f; }

    .prop-cta { text-align: center; padding: 72px 48px 80px; }
    .prop-cta-btn {
      display: inline-block; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
      padding: 18px 64px; background: #0f0f0f; color: #f9f7f2; transition: opacity 0.2s;
    }
    .prop-cta-btn:hover { opacity: 0.75; }

    .related-section { max-width: 1200px; margin: 0 auto; padding: 0 48px 80px; border-top: 0.5px solid #e8e8e8; }
    .related-label { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #888; padding-top: 32px; margin-bottom: 32px; }
    .related-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
    .card-img { width: 100%; aspect-ratio: 4/3; overflow: hidden; margin-bottom: 12px; background: #e8e8e8; }
    .card-img img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.5s ease; }
    .card-img:hover img { transform: scale(1.03); }
    .card-location { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #888; margin-bottom: 4px; }
    .card-name { font-family: 'DM Serif Display', Georgia, serif; font-size: 16px; }

    .nl-popup {
      position: fixed; bottom: 40px; left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: #f9f7f2; padding: 28px 36px;
      display: flex; align-items: center; gap: 24px;
      z-index: 1000; opacity: 0;
      transition: opacity 0.4s ease, transform 0.4s ease;
      pointer-events: none; white-space: nowrap;
      max-width: calc(100vw - 48px);
      box-shadow: 0 8px 40px rgba(0,0,0,0.12);
    }
    .nl-popup.visible { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: all; }
    .nl-popup-text { font-family: 'TT Norms Pro', 'DM Sans', system-ui, sans-serif; font-size: 15px; font-weight: 300; color: #0f0f0f; flex-shrink: 0; }
    .nl-popup-input { font-size: 14px; padding: 11px 16px; border: 0.5px solid #e8e8e8; background: #fff; color: #0f0f0f; outline: none; width: 220px; transition: border-color 0.2s; }
    .nl-popup-input:focus { border-color: #0f0f0f; }
    .nl-popup-input::placeholder { color: #aaa; }
    .nl-popup-btn { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; padding: 11px 24px; background: #0f0f0f; color: #f9f7f2; border: none; cursor: pointer; transition: opacity 0.2s; flex-shrink: 0; }
    .nl-popup-btn:hover { opacity: 0.8; }
    .nl-popup-close { background: none; border: none; color: #aaa; cursor: pointer; font-size: 20px; padding: 0 0 0 8px; line-height: 1; transition: color 0.2s; flex-shrink: 0; }
    .nl-popup-close:hover { color: #0f0f0f; }

    footer { padding: 24px 48px; display: flex; justify-content: space-between; align-items: center; border-top: 0.5px solid #e8e8e8; }
    .footer-left { display: flex; align-items: center; gap: 32px; }
    .footer-copy { font-size: 12px; color: #888; }
    .footer-policy { font-size: 12px; color: #888; letter-spacing: 0.08em; text-transform: uppercase; transition: color 0.2s; }
    .footer-policy:hover { color: #0f0f0f; }
    .footer-links { display: flex; gap: 28px; }
    .footer-links a { font-size: 12px; color: #888; letter-spacing: 0.08em; text-transform: uppercase; transition: color 0.2s; }
    .footer-links a:hover { color: #0f0f0f; }

    @media (max-width: 900px) {
      .hero-split { grid-template-columns: 1fr; }
      .hero-left { min-height: 60vw; }
      .hero-right { padding: 64px 32px; }
      .hero-title { font-size: 38px; }
      nav { padding: 20px 24px; }
      .nav-links { display: none; }
      .prop-editorial { padding: 48px 24px 0; }
      .prop-section { padding: 48px 24px 0; }
      .prop-favs { padding: 48px 24px 0; }
      .prop-gallery-row.two-col { grid-template-columns: 1fr; }
      .related-grid { grid-template-columns: 1fr; }
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
      <li><a href="/journal">Journal</a></li>
      <li><a href="https://slowcasa.beehiiv.com/subscribe" target="_blank" rel="noopener">Newsletter</a></li>
      <li><a href="/criteria">About</a></li>
    </ul>
  </nav>

  <div class="hero-split">
    <div class="hero-left">
      ${heroImage ? `<img src="${heroImage}" alt="${name}, ${location}" />` : '<div style="width:100%;height:100%;background:#e8e8e8;"></div>'}
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

  ${(editorialTitle || introOne || introTwo) ? `
  <div class="prop-editorial">
    ${editorialTitle ? `<h2 class="prop-editorial-title">${editorialTitle}</h2>` : ''}
    ${introOne ? `<p class="prop-intro">${introOne}</p>` : ''}
    ${introTwo ? `<p class="prop-intro">${introTwo}</p>` : ''}
  </div>` : ''}

  ${images.length ? `<div style="padding: 0 24px;">${buildGallery(images)}</div>` : ''}

  ${architectFeature ? `
  <div class="prop-section">
    <p class="prop-section-label">The Architect</p>
    <div class="prop-feature-text">${architectFeature.split('\n\n').map(p => `<p>${p}</p>`).join('')}</div>
  </div>` : ''}

  ${buildFavourites(localFavourites)}

  <div class="prop-cta">
    <a href="${bookingUrl}" target="_blank" rel="noopener" class="prop-cta-btn">Book this property</a>
  </div>

  <div class="related-section" id="related-section" style="display:none;"
    data-region="${region.replace(/"/g, '&quot;')}"
    data-country="${country.replace(/"/g, '&quot;')}"
    data-slug="${slug}">
    <p class="related-label">More properties</p>
    <div class="related-grid" id="related-grid"></div>
  </div>

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

  <div class="nl-popup" id="nl-popup">
    <p class="nl-popup-text">One email every Thursday. New homes, slow places.</p>
    <input class="nl-popup-input" id="nl-popup-email" type="email" placeholder="your@email.com" />
    <button class="nl-popup-btn" onclick="handlePopupSubscribe()">Subscribe</button>
    <button class="nl-popup-close" onclick="dismissPopup()" aria-label="Close">&#215;</button>
  </div>

  <script>
    async function loadRelated() {
      try {
        var el = document.getElementById('related-section');
        var region = el.getAttribute('data-region');
        var country = el.getAttribute('data-country');
        var currentSlug = el.getAttribute('data-slug');
        var res = await fetch('/api/properties?all=true');
        var data = await res.json();
        var records = (data.records || []).filter(function(r) {
          return r.fields['Slug'] !== currentSlug &&
            (r.fields['Region'] === region || r.fields['Country'] === country);
        }).slice(0, 3);
        if (!records.length) return;
        var grid = document.getElementById('related-grid');
        grid.innerHTML = records.map(function(r) {
          var rf = r.fields;
          var img = rf['Hero Image'];
          var rslug = rf['Slug'];
          var rurl = rslug ? '/properties/' + rslug : '#';
          return '<a href="' + rurl + '" style="text-decoration:none;color:inherit;">' +
            '<div><div class="card-img">' + (img ? '<img src="' + img + '" alt="' + (rf['Name']||'') + '" loading="lazy" />' : '') + '</div>' +
            '<p class="card-location">' + (rf['Location label']||'') + '</p>' +
            '<p class="card-name">' + (rf['Name']||'') + '</p></div>' +
          '</a>';
        }).join('');
        el.style.display = 'block';
      } catch(e) {}
    }
    loadRelated();

    (function() {
      if (localStorage.getItem('sc_nl_dismissed')) return;
      setTimeout(function() {
        var popup = document.getElementById('nl-popup');
        if (popup) popup.classList.add('visible');
      }, 10000);
    })();

    function dismissPopup() {
      var popup = document.getElementById('nl-popup');
      if (popup) { popup.classList.remove('visible'); setTimeout(function() { popup.style.display = 'none'; }, 400); }
      localStorage.setItem('sc_nl_dismissed', '1');
    }

    async function handlePopupSubscribe() {
      var input = document.getElementById('nl-popup-email');
      var btn = document.querySelector('.nl-popup-btn');
      var email = input.value;
      if (!email || !email.includes('@')) { input.focus(); return; }
      btn.textContent = 'Subscribing...';
      btn.disabled = true;
      try {
        var res = await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) });
        if (res.ok) {
          document.getElementById('nl-popup').innerHTML = "<p class=\"nl-popup-text\">You're in. See you Thursday.</p><button class=\"nl-popup-close\" onclick=\"dismissPopup()\">&#215;</button>";
          setTimeout(dismissPopup, 3000);
          localStorage.setItem('sc_nl_dismissed', '1');
        } else { btn.textContent = 'Subscribe'; btn.disabled = false; }
      } catch(e) { btn.textContent = 'Subscribe'; btn.disabled = false; }
    }
  </script>

</body>
</html>`;

  res.status(200).send(html);
};
