/* ==========================================================================
   WIN WEARS — Generic category page
   --------------------------------------------------------------------------
   Fills products/category.html from whichever category the address names, so
   a range published in the admin has a working page immediately rather than a
   dead link. The eight hand-written category pages are untouched: a real file
   always wins over this one, and this only answers for addresses that have no
   page of their own.

   The range is taken from the address — /products/goalkeeper-gear.html, or
   ?c=goalkeeper-gear when a host cannot rewrite — and everything shown comes
   from that category's own record. Nothing about any range is written here.

   A range with children (a group, as Footballs is) lists those instead of
   products, the way the hand-written group pages do.
   ========================================================================== */
(function () {
  'use strict';

  var WW = window.WW || (window.WW = {});
  var doc = document;

  /* The last part of the path, or ?c= when the address could not be rewritten. */
  function slugFromAddress() {
    var asked = new URLSearchParams(location.search).get('c');
    if (asked) return asked.toLowerCase();
    var last = location.pathname.split('/').pop() || '';
    return last.replace(/\.html$/, '').toLowerCase();
  }
  WW.categorySlug = slugFromAddress;

  function set(sel, text) {
    var el = doc.querySelector(sel);
    if (el && text) el.textContent = text;
  }

  function notFound(slug) {
    set('[data-cat-title]', 'We could not find that range');
    set('[data-cat-eyebrow]', 'Products');
    set('[data-cat-crumb]', 'Not found');
    set('[data-cat-sub]', 'It may have been renamed or unpublished. Everything we make is on the products page.');
    var grid = doc.getElementById('category-grid');
    if (grid) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">'
        + '<h3>Nothing here</h3>'
        + '<p class="lead" style="margin:.5rem auto var(--s-5)">The range this address points at is not published.</p>'
        + '<a class="btn" href="../products.html">Back to all products</a></div>';
    }
    doc.title = 'Products | WIN WEARS';
    void slug;
  }

  function fill(c) {
    var base = doc.documentElement.getAttribute('data-base') || '';

    doc.title = (c.seo && c.seo.title) || (c.name + ' | WIN WEARS');
    var desc = (c.seo && c.seo.description) || c.shortDescription || c.blurb;
    if (desc) {
      var meta = doc.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', desc);
    }
    /* Now that the range is known, the page can say which address it is. */
    var canon = doc.createElement('link');
    canon.rel = 'canonical';
    canon.href = location.origin + '/products/' + c.slug;
    doc.head.appendChild(canon);

    set('[data-cat-title]', c.name);
    set('[data-cat-eyebrow]', c.name);
    set('[data-cat-crumb]', c.name);
    set('[data-cat-sub]', c.shortDescription || c.blurb || '');
    set('[data-cat-heading]', c.name);
    set('[data-cat-lead]', c.blurb && c.blurb !== c.shortDescription ? c.blurb : '');

    /* The grid itself belongs to catalog.js, which reads the same address and
       decides between products and a group's categories. This only writes the
       heading above it. */
    var kids = (WW.CATEGORIES || []).filter(function (x) { return x.parentId === c.id; });
    if (kids.length) set('[data-cat-heading]', c.name + ' categories');

    /* The range in 3D, on the same terms as every other category page. */
    var gallery = doc.getElementById('cat-gallery');
    if (gallery && !kids.length && WW.bootGalleries) {
      gallery.hidden = false;
      gallery.setAttribute('data-category', c.slug);
      gallery.setAttribute('data-eyebrow', c.name);
      gallery.setAttribute('data-title', c.name);
      gallery.setAttribute('data-sub', c.shortDescription || 'Explore the range.');
      gallery.setAttribute('data-limit', '60');
      gallery.setAttribute('data-gallery3d', '');
      WW.bootGalleries(doc);
    }

    /* The WhatsApp line should name the range the visitor is looking at. */
    doc.querySelectorAll('[data-wa]').forEach(function (el) {
      var msg = el.getAttribute('data-wa');
      if (msg && msg.indexOf('I would like details') === 0) {
        el.setAttribute('data-wa',
          'Hello WIN WEARS, I am interested in ' + c.name + '. Please send me details and quotation.');
      }
    });
    if (WW.wireWhatsApp) WW.wireWhatsApp(doc);
    void base;
  }

  function init() {
    var slug = slugFromAddress();
    var c = WW.catBy ? WW.catBy(slug) : null;
    if (c) fill(c); else notFound(slug);
  }

  if (WW.ready) WW.ready.then(init, function () { notFound(slugFromAddress()); });
})();
