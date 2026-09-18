/* ==========================================================================
   WIN WEARS — Product detail
   One reusable template driven by ?slug=<product-slug>. Gallery, spec sheet,
   features and CTAs all come from the API.
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

  function notFound(message) {
    $('#pdp-h1').textContent = 'Football not found';
    $('#pdp-eyebrow').textContent = 'Product';
    $('#pdp').innerHTML =
      '<div class="empty-state" style="grid-column:1/-1">'
      + '<h3>We could not find that football</h3>'
      + '<p class="lead" style="margin:.5rem auto var(--s-5)">'
      + esc(message || 'It may have been renamed, or it is not currently published.')
      + '</p><a class="btn" href="products.html">Back to the collection</a></div>';
  }

  function skeleton() {
    $('#pdp').innerHTML =
      '<div class="gallery"><div class="sk sk--media" style="aspect-ratio:1"></div></div>'
      + '<div class="pdp__side"><div class="sk sk--line"></div><div class="sk sk--line sk--short"></div>'
      + '<div class="sk sk--block"></div></div>';
  }

  function setMeta(attr, key, value) {
    if (!value) return;
    var el = doc.querySelector('meta[' + attr + '="' + key + '"]');
    if (!el) {
      el = doc.createElement('meta');
      el.setAttribute(attr, key);
      doc.head.appendChild(el);
    }
    el.setAttribute('content', value);
  }

  function render(p, related) {
    var imgs = WW.images(p);
    var alts = WW.imageAlts(p);
    var waMsg = p.whatsappMessage;
    var categoryName = (p.category && p.category.name) || '';
    var categoryPage = p.category && p.category.slug ? 'products/' + p.category.slug + '.html' : 'products.html';

    /* --- head / SEO ---------------------------------------------------- */
    doc.title = (p.seo && p.seo.title) || (p.productName + ' | WIN WEARS');
    setMeta('name', 'description', (p.seo && p.seo.description) || p.shortDescription
      || (p.productName + ' by WIN WEARS. Available for bulk order with custom branding.'));
    setMeta('property', 'og:title', p.productName + ' — WIN WEARS');
    setMeta('property', 'og:description', (p.seo && p.seo.description) || p.shortDescription || categoryName);
    setMeta('property', 'og:image', (p.seo && p.seo.ogImage) || imgs[0]);

    var canon = $('link[rel="canonical"]');
    if (canon) canon.href = location.origin + '/product.html?slug=' + encodeURIComponent(p.slug);

    /* --- header -------------------------------------------------------- */
    $('#pdp-eyebrow').textContent = categoryName;
    $('#pdp-h1').textContent = p.productName;

    var crumb = $('#pdp-crumb');
    if (crumb) {
      crumb.insertAdjacentHTML('beforeend',
        (categoryName ? '<li><a href="' + esc(categoryPage) + '">' + esc(categoryName) + '</a></li>' : '')
        + '<li aria-current="page">' + esc(p.productName) + '</li>');
    }

    /* --- gallery ------------------------------------------------------- */
    var galleryHTML = imgs.length
      ? '<div class="gallery">'
        +   '<div class="gallery__main" id="gal-main" data-zoom="false" title="Click to zoom">'
        +     '<img src="' + esc(imgs[0]) + '" alt="' + esc(alts[0] || p.productName) + '" id="gal-img" decoding="async">'
        +   '</div>'
        +   (imgs.length > 1
              ? '<div class="gallery__thumbs" id="gal-thumbs">' + imgs.map(function (src, i) {
                  return '<button class="gallery__thumb" type="button" data-i="' + i + '" aria-current="' + (i === 0) + '">'
                    + '<img src="' + esc(src) + '" alt="' + esc(alts[i] || p.productName) + '" loading="lazy" decoding="async">'
                    + '</button>';
                }).join('') + '</div>'
              : '')
        + '</div>'
      : '<div class="gallery"><div class="gallery__main gallery__main--empty"><p class="muted">No photograph yet</p></div></div>';

    /* Apparel — a soccer uniform, a tracksuit — is not a ball: no ball
       customiser, and a note about kit rather than bladders. Both kinds sit
       in groups now, so only the flag tells them apart. */
    var productCat = p.category && WW.catBy(p.category.slug);
    var isKit = !!(productCat && productCat.footballRange === false);

    var specs = WW.specs(p).map(function (row) {
      return '<div><dt>' + esc(row[0]) + '</dt><dd>' + esc(row[1]) + '</dd></div>';
    }).join('');

    var features = (p.features || []).length
      ? '<ul class="pdp__features">' + p.features.map(function (f) {
          return '<li><strong>' + esc(f.title) + '</strong>'
            + (f.description ? '<span>' + esc(f.description) + '</span>' : '') + '</li>';
        }).join('') + '</ul>'
      : '';

    var c = p.commercial || {};
    var priceLine = c.quoteOnly || c.price === null
      ? '<p class="pdp__price">' + esc(c.priceLabel || 'Price on request') + '</p>'
      : '<p class="pdp__price">' + esc(c.currency + ' ' + c.price) + '</p>';
    var moqLine = c.moq ? '<p class="pdp__moq">Minimum order ' + esc(String(c.moq)) + ' units</p>' : '';

    $('#pdp').innerHTML = ''
      + galleryHTML
      + '<div class="pdp__side">'
      +   '<div class="stack">'
      +     (categoryName ? '<p class="eyebrow">' + esc(categoryName) + '</p>' : '')
      +     '<h2 class="pdp__title">' + esc(p.productName) + '</h2>'
      +     (p.shortDescription ? '<p class="pdp__colour">' + esc(p.shortDescription) + '</p>' : '')
      +     '<p class="pdp__sku">' + esc(p.sku) + '</p>'
      +     priceLine
      +     moqLine
      +   '</div>'
      +   (p.fullDescription ? '<div class="pdp__copy"><p>' + esc(p.fullDescription).replace(/\n+/g, '</p><p>') + '</p></div>' : '')
      +   features
      +   (specs ? '<dl class="spec-table">' + specs + '</dl>' : '')
      +   '<div class="pdp__cta">'
      +     '<a class="btn btn--accent" href="request-quote.html?product=' + encodeURIComponent(p.slug) + '" data-magnetic>Request Bulk Quote</a>'
      +     (p.details && p.details.customizationAvailable && !isKit
              ? '<a class="btn btn--ghost" href="customization.html?ball=' + encodeURIComponent((p.category && p.category.slug) || '') + '">Customize This Ball</a>'
              : '')
      +     '<a class="btn btn--whatsapp" data-wa="' + esc(waMsg) + '">WhatsApp Us</a>'
      +   '</div>'
      +   (isKit
            ? '<p class="pdp__note">Specifications above are confirmed at quotation. Sizes, colours, crest, sponsor, names and numbers are set per order — tell us about your team and we will spec it with you.</p>'
            : '<p class="pdp__note">Specifications above are confirmed at quotation. Bladder, panel count, weight and packaging are set per order — tell us how the ball will be used and we will spec it with you.</p>')
      + '</div>';

    wireGallery(imgs, alts, p);

    /* --- page CTAs ----------------------------------------------------- */
    var q = $('#cta-quote');
    if (q) q.href = 'request-quote.html?product=' + encodeURIComponent(p.slug);
    var w = $('#cta-wa');
    if (w) w.setAttribute('data-wa', waMsg);

    /* --- ask the assistant --------------------------------------------- */
    /* Added only once the widget confirms it exists, so no button appears
       when no AI key is configured. WWChat.ready settles either way, so this
       does not race the status request. */
    if (window.WWChat) {
      window.WWChat.ready.then(function (available) {
        var cta = $('.pdp__cta');
        if (!available || !cta) return;
        var ask = doc.createElement('button');
        ask.type = 'button';
        ask.className = 'btn btn--ghost';
        ask.textContent = isKit ? 'Ask AI About This Kit' : 'Ask AI About This Ball';
        ask.addEventListener('click', function () {
          window.WWChat.openForProduct({ slug: p.slug, name: p.productName });
        });
        cta.appendChild(ask);
      });
    }

    /* --- related ------------------------------------------------------- */
    if (related.length) {
      $('#related-wrap').hidden = false;
      $('#related-title').textContent = categoryName ? 'More ' + categoryName : 'More footballs';
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
      name: p.productName,
      sku: p.sku,
      category: categoryName,
      image: imgs.map(function (src) { return location.origin + src; }),
      brand: { '@type': 'Brand', name: 'WIN WEARS' },
      description: (p.seo && p.seo.description) || p.shortDescription || '',
      /* Quote-only products have no price to advertise, so no offer is
         claimed — an invented one would be a false listing. */
      offers: c.quoteOnly || c.price === null
        ? undefined
        : { '@type': 'Offer', price: c.price, priceCurrency: c.currency, availability: 'https://schema.org/InStock' },
    });
    doc.head.appendChild(ld);
  }

  function wireGallery(imgs, alts, p) {
    var main = $('#gal-main');
    var mainImg = $('#gal-img');
    if (!main || !mainImg) return;

    $$('#gal-thumbs .gallery__thumb').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = +btn.getAttribute('data-i');
        mainImg.src = imgs[i];
        mainImg.alt = alts[i] || p.productName;
        $$('#gal-thumbs .gallery__thumb').forEach(function (b) { b.setAttribute('aria-current', String(b === btn)); });
        main.setAttribute('data-zoom', 'false');
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
  }

  function init() {
    var params = new URLSearchParams(location.search);
    /* ?id= is what the old static site used; keep those links working. */
    var key = params.get('slug') || params.get('id');
    if (!key) return notFound('No product was requested.');

    skeleton();

    WW.loadProduct(key)
      .then(function (res) { render(res.product, res.related); })
      .catch(function (err) {
        notFound(err && err.status === 404 ? null : (err && err.message));
      });
  }

  WW.ready.then(init).catch(function (err) { notFound(err && err.message); });
})();
