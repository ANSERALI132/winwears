/* ==========================================================================
   Admin — Orders
   The list, the builder, the payment record, and an order confirmation the
   browser can print to PDF.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  /* Shared with quotations, which is the same document earlier in its life. */
  var label = Admin.doc.label;
  var money = Admin.doc.money;
  var previewTotals = Admin.doc.previewTotals;

  var STATUSES = [
    'CONFIRMED', 'IN_PRODUCTION', 'QUALITY_CHECK', 'READY_TO_SHIP',
    'SHIPPED', 'DELIVERED', 'COMPLETED', 'ON_HOLD', 'CANCELLED',
  ];

  function dateInput(value) {
    return value ? new Date(value).toISOString().slice(0, 10) : '';
  }

  /* ----------------------------------------------------------- the list -- */

  Admin.route('/orders', {
    title: 'Orders',
    subtitle: 'Work the factory is committed to',
    render: function (mount) {
      var state = { q: '', status: '', page: 1, perPage: 25 };
      var card = h('section.card');
      var toolbar = h('div.toolbar');
      var slot = h('div');

      toolbar.appendChild(h('input', {
        type: 'search', placeholder: 'Order or PO number, customer, line…', 'aria-label': 'Search orders',
        oninput: ui.debounce(function (e) { state.q = e.target.value.trim(); state.page = 1; load(); }, 300),
      }));
      toolbar.appendChild(h('select', {
        'aria-label': 'Filter by status',
        onchange: function (e) { state.status = e.target.value; state.page = 1; load(); },
      }, h('option', { value: '' }, 'All statuses'),
        STATUSES.map(function (s) { return h('option', { value: s }, label(s)); })));
      toolbar.appendChild(h('a.btn.btn--accent', { href: '#/orders/new' }, 'New order'));

      /* The two questions asked every morning, as one tick each. */
      var late = h('input', { type: 'checkbox' });
      var unpaid = h('input', { type: 'checkbox' });
      function onFilter() {
        state.late = late.checked ? '1' : '';
        state.unpaid = unpaid.checked ? '1' : '';
        state.page = 1;
        load();
      }
      late.addEventListener('change', onFilter);
      unpaid.addEventListener('change', onFilter);

      var filters = h('div.chip-row',
        h('label.check', late, h('span', 'Past the promised date')),
        h('label.check', unpaid, h('span', 'Money outstanding')));

      card.appendChild(toolbar);
      card.appendChild(filters);
      card.appendChild(slot);
      ui.clear(mount).appendChild(card);

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(4));
        return api.get('/api/admin/orders' + api.qs(state))
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty('No orders yet',
                'An order is what an accepted quotation becomes. Accept a quotation and convert it, or start a blank order.',
                h('a.btn.btn--accent', { href: '#/orders/new' }, 'New order')));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', 'Number'), h('th', 'Customer'), h('th', 'Total'), h('th', 'Outstanding'),
              h('th', 'Status'), h('th', 'Promised'), h('th', 'Confirmed'))));
            var body = h('tbody');
            res.data.forEach(function (o) {
              var tr = h('tr');
              tr.appendChild(h('td', h('a', { href: '#/orders/' + o.id }, o.number)));
              tr.appendChild(h('td', o.company ? o.company.name : (o.contact ? o.contact.name : '—')));
              tr.appendChild(h('td', money(o.total, o.currency)));
              tr.appendChild(h('td', o.balance.balance > 0
                ? money(o.balance.balance, o.currency)
                : label(o.balance.label)));
              tr.appendChild(h('td', ui.statusPill(o.status)));
              tr.appendChild(h('td', o.promisedAt ? ui.date(o.promisedAt) : '—'));
              tr.appendChild(h('td', ui.date(o.createdAt)));
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

  /* ------------------------------------------------------------ builder -- */

  function builder(mount, existing) {
    var isNew = !existing;
    /* Once production has started the priced lines are what the factory is
       working to, so the builder shows them and refuses to edit them rather
       than pretending they are editable and failing on save. */
    var pricingLocked = Boolean(existing) && existing.status !== 'CONFIRMED';
    var products = [];

    var lines = existing
      ? existing.items.map(function (i) {
          return { description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, productId: i.productId };
        })
      : [{ description: '', quantity: 1, unitPrice: '' }];

    var form = h('section.card');
    form.appendChild(h('h2.card__title', isNew ? 'New order' : 'Edit ' + existing.number));
    form.appendChild(h('p.card__hint',
      'Every price here is yours to enter. Nothing is filled in from the catalogue or carried over from another order.'));

    var companySelect = h('select', {}, h('option', { value: '' }, 'No customer selected'));
    var poNumber = h('input', { type: 'text', value: (existing && existing.poNumber) || '' });
    var currency = h('input', { type: 'text', maxLength: 3, value: (existing && existing.currency) || 'USD', style: 'width:6rem' });
    var discountType = h('select', {},
      h('option', { value: 'NONE', selected: !existing || existing.discountType === 'NONE' }, 'No discount'),
      h('option', { value: 'PERCENT', selected: existing && existing.discountType === 'PERCENT' }, 'Percentage'),
      h('option', { value: 'AMOUNT', selected: existing && existing.discountType === 'AMOUNT' }, 'Fixed amount'));
    var discountInput = h('input', { type: 'number', min: 0, step: '0.01', value: existing ? String(existing.discountInput) : '0' });
    var shipping = h('input', { type: 'number', min: 0, step: '0.01', value: existing ? String(existing.shipping) : '0' });
    var taxRate = h('input', { type: 'number', min: 0, max: 100, step: '0.01', value: existing ? String(existing.taxRate) : '0' });
    var requiredBy = h('input', { type: 'date', value: dateInput(existing && existing.requiredBy) });
    var promisedAt = h('input', { type: 'date', value: dateInput(existing && existing.promisedAt) });
    var shipTo = h('textarea', { rows: 3, value: (existing && existing.shipTo) || '' });
    var paymentTerms = h('input', { type: 'text', value: (existing && existing.paymentTerms) || '' });
    var packaging = h('input', { type: 'text', value: (existing && existing.packaging) || '' });
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
          totalsBox.appendChild(h('div.totals__row', h('span', row[0]), h('span', money(row[1], cur))));
        });
      totalsBox.appendChild(h('div.totals__row.totals__row--grand',
        h('span', 'Total'), h('span', money(t.total, cur))));
    }

    function drawLines() {
      ui.clear(linesWrap);
      lines.forEach(function (line, index) {
        var row = h('div.line');

        var desc = h('input', { type: 'text', value: line.description, placeholder: 'What is being made', disabled: pricingLocked });
        desc.addEventListener('input', function () { line.description = desc.value; });

        var picker = h('select', { 'aria-label': 'Use a catalogue product', disabled: pricingLocked },
          h('option', { value: '' }, 'Free text…'));
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

        var qty = h('input', { type: 'number', min: 1, step: 1, value: String(line.quantity), 'aria-label': 'Quantity', disabled: pricingLocked });
        qty.addEventListener('input', function () { line.quantity = qty.value; refreshTotals(); });

        var price = h('input', { type: 'number', min: 0, step: '0.01', value: String(line.unitPrice), placeholder: '0.00', 'aria-label': 'Unit price', disabled: pricingLocked });
        price.addEventListener('input', function () { line.unitPrice = price.value; refreshTotals(); });

        var remove = h('button.btn.btn--sm.btn--danger', {
          type: 'button', 'aria-label': 'Remove this line', disabled: pricingLocked,
          onclick: function () {
            if (lines.length === 1) { ui.toast('An order needs at least one line.', 'error'); return; }
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
    form.appendChild(h('div.field', h('label.field__label', { text: 'Their purchase order number' }), poNumber,
      h('p.field__hint', { text: 'They will quote this in every email about the order, and will not know ours.' })));

    form.appendChild(h('h3.card__subtitle', 'Lines'));
    form.appendChild(h('div.line.line--head',
      h('div.line__desc', h('span.muted.tiny', 'Description')),
      h('span.muted.tiny', 'Qty'), h('span.muted.tiny', 'Unit price'), h('span')));
    form.appendChild(linesWrap);
    if (!pricingLocked) {
      form.appendChild(h('button.btn.btn--sm', {
        type: 'button',
        onclick: function () { lines.push({ description: '', quantity: 1, unitPrice: '' }); drawLines(); refreshTotals(); },
      }, 'Add a line'));
    }

    form.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Currency' }), currency),
      h('div.field', h('label.field__label', { text: 'Discount' }), discountType),
      h('div.field', h('label.field__label', { text: 'Discount value' }), discountInput),
      h('div.field', h('label.field__label', { text: 'Shipping' }), shipping),
      h('div.field', h('label.field__label', { text: 'Tax rate (%)' }), taxRate)));
    [discountType, discountInput, shipping, taxRate, currency].forEach(function (el) {
      el.disabled = pricingLocked;
      el.addEventListener('input', refreshTotals);
      el.addEventListener('change', refreshTotals);
    });

    form.appendChild(totalsBox);

    form.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Date the customer needs it' }), requiredBy),
      h('div.field', h('label.field__label', { text: 'Date we promised' }), promisedAt,
        h('p.field__hint', { text: 'Kept apart from theirs deliberately: the gap between the two is the thing worth reporting on.' }))));

    form.appendChild(h('div.field', h('label.field__label', { text: 'Deliver to' }), shipTo));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Payment terms' }), paymentTerms));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Packaging' }), packaging));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Notes for the customer' }), notes));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Internal notes' }), internalNotes,
      h('p.field__hint', { text: 'Never shown on the confirmation.' })));

    var save = h('button.btn.btn--accent', { type: 'button' }, isNew ? 'Create order' : 'Save changes');
    save.addEventListener('click', function () {
      var payload = {
        companyId: companySelect.value || undefined,
        poNumber: poNumber.value.trim(),
        requiredBy: requiredBy.value || undefined,
        promisedAt: promisedAt.value || undefined,
        shipTo: shipTo.value.trim(),
        paymentTerms: paymentTerms.value.trim(),
        packaging: packaging.value.trim(),
        notes: notes.value.trim(),
        internalNotes: internalNotes.value.trim(),
      };

      /* Sending pricing on a locked order is refused by the server. Not
         sending it at all is the honest request: nothing about the price is
         being asked to change. */
      if (!pricingLocked) {
        payload.currency = (currency.value || 'USD').trim();
        payload.items = lines
          .filter(function (l) { return l.description && String(l.description).trim(); })
          .map(function (l) {
            return {
              description: String(l.description).trim(),
              quantity: Number(l.quantity) || 1,
              unitPrice: Number(l.unitPrice) || 0,
              productId: l.productId || undefined,
            };
          });
        payload.discountType = discountType.value;
        payload.discountInput = Number(discountInput.value) || 0;
        payload.shipping = Number(shipping.value) || 0;
        payload.taxRate = Number(taxRate.value) || 0;

        if (!payload.items.length) { ui.toast('Add at least one line with a description.', 'error'); return; }
      }

      save.disabled = true;
      (isNew ? api.post('/api/admin/orders', payload)
             : api.put('/api/admin/orders/' + existing.id, payload))
        .then(function (res) {
          ui.toast(isNew ? 'Order created' : 'Saved', 'ok');
          location.hash = '#/orders/' + res.data.id;
        })
        .catch(function (err) { ui.toast(err.message, 'error'); save.disabled = false; });
    });
    form.appendChild(h('div.card__foot', save, h('a.btn.btn--sm', { href: '#/orders' }, 'Cancel')));

    mount.appendChild(form);
    drawLines();
    refreshTotals();

    api.get('/api/admin/crm/companies?perPage=200').then(function (res) {
      res.data.forEach(function (c) {
        companySelect.appendChild(h('option', {
          value: c.id, selected: existing && existing.companyId === c.id,
        }, c.name));
      });
    }).catch(function () { /* an order can be raised without an account */ });

    api.get('/api/admin/products?perPage=200&status=PUBLISHED').then(function (res) {
      products = res.data;
      drawLines();
    }).catch(function () { /* free-text lines still work */ });
  }

  Admin.route('/orders/new', {
    title: 'New order',
    subtitle: 'Work the factory is committing to',
    render: function (mount) { ui.clear(mount); builder(mount, null); },
  });

  Admin.route('/orders/:id/edit', {
    title: 'Edit order',
    subtitle: 'Pricing is fixed once production starts',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));
      return api.get('/api/admin/orders/' + encodeURIComponent(params.id)).then(function (res) {
        var o = res.data;
        ui.clear(mount);
        if (o.status === 'CANCELLED' || o.status === 'COMPLETED') {
          mount.appendChild(ui.notice('info',
            'This order is ' + o.status.toLowerCase() + ' and can no longer be changed. Raise a new one instead.'));
          mount.appendChild(h('a.btn.btn--sm', { href: '#/orders/' + o.id }, 'â† Back'));
          return;
        }
        if (o.status !== 'CONFIRMED') {
          mount.appendChild(ui.notice('info',
            'This order is already in production, so its lines and pricing are what the factory is working to and cannot be changed. Dates, delivery address and notes still can.'));
        }
        builder(mount, o);
      });
    },
  });

  /* --------------------------------------------------------- one, read -- */

  Admin.route('/orders/:id', {
    title: 'Order',
    subtitle: 'What was agreed, where it is, and what is owed',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));

      return api.get('/api/admin/orders/' + encodeURIComponent(params.id)).then(function (res) {
        var o = res.data;
        ui.clear(mount);
        mount.appendChild(h('a.btn.btn--sm', { href: '#/orders' }, 'â† All orders'));

        var actions = h('div.chip-row');
        actions.appendChild(h('a.btn.btn--sm', { href: '#/orders/' + o.id + '/print' }, 'Print / save as PDF'));
        if (o.status !== 'CANCELLED' && o.status !== 'COMPLETED') {
          actions.appendChild(h('a.btn.btn--sm', { href: '#/orders/' + o.id + '/edit' }, 'Edit'));
        }
        /* Only the moves this order can actually make. The server decides;
           this stops the screen offering one it is going to refuse. */
        o.allowedNext.forEach(function (s) {
          actions.appendChild(h('button.btn.btn--sm' + (s === 'CANCELLED' ? '.btn--danger' : ''), {
            type: 'button',
            onclick: function () { moveTo(o, s); },
          }, 'Move to ' + label(s)));
        });
        mount.appendChild(actions);

        mount.appendChild(renderDocument(o, false));
        mount.appendChild(productionCard(o));
        mount.appendChild(shipmentsCard(o));
        mount.appendChild(Admin.documentsCard('order', o.id, {
          hint: 'Their purchase order, artwork, a signed acceptance. Held privately — a link only works for somebody signed in here.',
        }));
        mount.appendChild(paymentsCard(o));
        mount.appendChild(historyCard(o));
      });
    },
  });

  function moveTo(order, status) {
    if (status !== 'CANCELLED') {
      api.patch('/api/admin/orders/' + order.id + '/status', { status: status })
        .then(function () { ui.toast('Moved to ' + label(status), 'ok'); Admin.refresh(); })
        .catch(function (err) { ui.toast(err.message, 'error'); });
      return;
    }

    /* Cancelling asks for a reason, because it is the only record of what
       happened when somebody asks about this order in three months. */
    var reason = h('textarea', { rows: 3, placeholder: 'Why is this being cancelled?' });
    ui.modal({
      title: 'Cancel order ' + order.number + '?',
      danger: true,
      confirmLabel: 'Cancel the order',
      cancelLabel: 'Leave it open',
      body: h('div',
        h('p', { text: 'The order stays on record. Nothing is deleted.' }),
        h('div.field', h('label.field__label', { text: 'Reason' }), reason)),
    }).then(function (ok) {
      if (!ok) return;
      if (!reason.value.trim()) { ui.toast('A cancellation needs a reason.', 'error'); return; }
      api.patch('/api/admin/orders/' + order.id + '/status', { status: 'CANCELLED', reason: reason.value.trim() })
        .then(function () { ui.toast('Order cancelled', 'ok'); Admin.refresh(); })
        .catch(function (err) { ui.toast(err.message, 'error'); });
    });
  }

  /* -------------------------------------------------------- production -- */

  function productionCard(o) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'Production'));

    if (!o.runs || !o.runs.length) {
      card.appendChild(ui.empty('Nothing scheduled against this order',
        'A production run says what the factory is actually making for it, and how far along that is.',
        h('a.btn.btn--accent', { href: '#/production/new' }, 'Plan a run')));
      return card;
    }

    var table = h('table.table');
    table.appendChild(h('thead', h('tr', h('th', 'Run'), h('th', 'What'), h('th', 'Quantity'), h('th', 'Status'))));
    var body = h('tbody');
    o.runs.forEach(function (r) {
      body.appendChild(h('tr',
        h('td', h('a', { href: '#/production/' + r.id }, r.reference)),
        h('td', r.title),
        h('td', String(r.quantityPlanned)),
        h('td', ui.statusPill(r.status))));
    });
    table.appendChild(body);
    card.appendChild(table);
    card.appendChild(h('div.card__foot', h('a.btn.btn--sm', { href: '#/production/new' }, 'Plan another run')));
    return card;
  }

  /* --------------------------------------------------------- shipments -- */

  function shipmentsCard(o) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'Shipping'));

    if (!o.shipments || !o.shipments.length) {
      card.appendChild(ui.empty('Nothing shipped yet',
        'A shipment is one consignment against this order. It can go in several — a container now and the balance later is normal.',
        h('a.btn.btn--accent', { href: '#/shipments/new' }, 'Raise a shipment')));
      return card;
    }

    var table = h('table.table');
    table.appendChild(h('thead', h('tr',
      h('th', 'Reference'), h('th', 'Lines'), h('th', 'Carrier'),
      h('th', 'Tracking'), h('th', 'Status'), h('th', 'Dispatched'))));
    var body = h('tbody');
    o.shipments.forEach(function (s) {
      body.appendChild(h('tr',
        h('td', h('a', { href: '#/shipments/' + s.id }, s.reference)),
        h('td', String(s._count ? s._count.items : 0)),
        h('td', s.carrier || '—'),
        h('td', s.trackingNumber || '—'),
        h('td', ui.statusPill(s.status)),
        h('td', s.dispatchedAt ? ui.date(s.dispatchedAt) : '—')));
    });
    table.appendChild(body);
    card.appendChild(table);
    card.appendChild(h('div.card__foot', h('a.btn.btn--sm', { href: '#/shipments/new' }, 'Raise another shipment')));
    return card;
  }

  /* ---------------------------------------------------------- payments -- */

  function paymentsCard(o) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'Payments'));
    card.appendChild(h('p.card__hint',
      'Only money that actually arrived. Payment terms say what was agreed; they are not evidence that anything has been paid.'));

    var position = h('div.totals');
    position.appendChild(h('div.totals__row', h('span', 'Order total'), h('span', money(o.balance.total, o.currency))));
    position.appendChild(h('div.totals__row', h('span', 'Received'), h('span', money(o.balance.paid, o.currency))));
    position.appendChild(h('div.totals__row.totals__row--grand',
      h('span', o.balance.balance < 0 ? 'Overpaid by' : 'Outstanding'),
      h('span', money(Math.abs(o.balance.balance), o.currency))));
    card.appendChild(position);

    if (o.payments.length) {
      var table = h('table.table');
      table.appendChild(h('thead', h('tr',
        h('th', 'Received'), h('th', 'Amount'), h('th', 'Method'),
        h('th', 'Reference'), h('th', 'Recorded by'), h('th'))));
      var body = h('tbody');
      o.payments.forEach(function (p) {
        var tr = h('tr');
        tr.appendChild(h('td', ui.date(p.receivedAt)));
        tr.appendChild(h('td', money(p.amount, o.currency)));
        tr.appendChild(h('td', p.method || '—'));
        tr.appendChild(h('td', p.reference || '—'));
        tr.appendChild(h('td', p.recordedBy ? p.recordedBy.name : '—'));
        tr.appendChild(h('td', h('button.btn.btn--sm.btn--danger', {
          type: 'button',
          onclick: function () { removePayment(o, p); },
        }, 'Remove')));
        body.appendChild(tr);
      });
      table.appendChild(body);
      card.appendChild(table);
    }

    var amount = h('input', { type: 'number', min: '0.01', step: '0.01', placeholder: '0.00' });
    var receivedAt = h('input', { type: 'date' });
    var method = h('input', { type: 'text', placeholder: 'Bank transfer, letter of credit…' });
    var reference = h('input', { type: 'text', placeholder: 'The bank reference' });

    var record = h('button.btn.btn--accent', { type: 'button' }, 'Record a payment');
    record.addEventListener('click', function () {
      var value = Number(amount.value);
      if (!value || value <= 0) { ui.toast('Enter the amount that arrived.', 'error'); return; }
      record.disabled = true;
      api.post('/api/admin/orders/' + o.id + '/payments', {
        amount: value,
        method: method.value.trim(),
        reference: reference.value.trim(),
        receivedAt: receivedAt.value || undefined,
      })
        .then(function () { ui.toast('Payment recorded', 'ok'); Admin.refresh(); })
        .catch(function (err) { ui.toast(err.message, 'error'); record.disabled = false; });
    });

    card.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Amount received' }), amount),
      h('div.field', h('label.field__label', { text: 'Date received' }), receivedAt),
      h('div.field', h('label.field__label', { text: 'Method' }), method),
      h('div.field', h('label.field__label', { text: 'Reference' }), reference)));
    card.appendChild(h('div.card__foot', record));

    return card;
  }

  function removePayment(order, payment) {
    ui.modal({
      title: 'Remove this payment?',
      danger: true,
      confirmLabel: 'Remove it',
      body: h('div',
        h('p', { text: 'Do this only to correct a mistake in what was entered. It does not refund anything.' }),
        h('p.muted', { text: money(payment.amount, order.currency) + ' recorded ' + ui.date(payment.receivedAt) })),
    }).then(function (ok) {
      if (!ok) return;
      api.del('/api/admin/orders/' + order.id + '/payments/' + payment.id)
        .then(function () { ui.toast('Payment removed', 'ok'); Admin.refresh(); })
        .catch(function (err) { ui.toast(err.message, 'error'); });
    });
  }

  /* ----------------------------------------------------------- history -- */

  function historyCard(o) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'History'));

    if (!o.events.length) {
      card.appendChild(h('p.muted', { text: 'Nothing recorded yet.' }));
      return card;
    }

    var list = h('div.timeline');
    o.events.forEach(function (e) {
      list.appendChild(h('div.timeline__row',
        h('div.timeline__when', { text: ui.dateTime(e.createdAt) }),
        h('div.timeline__body',
          h('div.timeline__title', {
            text: e.fromStatus ? label(e.fromStatus) + ' → ' + label(e.toStatus) : label(e.toStatus),
          }),
          h('div.timeline__detail', {
            text: (e.by ? e.by.name : 'Somebody no longer on the system') + (e.note ? ' — ' + e.note : ''),
          }))));
    });
    card.appendChild(list);
    return card;
  }

  /* ------------------------------------------------------------- print -- */

  Admin.route('/orders/:id/print', {
    title: 'Order confirmation',
    subtitle: 'Print, or save as PDF from the print dialog',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));

      return Promise.all([
        api.get('/api/admin/orders/' + encodeURIComponent(params.id)),
        api.get('/api/settings').catch(function () { return { data: {} }; }),
      ]).then(function (results) {
        var o = results[0].data;
        var site = results[1].data || {};
        ui.clear(mount);

        var bar = h('div.chip-row.no-print');
        bar.appendChild(h('a.btn.btn--sm', { href: '#/orders/' + o.id }, 'â† Back'));
        bar.appendChild(h('button.btn.btn--accent', {
          type: 'button', onclick: function () { window.print(); },
        }, 'Print / save as PDF'));
        bar.appendChild(h('span.muted.tiny',
          'Choose "Save as PDF" as the destination in the print dialog.'));
        mount.appendChild(bar);

        mount.appendChild(renderDocument(o, true, site));
      });
    },
  });

  /** The order confirmation. Used on screen and when printing — one renderer,
   *  so what somebody checks is what the customer receives. */
  function renderDocument(o, forPrint, site) {
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
    /* A quotation and an order confirmation look alike at a glance. Saying
       which this is, first, saves somebody acting on the wrong one. */
    meta.appendChild(h('div.doc__kind', 'Order confirmation'));
    meta.appendChild(h('div.doc__number', o.number));
    meta.appendChild(h('div.doc__status', label(o.status)));
    meta.appendChild(h('div.doc__date', 'Confirmed ' + ui.date(o.confirmedAt || o.createdAt)));
    /* Their reference sits alongside ours, because theirs is the one they
       will quote back at us. */
    if (o.poNumber) meta.appendChild(h('div.doc__date', 'Your order ' + o.poNumber));
    if (o.quotation) meta.appendChild(h('div.doc__date', 'From quotation ' + o.quotation.number));
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
    to.appendChild(h('div.doc__party', o.company ? o.company.name : (o.contact ? o.contact.name : 'Customer')));
    if (o.contact && o.contact.name && o.company) to.appendChild(h('div.doc__line', o.contact.name));
    if (o.contact && o.contact.email) to.appendChild(h('div.doc__line', o.contact.email));
    if (o.company && o.company.country) to.appendChild(h('div.doc__line', o.company.country));
    parties.appendChild(to);

    if (o.shipTo) {
      var ship = h('div');
      ship.appendChild(h('div.doc__label', 'Deliver to'));
      /* A pasted address keeps its lines: each one is its own element rather
         than trusting white-space to survive the print stylesheet. */
      String(o.shipTo).split(/\r?\n/).forEach(function (part) {
        if (part.trim()) ship.appendChild(h('div.doc__line', part.trim()));
      });
      parties.appendChild(ship);
    }
    doc.appendChild(parties);

    if (o.promisedAt || o.requiredBy) {
      var dates = h('div.doc__terms');
      if (o.promisedAt) {
        dates.appendChild(h('div.doc__term', h('div.doc__label', 'Delivery promised'), h('div', ui.date(o.promisedAt))));
      }
      if (o.requiredBy) {
        dates.appendChild(h('div.doc__term', h('div.doc__label', 'Date required'), h('div', ui.date(o.requiredBy))));
      }
      doc.appendChild(dates);
    }

    var table = h('table.doc__table');
    table.appendChild(h('thead', h('tr',
      h('th', 'Description'), h('th.num', 'Qty'), h('th.num', 'Unit price'), h('th.num', 'Amount'))));
    var body = h('tbody');
    o.items.forEach(function (i) {
      body.appendChild(h('tr',
        h('td', i.description),
        h('td.num', String(i.quantity)),
        h('td.num', money(i.unitPrice, o.currency)),
        h('td.num', money(i.lineTotal, o.currency))));
    });
    table.appendChild(body);
    doc.appendChild(table);

    var totals = h('div.doc__totals');
    function row(name, value, grand) {
      totals.appendChild(h('div.doc__total' + (grand ? '.doc__total--grand' : ''),
        h('span', name), h('span', money(value, o.currency))));
    }
    row('Subtotal', o.subtotal);
    if (o.discountValue) row('Discount', -o.discountValue);
    if (o.shipping) row('Shipping', o.shipping);
    if (o.taxValue) row('Tax (' + o.taxRate + '%)', o.taxValue);
    row('Order total', o.total, true);
    /* The payment position, but only the totals. Which bank reference paid
       what is our bookkeeping, not something to put in front of a customer. */
    if (o.balance.paid > 0) {
      row('Received', o.balance.paid);
      row(o.balance.balance < 0 ? 'Overpaid' : 'Balance due', Math.abs(o.balance.balance), true);
    }
    doc.appendChild(totals);

    var terms = h('div.doc__terms');
    [['Payment terms', o.paymentTerms], ['Packaging', o.packaging]].forEach(function (p) {
      if (!p[1]) return;
      terms.appendChild(h('div.doc__term', h('div.doc__label', p[0]), h('div', p[1])));
    });
    if (terms.childNodes.length) doc.appendChild(terms);

    if (o.notes) {
      doc.appendChild(h('div.doc__notes', h('div.doc__label', 'Notes'), h('p', o.notes)));
    }

    if (o.status === 'CANCELLED' && o.cancelReason) {
      doc.appendChild(h('div.doc__notes', h('div.doc__label', 'Cancelled'), h('p', o.cancelReason)));
    }

    /* Internal notes are never rendered here — this element is what the
       customer sees, whether printed or shown on a shared screen. */
    return doc;
  }
})();
