const { nav, footer } = require('../lib/nav');
const { houseCard, placeOf } = require('../lib/card');
const M = require('../lib/magazine');
const { titleCase } = require('../lib/titlecase');
const { fetchUrl } = require('../lib/img');

// The three islands. `intro` is placeholder copy, meant to be replaced with
// 400-700 words of real writing per island. Everything else is derived.
const ISLANDS = {
  mallorca: {
    name: 'Mallorca',
    title: 'Design houses to rent in Mallorca',
    metaDesc: 'Design-led houses to rent across Mallorca, from the Tramuntana to the villages of the central plain, with guides to the places around them.',
    intro: [
      'Mallorca is the largest of the three islands and the most varied. The Tramuntana runs the length of the north-west coast in a wall of limestone, with Deia, Soller and Valldemossa stacked along it. The middle of the island, Es Pla, is flat farmland and working villages that most visitors drive straight through. The south has the quiet coves, and Palma sits in the bay with the rest of it within an hour.',
      'The houses here are mostly old: fincas, village houses, barns and mills that have been rebuilt rather than replaced. We look for the ones where that work was done carefully, and we link straight to the owner.'
    ]
  },
  ibiza: {
    name: 'Ibiza',
    title: 'Design houses to rent in Ibiza',
    metaDesc: 'Design-led houses to rent across Ibiza, from the valleys of the north to the quieter south, with guides to the villages around them.',
    intro: [
      'Ibiza splits in two. The north, inland from Sant Joan and Sant Carles, is terraced orchards, carob and almond, dry-stone walls and roads that take longer than the map says. The south and west carry the reputation, and the island everyone argues about is mostly a few kilometres of it.',
      'The traditional Ibizan finca is thick whitewashed walls and ceilings of sabina juniper, built to stay cool without help. The best modern work on the island still starts there. Those are the houses we look for.'
    ]
  },
  menorca: {
    name: 'Menorca',
    title: 'Design houses to rent in Menorca',
    metaDesc: 'Design-led houses to rent across Menorca, from Ciutadella to Mao, with guides to the villages and beaches around them.',
    intro: [
      'Menorca is the quiet one, and it has stayed that way on purpose: the whole island is a UNESCO biosphere reserve, and the building rules that come with it are why the coast still looks like it does. Ciutadella sits at one end and Mao at the other, with farmland, stone walls and the Cami de Cavalls bridle path running the whole way round the edge.',
      'There is less here than on the other two islands, in every sense. Fewer houses, fewer people, and a short season. The houses worth staying in are usually old farm buildings, rebuilt in the island sandstone.'
    ]
  }
};

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
  return fetchUrl(url, width);
}

function getImageUrl(record, index) {
  index = index || 0;
  const f = (record && record.fields) || {};
  const heroImg = f['Hero Image'];
  const galleryStr = f['Gallery Images'];
  const galleryUrls = galleryStr ? galleryStr.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const combined = [];
  if (heroImg) combined.push(heroImg);
  for (const u of galleryUrls) combined.push(u);
  if (combined.length > index) return combined[index];
  return null;
}

module.exports = async function handler(req, res) {
  const key = String((req.query && req.query.island) || '').trim().toLowerCase();
  const config = ISLANDS[key];
  if (!config) return res.status(404).send('Island not found');

  // Houses, guides and Places load in parallel. Each fails soft to an empty list.
  const [records, guides] = await Promise.all([M.getProperties(), M.getGuides()]);
  const places = await M.getPlaces(records);

  const houses = records
    .filter(r => {
      const f = (r && r.fields) || {};
      return String(f['Island'] || '').trim().toLowerCase() === key && f['Slug'] && f['Name'];
    })
    .sort((a, b) => {
      const da = a.fields['Date added'] ? new Date(a.fields['Date added']) : new Date(0);
      const db = b.fields['Date added'] ? new Date(b.fields['Date added']) : new Date(0);
      return db - da;
    });

  const canonicalUrl = `https://slowcasa.com/${key}`;
  const houseCount = houses.length;

  const cardsHtml = houses.map(record => {
    const f = record.fields;
    const imgUrl = getImageUrl(record, 0) || '';
    return houseCard({
      url: `/${key}/houses/${f['Slug'] || ''}`,
      img: imgUrl ? responsiveImageUrl(imgUrl, 1000) : '',
      name: f['Name'] || '',
      guests: f['Sleeps'],
      place: placeOf(f)
    });
  }).join('');

  const gridHtml = houses.length
    ? `<div class="house-grid">${cardsHtml}</div>`
    : `<p class="isl-empty">We are still adding houses on ${escapeHtml(config.name)}. <a href="/houses">See the Whole Directory</a>.</p>`;

  // Magazine rows: where to stay, where to eat, what to do (then any house tours).
  // Each row shows up to 3 and links to the full Magazine section for this island.
  // A row with nothing in it is left out.
  const ROW_SIZE = 3;
  const magazineHtml = ['where-to-stay', 'where-to-eat', 'what-to-do', 'house-tours'].map(k => {
    const items = M.sectionItems(k, guides, places, key);
    return M.row({
      id: k,
      title: `${M.SECTIONS[k].label} in ${config.name}`,
      href: M.sectionUrl(k, key),
      linkLabel: items.cards.length > ROW_SIZE ? `See All (${items.cards.length})` : 'More in the Magazine',
      cards: items.cards.slice(0, ROW_SIZE)
    });
  }).join('');

  const otherIslands = Object.keys(ISLANDS).filter(k => k !== key);
  const otherHtml = `<nav class="mag-sublinks" aria-label="More">
    ${otherIslands.map(k => `<a href="/${k}">${escapeHtml(ISLANDS[k].name)}</a>`).join('')}
    <a href="/houses">All Houses</a>
    <a href="/magazine">The Magazine</a>
  </nav>`;

  const introHtml = config.intro.map(p => `<p>${escapeHtml(p)}</p>`).join('');

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: config.title,
    description: config.metaDesc,
    url: canonicalUrl,
    isPartOf: { '@type': 'WebSite', name: 'Slow Casa', url: 'https://slowcasa.com' }
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Slow Casa', item: 'https://slowcasa.com' },
      { '@type': 'ListItem', position: 2, name: config.name, item: canonicalUrl }
    ]
  };

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(config.title)} | Slow Casa</title>
  <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="shortcut icon" href="/favicon.ico" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <meta name="apple-mobile-web-app-title" content="Slow Casa" />
  <link rel="manifest" href="/site.webmanifest" />
  <meta name="description" content="${escapeHtml(config.metaDesc)}" />
  <link rel="canonical" href="${canonicalUrl}" />
  <meta property="og:title" content="${escapeHtml(config.title)} | Slow Casa" />
  <meta property="og:description" content="${escapeHtml(config.metaDesc)}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Slow Casa" />
  <meta name="twitter:card" content="summary_large_image" />
  <script type="application/ld+json">${JSON.stringify(collectionSchema)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
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
  <script async src="https://plausible.io/js/pa-aahRJ1iMPfiu0NJteNWEg.js"></script>
  <script>
    window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
    plausible.init()
  </script>
  <style>
    .isl-hero { max-width: 1200px; margin: 0 auto; padding: 48px 48px 0; }
    .isl-crumb { font-size: 13px; letter-spacing: 0.01em; color: var(--grey-1); margin-bottom: 24px; }
    .isl-crumb a { color: var(--grey-1); }
    .isl-crumb a:hover { color: var(--black); }
    .isl-hero h1 { font-family: var(--display); font-size: 46px; line-height: 1.12; margin: 0 0 24px; max-width: 16ch; letter-spacing: 0.02em; }
    .isl-intro { max-width: 62ch; }
    .isl-intro p { font-size: 16px; line-height: 1.65; color: var(--black); margin: 0 0 16px; }
    .isl-count { font-family: var(--body); font-size: 15px; letter-spacing: 0.01em; color: var(--grey-1); margin: 40px 0 0; }
    .isl-houses { padding-top: 0; padding-bottom: 0; }
    .isl-empty { font-size: 15px; color: var(--grey-1); }
    .isl-empty a { text-decoration: underline; }
    @media (max-width: 768px) {
      .isl-hero { padding: 32px 16px 0; }
      .isl-hero h1 { font-size: 32px; max-width: none; }
      .section { padding-left: 16px; padding-right: 16px; }
    }
  </style>
</head>
<body>
${nav()}

<header class="page-head">
  <p class="page-crumb"><a href="/">Slow Casa</a> / ${escapeHtml(config.name)}</p>
  <h1 class="page-title">${escapeHtml(titleCase(config.title))}</h1>
  <div class="page-lede">${introHtml}</div>
  <p class="isl-count">${houseCount} ${houseCount === 1 ? 'house' : 'houses'} on ${escapeHtml(config.name)}</p>
</header>

<section class="section isl-houses" id="houses">
  ${gridHtml}
</section>

${magazineHtml}

${otherHtml}

${footer()}
</body>
</html>`;

  res.status(200).send(html);
};
