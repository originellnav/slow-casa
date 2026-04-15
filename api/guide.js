module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const slug = req.query.slug;
  const projectId = 'hchp27po';
const token = process.env.SANITY_TOKEN;
  const dataset = 'production';
  const apiVersion = '2024-01-01';

  const query = `*[_type == "locationGuide" && slug.current == '${slug}'][0]{
    title,
    location,
    region,
    "heroImage": heroImage.asset->url,
    body[]{
      ...,
      _type == "image" => {
        ...,
        "imageUrl": asset->url,
        caption
      }
    }
  }`;

  const url = `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}?query=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const raw = await response.json();
    res.status(200).json({
      debug: {
        slug,
        projectId,
        hasToken: !!token,
        url,
        status: response.status
      },
      raw
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
