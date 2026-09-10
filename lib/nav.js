// lib/nav.js
// Single source of truth for the site navigation and footer.
// Every serverless page function requires this. The three static pages
// (index.html, about.html, map.html) carry the same markup by hand.

const NAV_ITEMS = [
  { label: 'Homes',  href: '/directory' },
  { label: 'Places', href: '/places' },
  { label: 'Map',    href: '/map' }
];

const FOOTER_ITEMS = [
  { label: 'About',      href: '/about' },
  { label: 'Newsletter', href: 'https://newsletter.slowcasa.com/subscribe', external: true },
  { label: 'Instagram',  href: 'https://www.instagram.com/theslowcasa/',    external: true }
];

/**
 * Returns the full <nav> element.
 * @param {Object} [opts]
 * @param {boolean} [opts.hero] - true where the nav sits over a full-bleed
 *   hero image and needs white text. Adds class="hero-nav".
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

/** Returns the full <footer> element. */
function footer() {
  const year = new Date().getFullYear();
  const items = FOOTER_ITEMS
    .map(i => `<a href="${i.href}"${i.external ? ' target="_blank" rel="noopener"' : ''}>${i.label}</a>`)
    .join('\n      ');

  return `<footer>
    <div class="footer-left">
      <span class="footer-copy">&copy; ${year} Slow Casa</span>
      <a href="/privacy" class="footer-policy">Privacy</a>
    </div>
    <div class="footer-links">
      ${items}
    </div>
  </footer>`;
}

module.exports = { nav, footer, NAV_ITEMS, FOOTER_ITEMS };
