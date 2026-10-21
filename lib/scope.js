// lib/scope.js
// Slow Casa covers the Balearic Islands only. This file holds the one rule
// for what is in scope, and the "gone" page for everything that isn't.
//
// Pages from before the Balearic focus (houses, guides and architects elsewhere
// in Europe) answer 410 Gone, so Google drops them for good instead of
// treating them as thin or duplicate pages.

const BALEARIC = ['mallorca', 'ibiza', 'menorca', 'formentera'];

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// "Mallorca" -> "mallorca"; anything else -> ''.
function balearicIsland(value) {
  const k = norm(value);
  return BALEARIC.indexOf(k) !== -1 ? k : '';
}

// An architect is in scope when they are based on the islands or have
// designed at least one Balearic house in the collection.
// propById: Map of property record id -> record (optional).
function architectInScope(fields, propById) {
  const f = fields || {};
  const where = norm([f['Location'], f['Country']].join(' '));
  if (BALEARIC.some(i => where.indexOf(i) !== -1)) return true;
  const linked = Array.isArray(f['Properties']) ? f['Properties'] : [];
  if (!propById) return false;
  return linked.some(id => {
    const p = propById.get(id);
    return p && balearicIsland((p.fields || {})['Island']);
  });
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 410 Gone: the page was removed on purpose and is not coming back.
function gone(res, what) {
  res.statusCode = 410;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.end(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>No longer on Slow Casa</title><meta name="robots" content="noindex" /></head>
<body style="font-family:system-ui,sans-serif;max-width:600px;margin:80px auto;padding:0 24px;text-align:center;line-height:1.6;">
<h1 style="font-weight:400;">This ${esc(what || 'page')} is no longer on Slow Casa</h1>
<p>Slow Casa now covers Mallorca, Ibiza and Menorca only.</p>
<p><a href="/houses">Houses to rent</a> &nbsp;·&nbsp; <a href="/magazine">The Magazine</a></p>
</body></html>`);
}

module.exports = { BALEARIC, balearicIsland, architectInScope, gone };
