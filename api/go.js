// api/go.js
// Tracked outbound redirect: /go/{slug} -> logs a "Booking Click" event -> 302 to the property's Booking URL.
// The event is sent server-side to Plausible, so it counts even when visitors run ad blockers.
// This endpoint is the basis of the per-property lead numbers shown to owners.

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = 'appndrnWrdlgxRJAG';
const PROPERTIES_TABLE = 'Properties';
const PLAUSIBLE_DOMAIN = 'slowcasa.com';

const CACHE_TTL_MS = 5 * 60 * 1000;
let BOOKING_MAP_CACHE = null; // { slug: bookingUrl }
let BOOKING_MAP_CACHED_AT = 0;

async function getBookingMap() {
  if (BOOKING_MAP_CACHE && (Date.now() - BOOKING_MAP_CACHED_AT) < CACHE_TTL_MS) {
    return BOOKING_MAP_CACHE;
  }
  const map = {};
  let offset = '';
  do {
    const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(PROPERTIES_TABLE)}?pageSize=100&fields%5B%5D=Slug&fields%5B%5D=Booking%20URL${offset ? `&offset=${offset}` : ''}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Cache-Control': 'no-cache' }
    });
    if (!resp.ok) throw new Error(`Airtable ${resp.status}`);
    const data = await resp.json();
    for (const rec of data.records || []) {
      const slug = rec.fields && rec.fields['Slug'];
      const booking = rec.fields && rec.fields['Booking URL'];
      if (slug && booking && /^https?:\/\//i.test(booking)) {
        map[String(slug).trim().toLowerCase()] = booking.trim();
      }
    }
    offset = data.offset || '';
  } while (offset);
  BOOKING_MAP_CACHE = map;
  BOOKING_MAP_CACHED_AT = Date.now();
  return map;
}

function sendPlausibleEvent(req, slug) {
  // Fire-and-forget; a logging failure must never block the visitor's redirect.
  const payload = JSON.stringify({
    name: 'Booking Click',
    url: `https://${PLAUSIBLE_DOMAIN}/go/${slug}`,
    domain: PLAUSIBLE_DOMAIN,
    referrer: req.headers['referer'] || '',
    props: { property: slug }
  });
  return fetch('https://plausible.io/api/event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': req.headers['user-agent'] || 'unknown',
      'X-Forwarded-For': (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    },
    body: payload
  }).catch((e) => { console.error('plausible event failed:', e && e.message); });
}

module.exports = async function handler(req, res) {
  try {
    const raw = (req.query && (req.query.slug || req.query.s)) || '';
    const slug = String(raw).trim().toLowerCase();
    if (!slug || slug.length > 120) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain');
      return res.end('Not found');
    }

    const map = await getBookingMap();
    const target = map[slug];
    if (!target) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain');
      return res.end('Not found');
    }

    // Log, but don't wait longer than the redirect needs.
    sendPlausibleEvent(req, slug);

    res.statusCode = 302;
    res.setHeader('Location', target);
    res.setHeader('Cache-Control', 'no-store'); // every click must hit this function to be counted
    return res.end();
  } catch (e) {
    console.error('go.js error:', e && e.message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    return res.end('Something went wrong');
  }
};
