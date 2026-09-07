/* ==========================================================================
   WIN WEARS — Homepage
   Renders the four category cards and boots the hero + technology balls.
   ========================================================================== */
(function () {
  'use strict';

  /* Pick a hero image per category from the real catalogue. */
  var COVER = {
    hybrid:   'assets/img/products/hybrid/hyb-02/1.jpeg',
    handmade: 'assets/img/products/handmade/hm-04/1.jpeg',
    thermal:  'assets/img/products/thermal/tb-01/1.jpeg',
    tpu:      'assets/img/products/tpu/tpu-01/1.jpeg'
  };

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

    WW.CATEGORIES.forEach(function (c, i) {
      var count = WW.publicProducts(c.key).length;
      var a = document.createElement('a');
      a.className = 'cat-card reveal';
      a.href = c.page;
      if (i) a.setAttribute('data-delay', String(Math.min(i, 5)));
      a.innerHTML =
        '<div class="cat-card__media">' +
          '<img src="' + COVER[c.key] + '" alt="' + esc(c.name) + '" loading="lazy" decoding="async">' +
        '</div>' +
        '<div class="cat-card__body">' +
          '<span class="cat-card__num">' + c.num + ' — ' + count + ' model' + (count === 1 ? '' : 's') + '</span>' +
          '<h3 class="cat-card__title">' + esc(c.name) + '</h3>' +
          '<p class="cat-card__desc">' + esc(c.blurb) + '</p>' +
          '<span class="cat-card__go">View range ' + ARROW + '</span>' +
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

  function init() {
    renderCategories();
    boot3D();
    if (WW.wireWhatsApp) WW.wireWhatsApp(document);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
