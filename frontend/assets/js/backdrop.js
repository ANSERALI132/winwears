/* ==========================================================================
   WIN WEARS — Sliding backdrop
   --------------------------------------------------------------------------
   A header whose background slides through pictures while its text stays
   put: the homepage (the ball, a uniform, a tracksuit, socks) and Team Wears
   (the garments alone). Its own file because both pages use it, and neither
   page's script belongs on the other.

   Markup: [data-backdrop] on the header, data-interval in milliseconds, and
   one [data-layer] per picture, the first marked is-active.
     - [data-backdrop-text] inside the header makes that text follow the
       picture: a layer with data-category shows its category's description,
       and the first layer keeps the page's own.
     - [data-backdrop-wait] inside the first layer — a 3D ball — holds the
       first turn until it has drawn, so it is seen rather than skipped while
       the model downloads.

   There are no dots or pause button, by choice. Nothing moves while the
   visitor is using a control inside the header, has the tab in the
   background or has scrolled past; and not at all for anyone who has asked
   their system for reduced motion. On a phone a sideways swipe changes it.
   ========================================================================== */
(function () {
  'use strict';

  var SLIDE_MS = 800;

  function start(host) {
    if (host.hasAttribute('data-backdrop-on')) return;
    var layers = [].slice.call(host.querySelectorAll('[data-layer]'));
    if (layers.length < 2) return;
    host.setAttribute('data-backdrop-on', '');

    var total = layers.length;
    var dwell = parseInt(host.getAttribute('data-interval'), 10) || 2000;
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var index = 0, timer = null, settle = null, started = false;
    var focused = false, offscreen = false;

    /* Each picture's description; null keeps whatever the header shows, which
       for the first picture is the page's own — possibly set in the admin. */
    var sub = host.querySelector('[data-backdrop-text]');
    var texts = layers.map(function (l) {
      var slug = l.getAttribute('data-category');
      var c = slug && window.WW && WW.catBy ? WW.catBy(slug) : null;
      return c ? (c.shortDescription || c.blurb || null) : null;
    });
    var ownText = null;

    /* Room for the longest, so the buttons below never jump. */
    function reserve() {
      var shown = sub.textContent;
      var tallest = 0;
      sub.style.minHeight = '';
      [ownText || shown].concat(texts).forEach(function (t) {
        if (!t) return;
        sub.textContent = t;
        tallest = Math.max(tallest, sub.offsetHeight);
      });
      sub.textContent = shown;
      sub.style.minHeight = tallest + 'px';
    }
    if (sub) {
      var resizing = null;
      window.addEventListener('resize', function () { clearTimeout(resizing); resizing = setTimeout(reserve, 150); });
      reserve();
    }

    /* The page's own text is kept as the first picture leaves, so it comes
       back as it last was. Only the latest swap writes, however fast swipes
       come. */
    var swaps = 0;
    function describe(from, to) {
      if (!sub) return;
      if (from === 0) ownText = sub.textContent;
      var next = to === 0 ? ownText : texts[to];
      if (!next || next === sub.textContent) return;
      var mine = ++swaps;
      if (still || !sub.animate) { sub.textContent = next; return; }
      sub.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).onfinish = function () {
        if (mine !== swaps) return;
        sub.textContent = next;
        sub.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, fill: 'forwards' });
      };
    }

    function mark() {
      layers.forEach(function (l, n) { l.classList.toggle('is-active', n === index); });
    }

    function go(n) {
      n = (n + total) % total;
      if (n === index) return;
      var prev = index;
      index = n;
      layers.forEach(function (l) { l.classList.remove('is-prev'); });
      layers[prev].classList.add('is-prev');
      mark();
      describe(prev, index);
      /* Once it has left, the old picture goes back to waiting off to the
         right. A ball overhangs the header's edge, so without this a sliver
         of it would stay in view — and keep drawing — at the left. */
      clearTimeout(settle);
      settle = setTimeout(function () {
        layers.forEach(function (l) { l.classList.remove('is-prev'); });
      }, SLIDE_MS);
      schedule(SLIDE_MS + dwell);
    }

    function halted() {
      return still || !started || focused || offscreen || document.hidden;
    }

    function schedule(ms) {
      clearTimeout(timer);
      if (halted()) return;
      timer = setTimeout(function () { go(index + 1); }, ms);
    }

    host.addEventListener('focusin', function () { focused = true; schedule(dwell); });
    host.addEventListener('focusout', function (e) {
      if (host.contains(e.relatedTarget)) return;
      focused = false; schedule(dwell);
    });
    document.addEventListener('visibilitychange', function () { schedule(dwell); });
    /* Scrolled past means less than a third of the screen is header. Measured
       against the screen, not the header, which can be taller than a short
       window and so never a third visible. */
    if ('IntersectionObserver' in window) {
      var steps = [];
      for (var k = 0; k <= 20; k++) steps.push(k / 20);
      new IntersectionObserver(function (entries) {
        var e = entries[0];
        var room = Math.min(e.boundingClientRect.height, window.innerHeight) || 1;
        var now = e.intersectionRect.height / room < 0.35;
        if (now !== offscreen) { offscreen = now; schedule(dwell); }
      }, { threshold: steps }).observe(host);
    }

    /* Phones: a sideways swipe moves the background either way. */
    var touchX = null;
    host.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    host.addEventListener('touchend', function (e) {
      if (touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
    }, { passive: true });

    mark();

    function begin() {
      if (started) return;
      started = true;
      schedule(dwell);
    }
    var ball = layers[0].querySelector('[data-backdrop-wait]');
    var drawn = function () { return /^(ready|fallback)$/.test(ball.getAttribute('data-ball') || ''); };
    if (!ball || drawn()) { begin(); return; }
    new MutationObserver(function (list, obs) {
      if (drawn()) { obs.disconnect(); begin(); }
    }).observe(ball, { attributes: true, attributeFilter: ['data-ball'] });
    /* A slow connection still gets the other pictures. */
    setTimeout(begin, 6000);
  }

  function boot() { [].forEach.call(document.querySelectorAll('[data-backdrop]'), start); }

  /* Descriptions come with the categories; the pictures move either way. */
  if (window.WW && WW.ready) WW.ready.then(boot, boot);
  else boot();
})();
