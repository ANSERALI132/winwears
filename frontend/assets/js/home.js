/* ==========================================================================
   WIN WEARS — Homepage
   Renders the category cards and boots the hero + technology balls.
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
      var count = c.productCount;
      var group = c.childCount > 0;
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
          '<span class="cat-card__go">' + (group ? 'View categories ' : 'View range ') + ARROW + '</span>' +
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

  function init() {
    renderCategories();
    renderFeatured();
    boot3D();
    if (WW.wireWhatsApp) WW.wireWhatsApp(document);
  }

  /* The 3D ball needs no data, so it starts even if the API is unreachable. */
  WW.ready.then(init).catch(function () { boot3D(); });
})();
