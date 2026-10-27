const { normaliseProperty } = require('../lib/props');
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = 'appndrnWrdlgxRJAG';

// Fields read by the homepage grid and the /houses map. The request asks for
// every field (so deleting a column in Airtable can never break it), then each
// record is filled in by lib/props.js and trimmed to these before sending.
const FIELDS = [
  'Name', 'Slug', 'Location label', 'Island', 'Town',
  'Hero Image', 'Gallery Images', 'Latitude', 'Longitude', 'Date added'
];

// Balearic houses only. Island is the single switch, same as everywhere else.
const FILTER = "LEN({Island} & '') > 0";

const HOMEPAGE_LIMIT = 12;

function buildUrl(offset) {
  const params = ['filterByFormula=' + encodeURIComponent(FILTER), 'pageSize=100'];
  if (offset) params.push('offset=' + encodeURIComponent(offset));
  return `https://api.airtable.com/v0/${BASE_ID}/Properties?` + params.join('&');
}

function slim(rec) {
  const out = {};
  FIELDS.forEach(k => { if (rec.fields[k] !== undefined && rec.fields[k] !== '') out[k] = rec.fields[k]; });
  return { id: rec.id, createdTime: rec.createdTime, fields: out };
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
    let records = [];
    let offset = null;
    let attempts = 0;
    do {
      const data = await airtableGet(buildUrl(offset));
      records = records.concat((data.records || []).map(normaliseProperty));
      offset = data.offset;
      attempts++;
    } while (offset && attempts < 10);

    // Newest first (Date added, else when the row was created in Airtable).
    records.sort((a, b) => String(b.fields['Date added'] || '').localeCompare(String(a.fields['Date added'] || '')));
    if (!wantAll) records = records.slice(0, HOMEPAGE_LIMIT);
    return res.status(200).json({ records: records.map(slim) });
  } catch (e) {
    console.error('properties fetch failed:', e && e.message);
    return res.status(502).json({ records: [], error: 'Upstream fetch failed' });
  }
};
