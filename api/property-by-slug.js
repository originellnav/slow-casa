module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'Missing slug' });

  const formula = encodeURIComponent(`{Slug} = "${slug}"`);
  const url = `https://api.airtable.com/v0/appndrnWrdlgxRJAG/Properties?filterByFormula=${formula}&maxRecords=1`;

  const response = await fetch(url, {
    headers: {
      Authorization: 'Bearer patgpNhgfFkQsyQj9.887202d16495ba49fad025cb888cef3eac0a6c34058675dd2516127ad083d8c6'
    }
  });

  const data = await response.json();
  const record = data.records && data.records[0];
  if (!record) return res.status(404).json({ error: 'Not found' });
  res.status(200).json(record);
}
