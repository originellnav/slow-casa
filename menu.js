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

// Island clock in the nav: a small live clock face showing Balearic time,
// next to the part of the day ("Siesta time in Mallorca"). The line follows
// the real time through six blocks. The island changes on each visit
// (Mallorca, then Ibiza, then Menorca). Added here so every page gets it
// without editing each copy of the nav markup. Hidden on small screens.
(function () {
  var bar = document.querySelector('.site-nav');
  if (!bar || !window.Intl) return;
  var ISLANDS = ['Mallorca', 'Ibiza', 'Menorca'];
  // [start minute of day, line]
  var MOMENTS = [
    [0, 'Lights out'],
    [6 * 60, 'Café con leche'],
    [10 * 60, 'Morning swim'],
    [14 * 60, 'Siesta time'],
    [17 * 60, 'Golden hour'],
    [20 * 60, 'Tapas and vino']
  ];
  var island = ISLANDS[Math.floor(Math.random() * ISLANDS.length)];
  try {
    var n = (parseInt(localStorage.getItem('sc-clock') || '0', 10) || 0) + 1;
    localStorage.setItem('sc-clock', String(n));
    island = ISLANDS[n % ISLANDS.length];
  } catch (e) { /* storage blocked: random island is fine */ }

  var fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
  var el = document.createElement('p');
  el.className = 'nav-clock';
  el.innerHTML =
    '<svg class="nav-clock-face" viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10.5" />' +
      '<line class="nav-clock-h" x1="12" y1="12" x2="12" y2="7" />' +
      '<line class="nav-clock-m" x1="12" y1="12" x2="12" y2="4.5" />' +
      '<circle class="nav-clock-dot" cx="12" cy="12" r="1" />' +
    '</svg><span class="nav-clock-text"></span>';
  bar.appendChild(el);
  var hHand = el.querySelector('.nav-clock-h');
  var mHand = el.querySelector('.nav-clock-m');
  var label = el.querySelector('.nav-clock-text');

  function tick() {
    var hm = fmt.format(new Date());
    var h = parseInt(hm.slice(0, 2), 10), m = parseInt(hm.slice(3, 5), 10);
    var mins = h * 60 + m;
    var line = MOMENTS[0][1];
    for (var k = 0; k < MOMENTS.length; k++) if (mins >= MOMENTS[k][0]) line = MOMENTS[k][1];
    hHand.setAttribute('transform', 'rotate(' + ((h % 12) * 30 + m * 0.5) + ' 12 12)');
    mHand.setAttribute('transform', 'rotate(' + (m * 6) + ' 12 12)');
    label.textContent = line + ' in ' + island;
    el.setAttribute('title', hm + ' in the Balearics');
  }
  tick();
  setInterval(tick, 20000);
})();
