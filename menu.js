// menu.js: opens and closes the slide-out site menu.
// Markup comes from lib/nav.js (and the copies in the static pages).
(function () {
  // Footer newsletter sign-up (on every page).
  var form = document.querySelector('.footer-signup');
  var pageLoaded = Date.now();
  if (form) {
    var input = form.querySelector('input');
    var msg = form.querySelector('.footer-signup-msg');
    var sending = false;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (input.value || '').trim();
      if (!email || email.indexOf('@') < 1) { msg.textContent = 'Please enter your email.'; input.focus(); return; }
      if (sending) return;
      sending = true; msg.textContent = 'Sending...';
      fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: 'footer', t: Date.now() - pageLoaded })
      }).then(function (r) {
        if (!r.ok) throw new Error('failed');
        form.classList.add('is-done');
        msg.textContent = 'Thanks, you are on the list.';
      }).catch(function () {
        msg.textContent = 'That did not work. Please try again.';
      }).then(function () { sending = false; });
    });
  }
})();

(function () {
  var btn = document.querySelector('.menu-btn');
  var menu = document.getElementById('site-menu');
  if (!btn || !menu) return;
  var root = document.documentElement;

  function setOpen(open) {
    root.classList.toggle('menu-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      menu.removeAttribute('inert');
      var first = menu.querySelector('.menu-close');
      if (first) first.focus();
    } else {
      menu.setAttribute('inert', '');
      btn.focus();
    }
  }

  btn.addEventListener('click', function () { setOpen(true); });
  document.querySelectorAll('[data-menu-close]').forEach(function (el) {
    el.addEventListener('click', function () { setOpen(false); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && root.classList.contains('menu-open')) setOpen(false);
  });
  // Sticky nav: add a hairline under it once the page has scrolled.
  var bar = document.querySelector('.site-nav');
  if (bar) {
    // Over a hero photo the bar stays see-through a little longer before turning white.
    var limit = document.body.classList.contains('nav-over') ? 60 : 4;
    var onScroll = function () { bar.classList.toggle('is-stuck', window.scrollY > limit); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();

// Island clock in the nav: "14:32 in Mallorca. Siesta."
// Balearic local time, a line for each part of the day, and the island name
// rotating every few seconds. Added here so every page gets it without
// editing each copy of the nav markup. Hidden on small screens.
(function () {
  var bar = document.querySelector('.site-nav');
  if (!bar || !window.Intl) return;
  var ISLANDS = ['Mallorca', 'Ibiza', 'Menorca'];
  // [start minute of day, line]
  var MOMENTS = [
    [0, 'Stars out'],
    [6 * 60, 'Café con leche'],
    [10 * 60, 'Swim time'],
    [14 * 60, 'Siesta'],
    [17 * 60, 'Aperitivo'],
    [20 * 60, 'Late dinner']
  ];
  var fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
  var el = document.createElement('p');
  el.className = 'nav-clock';
  el.setAttribute('aria-hidden', 'true');
  bar.appendChild(el);
  var i = 0;
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function text() {
    var hm = fmt.format(new Date());
    var parts = hm.split(':');
    var mins = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    var line = MOMENTS[0][1];
    for (var k = 0; k < MOMENTS.length; k++) if (mins >= MOMENTS[k][0]) line = MOMENTS[k][1];
    return hm + ' in ' + ISLANDS[i] + '. ' + line + '.';
  }
  function render() { el.textContent = text(); }
  render();
  setInterval(function () {
    i = (i + 1) % ISLANDS.length;
    if (still) { render(); return; }
    el.classList.add('is-fading');
    setTimeout(function () { render(); el.classList.remove('is-fading'); }, 400);
  }, 5000);
})();
