const SANITY_PROJECT_ID = 'hchp27po';
const SANITY_DATASET = 'production';
const SANITY_API_VERSION = '2024-01-01';

const INDEX_CACHE = { data: null, expiresAt: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000;

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanityImageUrl(url, width) {
  if (!url) return '';
  const separator = url.indexOf('?') >= 0 ? '&' : '?';
  return url + separator + 'w=' + width + '&auto=format&fit=max&q=80';
}

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) { return ''; }
}

function formatCategory(category) {
  const labels = {
  'architect-roundup': 'Architects',
  'typology-guide': 'House Types',
  'region-discovery': 'Places',
  'architectural-pilgrimage': 'Journeys'
};
  return labels[category] || 'Guide';
}

async function fetchAllGuides() {
  const query = `*[_type == "guide" && defined(publishedAt) && defined(slug.current)] | order(publishedAt desc) {
    title,
    "slug": slug.current,
    category,
    excerpt,
    publishedAt,
    "heroImage": {
      "url": heroImage.asset->url,
      "alt": heroImage.alt
    }
  }`;

  const url = `https://${SANITY_PROJECT_ID}.apicdn.sanity.io/v${SANITY_API_VERSION}/data/query/${SANITY_DATASET}?query=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Sanity fetch failed: ' + response.status);
  const data = await response.json();
  return data.result || [];
}

module.exports = async function handler(req, res) {
  let guides;

  if (INDEX_CACHE.data && Date.now() < INDEX_CACHE.expiresAt) {
    guides = INDEX_CACHE.data;
  } else {
    try {
      guides = await fetchAllGuides();
      INDEX_CACHE.data = guides;
      INDEX_CACHE.expiresAt = Date.now() + CACHE_TTL_MS;
    } catch (e) {
      res.status(500).send('Error fetching guides');
      return;
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

  const guidesHtml = guides.length === 0
    ? `<div class="guides-empty">
        <p>New guides are on the way. Subscribe to <a href="https://newsletter.slowcasa.com/subscribe" target="_blank" rel="noopener">The Slow Signal</a> to be notified.</p>
      </div>`
    : guides.map((guide, index) => {
        const heroUrl = (guide.heroImage && guide.heroImage.url) || '';
        const heroAlt = (guide.heroImage && guide.heroImage.alt) || guide.title || '';
        const isAboveFold = index < 3;
        return `<article class="guide-card">
          <a href="/guides/${escapeHtml(guide.slug)}" class="guide-card-link">
            ${heroUrl ? `<div class="guide-card-image">
              <img src="${escapeHtml(sanityImageUrl(heroUrl, 800))}" alt="${escapeHtml(heroAlt)}" loading="${isAboveFold ? 'eager' : 'lazy'}" />
            </div>` : '<div class="guide-card-image guide-card-image-placeholder"></div>'}
            <div class="guide-card-body">
              <p class="guide-card-category">${escapeHtml(formatCategory(guide.category))}</p>
              <h2 class="guide-card-title">${escapeHtml(guide.title || '')}</h2>
              ${guide.excerpt ? `<p class="guide-card-excerpt">${escapeHtml(guide.excerpt)}</p>` : ''}
              ${guide.publishedAt ? `<p class="guide-card-date">${escapeHtml(formatDate(guide.publishedAt))}</p>` : ''}
            </div>
          </a>
        </article>`;
      }).join('');

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Guides | Slow Casa",
    "description": "Editorial guides on architect-designed vacation homes, regional architectural traditions, and slow-living destinations across Europe.",
    "url": "https://slowcasa.com/guides",
    "publisher": {
      "@type": "Organization",
      "name": "Slow Casa",
      "url": "https://slowcasa.com"
    }
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Guides | Slow Casa</title>
  <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="shortcut icon" href="/favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-title" content="Slow Casa" />
<link rel="manifest" href="/site.webmanifest" />
  <meta name="description" content="Editorial guides on architect-designed vacation homes, regional architectural traditions, and slow-living destinations across Europe." />
  <link rel="canonical" href="https://slowcasa.com/guides" />
  <script type="application/ld+json">${JSON.stringify(structuredData)}</script>
  <meta property="og:title" content="Guides | Slow Casa" />
  <meta property="og:description" content="Editorial guides on architect-designed vacation homes, regional architectural traditions, and slow-living destinations across Europe." />
  <meta property="og:url" content="https://slowcasa.com/guides" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Slow Casa" />
  <meta name="twitter:card" content="summary_large_image" />
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
    h1, h2, h3 { font-weight: 400; }

    nav {
      display: grid; grid-template-columns: 1fr auto 1fr;
      align-items: center; padding: 28px 48px;
      background: #f9f7f2; z-index: 10; position: relative;
    }
    .wordmark { font-family: 'DM Serif Display', Georgia, serif; font-size: 28px; font-weight: 400; letter-spacing: 0.01em; text-align: center; color: #0f0f0f; }
    .nav-links { display: flex; gap: 32px; list-style: none; justify-content: flex-end; }
    .nav-links a { font-size: 13px; color: #0f0f0f; opacity: 0.7; letter-spacing: 0.03em; transition: opacity 0.2s; }
    .nav-links a:hover { opacity: 1; }

    .guides-header {
      max-width: 720px;
      margin: 0 auto;
      padding: 80px 48px 48px;
      text-align: center;
    }
    .guides-title {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: clamp(36px, 5vw, 56px);
      line-height: 1.1;
      letter-spacing: -0.01em;
      color: #0f0f0f;
      margin-bottom: 24px;
    }
    .guides-intro {
      font-family: 'TT Norms Pro', 'DM Sans', sans-serif;
      font-size: 18px;
      font-weight: 300;
      line-height: 1.6;
      color: #555;
    }

    .guides-grid {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 48px 80px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 64px 48px;
    }

    .guide-card {
      display: block;
    }
    .guide-card-link {
      display: block;
      color: inherit;
      transition: opacity 0.2s;
    }
    .guide-card-link:hover {
      opacity: 0.8;
    }
    .guide-card-image {
      width: 100%;
      aspect-ratio: 4/3;
      overflow: hidden;
      background: #e8e8e8;
      margin-bottom: 24px;
    }
    .guide-card-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .guide-card-image-placeholder {
      background: linear-gradient(135deg, #e8e8e8, #f0ebe2);
    }
    .guide-card-body {
      padding: 0;
    }
    .guide-card-category {
      font-size: 10px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 14px;
    }
    .guide-card-title {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: 26px;
      line-height: 1.2;
      letter-spacing: -0.005em;
      color: #0f0f0f;
      margin-bottom: 14px;
    }
    .guide-card-excerpt {
      font-family: 'TT Norms Pro', 'DM Sans', sans-serif;
      font-size: 15px;
      font-weight: 300;
      line-height: 1.6;
      color: #555;
      margin-bottom: 14px;
    }
    .guide-card-date {
      font-size: 11px;
      color: #888;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .guides-empty {
      max-width: 600px;
      margin: 0 auto;
      padding: 0 48px 100px;
      text-align: center;
      font-family: 'TT Norms Pro', 'DM Sans', sans-serif;
      font-size: 18px;
      font-weight: 300;
      color: #555;
      line-height: 1.6;
    }
    .guides-empty a {
      border-bottom: 0.5px solid #888;
    }

    footer {
      padding: 80px 48px 32px;
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

    @media (max-width: 768px) {
      nav { padding: 20px 24px; }
      .nav-links { display: none; }
      .guides-header { padding: 56px 24px 32px; }
      .guides-grid {
        grid-template-columns: 1fr;
        padding: 0 24px 56px;
        gap: 48px;
      }
      .guide-card-title { font-size: 22px; }
      footer { padding: 56px 24px 24px; flex-direction: column; gap: 16px; text-align: center; }
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
      <li><a href="/guides">Guides</a></li>
      <li><a href="https://newsletter.slowcasa.com/subscribe" target="_blank" rel="noopener">Newsletter</a></li>
      <li><a href="/criteria">About</a></li>
    </ul>
  </nav>

  <header class="guides-header">
    <h1 class="guides-title">Guides</h1>
    <p class="guides-intro">Guides to living slower in rural Europe. Architects. House types. Places.</p>
  </header>

  <main class="guides-grid">
    ${guidesHtml}
  </main>

  <footer>
    <div class="footer-left">
      <span class="footer-copy">&copy; 2026 Slow Casa</span>
      <a href="/privacy" class="footer-policy">Privacy Policy</a>
    </div>
    <div class="footer-links">
      <a href="https://www.instagram.com/theslowcasa/" target="_blank" rel="noopener">Instagram</a>
      <a href="https://newsletter.slowcasa.com/subscribe" target="_blank" rel="noopener">Newsletter</a>
    </div>
  </footer>

</body>
</html>`;

  res.status(200).send(html);
};
