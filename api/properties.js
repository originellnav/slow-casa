export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const response = await fetch(
    `https://api.airtable.com/v0/appndrnWrdlgxRJAG/Properties?maxRecords=6&sort[0][field]=Date Added&sort[0][direction]=desc`,
    {
      headers: {
        Authorization: `Bearer patgpNhgfFkQsyQj9.a5ad03a8c5e7a2d36220cb4641160af88dc84a082811b0f3c702789679360d66`
      }
    }
  );

  const data = await response.json();
  res.status(200).json(data);
}
