/* ==========================================================================
   Admin â€” Shipping
   Consignments, what is in them, and a packing list the browser can print.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  var label = Admin.doc.label;

  var STATUSES = ['PREPARING', 'READY', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];

  /** A tracking link is admin-entered and ends up as an href, so it is checked
   *  here as well as on the server. Anything not plainly http(s) is not a
   *  link at all. */
  function safeHref(url) {
    if (typeof url !== 'string' || !url) return null;
    return /^https?:\/\//i.test(url) ? url : null;
  }

  /* ----------------------------------------------------------- the list -- */

  Admin.route('/shipments', {
    title: 'Shipping',
    subtitle: 'What has gone out, and what has not',
    render: function (mount) {
      var query = Admin.query();
      var state = { q: '', status: query.status || '', overdue: query.overdue || '', page: 1, perPage: 25 };

      var card = h('section.card');
      var toolbar = h('div.toolbar');
      var slot = h('div');

      toolbar.appendChild(h('input', {
        type: 'search', placeholder: 'Shipment, tracking, order or customerâ€¦', 'aria-label': 'Search shipments',
        oninput: ui.debounce(function (e) { state.q = e.target.value.trim(); state.page = 1; load(); }, 300),
      }));
      var statusSelect = h('select', {
        'aria-label': 'Filter by status',
        onchange: function (e) { state.status = e.target.value; state.page = 1; load(); },
      }, h('option', { value: '' }, 'All statuses'),
        STATUSES.map(function (s) { return h('option', { value: s }, label(s)); }));
      statusSelect.value = state.status;
      toolbar.appendChild(statusSelect);
      toolbar.appendChild(h('a.btn.btn--accent', { href: '#/shipments/new' }, 'New shipment'));

      var overdue = h('input', { type: 'checkbox', checked: Boolean(state.overdue) });
      overdue.addEventListener('change', function () {
        state.overdue = overdue.checked ? '1' : '';
        state.page = 1;
        load();
      });

      card.appendChild(toolbar);
      card.appendChild(h('div.chip-row', h('label.check', overdue, h('span', 'Past its expected date'))));
      card.appendChild(slot);
      mount.appendChild(card);

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(4));
        return api.get('/api/admin/shipments' + api.qs(state))
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty('Nothing shipped yet',
                'A shipment is one consignment against one order. An order can go in several — a container now and the balance later is normal.',
                h('a.btn.btn--accent', { href: '#/shipments/new' }, 'New shipment')));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', 'Reference'), h('th', 'Order'), h('th', 'Customer'), h('th', 'Lines'),
              h('th', 'Carrier'), h('th', 'Status'), h('th', 'Expected'))));
            var body = h('tbody');
            res.data.forEach(function (s) {
              var tr = h('tr');
              tr.appendChild(h('td', h('a', { href: '#/shipments/' + s.id }, s.reference)));
              tr.appendChild(h('td', h('a', { href: '#/orders/' + s.order.id }, s.order.number)));
              tr.appendChild(h('td', s.order.company ? s.order.company.name : 'â€”'));
              tr.appendChild(h('td', s.items.length
                ? String(s.items.length) + (s.orderFullyShipped ? '' : ' (part)')
                : h('span.muted', { text: 'Empty' })));
              tr.appendChild(h('td', s.carrier || 'â€”'));
              tr.appendChild(h('td', ui.statusPill(s.status)));
              tr.appendChild(h('td', s.expectedAt ? ui.date(s.expectedAt) : 'â€”'));
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

    var form = h('section.card');
    form.appendChild(h('h2.card__title', isNew ? 'New shipment' : 'Edit ' + existing.reference));
    form.appendChild(h('p.card__hint',
      'Carrier, service and Incoterm are free text on purpose — which ones WIN WEARS uses and what was agreed is a fact about your contracts, not something to pick from a list of guesses.'));

    var orderSelect = h('select', {}, h('option', { value: '' }, 'Pick an orderâ€¦'));
    var carrier = h('input', { type: 'text', value: (existing && existing.carrier) || '', placeholder: 'DHL, a freight forwarder, your own van' });
    var service = h('input', { type: 'text', value: (existing && existing.service) || '', placeholder: 'Air freight, road, express' });
    var incoterm = h('input', { type: 'text', value: (existing && existing.incoterm) || '', placeholder: 'FOB, CIF, DAP' });
    var trackingNumber = h('input', { type: 'text', value: (existing && existing.trackingNumber) || '' });
    var trackingUrl = h('input', { type: 'url', value: (existing && existing.trackingUrl) || '', placeholder: 'https://…' });
    var shipTo = h('textarea', { rows: 3, value: (existing && existing.shipTo) || '' });
    var packages = h('input', { type: 'number', min: 0, step: 1, value: existing ? String(existing.packages) : '0' });
    var weightKg = h('input', {
      type: 'number', min: 0, step: '0.001', placeholder: 'Not weighed',
      value: existing && existing.weightKg != null ? String(existing.weightKg) : '',
    });
    var dimensions = h('input', { type: 'text', value: (existing && existing.dimensions) || '', placeholder: '2 pallets, 120 Ã— 100 Ã— 160cm' });
    var expectedAt = h('input', {
      type: 'date',
      value: existing && existing.expectedAt ? new Date(existing.expectedAt).toISOString().slice(0, 10) : '',
    });
    var notes = h('textarea', { rows: 2, value: (existing && existing.notes) || '' });
    var internalNotes = h('textarea', { rows: 2, value: (existing && existing.internalNotes) || '' });

    if (isNew) {
      form.appendChild(h('div.field', h('label.field__label', { text: 'Order' }), orderSelect,
        h('p.field__hint', { text: 'The delivery address is copied from it, and stays editable — a part shipment often goes somewhere else.' })));
    }
    form.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Carrier' }), carrier),
      h('div.field', h('label.field__label', { text: 'Service' }), service),
      h('div.field', h('label.field__label', { text: 'Incoterm' }), incoterm),
      h('div.field', h('label.field__label', { text: 'Expected to arrive' }), expectedAt)));
    form.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Tracking number' }), trackingNumber),
      h('div.field', h('label.field__label', { text: 'Tracking link' }), trackingUrl,
        h('p.field__hint', { text: 'Has to start with http:// or https://.' }))));
    form.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Packages' }), packages),
      h('div.field', h('label.field__label', { text: 'Weight (kg)' }), weightKg,
        h('p.field__hint', { text: 'Leave empty if it has not been weighed. That is not the same as zero.' }))));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Dimensions' }), dimensions));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Deliver to' }), shipTo));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Notes on the packing list' }), notes));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Internal notes' }), internalNotes,
      h('p.field__hint', { text: 'Never shown on the packing list.' })));

    var save = h('button.btn.btn--accent', { type: 'button' }, isNew ? 'Raise the shipment' : 'Save changes');
    save.addEventListener('click', function () {
      if (isNew && !orderSelect.value) { ui.toast('Pick the order this is going against.', 'error'); return; }

      var payload = {
        carrier: carrier.value.trim(),
        service: service.value.trim(),
        incoterm: incoterm.value.trim(),
        trackingNumber: trackingNumber.value.trim(),
        trackingUrl: trackingUrl.value.trim(),
        shipTo: shipTo.value.trim(),
        packages: Number(packages.value) || 0,
        weightKg: weightKg.value === '' ? null : Number(weightKg.value),
        dimensions: dimensions.value.trim(),
        expectedAt: expectedAt.value || undefined,
        notes: notes.value.trim(),
        internalNotes: internalNotes.value.trim(),
      };
      if (isNew) payload.orderId = orderSelect.value;

      save.disabled = true;
      (isNew ? api.post('/api/admin/shipments', payload)
             : api.put('/api/admin/shipments/' + existing.id, payload))
        .then(function (res) {
          ui.toast(isNew ? 'Shipment raised' : 'Saved', 'ok');
          location.hash = '#/shipments/' + res.data.id;
        })
        .catch(function (err) { ui.toast(err.message, 'error'); save.disabled = false; });
    });
    form.appendChild(h('div.card__foot', save, h('a.btn.btn--sm', { href: '#/shipments' }, 'Cancel')));
    mount.appendChild(form);

    if (isNew) {
      api.get('/api/admin/orders?perPage=100').then(function (res) {
        res.data
          .filter(function (o) { return o.status !== 'CANCELLED'; })
          .forEach(function (o) {
            orderSelect.appendChild(h('option', { value: o.id },
              o.number + ' — ' + (o.company ? o.company.name : 'no account')));
          });
      }).catch(function () {});
    }
  }

  Admin.route('/shipments/new', {
    title: 'New shipment',
    subtitle: 'One consignment against one order',
    render: function (mount) { builder(mount, null); },
  });

  Admin.route('/shipments/:id/edit', {
    title: 'Edit shipment',
    subtitle: 'The paperwork, not the contents',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));
      return api.get('/api/admin/shipments/' + encodeURIComponent(params.id)).then(function (res) {
        ui.clear(mount);
        if (res.data.status === 'CANCELLED') {
          mount.appendChild(ui.notice('info', 'This shipment was cancelled and cannot be changed.'));
          mount.appendChild(h('a.btn.btn--sm', { href: '#/shipments/' + res.data.id }, 'â† Back'));
          return;
        }
        builder(mount, res.data);
      });
    },
  });

  /* --------------------------------------------------------- one, read -- */

  Admin.route('/shipments/:id', {
    title: 'Shipment',
    subtitle: 'What is in it, and where it has got to',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));

      return api.get('/api/admin/shipments/' + encodeURIComponent(params.id)).then(function (res) {
        var s = res.data;
        ui.clear(mount);

        mount.appendChild(h('a.btn.btn--sm', { href: '#/shipments' }, 'â† All shipments'));

        var actions = h('div.chip-row');
        actions.appendChild(h('a.btn.btn--sm', { href: '#/shipments/' + s.id + '/packing-list' }, 'Packing list'));
        if (s.status !== 'CANCELLED') {
          actions.appendChild(h('a.btn.btn--sm', { href: '#/shipments/' + s.id + '/edit' }, 'Edit'));
        }
        s.allowedNext.forEach(function (next) {
          actions.appendChild(h('button.btn.btn--sm' + (next === 'CANCELLED' ? '.btn--danger' : ''), {
            type: 'button',
            onclick: function () { moveTo(s, next); },
          }, 'Mark ' + label(next).toLowerCase()));
        });
        mount.appendChild(actions);

        mount.appendChild(summaryCard(s));
        mount.appendChild(contentsCard(s));
        mount.appendChild(historyCard(s));
      });
    },
  });

  function summaryCard(s) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', s.reference));

    var facts = h('div.grid.grid--2');
    function fact(name, value) {
      facts.appendChild(h('div.field', h('div.field__label', { text: name }), h('div', value)));
    }
    fact('Status', ui.statusPill(s.status));
    fact('Order', h('a', { href: '#/orders/' + s.order.id },
      s.order.number + (s.order.company ? ' — ' + s.order.company.name : '')));
    fact('Carrier', s.carrier || h('span.muted', { text: 'Not recorded' }));
    fact('Service', s.service || h('span.muted', { text: 'Not recorded' }));
    fact('Incoterm', s.incoterm || h('span.muted', { text: 'Not recorded' }));

    var href = safeHref(s.trackingUrl);
    fact('Tracking', s.trackingNumber
      ? (href
        ? h('a', { href: href, target: '_blank', rel: 'noopener' }, s.trackingNumber)
        : h('span', { text: s.trackingNumber }))
      : h('span.muted', { text: 'Not recorded' }));

    fact('Packages', String(s.packages));
    fact('Weight', s.weightKg == null ? h('span.muted', { text: 'Not weighed' }) : s.weightKg + ' kg');
    fact('Expected', s.expectedAt ? ui.date(s.expectedAt) : h('span.muted', { text: 'No date' }));
    fact('Dispatched', s.dispatchedAt ? ui.dateTime(s.dispatchedAt) : h('span.muted', { text: 'Not yet' }));
    fact('Delivered', s.deliveredAt ? ui.dateTime(s.deliveredAt) : h('span.muted', { text: 'Not yet' }));
    card.appendChild(facts);

    if (s.notes) card.appendChild(h('p', { text: s.notes }));
    if (s.status === 'CANCELLED' && s.cancelReason) {
      card.appendChild(ui.notice('info', 'Cancelled: ' + s.cancelReason));
    }
    return card;
  }

  function moveTo(shipment, status) {
    if (status !== 'CANCELLED') {
      api.patch('/api/admin/shipments/' + shipment.id + '/status', { status: status })
        .then(function () { ui.toast('Marked ' + label(status).toLowerCase(), 'ok'); Admin.refresh(); })
        .catch(function (err) { ui.toast(err.message, 'error'); });
      return;
    }

    var reason = h('textarea', { rows: 3, placeholder: 'Why is this being cancelled?' });
    ui.modal({
      title: 'Cancel ' + shipment.reference + '?',
      danger: true,
      confirmLabel: 'Cancel the shipment',
      cancelLabel: 'Leave it',
      body: h('div',
        h('p', { text: 'What was in it goes back to being outstanding on the order. Nothing is deleted.' }),
        h('div.field', h('label.field__label', { text: 'Reason' }), reason)),
    }).then(function (ok) {
      if (!ok) return;
      if (!reason.value.trim()) { ui.toast('A cancellation needs a reason.', 'error'); return; }
      api.patch('/api/admin/shipments/' + shipment.id + '/status', { status: 'CANCELLED', reason: reason.value.trim() })
        .then(function () { ui.toast('Shipment cancelled', 'ok'); Admin.refresh(); })
        .catch(function (err) { ui.toast(err.message, 'error'); });
    });
  }

  /* ---------------------------------------------------------- contents -- */

  function contentsCard(s) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'What is in it'));

    if (s.locked) {
      card.appendChild(h('p.card__hint',
        'This shipment has gone. What is in it is what the customer will receive, so it can no longer be changed.'));
      if (!s.items.length) {
        card.appendChild(h('p.muted', { text: 'Nothing was recorded.' }));
        return card;
      }
      var sent = h('table.table');
      sent.appendChild(h('thead', h('tr', h('th', 'Line'), h('th', 'Quantity'))));
      var sentBody = h('tbody');
      s.items.forEach(function (i) {
        sentBody.appendChild(h('tr', h('td', i.orderItem.description), h('td', String(i.quantity))));
      });
      sent.appendChild(sentBody);
      card.appendChild(sent);
      return card;
    }

    if (s.status === 'CANCELLED') {
      card.appendChild(h('p.muted', { text: 'This shipment was cancelled. What was in it is outstanding on the order again.' }));
      return card;
    }

    card.appendChild(h('p.card__hint',
      'How much of each order line is in this consignment. What has already gone in other shipments is taken off what is left, so an order can never be over-shipped.'));

    var inputs = {};
    var host = h('div.lines');

    s.outstanding.forEach(function (line) {
      var mine = s.items.filter(function (i) { return i.orderItemId === line.orderItemId; })[0];
      /* What is left, plus whatever this consignment already holds — editing
         a shipment must not count its own contents against itself. */
      var available = line.remaining + (mine ? mine.quantity : 0);

      var row = h('div.line');
      var name = h('div.line__desc',
        h('div', { text: line.description }),
        h('div.muted.tiny', {
          text: line.ordered + ' ordered, ' + line.shipped + ' already gone, ' + available + ' available here',
        }));

      var quantity = h('input', {
        type: 'number', min: 0, step: 1, max: available,
        value: mine ? String(mine.quantity) : '',
        placeholder: '0',
        'aria-label': line.description + ' quantity',
        disabled: available === 0 && !mine,
      });

      var all = h('button.btn.btn--sm', {
        type: 'button',
        disabled: available === 0,
        onclick: function () { quantity.value = String(available); },
      }, 'All');

      row.appendChild(name);
      row.appendChild(quantity);
      row.appendChild(all);
      row.appendChild(h('span'));
      host.appendChild(row);

      inputs[line.orderItemId] = quantity;
    });

    card.appendChild(host);

    var save = h('button.btn.btn--accent', { type: 'button' }, 'Save contents');
    save.addEventListener('click', function () {
      var items = [];
      Object.keys(inputs).forEach(function (orderItemId) {
        var value = Number(inputs[orderItemId].value);
        if (value > 0) items.push({ orderItemId: orderItemId, quantity: value });
      });

      if (!items.length) { ui.toast('Put something in the shipment first.', 'error'); return; }

      save.disabled = true;
      api.put('/api/admin/shipments/' + s.id + '/items', { items: items })
        .then(function () { ui.toast('Contents saved', 'ok'); Admin.refresh(); })
        .catch(function (err) { ui.toast(err.message, 'error'); save.disabled = false; });
    });
    card.appendChild(h('div.card__foot', save));
    return card;
  }

  /* ----------------------------------------------------------- history -- */

  function historyCard(s) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'History'));

    if (!s.events.length) {
      card.appendChild(h('p.muted', { text: 'Nothing recorded yet.' }));
      return card;
    }

    var list = h('div.timeline');
    s.events.forEach(function (e) {
      list.appendChild(h('div.timeline__row',
        h('div.timeline__when', { text: ui.dateTime(e.createdAt) }),
        h('div.timeline__body',
          h('div.timeline__title', {
            text: e.fromStatus ? label(e.fromStatus) + ' â†’ ' + label(e.toStatus) : label(e.toStatus),
          }),
          h('div.timeline__detail', {
            text: (e.by ? e.by.name : 'Somebody no longer on the system') + (e.note ? ' â€” ' + e.note : ''),
          }))));
    });
    card.appendChild(list);
    return card;
  }

  /* ------------------------------------------------------ packing list -- */

  Admin.route('/shipments/:id/packing-list', {
    title: 'Packing list',
    subtitle: 'Print, or save as PDF from the print dialog',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));

      return Promise.all([
        api.get('/api/admin/shipments/' + encodeURIComponent(params.id)),
        api.get('/api/settings').catch(function () { return { data: {} }; }),
      ]).then(function (results) {
        var s = results[0].data;
        var site = results[1].data || {};
        ui.clear(mount);

        var bar = h('div.chip-row.no-print');
        bar.appendChild(h('a.btn.btn--sm', { href: '#/shipments/' + s.id }, 'â† Back'));
        bar.appendChild(h('button.btn.btn--accent', {
          type: 'button', onclick: function () { window.print(); },
        }, 'Print / save as PDF'));
        bar.appendChild(h('span.muted.tiny',
          'Choose "Save as PDF" as the destination in the print dialog.'));
        mount.appendChild(bar);

        mount.appendChild(renderPackingList(s, site));
      });
    },
  });

  /** The packing list. Deliberately carries no prices: it travels with the
   *  goods, and what the consignee and anyone handling the crates needs is
   *  what is in them, not what it cost. */
  function renderPackingList(s, site) {
    var doc = h('section.doc.doc--print');

    var head = h('div.doc__head');
    var brand = h('div.doc__brand');
    brand.appendChild(h('div.doc__mark', 'WW'));
    var brandText = h('div');
    brandText.appendChild(h('div.doc__company', (site && site.brand) || 'WIN WEARS'));
    if (site && site.tagline) brandText.appendChild(h('div.doc__tagline', site.tagline));
    brand.appendChild(brandText);
    head.appendChild(brand);

    var meta = h('div.doc__meta');
    meta.appendChild(h('div.doc__kind', 'Packing list'));
    meta.appendChild(h('div.doc__number', s.reference));
    meta.appendChild(h('div.doc__status', label(s.status)));
    meta.appendChild(h('div.doc__date', 'Order ' + s.order.number));
    if (s.order.poNumber) meta.appendChild(h('div.doc__date', 'Your order ' + s.order.poNumber));
    if (s.dispatchedAt) meta.appendChild(h('div.doc__date', 'Dispatched ' + ui.date(s.dispatchedAt)));
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
    to.appendChild(h('div.doc__label', 'Deliver to'));
    to.appendChild(h('div.doc__party',
      s.order.company ? s.order.company.name : (s.order.contact ? s.order.contact.name : 'Customer')));
    var address = s.shipTo || s.order.shipTo;
    if (address) {
      String(address).split(/\r?\n/).forEach(function (part) {
        if (part.trim()) to.appendChild(h('div.doc__line', part.trim()));
      });
    } else if (s.order.company && s.order.company.country) {
      to.appendChild(h('div.doc__line', s.order.company.country));
    }
    parties.appendChild(to);
    doc.appendChild(parties);

    var terms = h('div.doc__terms');
    [['Carrier', s.carrier], ['Service', s.service], ['Incoterm', s.incoterm],
     ['Tracking', s.trackingNumber], ['Packages', s.packages ? String(s.packages) : ''],
     ['Weight', s.weightKg != null ? s.weightKg + ' kg' : ''],
     ['Dimensions', s.dimensions]].forEach(function (pair) {
      if (!pair[1]) return;
      terms.appendChild(h('div.doc__term', h('div.doc__label', pair[0]), h('div', pair[1])));
    });
    if (terms.childNodes.length) doc.appendChild(terms);

    var table = h('table.doc__table');
    table.appendChild(h('thead', h('tr', h('th', 'Description'), h('th.num', 'Quantity'))));
    var body = h('tbody');
    var total = 0;
    s.items.forEach(function (i) {
      total += i.quantity;
      body.appendChild(h('tr', h('td', i.orderItem.description), h('td.num', String(i.quantity))));
    });
    table.appendChild(body);
    doc.appendChild(table);

    var totals = h('div.doc__totals');
    totals.appendChild(h('div.doc__total.doc__total--grand',
      h('span', 'Total units in this consignment'), h('span', String(total))));
    doc.appendChild(totals);

    /* Say so on the document itself. A consignee holding a part shipment and
       counting it against the order needs to know before they ring. */
    if (!s.orderFullyShipped) {
      doc.appendChild(h('div.doc__notes',
        h('div.doc__label', 'Part shipment'),
        h('p', 'This consignment is part of order ' + s.order.number + '. The balance follows separately.')));
    }

    if (s.notes) {
      doc.appendChild(h('div.doc__notes', h('div.doc__label', 'Notes'), h('p', s.notes)));
    }

    /* No prices anywhere on this document, and internal notes are never
       rendered: it travels with the goods. */
    return doc;
  }
})();
