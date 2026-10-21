// lib/nav.js
// Single source of truth for the site header, slide-out menu and footer.
// Every serverless page function requires this. The static pages
// (index.html, about.html, map.html, privacy.html, contact.html) carry the same markup
// by hand: if you change NAV_HTML here, paste the output into those too.
// Styles live in slow-casa.css (search "SITE NAV"). Behaviour lives in /menu.js.

const CONTACT_EMAIL = 'luke@slowcasa.com';

// Shown in the top bar on desktop. On phones only the Menu button shows.
const NAV_ITEMS = [
  { label: 'The Collection', href: '/houses' },
  { label: 'Magazine', href: '/magazine' }
];

// Shown in the slide-out menu.
const MENU_ITEMS = [
  { label: 'The Collection',  href: '/houses' },
  { label: 'Magazine',        href: '/magazine' },
  { label: 'Map',             href: '/map' },
  { label: 'List your house', href: 'mailto:' + CONTACT_EMAIL + '?subject=List%20my%20house%20on%20Slow%20Casa' }
];

// Shown smaller, under the main links in the slide-out menu.
const ISLAND_ITEMS = [
  { label: 'Mallorca', href: '/mallorca' },
  { label: 'Ibiza',    href: '/ibiza' },
  { label: 'Menorca',  href: '/menorca' }
];

const ICON_INSTAGRAM = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.6"/></svg>';
const ICON_MAIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14"/><path d="M3 6l9 7 9-7"/></svg>';
const ICON_NEWSLETTER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>';

/**
 * Returns the header bar, the slide-out menu and the script tag that runs it.
 * opts is accepted for backwards compatibility and ignored.
 */
function nav(opts) {
  const barLinks = NAV_ITEMS
    .map(i => `<a class="site-nav-link" href="${i.href}">${i.label}</a>`)
    .join('\n      ');
  const menuLinks = MENU_ITEMS
    .map(i => `<a href="${i.href}">${i.label}</a>`)
    .join('\n      ');
  const islandLinks = ISLAND_ITEMS
    .map(i => `<a href="${i.href}">${i.label}</a>`)
    .join('\n      ');

  return `<header class="site-nav">
    <a href="/" class="wordmark">Slow Casa</a>
    <div class="site-nav-right">
      ${barLinks}
      <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-menu">Menu <i class="burger" aria-hidden="true"></i></button>
    </div>
  </header>
  <div class="menu-scrim" data-menu-close></div>
  <aside class="site-menu" id="site-menu" aria-label="Menu" aria-hidden="true" inert>
    <div class="site-menu-top">
      <button class="menu-close" type="button" data-menu-close>Close <i class="burger is-x" aria-hidden="true"></i></button>
    </div>
    <div class="site-menu-links">
      ${menuLinks}
    </div>
    <nav class="site-menu-sub" aria-label="Islands">
      ${islandLinks}
    </nav>
    <a class="site-menu-contact" href="/contact">Contact</a>
    <div class="site-menu-foot">
      <a href="mailto:${CONTACT_EMAIL}">${ICON_MAIL}${CONTACT_EMAIL}</a>
      <a href="https://www.instagram.com/theslowcasa/" target="_blank" rel="noopener">${ICON_INSTAGRAM}@theslowcasa</a>
      <a href="https://newsletter.slowcasa.com/?modal=signup" target="_blank" rel="noopener">${ICON_NEWSLETTER}The newsletter</a>
    </div>
  </aside>
  <script src="/menu.js" defer></script>`;
}

/**
 * Returns the full <footer>: copyright on the left; newsletter sign-up and
 * links on the right, all on one line on desktop. The sign-up is handled in /menu.js.
 */
function footer() {
  const year = new Date().getFullYear();
  return `<footer class="site-footer">
    <span class="footer-copy">&copy; ${year} Slow Casa</span>
    <div class="footer-right">
      <form class="footer-signup" novalidate>
        <label for="footer-email">Get the newsletter</label>
        <input id="footer-email" name="email" type="email" placeholder="Your email" autocomplete="email" />
        <button type="submit" aria-label="Subscribe"><svg viewBox="0 0 9 15" aria-hidden="true"><path d="M1 1l6.5 6.5L1 14"/></svg></button>
        <span class="footer-signup-msg" role="status" aria-live="polite"></span>
      </form>
      <nav class="footer-links" aria-label="Footer">
        <a href="https://www.instagram.com/theslowcasa/" target="_blank" rel="noopener">Instagram</a>
        <a href="/privacy">Privacy</a>
        <a href="/contact">Contact</a>
      </nav>
    </div>
  </footer>`;
}

module.exports = { nav, footer, NAV_ITEMS, MENU_ITEMS, ISLAND_ITEMS, CONTACT_EMAIL };
