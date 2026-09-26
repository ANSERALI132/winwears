/* ==========================================================================
   WIN WEARS — Homepage
   Renders the category cards and boots the hero + technology balls. The
   hero's sliding background is backdrop.js.
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
      a.setAttribute('data-tilt', '');
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
    if (WW.bootTilt) WW.bootTilt(host);
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
        parallax: true,
        /* Turns and falls back into depth as the hero leaves, so scrolling
           past reads as moving past the ball. */
        scroll: true,
        /* And rolls across as it goes, rather than spinning on the spot. */
        roll: true
      });
    }

    var tech = document.getElementById('tech-ball');
    if (tech) {
      var ball = WW.ball3d(tech, {
        base: '#FFFFFF',
        accent: '#E1132C',
        seam: '#0C1226',
        markColour: '#16264F',
        zoom: 1.22,
        interactive: true,
        parallax: false
      });
      cutaway(ball);
    }
  }

  /**
   * The pinned cutaway: scrolling through the section's track opens the ball
   * and lights each layer in turn. Same driver as technology.js — see there
   * for why progress is read from the track's own position rather than a
   * library.
   */
  function cutaway(ball) {
    var host = document.querySelector('[data-cutaway]');
    if (!host || !ball) return;

    var pin = host.querySelector('.cutaway__pin');
    var layers = [].slice.call(host.querySelectorAll('.layer'));
    if (!pin || !layers.length) return;

    var still = window.matchMedia('(prefers-reduced-motion: reduce)');
    var wide = window.matchMedia('(min-height: 560px)');

    var at = -1;
    var queued = false;

    function apply() {
      queued = false;

      if (still.matches || !wide.matches) {
        if (at !== -1) {
          at = -1;
          host.style.removeProperty('--p');
          layers.forEach(function (l) { l.removeAttribute('data-on'); });
          if (ball.cutaway) ball.cutaway(0);
        }
        return;
      }

      var box = host.getBoundingClientRect();
      var travel = box.height - pin.offsetHeight;
      if (travel <= 0) return;

      var p = Math.max(0, Math.min(1, -box.top / travel));
      host.style.setProperty('--p', p.toFixed(3));

      var n = Math.min(layers.length - 1, Math.floor(p * layers.length));
      if (n !== at) {
        at = n;
        layers.forEach(function (l, i) {
          if (i === n) l.setAttribute('data-on', '');
          else l.removeAttribute('data-on');
        });
      }

      if (ball.cutaway) ball.cutaway(p);
    }

    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(apply);
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          window.addEventListener('scroll', schedule, { passive: true });
          schedule();
        } else {
          window.removeEventListener('scroll', schedule);
        }
      }, { threshold: 0 }).observe(host);
    } else {
      window.addEventListener('scroll', schedule, { passive: true });
    }

    window.addEventListener('resize', schedule);
    still.addEventListener('change', schedule);
    wide.addEventListener('change', schedule);
    schedule();
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

  function init() {
    renderCategories();
    renderFeatured();
    boot3D();
    if (WW.wireWhatsApp) WW.wireWhatsApp(document);
  }

  /* The 3D ball needs no data, so it starts even if the API is unreachable. */
  WW.ready.then(init).catch(function () { boot3D(); });
})();
