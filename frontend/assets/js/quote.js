/* ==========================================================================
   WIN WEARS — Request a quote
   Client-side validation, dependent category/model selects, file attachment UI
   and a prepared enquiry.

   >>> BACKEND INTEGRATION POINT <<<
   Everything server-side lives in submitToBackend() at the bottom of this file.
   Point ENDPOINT at your own handler and it will POST multipart/form-data with
   all fields plus the uploaded files. Until then the form prepares the enquiry
   and hands it to WhatsApp / email so no lead is lost.

   Client-side checks here are for user experience only. Whatever endpoint you
   connect MUST validate and sanitise every field again on the server.
   ========================================================================== */
(function () {
  'use strict';

  /* The RFQ is stored in the database and appears in /admin/quotes. If the
     request fails the WhatsApp / email handoff below still runs, so a lead is
     never lost to a server hiccup. */
  var ENDPOINT = '/api/quotes';

  var doc = document;
  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }

  var form = $('#rfq-form');
  if (!form) return;

  var files = { logo: [], design: [] };

  /* ------------------------------------------------- dependent selects --- */
  function fillCategories() {
    var cat = $('#q-category');
    WW.CATEGORIES.forEach(function (c) {
      var o = doc.createElement('option');
      o.value = c.name; o.textContent = c.name; o.setAttribute('data-key', c.key);
      cat.appendChild(o);
    });
    cat.addEventListener('change', fillModels);
  }

  function fillModels() {
    var cat = $('#q-category');
    var ball = $('#q-ball');
    var key = cat.selectedOptions[0] ? cat.selectedOptions[0].getAttribute('data-key') : '';
    ball.innerHTML = '<option value="">Any model in the range</option>';
    if (!key) return Promise.resolve();

    ball.disabled = true;
    /* A generous page size: this is a picker, not a browsing grid, and the
       range is expected to be tens rather than thousands. */
    return WW.loadProducts({ category: key, perPage: 100, sort: 'name' })
      .then(function (res) {
        res.items.forEach(function (p) {
          var o = doc.createElement('option');
          o.value = p.productName + ' (' + p.sku + ')';
          o.textContent = p.shortDescription ? p.productName + ' — ' + p.shortDescription : p.productName;
          o.setAttribute('data-slug', p.slug);
          ball.appendChild(o);
        });
      })
      .catch(function () { /* Leave "any model" selected; the form still sends. */ })
      .then(function () { ball.disabled = false; });
  }

  /* Deep links: ?product=<slug>, ?category=<slug>, ?custom=1 */
  function applyDeepLink() {
    var params = new URLSearchParams(location.search);
    var productSlug = params.get('product');
    var categoryKey = params.get('category');

    var lookup = productSlug
      ? WW.loadProduct(productSlug).then(
          function (res) { return res.product; },
          function () { return null; }
        )
      : Promise.resolve(null);

    lookup.then(function (product) {
      if (product && product.category) categoryKey = product.category.slug;

      var filled = Promise.resolve();
      if (categoryKey) {
        var c = WW.catBy(categoryKey);
        if (c) {
          $('#q-category').value = c.name;
          filled = fillModels() || Promise.resolve();
        }
      }

      /* Select the model only once its options exist. */
      return filled.then(function () {
        if (!product) return;
        var opt = $('#q-ball option[data-slug="' + product.slug.replace(/"/g, '') + '"]');
        if (opt) $('#q-ball').value = opt.value;
      });
    });

    /* Specification carried over from the customiser */
    var spec = '';
    try { spec = sessionStorage.getItem('ww-custom-spec') || ''; } catch (e) { spec = ''; }
    if (params.get('custom') === '1' && spec) {
      var msg = $('#q-message');
      msg.value = 'My customisation:\n' + spec + '\n\n' + (msg.value || '');
      $('#q-custom').value = 'Full custom panel artwork';
    }
  }

  /* ------------------------------------------------------------ uploads -- */
  function initUploads() {
    $$('[data-upload]', form).forEach(function (zone) {
      var kind = zone.getAttribute('data-upload');
      var input = $('[data-upload-input]', zone);
      var list = $('[data-upload-list]', zone);

      function paint() {
        list.innerHTML = files[kind].map(function (f, i) {
          return '<span class="upload__file"><span>' + escapeHTML(f.name) + ' · ' + kb(f.size) + '</span>'
            + '<button type="button" data-rm="' + i + '">Remove</button></span>';
        }).join('');
        $$('[data-rm]', list).forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            files[kind].splice(+btn.getAttribute('data-rm'), 1);
            paint();
          });
        });
      }

      function add(fileList) {
        Array.prototype.slice.call(fileList).forEach(function (f) {
          if (f.size > 15 * 1024 * 1024) {
            status('error', 'File too large', f.name + ' is over 15 MB. Please send it by email instead.');
            return;
          }
          files[kind].push(f);
        });
        paint();
      }

      input.addEventListener('change', function () { add(input.files); input.value = ''; });
      ['dragenter', 'dragover'].forEach(function (ev) {
        zone.addEventListener(ev, function (e) { e.preventDefault(); zone.setAttribute('data-drag', 'true'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        zone.addEventListener(ev, function (e) { e.preventDefault(); zone.setAttribute('data-drag', 'false'); });
      });
      zone.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files) add(e.dataTransfer.files);
      });
    });
  }

  function kb(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function escapeHTML(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* --------------------------------------------------------- validation -- */
  function fieldOf(el) { return el.closest('.field'); }

  function validate(el) {
    var ok = true;
    var val = (el.value || '').trim();

    if (el.hasAttribute('required') && !val) ok = false;
    if (ok && el.type === 'email' && val) ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val);
    if (ok && el.id === 'q-quantity' && val) ok = parseInt(val, 10) >= 1;

    var f = fieldOf(el);
    if (f) f.setAttribute('data-invalid', ok ? 'false' : 'true');
    el.setAttribute('aria-invalid', ok ? 'false' : 'true');
    return ok;
  }

  function validateAll() {
    var fields = $$('[required]', form);
    var firstBad = null;
    var ok = true;
    fields.forEach(function (el) {
      if (!validate(el)) { ok = false; if (!firstBad) firstBad = el; }
    });
    if (firstBad) { firstBad.focus(); firstBad.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    return ok;
  }

  $$('input, select, textarea', form).forEach(function (el) {
    el.addEventListener('blur', function () { if (el.hasAttribute('required') || el.value) validate(el); });
    el.addEventListener('input', function () {
      var f = fieldOf(el);
      if (f && f.getAttribute('data-invalid') === 'true') validate(el);
    });
  });

  /* ------------------------------------------------------------- status -- */
  function status(kind, title, text) {
    var box = $('#rfq-status');
    box.setAttribute('data-kind', kind);
    box.setAttribute('data-show', 'true');
    box.innerHTML = '<div><strong>' + escapeHTML(title) + '</strong>' + escapeHTML(text) + '</div>';
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /* -------------------------------------------------------- the message -- */
  function collect() {
    var d = {};
    ['name', 'company', 'country', 'email', 'whatsapp', 'category', 'ball', 'quantity', 'size', 'custom', 'message']
      .forEach(function (k) {
        var el = form.elements[k];
        d[k] = el ? (el.value || '').trim() : '';
      });
    return d;
  }

  function summaryText(d) {
    var lines = [
      'Hello WIN WEARS, I would like to request a quotation.',
      '',
      'Name: ' + d.name,
      d.company ? 'Company: ' + d.company : '',
      'Country: ' + d.country,
      'Email: ' + d.email,
      d.whatsapp ? 'WhatsApp: ' + d.whatsapp : '',
      '',
      'Category: ' + d.category,
      d.ball ? 'Model: ' + d.ball : 'Model: any in the range',
      'Quantity: ' + d.quantity,
      d.size ? 'Size: ' + d.size : '',
      d.custom ? 'Customization: ' + d.custom : '',
      d.message ? '' : '',
      d.message ? 'Notes: ' + d.message : ''
    ];
    var attached = files.logo.concat(files.design).map(function (f) { return f.name; });
    if (attached.length) lines.push('', 'Files to send: ' + attached.join(', '));
    return lines.filter(function (l) { return l !== ''; }).join('\n');
  }

  /* --------------------------------------------------------- submission -- */
  function submitToBackend(d) {
    /* Field names match the server's Zod schema. Everything is validated
       again there — these client-side checks are for the user's benefit. */
    var fd = new FormData();
    fd.append('name', d.name || '');
    fd.append('company', d.company || '');
    fd.append('country', d.country || '');
    fd.append('email', d.email || '');
    fd.append('whatsapp', d.whatsapp || '');
    fd.append('category', d.category || '');
    fd.append('size', d.size || '');
    fd.append('customizationRequired', d.custom ? 'true' : 'false');

    if (d.quantity) fd.append('quantity', String(d.quantity).replace(/[^\d]/g, ''));

    var selected = $('#q-ball').selectedOptions[0];
    var productSlug = selected ? selected.getAttribute('data-slug') : '';
    if (productSlug) fd.append('productId', productSlug);

    var notes = [d.custom ? 'Customisation: ' + d.custom : '', d.ball ? 'Model: ' + d.ball : '', d.message || '']
      .filter(Boolean)
      .join('\n');
    fd.append('message', notes);

    /* One file each — the model has a logo slot and a design slot. */
    if (files.logo[0]) fd.append('logoFile', files.logo[0], files.logo[0].name);
    if (files.design[0]) fd.append('designFile', files.design[0], files.design[0].name);

    return WW.submitQuote(fd);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validateAll()) {
      status('error', 'Some details are missing', 'Please complete the highlighted fields and try again.');
      return;
    }

    var d = collect();
    var text = summaryText(d);
    var btn = $('button[type="submit"]', form);

    if (ENDPOINT) {
      btn.setAttribute('aria-disabled', 'true');
      submitToBackend(d)
        .then(function () {
          status('ok', 'Request sent.', 'Thank you — we have your enquiry and will come back to you shortly.');
          form.reset();
          files.logo = []; files.design = [];
          $$('[data-upload-list]', form).forEach(function (l) { l.innerHTML = ''; });
        })
        .catch(function () {
          status('error', 'That did not send.', 'Please try again, or send the same details on WhatsApp — the button below has them ready.');
          prepHandoff(text);
        })
        .then(function () { btn.removeAttribute('aria-disabled'); });
      return;
    }

    /* Frontend-only mode: hand the completed enquiry over cleanly. */
    prepHandoff(text);
    var note = files.logo.length + files.design.length
      ? ' Attach your ' + (files.logo.length + files.design.length) + ' file(s) in the chat or by email — browsers cannot attach them automatically.'
      : '';
    status('ok', 'Your enquiry is ready.',
      'We have prepared it below — send it on WhatsApp or by email and we will pick it up.' + note);
  });

  function prepHandoff(text) {
    var wa = $('#rfq-wa');
    if (wa) {
      wa.setAttribute('data-wa', text);
      if (WW.wireWhatsApp) WW.wireWhatsApp(wa.parentNode);
      wa.textContent = 'Send on WhatsApp';
      wa.classList.add('btn--lg');
    }
    var box = $('#rfq-status');
    if (box) {
      var mail = 'mailto:' + WW.CONTACT.email
        + '?subject=' + encodeURIComponent('Football quotation request — WIN WEARS')
        + '&body=' + encodeURIComponent(text);
      box.insertAdjacentHTML('beforeend',
        '<a class="link" style="margin-left:auto;white-space:nowrap" href="' + mail + '">Send by email</a>');
    }
  }

  /* ---------------------------------------------------------------- init - */
  function init() {
    fillCategories();
    initUploads();
    applyDeepLink();
  }

  /* Categories come from the API, so the selects cannot be built until the
     first payload lands. Uploads work regardless. */
  WW.ready.then(init).catch(function () {
    initUploads();
    status('error', 'We could not load the ranges.',
      'You can still send the form, or message us on WhatsApp and we will pick it up.');
  });
})();
