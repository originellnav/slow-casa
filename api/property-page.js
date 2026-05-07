const AIRTABLE_TOKEN = 'patgpNhgfFkQsyQj9.887202d16495ba49fad025cb888cef3eac0a6c34058675dd2516127ad083d8c6';
const BASE_ID = 'appndrnWrdlgxRJAG';

module.exports = async function handler(req, res) {
  const { slug } = req.query;
  if (!slug) return res.status(400).send('Missing slug');

  const formula = encodeURIComponent(`{Slug} = "${slug}"`);
  const url = `https://api.airtable.com/v0/${BASE_ID}/Properties?filterByFormula=${formula}&maxRecords=1`;

  let record;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        'Cache-Control': 'no-cache'
      }
    });
    const data = await response.json();
    record = data.records && data.records[0];
  } catch(e) {
    return res.status(500).send('Error fetching property');
  }

  if (!record) return res.status(404).send('Property not found');

  const f = record.fields;
  const name = (f['Name'] || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const location = f['Location label'] || '';
  const description = (f['Description'] || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const architect = f['Architect'] || '';
  const heroImage = f['Hero Image'] || (f['Images'] && f['Images'][0] && f['Images'][0].url) || '';
  const bookingUrl = f['Booking URL'] || '#';
  const region = f['Region'] || f['Country'] || '';
  const country = f['Country'] || '';

  const title = `${name} — ${location} | Slow Casa`;
  const metaDesc = description ? description.substring(0, 155) : `${name} is a design-first vacation home in ${location}. Discover it on Slow Casa — curated architect-designed homes in ${country}.`;
  const canonicalUrl = `https://slowcasa.com/properties/${slug}`;

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

  <!-- Open Graph -->
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${metaDesc}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Slow Casa" />
  ${heroImage ? `<meta property="og:image" content="${heroImage}" />` : ''}
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${metaDesc}" />
  ${heroImage ? `<meta name="twitter:image" content="${heroImage}" />` : ''}

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/slow-casa.css" />

  <!-- Google Analytics -->
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
    html, body { background: #f9f7f2; }

    nav {
      position: absolute;
      top: 0; left: 0; right: 0;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      padding: 28px 48px;
      background: transparent;
      z-index: 10;
    }
    .wordmark { font-family: 'DM Serif Display', Georgia, serif; font-size: 28px; font-weight: 400; letter-spacing: 0.01em; text-align: center; color: var(--black); text-transform: none; }
    .nav-links { display: flex; gap: 32px; list-style: none; justify-content: flex-end; }
    .nav-links a { font-size: 13px; color: var(--black); opacity: 0.7; letter-spacing: 0.03em; transition: opacity 0.2s; }
    .nav-links a:hover { opacity: 1; }

    .hero-split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      min-height: 100vh;
      position: relative;
    }
    .hero-left { position: relative; overflow: hidden; background: #e8e8e8; }
    .hero-left img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
    .hero-skeleton { width: 100%; height: 100%; background: #e8e8e8; }
    .hero-more-photos {
      position: absolute; bottom: 20px; left: 20px;
      font-family: 'DM Sans', system-ui, sans-serif; font-size: 10px;
      letter-spacing: 0.12em; text-transform: uppercase;
      padding: 10px 20px; background: rgba(249,247,242,0.9);
      border: none; color: #0f0f0f; cursor: pointer; z-index: 10;
    }
    .hero-right {
      display: flex; flex-direction: column;
      justify-content: center; align-items: center;
      text-align: center; padding: 120px 64px 64px;
      background: #f9f7f2;
    }
    .hero-tag { font-family: 'DM Sans', system-ui, sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: #888888; margin-bottom: 20px; }
    .hero-location { font-family: 'DM Sans', system-ui, sans-serif; font-size: 13px; font-weight: 300; letter-spacing: 0.2em; text-transform: uppercase; color: #0f0f0f; margin-bottom: 12px; }
    .hero-title { font-family: 'DM Serif Display', Georgia, serif; font-size: 56px; font-weight: 400; line-height: 1.0; letter-spacing: -0.01em; color: #0f0f0f; margin-bottom: 24px; }
    .hero-desc { font-family: 'TT Norms Pro', 'DM Sans', system-ui, sans-serif; font-size: 16px; font-weight: 300; line-height: 1.75; color: #0f0f0f; max-width: 360px; margin-bottom: 40px; }
    .hero-architect { font-family: 'DM Sans', system-ui, sans-serif; font-size: 11px; font-weight: 300; letter-spacing: 0.1em; color: #888888; margin-bottom: 40px; }
    .hero-cta {
      display: inline-block; font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
      padding: 15px 40px; border: 0.5px solid #0f0f0f;
      background: transparent; color: #0f0f0f; cursor: pointer;
      transition: background 0.2s, color 0.2s; text-decoration: none;
    }
    .hero-cta:hover { background: #0f0f0f; color: #f9f7f2; }

    .content { max-width: 900px; margin: 0 auto; padding: 64px 64px 0; }
    .description-section { padding: 24px 0; }
    .description-section:first-child { padding-top: 0; }
    .section-heading {
      font-family: 'TT Norms Pro', 'DM Sans', system-ui, sans-serif;
      font-size: 11px; font-weight: 700; letter-spacing: 0.16em;
      text-transform: uppercase; color: #0f0f0f; margin: 1.2em 0 0.6em;
    }
    .description p { font-family: 'TT Norms Pro', 'DM Sans', system-ui, sans-serif; font-size: 17px; font-weight: 300; line-height: 1.9; color: #0f0f0f; margin-bottom: 1.5em; }
    .description h2 { font-family: 'TT Norms Pro', 'DM Sans', system-ui, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #0f0f0f; margin: 2em 0 0.8em; }
    .description a { color: #0f0f0f; border-bottom: 0.5px solid #0f0f0f; }

    .favs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 32px; margin-top: 16px; }
    .favs-group { display: flex; flex-direction: column; gap: 8px; }
    .favs-cat { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #888888; margin-bottom: 4px; }
    .favs-link { font-family: 'TT Norms Pro', 'DM Sans', system-ui, sans-serif; font-size: 14px; font-weight: 300; color: #0f0f0f; border-bottom: 0.5px solid #e8e8e8; padding-bottom: 2px; transition: border-color 0.2s; text-decoration: none; display: inline-block; }
    .favs-link:hover { border-color: #0f0f0f; }

    .description-cta { padding: 40px 0 16px; text-align: center; }
    .description-cta-btn { display: inline-block; font-family: 'DM Sans', system-ui, sans-serif; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; padding: 18px 64px; background: #0f0f0f; color: #f9f7f2; text-decoration: none; transition: opacity 0.2s; }
    .description-cta-btn:hover { opacity: 0.75; }

    .gallery { padding: 40px 0; }
    .gallery-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .gallery-item { aspect-ratio: 1; overflow: hidden; cursor: pointer; }
    .gallery-item img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.4s; }
    .gallery-item:hover img { transform: scale(1.04); }

    .lightbox { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.92); z-index: 999; justify-content: center; align-items: center; }
    .lightbox.open { display: flex; }
    .lightbox img { max-width: 90vw; max-height: 90vh; object-fit: contain; }
    .lightbox-close { position: absolute; top: 24px; right: 32px; font-size: 28px; color: #fff; cursor: pointer; background: none; border: none; line-height: 1; }
    .lightbox-prev, .lightbox-next { position: absolute; top: 50%; transform: translateY(-50%); font-size: 28px; color: #fff; cursor: pointer; background: none; border: none; padding: 16px; }
    .lightbox-prev { left: 16px; }
    .lightbox-next { right: 16px; }

    .related-section { max-width: 1200px; margin: 0 auto; padding: 0 48px 80px; }
    .related-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
    .related-label { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #888888; padding-top: 20px; margin-bottom: 32px; }
    .card-img { width: 100%; aspect-ratio: 4/3; overflow: hidden; margin-bottom: 16px; background: #f5f5f3; position: relative; }
    .card-img img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.5s ease; }
    .card-img:hover img { transform: scale(1.03); }
    .card-location { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #888888; margin-bottom: 6px; }
    .card-name { font-size: 15px; font-weight: 500; margin-bottom: 4px; line-height: 1.3; }

    .nl-popup {
      position: fixed; bottom: 40px; left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: #f9f7f2; color: #0f0f0f;
      padding: 28px 36px; display: flex; align-items: center;
      gap: 24px; z-index: 1000; opacity: 0;
      transition: opacity 0.4s ease, transform 0.4s ease;
      pointer-events: none; white-space: nowrap;
      max-width: calc(100vw - 48px);
      box-shadow: 0 8px 40px rgba(0,0,0,0.12);
    }
    .nl-popup.visible { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: all; }
    .nl-popup-text { font-family: 'TT Norms Pro', 'DM Sans', system-ui, sans-serif; font-size: 15px; font-weight: 300; letter-spacing: 0.02em; color: #0f0f0f; flex-shrink: 0; }
    .nl-popup-input { font-family: 'DM Sans', system-ui, sans-serif; font-size: 14px; padding: 11px 16px; border: 0.5px solid #e8e8e8; background: #ffffff; color: #0f0f0f; outline: none; width: 220px; transition: border-color 0.2s; }
    .nl-popup-input::placeholder { color: #aaaaaa; }
    .nl-popup-input:focus { border-color: #0f0f0f; }
    .nl-popup-btn { font-family: 'DM Sans', system-ui, sans-serif; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; padding: 11px 24px; background: #0f0f0f; color: #f9f7f2; border: none; cursor: pointer; transition: opacity 0.2s; white-space: nowrap; flex-shrink: 0; }
    .nl-popup-btn:hover { opacity: 0.8; }
    .nl-popup-close { background: none; border: none; color: #aaaaaa; cursor: pointer; font-size: 20px; padding: 0 0 0 8px; line-height: 1; transition: color 0.2s; flex-shrink: 0; }
    .nl-popup-close:hover { color: #0f0f0f; }

    .loading { text-align: center; padding: 48px; font-size: 13px; color: #888888; letter-spacing: 0.06em; }
    .skeleton { background: #e8e8e8; animation: pulse 1.5s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
    .fade-in { opacity: 0; transform: translateY(12px); animation: fadeIn 0.6s ease forwards; }
    @keyframes fadeIn { to { opacity: 1; transform: translateY(0); } }

    footer {
      padding: 24px 48px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 0.5px solid #e8e8e8;
      margin-top: 40px;
    }
    .footer-left { display: flex; align-items: center; gap: 32px; }
    .footer-copy { font-family: 'DM Sans', system-ui, sans-serif; font-size: 12px; color: #888888; letter-spacing: 0.02em; }
    .footer-policy { font-family: 'DM Sans', system-ui, sans-serif; font-size: 12px; color: #888888; letter-spacing: 0.08em; text-transform: uppercase; transition: color 0.2s; text-decoration: none; }
    .footer-policy:hover { color: #0f0f0f; }
    .footer-links { display: flex; gap: 28px; }
    .footer-links a { font-family: 'DM Sans', system-ui, sans-serif; font-size: 12px; color: #888888; letter-spacing: 0.08em; text-transform: uppercase; transition: color 0.2s; text-decoration: none; }
    .footer-links a:hover { color: #0f0f0f; }

    @media (max-width: 900px) {
      .hero-split { grid-template-columns: 1fr; }
      .hero-left { min-height: 60vw; }
      .hero-right { padding: 64px 32px; }
      .hero-title { font-size: 40px; }
      .content { padding: 48px 32px 0; }
      .gallery-grid { grid-template-columns: repeat(2, 1fr); }
      .related-grid { grid-template-columns: 1fr; }
      nav { padding: 20px 24px; }
      .nav-links { display: none; }
      footer { padding: 24px; flex-direction: column; gap: 16px; text-align: center; }
      .footer-left { flex-direction: column; gap: 12px; }
      .footer-links { flex-wrap: wrap; justify-content: center; gap: 16px; }
    }
  </style>
</head>
<body>

  <h1 style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;">${name} — ${location}</h1>

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

  <div id="app">
    <div class="hero-split">
      <div class="hero-left">
        ${heroImage ? `<img src="${heroImage}" alt="${name}, ${location}" />` : '<div class="hero-skeleton"></div>'}
      </div>
      <div class="hero-right">
        <p class="hero-location">${location}</p>
        <h1 class="hero-title">${name}</h1>
        ${description ? `<p class="hero-desc">${description}</p>` : ''}
        ${architect ? `<p class="hero-architect">Architecture by ${architect}</p>` : ''}
        <a href="${bookingUrl}" target="_blank" rel="noopener" class="hero-cta">Book this property</a>
      </div>
    </div>
  </div>

  <div id="related-section" style="display:none;">
    <div class="related-section">
      <p class="related-label">More properties</p>
      <div class="related-grid" id="related-grid"></div>
    </div>
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

  <div class="lightbox" id="lightbox">
    <button class="lightbox-close" onclick="closeLightbox()">&#215;</button>
    <button class="lightbox-prev" onclick="prevImage()">&#8592;</button>
    <img id="lightbox-img" src="" alt="" />
    <button class="lightbox-next" onclick="nextImage()">&#8594;</button>
  </div>

  <script>
    var PROPERTY_SLUG = '${slug}';
    var PROPERTY_DATA = ${JSON.stringify(record)};
  </script>

  <script>
    var f = PROPERTY_DATA.fields;
    var RECORD_ID = PROPERTY_DATA.id;
    var images = [];
    var currentLightboxIndex = 0;

    function getImageUrl(record, index) {
      index = index || 0;
      var heroImg = record.fields && record.fields['Hero Image'];
      if (index === 0 && heroImg) return heroImg;
      var imgs = record.fields['Images'];
      if (imgs && imgs.length > index) {
        if (imgs[index].thumbnails && imgs[index].thumbnails.full) return imgs[index].thumbnails.full.url;
        return imgs[index].url;
      }
      return null;
    }

    function renderSections(f, galleryHtml, bookingUrl) {
      var html = '';

      function renderTextSection(key, label) {
        var text = f[key];
        if (!text) return '';
        var s = '<div class="description-section">';
        s += '<p class="section-heading">' + label + '</p>';
        var paras = text.split('\\n\\n');
        paras.forEach(function(para) {
          para = para.trim();
          if (para) s += '<p>' + para + '</p>';
        });
        s += '</div>';
        return s;
      }

      html += renderTextSection('The Story', 'The Story');
      html += renderTextSection('The Surroundings', 'The Surroundings');
      if (galleryHtml) html += galleryHtml;
      html += renderTextSection('The Space', 'The Space');
      html += renderTextSection('Who is it for?', 'Who is it for');

      var favs = f['Local Favourites'];
      if (favs) {
       var lines = favs.split('\\n').map(function(l) { return l.trim(); }).filter(Boolean);
        var grouped = {};
        lines.forEach(function(line) {
          var parts = line.split(' · ');
          if (parts.length < 3) return;
          var cat = parts[0].trim();
          var name = parts[1].trim();
          var url = parts[2].trim();
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push({ name: name, url: url });
        });
        if (Object.keys(grouped).length) {
          html += '<div class="description-section local-favs">';
          html += '<p class="section-heading">Local Favourites</p>';
          html += '<div class="favs-grid">';
          Object.keys(grouped).forEach(function(cat) {
            html += '<div class="favs-group">';
            html += '<p class="favs-cat">' + cat + '</p>';
            grouped[cat].forEach(function(item) {
              html += '<a href="' + item.url + '" target="_blank" rel="noopener" class="favs-link">' + item.name + '</a>';
            });
            html += '</div>';
          });
          html += '</div></div>';
        }
      }

      if (bookingUrl) {
        html += '<div class="description-cta">';
        html += '<a href="' + bookingUrl + '" target="_blank" rel="noopener" class="description-cta-btn">Book this property</a>';
        html += '</div>';
      }

      if (!html || html.trim() === '') {
        var bodyText = f['Full description'] || '';
        if (bodyText) {
          html = '<div class="description-section"><p>' + bodyText + '</p></div>';
        }
      }

      return html;
    }

    function renderGallery(imgs) {
      if (!imgs || !imgs.length) return '';
      return '<div class="gallery"><div class="gallery-grid">' +
        imgs.slice(0, 8).map(function(img, i) {
          return '<div class="gallery-item" onclick="openLightbox(' + i + ')">' +
            '<img src="' + img + '" alt="Property photo" loading="lazy" />' +
            '</div>';
        }).join('') +
        '</div></div>';
    }

    function openLightbox(index) {
      currentLightboxIndex = index;
      document.getElementById('lightbox-img').src = images[index];
      document.getElementById('lightbox').classList.add('open');
    }
    function closeLightbox() { document.getElementById('lightbox').classList.remove('open'); }
    function prevImage() { currentLightboxIndex = (currentLightboxIndex - 1 + images.length) % images.length; document.getElementById('lightbox-img').src = images[currentLightboxIndex]; }
    function nextImage() { currentLightboxIndex = (currentLightboxIndex + 1) % images.length; document.getElementById('lightbox-img').src = images[currentLightboxIndex]; }
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeLightbox(); if (e.key === 'ArrowLeft') prevImage(); if (e.key === 'ArrowRight') nextImage(); });

    function renderProperty() {
      var heroImage = f['Hero Image'] || getImageUrl(PROPERTY_DATA, 0);
      var allImages = f['Images'] || [];

      images = [];
      if (f['Hero Image']) images.push(f['Hero Image']);
      allImages.forEach(function(img) {
        var url = (img.thumbnails && img.thumbnails.full) ? img.thumbnails.full.url : img.url;
        if (url && images.indexOf(url) === -1) images.push(url);
      });

      var galleryImages = images.slice(1, 9);
      var bookingUrl = f['Booking URL'] || '#';
      var tag = (f['Tags'] && f['Tags'].length) ? f['Tags'][0] : '';
      var location = f['Location label'] || '';
      var name = f['Name'] || '';
      var description = f['Description'] || '';
      var architect = f['Architect'] || '';
      var slug = f['Slug'] || '';

      document.getElementById('app').innerHTML =
        '<div class="hero-split">' +
          '<div class="hero-left">' +
            (heroImage ? '<img src="' + heroImage + '" alt="' + name + ', ' + location + '" />' : '<div class="hero-skeleton"></div>') +
            (images.length > 1 ? '<button class="hero-more-photos" onclick="openLightbox(0)">' + images.length + ' photos</button>' : '') +
          '</div>' +
          '<div class="hero-right">' +
            (tag ? '<p class="hero-tag">' + tag + '</p>' : '') +
            (location ? '<p class="hero-location">' + location + '</p>' : '') +
            '<h1 class="hero-title">' + name + '</h1>' +
            (description ? '<p class="hero-desc">' + description + '</p>' : '') +
            (architect ? '<p class="hero-architect">Architecture by ' + architect + '</p>' : '') +
            '<a href="' + bookingUrl + '" target="_blank" rel="noopener" class="hero-cta">Book this property</a>' +
          '</div>' +
        '</div>' +
        '<div class="content">' +
          '<div class="description">' + renderSections(f, renderGallery(galleryImages), bookingUrl) + '</div>' +
        '</div>';

      loadRelated(f['Region'] || f['Country'] || '', slug);
    }

    async function loadRelated(region, currentSlug) {
      try {
        var res = await fetch('/api/properties?all=true');
        var data = await res.json();
        var records = (data.records || []).filter(function(r) {
          return r.fields['Slug'] !== currentSlug &&
                 (r.fields['Region'] === region || r.fields['Country'] === region) &&
                 r.fields['Images'] && r.fields['Images'].length;
        }).slice(0, 3);

        if (!records.length) return;

        var grid = document.getElementById('related-grid');
        grid.innerHTML = records.map(function(r) {
          var rf = r.fields;
          var img = rf['Hero Image'] || (rf['Images'] && rf['Images'][0] && rf['Images'][0].url);
          var rslug = rf['Slug'];
          var rurl = rslug ? '/properties/' + rslug : '#';
          return '<a href="' + rurl + '" style="text-decoration:none;color:inherit;">' +
            '<div class="property-card">' +
              '<div class="card-img">' + (img ? '<img src="' + img + '" alt="' + (rf['Name']||'') + '" loading="lazy" />' : '') + '</div>' +
              '<p class="card-location">' + (rf['Location label']||'') + '</p>' +
              '<p class="card-name">' + (rf['Name']||'') + '</p>' +
            '</div>' +
          '</a>';
        }).join('');

        document.getElementById('related-section').style.display = 'block';
      } catch(e) {}
    }

    renderProperty();

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
          document.getElementById('nl-popup').innerHTML = '<p class="nl-popup-text">You\u2019re in. See you Thursday.</p><button class="nl-popup-close" onclick="dismissPopup()">&#215;</button>';
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
