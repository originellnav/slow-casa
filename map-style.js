// map-style.js
// The one place the Slow Casa map look is defined, shared by /map and the
// homepage map. Mapbox's light map is recoloured to the palette and the
// clutter (shops, bus stops, small roads, buildings, borders) is hidden.
// When a custom Mapbox Studio style is used instead, SlowCasaMap.style() does
// nothing, because the style already carries the look.
(function () {
  var PALETTE = {
    ivory: '#F6F1E8',
    sand: '#D8CDBB',
    olive: '#7B8061',
    ink: '#373D32',
    terracotta: '#B77F61',
    green: '#E7E5D6',
    road: '#E6DCCB'
  };
  var BASE_STYLE = 'mapbox://styles/mapbox/light-v11';

  function style(map, styleUrl) {
    if (styleUrl && styleUrl.indexOf('mapbox://styles/mapbox/') !== 0) return;
    var P = PALETTE;
    var hideRe = /(poi|transit|airport|ferry|road-number|road-exit|shield|building|aeroway|path|steps|pedestrian|road-minor|road-street|road-service|road-track|golf|admin-1|admin-2)/;
    var roadRe = /(road|bridge|tunnel)/;
    map.getStyle().layers.forEach(function (l) {
      var id = l.id;
      try {
        if (hideRe.test(id)) { map.setLayoutProperty(id, 'visibility', 'none'); return; }
        if (l.type === 'background') map.setPaintProperty(id, 'background-color', P.ivory);
        else if (l.type === 'fill' && /water/.test(id)) map.setPaintProperty(id, 'fill-color', P.sand);
        else if (l.type === 'line' && /water/.test(id)) map.setPaintProperty(id, 'line-color', P.sand);
        else if (l.type === 'fill' && /(land|park|national|wood|grass|scrub|crop|pitch)/.test(id)) {
          map.setPaintProperty(id, 'fill-color', P.green); map.setPaintProperty(id, 'fill-opacity', 0.7);
        }
        else if (l.type === 'line' && roadRe.test(id)) map.setPaintProperty(id, 'line-color', P.road);
        else if (l.type === 'line' && /admin/.test(id)) map.setLayoutProperty(id, 'visibility', 'none');
        else if (l.type === 'symbol') {
          if (roadRe.test(id)) { map.setLayoutProperty(id, 'visibility', 'none'); return; }
          map.setPaintProperty(id, 'text-color', /(settlement-minor|natural|water)/.test(id) ? P.olive : P.ink);
          map.setPaintProperty(id, 'text-halo-color', P.ivory);
        }
      } catch (e) { /* layer without that property: leave it */ }
    });
  }

  // The pins: one circle per place, coloured by the "color"/"stroke" properties
  // set on each feature by /map.
  function pinPaint(scale) {
    scale = scale || 1;
    return {
      'circle-color': ['get', 'color'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 6 * scale, 14, 9 * scale],
      'circle-stroke-color': ['get', 'stroke'],
      'circle-stroke-width': 1.5
    };
  }

  window.SlowCasaMap = { PALETTE: PALETTE, BASE_STYLE: BASE_STYLE, style: style, pinPaint: pinPaint };
})();
