/* ==========================================================================
   WIN WEARS — Quick view
   --------------------------------------------------------------------------
   A product read without leaving the list. Any card can open one:

     <button data-quickview="product-slug">Quick view</button>

   The panel is filled from the same /products/:slug the product page uses, so
   what it shows and what the page shows cannot drift apart. Nothing about a
   product is written here.

   It is a real dialog: it takes focus, keeps Tab inside itself, closes on
   Escape or a click on the backdrop, and hands focus back to the button that
   opened it. The product page remains the destination — this is a look ahead,
   not a replacement for it.
   ========================================================================== */
(function () {
  'use strict';

  var WW = window.WW || (window.WW = {});
  var doc = document;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';
  var panel = null, opener = null, loading = null;

  function build() {
    if (panel) return panel;
    panel = doc.createElement('div');
    panel.className = 'qv';
    panel.setAttribute('hidden', '');
    panel.innerHTML =
      '<div class="qv__veil" data-qv-close></div>' +
      '<div class="qv__box" role="dialog" aria-modal="true" aria-labelledby="qv-name" tabindex="-1">' +
        '<button class="qv__x" type="button" data-qv-close aria-label="Close quick view">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
          '<path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>' +
        '</button>' +
        '<div class="qv__body" aria-live="polite"></div>' +
      '</div>';
    doc.body.appendChild(panel);

    panel.addEventListener('click', function (e) {
      if (e.target.closest('[data-qv-close]')) close();
    });
    return panel;
  }

  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab' || !panel) return;
    /* Tab stays inside the dialog while it is open. */
    var items = [].slice.call(panel.querySelectorAll(FOCUSABLE)).filter(function (el) {
      return el.offsetParent !== null;
    });
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function close() {
    if (!panel || panel.hasAttribute('hidden')) return;
    panel.setAttribute('hidden', '');
    panel.removeAttribute('data-open');
    doc.documentElement.classList.remove('qv-open');
    doc.removeEventListener('keydown', onKey);
    loading = null;
    if (opener && doc.contains(opener)) opener.focus();
    opener = null;
  }
  WW.closeQuickView = close;

  function fill(p) {
    var imgs = WW.images(p);
    var alts = WW.imageAlts(p);
    var href = WW.productHref(p);
    var base = doc.documentElement.getAttribute('data-base') || '';
    var cat = (p.category && p.category.name) || '';
    var wa = p.whatsappMessage
      || ('Hello WIN WEARS, I am interested in ' + p.productName
          + (p.sku ? ' (' + p.sku + ')' : '') + '. Please send me details and quotation.');
    var custom = p.details ? p.details.customizationAvailable : p.customizationAvailable;

    /* Only the rows the product actually carries — a blank one would be an
       invented specification. */
    var specs = (WW.specs(p) || []).slice(0, 6).map(function (row) {
      return '<div><dt>' + esc(row[0]) + '</dt><dd>' + esc(row[1]) + '</dd></div>';
    }).join('');

    panel.querySelector('.qv__body').innerHTML =
      '<div class="qv__media">' +
        (imgs.length
          ? '<img src="' + esc(imgs[0]) + '" alt="' + esc(alts[0] || p.productName) + '" decoding="async">'
          : '<span class="qv__noimg" aria-hidden="true"></span>') +
      '</div>' +
      '<div class="qv__side">' +
        (cat ? '<p class="qv__cat">' + esc(cat) + '</p>' : '') +
        '<h2 class="qv__name" id="qv-name">' + esc(p.productName) + '</h2>' +
        (p.shortDescription ? '<p class="qv__desc">' + esc(p.shortDescription) + '</p>' : '') +
        (p.sku ? '<p class="qv__sku">' + esc(p.sku) + '</p>' : '') +
        (custom ? '<p class="qv__badge">Customization available</p>' : '') +
        (specs ? '<dl class="qv__specs">' + specs + '</dl>' : '') +
        '<div class="qv__actions">' +
          '<a class="btn btn--accent btn--sm" href="' + esc(href) + '">View full product</a>' +
          '<a class="btn btn--ghost btn--sm" href="' + base + 'request-quote.html?product='
            + encodeURIComponent(p.slug || p.id) + '">Request a quote</a>' +
          '<a class="btn btn--whatsapp btn--sm" data-wa="' + esc(wa) + '"'
            + ' aria-label="Ask about ' + esc(p.productName) + ' on WhatsApp">WhatsApp</a>' +
        '</div>' +
      '</div>';

    if (WW.wireWhatsApp) WW.wireWhatsApp(panel);
    var box = panel.querySelector('.qv__box');
    if (box) box.focus();
  }

  function open(slug, from) {
    if (!slug || !WW.loadProduct) return;
    build();
    opener = from || null;
    loading = slug;

    panel.querySelector('.qv__body').innerHTML =
      '<div class="qv__media"><div class="sk sk--media" style="aspect-ratio:1"></div></div>' +
      '<div class="qv__side"><div class="sk sk--line"></div>' +
      '<div class="sk sk--line sk--short"></div><div class="sk sk--block"></div></div>';

    panel.removeAttribute('hidden');
    panel.setAttribute('data-open', '');
    doc.documentElement.classList.add('qv-open');
    doc.addEventListener('keydown', onKey);
    panel.querySelector('.qv__box').focus();

    WW.loadProduct(slug).then(function (res) {
      /* A second card clicked while the first was still loading wins. */
      if (loading !== slug) return;
      fill(res.product || res);
    }).catch(function () {
      if (loading !== slug) return;
      panel.querySelector('.qv__body').innerHTML =
        '<div class="qv__side"><h2 class="qv__name" id="qv-name">We could not load that product</h2>' +
        '<p class="qv__desc">It may have been unpublished. The collection page has the rest of the range.</p>' +
        '<div class="qv__actions"><a class="btn btn--sm" href="' +
        (doc.documentElement.getAttribute('data-base') || '') + 'products.html">Back to products</a></div></div>';
    });
  }
  WW.quickView = open;

  /* One listener for the whole document, so cards drawn later work too. */
  doc.addEventListener('click', function (e) {
    var b = e.target.closest('[data-quickview]');
    if (!b) return;
    e.preventDefault();
    open(b.getAttribute('data-quickview'), b);
  });
})();
