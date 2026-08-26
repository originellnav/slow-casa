// lib/nav.js
// Single source of truth for the site navigation.
// Every serverless page function requires this, so the nav is changed in one
// place. index.html is static and cannot require it, so its nav markup has to
// be kept in sync by hand until the homepage becomes a function too.

const NAV_ITEMS = [
  { label: 'House Tours',    href: '/house-tours' },
  { label: 'Village Guides', href: '/guides' },
  { label: 'How To',         href: '/how-to' },
  { label: 'Vacation Homes', href: '/directory' }
];

/**
 * Returns the full <nav> element.
 * @param {Object} [opts]
 * @param {boolean} [opts.hero] - true on pages where the nav sits over a
 *   full-bleed hero image (white text). Adds class="hero-nav".
 */
function nav(opts) {
  const hero = !!(opts && opts.hero);
  const items = NAV_ITEMS
    .map(i => `<li><a href="${i.href}">${i.label}</a></li>`)
    .join('\n      ');

  return `<nav${hero ? ' id="main-nav" class="hero-nav"' : ''}>
    <div></div>
    <a href="/" class="wordmark">Slow Casa</a>
    <ul class="nav-links">
      ${items}
    </ul>
  </nav>`;
}

module.exports = { nav, NAV_ITEMS };
