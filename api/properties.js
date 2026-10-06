const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = 'appndrnWrdlgxRJAG';

// Fields read by the homepage grid and the /houses map.
// Requesting a field that no longer exists in Airtable makes the whole
// request fail, so this list must match the table.
const FIELDS = [
  'Name',
  'Slug',
  'Location label',
  'Island',
  'Town',
  'Hero Image',
  'Gallery Images',
  'Latitude',
  'Longitude',
  'Date added'
];

// Balearic houses only. Island is the single switch, same as everywhere else.
const FILTER = "LEN({Island} & '') > 0";

const HOMEPAGE_LIMIT = 12;

function buildUrl(extra) {
  const params = [];
  for (const f of FIELDS) params.push('fields%5B%5D=' + encodeURIComponent(f));
  params.push('filterByFormula=' + encodeURIComponent(FILTER));
  params.push('sort%5B0%5D%5Bfield%5D=' + encodeURIComponent('Date added'));
  params.push('sort%5B0%5D%5Bdirection%5D=desc');
  params.push('pageSize=100');
  for (const p of (extra || [])) params.push(p);
  return `https://api.airtable.com/v0/${BASE_ID}/Properties?` + params.join('&');
}

async function airtableGet(url) {
  const response = await fetch(url, {
    headers: { Authorization: 'Bearer ' + AIRTABLE_TOKEN }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error('Airtable ' + response.status + ' ' + body.slice(0, 200));
  }
  return response.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');

  // ?all=true is used by the /houses map, which needs every Balearic house.
  // Without it, the homepage grid only needs the most recent handful.
  const wantAll = !!(req.query && req.query.all);

  try {
    if (!wantAll) {
      const data = await airtableGet(buildUrl(['maxRecords=' + HOMEPAGE_LIMIT]));
      return res.status(200).json({ records: data.records || [] });
    }

    let records = [];
    let offset = null;
    let attempts = 0;
    do {
      const extra = offset ? ['offset=' + encodeURIComponent(offset)] : [];
      const data = await airtableGet(buildUrl(extra));
      records = records.concat(data.records || []);
      offset = data.offset;
      attempts++;
    } while (offset && attempts < 10);

    return res.status(200).json({ records });
  } catch (e) {
    console.error('properties fetch failed:', e && e.message);
    return res.status(502).json({ records: [], error: 'Upstream fetch failed' });
  }
};
