/* ==========================================================================
   WIN WEARS — Homepage
   Renders the category cards, runs the hero slides and boots the hero +
   technology balls.
   ========================================================================== */
(function () {
  'use strict';

  /* Fallback cover per category, used only until one is set in the admin.
     Keyed by slug, which is what the API returns as the category key. */
  var COVER = {
    'hybrid-pro-match-ball':    'assets/img/products/hybrid/hyb-02/1.jpeg',
    'hand-made-match-ball':     'assets/img/products/handmade/hm-04/1.jpeg',
    'thermal-bonded-match-ball':'assets/img/products/thermal/tb-01/1.jpeg',
    'tpu-ball':                 'assets/img/products/tpu/tpu-01/1.jpeg',
    'soccer-uniforms':          'assets/img/uniforms/kits/design-33/1.jpg'
  };
  var COVER_FALLBACK = 'assets/img/products/hybrid/hyb-02/1.jpeg';

  /* The ball a group of football ranges shows on its card, turning, in place
     of a photo — the same one its own page shows. */
  var GROUP_BALL = 'WIN-WEARS-14-Panel-Ball-Diamond';

  var ARROW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">'
            + '<path d="M2 8h12M9 3l5 5-5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function renderCategories() {
    var host = document.getElementById('cat-cards');
    if (!host || !window.WW || !WW.CATEGORIES) return;

    /* Every top-level category: the ball ranges, and one card for a group such
       as Soccer Uniforms whose own page lists the categories inside it. */
    WW.CATEGORIES.filter(function (c) { return !c.parentId; }).forEach(function (c, i) {
      /* The count comes back with the category, so no second request. */
      var group = c.childCount > 0;
      var apparel = !c.footballRange;
      /* A group's own products sit in its types, so its card counts those. */
      var count = group ? c.groupCount : c.productCount;
      var a = document.createElement('a');
      a.className = 'cat-card reveal';
      a.href = c.page;
      if (i) a.setAttribute('data-delay', String(Math.min(i, 5)));
      var cover = '<img src="' + (c.image || COVER[c.key] || COVER_FALLBACK) + '" alt="' + esc(c.name) + '" loading="lazy" decoding="async">';
      /* Told apart by what it holds, not by its name: a group of ball ranges. */
      var balls = group && WW.CATEGORIES.some(function (x) { return x.parentId === c.id && x.footballRange; });
      a.innerHTML =
        (balls
          ? '<div class="cat-card__media cat-card__media--ball">' +
              '<div class="cat-card__ball" data-ball3d data-ball-model="' + GROUP_BALL + '"'
                + ' data-ball-interactive="false" data-ball-zoom="1.08" aria-hidden="true"></div>' +
              cover +
            '</div>'
          : '<div class="cat-card__media">' + cover + '</div>') +
        '<div class="cat-card__body">' +
          '<span class="cat-card__num">' + (group
            ? c.childCount + ' categor' + (c.childCount === 1 ? 'y' : 'ies')
            : count + ' model' + (count === 1 ? '' : 's')) + '</span>' +
          '<h3 class="cat-card__title">' + esc(c.name) + '</h3>' +
          '<p class="cat-card__desc">' + esc(c.blurb) + '</p>' +
          '<span class="cat-card__go">'
            + (apparel ? 'Explore ' + esc(c.name) + ' ' : group ? 'View categories ' : 'View range ')
            + ARROW + '</span>' +
        '</div>';
      host.appendChild(a);
    });

    if (WW.bootReveal) WW.bootReveal(host);
    if (WW.bootBalls) WW.bootBalls(host);
  }

  function boot3D() {
    if (!WW.ball3d) return;

    var hero = document.getElementById('hero-ball');
    if (hero) {
      WW.ball3d(hero, {
        base: '#F2F4F8',
        accent: '#16264F',
        seam: '#070E24',
        markColour: '#16264F',
        zoom: 1.12,
        interactive: false,
        parallax: true
      });
    }

    var tech = document.getElementById('tech-ball');
    if (tech) {
      WW.ball3d(tech, {
        base: '#FFFFFF',
        accent: '#E1132C',
        seam: '#0C1226',
        markColour: '#16264F',
        zoom: 1.22,
        interactive: true,
        parallax: false
      });
    }
  }

  /**
   * Products the admin has ticked as featured. The section stays hidden while
   * none are — an empty strip is worse than no strip.
   */
  function renderFeatured() {
    var host = document.getElementById('featured-grid');
    var section = document.getElementById('featured');
    if (!host || !WW.loadFeatured) return Promise.resolve();

    return WW.loadFeatured()
      .then(function (items) {
        if (!items.length) {
          if (section) section.hidden = true;
          return;
        }
        if (section) section.hidden = false;
        host.innerHTML = items.map(WW.cardHTML).join('');
        if (WW.wireWhatsApp) WW.wireWhatsApp(host);
        if (WW.bootReveal) WW.bootReveal(host);
      })
      .catch(function () {
        /* The homepage still works without it; do not shout about it. */
        if (section) section.hidden = true;
      });
  }

  /**
   * The hero's background: the ball, then a soccer uniform, a tracksuit and
   * socks, each shown for data-interval milliseconds before the next slides
   * in behind the same headline. The description under the headline follows
   * the picture: the ball keeps the page's own, and each garment shows its
   * category's, so an edit in the admin reaches the hero too. The ball's turn
   * starts counting once it has drawn, so it is seen rather than skipped
   * while the model downloads.
   *
   * There are no dots or pause button, by choice. Nothing moves while the
   * visitor is using a control inside the hero, has the tab in the background
   * or has scrolled past; and not at all for anyone who has asked their
   * system for reduced motion. On a phone a sideways swipe changes it.
   */
  function initHeroSlider() {
    var hero = document.querySelector('[data-hero-slider]');
    if (!hero || hero.hasAttribute('data-slider-on')) return;
    var layers = [].slice.call(hero.querySelectorAll('[data-layer]'));
    if (layers.length < 2) return;
    hero.setAttribute('data-slider-on', '');

    var total = layers.length;
    var dwell = parseInt(hero.getAttribute('data-interval'), 10) || 2000;
    var SLIDE_MS = 800;
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var index = 0, timer = null, settle = null, started = false;
    var focused = false, offscreen = false;


    /* Each picture's description; null keeps whatever the page shows, which
       for the ball is the page's own — possibly set in the admin. */
    var sub = hero.querySelector('.hero__sub');
    var texts = layers.map(function (l) {
      var slug = l.getAttribute('data-category');
      var c = slug && WW.catBy ? WW.catBy(slug) : null;
      return c ? (c.shortDescription || c.blurb || null) : null;
    });
    var ownText = null;

    /* Room for the longest, so the buttons below never jump. */
    function reserve() {
      if (!sub) return;
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
    var resizing = null;
    window.addEventListener('resize', function () { clearTimeout(resizing); resizing = setTimeout(reserve, 150); });
    reserve();

    /* The page's own text is kept as the ball leaves, so it comes back as it
       last was. Only the latest swap writes, however fast swipes come. */
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
         right. The ball overhangs the hero's edge, so without this a sliver
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

    hero.addEventListener('focusin', function () { focused = true; schedule(dwell); });
    hero.addEventListener('focusout', function (e) {
      if (hero.contains(e.relatedTarget)) return;
      focused = false; schedule(dwell);
    });
    document.addEventListener('visibilitychange', function () { schedule(dwell); });
    /* Scrolled past means less than a third of the screen is hero. Measured
       against the screen, not the hero, which can be taller than a short
       window and so never a third visible. */
    if ('IntersectionObserver' in window) {
      var steps = [];
      for (var k = 0; k <= 20; k++) steps.push(k / 20);
      new IntersectionObserver(function (entries) {
        var e = entries[0];
        var room = Math.min(e.boundingClientRect.height, window.innerHeight) || 1;
        var now = e.intersectionRect.height / room < 0.35;
        if (now !== offscreen) { offscreen = now; schedule(dwell); }
      }, { threshold: steps }).observe(hero);
    }

    /* Phones: a sideways swipe moves the background either way. */
    var touchX = null;
    hero.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    hero.addEventListener('touchend', function (e) {
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
    var ball = document.getElementById('hero-ball');
    var drawn = function () { return /^(ready|fallback)$/.test(ball.getAttribute('data-ball') || ''); };
    if (!ball || drawn()) { begin(); return; }
    new MutationObserver(function (list, obs) {
      if (drawn()) { obs.disconnect(); begin(); }
    }).observe(ball, { attributes: true, attributeFilter: ['data-ball'] });
    /* A slow connection still gets the other pictures. */
    setTimeout(begin, 6000);
  }

  function init() {
    initHeroSlider();
    renderCategories();
    renderFeatured();
    boot3D();
    if (WW.wireWhatsApp) WW.wireWhatsApp(document);
  }

  /* The 3D ball needs no data, so it starts even if the API is unreachable. */
  WW.ready.then(init).catch(function () { boot3D(); initHeroSlider(); });
})();
