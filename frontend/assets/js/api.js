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

  /**
   * `noApi` marks the case where nothing answered as an API at all — the
   * request never reached a server, or what came back was not JSON (a static
   * host's 404 page, say). That is what the snapshot fallback keys on, and it
   * is deliberately distinct from our own API returning a JSON 404, which is
   * a real answer and must not be papered over.
   */
  function ApiError(message, status, noApi) {
    this.name = 'ApiError';
    this.message = message;
    this.status = status;
    this.noApi = Boolean(noApi);
  }
  ApiError.prototype = Object.create(Error.prototype);

  var FRIENDLY = 'We could not load that just now. Please refresh, or contact us on WhatsApp.';

  function get(path) {
    return fetch(API + path, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res
          .json()
          .catch(function () { throw new ApiError(FRIENDLY, res.status, true); })
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
        throw new ApiError(FRIENDLY, 0, true);
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

  /* --- fallback ----------------------------------------------------------
     When the API cannot be reached at all — backend down, or the site served
     as plain static files — we fall back to the bundled catalogue snapshot
     rather than showing an empty collection. The database stays the source of
     truth: the moment /api answers, it wins again.

     A 404 or a 500 is NOT a fallback case. Those mean the server is there and
     said no, and hiding that behind stale data would be worse than an error.
     ---------------------------------------------------------------------- */

  /** True when the site is running on the bundled snapshot, not the database. */
  WW.offline = false;

  var snapshotPromise = null;

  function loadSnapshot() {
    if (snapshotPromise) return snapshotPromise;

    snapshotPromise = new Promise(function (resolve) {
      if (window.WW_SNAPSHOT) return resolve(window.WW_SNAPSHOT);

      var el = document.createElement('script');
      el.src = BASE + 'assets/js/data/products.js';
      el.onload = function () { resolve(window.WW_SNAPSHOT || null); };
      el.onerror = function () { resolve(null); };
      document.head.appendChild(el);
    });

    return snapshotPromise;
  }

  /** Snapshot product -> the shape the API returns, so nothing downstream
   *  needs to know which source it came from. */
  function adaptProduct(p, categoryByKey) {
    var cat = categoryByKey[p.cat] || {};
    var images = [];
    for (var i = 1; i <= p.shots; i++) {
      images.push({
        url: BASE + 'assets/img/products/' + p.cat + '/' + p.id + '/' + i + '.jpeg',
        altText: p.name + ' — ' + p.colour,
      });
    }

    var specs = [
      ['Category', cat.name],
      ['Construction', cat.construction],
      ['Outer material', cat.material],
      ['Bladder', cat.bladder],
      ['Panels', p.note || cat.panels],
      ['Sizes', cat.sizes],
      ['Intended use', p.usage || cat.usage],
      ['Colourway', p.colour],
    ].filter(function (row) { return row[1]; });

    return {
      id: p.id,
      slug: p.id,
      sku: p.sku,
      productName: p.name,
      shortDescription: p.colour,
      fullDescription: null,
      featured: false,
      category: { id: p.cat, name: cat.name, slug: cat.slug },
      construction: cat.construction,
      material: cat.material,
      usage: p.usage || cat.usage,
      size: cat.sizes,
      customizationAvailable: true,
      details: {
        construction: cat.construction,
        material: cat.material,
        usage: p.usage || cat.usage,
        size: cat.sizes,
        bladder: cat.bladder,
        panelCount: p.note || cat.panels,
        customizationAvailable: true,
      },
      commercial: { quoteOnly: true, price: null, currency: 'USD', priceLabel: 'Price on request', moq: null },
      features: [],
      specifications: specs.map(function (row) { return { label: row[0], value: row[1] }; }),
      images: images,
      primaryImage: images.length ? images[0].url : null,
      secondaryImage: images.length > 1 ? images[1].url : null,
      seo: { title: null, description: null, keywords: null, ogImage: null },
      whatsappMessage: 'Hello WIN WEARS, I am interested in ' + p.name + ' (' + p.sku
        + '). Please send me product details and quotation.',
    };
  }

  var snapshot = null;

  function buildSnapshot(raw) {
    var categoryByKey = {};
    raw.CATEGORIES.forEach(function (c) { categoryByKey[c.key] = c; });

    /* The snapshot's own `status` flag is respected: the products it marks
       hidden carry another company's trademark and must stay unpublished. */
    var products = raw.PRODUCTS
      .filter(function (p) { return p.status === 'public'; })
      .map(function (p) { return adaptProduct(p, categoryByKey); });

    var categories = raw.CATEGORIES.map(function (c, i) {
      return {
        id: c.key,
        key: c.slug,
        slug: c.slug,
        name: c.name,
        short: c.name,
        blurb: c.blurb || '',
        shortDescription: c.short || '',
        image: null,
        page: BASE + 'products/' + c.slug + '.html',
        displayOrder: i,
        productCount: products.filter(function (p) { return p.category.slug === c.slug; }).length,
        seo: {},
      };
    });

    return { contact: raw.CONTACT, categories: categories, products: products };
  }

  /* --- boot -------------------------------------------------------------- */

  WW.CONTACT = null;
  WW.CATEGORIES = [];

  function adoptCategories(rows) {
    WW.CATEGORIES = rows.map(function (c) {
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
  }

  /**
   * Resolves once the contact details and categories are in place — the two
   * things every page needs. Product lists are fetched per view.
   */
  WW.ready = Promise.all([get('/settings'), get('/categories')])
    .then(function (results) {
      WW.CONTACT = results[0].data;
      adoptCategories(results[1].data);
      return { contact: WW.CONTACT, categories: WW.CATEGORIES, offline: false };
    })
    .catch(function (err) {
      /* Only when nothing answered as an API. A JSON error from our own
         backend is a real answer and must reach the page. */
      if (!err.noApi) throw err;

      return loadSnapshot().then(function (raw) {
        if (!raw) throw err;

        snapshot = buildSnapshot(raw);
        WW.offline = true;
        WW.CONTACT = snapshot.contact;
        WW.CATEGORIES = snapshot.categories;

        console.info(
          '[WIN WEARS] The API is unreachable, so the site is showing the bundled '
          + 'catalogue snapshot. Start the backend to serve the live database.',
        );

        return { contact: WW.CONTACT, categories: WW.CATEGORIES, offline: true };
      });
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

  /* When the snapshot is in play the server cannot filter for us, so the same
     rules are applied here. Kept deliberately close to the server's, so a
     visitor sees the same result either way. */

  function matches(p, params) {
    if (params.category && p.category.slug !== params.category && p.category.id !== params.category) return false;

    var eq = function (a, b) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); };
    if (params.construction && !eq(p.construction, params.construction)) return false;
    if (params.material && !eq(p.material, params.material)) return false;
    if (params.usage && !eq(p.usage, params.usage)) return false;

    if (params.size && String(p.size || '').toLowerCase().indexOf(String(params.size).toLowerCase()) === -1) return false;
    if (params.customization && p.customizationAvailable !== (params.customization === 'yes')) return false;
    if (params.featured && p.featured !== (params.featured === 'yes')) return false;

    if (params.q) {
      var needle = String(params.q).toLowerCase();
      var haystack = [p.productName, p.sku, p.shortDescription, p.construction, p.material, p.usage, p.category.name]
        .join(' ')
        .toLowerCase();
      if (haystack.indexOf(needle) === -1) return false;
    }
    return true;
  }

  function sortProducts(list, sort) {
    var out = list.slice();
    if (sort === 'name') out.sort(function (a, b) { return a.productName.localeCompare(b.productName); });
    else if (sort === 'name-desc') out.sort(function (a, b) { return b.productName.localeCompare(a.productName); });
    return out;
  }

  function paginate(list, params) {
    var page = Math.max(1, Number(params.page) || 1);
    var perPage = Math.max(1, Number(params.perPage) || 24);
    var total = list.length;
    return {
      items: list.slice((page - 1) * perPage, page * perPage),
      meta: { page: page, perPage: perPage, total: total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
    };
  }

  /** One page of published products. Filtered and paginated on the server —
   *  or here, identically, when running on the snapshot. */
  WW.loadProducts = function (params) {
    var p = params || {};
    if (snapshot) {
      return Promise.resolve(
        paginate(sortProducts(snapshot.products.filter(function (x) { return matches(x, p); }), p.sort), p),
      );
    }
    return get('/products' + qs(p)).then(function (body) {
      return { items: body.data, meta: body.meta };
    });
  };

  WW.loadProduct = function (slugOrId) {
    if (snapshot) {
      var product = null;
      for (var i = 0; i < snapshot.products.length; i++) {
        if (snapshot.products[i].slug === slugOrId || snapshot.products[i].id === slugOrId) {
          product = snapshot.products[i];
          break;
        }
      }
      if (!product) return Promise.reject(new ApiError('That football is not available.', 404));

      var related = snapshot.products
        .filter(function (x) { return x.category.slug === product.category.slug && x.id !== product.id; })
        .slice(0, 4);
      return Promise.resolve({ product: product, related: related });
    }

    return get('/products/' + encodeURIComponent(slugOrId)).then(function (body) {
      return { product: body.data, related: body.related || [] };
    });
  };

  WW.loadFeatured = function () {
    /* The snapshot has no notion of a featured product — that is an admin
       decision, so there is nothing honest to show. */
    if (snapshot) return Promise.resolve([]);
    return get('/products/featured').then(function (body) { return body.data; });
  };

  /** Filter values that actually exist in the published catalogue. */
  WW.loadFilters = function () {
    if (snapshot) {
      var distinct = function (key) {
        var seen = {};
        var out = [];
        snapshot.products.forEach(function (p) {
          var v = p[key];
          if (v && !seen[v]) { seen[v] = 1; out.push(v); }
        });
        return out.sort();
      };
      return Promise.resolve({
        categories: snapshot.categories.map(function (c) { return { slug: c.slug, name: c.name }; }),
        construction: distinct('construction'),
        material: distinct('material'),
        usage: distinct('usage'),
        size: distinct('size'),
      });
    }
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

  /* Forms need a server. There is no offline equivalent, and pretending a
     submission succeeded would lose the enquiry — so we say so plainly and
     both forms fall back to the WhatsApp / email handoff. */
  var NO_SERVER = 'We cannot send that from here right now. Please message us on WhatsApp or by email — the buttons below have your details ready.';

  /** `body` may be a FormData when the RFQ carries a logo or design file. */
  WW.submitQuote = function (body) {
    if (WW.offline) return Promise.reject(new ApiError(NO_SERVER, 0));
    return post('/quotes', body, typeof FormData !== 'undefined' && body instanceof FormData);
  };

  WW.submitContact = function (body) {
    if (WW.offline) return Promise.reject(new ApiError(NO_SERVER, 0));
    return post('/contact', body, false);
  };
})();
