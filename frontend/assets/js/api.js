/* ==========================================================================
   WIN WEARS — Data layer
   --------------------------------------------------------------------------
   Replaces the old data/products.js. The catalogue, the categories and the
   business contact details now come from the API, which reads them from
   PostgreSQL — so adding a football in /admin puts it on the website with no
   code change.

   Everything here is async. Page scripts wait on `WW.ready` before they run.

   SHAPES
     WW.CONTACT      brand, phoneDisplay, whatsapp, email, social{}
     WW.CATEGORIES   [{ id, key, slug, name, short, page, blurb, productCount }]

   LOADERS
     WW.loadProducts({ category, q, construction, material, usage, size,
                       featured, page, perPage, sort })  -> { items, meta }
     WW.loadProduct(slugOrId)                            -> { product, related }
     WW.loadFeatured()                                   -> [product]
     WW.loadFilters()                                    -> { categories, ... }
     WW.submitQuote(formData)                            -> { ok, reference }
     WW.submitContact(body)                              -> { ok }
   ========================================================================== */
(function () {
  'use strict';

  var WW = (window.WW = window.WW || {});

  /* Pages under products/ set data-base="../" for their own relative links.
     The API is always root-absolute, so it needs no such adjustment. */
  var BASE = document.documentElement.getAttribute('data-base') || '';
  var API = '/api';

  /* --- plumbing ---------------------------------------------------------- */

  function ApiError(message, status) {
    this.name = 'ApiError';
    this.message = message;
    this.status = status;
  }
  ApiError.prototype = Object.create(Error.prototype);

  var FRIENDLY = 'We could not load that just now. Please refresh, or contact us on WhatsApp.';

  function get(path) {
    return fetch(API + path, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res
          .json()
          .catch(function () { throw new ApiError(FRIENDLY, res.status); })
          .then(function (body) {
            if (!res.ok) {
              throw new ApiError((body && body.error && body.error.message) || FRIENDLY, res.status);
            }
            return body;
          });
      })
      .catch(function (err) {
        if (err instanceof ApiError) throw err;
        /* Network failure, offline, or the site opened straight from disk. */
        throw new ApiError(FRIENDLY, 0);
      });
  }

  function post(path, body, isForm) {
    var init = { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (isForm) {
      init.body = body;
    } else {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch(API + path, init).then(function (res) {
      return res.json().then(function (payload) {
        if (!res.ok) {
          var err = new ApiError((payload && payload.error && payload.error.message) || FRIENDLY, res.status);
          err.issues = (payload && payload.error && payload.error.issues) || [];
          throw err;
        }
        return payload.data;
      });
    });
  }

  function qs(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === '') return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  WW.ApiError = ApiError;

  /* --- boot -------------------------------------------------------------- */

  WW.CONTACT = null;
  WW.CATEGORIES = [];

  /**
   * Resolves once the contact details and categories are in place — the two
   * things every page needs. Product lists are fetched per view.
   */
  WW.ready = Promise.all([get('/settings'), get('/categories')]).then(function (results) {
    WW.CONTACT = results[0].data;

    WW.CATEGORIES = results[1].data.map(function (c) {
      return {
        id: c.id,
        /* The old data file had a separate short key. The slug is now the one
           identifier, and the category pages use it in data-category. */
        key: c.slug,
        slug: c.slug,
        name: c.name,
        short: c.name,
        blurb: c.description || c.shortDescription || '',
        shortDescription: c.shortDescription || '',
        image: c.image,
        page: BASE + 'products/' + c.slug + '.html',
        productCount: c.productCount,
        seo: c.seo,
      };
    });

    return { contact: WW.CONTACT, categories: WW.CATEGORIES };
  });

  /* --- lookups ----------------------------------------------------------- */

  WW.catBy = function (key) {
    if (!key) return null;
    for (var i = 0; i < WW.CATEGORIES.length; i++) {
      var c = WW.CATEGORIES[i];
      if (c.key === key || c.slug === key || c.id === key) return c;
    }
    return null;
  };

  /* --- catalogue --------------------------------------------------------- */

  /** One page of published products. Server-side filtered and paginated. */
  WW.loadProducts = function (params) {
    return get('/products' + qs(params || {})).then(function (body) {
      return { items: body.data, meta: body.meta };
    });
  };

  WW.loadProduct = function (slugOrId) {
    return get('/products/' + encodeURIComponent(slugOrId)).then(function (body) {
      return { product: body.data, related: body.related || [] };
    });
  };

  WW.loadFeatured = function () {
    return get('/products/featured').then(function (body) { return body.data; });
  };

  /** Filter values that actually exist in the published catalogue. */
  WW.loadFilters = function () {
    return get('/products/filters').then(function (body) { return body.data; });
  };

  /* --- helpers the page scripts share ------------------------------------ */

  /** Image URLs for a product, in gallery order. */
  WW.images = function (p) {
    if (!p) return [];
    if (p.images && p.images.length) {
      return p.images.map(function (i) { return i.url; });
    }
    return p.primaryImage ? [p.primaryImage] : [];
  };

  /** Alt text alongside each image, so galleries stay accessible. */
  WW.imageAlts = function (p) {
    if (!p || !p.images) return [];
    return p.images.map(function (i) { return i.altText || p.productName; });
  };

  /**
   * Spec rows for the product page.
   *
   * The admin's own specification rows win. When none have been entered we
   * fall back to whatever technical fields are filled in — and show nothing
   * at all rather than inventing a value for a blank field.
   */
  WW.specs = function (p) {
    if (!p) return [];
    if (p.specifications && p.specifications.length) {
      return p.specifications.map(function (s) { return [s.label, s.value]; });
    }

    var d = p.details || {};
    var rows = [
      ['Category', p.category && p.category.name],
      ['Construction', d.construction],
      ['Material', d.material],
      ['Size', d.size],
      ['Weight', d.weight],
      ['Bladder', d.bladder],
      ['Panels', d.panelCount],
      ['Surface', d.surface],
      ['Stitching', d.stitching],
      ['Technology', d.technology],
      ['Intended use', d.usage],
    ].filter(function (row) { return row[1]; });

    if (d.customizationAvailable) rows.push(['Customisation', 'Available — colours, artwork, logo and packaging']);
    return rows;
  };

  /** Link to a product detail page. */
  WW.productHref = function (p) {
    return BASE + 'product.html?slug=' + encodeURIComponent(p.slug || p.id);
  };

  /* --- forms ------------------------------------------------------------- */

  /** `body` may be a FormData when the RFQ carries a logo or design file. */
  WW.submitQuote = function (body) {
    return post('/quotes', body, typeof FormData !== 'undefined' && body instanceof FormData);
  };

  WW.submitContact = function (body) {
    return post('/contact', body, false);
  };
})();
