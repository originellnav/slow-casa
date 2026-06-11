const SANITY_PROJECT_ID = 'hchp27po';
const SANITY_DATASET = 'production';
const SANITY_API_VERSION = '2024-01-01';

const GUIDE_CACHE = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(slug) {
  const entry = GUIDE_CACHE.get(slug);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    GUIDE_CACHE.delete(slug);
    return null;
  }
  return entry.data;
}

function setCached(slug, data) {
  if (!data) return;
  GUIDE_CACHE.set(slug, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Sanity image URL with responsive sizing
function sanityImageUrl(url, width) {
  if (!url) return '';
  const separator = url.indexOf('?') >= 0 ? '&' : '?';
  return url + separator + 'w=' + width + '&auto=format&fit=max&q=80';
}

// Format published date as readable string
function formatDate(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) { return ''; }
}

// Format category as readable label
function formatCategory(category) {
  const labels = {
    'architect-roundup': 'Architect Roundup',
    'typology-guide': 'Typology Guide',
    'region-discovery': 'Region Discovery',
    'architectural-pilgrimage': 'Architectural Pilgrimage'
  };
  return labels[category] || 'Guide';
}

// Fetch guide from Sanity by slug
async function fetchGuideBySlug(slug) {
  const escapedSlug = slug.replace(/"/g, '\\"');
  const query = `*[_type == "guide" && slug.current == "${escapedSlug}"][0]{
    title,
    category,
    "slug": slug.current,
    metaTitle,
    metaDescription,
    excerpt,
    publishedAt,
    "heroImage": {
      "url": heroImage.asset->url,
      "alt": heroImage.alt,
      "credit": heroImage.credit
    },
    body[]{
      ...,
      _type == "image" => {
        ...,
        "url": asset->url
      }
    }
  }`;

  const url = `https://${SANITY_PROJECT_ID}.apicdn.sanity.io/v${SANITY_API_VERSION}/data/query/${SANITY_DATASET}?query=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Sanity fetch failed: ' + response.status);
  const data = await response.json();
  return data.result || null;
}

// Render a single text span with marks (bold, italic, links)
function renderSpan(span, markDefs) {
  let text = escapeHtml(span.text || '');
  const marks = span.marks || [];

  // Apply marks - links first (wrap outermost), then formatting (wrap innermost)
  let linkHref = null;
  let isStrong = false;
  let isEm = false;

  for (const mark of marks) {
    if (mark === 'strong') isStrong = true;
    else if (mark === 'em') isEm = true;
    else {
      // Mark is a reference to a markDef (annotation like a link)
      const def = (markDefs || []).find(d => d._key === mark);
      if (def && def._type === 'link' && def.href) {
  linkHref = def.href;
}
    }
  }

  if (isEm) text = '<em>' + text + '</em>';
  if (isStrong) text = '<strong>' + text + '</strong>';
  if (linkHref) {
    const isExternal = !linkHref.startsWith('/') && !linkHref.includes('slowcasa.com');
    const attrs = isExternal ? ' target="_blank" rel="noopener"' : '';
    text = '<a href="' + escapeHtml(linkHref) + '"' + attrs + '>' + text + '</a>';
  }

  return text;
}

// Render a portable text "block" (paragraph, heading, list item, blockquote)
function renderBlock(block, listContext) {
  const style = block.style || 'normal';
  const children = block.children || [];
  const markDefs = block.markDefs || [];
  const content = children.map(c => renderSpan(c, markDefs)).join('');

  // List items are special - they get wrapped by the parent renderer
  if (block.listItem) {
    return '<li>' + content + '</li>';
  }

  if (style === 'h2') return '<h2>' + content + '</h2>';
  if (style === 'h3') return '<h3>' + content + '</h3>';
  if (style === 'blockquote') return '<blockquote>' + content + '</blockquote>';
  return '<p>' + content + '</p>';
}

// Render an image block within portable text
function renderImageBlock(block) {
  const url = block.url;
  if (!url) return '';
  const alt = escapeHtml(block.alt || '');
  const caption = block.caption ? '<figcaption>' + escapeHtml(block.caption) + '</figcaption>' : '';
  return '<figure class="guide-image">' +
    '<img src="' + escapeHtml(sanityImageUrl(url, 1200)) + '" alt="' + alt + '" loading="lazy" />' +
    caption +
  '</figure>';
}

// Render the full portable text body to HTML
function renderBody(body) {
  if (!Array.isArray(body) || body.length === 0) return '';

  let html = '';
  let listType = null; // 'bullet' or 'number' or null
  let listItems = [];

  function flushList() {
    if (listItems.length > 0) {
      const tag = listType === 'number' ? 'ol' : 'ul';
      html += '<' + tag + '>' + listItems.join('') + '</' + tag + '>';
      listItems = [];
      listType = null;
    }
  }

  for (const block of body) {
    if (block._type === 'image') {
      flushList();
      html += renderImageBlock(block);
    } else if (block._type === 'block') {
      if (block.listItem) {
        // Start a new list or continue an existing one
        const blockListType = block.listItem === 'number' ? 'number' : 'bullet';
        if (listType && listType !== blockListType) {
          flushList();
        }
        listType = blockListType;
        listItems.push(renderBlock(block));
      } else {
        flushList();
        html += renderBlock(block);
      }
    }
  }
  flushList();

  return html;
}

module.exports = async function handler(req, res) {
  const { slug } = req.query;
  if (!slug) {
    res.status(400).send('Missing slug');
    return;
  }

  // Sanitize slug to prevent injection (only allow lowercase, numbers, hyphens)
  if (!/^[a-z0-9-]+$/.test(slug)) {
    res.status(404).send('Guide not found');
    return;
  }

  let guide = getCached(slug);

  if (!guide) {
    try {
      guide = await fetchGuideBySlug(slug);
    } catch (e) {
      res.status(500).send('Error fetching guide');
      return;
    }

    if (!guide) {
      // Proper 404 - not a soft 404 this time
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><title>Guide not found | Slow Casa</title><meta name="robots" content="noindex" /></head>
<body style="font-family:sans-serif;max-width:600px;margin:80px auto;padding:0 24px;text-align:center;">
<h1>Guide not found</h1>
<p>We couldn't find what you were looking for. <a href="/guides">Browse all guides</a> or <a href="/">return home</a>.</p>
</body></html>`);
      return;
    }

    setCached(slug, guide);
  }

  const title = guide.title || '';
  const category = guide.category || '';
  const categoryLabel = formatCategory(category);
  const metaTitle = guide.metaTitle || (title + ' | Slow Casa');
  const metaDesc = guide.metaDescription || guide.excerpt || `A guide on Slow Casa, the curated directory of architect-designed vacation homes in rural Europe.`;
  const publishedAt = guide.publishedAt || '';
  const heroImage = guide.heroImage || {};
  const heroUrl = heroImage.url || '';
  const heroAlt = heroImage.alt || title;
  const bodyHtml = renderBody(guide.body || []);

  // Build leading image (replaces full-width hero). Sits at top of body content.
  const leadImageHtml = heroUrl ? `<figure class="guide-image guide-image-lead">
    <img src="${escapeHtml(sanityImageUrl(heroUrl, 1200))}" alt="${escapeHtml(heroAlt)}" fetchpriority="high" loading="eager" />
  </figure>` : '';

  const canonicalUrl = `https://slowcasa.com/guides/${slug}`;

  // JSON-LD Article schema
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "description": metaDesc,
    "url": canonicalUrl,
    "author": {
      "@type": "Organization",
      "name": "Slow Casa",
      "url": "https://slowcasa.com"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Slow Casa",
      "url": "https://slowcasa.com"
    }
  };
  if (publishedAt) structuredData.datePublished = publishedAt;
  if (heroUrl) structuredData.image = heroUrl;

  const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(metaTitle)}</title>
  <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="shortcut icon" href="/favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-title" content="Slow Casa" />
<link rel="manifest" href="/site.webmanifest" />
  <meta name="description" content="${escapeHtml(metaDesc)}" />
  <link rel="canonical" href="${canonicalUrl}" />
  ${jsonLdScript}
  <meta property="og:title" content="${escapeHtml(metaTitle)}" />
  <meta property="og:description" content="${escapeHtml(metaDesc)}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Slow Casa" />
  ${heroUrl ? `<meta property="og:image" content="${escapeHtml(sanityImageUrl(heroUrl, 1200))}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(metaTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(metaDesc)}" />
  ${heroUrl ? `<meta name="twitter:image" content="${escapeHtml(sanityImageUrl(heroUrl, 1200))}" />` : ''}
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

    .guide-header {
      max-width: 720px;
      margin: 0 auto;
      padding: 64px 48px 32px;
      text-align: center;
    }
    .guide-category {
      font-size: 10px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 24px;
    }
    .guide-title {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: clamp(32px, 4.5vw, 52px);
      line-height: 1.1;
      letter-spacing: -0.01em;
      color: #0f0f0f;
    }

    .guide-body {
      max-width: 680px;
      margin: 0 auto;
      padding: 0 48px 80px;
      font-family: 'TT Norms Pro', 'DM Sans', sans-serif;
      font-size: 18px;
      font-weight: 300;
      line-height: 1.7;
      color: #2a2a28;
    }
    .guide-body p { margin-bottom: 1.4em; }
    .guide-body h2 {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: clamp(24px, 2.8vw, 32px);
      margin: 2em 0 0.8em;
      line-height: 1.2;
      color: #0f0f0f;
    }
    .guide-body h3 {
      font-family: 'DM Sans', sans-serif;
      font-weight: 500;
      font-size: 20px;
      margin: 1.8em 0 0.6em;
      color: #0f0f0f;
    }
    .guide-body ul, .guide-body ol {
      margin: 0 0 1.4em 1.4em;
    }
    .guide-body li { margin-bottom: 0.5em; }
    .guide-body blockquote {
      border-left: 2px solid #888;
      padding-left: 24px;
      margin: 2em 0;
      font-style: italic;
      color: #555;
    }
    .guide-body a {
      color: #0f0f0f;
      border-bottom: 0.5px solid #888;
      transition: border-color 0.2s;
    }
    .guide-body a:hover {
      border-color: #0f0f0f;
    }
    .guide-body strong { font-weight: 600; }

    .guide-image {
      margin: 2.4em -48px;
    }
    .guide-image-lead {
      margin: 0 -48px 2.4em;
    }
    .guide-image img {
      width: 100%;
      height: auto;
      display: block;
    }
    .guide-image figcaption {
      font-size: 13px;
      color: #888;
      text-align: center;
      margin-top: 12px;
      font-style: italic;
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
      .guide-header { padding: 48px 24px 24px; }
      .guide-body { padding: 0 24px 56px; font-size: 17px; }
      .guide-image { margin: 2em -24px; }
      .guide-image-lead { margin: 0 -24px 2em; }
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

  <header class="guide-header">
    <p class="guide-category">${escapeHtml(categoryLabel)}</p>
    <h1 class="guide-title">${escapeHtml(title)}</h1>
  </header>

  <article class="guide-body">
    ${leadImageHtml}
    ${bodyHtml}
  </article>

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
