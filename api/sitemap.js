module.exports = async function handler(req, res) {
  const base = 'https://slowcasa.com';

  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'weekly' },
    { url: '/directory', priority: '0.9', changefreq: 'weekly' },
    { url: '/journal', priority: '0.8', changefreq: 'weekly' },
    { url: '/criteria', priority: '0.5', changefreq: 'monthly' },
  ];

  let propertyUrls = [];
  try {
    const res = await fetch(
      'https://api.airtable.com/v0/appndrnWrdlgxRJAG/Properties?fields[]=Slug&fields[]=Date+added&maxRecords=100',
      { headers: { Authorization: 'Bearer patgpNhgfFkQsyQj9.887202d16495ba49fad025cb888cef3eac0a6c34058675dd2516127ad083d8c6' } }
    );
    const data = await res.json();
    propertyUrls = (data.records || [])
      .filter(r => r.fields['Slug'])
      .map(r => ({
        url: '/properties/' + r.fields['Slug'],
        priority: '0.8',
        changefreq: 'monthly',
        lastmod: r.fields['Date added'] ? r.fields['Date added'].split('T')[0] : ''
      }));
  } catch (e) {}

  let journalUrls = [];
  try {
    const query = encodeURIComponent('*[_type == "locationGuide"]{slug, category, publishedAt}');
    const res = await fetch(`https://hchp27po.apicdn.sanity.io/v2024-01-01/data/query/production?query=${query}`);
    const data = await res.json();
    journalUrls = (data.result || [])
      .filter(p => p.slug && p.slug.current)
      .map(p => ({
        url: '/journal/' + (p.category || 'places') + '/' + p.slug.current,
        priority: '0.7',
        changefreq: 'monthly',
        lastmod: p.publishedAt ? p.publishedAt.split('T')[0] : ''
      }));
  } catch (e) {}

  const allPages = [...staticPages, ...propertyUrls, ...journalUrls];

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
