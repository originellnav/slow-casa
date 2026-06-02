module.exports = async function handler(req, res) {
  const base = 'https://slowcasa.com';

  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'weekly' },
    { url: '/directory', priority: '0.9', changefreq: 'weekly' },
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

  const allPages = [...staticPages, ...propertyUrls];

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
