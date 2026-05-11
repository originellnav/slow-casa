const AIRTABLE_TOKEN = 'patgpNhgfFkQsyQj9.887202d16495ba49fad025cb888cef3eac0a6c34058675dd2516127ad083d8c6';
const BASE_ID = 'appndrnWrdlgxRJAG';

module.exports = async function handler(req, res) {
  const { slug } = req.query;
  if (!slug) return res.status(400).send('Missing slug');

  const formula = encodeURIComponent(`{Slug} = "${slug}"`);
  const url = `https://api.airtable.com/v0/${BASE_ID}/Properties?filterByFormula=${formula}&maxRecords=1`;

  let record;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Cache-Control': 'no-cache' }
    });
    const data = await response.json();
    record = data.records && data.records[0];
  } catch(e) {
    return res.status(500).send('Error fetching property');
  }

  if (!record) return res.status(404).send('Property not found');

  const f = record.fields;
  const name = (f['Name'] || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const location = f['Location label'] || '';
  const description = (f['Description'] || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const architect = f['Architect'] || '';
  const architectUrl = f['Architect URL'] || '';
  const heroImage = f['Hero Image'] || (f['Images'] && f['Images'][0] && f['Images'][0].url) || '';
  const bookingUrl = f['Booking URL'] || '#';
  const country = f['Country'] || '';
  const editorialTitle = f['Editorial Title'] || '';
  const introOne = f['Intro One'] || '';
  const introTwo = f['Intro Two'] || '';
  const architectFeature = f['Architect Feature'] || '';
  const localFavourites = f['Local Favourites'] || '';
  const galleryImagesRaw = f['Gallery Images'] || '';

  const galleryImages = galleryImagesRaw
    .split('\n')
    .map(u => u.trim())
    .filter(Boolean);

  const attachmentImages = (f['Images'] || []).map(img =>
    (img.thumbnails && img.thumbnails.full) ? img.thumbnails.full.url : img.url
  );
  const images = galleryImages.length ? galleryImages : attachmentImages;

  const title = `${name} — ${location} | Slow Casa`;
  const metaDesc = description ? description.substring(0, 155) : `${name} is a design-first vacation home in ${location}. Discover it on Slow Casa — curated architect-designed homes in ${country}.`;
  const canonicalUrl = `https://slowcasa.com/properties/${slug}`;

  function buildGallery(imgs) {
    if (!imgs.length) return '';
    let html = '<div class="prop-gallery">';
    for (let i = 0; i < imgs.length; i += 2) {
      if (i + 1 < imgs.length) {
        html += `<div class="prop-gallery-row two-col">
          <div class="prop-gallery-img"><img src="${imgs[i]}" alt="${name}" loading="lazy" /></div>
          <div class="prop-gallery-img"><img src="${imgs[i+1]}" alt="${name}" loading="lazy" /></div>
        </div>`;
      } else {
        html += `<div class="prop-gallery-row one-col">
          <div class="prop-gallery-img"><img src="${imgs[i]}" alt="${name}" loading="lazy" /></div>
        </div>`;
      }
    }
    html += '</div>';
    return html;
  }

  function buildFavourites(favs) {
    if (!favs) return '';
    const lines = favs.split('\n').map(l => l.trim()).filter(B
