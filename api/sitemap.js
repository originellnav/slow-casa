const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

module.exports = async function handler(req, res) {
  const base = 'https://slowcasa.com';
  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'weekly' },
    { url: '/houses', priority: '0.9', changefreq: 'weekly' },
    { url: '/contact', priority: '0.4', changefreq: 'yearly' },
    { url: '/mallorca', priority: '0.9', changefreq: 'weekly' },
    { url: '/ibiza', priority: '0.9', changefreq: 'weekly' },
    { url: '/menorca', priority: '0.9', changefreq: 'weekly' },
    { url: '/magazine', priority: '0.9', changefreq: 'weekly' },
  ];
  // Magazine sections and the architects directory go in only when they have
  // enough on them. Empty or thin pages are noindex, and a sitemap should
  // never list noindex pages.
  let architectUrls = [];
  // Island hubs (/mallorca/where-to-stay etc.) go in only when they have something
  // on them. Empty hubs are noindex, and a sitemap should never list noindex pages.
  try {
    const M = require('../lib/magazine');
    const [guides, props] = await Promise.all([M.getGuides(), M.getProperties()]);
    const places = await M.getPlaces(props);
    for (const sec of M.SECTION_KEYS) {
      if (M.sectionItems(sec, guides, places, '').cards.length) {
        staticPages.push({ url: '/magazine/' + sec, priority: '0.8', changefreq: 'weekly' });
      }
    }
    // Architects: Published and Balearic only (see lib/scope.js).
    const { architectInScope } = require('../lib/scope');
    const propById = new Map((props || []).map(p => [p.id, p]));
    const ar = await fetch('https://api.airtable.com/v0/appndrnWrdlgxRJAG/Architects?pageSize=100',
      { headers: { Authorization: 'Bearer ' + AIRTABLE_TOKEN } });
    const arData = ar.ok ? await ar.json() : { records: [] };
    const inScope = (arData.records || []).filter(rec => {
      const f = rec.fields || {};
      return String(f['Slug'] || '').trim() && f['Status'] === 'Published' && architectInScope(f, propById);
    });
    architectUrls = inScope.map(rec => ({ url: '/architects/' + String(rec.fields['Slug']).trim(), priority: '0.6', changefreq: 'monthly', lastmod: '' }));
    if (inScope.length >= 12) staticPages.push({ url: '/design-directory', priority: '0.7', changefreq: 'weekly' });
    for (const isl of M.ISLAND_KEYS) {
      for (const sec of M.ISLAND_HUB_SECTIONS) {
        if (M.sectionItems(sec, guides, places, isl).cards.length) {
          staticPages.push({ url: M.sectionUrl(sec, isl), priority: '0.8', changefreq: 'weekly' });
        }
      }
    }
    // Place pages, but only the ones with a photo and a full description.
    // The rest are live but noindex until they are filled in.
    const allPlaces = await M.getPlaces(props, { all: true });
    for (const pl of allPlaces) {
      if (M.placeUrl(pl) && M.placeIndexable(pl)) {
        staticPages.push({ url: M.placeUrl(pl), priority: '0.5', changefreq: 'monthly' });
      }
    }
  } catch (e) { /* sitemap still renders without the hubs */ }
  // Fetch properties from Airtable and guides from Sanity in parallel
  const [propertyUrls, guideUrls] = await Promise.all([
    (async () => {
      try {
                let recs = [];
        let offset = null;
        let attempts = 0;
        do {
          let url = 'https://api.airtable.com/v0/appndrnWrdlgxRJAG/Properties?fields[]=Slug&fields[]=Date+added&fields[]=Island&pageSize=100';
          if (offset) url += '&offset=' + encodeURIComponent(offset);
          const r = await fetch(url, { headers: { Authorization: 'Bearer ' + AIRTABLE_TOKEN } });
          const data = await r.json();
          recs = recs.concat(data.records || []);
          offset = data.offset;
          attempts++;
        } while (offset && attempts < 10);
        return recs
                    .filter(rec => rec.fields['Slug'] && ['mallorca','ibiza','menorca','formentera'].indexOf(String(rec.fields['Island'] || '').trim().toLowerCase()) !== -1)
          .map(rec => ({
            url: (function () {
              const isl = String(rec.fields['Island'] || '').trim().toLowerCase();
              return ['mallorca','ibiza','menorca','formentera'].indexOf(isl) !== -1
                ? '/' + isl + '/houses/' + rec.fields['Slug']
                : '/properties/' + rec.fields['Slug'];
            })(),
            priority: '0.8',
            changefreq: 'monthly',
            lastmod: rec.fields['Date added'] ? rec.fields['Date added'].split('T')[0] : ''
          }));
      } catch (e) { return []; }
    })(),
    (async () => {
      try {
        const query = '*[_type == "guide" && defined(publishedAt) && defined(slug.current)] | order(publishedAt desc) { "slug": slug.current, publishedAt, island }';
        const sanityUrl = 'https://hchp27po.apicdn.sanity.io/v2024-01-01/data/query/production?query=' + encodeURIComponent(query);
        const r = await fetch(sanityUrl);
        const data = await r.json();
        return (data.result || [])
          .filter(g => g.slug && ['mallorca','ibiza','menorca','formentera'].indexOf(String(g.island || '').trim().toLowerCase()) !== -1)
          .map(g => ({
            url: (function () {
              const isl = String(g.island || '').trim().toLowerCase();
              return ['mallorca','ibiza','menorca','formentera'].indexOf(isl) !== -1
                ? '/' + isl + '/' + g.slug
                : '/guides/' + g.slug;
            })(),
            priority: '0.7',
            changefreq: 'monthly',
            lastmod: g.publishedAt ? g.publishedAt.split('T')[0] : ''
          }));
      } catch (e) { return []; }
    })()
  ]);
  const allPages = [...staticPages, ...propertyUrls, ...guideUrls, ...architectUrls];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(p => `  <url>
    <loc>${base}${p.url}</loc>
    ${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 's-maxage=3600');
  res.status(200).send(xml);
}
