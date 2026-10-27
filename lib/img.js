// lib/img.js
// Photos that are not on Cloudinary yet (a house's own website, Squarespace,
// Airbnb...) go through Cloudinary's "fetch" delivery. Cloudinary copies the
// photo once, keeps it, and serves it resized and compressed like an uploaded
// one, so the page stays fast and the photo survives if the original moves.
// Needs "Fetched URL" allowed in Cloudinary: Settings > Security.

const CLOUD = 'dw1wmo2go';

function fetchUrl(url, width) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) return u;
  if (/res\.cloudinary\.com|cdn\.sanity\.io/i.test(u)) return u;
  const w = Math.round(Number(width) || 1600);
  return `https://res.cloudinary.com/${CLOUD}/image/fetch/c_limit,w_${w},q_auto,f_auto/${encodeURIComponent(u)}`;
}

module.exports = { fetchUrl, CLOUD };
