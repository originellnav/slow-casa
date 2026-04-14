module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  var url;
  if (req.query.all) {
    url = 'https://api.airtable.com/v0/appndrnWrdlgxRJAG/Properties?maxRecords=100';
  } else {
    url = 'https://api.airtable.com/v0/appndrnWrdlgxRJAG/Properties?maxRecords=6&filterByFormula={Featured}=1';
  }
  const response = await fetch(url, {
    headers: {
      Authorization: 'Bearer patgpNhgfFkQsyQj9.887202d16495ba49fad025cb888cef3eac0a6c34058675dd2516127ad083d8c6'
    }
  });

  const data = await response.json();
  res.status(200).json(data);
}
