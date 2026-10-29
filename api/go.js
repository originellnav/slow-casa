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

async function getBookingMap(fresh) {
  if (!fresh && BOOKING_MAP_CACHE && (Date.now() - BOOKING_MAP_CACHED_AT) < CACHE_TTL_MS) {
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
      let booking = String((rec.fields && rec.fields['Booking URL']) || '').trim();
      // Accept "www.example.com" as well as "https://www.example.com".
      // The house page shows Book whenever this field is filled, so /go must work too.
      if (booking && !/^https?:\/\//i.test(booking) && /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(booking)) {
        booking = 'https://' + booking;
      }
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

// ---- Car hire (partner link) ----
// /go/car-hire-{guide slug} -> the car hire URL saved once in Sanity (Partners page).
// One link for every guide; the guide slug is kept so Plausible shows clicks per guide.
const CAR_HIRE_PREFIX = 'car-hire-';
const SANITY_PARTNERS_URL = 'https://hchp27po.apicdn.sanity.io/v2024-01-01/data/query/production?query=' +
  encodeURIComponent('*[_type == "partners"][0].carHireUrl');
let CAR_HIRE_URL_CACHE = null;
let CAR_HIRE_CACHED_AT = 0;

async function getCarHireUrl() {
  if (CAR_HIRE_URL_CACHE && (Date.now() - CAR_HIRE_CACHED_AT) < CACHE_TTL_MS) {
    return CAR_HIRE_URL_CACHE;
  }
  const resp = await fetch(SANITY_PARTNERS_URL);
  if (!resp.ok) throw new Error(`Sanity ${resp.status}`);
  const data = await resp.json();
  const url = String(data.result || '').trim();
  CAR_HIRE_URL_CACHE = /^https?:\/\//i.test(url) ? url : null;
  CAR_HIRE_CACHED_AT = Date.now();
  return CAR_HIRE_URL_CACHE;
}

// ---- Places (recommended restaurants, bars, beaches...) ----
// /go/place-{place slug} -> the place's own website, from Airtable Places.
// Counted as "Place Click", so each place's page can show how many visitors we send it.
const PLACE_PREFIX = 'place-';

async function getPlaceWebsite(placeSlug) {
  const M = require('../lib/magazine');
  const places = await M.getPlaces(null, { all: true });
  const p = places.find(x => x.slug === placeSlug);
  return p ? M.placeLink(p.fields) : '';
}

function sendPlausibleEvent(req, slug, kind) {
  // Fire-and-forget; a logging failure must never block the visitor's redirect.
  const isCarHire = kind === 'car-hire';
  const isPlace = kind === 'place';
  const payload = JSON.stringify({
    name: isCarHire ? 'Car Hire Click' : isPlace ? 'Place Click' : 'Booking Click',
    url: `https://${PLAUSIBLE_DOMAIN}/go/${slug}`,
    domain: PLAUSIBLE_DOMAIN,
    referrer: req.headers['referer'] || '',
    props: isCarHire ? { guide: slug.slice(CAR_HIRE_PREFIX.length) }
      : isPlace ? { place: slug.slice(PLACE_PREFIX.length) }
      : { property: slug }
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

    if (slug.startsWith(CAR_HIRE_PREFIX)) {
      const carHire = await getCarHireUrl();
      if (!carHire) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain');
        return res.end('Not found');
      }
      sendPlausibleEvent(req, slug, 'car-hire');
      res.statusCode = 302;
      res.setHeader('Location', carHire);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      return res.end();
    }

    if (slug.startsWith(PLACE_PREFIX)) {
      const site = await getPlaceWebsite(slug.slice(PLACE_PREFIX.length));
      if (!site) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain');
        return res.end('Not found');
      }
      sendPlausibleEvent(req, slug, 'place');
      res.statusCode = 302;
      res.setHeader('Location', site);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      return res.end();
    }

    let target = (await getBookingMap())[slug];
    // A house added in the last few minutes isn't in the saved list yet, so look again
    // before saying "Not found".
    if (!target) target = (await getBookingMap(true))[slug];
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
