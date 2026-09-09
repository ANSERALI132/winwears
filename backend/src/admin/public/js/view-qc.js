/* ==========================================================================
   Admin — Quality control
   Inspections, the readings behind them, and the factory's own checkpoints.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  var label = Admin.doc.label;

  var RESULTS = ['PENDING', 'PASSED', 'FAILED', 'CONCESSION'];

  /** What a checkpoint's limits actually say, in words. Blank when nobody has
   *  set any — and that blank is the point: the system has not invented one. */
  function limitText(c) {
    var unit = c.unit ? ' ' + c.unit : '';
    if (c.minValue != null && c.maxValue != null) return c.minValue + ' – ' + c.maxValue + unit;
    if (c.minValue != null) return 'at least ' + c.minValue + unit;
    if (c.maxValue != null) return 'at most ' + c.maxValue + unit;
    return '';
  }

  function verdictPill(passed) {
    return h('span.pill', { class: passed ? 'pill--ok' : 'pill--archived', text: passed ? 'Pass' : 'Fail' });
  }

  /* ----------------------------------------------------------- the list -- */

  Admin.route('/qc', {
    title: 'Quality control',
    subtitle: 'What was checked, and what was found',
    render: function (mount) {
      var query = Admin.query();
      var state = { q: '', result: query.result || '', open: query.open || '', page: 1, perPage: 25 };

      var card = h('section.card');
      var toolbar = h('div.toolbar');
      var slot = h('div');

      toolbar.appendChild(h('input', {
        type: 'search', placeholder: 'Inspection, run, order or customer…', 'aria-label': 'Search inspections',
        oninput: ui.debounce(function (e) { state.q = e.target.value.trim(); state.page = 1; load(); }, 300),
      }));
      var resultSelect = h('select', {
        'aria-label': 'Filter by outcome',
        onchange: function (e) { state.result = e.target.value; state.page = 1; load(); },
      }, h('option', { value: '' }, 'Any outcome'),
        RESULTS.map(function (r) { return h('option', { value: r }, label(r)); }));
      resultSelect.value = state.result;
      toolbar.appendChild(resultSelect);
      toolbar.appendChild(h('a.btn.btn--accent', { href: '#/qc/new' }, 'New inspection'));
      toolbar.appendChild(h('a.btn.btn--sm', { href: '#/qc/checkpoints' }, 'Checkpoints'));

      var open = h('input', { type: 'checkbox', checked: Boolean(state.open) });
      open.addEventListener('change', function () {
        state.open = open.checked ? '1' : '';
        state.page = 1;
        load();
      });
      card.appendChild(toolbar);
      card.appendChild(h('div.chip-row', h('label.check', open, h('span', 'Still open'))));
      card.appendChild(slot);
      ui.clear(mount).appendChild(card);

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(4));
        return api.get('/api/admin/qc/inspections' + api.qs(state))
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty('No inspections yet',
                'An inspection is a sample checked against your own checkpoints. Define the checkpoints first, then inspect a production run or an order before it ships.',
                h('a.btn.btn--accent', { href: '#/qc/new' }, 'New inspection')));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', 'Reference'), h('th', 'Of'), h('th', 'Sample'),
              h('th', 'Checks'), h('th', 'Outcome'), h('th', 'Inspector'), h('th', 'When'))));
            var body = h('tbody');
            res.data.forEach(function (i) {
              var failed = i.results.filter(function (r) { return !r.passed; }).length;
              var tr = h('tr');
              tr.appendChild(h('td', h('a', { href: '#/qc/' + i.id }, i.reference)));
              tr.appendChild(h('td', i.run
                ? h('a', { href: '#/production/' + i.run.id }, i.run.reference)
                : (i.order ? h('a', { href: '#/orders/' + i.order.id }, i.order.number) : '—')));
              tr.appendChild(h('td', String(i.sampleSize)));
              tr.appendChild(h('td', i.results.length
                ? (i.results.length - failed) + ' of ' + i.results.length + ' passed'
                : h('span.muted', { text: 'None yet' })));
              tr.appendChild(h('td', outcomeCell(i)));
              tr.appendChild(h('td', i.inspector ? i.inspector.name : '—'));
              tr.appendChild(h('td', ui.date(i.inspectedAt)));
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

  /** The outcome, saying so when it was overruled — "we shipped it knowing"
   *  is the sentence somebody needs to be able to find later. */
  function outcomeCell(i) {
    var pill = ui.statusPill(i.outcome);
    if (!i.overrideResult) return pill;
    return h('span', pill, h('span.muted.tiny', { text: ' was ' + label(i.result) }));
  }

  /* ------------------------------------------------------------- create -- */

  Admin.route('/qc/new', {
    title: 'New inspection',
    subtitle: 'What is being checked',
    render: function (mount) {
      var form = h('section.card');
      form.appendChild(h('h2.card__title', 'New inspection'));
      form.appendChild(h('p.card__hint',
        'Say what was pulled and looked at. The readings go in next, and the outcome is worked out from them.'));

      var runSelect = h('select', {}, h('option', { value: '' }, 'Not a production run'));
      var orderSelect = h('select', {}, h('option', { value: '' }, 'Not an order'));
      var stageSelect = h('select', {}, h('option', { value: '' }, 'No particular stage'));
      var inspectorSelect = h('select', {}, h('option', { value: '' }, 'Me'));
      var sampleSize = h('input', { type: 'number', min: 0, step: 1, value: '' });
      var quantityPassed = h('input', { type: 'number', min: 0, step: 1, value: '' });
      var quantityFailed = h('input', { type: 'number', min: 0, step: 1, value: '' });
      var inspectedAt = h('input', { type: 'date' });
      var notes = h('textarea', { rows: 3 });

      form.appendChild(h('div.grid.grid--2',
        h('div.field', h('label.field__label', { text: 'Production run' }), runSelect),
        h('div.field', h('label.field__label', { text: 'Or an order' }), orderSelect,
          h('p.field__hint', { text: 'A run inherits its order automatically.' }))));
      form.appendChild(h('div.grid.grid--2',
        h('div.field', h('label.field__label', { text: 'Stage' }), stageSelect),
        h('div.field', h('label.field__label', { text: 'Inspector' }), inspectorSelect)));
      form.appendChild(h('div.grid.grid--2',
        h('div.field', h('label.field__label', { text: 'How many were pulled' }), sampleSize),
        h('div.field', h('label.field__label', { text: 'Date' }), inspectedAt)));
      form.appendChild(h('div.grid.grid--2',
        h('div.field', h('label.field__label', { text: 'Of those, passed' }), quantityPassed),
        h('div.field', h('label.field__label', { text: 'Of those, failed' }), quantityFailed)));
      form.appendChild(h('div.field', h('label.field__label', { text: 'Notes' }), notes));

      var save = h('button.btn.btn--accent', { type: 'button' }, 'Start the inspection');
      save.addEventListener('click', function () {
        if (!runSelect.value && !orderSelect.value) {
          ui.toast('Say what is being inspected — a run or an order.', 'error');
          return;
        }
        save.disabled = true;
        api.post('/api/admin/qc/inspections', {
          runId: runSelect.value || undefined,
          orderId: orderSelect.value || undefined,
          stageId: stageSelect.value || undefined,
          inspectorId: inspectorSelect.value || undefined,
          sampleSize: Number(sampleSize.value) || 0,
          quantityPassed: Number(quantityPassed.value) || 0,
          quantityFailed: Number(quantityFailed.value) || 0,
          inspectedAt: inspectedAt.value || undefined,
          notes: notes.value.trim(),
        })
          .then(function (res) { ui.toast('Inspection started', 'ok'); location.hash = '#/qc/' + res.data.id; })
          .catch(function (err) { ui.toast(err.message, 'error'); save.disabled = false; });
      });
      form.appendChild(h('div.card__foot', save, h('a.btn.btn--sm', { href: '#/qc' }, 'Cancel')));
      ui.clear(mount).appendChild(form);

      api.get('/api/admin/production/runs?perPage=100').then(function (res) {
        res.data.forEach(function (r) {
          runSelect.appendChild(h('option', { value: r.id }, r.reference + ' — ' + r.title));
        });
      }).catch(function () {});
      api.get('/api/admin/orders?perPage=100').then(function (res) {
        res.data.forEach(function (o) {
          orderSelect.appendChild(h('option', { value: o.id }, o.number + ' — ' + (o.company ? o.company.name : 'no account')));
        });
      }).catch(function () {});
      api.get('/api/admin/production/stages').then(function (res) {
        res.data.filter(function (s) { return s.active; }).forEach(function (s) {
          stageSelect.appendChild(h('option', { value: s.id }, s.name));
        });
      }).catch(function () {});
      api.get('/api/admin/users').then(function (res) {
        res.data.forEach(function (u) { inspectorSelect.appendChild(h('option', { value: u.id }, u.name)); });
      }).catch(function () {});
    },
  });

  /* --------------------------------------------------------- one, read -- */

  Admin.route('/qc/:id', {
    title: 'Inspection',
    subtitle: 'What was checked, and what was found',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));

      return Promise.all([
        api.get('/api/admin/qc/inspections/' + encodeURIComponent(params.id)),
        api.get('/api/admin/qc/checkpoints').catch(function () { return { data: [] }; }),
      ]).then(function (results) {
        var i = results[0].data;
        var checkpoints = (results[1].data || []).filter(function (c) { return c.active; });
        ui.clear(mount);

        mount.appendChild(h('a.btn.btn--sm', { href: '#/qc' }, 'â† All inspections'));
        mount.appendChild(summaryCard(i));
        mount.appendChild(readingsCard(i, checkpoints));
        mount.appendChild(Admin.documentsCard('inspection', i.id, {
          hint: 'Photographs of what was found, a lab report, a signed release.',
        }));
        if (i.locked) mount.appendChild(decisionCard(i));
      });
    },
  });

  function summaryCard(i) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', i.reference));

    var facts = h('div.grid.grid--2');
    function fact(name, value) {
      facts.appendChild(h('div.field', h('div.field__label', { text: name }), h('div', value)));
    }
    fact('Outcome', outcomeCell(i));
    fact('Status', i.locked ? 'Completed ' + ui.date(i.completedAt) : h('span.muted', { text: 'Open' }));
    fact('Production run', i.run
      ? h('a', { href: '#/production/' + i.run.id }, i.run.reference + ' — ' + i.run.title)
      : h('span.muted', { text: 'Not a run' }));
    fact('Order', i.order
      ? h('a', { href: '#/orders/' + i.order.id }, i.order.number + (i.order.company ? ' — ' + i.order.company.name : ''))
      : h('span.muted', { text: 'Not against an order' }));
    fact('Stage', i.stage ? i.stage.name : h('span.muted', { text: 'No particular stage' }));
    fact('Inspector', i.inspector ? i.inspector.name : h('span.muted', { text: 'Not recorded' }));
    fact('Sample', String(i.sampleSize));
    fact('Passed / failed', i.quantityPassed + ' / ' + i.quantityFailed);
    card.appendChild(facts);

    if (i.criticalFailure) {
      card.appendChild(ui.notice('error',
        'A checkpoint marked critical failed. This cannot be passed or conceded — the batch does not go out on this inspection.'));
    }
    if (i.notes) card.appendChild(h('p', { text: i.notes }));

    if (!i.locked) {
      card.appendChild(h('div.card__foot',
        h('button.btn.btn--accent', {
          type: 'button',
          onclick: function () {
            if (!i.results.length) { ui.toast('Record at least one reading first.', 'error'); return; }
            ui.modal({
              title: 'Complete ' + i.reference + '?',
              confirmLabel: 'Complete it',
              message: 'The outcome is worked out from the readings and the inspection is locked. An inspection that can be edited afterwards is not evidence of anything.',
            }).then(function (ok) {
              if (!ok) return;
              api.post('/api/admin/qc/inspections/' + i.id + '/complete', {})
                .then(function (res) { ui.toast('Inspection ' + label(res.data.result).toLowerCase(), 'ok'); Admin.refresh(); })
                .catch(function (err) { ui.toast(err.message, 'error'); });
            });
          },
        }, 'Complete the inspection'),
        h('button.btn.btn--sm.btn--danger', {
          type: 'button',
          onclick: function () {
            ui.modal({
              title: 'Delete ' + i.reference + '?',
              danger: true,
              confirmLabel: 'Delete',
              message: 'Only an inspection that has not been completed can be deleted.',
            }).then(function (ok) {
              if (!ok) return;
              api.del('/api/admin/qc/inspections/' + i.id)
                .then(function () { ui.toast('Inspection deleted', 'ok'); location.hash = '#/qc'; })
                .catch(function (err) { ui.toast(err.message, 'error'); });
            });
          },
        }, 'Delete')));
    }
    return card;
  }

  /* ----------------------------------------------------------- readings -- */

  function readingsCard(i, checkpoints) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'Readings'));

    if (i.locked) {
      if (!i.results.length) {
        card.appendChild(h('p.muted', { text: 'Nothing was recorded.' }));
        return card;
      }
      var table = h('table.table');
      table.appendChild(h('thead', h('tr',
        h('th', 'Checkpoint'), h('th', 'Limits'), h('th', 'Reading'), h('th', 'Verdict'), h('th', 'Note'))));
      var body = h('tbody');
      i.results.forEach(function (r) {
        body.appendChild(h('tr',
          h('td', r.checkpoint.name + (r.checkpoint.critical ? ' (critical)' : '')),
          h('td', limitText(r.checkpoint) || h('span.muted', { text: 'None set' })),
          h('td', r.value == null ? '—' : String(r.value) + (r.checkpoint.unit ? ' ' + r.checkpoint.unit : '')),
          h('td', verdictPill(r.passed)),
          h('td', r.note || '—')));
      });
      table.appendChild(body);
      card.appendChild(table);
      return card;
    }

    if (!checkpoints.length) {
      card.appendChild(ui.empty('No checkpoints defined',
        'A checkpoint is something this factory actually tests — weight, circumference, stitching, print. Nothing is filled in for you, because the limits have to be yours.',
        h('a.btn.btn--accent', { href: '#/qc/checkpoints' }, 'Define your checkpoints')));
      return card;
    }

    card.appendChild(h('p.card__hint',
      'A measurement with limits is judged against them. Anything without limits is your call, and the record says so.'));

    /* One row per active checkpoint, pre-filled with anything already saved.
       The whole set is sent on save — a second reading of the same check is a
       correction, not another data point. */
    var rows = [];
    var host = h('div.lines');

    checkpoints.forEach(function (c) {
      var saved = i.results.filter(function (r) { return r.checkpointId === c.id; })[0];
      var row = h('div.check-row');

      var name = h('div',
        h('div', { text: c.name + (c.critical ? ' (critical)' : '') }),
        h('div.muted.tiny', { text: limitText(c) || (c.kind === 'MEASUREMENT' ? 'No limits set' : 'Yes or no') }));

      var value = h('input', {
        type: 'number', step: '0.001', placeholder: c.unit || 'Reading',
        value: saved && saved.value != null ? String(saved.value) : '',
        'aria-label': c.name + ' reading',
        disabled: c.kind !== 'MEASUREMENT',
      });

      var verdict = h('select', { 'aria-label': c.name + ' verdict' },
        h('option', { value: '' }, 'Not checked'),
        h('option', { value: 'pass' }, 'Pass'),
        h('option', { value: 'fail' }, 'Fail'));
      if (saved) verdict.value = saved.passed ? 'pass' : 'fail';

      var note = h('input', {
        type: 'text', placeholder: 'Note', value: (saved && saved.note) || '',
        'aria-label': c.name + ' note',
      });

      row.appendChild(name);
      row.appendChild(value);
      row.appendChild(verdict);
      row.appendChild(note);
      host.appendChild(row);

      rows.push({ checkpoint: c, value: value, verdict: verdict, note: note });
    });

    card.appendChild(host);

    var save = h('button.btn.btn--accent', { type: 'button' }, 'Save readings');
    save.addEventListener('click', function () {
      var payload = [];
      rows.forEach(function (r) {
        var hasValue = r.value.value !== '';
        var hasVerdict = r.verdict.value !== '';
        if (!hasValue && !hasVerdict) return;
        payload.push({
          checkpointId: r.checkpoint.id,
          value: hasValue ? Number(r.value.value) : null,
          passed: hasVerdict ? r.verdict.value === 'pass' : undefined,
          note: r.note.value.trim(),
        });
      });

      if (!payload.length) { ui.toast('Record at least one checkpoint.', 'error'); return; }

      save.disabled = true;
      api.put('/api/admin/qc/inspections/' + i.id + '/results', { results: payload })
        .then(function () { ui.toast('Readings saved', 'ok'); Admin.refresh(); })
        .catch(function (err) { ui.toast(err.message, 'error'); save.disabled = false; });
    });
    card.appendChild(h('div.card__foot', save));
    return card;
  }

  /* ----------------------------------------------------------- decision -- */

  function decisionCard(i) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'Decision'));

    if (i.overrideResult) {
      card.appendChild(ui.notice('info',
        'Recorded as ' + label(i.result) + ', overruled to ' + label(i.overrideResult) +
        ' by ' + (i.decidedBy ? i.decidedBy.name : 'somebody no longer on the system') + '.'));
      card.appendChild(h('p', { text: i.overrideReason }));
      return card;
    }

    if (i.result === 'PASSED') {
      card.appendChild(h('p.muted', { text: 'Everything checked passed. Nothing to decide.' }));
      return card;
    }
    if (i.criticalFailure) {
      card.appendChild(h('p.muted', {
        text: 'A critical checkpoint failed. That is exactly what marking it critical was for — it cannot be passed or conceded here.',
      }));
      return card;
    }

    card.appendChild(h('p.card__hint',
      'This failed on something that is not critical. Letting it through is a decision with your name against it, and the reason is what somebody reads in six months.'));

    var reason = h('textarea', { rows: 3, placeholder: 'Why is this being let through?' });
    var concede = h('button.btn.btn--accent', { type: 'button' }, 'Let it through on a concession');
    concede.addEventListener('click', function () {
      if (!reason.value.trim()) { ui.toast('A concession needs a reason.', 'error'); return; }
      concede.disabled = true;
      api.post('/api/admin/qc/inspections/' + i.id + '/override', {
        result: 'CONCESSION', reason: reason.value.trim(),
      })
        .then(function () { ui.toast('Recorded as a concession', 'ok'); Admin.refresh(); })
        .catch(function (err) { ui.toast(err.message, 'error'); concede.disabled = false; });
    });

    card.appendChild(h('div.field', h('label.field__label', { text: 'Reason' }), reason));
    card.appendChild(h('div.card__foot', concede));
    return card;
  }

  /* ------------------------------------------------- checkpoint set-up -- */

  Admin.route('/qc/checkpoints', {
    title: 'QC checkpoints',
    subtitle: 'What this factory actually tests',
    render: function (mount) {
      var card = h('section.card');
      card.appendChild(h('h2.card__title', 'Your checkpoints'));
      card.appendChild(h('p.card__hint',
        'Weight, circumference, bounce and water absorption all have published standards, but which of them WIN WEARS tests and to what limits is yours to say. Nothing is filled in, because a number invented here would end up on a QC report nobody agreed to.'));
      var slot = h('div');
      card.appendChild(slot);
      ui.clear(mount).appendChild(card);
      mount.appendChild(newCheckpointCard(load));

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(3));
        return api.get('/api/admin/qc/checkpoints')
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty('No checkpoints yet',
                'Add the first one below. Until there is at least one, an inspection has nothing to check against.'));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', '#'), h('th', 'Checkpoint'), h('th', 'Kind'), h('th', 'Limits'),
              h('th', 'Critical'), h('th', 'Used'), h('th', 'In use'), h('th'))));
            var body = h('tbody');
            res.data.forEach(function (c, index) {
              var tr = h('tr');
              tr.appendChild(h('td', String(index + 1)));
              tr.appendChild(h('td', c.name));
              tr.appendChild(h('td', label(c.kind)));
              tr.appendChild(h('td', limitText(c) || h('span.muted', { text: 'None set' })));
              tr.appendChild(h('td', c.critical ? 'Yes' : 'No'));
              tr.appendChild(h('td', String(c._count ? c._count.results : 0)));
              tr.appendChild(h('td', c.active ? 'Yes' : 'Retired'));

              var cell = h('td.cell-actions');
              cell.appendChild(h('button.btn.btn--sm', {
                type: 'button',
                onclick: function () {
                  api.put('/api/admin/qc/checkpoints/' + c.id, { active: !c.active })
                    .then(function () { ui.toast(c.active ? 'Retired' : 'Back in use', 'ok'); load(); })
                    .catch(function (err) { ui.toast(err.message, 'error'); });
                },
              }, c.active ? 'Retire' : 'Reinstate'));
              cell.appendChild(h('button.btn.btn--sm.btn--danger', {
                type: 'button',
                onclick: function () {
                  ui.modal({
                    title: 'Delete ' + c.name + '?',
                    danger: true,
                    confirmLabel: 'Delete',
                    message: 'Only a checkpoint nothing has been measured against can be deleted. Otherwise retire it, and old reports keep saying what they were measured against.',
                  }).then(function (ok) {
                    if (!ok) return;
                    api.del('/api/admin/qc/checkpoints/' + c.id)
                      .then(function () { ui.toast('Checkpoint deleted', 'ok'); load(); })
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

  function newCheckpointCard(reload) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'Add a checkpoint'));

    var name = h('input', { type: 'text', placeholder: 'Weight' });
    var kind = h('select', {},
      h('option', { value: 'OBSERVATION' }, 'Yes or no'),
      h('option', { value: 'MEASUREMENT' }, 'A measurement'));
    var unit = h('input', { type: 'text', placeholder: 'g, cm, %' });
    var minValue = h('input', { type: 'number', step: '0.001', placeholder: 'No minimum' });
    var maxValue = h('input', { type: 'number', step: '0.001', placeholder: 'No maximum' });
    var critical = h('input', { type: 'checkbox' });
    var displayOrder = h('input', { type: 'number', min: 0, step: 1, value: '0' });
    var description = h('input', { type: 'text', placeholder: 'What is being checked, and how' });

    var limitFields = h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Unit' }), unit),
      h('div.field', h('label.field__label', { text: 'Minimum' }), minValue),
      h('div.field', h('label.field__label', { text: 'Maximum' }), maxValue));
    limitFields.hidden = true;

    kind.addEventListener('change', function () {
      limitFields.hidden = kind.value !== 'MEASUREMENT';
    });

    var add = h('button.btn.btn--accent', { type: 'button' }, 'Add checkpoint');
    add.addEventListener('click', function () {
      if (!name.value.trim()) { ui.toast('Give the checkpoint a name.', 'error'); return; }
      var measurement = kind.value === 'MEASUREMENT';
      add.disabled = true;
      api.post('/api/admin/qc/checkpoints', {
        name: name.value.trim(),
        description: description.value.trim(),
        kind: kind.value,
        unit: measurement ? unit.value.trim() : '',
        minValue: measurement && minValue.value !== '' ? Number(minValue.value) : null,
        maxValue: measurement && maxValue.value !== '' ? Number(maxValue.value) : null,
        critical: critical.checked,
        displayOrder: Number(displayOrder.value) || 0,
      })
        .then(function () {
          ui.toast('Checkpoint added', 'ok');
          name.value = ''; unit.value = ''; minValue.value = ''; maxValue.value = '';
          description.value = ''; critical.checked = false;
          add.disabled = false;
          reload();
        })
        .catch(function (err) { ui.toast(err.message, 'error'); add.disabled = false; });
    });

    card.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Name' }), name),
      h('div.field', h('label.field__label', { text: 'Kind' }), kind),
      h('div.field', h('label.field__label', { text: 'Position' }), displayOrder,
        h('p.field__hint', { text: 'Lower numbers come first.' }))));
    card.appendChild(limitFields);
    card.appendChild(h('div.field', h('label.field__label', { text: 'Description' }), description));
    card.appendChild(h('label.check', critical,
      h('span', 'Critical — a failure here cannot be let through on a concession')));
    card.appendChild(h('div.card__foot', add));
    return card;
  }
})();
