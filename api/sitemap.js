module.exports = async function handler(req, res) {
  const base = 'https://slowcasa.com';
  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'weekly' },
    { url: '/directory', priority: '0.9', changefreq: 'weekly' },
    { url: '/guides', priority: '0.8', changefreq: 'weekly' },
    { url: '/criteria', priority: '0.5', changefreq: 'monthly' },
  ];

  // Fetch properties from Airtable and guides from Sanity in parallel
  const [propertyUrls, guideUrls] = await Promise.all([
    (async () => {
      try {
        const r = await fetch(
          'https://api.airtable.com/v0/appndrnWrdlgxRJAG/Properties?fields[]=Slug&fields[]=Date+added&maxRecords=100',
          { headers: { Authorization: 'Bearer patgpNhgfFkQsyQj9.887202d16495ba49fad025cb888cef3eac0a6c34058675dd2516127ad083d8c6' } }
        );
        const data = await r.json();
        return (data.records || [])
          .filter(rec => rec.fields['Slug'])
          .map(rec => ({
            url: '/properties/' + rec.fields['Slug'],
            priority: '0.8',
            changefreq: 'monthly',
            lastmod: rec.fields['Date added'] ? rec.fields['Date added'].split('T')[0] : ''
          }));
      } catch (e) { return []; }
    })(),
    (async () => {
      try {
        const query = '*[_type == "guide" && defined(publishedAt) && defined(slug.current)] | order(publishedAt desc) { "slug": slug.current, publishedAt }';
        const sanityUrl = 'https://hchp27po.apicdn.sanity.io/v2024-01-01/data/query/production?query=' + encodeURIComponent(query);
        const r = await fetch(sanityUrl);
        const data = await r.json();
        return (data.result || [])
          .filter(g => g.slug)
          .map(g => ({
            url: '/guides/' + g.slug,
            priority: '0.7',
            changefreq: 'monthly',
            lastmod: g.publishedAt ? g.publishedAt.split('T')[0] : ''
          }));
      } catch (e) { return []; }
    })()
  ]);

  const allPages = [...staticPages, ...propertyUrls, ...guideUrls];
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
