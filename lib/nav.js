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
  { label: 'List Your House', href: 'mailto:' + CONTACT_EMAIL + '?subject=List%20my%20house%20on%20Slow%20Casa' }
];



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
    <a class="site-menu-contact" href="/contact">Contact</a>
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
        <label for="footer-email">Get the Newsletter</label>
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

module.exports = { nav, footer, NAV_ITEMS, MENU_ITEMS, CONTACT_EMAIL };
