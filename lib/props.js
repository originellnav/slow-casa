// lib/props.js
// Fills in house fields that are no longer typed into Airtable, so the rest of
// the site can keep reading them as before. Run every Properties record
// through normaliseProperty() straight after fetching it.
//
//   Coordinates "39.79, 2.69"  -> Latitude, Longitude
//   Town + Island              -> Location label ("Port Sóller · Mallorca")
//   Airtable created time      -> Date added
//   start of Intro             -> Description (the Google snippet)
//   first Gallery Images line  -> Hero Image (the rest stay in Gallery Images)
//
// A value already in Airtable always wins, so old records keep working while
// the old fields still exist.

function lines(v) {
  return String(v || '').split('\n').map(s => s.trim()).filter(s => /^https?:\/\//i.test(s));
}

function snippet(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = cut.lastIndexOf('. ');
  if (stop > max * 0.5) return cut.slice(0, stop + 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '') + '...';
}

function normaliseProperty(record) {
  if (!record || !record.fields) return record;
  const f = record.fields;

  if ((f['Latitude'] == null || f['Latitude'] === '') && f['Coordinates']) {
    const m = String(f['Coordinates']).match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (m) { f['Latitude'] = m[1]; f['Longitude'] = m[2]; }
  }

  if (!f['Location label']) {
    const town = String(f['Town'] || '').trim();
    const island = String(f['Island'] || '').trim();
    const label = [town, island].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ');
    if (label) f['Location label'] = label;
  }

  if (!f['Date added'] && record.createdTime) f['Date added'] = String(record.createdTime).slice(0, 10);

  if (!f['Description'] && f['Intro']) f['Description'] = snippet(f['Intro'], 155);

  if (!f['Hero Image']) {
    const gal = lines(f['Gallery Images']);
    if (gal.length) {
      f['Hero Image'] = gal[0];
      f['Gallery Images'] = gal.slice(1).join('\n');
    }
  }

  return record;
}

module.exports = { normaliseProperty };
