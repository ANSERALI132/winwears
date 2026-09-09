/* ==========================================================================
   Admin â€” Inventory
   Items, their ledger, and the movements that are the only way a level moves.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  var MOVE_KINDS = [
    { value: 'RECEIPT', text: 'Received from a supplier', direction: 'in' },
    { value: 'ISSUE', text: 'Issued to production', direction: 'out' },
    { value: 'PRODUCTION', text: 'Made on a run', direction: 'in' },
    { value: 'RETURN', text: 'Returned', direction: 'in' },
    { value: 'WRITE_OFF', text: 'Written off', direction: 'out' },
    { value: 'ADJUSTMENT', text: 'Stocktake adjustment', direction: 'either' },
  ];

  function kindOf(value) {
    return MOVE_KINDS.filter(function (k) { return k.value === value; })[0] || MOVE_KINDS[0];
  }

  /** A quantity with its unit, and nothing invented when there is no unit. */
  function qty(value, unit) {
    var n = Number(value) || 0;
    /* Trailing zeroes off a three-place decimal: 12.500 reads as a precision
       nobody measured to. */
    var text = String(Math.round(n * 1000) / 1000);
    return unit ? text + ' ' + unit : text;
  }

  function levelCell(item) {
    var text = qty(item.level.onHand, item.unit);
    if (item.level.negative) {
      return h('span', h('strong', { text: text }), h('span.muted.tiny', { text: '  count is wrong' }));
    }
    if (item.level.low) {
      return h('span', h('strong', { text: text }),
        h('span.muted.tiny', { text: '  at or below ' + qty(item.level.reorderLevel, item.unit) }));
    }
    return h('span', { text: text });
  }

  /* ----------------------------------------------------------- the list -- */

  Admin.route('/stock', {
    title: 'Inventory',
    subtitle: 'What is on hand, and how it got there',
    render: function (mount) {
      var query = Admin.query();
      var state = { q: '', kind: '', low: query.low || '', page: 1, perPage: 50 };

      var card = h('section.card');
      var toolbar = h('div.toolbar');
      var slot = h('div');

      toolbar.appendChild(h('input', {
        type: 'search', placeholder: 'Name or codeâ€¦', 'aria-label': 'Search stock',
        oninput: ui.debounce(function (e) { state.q = e.target.value.trim(); state.page = 1; load(); }, 300),
      }));
      toolbar.appendChild(h('select', {
        'aria-label': 'Filter by kind',
        onchange: function (e) { state.kind = e.target.value; state.page = 1; load(); },
      }, h('option', { value: '' }, 'Everything'),
        h('option', { value: 'MATERIAL' }, 'Materials'),
        h('option', { value: 'FINISHED' }, 'Finished goods')));
      toolbar.appendChild(h('a.btn.btn--accent', { href: '#/stock/new' }, 'Add an item'));
      toolbar.appendChild(h('a.btn.btn--sm', { href: '#/stock/receive' }, 'Record a delivery'));
      toolbar.appendChild(h('a.btn.btn--sm', { href: '#/stock/locations' }, 'Locations'));

      var low = h('input', { type: 'checkbox', checked: Boolean(state.low) });
      var retired = h('input', { type: 'checkbox' });
      function onFilter() {
        state.low = low.checked ? '1' : '';
        state.includeRetired = retired.checked ? '1' : '';
        state.page = 1;
        load();
      }
      low.addEventListener('change', onFilter);
      retired.addEventListener('change', onFilter);

      card.appendChild(toolbar);
      card.appendChild(h('div.chip-row',
        h('label.check', low, h('span', 'Needs ordering')),
        h('label.check', retired, h('span', 'Include retired'))));
      card.appendChild(slot);
      mount.appendChild(card);

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(4));
        return api.get('/api/admin/stock/items' + api.qs(state))
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty(state.low ? 'Nothing needs ordering' : 'No stock items yet',
                state.low
                  ? 'Nothing is at or below its reorder level. Only items with a level set are ever flagged.'
                  : 'An item is something you hold stock of — a material you buy, or finished goods you make. Levels are worked out from the movements you record, never typed in.',
                state.low ? null : h('a.btn.btn--accent', { href: '#/stock/new' }, 'Add an item')));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', 'Code'), h('th', 'Item'), h('th', 'Kind'),
              h('th', 'On hand'), h('th', 'In'), h('th', 'Out'), h('th', 'Reorder at'))));
            var body = h('tbody');
            res.data.forEach(function (i) {
              var tr = h('tr');
              tr.appendChild(h('td', h('a', { href: '#/stock/' + i.id }, i.sku)));
              tr.appendChild(h('td', i.name + (i.active ? '' : ' (retired)')));
              tr.appendChild(h('td', i.kind === 'MATERIAL' ? 'Material' : 'Finished'));
              tr.appendChild(h('td', levelCell(i)));
              tr.appendChild(h('td', qty(i.level.received, i.unit)));
              tr.appendChild(h('td', qty(i.level.issued, i.unit)));
              tr.appendChild(h('td', i.level.reorderLevel == null
                ? h('span.muted', { text: 'None set' })
                : qty(i.level.reorderLevel, i.unit)));
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
    form.appendChild(h('h2.card__title', isNew ? 'Add a stock item' : 'Edit ' + existing.sku));
    form.appendChild(h('p.card__hint',
      'What this is and how it is counted. The quantity on hand is not set here — it comes from the movements you record.'));

    var name = h('input', { type: 'text', value: (existing && existing.name) || '', placeholder: 'PU leather, 1.2mm' });
    var sku = h('input', { type: 'text', value: (existing && existing.sku) || '', placeholder: 'MAT-PU-12' });
    var kind = h('select', {},
      h('option', { value: 'MATERIAL', selected: !existing || existing.kind === 'MATERIAL' }, 'Material — bought and consumed'),
      h('option', { value: 'FINISHED', selected: existing && existing.kind === 'FINISHED' }, 'Finished goods — made and sold'));
    var unit = h('input', { type: 'text', value: (existing && existing.unit) || '', placeholder: 'm, kg, each' });
    var reorderLevel = h('input', {
      type: 'number', min: 0, step: '0.001', placeholder: 'None',
      value: existing && existing.reorderLevel != null ? String(existing.reorderLevel) : '',
    });
    var productSelect = h('select', {}, h('option', { value: '' }, 'Not a catalogue product'));
    var description = h('input', { type: 'text', value: (existing && existing.description) || '' });
    var notes = h('textarea', { rows: 2, value: (existing && existing.notes) || '' });

    form.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Name' }), name),
      h('div.field', h('label.field__label', { text: 'Code' }), sku,
        h('p.field__hint', { text: 'Your own code. Two items sharing one is how the wrong material gets issued.' }))));
    form.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Kind' }), kind),
      h('div.field', h('label.field__label', { text: 'Counted in' }), unit)));
    form.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Warn below' }), reorderLevel,
        h('p.field__hint', { text: 'Leave empty and nothing is flagged. What counts as low is yours to say.' })),
      h('div.field', h('label.field__label', { text: 'Catalogue product' }), productSelect)));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Description' }), description));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Notes' }), notes));

    var save = h('button.btn.btn--accent', { type: 'button' }, isNew ? 'Add the item' : 'Save changes');
    save.addEventListener('click', function () {
      if (!name.value.trim()) { ui.toast('Give the item a name.', 'error'); return; }
      if (!sku.value.trim()) { ui.toast('Give the item a code.', 'error'); return; }

      var payload = {
        name: name.value.trim(),
        sku: sku.value.trim(),
        kind: kind.value,
        unit: unit.value.trim(),
        productId: productSelect.value || undefined,
        reorderLevel: reorderLevel.value === '' ? null : Number(reorderLevel.value),
        description: description.value.trim(),
        notes: notes.value.trim(),
      };

      save.disabled = true;
      (isNew ? api.post('/api/admin/stock/items', payload)
             : api.put('/api/admin/stock/items/' + existing.id, payload))
        .then(function (res) {
          ui.toast(isNew ? 'Item added' : 'Saved', 'ok');
          location.hash = '#/stock/' + res.data.id;
        })
        .catch(function (err) { ui.toast(err.message, 'error'); save.disabled = false; });
    });
    form.appendChild(h('div.card__foot', save, h('a.btn.btn--sm', { href: '#/stock' }, 'Cancel')));
    mount.appendChild(form);

    api.get('/api/admin/products?perPage=200').then(function (res) {
      res.data.forEach(function (p) {
        productSelect.appendChild(h('option', {
          value: p.id, selected: existing && existing.productId === p.id,
        }, p.productName));
      });
    }).catch(function () { /* an item need not be a catalogue product */ });
  }

  Admin.route('/stock/new', {
    title: 'Add a stock item',
    subtitle: 'Something you hold stock of',
    render: function (mount) { builder(mount, null); },
  });

  Admin.route('/stock/:id/edit', {
    title: 'Edit stock item',
    subtitle: 'What it is, not how much there is',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));
      return api.get('/api/admin/stock/items/' + encodeURIComponent(params.id)).then(function (res) {
        ui.clear(mount);
        builder(mount, res.data);
      });
    },
  });

  /* ------------------------------------------------------- one, and its ledger -- */

  Admin.route('/stock/:id', {
    title: 'Stock item',
    subtitle: 'What is on hand, and every movement behind it',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));

      return Promise.all([
        api.get('/api/admin/stock/items/' + encodeURIComponent(params.id)),
        api.get('/api/admin/stock/locations').catch(function () { return { data: [] }; }),
      ]).then(function (results) {
        var item = results[0].data;
        var locations = (results[1].data || []).filter(function (l) { return l.active; });
        ui.clear(mount);

        mount.appendChild(h('a.btn.btn--sm', { href: '#/stock' }, 'â† All stock'));
        mount.appendChild(h('div.chip-row',
          h('a.btn.btn--sm', { href: '#/stock/' + item.id + '/edit' }, 'Edit')));

        mount.appendChild(summaryCard(item));
        mount.appendChild(moveCard(item, locations));
        mount.appendChild(ledgerCard(item));
      });
    },
  });

  function summaryCard(item) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', item.sku + ' â€” ' + item.name));
    if (item.description) card.appendChild(h('p.card__hint', item.description));

    var totals = h('div.totals');
    totals.appendChild(h('div.totals__row', h('span', 'Total in'), h('span', qty(item.level.received, item.unit))));
    totals.appendChild(h('div.totals__row', h('span', 'Total out'), h('span', qty(item.level.issued, item.unit))));
    totals.appendChild(h('div.totals__row.totals__row--grand',
      h('span', 'On hand'), h('span', qty(item.level.onHand, item.unit))));
    card.appendChild(totals);

    if (item.level.negative) {
      card.appendChild(ui.notice('error',
        'The ledger says there is less than nothing here, which cannot be true. Something was issued that was never recorded as received — record a stocktake adjustment saying so.'));
    } else if (item.level.low) {
      card.appendChild(ui.notice('warn',
        'At or below the reorder level of ' + qty(item.level.reorderLevel, item.unit) + '.'));
    }

    var facts = h('div.grid.grid--2');
    function fact(name, value) {
      facts.appendChild(h('div.field', h('div.field__label', { text: name }), h('div', value)));
    }
    fact('Kind', item.kind === 'MATERIAL' ? 'Material' : 'Finished goods');
    fact('Counted in', item.unit || h('span.muted', { text: 'Not set' }));
    fact('Reorder at', item.level.reorderLevel == null
      ? h('span.muted', { text: 'No level set — nothing is flagged' })
      : qty(item.level.reorderLevel, item.unit));
    fact('Catalogue product', item.product
      ? h('a', { href: '#/products/' + item.product.id }, item.product.productName)
      : h('span.muted', { text: 'Not linked' }));
    card.appendChild(facts);

    if (item.notes) card.appendChild(h('p', { text: item.notes }));
    return card;
  }

  /* ---------------------------------------------------------- a movement -- */

  function moveCard(item, locations) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'Record a movement'));
    card.appendChild(h('p.card__hint',
      'The only way this level changes. Which way it goes comes from what kind of movement it is, so an issue can never be entered as an increase.'));

    var kind = h('select', {}, MOVE_KINDS.map(function (k) { return h('option', { value: k.value }, k.text); }));
    var quantity = h('input', { type: 'number', step: '0.001', placeholder: '0' });
    var locationSelect = h('select', {}, h('option', { value: '' }, 'No location'));
    locations.forEach(function (l) { locationSelect.appendChild(h('option', { value: l.id }, l.name)); });
    var runSelect = h('select', {}, h('option', { value: '' }, 'Not against a run'));
    var reference = h('input', { type: 'text', placeholder: 'Delivery note, invoice, stocktake sheet' });
    var note = h('input', { type: 'text', placeholder: 'Anything worth knowing' });
    var occurredAt = h('input', { type: 'date' });

    var direction = h('p.field__hint');
    var noteField = h('div.field', h('label.field__label', { text: 'Note' }), note);

    function refreshDirection() {
      var k = kindOf(kind.value);
      if (k.direction === 'in') {
        direction.textContent = 'Adds to stock. Enter how many — the sign is set for you.';
        quantity.min = '0';
      } else if (k.direction === 'out') {
        direction.textContent = 'Takes away from stock. Enter how many — the sign is set for you.';
        quantity.min = '0';
      } else {
        direction.textContent = 'A correction, so this one is signed: negative if the count was over, positive if it was under. A reason is required.';
        quantity.removeAttribute('min');
      }
      var label = noteField.querySelector('.field__label');
      label.textContent = k.direction === 'either' ? 'Reason (required)' : 'Note';
    }
    kind.addEventListener('change', refreshDirection);

    var record = h('button.btn.btn--accent', { type: 'button' }, 'Record it');
    record.addEventListener('click', function () {
      var k = kindOf(kind.value);
      var value = Number(quantity.value);
      if (!value) { ui.toast('Enter a quantity.', 'error'); return; }
      if (k.direction === 'either' && !note.value.trim()) {
        ui.toast('An adjustment needs a reason.', 'error');
        return;
      }

      record.disabled = true;
      api.post('/api/admin/stock/movements', {
        itemId: item.id,
        kind: kind.value,
        quantity: value,
        locationId: locationSelect.value || undefined,
        runId: runSelect.value || undefined,
        reference: reference.value.trim(),
        note: note.value.trim(),
        occurredAt: occurredAt.value || undefined,
      })
        .then(function () { ui.toast('Recorded', 'ok'); Admin.refresh(); })
        .catch(function (err) { ui.toast(err.message, 'error'); record.disabled = false; });
    });

    card.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'What happened' }), kind, direction),
      h('div.field', h('label.field__label', { text: 'How many' + (item.unit ? ' (' + item.unit + ')' : '') }), quantity)));
    card.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Location' }), locationSelect),
      h('div.field', h('label.field__label', { text: 'Production run' }), runSelect),
      h('div.field', h('label.field__label', { text: 'Reference' }), reference),
      h('div.field', h('label.field__label', { text: 'Date' }), occurredAt)));
    card.appendChild(noteField);
    card.appendChild(h('div.card__foot', record));

    refreshDirection();

    api.get('/api/admin/production/runs?perPage=100').then(function (res) {
      res.data.forEach(function (r) {
        runSelect.appendChild(h('option', { value: r.id }, r.reference + ' — ' + r.title));
      });
    }).catch(function () { /* a movement need not belong to a run */ });

    return card;
  }

  /* ------------------------------------------------------------- ledger -- */

  function ledgerCard(item) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'Ledger'));

    if (!item.movements.length) {
      card.appendChild(h('p.muted', { text: 'Nothing has moved yet. The level above is zero because nothing has been recorded, not because the count is zero.' }));
      return card;
    }

    card.appendChild(h('p.card__hint',
      'Written once and never edited. A mistake is corrected by an adjustment that says what it is correcting, so both stay on the record.'));

    var table = h('table.table');
    table.appendChild(h('thead', h('tr',
      h('th', 'When'), h('th', 'What'), h('th', 'Quantity'),
      h('th', 'Location'), h('th', 'Against'), h('th', 'Reference'), h('th', 'By'), h('th', 'Note'))));
    var body = h('tbody');
    item.movements.forEach(function (m) {
      var signed = (m.quantity > 0 ? '+' : '') + qty(m.quantity, item.unit);
      body.appendChild(h('tr',
        h('td', ui.date(m.occurredAt)),
        h('td', m.kindLabel),
        h('td', signed),
        h('td', m.location ? m.location.name : 'â€”'),
        h('td', m.run
          ? h('a', { href: '#/production/' + m.run.id }, m.run.reference)
          : (m.order ? h('a', { href: '#/orders/' + m.order.id }, m.order.number) : 'â€”')),
        h('td', m.reference || 'â€”'),
        h('td', m.recordedBy ? m.recordedBy.name : 'â€”'),
        h('td', m.note || 'â€”')));
    });
    table.appendChild(body);
    card.appendChild(table);
    return card;
  }

  /* ---------------------------------------------------------- a delivery -- */

  Admin.route('/stock/receive', {
    title: 'Record a delivery',
    subtitle: 'Several items at once, written together or not at all',
    render: function (mount) {
      var items = [];
      var lines = [{ itemId: '', quantity: '', note: '' }];

      var form = h('section.card');
      form.appendChild(h('h2.card__title', 'Record a delivery'));
      form.appendChild(h('p.card__hint',
        'One kind of movement across several items. Everything goes on the ledger together, because half a delivery recorded is worse than none of it.'));

      var kind = h('select', {}, MOVE_KINDS
        .filter(function (k) { return k.value !== 'ADJUSTMENT'; })
        .map(function (k) { return h('option', { value: k.value }, k.text); }));
      var locationSelect = h('select', {}, h('option', { value: '' }, 'No location'));
      var runSelect = h('select', {}, h('option', { value: '' }, 'Not against a run'));
      var reference = h('input', { type: 'text', placeholder: 'Delivery note number' });
      var occurredAt = h('input', { type: 'date' });

      var linesWrap = h('div.lines');

      function drawLines() {
        ui.clear(linesWrap);
        lines.forEach(function (line, index) {
          var row = h('div.line');

          var picker = h('select', { 'aria-label': 'Item' }, h('option', { value: '' }, 'Pick an item…'));
          items.forEach(function (i) {
            picker.appendChild(h('option', {
              value: i.id, selected: line.itemId === i.id,
            }, i.sku + ' — ' + i.name + (i.unit ? ' (' + i.unit + ')' : '')));
          });
          picker.addEventListener('change', function () { line.itemId = picker.value; });

          var quantity = h('input', { type: 'number', min: 0, step: '0.001', value: line.quantity, placeholder: '0', 'aria-label': 'Quantity' });
          quantity.addEventListener('input', function () { line.quantity = quantity.value; });

          var note = h('input', { type: 'text', value: line.note, placeholder: 'Note', 'aria-label': 'Note' });
          note.addEventListener('input', function () { line.note = note.value; });

          var remove = h('button.btn.btn--sm.btn--danger', {
            type: 'button', 'aria-label': 'Remove this line',
            onclick: function () {
              if (lines.length === 1) { ui.toast('A delivery needs at least one line.', 'error'); return; }
              lines.splice(index, 1);
              drawLines();
            },
          }, 'Ã—');

          row.appendChild(h('div.line__desc', picker));
          row.appendChild(quantity);
          row.appendChild(note);
          row.appendChild(remove);
          linesWrap.appendChild(row);
        });
      }

      form.appendChild(h('div.grid.grid--2',
        h('div.field', h('label.field__label', { text: 'What happened' }), kind),
        h('div.field', h('label.field__label', { text: 'Reference' }), reference),
        h('div.field', h('label.field__label', { text: 'Location' }), locationSelect),
        h('div.field', h('label.field__label', { text: 'Production run' }), runSelect),
        h('div.field', h('label.field__label', { text: 'Date' }), occurredAt)));
      form.appendChild(h('h3.card__subtitle', 'Lines'));
      form.appendChild(linesWrap);
      form.appendChild(h('button.btn.btn--sm', {
        type: 'button',
        onclick: function () { lines.push({ itemId: '', quantity: '', note: '' }); drawLines(); },
      }, 'Add a line'));

      var save = h('button.btn.btn--accent', { type: 'button' }, 'Record it');
      save.addEventListener('click', function () {
        var payload = lines
          .filter(function (l) { return l.itemId && Number(l.quantity) > 0; })
          .map(function (l) {
            return { itemId: l.itemId, quantity: Number(l.quantity), note: String(l.note || '').trim() };
          });

        if (!payload.length) { ui.toast('Add at least one item with a quantity.', 'error'); return; }

        save.disabled = true;
        api.post('/api/admin/stock/movements/bulk', {
          kind: kind.value,
          locationId: locationSelect.value || undefined,
          runId: runSelect.value || undefined,
          reference: reference.value.trim(),
          occurredAt: occurredAt.value || undefined,
          lines: payload,
        })
          .then(function (res) {
            ui.toast(res.data.length + ' items updated', 'ok');
            location.hash = '#/stock';
          })
          .catch(function (err) { ui.toast(err.message, 'error'); save.disabled = false; });
      });
      form.appendChild(h('div.card__foot', save, h('a.btn.btn--sm', { href: '#/stock' }, 'Cancel')));
      mount.appendChild(form);
      drawLines();

      api.get('/api/admin/stock/items?perPage=200').then(function (res) {
        items = res.data;
        drawLines();
      }).catch(function () {});
      api.get('/api/admin/stock/locations').then(function (res) {
        res.data.filter(function (l) { return l.active; }).forEach(function (l) {
          locationSelect.appendChild(h('option', { value: l.id }, l.name));
        });
      }).catch(function () {});
      api.get('/api/admin/production/runs?perPage=100').then(function (res) {
        res.data.forEach(function (r) {
          runSelect.appendChild(h('option', { value: r.id }, r.reference + ' — ' + r.title));
        });
      }).catch(function () {});
    },
  });

  /* --------------------------------------------------------- locations -- */

  Admin.route('/stock/locations', {
    title: 'Stock locations',
    subtitle: 'Where stock sits',
    render: function (mount) {
      var card = h('section.card');
      card.appendChild(h('h2.card__title', 'Your locations'));
      card.appendChild(h('p.card__hint',
        'Optional. A single-site factory may never need more than one, so nothing is created for you — a warehouse hierarchy invented for a business with one room is furniture nobody asked for.'));
      var slot = h('div');
      card.appendChild(slot);
      mount.appendChild(card);
      mount.appendChild(newLocationCard(load));

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(3));
        return api.get('/api/admin/stock/locations')
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty('No locations',
                'Stock movements work perfectly well without them. Add one below if it matters where things sit.'));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', 'Location'), h('th', 'Description'), h('th', 'Movements'), h('th', 'In use'), h('th'))));
            var body = h('tbody');
            res.data.forEach(function (l) {
              var tr = h('tr');
              tr.appendChild(h('td', l.name));
              tr.appendChild(h('td', l.description || 'â€”'));
              tr.appendChild(h('td', String(l._count ? l._count.movements : 0)));
              tr.appendChild(h('td', l.active ? 'Yes' : 'Retired'));

              var cell = h('td.cell-actions');
              cell.appendChild(h('button.btn.btn--sm', {
                type: 'button',
                onclick: function () {
                  api.put('/api/admin/stock/locations/' + l.id, { active: !l.active })
                    .then(function () { ui.toast(l.active ? 'Retired' : 'Back in use', 'ok'); load(); })
                    .catch(function (err) { ui.toast(err.message, 'error'); });
                },
              }, l.active ? 'Retire' : 'Reinstate'));
              cell.appendChild(h('button.btn.btn--sm.btn--danger', {
                type: 'button',
                onclick: function () {
                  ui.modal({
                    title: 'Delete ' + l.name + '?',
                    danger: true,
                    confirmLabel: 'Delete',
                    message: 'Only a location nothing has moved through can be deleted. Otherwise retire it, and the history stays intact.',
                  }).then(function (ok) {
                    if (!ok) return;
                    api.del('/api/admin/stock/locations/' + l.id)
                      .then(function () { ui.toast('Location deleted', 'ok'); load(); })
                      .catch(function (err) { ui.toast(err.message, 'error'); });
                  });
                },
              }, 'Delete'));
              tr.appendChild(cell);
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

  function newLocationCard(reload) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'Add a location'));

    var name = h('input', { type: 'text', placeholder: 'Finished goods store' });
    var description = h('input', { type: 'text', placeholder: 'What is kept here' });
    var displayOrder = h('input', { type: 'number', min: 0, step: 1, value: '0' });

    var add = h('button.btn.btn--accent', { type: 'button' }, 'Add location');
    add.addEventListener('click', function () {
      if (!name.value.trim()) { ui.toast('Give the location a name.', 'error'); return; }
      add.disabled = true;
      api.post('/api/admin/stock/locations', {
        name: name.value.trim(),
        description: description.value.trim(),
        displayOrder: Number(displayOrder.value) || 0,
      })
        .then(function () {
          ui.toast('Location added', 'ok');
          name.value = ''; description.value = '';
          add.disabled = false;
          reload();
        })
        .catch(function (err) { ui.toast(err.message, 'error'); add.disabled = false; });
    });

    card.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Name' }), name),
      h('div.field', h('label.field__label', { text: 'Position' }), displayOrder)));
    card.appendChild(h('div.field', h('label.field__label', { text: 'Description' }), description));
    card.appendChild(h('div.card__foot', add));
    return card;
  }
})();
