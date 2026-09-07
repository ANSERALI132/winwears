/* ==========================================================================
   WIN WEARS — Product detail
   One reusable template driven by ?id=<product-id>. Gallery, spec sheet and
   CTAs are all built from the catalogue data.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* Photo roles, in the order the shots tend to be taken. */
  var ROLES = ['Front', 'Side', 'Close-up', 'Construction', 'Detail', 'Packaging', 'Lifestyle'];

  function notFound() {
    $('#pdp-h1').textContent = 'Football not found';
    $('#pdp-eyebrow').textContent = 'Product';
    $('#pdp').innerHTML =
      '<div class="empty-state" style="grid-column:1/-1">'
      + '<h3>We could not find that football</h3>'
      + '<p class="lead" style="margin:.5rem auto var(--s-5)">It may have been renamed or is not currently published.</p>'
      + '<a class="btn" href="products.html">Back to the collection</a></div>';
  }

  function render(p) {
    var c = WW.catBy(p.cat) || {};
    var imgs = WW.images(p);
    var waMsg = 'Hello WIN WEARS, I am interested in ' + p.name + ' (' + p.sku + '). Please send me details and quotation.';

    /* --- head / SEO ---------------------------------------------------- */
    /* Model names repeat across a range, so the colourway is what makes each
       page (and each search result) distinct. */
    doc.title = p.name + ' · ' + p.colour + ' | WIN WEARS';
    setMeta('name', 'description', p.name + ' in ' + p.colour + '. ' + c.name + ' by WIN WEARS — ' + c.construction + ', available for bulk order with custom branding.');
    setMeta('property', 'og:title', p.name + ' · ' + p.colour + ' — WIN WEARS');
    setMeta('property', 'og:description', c.name + ' · ' + p.colour);
    setMeta('property', 'og:image', imgs[0]);
    var canon = $('link[rel="canonical"]');
    if (canon) canon.href = 'https://winwears.com/product?id=' + p.id;

    /* --- header -------------------------------------------------------- */
    $('#pdp-eyebrow').textContent = c.name;
    $('#pdp-h1').textContent = p.name;
    var crumb = $('#pdp-crumb');
    crumb.insertAdjacentHTML('beforeend',
      '<li><a href="' + c.page + '">' + esc(c.short) + '</a></li>'
      + '<li aria-current="page">' + esc(p.colour) + '</li>');

    /* --- body ---------------------------------------------------------- */
    var thumbs = imgs.map(function (src, i) {
      return '<button class="gallery__thumb" type="button" data-i="' + i + '" aria-current="' + (i === 0) + '">'
        + '<img src="' + src + '" alt="' + esc(p.name + ' — ' + (ROLES[i] || 'View ' + (i + 1))) + '" loading="lazy" decoding="async">'
        + '</button>';
    }).join('');

    var specs = WW.specs(p).map(function (row) {
      return '<div><dt>' + esc(row[0]) + '</dt><dd>' + esc(row[1]) + '</dd></div>';
    }).join('');

    $('#pdp').innerHTML = ''
      + '<div class="gallery">'
      +   '<div class="gallery__main" id="gal-main" data-zoom="false" title="Click to zoom">'
      +     '<img src="' + imgs[0] + '" alt="' + esc(p.name + ' — ' + p.colour) + '" id="gal-img" decoding="async">'
      +   '</div>'
      +   '<div class="gallery__thumbs" id="gal-thumbs">' + thumbs + '</div>'
      + '</div>'

      + '<div class="pdp__side">'
      +   '<div class="stack">'
      +     '<p class="eyebrow">' + esc(c.num) + ' — ' + esc(c.name) + '</p>'
      +     '<h2 class="pdp__title">' + esc(p.name) + '</h2>'
      +     '<p class="pdp__colour">' + esc(p.colour) + '</p>'
      +     '<p class="pdp__sku">' + esc(p.sku) + '</p>'
      +   '</div>'

      +   '<dl class="spec-table">' + specs + '</dl>'

      +   '<div class="pdp__cta">'
      +     '<a class="btn btn--accent" href="request-quote.html?product=' + encodeURIComponent(p.id) + '" data-magnetic>Request Bulk Quote</a>'
      +     '<a class="btn btn--ghost" href="customization.html?ball=' + encodeURIComponent(p.cat) + '">Customize This Ball</a>'
      +     '<a class="btn btn--whatsapp" data-wa="' + esc(waMsg) + '">WhatsApp Us</a>'
      +   '</div>'

      +   '<p class="pdp__note">Specifications above are indicative and confirmed at quotation. Bladder, panel count, weight and packaging are all set per order — tell us how the ball will be used and we will spec it with you.</p>'
      + '</div>';

    /* --- gallery ------------------------------------------------------- */
    var main = $('#gal-main');
    var mainImg = $('#gal-img');

    $$('#gal-thumbs .gallery__thumb').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = +btn.getAttribute('data-i');
        mainImg.src = imgs[i];
        mainImg.alt = p.name + ' — ' + (ROLES[i] || 'View ' + (i + 1));
        $$('#gal-thumbs .gallery__thumb').forEach(function (b) { b.setAttribute('aria-current', String(b === btn)); });
        main.setAttribute('data-zoom', 'false');
        main.style.removeProperty('--ox');
      });
    });

    /* Click to zoom, move to pan. */
    main.addEventListener('click', function () {
      main.setAttribute('data-zoom', main.getAttribute('data-zoom') === 'true' ? 'false' : 'true');
    });
    main.addEventListener('mousemove', function (e) {
      if (main.getAttribute('data-zoom') !== 'true') return;
      var r = main.getBoundingClientRect();
      mainImg.style.transformOrigin =
        ((e.clientX - r.left) / r.width * 100) + '% ' + ((e.clientY - r.top) / r.height * 100) + '%';
    });
    main.addEventListener('mouseleave', function () { main.setAttribute('data-zoom', 'false'); });

    /* --- page CTAs ----------------------------------------------------- */
    var q = $('#cta-quote');
    if (q) q.href = 'request-quote.html?product=' + encodeURIComponent(p.id);
    var w = $('#cta-wa');
    if (w) w.setAttribute('data-wa', waMsg);

    /* --- related ------------------------------------------------------- */
    var related = WW.publicProducts(p.cat).filter(function (o) { return o.id !== p.id; }).slice(0, 4);
    if (related.length) {
      $('#related-wrap').hidden = false;
      $('#related-title').textContent = 'More ' + c.short + ' footballs';
      WW.renderGrid($('#related-grid'), related);
    }

    if (WW.wireWhatsApp) WW.wireWhatsApp(doc);
    if (WW.bootReveal) WW.bootReveal(doc);

    /* --- structured data ------------------------------------------------ */
    var ld = doc.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      sku: p.sku,
      color: p.colour,
      category: c.name,
      image: imgs,
      brand: { '@type': 'Brand', name: 'WIN WEARS' },
      description: c.name + ' by WIN WEARS. ' + c.construction + '. Available for bulk order with custom branding.'
    });
    doc.head.appendChild(ld);
  }

  function setMeta(attr, key, value) {
    var el = doc.querySelector('meta[' + attr + '="' + key + '"]');
    if (!el) {
      el = doc.createElement('meta');
      el.setAttribute(attr, key);
      doc.head.appendChild(el);
    }
    el.setAttribute('content', value);
  }

  function init() {
    var id = new URLSearchParams(location.search).get('id');
    var p = id ? WW.productBy(id) : null;
    /* Only ever render products cleared for publication. */
    if (!p || p.status !== 'public') { notFound(); return; }
    render(p);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
