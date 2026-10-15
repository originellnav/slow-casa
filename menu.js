// menu.js: opens and closes the slide-out site menu.
// Markup comes from lib/nav.js (and the copies in the static pages).
(function () {
  // Footer newsletter sign-up (on every page).
  var form = document.querySelector('.footer-signup');
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
        body: JSON.stringify({ email: email })
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
})();
