const { nav, footer } = require('../lib/nav');
const { houseCard, placeOf } = require('../lib/card');
const M = require('../lib/magazine');
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

// Fetch guide from Sanity by slug, plus the site-wide Partners settings
// (used by the car hire block). Partners rides along on guide.partners.
async function fetchGuideBySlug(slug) {
  const escapedSlug = slug.replace(/"/g, '\\"');
  const query = `{
  "partners": *[_type == "partners"][0]{ carHireUrl, carHireHeading, carHireText, carHireButton },
  "guide": *[_type == "guide" && slug.current == "${escapedSlug}"][0]{
    title,
    category,
    island,
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
  }
}`;

  const url = `https://${SANITY_PROJECT_ID}.apicdn.sanity.io/v${SANITY_API_VERSION}/data/query/${SANITY_DATASET}?query=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Sanity fetch failed: ' + response.status);
  const data = await response.json();
  const result = data.result || {};
  if (!result.guide) return null;
  result.guide.partners = result.partners || {};
  return result.guide;
}

// ---- Custom body blocks ----

// "Stay nearby": hand-picked Slow Casa houses, by Airtable slug.
// houseMap = { slug: airtable record } built by the handler before rendering.
function renderStayNearby(block, ctx) {
  const slugs = (block.houses || []).map(s => String(s || '').trim().toLowerCase()).filter(Boolean);
  const cards = slugs.map(s => ctx.houseMap[s]).filter(Boolean).map(r => {
    const f = r.fields;
    const island = M.islandOf(f['Island']) || ctx.island || 'mallorca';
    const hero = f['Hero Image'] || String(f['Gallery Images'] || '').split('\n')[0].trim();
    return houseCard({
      url: '/' + island + '/houses/' + f['Slug'],
      img: hero ? M.imgUrl(hero, 800) : '',
      name: f['Name'], guests: f['Sleeps'], place: placeOf(f)
    });
  });
  if (!cards.length) return ''; // no matching houses: render nothing rather than an empty box
  const title = block.title || 'Stay nearby';
  return '<section class="guide-houses">' +
    '<h2>' + escapeHtml(title) + '</h2>' +
    '<div class="guide-houses-grid">' + cards.join('') + '</div>' +
  '</section>';
}

// "Car hire": the link lives once in Sanity (Partners), so every guide updates together.
// Clicks go through /go/car-hire-{guide slug} so Plausible counts them per guide.
function renderCarHire(block, ctx) {
  const p = ctx.partners || {};
  if (!p.carHireUrl) return ''; // Partners page not filled in yet: hide the block
  const heading = block.heading || p.carHireHeading || 'Hire a car';
  const text = block.text || p.carHireText || '';
  const button = p.carHireButton || 'Compare cars';
  return '<aside class="guide-cta">' +
    '<p class="guide-cta-title">' + escapeHtml(heading) + '</p>' +
    (text ? '<p class="guide-cta-text">' + escapeHtml(text) + '</p>' : '') +
    '<a class="guide-cta-btn" href="/go/car-hire-' + escapeHtml(ctx.slug) + '" rel="sponsored nofollow">' + escapeHtml(button) + '</a>' +
  '</aside>';
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
function renderBody(body, ctx) {
  if (!Array.isArray(body) || body.length === 0) return '';
  ctx = ctx || { houseMap: {}, partners: {}, slug: '', island: '' };

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
    } else if (block._type === 'stayNearby') {
      flushList();
      html += renderStayNearby(block, ctx);
    } else if (block._type === 'carHire') {
      flushList();
      html += renderCarHire(block, ctx);
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
<body style="font-family: system-ui, sans-serif;max-width:600px;margin:80px auto;padding:0 24px;text-align:center;">
<h1>Guide not found</h1>
<p>We couldn't find what you were looking for. <a href="/magazine">Browse the Magazine</a> or <a href="/">return home</a>.</p>
</body></html>`);
      return;
    }

    setCached(slug, guide);
  }

  const title = guide.title || '';
  const category = guide.category || '';
  const metaTitle = guide.metaTitle || (title + ' | Slow Casa');
  const metaDesc = guide.metaDescription || guide.excerpt || `A guide on Slow Casa, the curated directory of architect-designed vacation homes in rural Europe.`;
  const publishedAt = guide.publishedAt || '';
  const heroImage = guide.heroImage || {};
  const heroUrl = heroImage.url || '';
  const heroAlt = heroImage.alt || title;
  // Houses for any "Stay nearby" blocks come from Airtable (same cached list the
  // related-houses row uses). Fails soft: no houses means the block renders nothing.
  const bodyBlocks = guide.body || [];
  const hasStayNearby = bodyBlocks.some(b => b && b._type === 'stayNearby');
  const houseMap = {};
  if (hasStayNearby) {
    try {
      for (const r of (await M.getProperties()) || []) {
        const s = r.fields && r.fields['Slug'];
        if (s && r.fields['Name']) houseMap[String(s).trim().toLowerCase()] = r;
      }
    } catch (e) { /* render the guide without house cards */ }
  }
  const bodyHtml = renderBody(bodyBlocks, {
    houseMap,
    partners: guide.partners || {},
    slug,
    island: String(guide.island || '').trim().toLowerCase()
  });

  // Build leading image (replaces full-width hero). Sits at top of body content.
  const leadImageHtml = heroUrl ? `<figure class="guide-image guide-image-lead">
    <img src="${escapeHtml(sanityImageUrl(heroUrl, 1200))}" alt="${escapeHtml(heroAlt)}" fetchpriority="high" loading="eager" />
  </figure>` : '';

  // One guide, one URL. If the guide carries an island, any other island path
  // (or the legacy /guides/ path) 301s to the canonical one, so the same page
  // is never served from four different URLs.
  const guideIsland = String(guide.island || '').trim().toLowerCase();
  const ISLANDS = ['mallorca', 'ibiza', 'menorca', 'formentera'];
  if (ISLANDS.indexOf(guideIsland) !== -1) {
    const requested = String((req.query && req.query.island) || '').trim().toLowerCase();
    if (requested !== guideIsland) {
      res.statusCode = 301;
      res.setHeader('Location', '/' + guideIsland + '/' + slug);
      return res.end();
    }
  }
  const canonicalUrl = ISLANDS.indexOf(guideIsland) !== -1
    ? `https://slowcasa.com/${guideIsland}/${slug}`
    : `https://slowcasa.com/guides/${slug}`;

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

  // Breadcrumbs: Slow Casa / Mallorca / Where to stay / Santanyí
  // (no island: Slow Casa / Magazine / Where to stay / Title)
  const sectionKey = M.sectionOf(category);
  const sectionLabel = sectionKey ? M.SECTIONS[sectionKey].label : 'Magazine';
  const islandLabel = guideIsland ? guideIsland.charAt(0).toUpperCase() + guideIsland.slice(1) : '';
  const crumbList = [{ name: 'Slow Casa', url: 'https://slowcasa.com' }];
  if (M.ISLANDS[guideIsland]) crumbList.push({ name: islandLabel, url: 'https://slowcasa.com/' + guideIsland });
  else crumbList.push({ name: 'Magazine', url: 'https://slowcasa.com/magazine' });
  // Section crumb points at the island hub (/mallorca/where-to-stay) when there is one.
  if (sectionKey) crumbList.push({ name: sectionLabel, url: 'https://slowcasa.com' + M.sectionUrl(sectionKey, M.ISLANDS[guideIsland] ? guideIsland : '') });
  crumbList.push({ name: title, url: canonicalUrl });
  const gCrumbs = crumbList.map((c, i) => ({ "@type": "ListItem", "position": i + 1, "name": c.name, "item": c.url }));
  // Visible trail: everything but Slow Casa and the page itself.
  const crumbHtml = crumbList.slice(1, -1).map(c => {
    const href = c.url.replace('https://slowcasa.com', '');
    return `<a href="${escapeHtml(href)}">${escapeHtml(c.name)}</a>`;
  }).join(' <span aria-hidden="true">/</span> ');

  // Cross-links under the guide: houses in this town (or on this island),
  // then more from the same island. Both fail soft to nothing.
  let relatedHtml = '';
  try {
    const [props, guides] = await Promise.all([M.getProperties(), M.getGuides()]);
    const islandHouses = (props || []).filter(r => {
      const f = r.fields || {};
      return f['Slug'] && f['Name'] && M.islandOf(f['Island']) === guideIsland && guideIsland;
    }).sort((a, b) => new Date(b.fields['Date added'] || 0) - new Date(a.fields['Date added'] || 0));
    // A house is "in town" when its town appears in the guide's title or slug.
    const hay = '-' + M.slugify(title) + '-' + slug + '-';
    const inTown = islandHouses.filter(r => {
      const t = M.slugify(placeOf(r.fields));
      return t && hay.indexOf('-' + t + '-') !== -1;
    });
    const houseList = (inTown.length ? inTown : islandHouses).slice(0, 3);
    const houseTitle = inTown.length ? 'Houses in ' + placeOf(inTown[0].fields) : 'Houses on ' + islandLabel;
    const houseCards = houseList.map(r => {
      const f = r.fields;
      const hero = f['Hero Image'] || String(f['Gallery Images'] || '').split('\n')[0].trim();
      return houseCard({
        url: '/' + guideIsland + '/houses/' + f['Slug'],
        img: hero ? M.imgUrl(hero, 1000) : '',
        name: f['Name'], guests: f['Sleeps'], place: placeOf(f)
      });
    });
    // A guide with its own hand-picked "Stay nearby" block skips this automatic row,
    // so the same houses never show twice on one page.
    if (!hasStayNearby) {
      relatedHtml += M.row({ title: houseTitle, href: guideIsland ? '/' + guideIsland : '/houses', linkLabel: 'All of ' + (islandLabel || 'the collection'), cards: houseCards });
    }
    const more = (guides || []).filter(g => g.slug !== slug && g.islandKey && g.islandKey === guideIsland).slice(0, 3);
    relatedHtml += M.row({ title: 'More from ' + islandLabel, href: '/magazine?island=' + guideIsland, linkLabel: 'The Magazine', cards: more.map(g => M.storyCard(g)) });
  } catch (e) { relatedHtml = ''; }

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": gCrumbs
  };

  const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>`;

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
    html, body { background: #FDFCF8; font-family: var(--body); color: #0f0f0f; }
    a { color: inherit; text-decoration: none; }
    h1, h2, h3, h4 { font-weight: 400; }


    .guide-header {
      max-width: 720px;
      margin: 0 auto;
      padding: 64px 48px 32px;
      text-align: center;
    }
    .guide-category a:hover { color: #0f0f0f; }
    .guide-category {
      font-size: 12px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 24px;
    }
    .guide-title {
      font-family: var(--display);
      font-size: clamp(32px, 4.5vw, 52px);
      line-height: 1.1;
      letter-spacing: -0.01em;
      color: #0f0f0f; text-transform: uppercase; letter-spacing: 0.02em; }

    .guide-body {
      max-width: 680px;
      margin: 0 auto;
      padding: 0 48px 80px;
      font-family: var(--body);
      font-size: 18px;
      font-weight: 300;
      line-height: 1.7;
      color: #2a2a28;
    }
    .guide-body p { margin-bottom: 1.4em; }
    .guide-body h2 {
      font-family: var(--display);
      font-size: clamp(24px, 2.8vw, 32px);
      margin: 2em 0 0.8em;
      line-height: 1.2;
      color: #0f0f0f; text-transform: uppercase; letter-spacing: 0.02em; }
    .guide-body h3 {
      font-family: var(--body);
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

    /* "Stay nearby" block: two house cards per row inside the text column */
    .guide-houses { margin: 2.8em 0; }
    .guide-houses h2 { margin-top: 0; }
    .guide-houses-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 40px 24px; }
    .guide-body .guide-houses a { border-bottom: 0; }
    .guide-houses .house-card-img { margin-bottom: 16px; }

    /* "Car hire" block */
    .guide-cta {
      margin: 2.8em 0; padding: 32px; border: 1px solid #d9d6cf; text-align: center;
    }
    .guide-cta-title {
      font-family: var(--display); font-size: 22px; text-transform: uppercase;
      letter-spacing: 0.04em; color: #0f0f0f; margin: 0 0 0.4em;
    }
    .guide-cta-text { margin: 0 0 1.2em; }
    .guide-body .guide-cta-btn {
      display: inline-block; padding: 12px 28px; border: 1px solid #0f0f0f;
      font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 400;
      transition: background 0.2s, color 0.2s;
    }
    .guide-body .guide-cta-btn:hover { background: #0f0f0f; color: #FDFCF8; }

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


    @media (max-width: 768px) {
      .guide-header { padding: 48px 24px 24px; }
      .guide-body { padding: 0 24px 56px; font-size: 17px; }
      .guide-image { margin: 2em -24px; }
      .guide-image-lead { margin: 0 -24px 2em; }
      .guide-cta { padding: 24px 20px; }
    }
    @media (max-width: 480px) {
      .guide-houses-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>

  ${nav()}

  <header class="guide-header">
    <p class="guide-category">${crumbHtml || escapeHtml(sectionLabel)}</p>
    <h1 class="guide-title">${escapeHtml(title)}</h1>
  </header>

  <article class="guide-body">
    ${leadImageHtml}
    ${bodyHtml}
  </article>

  ${relatedHtml}

  ${footer()}

</body>
</html>`;

  res.status(200).send(html);
};
