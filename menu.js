// menu.js: opens and closes the slide-out site menu.
// Markup comes from lib/nav.js (and the copies in the static pages).
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
