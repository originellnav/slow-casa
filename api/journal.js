module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const projectId = 'hchp27po';
  const dataset = 'production';
  const apiVersion = '2024-01-01';

  const query = `*[_type == "locationGuide"] | order(publishedAt desc) {
    title,
    "slug": slug.current,
    category,
    location,
    publishedAt,
    "heroImage": heroImage.asset->url
  }`;

  const url = `https://${projectId}.apicdn.sanity.io/v${apiVersion}/data/query/${dataset}?query=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data.result || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
}

