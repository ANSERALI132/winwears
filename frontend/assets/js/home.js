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
      a.innerHTML =
        '<div class="cat-card__media">' +
          '<img src="' + (c.image || COVER[c.key] || COVER_FALLBACK) + '" alt="' + esc(c.name) + '" loading="lazy" decoding="async">' +
        '</div>' +
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
   * The hero's slides: the ball, then Team Wears, Soccer Uniforms, Socks and
   * Tracksuits, each shown for data-interval milliseconds before the next
   * slides in.
   *
   * An apparel slide takes its name, photo, description and links from the
   * category, and is dropped if that category is missing or has no photo.
   * The ball's slide starts counting once the ball has drawn, so it is seen
   * rather than skipped while the model downloads.
   *
   * Nothing moves while the visitor is using a control inside the hero, has
   * paused it, has the tab in the background or has scrolled past; and not at
   * all for anyone who has asked their system for reduced motion.
   */
  function initHeroSlider() {
    var hero = document.querySelector('[data-hero-slider]');
    if (!hero) return;

    var slides = [].slice.call(hero.querySelectorAll('[data-slide]'));
    /* The ball's layer moves with the first slide. */
    var ballLayer = hero.querySelector('[data-layer]');
    var moving = function () { return ballLayer ? slides.concat(ballLayer) : slides; };

    for (var i = slides.length - 1; i > 0; i--) {
      var slug = slides[i].getAttribute('data-category');
      var c = slug && WW.catBy ? WW.catBy(slug) : null;
      if (!c || !c.image) {
        slides[i].remove();
        slides.splice(i, 1);
        continue;
      }
      slides[i].querySelector('[data-slide-name]').textContent = c.name;
      slides[i].querySelector('[data-slide-desc]').textContent = c.shortDescription || c.blurb;
      var link = slides[i].querySelector('[data-slide-link]');
      link.href = c.page;
      link.textContent = 'Explore ' + c.name;
      slides[i].querySelector('[data-slide-quote]').href = 'request-quote.html?category=' + encodeURIComponent(c.slug);
      var img = slides[i].querySelector('[data-slide-image]');
      img.src = c.image;
      img.alt = c.name;
    }
    if (slides.length < 2) return;

    var total = slides.length;
    slides.forEach(function (s, n) { s.setAttribute('aria-label', (n + 1) + ' of ' + total); });

    var dwell = parseInt(hero.getAttribute('data-interval'), 10) || 2000;
    var SLIDE_MS = 800;
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var index = 0, timer = null, settle = null, started = false;
    var userPaused = false, focused = false, offscreen = false;

    var dotsHost = hero.querySelector('[data-slide-dots]');
    var dots = slides.map(function (s, n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hero__dot';
      var name = s.querySelector('[data-slide-name]');
      b.setAttribute('aria-label', 'Show slide ' + (n + 1) + (name ? ': ' + name.textContent : ''));
      b.addEventListener('click', function () { go(n); });
      dotsHost.appendChild(b);
      return b;
    });
    var pause = hero.querySelector('[data-slide-pause]');
    hero.querySelector('[data-slide-controls]').hidden = false;

    function mark() {
      slides.forEach(function (s, n) { s.classList.toggle('is-active', n === index); });
      if (ballLayer) ballLayer.classList.toggle('is-active', index === 0);
      dots.forEach(function (d, n) { d.setAttribute('aria-current', n === index ? 'true' : 'false'); });
    }

    function go(n) {
      if (n === index) return;
      var prev = index;
      index = (n + total) % total;
      moving().forEach(function (el) { el.classList.remove('is-prev'); });
      slides[prev].classList.add('is-prev');
      if (ballLayer && prev === 0) ballLayer.classList.add('is-prev');
      mark();
      /* Once it has left, the old slide goes back to waiting off to the right.
         The ball overhangs the hero's edge, so without this a sliver of it
         would stay in view — and keep drawing — at the left. */
      clearTimeout(settle);
      settle = setTimeout(function () {
        moving().forEach(function (el) { el.classList.remove('is-prev'); });
      }, SLIDE_MS);
      schedule(SLIDE_MS + dwell);
    }

    function halted() {
      return still || !started || userPaused || focused || offscreen || document.hidden;
    }

    function schedule(ms) {
      clearTimeout(timer);
      if (halted()) return;
      timer = setTimeout(function () { go(index + 1); }, ms);
    }

    pause.addEventListener('click', function () {
      userPaused = !userPaused;
      pause.setAttribute('aria-pressed', String(userPaused));
      pause.setAttribute('aria-label', userPaused ? 'Play slides' : 'Pause slides');
      schedule(dwell);
    });
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

    /* Phones: a sideways swipe moves a slide either way. */
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
    /* A slow connection still gets the other slides. */
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
  WW.ready.then(init).catch(function () { boot3D(); });
})();
