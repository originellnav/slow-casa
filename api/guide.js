module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const slug = req.query.slug;
  if (!slug) {
    return res.status(400).json({ error: 'slug required' });
  }

  const projectId = process.env.SANITY_PROJECT_ID;
  const token = process.env.SANITY_TOKEN;
  const dataset = 'production';
  const apiVersion = '2024-01-01';

  const query = encodeURIComponent(`*[_type == "locationGuide" && slug.current == "${slug}"][0]{
    title,
    location,
    region,
    publishedAt,
    "heroImage": heroImage.asset->url,
    body[]{
      ...,
      _type == "image" => {
        ...,
        "imageUrl": asset->url,
        caption
      }
    }
  }`);

  const url = `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}?query=${query}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const data = await response.json();
    res.status(200).json(data.result || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch guide' });
  }
}
