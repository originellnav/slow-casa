// api/map.js
// The Map: every place we love in Mallorca, Ibiza and Menorca on one map.
// Data: Airtable Places (published only; ?preview=1 also shows drafts, noindex).
//
// Design lives in three places, all in this file:
//   PALETTE   the five Slow Casa map colours
//   FILTERS   which Places categories sit under which filter, and their pin colour
//   /map-style.js   recolours Mapbox's light map to the palette and hides clutter
//                   (shared with the homepage map). Once a custom style is made in
//                   Mapbox Studio, put its URL in MAP_STYLE and the recolouring stops.
//
// Pins merge into numbered circles until you zoom in, so the map never shows a pile.
// Clicking a pin opens the card: photo, name, one line, Google Maps and the place page.
// Place pages are reached from the cards here, and from the Magazine and island pages.

const { nav, footer } = require('../lib/nav');
const M = require('../lib/magazine');
const esc = M.esc;

const MAPBOX_TOKEN = 'pk.eyJ1IjoibHVrZXJ5YSIsImEiOiJjbG96cmZ3OTMwMHRyMmlzNHc1bTZkZzI4In0.8Pmo8eeUh48QHBpzqHwNuQ';
// Swap for the Mapbox Studio style URL (mapbox://styles/lukerya/...) once it exists.
const MAP_STYLE = 'mapbox://styles/mapbox/light-v11';
const CUSTOM_STYLE = MAP_STYLE.indexOf('mapbox://styles/mapbox/') !== 0;

const PALETTE = {
  ivory: '#F6F1E8',
  sand: '#D8CDBB',
  olive: '#7B8061',
  ink: '#373D32',
  terracotta: '#B77F61'
};

// Order = order of the filter buttons. A place shows under every filter it
// matches; its pin takes the colour of the first match in PIN_PRIORITY.
const FILTERS = [
  { key: 'eat', label: 'Eat', cats: ['Eat', 'Bakery'], color: PALETTE.terracotta, stroke: PALETTE.ivory },
  { key: 'wine', label: 'Wine & drinks', cats: ['Winery', 'Drink'], color: PALETTE.ink, stroke: PALETTE.ivory },
  { key: 'do', label: 'Experiences', cats: ['Experience', 'Do', 'See', 'Play'], color: PALETTE.olive, stroke: PALETTE.ivory },
  { key: 'beach', label: 'Beach clubs', cats: ['Beach Club', 'Swim'], color: PALETTE.sand, stroke: PALETTE.ink }
];
// Most specific first: a winery that also offers tours is a wine pin.
const PIN_PRIORITY = ['beach', 'wine', 'eat', 'do'];

const ISLAND_BOUNDS = {
  mallorca: [[2.30, 39.25], [3.48, 39.97]],
  menorca: [[3.78, 39.79], [4.33, 40.10]],
  ibiza: [[1.15, 38.62], [1.65, 39.13]] // includes Formentera
};

function filtersFor(cats) {
  return FILTERS.filter(fl => fl.cats.some(c => cats.indexOf(c) !== -1)).map(fl => fl.key);
}

function trim(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  // End on a full sentence when one fits, otherwise on a whole word.
  const stop = cut.lastIndexOf('. ');
  if (stop > max * 0.5) return cut.slice(0, stop + 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '') + '…';
}

module.exports = async function handler(req, res) {
  const preview = !!(req.query && req.query.preview);
  let places = [];
  try {
    places = await M.getPlaces(null, { all: true, drafts: preview });
  } catch (e) { places = []; }

  const features = [];
  for (const p of places) {
    const f = p.fields;
    const c = M.placeCoords(f);
    if (!c || !p.islandKey) continue;
    const cats = M.placeCategories(f);
    const keys = filtersFor(cats);
    if (!keys.length) continue;
    const pin = PIN_PRIORITY.find(k => keys.indexOf(k) !== -1);
    const fl = FILTERS.find(x => x.key === pin);
    const mapsRaw = String(f['Google Maps'] || '').trim();
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
      properties: {
        slug: p.slug,
        name: String(f['Name']).trim(),
        town: String(f['Town'] || '').trim(),
        island: p.islandKey,
        label: fl.label,
        filters: keys.join(' '),
        color: fl.color,
        stroke: fl.stroke,
        text: trim(M.placeText(f), 170),
        img: p.img ? M.imgUrl(p.img, 720) : '',
        maps: /^https?:\/\//i.test(mapsRaw) ? mapsRaw : `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lon}`,
        page: M.placeUrl(p)
      }
    });
  }
  features.sort((a, b) => a.properties.name.localeCompare(b.properties.name));

  // Places at exactly the same spot (two venues in one hotel or estate) would
  // hide each other. Spread them in a small circle, about 30 m apart, so each
  // pin can be clicked. Their pages and Google Maps links keep the real spot.
  const bySpot = {};
  features.forEach(ft => {
    const k = ft.geometry.coordinates.map(n => n.toFixed(5)).join(',');
    (bySpot[k] = bySpot[k] || []).push(ft);
  });
  Object.values(bySpot).forEach(group => {
    if (group.length < 2) return;
    group.forEach((ft, i) => {
      const angle = (2 * Math.PI * i) / group.length;
      const [lon, lat] = ft.geometry.coordinates;
      ft.geometry.coordinates = [lon + 0.00035 * Math.cos(angle), lat + 0.00027 * Math.sin(angle)];
    });
  });

  // /map?format=geojson: the same pins as data, for the homepage map.
  if (req.query && req.query.format === 'geojson') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=86400');
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(200).send(JSON.stringify({ type: 'FeatureCollection', features }));
  }

  const title = 'The Map: Where to Eat, Drink and Go in Mallorca, Ibiza & Menorca | Slow Casa';
  const desc = 'Every restaurant, winery, beach club and experience we love across Mallorca, Ibiza and Menorca, on one map.';
  const config = {
    token: MAPBOX_TOKEN, style: MAP_STYLE, custom: CUSTOM_STYLE, palette: PALETTE,
    filters: FILTERS.map(f => ({ key: f.key, label: f.label })),
    islands: ISLAND_BOUNDS,
    data: { type: 'FeatureCollection', features }
  };

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', preview ? 'no-store' : 'public, max-age=600, stale-while-revalidate=86400');
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="https://slowcasa.com/map" />
  ${preview ? '<meta name="robots" content="noindex" />' : ''}
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="https://slowcasa.com/map" />
  <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <link rel="stylesheet" href="/slow-casa.css" />
  <link rel="stylesheet" href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" />
  <style>
    :root { --mp-ivory: ${PALETTE.ivory}; --mp-sand: ${PALETTE.sand}; --mp-olive: ${PALETTE.olive}; --mp-ink: ${PALETTE.ink}; --mp-terra: ${PALETTE.terracotta}; }
    .mp-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 24px; padding: 16px 48px; border-bottom: 1px solid var(--mp-sand); background: var(--mp-ivory); }
    .mp-title { font-family: var(--display); font-weight: 400; font-size: 15px; letter-spacing: 0.01em; color: var(--mp-ink); margin: 0; }
    .mp-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .mp-chip { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border: 1px solid var(--mp-sand); background: transparent; color: var(--mp-ink); font: inherit; font-size: 14px; letter-spacing: 0.01em; cursor: pointer; }
    .mp-chip:hover { border-color: var(--mp-ink); }
    .mp-chip.on { background: var(--mp-ink); border-color: var(--mp-ink); color: var(--mp-ivory); }
    .mp-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; box-sizing: border-box; }
    .mp-isl { display: flex; gap: 18px; }
    .mp-isl button { background: none; border: 0; padding: 4px 0; font: inherit; font-size: 14px; letter-spacing: 0.01em; color: var(--mp-olive); cursor: pointer; border-bottom: 1px solid transparent; }
    .mp-isl button:hover, .mp-isl button.on { color: var(--mp-ink); border-bottom-color: var(--mp-ink); }
    .mp-wrap { position: relative; height: calc(100vh - 150px); min-height: 520px; background: var(--mp-ivory); }
    #mp-map { position: absolute; inset: 0; }
    .mapboxgl-ctrl-logo { opacity: 0.45; }
    .mapboxgl-ctrl-attrib.mapboxgl-compact { background: transparent !important; }

    /* Email gate: the map sits blurred behind it until an email is given (remembered on this browser) */
    .mp-gate { position: absolute; inset: 0; z-index: 10; display: none; align-items: center; justify-content: center; padding: 24px; background: rgba(246, 241, 232, 0.55); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
    .mp-gated .mp-gate { display: flex; }
    .mp-gate-box { width: 100%; max-width: 440px; background: var(--mp-ivory); border: 1px solid var(--mp-olive); padding: 40px 36px 32px; text-align: center; color: var(--mp-ink); }
    .mp-gate-eyebrow { font-size: 13px; letter-spacing: 0.01em; color: var(--mp-olive); margin: 0 0 14px; }
    .mp-gate-title { font-family: var(--display); font-weight: 400; font-size: 26px; line-height: 1.15; letter-spacing: 0.03em; margin: 0 0 12px; }
    .mp-gate-text { font-size: 15px; font-weight: 300; line-height: 1.55; margin: 0 0 24px; }
    .mp-gate-form { display: flex; border: 1px solid var(--mp-ink); }
    .mp-gate-form input { flex: 1; min-width: 0; border: 0; background: transparent; padding: 14px 16px; font: inherit; font-size: 15px; color: var(--mp-ink); outline: none; }
    .mp-gate-form button { border: 0; background: var(--mp-ink); color: var(--mp-ivory); padding: 0 20px; font: inherit; font-size: 14px; letter-spacing: 0.01em; cursor: pointer; }
    .mp-gate-form button:disabled { opacity: 0.6; cursor: default; }
    .mp-gate-note { font-size: 12px; color: var(--mp-olive); margin: 14px 0 0; min-height: 1em; }
    .mapboxgl-ctrl-group { border-radius: 0 !important; box-shadow: none !important; border: 1px solid var(--mp-sand); }
    .mapboxgl-ctrl-group button { background: var(--mp-ivory) !important; }

    /* The card */
    .mp-card { position: absolute; left: 24px; bottom: 24px; width: 360px; max-width: calc(100% - 48px); background: var(--mp-ivory); border: 1px solid var(--mp-olive); color: var(--mp-ink); display: none; z-index: 5; }
    .mp-card.open { display: block; animation: mpIn 0.25s ease; }
    @keyframes mpIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    .mp-card-img { aspect-ratio: 4 / 3; background: var(--mp-sand); overflow: hidden; }
    .mp-card-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .mp-card-body { padding: 20px 22px 18px; }
    .mp-card-kicker { font-size: 13px; letter-spacing: 0.01em; color: var(--mp-olive); margin: 0 0 8px; }
    .mp-card-name { font-family: var(--display); font-weight: 400; font-size: 22px; line-height: 1.15; letter-spacing: 0.03em; margin: 0 0 10px; }
    .mp-card-text { font-size: 14px; font-weight: 300; line-height: 1.55; margin: 0; }
    .mp-card-actions { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--mp-olive); }
    .mp-card-actions a { padding: 14px 10px; text-align: center; font-size: 14px; letter-spacing: 0.01em; color: var(--mp-terra); }
    .mp-card-actions a + a { border-left: 1px solid var(--mp-olive); }
    .mp-card-actions a:hover { background: var(--mp-terra); color: var(--mp-ivory); }
    .mp-close { position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; border: 0; border-radius: 50%; background: var(--mp-ivory); color: var(--mp-ink); font-size: 20px; line-height: 32px; cursor: pointer; }

    @media (max-width: 768px) {
      .mp-bar { padding: 12px 16px; }
      .mp-chips { flex-wrap: nowrap; overflow-x: auto; width: 100%; padding-bottom: 2px; }
      .mp-chip { flex: 0 0 auto; }
      .mp-wrap { height: calc(100vh - 190px); min-height: 440px; }
      .mp-card { left: 0; right: 0; bottom: 0; width: auto; max-width: none; border-left: 0; border-right: 0; border-bottom: 0; }
      .mp-card-img { aspect-ratio: 16 / 9; }
    }
  </style>
</head>
<body>
  ${nav()}
  <div class="mp-bar">
    <h1 class="mp-title">The map</h1>
    <div class="mp-chips" role="group" aria-label="Filter places">
      <button class="mp-chip on" data-f="all">All</button>
      ${FILTERS.map(f => `<button class="mp-chip" data-f="${f.key}"><span class="mp-dot" style="background:${f.color};${f.stroke === PALETTE.ink ? 'border:1px solid ' + PALETTE.ink + ';' : ''}"></span>${esc(f.label)}</button>`).join('')}
    </div>
    <div class="mp-isl" role="group" aria-label="Jump to island">
      <button data-i="mallorca">Mallorca</button><button data-i="ibiza">Ibiza</button><button data-i="menorca">Menorca</button>
    </div>
  </div>
  <div class="mp-wrap mp-gated" id="mp-wrap">
    <div id="mp-map" aria-label="Map of places"></div>
    <div class="mp-gate" id="mp-gate">
      <form class="mp-gate-box" id="mp-gate-form" novalidate>
        <p class="mp-gate-eyebrow">Free access</p>
        <h2 class="mp-gate-title">Open the map</h2>
        <p class="mp-gate-text">Every restaurant, winery, beach club and experience we love across Mallorca, Ibiza and Menorca. Add your email to open it.</p>
        <div class="mp-gate-form">
          <input type="email" id="mp-gate-email" placeholder="Your email address" autocomplete="email" required aria-label="Email address" />
          <button type="submit" id="mp-gate-btn">Open</button>
        </div>
        <p class="mp-gate-note" id="mp-gate-note">We'll send the odd email about new places. Unsubscribe any time.</p>
      </form>
    </div>
    <article class="mp-card" id="mp-card" aria-live="polite">
      <button class="mp-close" id="mp-close" aria-label="Close">&times;</button>
      <div class="mp-card-img"><img id="mp-card-img" alt="" /></div>
      <div class="mp-card-body">
        <p class="mp-card-kicker" id="mp-card-kicker"></p>
        <h2 class="mp-card-name" id="mp-card-name"></h2>
        <p class="mp-card-text" id="mp-card-text"></p>
      </div>
      <div class="mp-card-actions">
        <a id="mp-card-maps" target="_blank" rel="noopener">Google Maps</a>
        <a id="mp-card-page">View place</a>
      </div>
    </article>
  </div>
  ${footer()}
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>
  <script src="/map-style.js"></script>
  <script>
  (function () {
    var C = ${JSON.stringify(config).replace(/</g, '\\u003c')};
    var P = C.palette;
    if (!window.mapboxgl) return;
    mapboxgl.accessToken = C.token;
    var map = new mapboxgl.Map({ container: 'mp-map', style: C.style, center: [2.9, 39.5], zoom: 7.2, attributionControl: false });
    // Mapbox's terms require the logo and credits; the credits fold into a small (i).
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), 'top-right');

    function styleBaseMap() { SlowCasaMap.style(map, C.style); }

    var active = 'all';
    function dataFor(key) {
      if (key === 'all') return C.data;
      return { type: 'FeatureCollection', features: C.data.features.filter(function (f) { return (' ' + f.properties.filters + ' ').indexOf(' ' + key + ' ') !== -1; }) };
    }

    var card = document.getElementById('mp-card');
    function openCard(pr, coords) {
      var img = document.getElementById('mp-card-img');
      if (pr.img) { img.src = pr.img; img.alt = pr.name; img.parentNode.style.display = ''; } else { img.parentNode.style.display = 'none'; }
      document.getElementById('mp-card-kicker').textContent = [pr.label, pr.town].filter(Boolean).join(' · ');
      document.getElementById('mp-card-name').textContent = pr.name;
      document.getElementById('mp-card-text').textContent = pr.text;
      document.getElementById('mp-card-maps').href = pr.maps;
      document.getElementById('mp-card-page').href = pr.page;
      card.classList.add('open');
      if (coords) map.easeTo({ center: coords, zoom: Math.max(map.getZoom(), 11.5), duration: 700 });
      try { history.replaceState(null, '', '/map?place=' + encodeURIComponent(pr.slug)); } catch (e) {}
    }
    function closeCard() {
      card.classList.remove('open');
      try { history.replaceState(null, '', '/map'); } catch (e) {}
    }
    document.getElementById('mp-close').addEventListener('click', closeCard);

    // ---- Email gate ----
    // Remembered per browser. If storage is blocked, the visitor just enters it again next time.
    var GATE_KEY = 'sc_map_access';
    var wrap = document.getElementById('mp-wrap');
    function hasAccess() { try { return localStorage.getItem(GATE_KEY) === '1'; } catch (e) { return false; } }
    function unlock() {
      try { localStorage.setItem(GATE_KEY, '1'); } catch (e) {}
      wrap.classList.remove('mp-gated');
    }
    if (hasAccess()) wrap.classList.remove('mp-gated');
    document.getElementById('mp-gate-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('mp-gate-email');
      var btn = document.getElementById('mp-gate-btn');
      var note = document.getElementById('mp-gate-note');
      var email = (input.value || '').trim();
      if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) { note.textContent = 'Please enter a valid email address.'; input.focus(); return; }
      btn.disabled = true; btn.textContent = '…';
      fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, source: 'map' }) })
        .catch(function () {})
        .then(function () {
          // Open the map even if the signup call fails: never lock a reader out.
          unlock();
          try { if (window.plausible) window.plausible('Map Signup'); } catch (e) {}
        });
    });

    map.on('load', function () {
      styleBaseMap();
      map.addSource('places', { type: 'geojson', data: C.data, cluster: true, clusterRadius: 44, clusterMaxZoom: 11 });
      map.addLayer({ id: 'clusters', type: 'circle', source: 'places', filter: ['has', 'point_count'],
        paint: { 'circle-color': P.ivory, 'circle-stroke-color': P.ink, 'circle-stroke-width': 1,
          'circle-radius': ['step', ['get', 'point_count'], 15, 5, 19, 12, 23] } });
      map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'places', filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'] },
        paint: { 'text-color': P.ink } });
      map.addLayer({ id: 'pins', type: 'circle', source: 'places', filter: ['!', ['has', 'point_count']],
        paint: SlowCasaMap.pinPaint() });

      map.on('click', 'clusters', function (e) {
        var f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
        map.getSource('places').getClusterExpansionZoom(f.properties.cluster_id, function (err, zoom) {
          if (!err) map.easeTo({ center: f.geometry.coordinates, zoom: zoom + 0.5 });
        });
      });
      map.on('click', 'pins', function (e) {
        var f = e.features[0];
        openCard(f.properties, f.geometry.coordinates.slice());
      });
      ['clusters', 'pins'].forEach(function (l) {
        map.on('mouseenter', l, function () { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', l, function () { map.getCanvas().style.cursor = ''; });
      });

      // Open on all three islands, or straight on a shared place (?place=slug).
      var want = new URLSearchParams(location.search).get('place');
      var hit = want && C.data.features.find(function (f) { return f.properties.slug === want; });
      if (hit) { map.jumpTo({ center: hit.geometry.coordinates, zoom: 12 }); openCard(hit.properties); }
      else map.fitBounds([[1.15, 38.62], [4.33, 40.10]], { padding: 40, duration: 0 });
    });

    document.querySelectorAll('.mp-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        active = b.getAttribute('data-f');
        document.querySelectorAll('.mp-chip').forEach(function (x) { x.classList.toggle('on', x === b); });
        var src = map.getSource('places');
        if (src) src.setData(dataFor(active));
        closeCard();
      });
    });
    document.querySelectorAll('.mp-isl button').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.mp-isl button').forEach(function (x) { x.classList.toggle('on', x === b); });
        map.fitBounds(C.islands[b.getAttribute('data-i')], { padding: 40, duration: 900 });
      });
    });
  })();
  </script>
</body>
</html>`);
};
