/* ==========================================================================
   Admin — Quotations
   The list, the builder, and a document the browser can print to PDF.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  var STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'];

  /* Shared with orders, which is the same document later in its life. */
  var label = Admin.doc.label;
  var money = Admin.doc.money;
  var previewTotals = Admin.doc.previewTotals;

  /* ----------------------------------------------------------- the list -- */

  Admin.route('/quotations', {
    title: 'Quotations',
    subtitle: 'Priced documents sent to customers',
    render: function (mount) {
      var state = { q: '', status: '', page: 1, perPage: 25 };
      var card = h('section.card');
      var toolbar = h('div.toolbar');
      var slot = h('div');

      toolbar.appendChild(h('input', {
        type: 'search', placeholder: 'Number, customer, line…', 'aria-label': 'Search quotations',
        oninput: ui.debounce(function (e) { state.q = e.target.value.trim(); state.page = 1; load(); }, 300),
      }));
      toolbar.appendChild(h('select', {
        'aria-label': 'Filter by status',
        onchange: function (e) { state.status = e.target.value; state.page = 1; load(); },
      }, h('option', { value: '' }, 'All statuses'),
        STATUSES.map(function (s) { return h('option', { value: s }, label(s)); })));
      toolbar.appendChild(h('a.btn.btn--accent', { href: '#/quotations/new' }, 'New quotation'));

      card.appendChild(toolbar);
      card.appendChild(slot);
      ui.clear(mount).appendChild(card);

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(4));
        return api.get('/api/admin/quotations' + api.qs(state))
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty('No quotations yet',
                'A quotation is the priced document you send a customer. Build one from a quote request, or start a blank one.',
                h('a.btn.btn--accent', { href: '#/quotations/new' }, 'New quotation')));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', 'Number'), h('th', 'Customer'), h('th', 'Lines'),
              h('th', 'Total'), h('th', 'Status'), h('th', 'Valid until'), h('th', 'Raised'))));
            var body = h('tbody');
            res.data.forEach(function (q) {
              var tr = h('tr');
              tr.appendChild(h('td', h('a', { href: '#/quotations/' + q.id }, q.number)));
              tr.appendChild(h('td', q.company ? q.company.name : (q.contact ? q.contact.name : '—')));
              tr.appendChild(h('td', String(q.items.length)));
              tr.appendChild(h('td', money(q.total, q.currency)));
              tr.appendChild(h('td', ui.statusPill(q.status)));
              tr.appendChild(h('td', q.validUntil ? ui.date(q.validUntil) : '—'));
              tr.appendChild(h('td', ui.date(q.createdAt)));
              body.appendChild(tr);
            });
            table.appendChild(body);
            slot.appendChild(table);
          })
          .catch(function (err) { ui.clear(slot).appendChild(ui.errorState(err, load)); });
      }

      return load();
    },
  });

  /* -------------------------------------------------------- the builder -- */

  function builder(mount, existing) {
    var isNew = !existing;
    var lines = existing && existing.items.length
      ? existing.items.map(function (i) {
          return { description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, productId: i.productId };
        })
      : [{ description: '', quantity: 1, unitPrice: '' }];

    var companies = [];
    var products = [];

    var form = h('section.card');
    form.appendChild(h('h2.card__title', isNew ? 'New quotation' : 'Edit ' + existing.number));
    form.appendChild(h('p.card__hint',
      'Every price here is yours to enter. Nothing is filled in from the catalogue or carried over from another quotation.'));

    var companySelect = h('select', {}, h('option', { value: '' }, 'No customer selected'));
    var currency = h('input', { type: 'text', maxLength: 3, value: (existing && existing.currency) || 'USD', style: 'width:6rem' });
    var discountType = h('select', {},
      h('option', { value: 'NONE', selected: !existing || existing.discountType === 'NONE' }, 'No discount'),
      h('option', { value: 'PERCENT', selected: existing && existing.discountType === 'PERCENT' }, 'Percentage'),
      h('option', { value: 'AMOUNT', selected: existing && existing.discountType === 'AMOUNT' }, 'Fixed amount'));
    var discountInput = h('input', { type: 'number', min: 0, step: '0.01', value: existing ? String(existing.discountInput) : '0' });
    var shipping = h('input', { type: 'number', min: 0, step: '0.01', value: existing ? String(existing.shipping) : '0' });
    var taxRate = h('input', { type: 'number', min: 0, max: 100, step: '0.01', value: existing ? String(existing.taxRate) : '0' });
    var paymentTerms = h('input', { type: 'text', value: (existing && existing.paymentTerms) || '' });
    var packaging = h('input', { type: 'text', value: (existing && existing.packaging) || '' });
    var leadTime = h('input', { type: 'text', value: (existing && existing.leadTime) || '' });
    var validUntil = h('input', { type: 'date', value: existing && existing.validUntil ? new Date(existing.validUntil).toISOString().slice(0, 10) : '' });
    var notes = h('textarea', { rows: 3, value: (existing && existing.notes) || '' });
    var internalNotes = h('textarea', { rows: 2, value: (existing && existing.internalNotes) || '' });

    var linesWrap = h('div.lines');
    var totalsBox = h('div.totals');

    function refreshTotals() {
      var t = previewTotals(lines, discountType.value, discountInput.value, shipping.value, taxRate.value);
      var cur = currency.value || 'USD';
      ui.clear(totalsBox);
      [['Subtotal', t.subtotal], ['Discount', -t.discount], ['Shipping', t.shipping], ['Tax', t.tax]]
        .forEach(function (row) {
          if (row[0] !== 'Subtotal' && !row[1]) return;
          totalsBox.appendChild(h('div.totals__row',
            h('span', row[0]), h('span', money(row[1], cur))));
        });
      totalsBox.appendChild(h('div.totals__row.totals__row--grand',
        h('span', 'Total'), h('span', money(t.total, cur))));
    }

    function drawLines() {
      ui.clear(linesWrap);
      lines.forEach(function (line, index) {
        var row = h('div.line');

        var desc = h('input', { type: 'text', value: line.description, placeholder: 'What is being quoted' });
        desc.addEventListener('input', function () { line.description = desc.value; });

        var picker = h('select', { 'aria-label': 'Use a catalogue product' }, h('option', { value: '' }, 'Free text…'));
        products.forEach(function (p) {
          picker.appendChild(h('option', { value: p.id, selected: line.productId === p.id }, p.productName));
        });
        picker.addEventListener('change', function () {
          var chosen = products.filter(function (p) { return p.id === picker.value; })[0];
          line.productId = picker.value || null;
          /* The name is copied in as a starting description. The price is
             not: the catalogue is quote-only, and putting a number here that
             nobody typed is exactly what §13 forbids. */
          if (chosen && !desc.value.trim()) { desc.value = chosen.productName; line.description = chosen.productName; }
        });

        var qty = h('input', { type: 'number', min: 1, step: 1, value: String(line.quantity), 'aria-label': 'Quantity' });
        qty.addEventListener('input', function () { line.quantity = qty.value; refreshTotals(); });

        var price = h('input', { type: 'number', min: 0, step: '0.01', value: String(line.unitPrice), placeholder: '0.00', 'aria-label': 'Unit price' });
        price.addEventListener('input', function () { line.unitPrice = price.value; refreshTotals(); });

        var remove = h('button.btn.btn--sm.btn--danger', {
          type: 'button', 'aria-label': 'Remove this line',
          onclick: function () {
            if (lines.length === 1) { ui.toast('A quotation needs at least one line.', 'error'); return; }
            lines.splice(index, 1); drawLines(); refreshTotals();
          },
        }, '×');

        row.appendChild(h('div.line__desc', desc, picker));
        row.appendChild(qty);
        row.appendChild(price);
        row.appendChild(remove);
        linesWrap.appendChild(row);
      });
    }

    form.appendChild(h('div.field', h('label.field__label', { text: 'Customer' }), companySelect));

    form.appendChild(h('h3.card__subtitle', 'Lines'));
    form.appendChild(h('div.line.line--head',
      h('div.line__desc', h('span.muted.tiny', 'Description')),
      h('span.muted.tiny', 'Qty'), h('span.muted.tiny', 'Unit price'), h('span')));
    form.appendChild(linesWrap);
    form.appendChild(h('button.btn.btn--sm', {
      type: 'button',
      onclick: function () { lines.push({ description: '', quantity: 1, unitPrice: '' }); drawLines(); refreshTotals(); },
    }, '+ Add line'));

    form.appendChild(h('h3.card__subtitle', 'Adjustments'));
    var adj = h('div.grid.grid--2');
    adj.appendChild(h('div.field', h('label.field__label', { text: 'Currency' }), currency));
    adj.appendChild(h('div.field', h('label.field__label', { text: 'Discount' }), discountType));
    adj.appendChild(h('div.field', h('label.field__label', { text: 'Discount value' }), discountInput));
    adj.appendChild(h('div.field', h('label.field__label', { text: 'Shipping' }), shipping));
    adj.appendChild(h('div.field', h('label.field__label', { text: 'Tax rate (%)' }), taxRate,
      h('p.field__hint', { text: 'Zero unless you charge tax on this order. Nothing is assumed about your jurisdiction.' })));
    adj.appendChild(h('div.field', h('label.field__label', { text: 'Valid until' }), validUntil));
    form.appendChild(adj);

    [discountType, discountInput, shipping, taxRate, currency].forEach(function (el) {
      el.addEventListener('input', refreshTotals);
      el.addEventListener('change', refreshTotals);
    });

    form.appendChild(totalsBox);

    form.appendChild(h('h3.card__subtitle', 'Terms'));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Payment terms' }), paymentTerms));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Packaging' }), packaging));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Lead time' }), leadTime));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Notes for the customer' }), notes));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Internal notes' }), internalNotes,
      h('p.field__hint', { text: 'Never shown on the document.' })));

    var save = h('button.btn.btn--accent', { type: 'button' }, isNew ? 'Create quotation' : 'Save changes');
    save.addEventListener('click', function () {
      var payload = {
        companyId: companySelect.value || undefined,
        currency: (currency.value || 'USD').trim(),
        items: lines
          .filter(function (l) { return l.description && String(l.description).trim(); })
          .map(function (l) {
            return {
              description: String(l.description).trim(),
              quantity: Number(l.quantity) || 1,
              unitPrice: Number(l.unitPrice) || 0,
              productId: l.productId || undefined,
            };
          }),
        discountType: discountType.value,
        discountInput: Number(discountInput.value) || 0,
        shipping: Number(shipping.value) || 0,
        taxRate: Number(taxRate.value) || 0,
        paymentTerms: paymentTerms.value.trim(),
        packaging: packaging.value.trim(),
        leadTime: leadTime.value.trim(),
        validUntil: validUntil.value || undefined,
        notes: notes.value.trim(),
        internalNotes: internalNotes.value.trim(),
      };

      if (!payload.items.length) { ui.toast('Add at least one line with a description.', 'error'); return; }

      save.disabled = true;
      (isNew ? api.post('/api/admin/quotations', payload)
             : api.put('/api/admin/quotations/' + existing.id, payload))
        .then(function (res) {
          ui.toast(isNew ? 'Quotation created' : 'Saved', 'ok');
          location.hash = '#/quotations/' + res.data.id;
        })
        .catch(function (err) { ui.toast(err.message, 'error'); save.disabled = false; });
    });
    form.appendChild(h('div.card__foot', save, h('a.btn.btn--sm', { href: '#/quotations' }, 'Cancel')));

    mount.appendChild(form);
    drawLines();
    refreshTotals();

    api.get('/api/admin/crm/companies?perPage=200').then(function (res) {
      companies = res.data;
      companies.forEach(function (c) {
        companySelect.appendChild(h('option', {
          value: c.id, selected: existing && existing.companyId === c.id,
        }, c.name));
      });
    }).catch(function () { /* a quotation can be raised without an account */ });

    api.get('/api/admin/products?perPage=200&status=PUBLISHED').then(function (res) {
      products = res.data;
      drawLines();
    }).catch(function () { /* free-text lines still work */ });
  }

  Admin.route('/quotations/new', {
    title: 'New quotation',
    subtitle: 'Build a priced document',
    render: function (mount) { ui.clear(mount); builder(mount, null); },
  });

  Admin.route('/quotations/:id/edit', {
    title: 'Edit quotation',
    subtitle: 'Only a draft can be changed',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));
      return api.get('/api/admin/quotations/' + encodeURIComponent(params.id)).then(function (res) {
        ui.clear(mount);
        if (res.data.status !== 'DRAFT') {
          mount.appendChild(ui.notice('info',
            'This quotation has been sent, so it can no longer be changed. Raise a new one instead — the customer is holding this version.'));
          mount.appendChild(h('a.btn.btn--sm', { href: '#/quotations/' + res.data.id }, '← Back'));
          return;
        }
        builder(mount, res.data);
      });
    },
  });

  /* --------------------------------------------------------- one, read -- */

  Admin.route('/quotations/:id', {
    title: 'Quotation',
    subtitle: 'What was quoted, and where it stands',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));

      return api.get('/api/admin/quotations/' + encodeURIComponent(params.id)).then(function (res) {
        var q = res.data;
        ui.clear(mount);
        mount.appendChild(h('a.btn.btn--sm', { href: '#/quotations' }, '← All quotations'));

        var actions = h('div.chip-row');
        actions.appendChild(h('a.btn.btn--sm', { href: '#/quotations/' + q.id + '/print' }, 'Print / save as PDF'));
        if (q.status === 'DRAFT') {
          actions.appendChild(h('a.btn.btn--sm', { href: '#/quotations/' + q.id + '/edit' }, 'Edit'));
        }
        /* The point of an accepted quotation. Converting copies the figures
           the customer agreed to, so it happens here rather than by retyping
           them into a blank order. */
        if (q.order) {
          actions.appendChild(h('a.btn.btn--sm', { href: '#/orders/' + q.order.id }, 'Order ' + q.order.number));
        } else if (q.status === 'ACCEPTED') {
          actions.appendChild(h('button.btn.btn--accent.btn--sm', {
            type: 'button',
            onclick: function () {
              api.post('/api/admin/orders/from-quotation/' + q.id, {})
                .then(function (res) {
                  ui.toast('Order ' + res.data.number + ' raised', 'ok');
                  location.hash = '#/orders/' + res.data.id;
                })
                .catch(function (err) { ui.toast(err.message, 'error'); });
            },
          }, 'Convert to an order'));
        }

        STATUSES.filter(function (s) { return s !== q.status && s !== 'EXPIRED'; }).forEach(function (s) {
          actions.appendChild(h('button.btn.btn--sm', {
            type: 'button',
            onclick: function () {
              api.patch('/api/admin/quotations/' + q.id + '/status', { status: s })
                .then(function () { ui.toast('Marked ' + label(s), 'ok'); location.reload(); })
                .catch(function (err) { ui.toast(err.message, 'error'); });
            },
          }, 'Mark ' + label(s)));
        });
        mount.appendChild(actions);

        mount.appendChild(renderDocument(q, false));
        mount.appendChild(Admin.documentsCard('quotation', q.id, {
          hint: 'Artwork the customer sent, a specification, anything this quotation was priced from.',
        }));
      });
    },
  });

  /* ------------------------------------------------------------- print -- */

  Admin.route('/quotations/:id/print', {
    title: 'Quotation',
    subtitle: 'Print, or save as PDF from the print dialog',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));

      return Promise.all([
        api.get('/api/admin/quotations/' + encodeURIComponent(params.id)),
        api.get('/api/settings').catch(function () { return { data: {} }; }),
      ]).then(function (results) {
        var q = results[0].data;
        var site = results[1].data || {};
        ui.clear(mount);

        var bar = h('div.chip-row.no-print');
        bar.appendChild(h('a.btn.btn--sm', { href: '#/quotations/' + q.id }, '← Back'));
        bar.appendChild(h('button.btn.btn--accent', {
          type: 'button', onclick: function () { window.print(); },
        }, 'Print / save as PDF'));
        bar.appendChild(h('span.muted.tiny',
          'Choose "Save as PDF" as the destination in the print dialog.'));
        mount.appendChild(bar);

        mount.appendChild(renderDocument(q, true, site));
      });
    },
  });

  /** The document itself. Used on screen and when printing — one renderer, so
   *  what somebody checks is what the customer receives. */
  function renderDocument(q, forPrint, site) {
    var doc = h('section.doc' + (forPrint ? ' doc--print' : ''));

    var head = h('div.doc__head');
    var brand = h('div.doc__brand');
    brand.appendChild(h('div.doc__mark', 'WW'));
    var brandText = h('div');
    brandText.appendChild(h('div.doc__company', (site && site.brand) || 'WIN WEARS'));
    if (site && site.tagline) brandText.appendChild(h('div.doc__tagline', site.tagline));
    brand.appendChild(brandText);
    head.appendChild(brand);

    var meta = h('div.doc__meta');
    meta.appendChild(h('div.doc__number', q.number));
    meta.appendChild(h('div.doc__status', label(q.status)));
    meta.appendChild(h('div.doc__date', 'Raised ' + ui.date(q.createdAt)));
    if (q.validUntil) meta.appendChild(h('div.doc__date', 'Valid until ' + ui.date(q.validUntil)));
    head.appendChild(meta);
    doc.appendChild(head);

    var parties = h('div.doc__parties');
    var from = h('div');
    from.appendChild(h('div.doc__label', 'From'));
    from.appendChild(h('div.doc__party', (site && site.brand) || 'WIN WEARS'));
    if (site && site.email) from.appendChild(h('div.doc__line', site.email));
    if (site && site.phoneDisplay) from.appendChild(h('div.doc__line', site.phoneDisplay));
    parties.appendChild(from);

    var to = h('div');
    to.appendChild(h('div.doc__label', 'To'));
    to.appendChild(h('div.doc__party', q.company ? q.company.name : (q.contact ? q.contact.name : 'Customer')));
    if (q.contact && q.contact.name && q.company) to.appendChild(h('div.doc__line', q.contact.name));
    if (q.contact && q.contact.email) to.appendChild(h('div.doc__line', q.contact.email));
    if (q.company && q.company.country) to.appendChild(h('div.doc__line', q.company.country));
    parties.appendChild(to);
    doc.appendChild(parties);

    var table = h('table.doc__table');
    table.appendChild(h('thead', h('tr',
      h('th', 'Description'), h('th.num', 'Qty'), h('th.num', 'Unit price'), h('th.num', 'Amount'))));
    var body = h('tbody');
    q.items.forEach(function (i) {
      body.appendChild(h('tr',
        h('td', i.description),
        h('td.num', String(i.quantity)),
        h('td.num', money(i.unitPrice, q.currency)),
        h('td.num', money(i.lineTotal, q.currency))));
    });
    table.appendChild(body);
    doc.appendChild(table);

    var totals = h('div.doc__totals');
    function row(name, value, grand) {
      totals.appendChild(h('div.doc__total' + (grand ? '.doc__total--grand' : ''),
        h('span', name), h('span', money(value, q.currency))));
    }
    row('Subtotal', q.subtotal);
    if (q.discountValue) row('Discount', -q.discountValue);
    if (q.shipping) row('Shipping', q.shipping);
    if (q.taxValue) row('Tax (' + q.taxRate + '%)', q.taxValue);
    row('Total', q.total, true);
    doc.appendChild(totals);

    var terms = h('div.doc__terms');
    [['Payment terms', q.paymentTerms], ['Packaging', q.packaging], ['Lead time', q.leadTime]]
      .forEach(function (p) {
        if (!p[1]) return;
        terms.appendChild(h('div.doc__term', h('div.doc__label', p[0]), h('div', p[1])));
      });
    if (terms.childNodes.length) doc.appendChild(terms);

    if (q.notes) {
      doc.appendChild(h('div.doc__notes', h('div.doc__label', 'Notes'), h('p', q.notes)));
    }

    /* Internal notes are never rendered here — this element is what the
       customer sees, whether printed or shown on a shared screen. */
    return doc;
  }
})();
