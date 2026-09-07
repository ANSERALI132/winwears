/* ==========================================================================
   WIN WEARS — Catalogue (products.html and the four category pages)
   Renders product cards and drives the filter toolbar.
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

  /* Construction / material read off the category so there is one source. */
  function conOf(p) {
    var map = { hybrid: 'Hybrid', handmade: 'Hand Stitched', thermal: 'Thermal Bonded', tpu: 'TPU Moulded' };
    return map[p.cat] || '';
  }
  function matOf(p) { return p.cat === 'tpu' ? 'TPU' : 'PU'; }
  function sizesOf(p) {
    var c = WW.catBy(p.cat);
    return (c && c.sizes ? c.sizes : '3, 4, 5').split(',').map(function (s) { return s.trim(); });
  }

  var ARROW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">'
            + '<path d="M2 8h12M9 3l5 5-5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var WA_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22c5.46 0 9.92-4.45 9.92-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 15.7a8.2 8.2 0 0 1-5.8 2.4 8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.25-4.36c0-4.53 3.7-8.22 8.23-8.22a8.19 8.19 0 0 1 8.22 8.23c0 2.2-.86 4.26-2.43 5.81z"/></svg>';

  /** One product card. Exposed so category pages can reuse it. */
  WW.cardHTML = function (p) {
    var c = WW.catBy(p.cat) || {};
    var imgs = WW.images(p);
    var href = BASE + 'product.html?id=' + encodeURIComponent(p.id);
    var waMsg = 'Hello WIN WEARS, I am interested in ' + p.name + ' (' + p.sku + '). Please send me details and quotation.';
    var second = imgs[1] ? '<img src="' + BASE + imgs[1] + '" alt="" loading="lazy" decoding="async" aria-hidden="true">' : '';

    return ''
      + '<article class="p-card reveal">'
      +   '<a class="p-card__media" href="' + href + '" aria-label="' + esc(p.name) + ' — view product">'
      +     '<span class="p-card__tag">' + esc(conOf(p)) + '</span>'
      +     '<img src="' + BASE + imgs[0] + '" alt="' + esc(p.name + ' — ' + p.colour) + '" loading="lazy" decoding="async">'
      +     second
      +   '</a>'
      /* The model name now carries the range, so the separate category label
         above it would just repeat itself — the colourway is the difference. */
      +   '<div class="p-card__body">'
      +     '<h3 class="p-card__name"><a href="' + href + '">' + esc(p.name) + '</a></h3>'
      +     '<p class="p-card__colour">' + esc(p.colour) + '</p>'
      +     '<ul class="p-card__specs">'
      +       '<li class="p-card__spec">' + esc(matOf(p)) + '</li>'
      +       '<li class="p-card__spec">Size ' + esc(c.sizes || '5') + '</li>'
      +       '<li class="p-card__spec">' + esc(p.usage) + '</li>'
      +     '</ul>'
      +   '</div>'
      +   '<div class="p-card__actions">'
      +     '<a class="btn btn--ghost btn--sm" href="' + BASE + 'request-quote.html?product=' + encodeURIComponent(p.id) + '">Request Quote</a>'
      +     '<a class="btn btn--whatsapp btn--sm p-card__wa" data-wa="' + esc(waMsg) + '" aria-label="Ask about ' + esc(p.name) + ' on WhatsApp">' + WA_ICON + '</a>'
      +   '</div>'
      + '</article>';
  };

  /** Render a list of products into a grid element. */
  WW.renderGrid = function (host, list, emptyMsg) {
    if (!host) return;
    if (!list.length) {
      host.innerHTML = '<div class="empty-state"><h3>No footballs match those filters</h3>'
        + '<p class="lead" style="margin:.5rem auto 0">' + esc(emptyMsg || 'Try clearing a filter, or tell us what you need and we will quote it.') + '</p></div>';
      return;
    }
    host.innerHTML = list.map(WW.cardHTML).join('');
    if (WW.wireWhatsApp) WW.wireWhatsApp(host);
    if (WW.bootReveal) WW.bootReveal(host);
  };

  /* ------------------------------------------------------- filter page --- */
  function initCatalogue() {
    var grid = $('#product-grid');
    if (!grid) return;

    var all = WW.publicProducts();
    var state = { cat: '', construction: '', material: '', usage: '', size: '', custom: '' };

    /* Seed the category filter from the URL so /products?cat=tpu works. */
    var params = new URLSearchParams(location.search);
    if (params.get('cat')) state.cat = params.get('cat');

    /* --- populate the selects from the data, not hardcoded lists --------- */
    function fill(sel, values, current) {
      if (!sel) return;
      values.forEach(function (v) {
        var o = doc.createElement('option');
        o.value = v.value; o.textContent = v.label;
        if (v.value === current) o.selected = true;
        sel.appendChild(o);
      });
    }

    fill($('#f-cat'), WW.CATEGORIES.map(function (c) { return { value: c.key, label: c.name }; }), state.cat);
    fill($('#f-con'), unique(all.map(conOf)).map(v), state.construction);
    fill($('#f-mat'), unique(all.map(matOf)).map(v), state.material);
    fill($('#f-use'), unique(all.map(function (p) { return p.usage; })).map(v), state.usage);
    fill($('#f-size'), ['3', '4', '5'].map(function (s) { return { value: s, label: 'Size ' + s }; }), state.size);

    function v(x) { return { value: x, label: x }; }
    function unique(arr) {
      var out = [], seen = {};
      arr.forEach(function (a) { if (a && !seen[a]) { seen[a] = 1; out.push(a); } });
      return out.sort();
    }

    function matches(p) {
      if (state.cat && p.cat !== state.cat) return false;
      if (state.construction && conOf(p) !== state.construction) return false;
      if (state.material && matOf(p) !== state.material) return false;
      if (state.usage && p.usage !== state.usage) return false;
      if (state.size && sizesOf(p).indexOf(state.size) === -1) return false;
      /* Every WIN WEARS ball can be customised, so "yes" never excludes. */
      return true;
    }

    function apply() {
      var list = all.filter(matches);
      WW.renderGrid(grid, list);
      var count = $('#f-count');
      if (count) count.textContent = list.length + ' of ' + all.length + ' footballs';

      var next = new URLSearchParams();
      if (state.cat) next.set('cat', state.cat);
      var qs = next.toString();
      history.replaceState(null, '', qs ? '?' + qs : location.pathname);
    }

    $$('[data-filter]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        state[sel.getAttribute('data-filter')] = sel.value;
        apply();
      });
    });

    var reset = $('#f-reset');
    if (reset) reset.addEventListener('click', function () {
      Object.keys(state).forEach(function (k) { state[k] = ''; });
      $$('[data-filter]').forEach(function (s) { s.value = ''; });
      apply();
    });

    apply();
  }

  /* --------------------------------------------------- category page ----- */
  function initCategory() {
    var grid = $('#category-grid');
    if (!grid) return;
    var key = grid.getAttribute('data-category');
    WW.renderGrid(grid, WW.publicProducts(key));
    var count = $('#category-count');
    if (count) {
      var n = WW.publicProducts(key).length;
      count.textContent = n + ' model' + (n === 1 ? '' : 's');
    }
  }

  function init() { initCatalogue(); initCategory(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
