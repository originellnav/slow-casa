const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
 
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
      Authorization: 'Bearer ' + AIRTABLE_TOKEN
    }
  });
  const data = await response.json();
  res.status(200).json(data);
}
 
