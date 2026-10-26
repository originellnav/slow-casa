// lib/card.js
// The one house card used everywhere a list of houses appears:
// /houses, the island pages and "Nearby houses" on each house page.
// Styles live in slow-casa.css (search "HOUSE CARD"). Change the card here,
// never by hand in a page file, so every list stays the same.

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {Object} o
 * @param {string} o.url     link to the house page
 * @param {string} o.img     image URL, already sized by the caller (or '')
 * @param {string} o.name    house name
 * @param {number|string} [o.guests]  Sleeps
 * @param {string} [o.place] town or area
 * @param {string} [o.attrs] extra raw attributes for the <a> (data-*), caller escapes
 * @param {string} [o.cls]   extra classes for the <a>
 * @param {string} [o.imgAttrs] extra raw attributes for the <img>
 */
function houseCard(o) {
  const meta = [
    o.guests ? esc(o.guests) + ' guests' : '',
    o.place ? esc(o.place) : ''
  ].filter(Boolean).join(' <span class="house-card-dot" aria-hidden="true">&#10022;</span> ');

  return `<a class="house-card${o.cls ? ' ' + o.cls : ''}" href="${esc(o.url)}"${o.attrs ? ' ' + o.attrs : ''}>
      <div class="house-card-img">${o.img ? `<img src="${esc(o.img)}" alt="${esc(o.name)}" loading="lazy"${o.imgAttrs ? ' ' + o.imgAttrs : ''} />` : ''}</div>
      <p class="house-card-name"><span>${esc(o.name)}</span></p>
      ${meta ? `<p class="house-card-meta">${meta}</p>` : ''}
    </a>`;
}

// Town first, then the first part of the location label ("Port Sóller · Mallorca").
function placeOf(fields) {
  const town = String(fields['Town'] || '').trim();
  if (town) return town;
  return String(fields['Location label'] || '').split('·')[0].trim();
}

module.exports = { houseCard, placeOf };
