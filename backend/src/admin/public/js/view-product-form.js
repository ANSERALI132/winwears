/* ==========================================================================
   Admin — Add / edit product
   Eight steps over one form. The whole product is held in memory and saved in
   one call, except images, which need a product id and so upload immediately
   on the edit screen.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  var STEPS = ['Basic', 'Technical', 'Features', 'Specifications', 'Images', 'Commercial', 'SEO', 'Publish'];

  function field(label, control, hint, required) {
    return h(
      'div.field',
      { class: required ? 'field--req' : '' },
      h('label.field__label', { text: label, for: control.id || null }),
      control,
      hint ? h('p.field__hint', { text: hint }) : null,
    );
  }

  function input(name, attrs) {
    var props = { type: 'text', name: name, id: 'f-' + name };
    Object.keys(attrs || {}).forEach(function (k) { props[k] = attrs[k]; });
    return h('input', props);
  }

  function textarea(name, attrs) {
    var props = { name: name, id: 'f-' + name };
    Object.keys(attrs || {}).forEach(function (k) { props[k] = attrs[k]; });
    return h('textarea', props);
  }

  function checkbox(name, label, checked) {
    var box = h('input', { type: 'checkbox', name: name, id: 'f-' + name, checked: !!checked });
    return { el: h('label.check', box, h('span', { text: label })), input: box };
  }

  /* ------------------------------------------------------- repeaters ---- */

  /**
   * A reorderable list of rows (features or specifications).
   * `fields` describes each row; `read()` returns the current values.
   */
  function repeater(options) {
    var list = h('div');
    var rows = [];

    function draw() {
      ui.clear(list);
      if (!rows.length) {
        list.appendChild(h('p.muted', { text: options.emptyText }));
      }
      rows.forEach(function (row, index) {
        list.appendChild(rowEl(row, index));
      });
    }

    function move(from, to) {
      if (to < 0 || to >= rows.length) return;
      var moved = rows.splice(from, 1)[0];
      rows.splice(to, 0, moved);
      draw();
    }

    function rowEl(row, index) {
      var controls = options.fields.map(function (f) {
        var el = f.textarea
          ? h('textarea', { placeholder: f.placeholder, rows: 2, value: row[f.key] || '' })
          : h('input', { type: 'text', placeholder: f.placeholder, value: row[f.key] || '' });
        el.addEventListener('input', function () { row[f.key] = el.value; });
        return h('div', h('label.field__label', { text: f.label }), el);
      });

      return h(
        'div.repeat__item',
        h(
          'div.repeat__head',
          h('span.repeat__grip', { 'aria-hidden': 'true', text: '⠿' }),
          h('strong', { text: options.rowLabel + ' ' + (index + 1) }),
          h('button.btn.btn--sm', {
            type: 'button',
            'aria-label': 'Move up',
            disabled: index === 0,
            onclick: function () { move(index, index - 1); },
          }, '↑'),
          h('button.btn.btn--sm', {
            type: 'button',
            'aria-label': 'Move down',
            disabled: index === rows.length - 1,
            onclick: function () { move(index, index + 1); },
          }, '↓'),
          h('button.btn.btn--sm.btn--danger', {
            type: 'button',
            onclick: function () { rows.splice(index, 1); draw(); },
          }, 'Remove'),
        ),
        h('div.row', controls),
      );
    }

    var addBtn = h(
      'button.btn.btn--sm',
      {
        type: 'button',
        onclick: function () {
          var blank = {};
          options.fields.forEach(function (f) { blank[f.key] = ''; });
          rows.push(blank);
          draw();
        },
      },
      options.addLabel,
    );

    return {
      el: h('div', list, h('div', { style: 'margin-top:6px' }, addBtn)),
      set: function (values) {
        rows = (values || []).map(function (v) {
          var copy = {};
          options.fields.forEach(function (f) { copy[f.key] = v[f.key] || ''; });
          return copy;
        });
        draw();
      },
      read: function () {
        return rows
          .filter(function (r) { return options.fields.some(function (f) { return String(r[f.key] || '').trim(); }); })
          .map(function (r, i) {
            var out = { displayOrder: i };
            options.fields.forEach(function (f) { out[f.key] = String(r[f.key] || '').trim(); });
            return out;
          });
      },
    };
  }

  /* --------------------------------------------------------- gallery ---- */

  function gallery(productId) {
    var grid = h('div.gallery');
    var wrap = h('div');
    var dragging = null;

    var fileInput = h('input', {
      type: 'file',
      multiple: true,
      accept: 'image/jpeg,image/png,image/webp',
      style: 'display:none',
      onchange: function () { uploadFiles(fileInput.files); fileInput.value = ''; },
    });

    var dropzone = h(
      'div.dropzone',
      {
        role: 'button',
        tabindex: '0',
        onclick: function () { fileInput.click(); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } },
        ondragover: function (e) { e.preventDefault(); dropzone.classList.add('is-over'); },
        ondragleave: function () { dropzone.classList.remove('is-over'); },
        ondrop: function (e) {
          e.preventDefault();
          dropzone.classList.remove('is-over');
          uploadFiles(e.dataTransfer.files);
        },
      },
      h('strong', { text: 'Drop images here, or click to choose' }),
      h('span', { text: 'JPG, PNG or WEBP. The first image becomes the main photo.' }),
    );

    function uploadFiles(files) {
      if (!files || !files.length) return;
      var form = new FormData();
      for (var i = 0; i < files.length; i++) form.append('images', files[i]);

      dropzone.classList.add('is-over');
      fetch('/api/admin/products/' + productId + '/images', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': api.csrf() },
        body: form,
      })
        .then(function (res) { return res.json().then(function (b) { return { ok: res.ok, body: b }; }); })
        .then(function (out) {
          dropzone.classList.remove('is-over');
          if (!out.ok) throw new Error((out.body.error && out.body.error.message) || 'Upload failed.');
          ui.toast('Uploaded', 'ok');
          return load();
        })
        .catch(function (err) {
          dropzone.classList.remove('is-over');
          ui.toast(err.message, 'error');
        });
    }

    function load() {
      return api.get('/api/admin/products/' + productId + '/images').then(function (res) { draw(res.data); });
    }

    function persistOrder() {
      var ids = Array.prototype.map.call(grid.children, function (el) { return el.dataset.id; });
      api
        .post('/api/admin/products/' + productId + '/images/reorder', { ids: ids })
        .then(function () { ui.toast('Order saved', 'ok'); })
        .catch(function (err) { ui.toast(err.message, 'error'); });
    }

    function draw(images) {
      ui.clear(grid);

      if (!images.length) {
        grid.appendChild(h('p.muted', { text: 'No images yet.' }));
        return;
      }

      images.forEach(function (img) {
        var altInput = h('input', {
          type: 'text',
          value: img.altText || '',
          placeholder: 'Alt text',
          'aria-label': 'Alt text',
          onchange: function (e) {
            api
              .patch('/api/admin/products/' + productId + '/images/' + img.id, { altText: e.target.value })
              .catch(function (err) { ui.toast(err.message, 'error'); });
          },
        });

        var typeSelect = h(
          'select',
          {
            'aria-label': 'Image type',
            onchange: function (e) {
              api
                .patch('/api/admin/products/' + productId + '/images/' + img.id, { type: e.target.value })
                .catch(function (err) { ui.toast(err.message, 'error'); });
            },
          },
          ['MAIN', 'GALLERY', 'DETAIL', 'CONSTRUCTION', 'LIFESTYLE', 'PACKAGING'].map(function (t) {
            return h('option', { value: t, selected: img.type === t }, t.charAt(0) + t.slice(1).toLowerCase());
          }),
        );

        var tile = h(
          'div.shot',
          {
            draggable: 'true',
            dataset: { id: img.id },
            ondragstart: function () { dragging = tile; tile.classList.add('is-dragging'); },
            ondragend: function () {
              tile.classList.remove('is-dragging');
              grid.querySelectorAll('.is-over').forEach(function (el) { el.classList.remove('is-over'); });
              dragging = null;
              persistOrder();
            },
            ondragover: function (e) { e.preventDefault(); if (dragging && dragging !== tile) tile.classList.add('is-over'); },
            ondragleave: function () { tile.classList.remove('is-over'); },
            ondrop: function (e) {
              e.preventDefault();
              tile.classList.remove('is-over');
              if (!dragging || dragging === tile) return;
              var tiles = Array.prototype.slice.call(grid.children);
              var before = tiles.indexOf(dragging) < tiles.indexOf(tile);
              grid.insertBefore(dragging, before ? tile.nextSibling : tile);
            },
          },
          img.isPrimary ? h('span.shot__flag', { text: 'Main' }) : null,
          h('img', { src: img.url, alt: img.altText || '', loading: 'lazy' }),
          h(
            'div.shot__bar',
            typeSelect,
            h(
              'button.btn.btn--sm',
              {
                type: 'button',
                title: 'Make this the main photo',
                disabled: img.isPrimary,
                onclick: function () {
                  api
                    .patch('/api/admin/products/' + productId + '/images/' + img.id, { isPrimary: true })
                    .then(load)
                    .catch(function (err) { ui.toast(err.message, 'error'); });
                },
              },
              '★',
            ),
            h(
              'button.btn.btn--sm.btn--danger',
              {
                type: 'button',
                'aria-label': 'Delete image',
                onclick: function () {
                  ui.confirmDelete('This image', 'It will be removed permanently.').then(function (ok) {
                    if (!ok) return;
                    api
                      .del('/api/admin/products/' + productId + '/images/' + img.id)
                      .then(function () { ui.toast('Image deleted', 'ok'); return load(); })
                      .catch(function (err) { ui.toast(err.message, 'error'); });
                  });
                },
              },
              '✕',
            ),
          ),
          h('div.shot__alt', altInput),
        );

        grid.appendChild(tile);
      });
    }

    wrap.appendChild(dropzone);
    wrap.appendChild(fileInput);
    wrap.appendChild(h('div', { style: 'margin-top:14px' }, grid));

    return { el: wrap, load: load };
  }

  /* ------------------------------------------------------------ form ---- */

  function buildForm(mount, ctx, product, categories) {
    var isNew = !product;
    var current = 0;

    var controls = {};
    var panels = [];
    var errorSlot = h('div');

    function panel() {
      var p = h('div', { hidden: true });
      panels.push(p);
      return p;
    }

    /* --- 1 basic --- */
    var basic = panel();
    controls.productName = input('productName', { required: true, placeholder: 'WIN WEARS Pro Match X1' });
    controls.sku = input('sku', { required: true, placeholder: 'WW-HYB-100' });
    controls.slug = input('slug', { placeholder: 'left blank, generated from the name' });
    controls.categoryId = h(
      'select',
      { name: 'categoryId', id: 'f-categoryId', required: true },
      h('option', { value: '' }, 'Choose a category…'),
      categories.map(function (c) { return h('option', { value: c.id }, c.name); }),
    );
    controls.shortDescription = textarea('shortDescription', { rows: 2, maxlength: '400' });
    controls.fullDescription = textarea('fullDescription', { rows: 8 });

    basic.appendChild(h('div.row',
      field('Product name', controls.productName, null, true),
      field('SKU', controls.sku, 'Must be unique.', true)));
    basic.appendChild(h('div.row',
      field('Category', controls.categoryId, null, true),
      field('URL slug', controls.slug, 'Leave empty and we will build one from the name.')));
    basic.appendChild(field('Short description', controls.shortDescription, 'One line, shown on product cards.'));
    basic.appendChild(field('Full description', controls.fullDescription));

    /* --- 2 technical --- */
    var technical = panel();
    var TECH = [
      ['construction', 'Construction', 'Hybrid, Hand stitched, Thermal bonded…'],
      ['material', 'Material', 'Premium PU, TPU…'],
      ['usage', 'Usage', 'Match, Training, Promotional'],
      ['size', 'Size', '3, 4, 5'],
      ['weight', 'Weight', 'e.g. 410–450 g'],
      ['bladder', 'Bladder', 'Butyl, Latex…'],
      ['panelCount', 'Panel count', 'e.g. 32'],
      ['surface', 'Surface', 'Textured, Smooth…'],
      ['stitching', 'Stitching', 'Hand stitched, Machine stitched…'],
      ['technology', 'Technology', 'Anything you want listed'],
    ];
    var techRow = h('div.row');
    TECH.forEach(function (t) {
      controls[t[0]] = input(t[0], { placeholder: t[2] });
      techRow.appendChild(field(t[1], controls[t[0]]));
    });
    technical.appendChild(
      ui.notice('info', 'These are your values and stay editable. Nothing is filled in for you.'),
    );
    technical.appendChild(techRow);

    var customization = checkbox('customizationAvailable', 'Customisation available for this ball', true);
    controls.customizationAvailable = customization.input;
    controls.customizationNotes = textarea('customizationNotes', { rows: 3 });
    technical.appendChild(customization.el);
    technical.appendChild(field('Customisation notes', controls.customizationNotes));

    /* --- 3 features --- */
    var featuresPanel = panel();
    var featureRepeater = repeater({
      rowLabel: 'Feature',
      addLabel: '+ Add feature',
      emptyText: 'No features yet. Add as many as you like.',
      fields: [
        { key: 'title', label: 'Title', placeholder: 'Premium PU outer' },
        { key: 'description', label: 'Description (optional)', placeholder: '', textarea: true },
        { key: 'icon', label: 'Icon name (optional)', placeholder: 'shield' },
      ],
    });
    featuresPanel.appendChild(h('p.muted', { text: 'Shown as the feature list on the product page. Drag with the arrows to reorder.' }));
    featuresPanel.appendChild(featureRepeater.el);

    /* --- 4 specifications --- */
    var specsPanel = panel();
    var specRepeater = repeater({
      rowLabel: 'Specification',
      addLabel: '+ Add specification',
      emptyText: 'No specifications yet.',
      fields: [
        { key: 'label', label: 'Label', placeholder: 'Construction' },
        { key: 'value', label: 'Value', placeholder: 'Hybrid' },
      ],
    });
    specsPanel.appendChild(h('p.muted', { text: 'These become the spec table on the product page.' }));
    specsPanel.appendChild(specRepeater.el);

    /* --- 5 images --- */
    var imagesPanel = panel();
    var galleryApi = null;
    if (isNew) {
      imagesPanel.appendChild(
        ui.notice('info', 'Save the product first, then images can be uploaded here.'),
      );
    } else {
      galleryApi = gallery(product.id);
      imagesPanel.appendChild(galleryApi.el);
    }

    /* --- 6 commercial --- */
    var commercial = panel();
    var quoteOnly = checkbox('quoteOnly', 'Quote only — do not show a price on the website', true);
    controls.quoteOnly = quoteOnly.input;
    controls.price = input('price', { type: 'number', step: '0.01', min: '0' });
    controls.currency = input('currency', { maxlength: '3', placeholder: 'USD' });
    controls.priceLabel = input('priceLabel', { placeholder: 'Price on request' });
    controls.moq = input('moq', { type: 'number', min: '1', placeholder: '100' });

    commercial.appendChild(quoteOnly.el);
    commercial.appendChild(h('div.row',
      field('Price', controls.price, 'Ignored while quote only is ticked.'),
      field('Currency', controls.currency),
      field('Minimum order quantity', controls.moq)));
    commercial.appendChild(field('Price label', controls.priceLabel, 'Text shown instead of a number.'));

    /* --- 7 seo --- */
    var seo = panel();
    controls.metaTitle = input('metaTitle', { maxlength: '200' });
    controls.metaDescription = textarea('metaDescription', { rows: 3, maxlength: '400' });
    controls.keywords = input('keywords', { placeholder: 'football, match ball, hybrid' });
    controls.ogImage = input('ogImage', { placeholder: 'Leave blank to use the main photo' });

    seo.appendChild(ui.notice('info', 'Leave these empty and the product name, description and main photo are used.'));
    seo.appendChild(field('Meta title', controls.metaTitle));
    seo.appendChild(field('Meta description', controls.metaDescription));
    seo.appendChild(h('div.row', field('Keywords', controls.keywords), field('Open Graph image URL', controls.ogImage)));

    /* --- 8 publish --- */
    var publish = panel();
    controls.status = h(
      'select',
      { name: 'status', id: 'f-status' },
      h('option', { value: 'DRAFT' }, 'Draft — not visible on the website'),
      h('option', { value: 'PUBLISHED' }, 'Published — live on the website'),
      h('option', { value: 'ARCHIVED' }, 'Archived — hidden and out of the way'),
    );
    var featured = checkbox('featured', 'Show on the homepage as a featured product', false);
    controls.featured = featured.input;
    controls.displayOrder = input('displayOrder', { type: 'number', min: '0', value: '0' });

    publish.appendChild(field('Status', controls.status));
    publish.appendChild(featured.el);
    publish.appendChild(field('Display order', controls.displayOrder, 'Lower numbers appear first.'));

    /* --- steps --- */
    var stepBar = h('div.steps');
    var stepButtons = STEPS.map(function (label, i) {
      var btn = h(
        'button.step',
        { type: 'button', onclick: function () { show(i); } },
        h('span.step__n', { text: String(i + 1) }),
        h('span', { text: label }),
      );
      stepBar.appendChild(btn);
      return btn;
    });

    function show(index) {
      current = Math.max(0, Math.min(panels.length - 1, index));
      panels.forEach(function (p, i) { p.hidden = i !== current; });
      stepButtons.forEach(function (b, i) {
        if (i === current) b.setAttribute('aria-current', 'step');
        else b.removeAttribute('aria-current');
        b.classList.toggle('step--done', i < current);
      });
      prevBtn.disabled = current === 0;
      nextBtn.disabled = current === panels.length - 1;
      if (index === 4 && galleryApi) galleryApi.load();
    }

    var prevBtn = h('button.btn', { type: 'button', onclick: function () { show(current - 1); } }, 'Back');
    var nextBtn = h('button.btn', { type: 'button', onclick: function () { show(current + 1); } }, 'Next');

    var saveDraft = h('button.btn.btn--primary', { type: 'button', onclick: function () { save('DRAFT'); } }, 'Save draft');
    var savePublish = h('button.btn.btn--accent', { type: 'button', onclick: function () { save('PUBLISHED'); } }, 'Save & publish');
    var saveOnly = h('button.btn.btn--primary', { type: 'button', onclick: function () { save(null); } }, 'Save changes');

    var form = h('form', { novalidate: true, onsubmit: function (e) { e.preventDefault(); save(null); } },
      errorSlot, panels);

    /* --- read / write --- */

    function fill(p) {
      controls.productName.value = p.productName || '';
      controls.sku.value = p.sku || '';
      controls.slug.value = p.slug || '';
      controls.categoryId.value = p.categoryId || (p.category && p.category.id) || '';
      controls.shortDescription.value = p.shortDescription || '';
      controls.fullDescription.value = p.fullDescription || '';

      var d = p.details || {};
      TECH.forEach(function (t) { controls[t[0]].value = d[t[0]] || ''; });
      controls.customizationAvailable.checked = d.customizationAvailable !== false;
      controls.customizationNotes.value = d.customizationNotes || '';

      var c = p.commercial || {};
      controls.quoteOnly.checked = c.quoteOnly !== false;
      controls.price.value = p.rawPrice != null ? p.rawPrice : '';
      controls.currency.value = c.currency || 'USD';
      controls.priceLabel.value = c.priceLabel || '';
      controls.moq.value = c.moq != null ? c.moq : '';

      controls.metaTitle.value = p.metaTitle || '';
      controls.metaDescription.value = p.metaDescription || '';
      controls.keywords.value = (p.seo && p.seo.keywords) || '';
      controls.ogImage.value = (p.seo && p.seo.ogImage) || '';

      controls.status.value = p.status || 'DRAFT';
      controls.featured.checked = !!p.featured;
      controls.displayOrder.value = p.displayOrder != null ? p.displayOrder : 0;

      featureRepeater.set(p.features || []);
      specRepeater.set(p.specifications || []);
    }

    function read(forceStatus) {
      var body = {
        productName: controls.productName.value.trim(),
        sku: controls.sku.value.trim(),
        categoryId: controls.categoryId.value,
        shortDescription: controls.shortDescription.value.trim(),
        fullDescription: controls.fullDescription.value.trim(),
        customizationAvailable: controls.customizationAvailable.checked,
        customizationNotes: controls.customizationNotes.value.trim(),
        quoteOnly: controls.quoteOnly.checked,
        currency: (controls.currency.value.trim() || 'USD').toUpperCase(),
        priceLabel: controls.priceLabel.value.trim(),
        metaTitle: controls.metaTitle.value.trim(),
        metaDescription: controls.metaDescription.value.trim(),
        keywords: controls.keywords.value.trim(),
        ogImage: controls.ogImage.value.trim(),
        status: forceStatus || controls.status.value,
        featured: controls.featured.checked,
        displayOrder: Number(controls.displayOrder.value) || 0,
        features: featureRepeater.read(),
        specifications: specRepeater.read(),
      };

      var slug = controls.slug.value.trim();
      if (slug) body.slug = slug;

      TECH.forEach(function (t) { body[t[0]] = controls[t[0]].value.trim(); });

      /* Empty numbers must be absent, not "" — the schema coerces, and an
         empty string would coerce to 0. */
      if (controls.price.value !== '') body.price = Number(controls.price.value);
      if (controls.moq.value !== '') body.moq = Number(controls.moq.value);

      return body;
    }

    var busy = false;

    function save(forceStatus) {
      if (busy) return;
      ui.clear(errorSlot);

      var body = read(forceStatus);

      if (!body.productName) return fail('Product name is required.', 0);
      if (!body.sku) return fail('SKU is required.', 0);
      if (!body.categoryId) return fail('Choose a category.', 0);

      busy = true;
      [saveDraft, savePublish, saveOnly].forEach(function (b) { b.disabled = true; });

      var request = isNew
        ? api.post('/api/admin/products', body)
        : api.put('/api/admin/products/' + product.id, body);

      request
        .then(function (res) {
          ui.toast(isNew ? 'Product created' : 'Changes saved', 'ok');
          if (isNew) {
            /* Straight to edit, where images can be uploaded. */
            Admin.go('/products/' + res.data.id + '/edit');
          } else {
            product = res.data;
            fill(product);
            Admin.refreshCounts();
          }
        })
        .catch(function (err) {
          var unmatched = ui.applyFieldErrors(form, err.issues);
          errorSlot.appendChild(ui.notice('error', err.message, unmatched));
          errorSlot.scrollIntoView({ block: 'nearest' });
        })
        .finally(function () {
          busy = false;
          [saveDraft, savePublish, saveOnly].forEach(function (b) { b.disabled = false; });
        });
    }

    function fail(message, stepIndex) {
      errorSlot.appendChild(ui.notice('error', message));
      if (stepIndex != null) show(stepIndex);
      errorSlot.scrollIntoView({ block: 'nearest' });
    }

    /* --- assemble --- */

    if (product) fill(product);

    ctx.actions.appendChild(h('a.btn', { href: '#/products' }, 'Back to products'));
    if (!isNew && product.status === 'PUBLISHED') {
      ctx.actions.appendChild(
        h('a.btn', { href: '/product.html?slug=' + encodeURIComponent(product.slug), target: '_blank', rel: 'noopener' }, 'View on site'),
      );
    }

    var card = h(
      'section.card',
      stepBar,
      h('div.card__body', form),
      h(
        'div.card__foot',
        prevBtn,
        nextBtn,
        h('div.toolbar__spacer'),
        isNew ? saveDraft : saveOnly,
        isNew ? savePublish : null,
      ),
    );

    ui.clear(mount).appendChild(card);
    show(0);
  }

  /* ----------------------------------------------------------- routes --- */

  Admin.route('/products/new', {
    title: 'Add product',
    subtitle: 'Create a new football',
    render: function (mount, _params, ctx) {
      return api.get('/api/admin/categories').then(function (res) {
        if (!res.data.length) {
          ui.clear(mount).appendChild(
            ui.empty(
              'Add a category first',
              'Every product belongs to a category.',
              h('a.btn.btn--accent', { href: '#/categories' }, 'Manage categories'),
            ),
          );
          return;
        }
        buildForm(mount, ctx, null, res.data);
      });
    },
  });

  Admin.route('/products/:id/edit', {
    title: 'Edit product',
    subtitle: '',
    render: function (mount, params, ctx) {
      return Promise.all([
        api.get('/api/admin/products/' + params.id),
        api.get('/api/admin/categories'),
      ]).then(function (results) {
        var product = results[0].data;
        ctx.setSubtitle(product.productName + ' · ' + product.sku);
        buildForm(mount, ctx, product, results[1].data);
      });
    },
  });
})();
