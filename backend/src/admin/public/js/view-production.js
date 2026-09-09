/* ==========================================================================
   Admin — Manufacturing
   Production runs, what came off the line, and the factory's own stages.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  var label = Admin.doc.label;

  var STATUSES = ['PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];

  function dateInput(value) {
    return value ? new Date(value).toISOString().slice(0, 10) : '';
  }

  /** A bar is the fastest way to read "how far along" across twenty rows.
   *  Width comes from output that was recorded, never from the stage. */
  function progressBar(p) {
    var bar = h('div.bar', { title: p.good + ' of ' + p.planned + ' made' });
    bar.appendChild(h('div.bar__fill', { style: 'width:' + Math.min(100, p.percent) + '%' }));
    return h('div.bar__wrap',
      bar,
      h('span.bar__text', { text: p.good + ' / ' + p.planned + (p.rejected ? '  (' + p.rejected + ' rejected)' : '') }));
  }

  /* ------------------------------------------------------------ the runs -- */

  Admin.route('/production', {
    title: 'Production',
    subtitle: 'What the factory is making',
    render: function (mount) {
      var query = Admin.query();
      var state = {
        q: '',
        status: query.status || '',
        late: query.late || '',
        page: 1,
        perPage: 25,
      };

      var card = h('section.card');
      var toolbar = h('div.toolbar');
      var slot = h('div');

      toolbar.appendChild(h('input', {
        type: 'search', placeholder: 'Run, order or customer…', 'aria-label': 'Search production runs',
        oninput: ui.debounce(function (e) { state.q = e.target.value.trim(); state.page = 1; load(); }, 300),
      }));

      var statusSelect = h('select', {
        'aria-label': 'Filter by status',
        onchange: function (e) { state.status = e.target.value; state.page = 1; load(); },
      }, h('option', { value: '' }, 'All statuses'),
        STATUSES.map(function (s) { return h('option', { value: s }, label(s)); }));
      statusSelect.value = state.status;
      toolbar.appendChild(statusSelect);

      var stageSelect = h('select', {
        'aria-label': 'Filter by stage',
        onchange: function (e) { state.stageId = e.target.value; state.page = 1; load(); },
      }, h('option', { value: '' }, 'Any stage'));
      toolbar.appendChild(stageSelect);

      toolbar.appendChild(h('a.btn.btn--accent', { href: '#/production/new' }, 'Plan a run'));
      toolbar.appendChild(h('a.btn.btn--sm', { href: '#/production/stages' }, 'Stages'));

      var late = h('input', { type: 'checkbox', checked: Boolean(state.late) });
      late.addEventListener('change', function () {
        state.late = late.checked ? '1' : '';
        state.page = 1;
        load();
      });
      var filters = h('div.chip-row', h('label.check', late, h('span', 'Past its date')));

      card.appendChild(toolbar);
      card.appendChild(filters);
      card.appendChild(slot);
      ui.clear(mount).appendChild(card);

      api.get('/api/admin/production/stages').then(function (res) {
        res.data.filter(function (s) { return s.active; }).forEach(function (s) {
          stageSelect.appendChild(h('option', { value: s.id }, s.name));
        });
      }).catch(function () { /* the list still works without the filter */ });

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(4));
        return api.get('/api/admin/production/runs' + api.qs(state))
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty('Nothing in production',
                'A run is the factory’s answer to an order line: this many of this, by this date. Plan one against an order, or on its own for stock.',
                h('a.btn.btn--accent', { href: '#/production/new' }, 'Plan a run')));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', 'Run'), h('th', 'What'), h('th', 'Order'), h('th', 'Progress'),
              h('th', 'Stage'), h('th', 'Status'), h('th', 'Due'))));
            var body = h('tbody');
            res.data.forEach(function (r) {
              var tr = h('tr');
              tr.appendChild(h('td', h('a', { href: '#/production/' + r.id }, r.reference)));
              tr.appendChild(h('td', r.title));
              tr.appendChild(h('td', r.order
                ? h('a', { href: '#/orders/' + r.order.id }, r.order.number)
                : h('span.muted', { text: 'Stock' })));
              tr.appendChild(h('td', progressBar(r.progress)));
              tr.appendChild(h('td', r.currentStage ? r.currentStage.name : h('span.muted', { text: 'Not started' })));
              tr.appendChild(h('td', ui.statusPill(r.status)));
              tr.appendChild(h('td', r.plannedEnd ? ui.date(r.plannedEnd) : '—'));
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
    var orders = [];
    var lines = [];

    var form = h('section.card');
    form.appendChild(h('h2.card__title', isNew ? 'Plan a production run' : 'Edit ' + existing.reference));
    form.appendChild(h('p.card__hint',
      'What is being made, how many, and by when. Progress is recorded as it comes off the line, not assumed from where the run is sitting.'));

    var title = h('input', { type: 'text', value: (existing && existing.title) || '', placeholder: 'Hybrid Pro, club crest, size 5' });
    var quantityPlanned = h('input', { type: 'number', min: 1, step: 1, value: existing ? String(existing.quantityPlanned) : '' });
    var orderSelect = h('select', {}, h('option', { value: '' }, 'Stock — not against an order'));
    var lineSelect = h('select', {}, h('option', { value: '' }, 'The whole order'));
    var ownerSelect = h('select', {}, h('option', { value: '' }, 'Nobody yet'));
    var plannedStart = h('input', { type: 'date', value: dateInput(existing && existing.plannedStart) });
    var plannedEnd = h('input', { type: 'date', value: dateInput(existing && existing.plannedEnd) });
    var notes = h('textarea', { rows: 3, value: (existing && existing.notes) || '' });

    /* Picking a line fills in what it is and how many, because that is what
       the customer bought. Both stay editable: a run is often a part batch. */
    function drawLines() {
      ui.clear(lineSelect);
      lineSelect.appendChild(h('option', { value: '' }, 'The whole order'));
      lines.forEach(function (l) {
        lineSelect.appendChild(h('option', {
          value: l.id, selected: existing && existing.orderItemId === l.id,
        }, l.description + ' (' + l.quantity + ')'));
      });
    }

    lineSelect.addEventListener('change', function () {
      var chosen = lines.filter(function (l) { return l.id === lineSelect.value; })[0];
      if (!chosen) return;
      if (!title.value.trim()) title.value = chosen.description;
      if (!quantityPlanned.value) quantityPlanned.value = String(chosen.quantity);
    });

    orderSelect.addEventListener('change', function () {
      lines = [];
      drawLines();
      if (!orderSelect.value) return;
      api.get('/api/admin/orders/' + orderSelect.value).then(function (res) {
        lines = res.data.items || [];
        drawLines();
      }).catch(function () { /* the run can still be raised without a line */ });
    });

    form.appendChild(h('div.field', h('label.field__label', { text: 'What is being made' }), title));
    form.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Against which order' }), orderSelect),
      h('div.field', h('label.field__label', { text: 'Which line' }), lineSelect)));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Quantity to make' }), quantityPlanned));
    form.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Planned start' }), plannedStart),
      h('div.field', h('label.field__label', { text: 'Due' }), plannedEnd)));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Supervisor' }), ownerSelect));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Notes' }), notes));

    var save = h('button.btn.btn--accent', { type: 'button' }, isNew ? 'Plan the run' : 'Save changes');
    save.addEventListener('click', function () {
      if (!title.value.trim()) { ui.toast('Say what is being made.', 'error'); return; }
      if (!Number(quantityPlanned.value)) { ui.toast('A run needs a quantity.', 'error'); return; }

      var payload = {
        title: title.value.trim(),
        quantityPlanned: Number(quantityPlanned.value),
        orderId: orderSelect.value || undefined,
        orderItemId: lineSelect.value || undefined,
        ownerId: ownerSelect.value || undefined,
        plannedStart: plannedStart.value || undefined,
        plannedEnd: plannedEnd.value || undefined,
        notes: notes.value.trim(),
      };

      save.disabled = true;
      (isNew ? api.post('/api/admin/production/runs', payload)
             : api.put('/api/admin/production/runs/' + existing.id, payload))
        .then(function (res) {
          ui.toast(isNew ? 'Run planned' : 'Saved', 'ok');
          location.hash = '#/production/' + res.data.id;
        })
        .catch(function (err) { ui.toast(err.message, 'error'); save.disabled = false; });
    });
    form.appendChild(h('div.card__foot', save, h('a.btn.btn--sm', { href: '#/production' }, 'Cancel')));

    mount.appendChild(form);

    api.get('/api/admin/orders?perPage=100').then(function (res) {
      orders = res.data;
      orders.forEach(function (o) {
        orderSelect.appendChild(h('option', {
          value: o.id, selected: existing && existing.orderId === o.id,
        }, o.number + ' — ' + (o.company ? o.company.name : 'no account')));
      });
      if (existing && existing.orderId) {
        api.get('/api/admin/orders/' + existing.orderId).then(function (r) {
          lines = r.data.items || [];
          drawLines();
        }).catch(function () {});
      }
    }).catch(function () { /* a stock run needs no order */ });

    api.get('/api/admin/users').then(function (res) {
      res.data.forEach(function (u) {
        ownerSelect.appendChild(h('option', {
          value: u.id, selected: existing && existing.ownerId === u.id,
        }, u.name));
      });
    }).catch(function () { /* an unassigned run is itself worth reporting */ });
  }

  Admin.route('/production/new', {
    title: 'Plan a run',
    subtitle: 'What the factory is committing to make',
    render: function (mount) { ui.clear(mount); builder(mount, null); },
  });

  Admin.route('/production/:id/edit', {
    title: 'Edit run',
    subtitle: 'A finished run is not reopened',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));
      return api.get('/api/admin/production/runs/' + encodeURIComponent(params.id)).then(function (res) {
        var r = res.data;
        ui.clear(mount);
        if (r.status === 'COMPLETED' || r.status === 'CANCELLED') {
          mount.appendChild(ui.notice('info',
            'This run is ' + r.status.toLowerCase() + ' and cannot be changed. Raise a new one instead, so what it made survives.'));
          mount.appendChild(h('a.btn.btn--sm', { href: '#/production/' + r.id }, 'â† Back'));
          return;
        }
        builder(mount, r);
      });
    },
  });

  /* --------------------------------------------------------- one, read -- */

  Admin.route('/production/:id', {
    title: 'Production run',
    subtitle: 'What is being made, how far along, and where',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));

      return Promise.all([
        api.get('/api/admin/production/runs/' + encodeURIComponent(params.id)),
        api.get('/api/admin/production/stages').catch(function () { return { data: [] }; }),
      ]).then(function (results) {
        var r = results[0].data;
        var stages = (results[1].data || []).filter(function (s) { return s.active; });
        ui.clear(mount);

        mount.appendChild(h('a.btn.btn--sm', { href: '#/production' }, 'â† All runs'));

        var actions = h('div.chip-row');
        if (r.status !== 'COMPLETED' && r.status !== 'CANCELLED') {
          actions.appendChild(h('a.btn.btn--sm', { href: '#/production/' + r.id + '/edit' }, 'Edit'));
        }
        r.allowedNext.forEach(function (s) {
          actions.appendChild(h('button.btn.btn--sm' + (s === 'CANCELLED' ? '.btn--danger' : ''), {
            type: 'button',
            onclick: function () { moveStatus(r, s); },
          }, label(s) === 'In progress' ? 'Start work' : 'Mark ' + label(s).toLowerCase()));
        });
        mount.appendChild(actions);

        mount.appendChild(summaryCard(r));
        mount.appendChild(stageCard(r, stages));
        mount.appendChild(outputCard(r, stages));
        mount.appendChild(inspectionsCard(r));
        mount.appendChild(Admin.documentsCard('production run', r.id, {
          hint: 'The artwork being worked to, a cutting sheet, a photograph from the floor.',
        }));
        mount.appendChild(historyCard(r));
      });
    },
  });

  function summaryCard(r) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', r.reference + ' — ' + r.title));

    var facts = h('div.grid.grid--2');
    function fact(name, value) {
      facts.appendChild(h('div.field', h('div.field__label', { text: name }), h('div', value)));
    }
    fact('Status', ui.statusPill(r.status));
    fact('Stage', r.currentStage ? r.currentStage.name : h('span.muted', { text: 'Not started' }));
    fact('Order', r.order
      ? h('a', { href: '#/orders/' + r.order.id }, r.order.number + (r.order.company ? ' — ' + r.order.company.name : ''))
      : h('span.muted', { text: 'Stock — not against an order' }));
    fact('Line', r.orderItem ? r.orderItem.description : h('span.muted', { text: 'The whole order' }));
    fact('Supervisor', r.owner ? r.owner.name : h('span.muted', { text: 'Nobody assigned' }));
    fact('Due', r.plannedEnd ? ui.date(r.plannedEnd) : h('span.muted', { text: 'No date set' }));
    fact('Started', r.actualStart ? ui.dateTime(r.actualStart) : h('span.muted', { text: 'Not yet' }));
    fact('Finished', r.actualEnd ? ui.dateTime(r.actualEnd) : h('span.muted', { text: 'Not yet' }));
    card.appendChild(facts);

    var totals = h('div.totals');
    totals.appendChild(h('div.totals__row', h('span', 'Planned'), h('span', String(r.progress.planned))));
    totals.appendChild(h('div.totals__row', h('span', 'Made and passed'), h('span', String(r.progress.good))));
    totals.appendChild(h('div.totals__row', h('span', 'Rejected'),
      h('span', r.progress.rejected + (r.progress.rejected ? '  (' + r.progress.rejectRate + '%)' : ''))));
    totals.appendChild(h('div.totals__row.totals__row--grand',
      h('span', r.progress.overrun ? 'Overrun by' : 'Still to make'),
      h('span', String(r.progress.overrun ? r.progress.good - r.progress.planned : r.progress.remaining))));
    card.appendChild(totals);
    card.appendChild(progressBar(r.progress));

    if (r.notes) card.appendChild(h('p', { text: r.notes }));
    if (r.status === 'CANCELLED' && r.cancelReason) {
      card.appendChild(ui.notice('info', 'Cancelled: ' + r.cancelReason));
    }
    return card;
  }

  function moveStatus(run, status) {
    if (status !== 'CANCELLED') {
      api.patch('/api/admin/production/runs/' + run.id + '/status', { status: status })
        .then(function () { ui.toast('Marked ' + label(status).toLowerCase(), 'ok'); Admin.refresh(); })
        .catch(function (err) { ui.toast(err.message, 'error'); });
      return;
    }

    var reason = h('textarea', { rows: 3, placeholder: 'Why is this run being cancelled?' });
    ui.modal({
      title: 'Cancel run ' + run.reference + '?',
      danger: true,
      confirmLabel: 'Cancel the run',
      cancelLabel: 'Leave it open',
      body: h('div',
        h('p', { text: 'Anything already recorded as made stays on record. Nothing is deleted.' }),
        h('div.field', h('label.field__label', { text: 'Reason' }), reason)),
    }).then(function (ok) {
      if (!ok) return;
      if (!reason.value.trim()) { ui.toast('A cancellation needs a reason.', 'error'); return; }
      api.patch('/api/admin/production/runs/' + run.id + '/status', { status: 'CANCELLED', reason: reason.value.trim() })
        .then(function () { ui.toast('Run cancelled', 'ok'); Admin.refresh(); })
        .catch(function (err) { ui.toast(err.message, 'error'); });
    });
  }

  /* ------------------------------------------------------------- stages -- */

  function stageCard(r, stages) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'Where it is'));

    if (!stages.length) {
      card.appendChild(ui.empty('No stages defined',
        'A stage is a step in your process — cutting, printing, stitching, whatever this factory actually does. Nothing is assumed for you.',
        h('a.btn.btn--accent', { href: '#/production/stages' }, 'Define your stages')));
      return card;
    }

    if (r.status === 'COMPLETED' || r.status === 'CANCELLED') {
      card.appendChild(h('p.muted', {
        text: 'This run is ' + r.status.toLowerCase() + ', so it is not moving anywhere.',
      }));
      return card;
    }

    var row = h('div.chip-row');
    stages.forEach(function (s) {
      var here = r.currentStageId === s.id;
      row.appendChild(h('button.btn.btn--sm' + (here ? '.btn--accent' : ''), {
        type: 'button',
        disabled: here,
        onclick: function () {
          api.patch('/api/admin/production/runs/' + r.id + '/stage', { stageId: s.id })
            .then(function () { ui.toast('Moved to ' + s.name, 'ok'); Admin.refresh(); })
            .catch(function (err) { ui.toast(err.message, 'error'); });
        },
      }, s.name));
    });
    card.appendChild(row);
    card.appendChild(h('p.card__hint',
      'Moving a card does not make anything. Record what came off the line below.'));
    return card;
  }

  /* ------------------------------------------------------------- output -- */

  function outputCard(r, stages) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'What came off the line'));
    card.appendChild(h('p.card__hint',
      'The only thing that moves this run’s progress. Rejected units are counted apart from good ones, so a run that made its number twice over because half of it failed does not look like a run that went well.'));

    if (r.outputs.length) {
      var table = h('table.table');
      table.appendChild(h('thead', h('tr',
        h('th', 'Recorded'), h('th', 'Passed'), h('th', 'Rejected'),
        h('th', 'Stage'), h('th', 'By'), h('th', 'Note'), h('th'))));
      var body = h('tbody');
      r.outputs.forEach(function (o) {
        var tr = h('tr');
        tr.appendChild(h('td', ui.date(o.recordedAt)));
        tr.appendChild(h('td', String(o.quantityGood)));
        tr.appendChild(h('td', String(o.quantityRejected)));
        tr.appendChild(h('td', o.stage ? o.stage.name : '—'));
        tr.appendChild(h('td', o.recordedBy ? o.recordedBy.name : '—'));
        tr.appendChild(h('td', o.note || '—'));
        tr.appendChild(h('td', h('button.btn.btn--sm.btn--danger', {
          type: 'button',
          onclick: function () { removeOutput(r, o); },
        }, 'Remove')));
        body.appendChild(tr);
      });
      table.appendChild(body);
      card.appendChild(table);
    }

    if (r.status === 'CANCELLED') {
      card.appendChild(h('p.muted', { text: 'This run was cancelled. Nothing more can be recorded against it.' }));
      return card;
    }
    if (r.status === 'PLANNED') {
      card.appendChild(ui.notice('info',
        'This run has not started. Start it first, so the date it began is the date work actually began.'));
      return card;
    }

    var good = h('input', { type: 'number', min: 0, step: 1, placeholder: '0' });
    var rejected = h('input', { type: 'number', min: 0, step: 1, placeholder: '0' });
    var stageSelect = h('select', {}, h('option', { value: '' }, r.currentStage ? 'Where it is now (' + r.currentStage.name + ')' : 'No stage'));
    stages.forEach(function (s) { stageSelect.appendChild(h('option', { value: s.id }, s.name)); });
    var recordedAt = h('input', { type: 'date' });
    var note = h('input', { type: 'text', placeholder: 'Anything worth knowing' });

    var record = h('button.btn.btn--accent', { type: 'button' }, 'Record it');
    record.addEventListener('click', function () {
      var g = Number(good.value) || 0;
      var b = Number(rejected.value) || 0;
      if (g <= 0 && b <= 0) {
        ui.toast('Record how many passed, how many failed, or both.', 'error');
        return;
      }
      record.disabled = true;
      api.post('/api/admin/production/runs/' + r.id + '/output', {
        quantityGood: g,
        quantityRejected: b,
        stageId: stageSelect.value || undefined,
        recordedAt: recordedAt.value || undefined,
        note: note.value.trim(),
      })
        .then(function () { ui.toast('Recorded', 'ok'); Admin.refresh(); })
        .catch(function (err) { ui.toast(err.message, 'error'); record.disabled = false; });
    });

    card.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Passed' }), good),
      h('div.field', h('label.field__label', { text: 'Rejected' }), rejected),
      h('div.field', h('label.field__label', { text: 'Stage' }), stageSelect),
      h('div.field', h('label.field__label', { text: 'Date' }), recordedAt)));
    card.appendChild(h('div.field', h('label.field__label', { text: 'Note' }), note));
    card.appendChild(h('div.card__foot', record));
    return card;
  }

  function removeOutput(run, entry) {
    ui.modal({
      title: 'Remove this entry?',
      danger: true,
      confirmLabel: 'Remove it',
      body: h('div',
        h('p', { text: 'Do this only to correct a miscount. It does not un-make anything.' }),
        h('p.muted', { text: entry.quantityGood + ' passed, ' + entry.quantityRejected + ' rejected, recorded ' + ui.date(entry.recordedAt) })),
    }).then(function (ok) {
      if (!ok) return;
      api.del('/api/admin/production/runs/' + run.id + '/output/' + entry.id)
        .then(function () { ui.toast('Entry removed', 'ok'); Admin.refresh(); })
        .catch(function (err) { ui.toast(err.message, 'error'); });
    });
  }

  /* ------------------------------------------------------- inspections -- */

  function inspectionsCard(r) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'Quality control'));

    if (!r.inspections || !r.inspections.length) {
      card.appendChild(ui.empty('Nothing inspected yet',
        'An inspection checks a sample of this run against your own checkpoints. It is separate from the counts above: output says what was made, an inspection judges it.',
        h('a.btn.btn--accent', { href: '#/qc/new' }, 'Inspect this run')));
      return card;
    }

    var table = h('table.table');
    table.appendChild(h('thead', h('tr',
      h('th', 'Reference'), h('th', 'Sample'), h('th', 'Outcome'), h('th', 'When'))));
    var body = h('tbody');
    r.inspections.forEach(function (i) {
      body.appendChild(h('tr',
        h('td', h('a', { href: '#/qc/' + i.id }, i.reference)),
        h('td', String(i.sampleSize)),
        h('td', i.completedAt
          ? ui.statusPill(i.overrideResult || i.result)
          : h('span.muted', { text: 'Open' })),
        h('td', ui.date(i.inspectedAt))));
    });
    table.appendChild(body);
    card.appendChild(table);
    card.appendChild(h('div.card__foot', h('a.btn.btn--sm', { href: '#/qc/new' }, 'Inspect it again')));
    return card;
  }

  /* ----------------------------------------------------------- history -- */

  function historyCard(r) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'History'));

    if (!r.events.length) {
      card.appendChild(h('p.muted', { text: 'Nothing recorded yet.' }));
      return card;
    }

    var list = h('div.timeline');
    r.events.forEach(function (e) {
      var what;
      if (e.toStatus) {
        what = e.fromStatus ? label(e.fromStatus) + ' → ' + label(e.toStatus) : label(e.toStatus);
      } else {
        what = (e.fromStage ? e.fromStage.name : 'Not started') + ' → ' + (e.toStage ? e.toStage.name : 'not started');
      }
      list.appendChild(h('div.timeline__row',
        h('div.timeline__when', { text: ui.dateTime(e.createdAt) }),
        h('div.timeline__body',
          h('div.timeline__title', { text: what }),
          h('div.timeline__detail', {
            text: (e.by ? e.by.name : 'Somebody no longer on the system') + (e.note ? ' — ' + e.note : ''),
          }))));
    });
    card.appendChild(list);
    return card;
  }

  /* ------------------------------------------------------ stage set-up -- */

  Admin.route('/production/stages', {
    title: 'Production stages',
    subtitle: 'The steps this factory actually works through',
    render: function (mount) {
      var card = h('section.card');
      card.appendChild(h('h2.card__title', 'Your stages'));
      card.appendChild(h('p.card__hint',
        'A hand-stitched ball and a thermo-bonded one do not go through the same steps, so nothing is filled in for you. Add the stages WIN WEARS actually works through, in the order they happen.'));
      var slot = h('div');
      card.appendChild(slot);
      ui.clear(mount).appendChild(card);
      mount.appendChild(newStageCard(load));

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(3));
        return api.get('/api/admin/production/stages')
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty('No stages yet',
                'Add the first one below. Until there is at least one, a run cannot say where it is.'));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', '#'), h('th', 'Stage'), h('th', 'Description'),
              h('th', 'Runs'), h('th', 'In use'), h('th'))));
            var body = h('tbody');
            res.data.forEach(function (s, index) {
              var tr = h('tr');
              tr.appendChild(h('td', String(index + 1)));
              tr.appendChild(h('td', s.name));
              tr.appendChild(h('td', s.description || '—'));
              tr.appendChild(h('td', String(s._count ? s._count.runs : 0)));
              tr.appendChild(h('td', s.active ? 'Yes' : 'Retired'));

              var cell = h('td.cell-actions');
              cell.appendChild(h('button.btn.btn--sm', {
                type: 'button',
                onclick: function () {
                  api.put('/api/admin/production/stages/' + s.id, { active: !s.active })
                    .then(function () { ui.toast(s.active ? 'Retired' : 'Back in use', 'ok'); load(); })
                    .catch(function (err) { ui.toast(err.message, 'error'); });
                },
              }, s.active ? 'Retire' : 'Reinstate'));
              cell.appendChild(h('button.btn.btn--sm.btn--danger', {
                type: 'button',
                onclick: function () {
                  ui.modal({
                    title: 'Delete ' + s.name + '?',
                    danger: true,
                    confirmLabel: 'Delete',
                    message: 'Only a stage nothing has passed through can be deleted. Otherwise retire it, and the history stays intact.',
                  }).then(function (ok) {
                    if (!ok) return;
                    api.del('/api/admin/production/stages/' + s.id)
                      .then(function () { ui.toast('Stage deleted', 'ok'); load(); })
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

  function newStageCard(reload) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'Add a stage'));

    var name = h('input', { type: 'text', placeholder: 'Stitching' });
    var description = h('input', { type: 'text', placeholder: 'What happens here' });
    var displayOrder = h('input', { type: 'number', min: 0, step: 1, value: '0' });

    var add = h('button.btn.btn--accent', { type: 'button' }, 'Add stage');
    add.addEventListener('click', function () {
      if (!name.value.trim()) { ui.toast('Give the stage a name.', 'error'); return; }
      add.disabled = true;
      api.post('/api/admin/production/stages', {
        name: name.value.trim(),
        description: description.value.trim(),
        displayOrder: Number(displayOrder.value) || 0,
      })
        .then(function () {
          ui.toast('Stage added', 'ok');
          name.value = '';
          description.value = '';
          add.disabled = false;
          reload();
        })
        .catch(function (err) { ui.toast(err.message, 'error'); add.disabled = false; });
    });

    card.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Name' }), name),
      h('div.field', h('label.field__label', { text: 'Position' }), displayOrder,
        h('p.field__hint', { text: 'Lower numbers come first.' }))));
    card.appendChild(h('div.field', h('label.field__label', { text: 'Description' }), description));
    card.appendChild(h('div.card__foot', add));
    return card;
  }
})();
