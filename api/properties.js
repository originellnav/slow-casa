const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = 'appndrnWrdlgxRJAG';

// Fields the homepage actually reads. Requesting a field that no longer exists
// in Airtable makes the whole request fail, so this list must match the table.
const FIELDS = [
  'Name',
  'Slug',
  'Location label',
  'Island',
  'Town',
  'Hero Image',
  'Gallery Images',
  'Date added'
];

const MAX_RECORDS = 12;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');

  const params = [];
  for (const f of FIELDS) params.push('fields%5B%5D=' + encodeURIComponent(f));
  // Balearic houses only. Island is the single switch, same as everywhere else.
  params.push('filterByFormula=' + encodeURIComponent("LEN({Island} & '') > 0"));
  params.push('sort%5B0%5D%5Bfield%5D=' + encodeURIComponent('Date added'));
  params.push('sort%5B0%5D%5Bdirection%5D=desc');
  params.push('maxRecords=' + MAX_RECORDS);

  const url = `https://api.airtable.com/v0/${BASE_ID}/Properties?` + params.join('&');

  try {
    const response = await fetch(url, {
      headers: { Authorization: 'Bearer ' + AIRTABLE_TOKEN }
    });
    if (!response.ok) {
      const body = await response.text();
      console.error('Airtable error', response.status, body);
      return res.status(502).json({ records: [], error: 'Airtable ' + response.status });
    }
    const data = await response.json();
    return res.status(200).json({ records: data.records || [] });
  } catch (e) {
    console.error('properties fetch failed', e);
    return res.status(502).json({ records: [], error: 'fetch failed' });
  }
};
