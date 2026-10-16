// The Magazine. One function serves every Magazine page:
//   /magazine                   -> ?section=magazine   (every section, a row each)
//   /magazine/where-to-stay     -> ?section=where-to-stay
//   /magazine/where-to-eat      -> ?section=where-to-eat
//   /magazine/what-to-do        -> ?section=what-to-do
//   /magazine/house-tours       -> ?section=house-tours
//   /magazine/how-to            -> ?section=how-to
// Add ?island=mallorca (or ibiza, menorca) to filter by island. Filtered views
// are noindex and point their canonical at the unfiltered page, because the
// island pages (/mallorca) are the ones meant to rank for each island.
// Sections and data sources are defined in lib/magazine.js.
const { nav, footer } = require('../lib/nav');
const M = require('../lib/magazine');
const { esc } = M;

const LANDING = {
  title: 'Magazine: Where to Stay, Eat and Swim in Mallorca, Ibiza & Menorca | Slow Casa',
  description: 'Village guides, restaurants, beaches and things to do in Mallorca, Ibiza and Menorca, chosen around the houses in the Slow Casa collection.',
  heading: 'Magazine',
  intro: 'Where to stay, eat and swim in Mallorca, Ibiza and Menorca. Village guides, places we rate and the stories behind the houses.'
};
const LANDING_ROW_SIZE = 6;

function chips(basePath, island) {
  const items = [{ key: '', label: 'All islands' }].concat(M.ISLAND_KEYS.map(k => ({ key: k, label: M.ISLANDS[k] })));
  return `<ul class="mag-chips" aria-label="Filter by island">
    ${items.map(i => `<li><a href="${basePath}${i.key ? '?island=' + i.key : ''}"${i.key === island ? ' aria-current="page"' : ''}>${esc(i.label)}</a></li>`).join('')}
  </ul>`;
}

module.exports = async function handler(req, res) {
  const q = req.query || {};
  let section = String(q.section || 'magazine').toLowerCase();
  if (section === 'places' || section === 'village-guides') section = 'magazine';
  const isLanding = section === 'magazine';
  if (!isLanding && !M.SECTIONS[section]) {
    res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><title>Not found | Slow Casa</title><meta name="robots" content="noindex" /></head><body style="font-family:system-ui,sans-serif;max-width:600px;margin:80px auto;padding:0 24px;text-align:center;"><h1>Not found</h1><p><a href="/magazine">Go to the Magazine</a></p></body></html>');
  }
  const island = M.ISLAND_KEYS.indexOf(String(q.island || '').toLowerCase()) !== -1 ? String(q.island).toLowerCase() : '';
  const islandName = island ? M.ISLANDS[island] : '';

  const [guides, props] = await Promise.all([M.getGuides(), M.getProperties()]);
  const places = await M.getPlaces(props);

  const basePath = isLanding ? '/magazine' : '/magazine/' + section;
  const canonical = 'https://slowcasa.com' + basePath;
  const sec = isLanding ? null : M.SECTIONS[section];

  let heading, intro, title, description;
  if (isLanding) {
    heading = island ? 'Magazine: ' + islandName : LANDING.heading;
    intro = LANDING.intro;
    title = island ? `Magazine: ${islandName} | Slow Casa` : LANDING.title;
    description = LANDING.description;
  } else {
    heading = island ? `${sec.label} in ${islandName}` : sec.label;
    intro = sec.intro;
    title = island ? `${sec.label} in ${islandName} | Slow Casa` : sec.title;
    description = sec.description;
  }

  let bodyHtml = '';
  if (isLanding) {
    bodyHtml = M.SECTION_KEYS.map(k => {
      const items = M.sectionItems(k, guides, places, island);
      return M.row({
        id: k,
        title: M.SECTIONS[k].label,
        href: '/magazine/' + k + (island ? '?island=' + island : ''),
        linkLabel: 'See all (' + items.cards.length + ')',
        cards: items.cards.slice(0, LANDING_ROW_SIZE)
      });
    }).join('');
    if (!bodyHtml) {
      bodyHtml = `<p class="mag-empty">${island ? `Nothing here yet for ${esc(islandName)}. <a href="/magazine">See all islands</a>.` : 'The first guides are on the way.'}</p>`;
    }
  } else {
    const items = M.sectionItems(section, guides, places, island);
    bodyHtml = items.cards.length
      ? `<div class="mag-grid"><div class="house-grid">${items.cards.join('')}</div></div>`
      : `<p class="mag-empty">${island ? `Nothing here yet for ${esc(islandName)}. <a href="${basePath}">See all islands</a>.` : 'The first pieces are on the way.'}</p>`;
    // Links to the other sections, and back to the island page when filtered.
    const others = M.SECTION_KEYS.filter(k => k !== section && M.sectionItems(k, guides, places, island).cards.length);
    const links = others.map(k => `<a href="/magazine/${k}${island ? '?island=' + island : ''}">${esc(M.SECTIONS[k].label)}</a>`);
    if (island) links.push(`<a href="/${island}">All of ${esc(islandName)}</a>`);
    if (links.length) bodyHtml += `<nav class="mag-sublinks" aria-label="More from the Magazine">${links.join('')}</nav>`;
  }

  const crumbs = [{ name: 'Slow Casa', url: 'https://slowcasa.com' }, { name: 'Magazine', url: 'https://slowcasa.com/magazine' }];
  if (!isLanding) crumbs.push({ name: sec.label, url: canonical });
  const crumbHtml = crumbs.map((c, i) => i === crumbs.length - 1
    ? esc(c.name)
    : `<a href="${c.url.replace('https://slowcasa.com', '') || '/'}">${esc(c.name)}</a>`).join(' / ');

  const schema = [
    {
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: title, description, url: canonical,
      isPartOf: { '@type': 'WebSite', name: 'Slow Casa', url: 'https://slowcasa.com' }
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url }))
    }
  ];

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="shortcut icon" href="/favicon.ico" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <meta name="apple-mobile-web-app-title" content="Slow Casa" />
  <link rel="manifest" href="/site.webmanifest" />
  <meta name="description" content="${esc(description)}" />
  ${island ? '<meta name="robots" content="noindex,follow" />' : ''}
  <link rel="canonical" href="${canonical}" />
  ${schema.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n  ')}
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Slow Casa" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preload" as="font" type="font/woff2" href="/fonts/jost-latin-400.woff2" crossorigin />
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
      font-family: 'DM Serif Display';
      src: url('/fonts/dm-serif-display-v17-latin-regular.woff2') format('woff2');
      font-weight: 400; font-style: normal; font-display: swap;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: var(--bg); font-family: var(--body); color: var(--black); }
    a { color: inherit; text-decoration: none; }
    /* On a section page the grid sits straight under the header. */
    .mag-grid { padding-top: 24px; }
    main > .mag-row:first-child { padding-top: 40px; }
  </style>
</head>
<body>

  ${nav()}

  <header class="page-head">
    <p class="page-crumb">${crumbHtml}</p>
    <h1 class="page-title">${esc(heading)}</h1>
    <p class="page-lede">${esc(intro)}</p>
    ${chips(basePath, island)}
  </header>

  <main>
    ${bodyHtml}
  </main>

  ${footer()}

</body>
</html>`;

  res.status(200).send(html);
};
