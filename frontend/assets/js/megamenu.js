/* ==========================================================================
   WIN WEARS — Products mega menu
   --------------------------------------------------------------------------
   The whole catalogue one move from any page: the groups, what is inside
   each, and the way in to a quote.

   It attaches itself to the Products link that every page already has rather
   than being written into the markup. The nav is repeated across twenty
   pages, so markup would have to be repeated twenty times and kept in step;
   this way there is one copy and a page that has the link gets the menu.

   What it lists comes from WW.CATEGORIES — the same records the collection
   pages use — so it cannot offer a range the shop does not stock. Nothing is
   named here.

   Above 1080px only: below that the nav collapses and the mobile menu already
   lists everything. Without JavaScript the Products link still goes to the
   products page, which is the same place the menu's own heading leads.
   ========================================================================== */
(function () {
  'use strict';

  var WW = window.WW || (window.WW = {});
  var doc = document;
  var DESKTOP = '(min-width: 1081px)';
  var CLOSE_DELAY = 180;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* Pages that exist, for the column that is not a product list. */
  function support(base) {
    return [
      ['Request a quote', base + 'request-quote.html', 'Bulk and repeat orders, quoted per run'],
      ['Customization', base + 'customization.html', 'Your colours, crest and artwork'],
      ['Manufacturing', base + 'manufacturing.html', 'How a ball is made, stage by stage'],
      ['Technology', base + 'technology.html', 'Construction, materials and testing']
    ];
  }

  function column(title, items, withArt) {
    return '<div class="mega__col">' +
      '<p class="mega__heading">' + esc(title) + '</p>' +
      '<ul class="mega__list">' +
        items.map(function (it) {
          return '<li><a class="mega__link" href="' + esc(it.href) + '">' +
            (withArt
              ? '<span class="mega__thumb">' + (it.image
                  ? '<img src="' + esc(it.image) + '" alt="" loading="lazy" decoding="async">'
                  : '') + '</span>'
              : '') +
            '<span class="mega__text">' +
              '<span class="mega__name">' + esc(it.name) + '</span>' +
              (it.note ? '<span class="mega__note">' + esc(it.note) + '</span>' : '') +
            '</span>' +
          '</a></li>';
        }).join('') +
      '</ul>' +
    '</div>';
  }

  function build(link) {
    var base = doc.documentElement.getAttribute('data-base') || '';
    var cats = WW.CATEGORIES || [];
    var groups = cats.filter(function (c) { return !c.parentId && c.childCount > 0; });
    if (!groups.length) return null;

    var wrap = doc.createElement('div');
    wrap.className = 'nav__item nav__item--mega';
    link.parentNode.insertBefore(wrap, link);
    wrap.appendChild(link);

    var panel = doc.createElement('div');
    panel.className = 'mega';
    panel.id = 'mega-products';
    panel.hidden = true;

    var cols = groups.map(function (g) {
      var kids = cats.filter(function (c) { return c.parentId === g.id; }).map(function (c) {
        var n = c.productCount || 0;
        return {
          name: c.name,
          href: c.page,
          image: c.image,
          note: n + ' model' + (n === 1 ? '' : 's')
        };
      });
      return column(g.name, kids, true);
    });

    cols.push(column('Working with us', support(base).map(function (r) {
      return { name: r[0], href: r[1], note: r[2] };
    }), false));

    panel.innerHTML =
      '<div class="mega__inner">' + cols.join('') + '</div>' +
      '<div class="mega__foot">' +
        '<a class="mega__all" href="' + base + 'products.html">View every product' +
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' +
          '<path d="M2 8h12M9 3l5 5-5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</a>' +
        '<a class="mega__quote btn btn--accent btn--sm" href="' + base + 'request-quote.html">Request a quote</a>' +
      '</div>';
    wrap.appendChild(panel);

    link.setAttribute('aria-expanded', 'false');
    link.setAttribute('aria-controls', panel.id);
    return { wrap: wrap, panel: panel, link: link };
  }

  function wire(parts) {
    var wrap = parts.wrap, panel = parts.panel, link = parts.link;
    var closing = null;
    var wide = window.matchMedia(DESKTOP);

    function open() {
      clearTimeout(closing);
      if (!wide.matches || !panel.hidden) return;
      panel.hidden = false;
      /* Reading a layout value flushes the change to "shown", so the opening
         transition has a starting point to run from. Done synchronously
         rather than in a frame callback: a background tab throttles those,
         and the menu would have been left shown but transparent. */
      void panel.offsetHeight;
      wrap.setAttribute('data-open', '');
      link.setAttribute('aria-expanded', 'true');
    }
    function shut(immediate) {
      clearTimeout(closing);
      if (panel.hidden) return;
      wrap.removeAttribute('data-open');
      link.setAttribute('aria-expanded', 'false');
      if (immediate) { panel.hidden = true; return; }
      closing = setTimeout(function () { panel.hidden = true; }, 220);
    }
    function soon() { clearTimeout(closing); closing = setTimeout(function () { shut(); }, CLOSE_DELAY); }

    wrap.addEventListener('mouseenter', open);
    wrap.addEventListener('mouseleave', soon);

    /* Reaching the link by keyboard opens it; leaving the menu entirely
       closes it. */
    wrap.addEventListener('focusin', open);
    wrap.addEventListener('focusout', function (e) {
      if (!wrap.contains(e.relatedTarget)) shut();
    });

    doc.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || panel.hidden) return;
      shut(true);
      link.focus();
    });
    /* A tap outside, and the menu that the mobile burger opens, both close it. */
    doc.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) shut(true);
    });
    wide.addEventListener('change', function () { if (!wide.matches) shut(true); });
    window.addEventListener('pagehide', function () { shut(true); });
  }

  function init() {
    if (!window.matchMedia(DESKTOP).matches) return;
    var list = doc.querySelector('.nav__list');
    if (!list) return;
    var link = [].slice.call(list.querySelectorAll('.nav__link')).filter(function (a) {
      return /(^|\/)products\.html$/.test(a.getAttribute('href') || '');
    })[0];
    if (!link || link.closest('.nav__item--mega')) return;

    var parts = build(link);
    if (parts) wire(parts);
  }

  if (WW.ready) WW.ready.then(init, function () {});
})();
