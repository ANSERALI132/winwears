/* ==========================================================================
   WIN WEARS — Catalogue (products.html and the category pages)
   Renders product cards and drives the filter toolbar.

   Products come from the API, filtered and paginated on the server: a
   catalogue of 500 balls must never arrive as one response.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var BASE = doc.documentElement.getAttribute('data-base') || '';

  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var ARROW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">'
            + '<path d="M2 8h12M9 3l5 5-5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var WA_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22c5.46 0 9.92-4.45 9.92-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 15.7a8.2 8.2 0 0 1-5.8 2.4 8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.25-4.36c0-4.53 3.7-8.22 8.23-8.22a8.19 8.19 0 0 1 8.22 8.23c0 2.2-.86 4.26-2.43 5.81z"/></svg>';

  /** One product card. Exposed so category pages and the PDP can reuse it. */
  WW.cardHTML = function (p) {
    var imgs = WW.images(p);
    var alts = WW.imageAlts(p);
    var href = WW.productHref(p);
    var waMsg = p.whatsappMessage
      || ('Hello WIN WEARS, I am interested in ' + p.productName + ' (' + p.sku + '). Please send me details and quotation.');

    var media = imgs.length
      ? '<img src="' + esc(imgs[0]) + '" alt="' + esc(alts[0] || p.productName) + '" loading="lazy" decoding="async">'
        + (imgs[1] ? '<img src="' + esc(imgs[1]) + '" alt="" loading="lazy" decoding="async" aria-hidden="true">' : '')
      : '<span class="p-card__noimg" aria-hidden="true"></span>';

    /* Only the chips we actually hold a value for — a blank chip would be an
       invented specification. */
    var chips = [p.material, p.size ? 'Size ' + p.size : '', p.usage]
      .filter(Boolean)
      .map(function (v) { return '<li class="p-card__spec">' + esc(v) + '</li>'; })
      .join('');

    return ''
      + '<article class="p-card reveal">'
      +   '<a class="p-card__media" href="' + href + '" aria-label="' + esc(p.productName) + ' — view product">'
      +     (p.construction ? '<span class="p-card__tag">' + esc(p.construction) + '</span>' : '')
      +     media
      +   '</a>'
      +   '<div class="p-card__body">'
      +     '<h3 class="p-card__name"><a href="' + href + '">' + esc(p.productName) + '</a></h3>'
      +     (p.shortDescription ? '<p class="p-card__colour">' + esc(p.shortDescription) + '</p>' : '')
      +     (chips ? '<ul class="p-card__specs">' + chips + '</ul>' : '')
      +   '</div>'
      +   '<div class="p-card__actions">'
      +     '<a class="btn btn--ghost btn--sm" href="' + BASE + 'request-quote.html?product=' + encodeURIComponent(p.slug || p.id) + '">Request Quote</a>'
      +     '<a class="btn btn--whatsapp btn--sm p-card__wa" data-wa="' + esc(waMsg) + '" aria-label="Ask about ' + esc(p.productName) + ' on WhatsApp">' + WA_ICON + '</a>'
      +   '</div>'
      + '</article>';
  };

  /** Render a list of products into a grid element. `empty` can replace the
   *  empty state's heading and link, for pages that are not football ranges. */
  WW.renderGrid = function (host, list, emptyMsg, empty) {
    if (!host) return;
    if (!list.length) {
      empty = empty || {};
      host.innerHTML = '<div class="empty-state"><h3>' + esc(empty.title || 'No footballs found') + '</h3>'
        + '<p class="lead" style="margin:.5rem auto var(--s-4)">'
        + esc(emptyMsg || 'Try clearing a filter, or tell us what you need and we will quote it.')
        + '</p><a class="btn" href="' + esc(empty.href || BASE + 'products.html') + '">'
        + esc(empty.label || 'See the full collection') + '</a></div>';
      return;
    }
    host.innerHTML = list.map(WW.cardHTML).join('');
    if (WW.wireWhatsApp) WW.wireWhatsApp(host);
    if (WW.bootReveal) WW.bootReveal(host);
  };

  /** Placeholder cards while a request is in flight. */
  function showSkeleton(host, count) {
    if (!host) return;
    var one = '<div class="p-card p-card--skeleton" aria-hidden="true">'
      + '<div class="sk sk--media"></div><div class="sk sk--line"></div><div class="sk sk--line sk--short"></div></div>';
    host.innerHTML = new Array(count || 6).join(one) + one;
    host.setAttribute('aria-busy', 'true');
  }

  function showError(host, err, retry) {
    if (!host) return;
    host.removeAttribute('aria-busy');
    host.innerHTML = '<div class="empty-state"><h3>We could not load the collection</h3>'
      + '<p class="lead" style="margin:.5rem auto var(--s-4)">' + esc(err && err.message ? err.message : '') + '</p>'
      + '<button class="btn" type="button" data-retry>Try again</button></div>';
    var button = host.querySelector('[data-retry]');
    if (button && retry) button.addEventListener('click', retry);
  }

  /* ------------------------------------------------------- filter page --- */

  function initCatalogue() {
    var grid = $('#product-grid');
    if (!grid) return;

    var state = { category: '', construction: '', material: '', usage: '', size: '', page: 1, perPage: 24, sort: 'order', ranges: 'yes' };

    var params = new URLSearchParams(location.search);
    /* Accept the old ?cat= as well as ?category=, so existing links survive. */
    state.category = params.get('category') || params.get('cat') || '';
    if (params.get('q')) state.q = params.get('q');

    showSkeleton(grid, 8);

    WW.loadFilters()
      .then(function (options) {
        fill($('#f-cat'), options.categories.map(function (c) { return { value: c.slug, label: c.name }; }), state.category);
        fill($('#f-con'), options.construction.map(v), state.construction);
        fill($('#f-mat'), options.material.map(v), state.material);
        fill($('#f-use'), options.usage.map(v), state.usage);
        fill($('#f-size'), options.size.map(v), state.size);
        wire();
        return apply();
      })
      .catch(function (err) { showError(grid, err, initCatalogue); });

    function v(x) { return { value: x, label: x }; }

    function fill(sel, values, current) {
      if (!sel) return;
      /* Keep the "All …" option the markup already provides. */
      while (sel.options.length > 1) sel.remove(1);
      values.forEach(function (item) {
        var o = doc.createElement('option');
        o.value = item.value;
        o.textContent = item.label;
        if (item.value === current) o.selected = true;
        sel.appendChild(o);
      });
    }

    function wire() {
      /* The markup's filter names predate the API; map them across. */
      var FILTER_KEYS = { cat: 'category', custom: 'customization' };

      $$('[data-filter]').forEach(function (sel) {
        sel.addEventListener('change', function () {
          var name = sel.getAttribute('data-filter');
          state[FILTER_KEYS[name] || name] = sel.value;
          state.page = 1;
          apply();
        });
      });

      var reset = $('#f-reset');
      if (reset) {
        reset.addEventListener('click', function () {
          ['category', 'construction', 'material', 'usage', 'size', 'q'].forEach(function (k) { state[k] = ''; });
          state.page = 1;
          $$('[data-filter]').forEach(function (s) { s.value = ''; });
          var search = $('#f-search');
          if (search) search.value = '';
          apply();
        });
      }

      var search = $('#f-search');
      if (search) {
        var timer;
        search.addEventListener('input', function () {
          clearTimeout(timer);
          timer = setTimeout(function () {
            state.q = search.value.trim();
            state.page = 1;
            apply();
          }, 300);
        });
      }

      var more = $('#f-more');
      if (more) {
        more.addEventListener('click', function () {
          state.page += 1;
          apply(true);
        });
      }
    }

    function apply(append) {
      if (!append) showSkeleton(grid, 8);

      return WW.loadProducts(state)
        .then(function (res) {
          grid.removeAttribute('aria-busy');

          if (append) {
            grid.insertAdjacentHTML('beforeend', res.items.map(WW.cardHTML).join(''));
            if (WW.wireWhatsApp) WW.wireWhatsApp(grid);
            if (WW.bootReveal) WW.bootReveal(grid);
          } else {
            WW.renderGrid(grid, res.items);
          }

          var count = $('#f-count');
          if (count) {
            var shown = Math.min(res.meta.total, res.meta.page * res.meta.perPage);
            count.textContent = res.meta.total
              ? 'Showing ' + shown + ' of ' + res.meta.total + ' football' + (res.meta.total === 1 ? '' : 's')
              : 'No footballs match those filters';
          }

          var more = $('#f-more');
          if (more) more.hidden = res.meta.page >= res.meta.totalPages;

          /* Keep the address bar shareable without pushing history entries. */
          var next = new URLSearchParams();
          if (state.category) next.set('category', state.category);
          if (state.q) next.set('q', state.q);
          var query = next.toString();
          history.replaceState(null, '', query ? '?' + query : location.pathname);
        })
        .catch(function (err) {
          if (append) state.page -= 1;
          else showError(grid, err, function () { apply(); });
        });
    }
  }

  /* --------------------------------------------------- category page ----- */

  function initCategory() {
    var grid = $('#category-grid');
    if (!grid) return;

    var key = grid.getAttribute('data-category');
    var state = { category: key, page: 1, perPage: 24, sort: 'order' };

    /* A photo set on the category in the admin replaces the page's artwork. */
    var cat = WW.catBy(key);
    var art = $('[data-category-image]');
    if (cat && cat.image && art) art.src = cat.image;

    showSkeleton(grid, 6);
    load();

    function load(append) {
      return WW.loadProducts(state)
        .then(function (res) {
          grid.removeAttribute('aria-busy');

          if (append) {
            grid.insertAdjacentHTML('beforeend', res.items.map(WW.cardHTML).join(''));
            if (WW.wireWhatsApp) WW.wireWhatsApp(grid);
            if (WW.bootReveal) WW.bootReveal(grid);
          } else {
            WW.renderGrid(
              grid,
              res.items,
              grid.getAttribute('data-empty-message') || 'Nothing is published in this range yet. Tell us what you need and we will quote it.',
              {
                title: grid.getAttribute('data-empty-title'),
                href: grid.getAttribute('data-empty-href'),
                label: grid.getAttribute('data-empty-label')
              }
            );
          }

          var count = $('#category-count');
          if (count) count.textContent = res.meta.total + ' model' + (res.meta.total === 1 ? '' : 's');

          var more = $('#category-more');
          if (more) {
            more.hidden = res.meta.page >= res.meta.totalPages;
            if (!more.dataset.wired) {
              more.dataset.wired = '1';
              more.addEventListener('click', function () { state.page += 1; load(true); });
            }
          }
        })
        .catch(function (err) {
          if (append) state.page -= 1;
          else showError(grid, err, function () { load(); });
        });
    }
  }

  /* ------------------------------------------------- grouped categories --- */

  /* Artwork for a kit type until a photo is set on its category in the admin.
     Every kit type not listed here uses the jersey. */
  var KIT_ART = {
    'football-shorts': 'shorts',
    'football-socks': 'socks',
    'goalkeeper-kits': 'goalkeeper'
  };

  WW.kitArt = function (slug) {
    return BASE + 'assets/img/uniforms/' + (KIT_ART[slug] || 'jersey') + '.svg';
  };

  function node(tag, cls, text) {
    var n = doc.createElement(tag);
    n.className = cls;
    n.textContent = text || '';
    return n;
  }

  /** The categories under a group, as cards, on the group's own page. Built
   *  with textContent: every value here came back from the API. */
  function initSubcategories() {
    var host = $('#subcategory-cards');
    if (!host) return;

    var list = WW.childrenOf(host.getAttribute('data-parent'));
    if (!list.length) {
      host.innerHTML = '<div class="empty-state"><h3>These kits are being added</h3>'
        + '<p class="lead" style="margin:.5rem auto var(--s-4)">Tell us what your team needs and we will quote it.</p>'
        + '<a class="btn" href="' + BASE + 'request-quote.html">Request a Quote</a></div>';
      return;
    }

    list.forEach(function (c, i) {
      var count = c.productCount || 0;

      var card = doc.createElement('a');
      card.className = 'cat-card reveal';
      card.href = c.page;
      if (i) card.setAttribute('data-delay', String(Math.min(i, 5)));

      var media = node('div', 'cat-card__media');
      var img = doc.createElement('img');
      img.src = c.image || WW.kitArt(c.slug);
      img.alt = c.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      media.appendChild(img);

      var body = node('div', 'cat-card__body');
      body.appendChild(node('span', 'cat-card__num', count ? count + ' model' + (count === 1 ? '' : 's') : 'Made to order'));
      body.appendChild(node('h3', 'cat-card__title', c.name));
      body.appendChild(node('p', 'cat-card__desc', c.shortDescription || c.blurb));
      var go = node('span', 'cat-card__go', c.footballRange ? 'View range ' : 'View kits ');
      go.insertAdjacentHTML('beforeend', ARROW);   /* a fixed icon, not data */
      body.appendChild(go);

      card.appendChild(media);
      card.appendChild(body);
      host.appendChild(card);
    });

    if (WW.bootReveal) WW.bootReveal(host);
  }

  function init() { initCatalogue(); initCategory(); initSubcategories(); }

  /* Nothing can render until the categories and contact details are in. */
  WW.ready.then(init).catch(function (err) {
    showError($('#product-grid') || $('#category-grid'), err, function () { location.reload(); });
  });
})();
