/* ==========================================================================
   Admin — Tasks and automation
   The list somebody works from, and the rules that fill it.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  var label = Admin.doc.label;

  var PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

  /** A task's own link goes back into this dashboard. Checked before it
   *  becomes an href, the same as a tracking link. */
  function safeTaskHref(href) {
    if (typeof href !== 'string' || !href) return null;
    return /^#\/[A-Za-z0-9/_\-?=&.]*$/.test(href) ? href : null;
  }

  function overdue(task) {
    return task.status === 'OPEN' && task.dueAt && new Date(task.dueAt) < new Date();
  }

  /* ------------------------------------------------------------- tasks -- */

  Admin.route('/tasks', {
    title: 'Tasks',
    subtitle: 'What needs doing, and who is doing it',
    render: function (mount) {
      var query = Admin.query();
      var state = {
        q: '', status: query.status || 'OPEN', priority: '',
        mine: query.mine || '', overdue: query.overdue || '',
        page: 1, perPage: 50,
      };

      var card = h('section.card');
      var toolbar = h('div.toolbar');
      var slot = h('div');

      toolbar.appendChild(h('input', {
        type: 'search', placeholder: 'Search tasks…', 'aria-label': 'Search tasks',
        oninput: ui.debounce(function (e) { state.q = e.target.value.trim(); state.page = 1; load(); }, 300),
      }));
      var statusSelect = h('select', {
        'aria-label': 'Filter by status',
        onchange: function (e) { state.status = e.target.value; state.page = 1; load(); },
      }, h('option', { value: '' }, 'Everything'),
        h('option', { value: 'OPEN' }, 'Open'),
        h('option', { value: 'DONE' }, 'Done'),
        h('option', { value: 'DISMISSED' }, 'Dismissed'));
      statusSelect.value = state.status;
      toolbar.appendChild(statusSelect);
      toolbar.appendChild(h('select', {
        'aria-label': 'Filter by priority',
        onchange: function (e) { state.priority = e.target.value; state.page = 1; load(); },
      }, h('option', { value: '' }, 'Any priority'),
        PRIORITIES.map(function (p) { return h('option', { value: p }, label(p)); })));
      toolbar.appendChild(h('a.btn.btn--accent', { href: '#/tasks/new' }, 'Add a task'));
      toolbar.appendChild(h('a.btn.btn--sm', { href: '#/automation' }, 'Rules'));

      var mine = h('input', { type: 'checkbox', checked: Boolean(state.mine) });
      var late = h('input', { type: 'checkbox', checked: Boolean(state.overdue) });
      function onFilter() {
        state.mine = mine.checked ? '1' : '';
        state.overdue = late.checked ? '1' : '';
        state.page = 1;
        load();
      }
      mine.addEventListener('change', onFilter);
      late.addEventListener('change', onFilter);

      card.appendChild(toolbar);
      card.appendChild(h('div.chip-row',
        h('label.check', mine, h('span', 'Only mine')),
        h('label.check', late, h('span', 'Overdue'))));
      card.appendChild(slot);
      ui.clear(mount).appendChild(card);

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(4));
        return api.get('/api/admin/automation/tasks' + api.qs(state))
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty(
                state.status === 'OPEN' ? 'Nothing outstanding' : 'No tasks',
                state.status === 'OPEN'
                  ? 'Nothing is waiting on anybody. Rules add to this list on their own when something needs attention.'
                  : 'Tasks appear here when you add one or when a rule raises it.',
                h('a.btn.btn--accent', { href: '#/tasks/new' }, 'Add a task')));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', 'Task'), h('th', 'Priority'), h('th', 'Due'),
              h('th', 'Who'), h('th', 'Raised by'), h('th'))));
            var body = h('tbody');
            res.data.forEach(function (t) {
              var tr = h('tr');

              var titleCell = h('td');
              var href = safeTaskHref(t.href);
              titleCell.appendChild(href
                ? h('a', { href: href }, t.title)
                : h('span', { text: t.title }));
              if (t.status !== 'OPEN') {
                titleCell.appendChild(h('span.muted.tiny', { text: '  ' + label(t.status) }));
              }
              tr.appendChild(titleCell);

              tr.appendChild(h('td', label(t.priority)));
              tr.appendChild(h('td', t.dueAt
                ? (overdue(t)
                  ? h('strong', { text: ui.date(t.dueAt) })
                  : h('span', { text: ui.date(t.dueAt) }))
                : '—'));
              tr.appendChild(h('td', t.assignedTo ? t.assignedTo.name : h('span.muted', { text: 'Nobody' })));
              tr.appendChild(h('td', t.rule ? t.rule.name : h('span.muted', { text: 'By hand' })));

              var cell = h('td.cell-actions');
              if (t.status === 'OPEN') {
                cell.appendChild(h('button.btn.btn--sm', {
                  type: 'button',
                  onclick: function () { move(t.id, 'DONE', 'Done'); },
                }, 'Done'));
                cell.appendChild(h('button.btn.btn--sm', {
                  type: 'button',
                  onclick: function () { move(t.id, 'DISMISSED', 'Dismissed'); },
                }, 'Dismiss'));
              } else {
                cell.appendChild(h('button.btn.btn--sm', {
                  type: 'button',
                  onclick: function () { move(t.id, 'OPEN', 'Reopened'); },
                }, 'Reopen'));
              }
              tr.appendChild(cell);
              body.appendChild(tr);
            });
            table.appendChild(body);
            slot.appendChild(table);

            if (res.meta && typeof res.meta.open === 'number') {
              slot.appendChild(h('p.card__hint', { text: res.meta.open + ' open in total.' }));
            }
          })
          .catch(function (err) { ui.clear(slot).appendChild(ui.errorState(err, load)); });
      }

      function move(id, status, said) {
        api.patch('/api/admin/automation/tasks/' + id + '/status', { status: status })
          .then(function () { ui.toast(said, 'ok'); load(); })
          .catch(function (err) { ui.toast(err.message, 'error'); });
      }

      return load();
    },
  });

  Admin.route('/tasks/new', {
    title: 'Add a task',
    subtitle: 'A note to somebody, including yourself',
    render: function (mount) {
      var form = h('section.card');
      form.appendChild(h('h2.card__title', 'Add a task'));

      var title = h('input', { type: 'text', placeholder: 'What needs doing' });
      var detail = h('textarea', { rows: 3 });
      var priority = h('select', {}, PRIORITIES.map(function (p) {
        return h('option', { value: p, selected: p === 'NORMAL' }, label(p));
      }));
      var dueAt = h('input', { type: 'date' });
      var assignee = h('select', {}, h('option', { value: '' }, 'Nobody yet'));

      form.appendChild(h('div.field', h('label.field__label', { text: 'Task' }), title));
      form.appendChild(h('div.grid.grid--2',
        h('div.field', h('label.field__label', { text: 'Priority' }), priority),
        h('div.field', h('label.field__label', { text: 'Due' }), dueAt),
        h('div.field', h('label.field__label', { text: 'Who' }), assignee)));
      form.appendChild(h('div.field', h('label.field__label', { text: 'Detail' }), detail));

      var save = h('button.btn.btn--accent', { type: 'button' }, 'Add it');
      save.addEventListener('click', function () {
        if (!title.value.trim()) { ui.toast('Say what needs doing.', 'error'); return; }
        save.disabled = true;
        api.post('/api/admin/automation/tasks', {
          title: title.value.trim(),
          detail: detail.value.trim(),
          priority: priority.value,
          dueAt: dueAt.value || undefined,
          assignedToId: assignee.value || undefined,
        })
          .then(function () { ui.toast('Task added', 'ok'); location.hash = '#/tasks'; })
          .catch(function (err) { ui.toast(err.message, 'error'); save.disabled = false; });
      });
      form.appendChild(h('div.card__foot', save, h('a.btn.btn--sm', { href: '#/tasks' }, 'Cancel')));
      ui.clear(mount).appendChild(form);

      api.get('/api/admin/users').then(function (res) {
        res.data.forEach(function (u) { assignee.appendChild(h('option', { value: u.id }, u.name)); });
      }).catch(function () {});
    },
  });

  /* ------------------------------------------------------------- rules -- */

  Admin.route('/automation', {
    title: 'Automation',
    subtitle: 'Rules that watch for something and put it in front of somebody',
    render: function (mount) {
      var card = h('section.card');
      card.appendChild(h('h2.card__title', 'Rules'));
      var intro = h('p.card__hint');
      card.appendChild(intro);
      card.appendChild(h('p.card__hint',
        'A rule can raise a task, give unowned work an owner, or set a follow-up date. It cannot email anybody, change a price, cancel an order or move stock — those stay decisions a person makes.'));
      var slot = h('div');
      card.appendChild(slot);
      card.appendChild(h('div.card__foot',
        h('a.btn.btn--accent', { href: '#/automation/new' }, 'New rule'),
        h('a.btn.btn--sm', { href: '#/tasks' }, 'See the tasks')));
      ui.clear(mount).appendChild(card);

      api.get('/api/admin/automation/triggers').then(function (res) {
        var mins = res.data.sweepMinutes;
        intro.textContent = mins > 0
          ? 'Rules are checked every ' + mins + ' minutes, and whenever you run one by hand.'
          : 'Automatic checking is switched off, so rules only run when you run them by hand. Set AUTOMATION_SWEEP_MINUTES in the environment to switch it on.';
      }).catch(function () { intro.remove(); });

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(3));
        return api.get('/api/admin/automation/rules?perPage=50')
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty('No rules yet',
                'A rule watches for one situation — an enquiry nobody answered, an order past its date, stock running low — and raises it. Nothing is set up for you, because what is worth chasing is yours to decide.',
                h('a.btn.btn--accent', { href: '#/automation/new' }, 'New rule')));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', 'Rule'), h('th', 'Watches for'), h('th', 'Does'),
              h('th', 'Raised'), h('th', 'Last checked'), h('th', 'On'), h('th'))));
            var body = h('tbody');
            res.data.forEach(function (r) {
              var lastRun = r.runs && r.runs[0];
              var tr = h('tr');
              tr.appendChild(h('td', h('a', { href: '#/automation/' + r.id + '/edit' }, r.name)));
              tr.appendChild(h('td', label(r.trigger)));
              tr.appendChild(h('td', label(r.action)));
              tr.appendChild(h('td', String(r.firedCount)));
              tr.appendChild(h('td', r.lastRunAt
                ? h('span', { text: ui.dateTime(r.lastRunAt) },
                  lastRun && lastRun.error ? h('span.muted.tiny', { text: '  failed' }) : null)
                : h('span.muted', { text: 'Never' })));
              tr.appendChild(h('td', r.active ? 'Yes' : 'Paused'));

              var cell = h('td.cell-actions');
              cell.appendChild(h('button.btn.btn--sm', {
                type: 'button',
                onclick: function () {
                  api.post('/api/admin/automation/rules/' + r.id + '/run', {})
                    .then(function (res2) {
                      var o = res2.data.outcome;
                      ui.toast(o.error
                        ? 'Failed: ' + o.error
                        : o.acted + ' raised from ' + o.matched + ' matched', o.error ? 'error' : 'ok');
                      load();
                    })
                    .catch(function (err) { ui.toast(err.message, 'error'); });
                },
              }, 'Run now'));
              cell.appendChild(h('button.btn.btn--sm', {
                type: 'button',
                onclick: function () {
                  api.put('/api/admin/automation/rules/' + r.id, { active: !r.active })
                    .then(function () { ui.toast(r.active ? 'Paused' : 'Switched on', 'ok'); load(); })
                    .catch(function (err) { ui.toast(err.message, 'error'); });
                },
              }, r.active ? 'Pause' : 'Switch on'));
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

  /* ----------------------------------------------------------- builder -- */

  function ruleBuilder(mount, existing) {
    var isNew = !existing;
    var triggers = [];

    var form = h('section.card');
    form.appendChild(h('h2.card__title', isNew ? 'New rule' : 'Edit ' + existing.name));

    var name = h('input', { type: 'text', value: (existing && existing.name) || '', placeholder: 'Chase unanswered enquiries' });
    var description = h('input', { type: 'text', value: (existing && existing.description) || '' });
    var trigger = h('select', {});
    var triggerHint = h('p.field__hint');
    var action = h('select', {});
    var thresholdDays = h('input', { type: 'number', min: 0, step: 1, value: existing ? String(existing.thresholdDays) : '1' });
    var thresholdHint = h('p.field__hint');
    var taskTitle = h('input', { type: 'text', value: (existing && existing.taskTitle) || '', placeholder: 'Leave empty to use the situation’s own wording' });
    var taskPriority = h('select', {}, PRIORITIES.map(function (p) {
      return h('option', { value: p, selected: existing ? existing.taskPriority === p : p === 'NORMAL' }, label(p));
    }));
    var taskDueDays = h('input', {
      type: 'number', min: 0, step: 1, placeholder: 'No date',
      value: existing && existing.taskDueDays != null ? String(existing.taskDueDays) : '',
    });
    var assignee = h('select', {}, h('option', { value: '' }, 'Nobody'));
    var active = h('input', { type: 'checkbox', checked: existing ? existing.active : true });

    function currentTrigger() {
      return triggers.filter(function (t) { return t.value === trigger.value; })[0];
    }

    function refreshTrigger() {
      var t = currentTrigger();
      if (!t) return;
      triggerHint.textContent = t.title + '.';
      thresholdHint.textContent = 'Counted in ' + t.thresholdMeans + '.';

      ui.clear(action);
      t.actions.forEach(function (a) {
        action.appendChild(h('option', {
          value: a, selected: existing && existing.action === a,
        }, a === 'CREATE_TASK' ? 'Raise a task'
          : a === 'ASSIGN_OWNER' ? 'Give it an owner'
          : 'Set a follow-up date'));
      });
    }
    trigger.addEventListener('change', refreshTrigger);

    form.appendChild(h('div.field', h('label.field__label', { text: 'Name' }), name));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Description' }), description));
    form.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Watch for' }), trigger, triggerHint),
      h('div.field', h('label.field__label', { text: 'Then' }), action)));
    form.appendChild(h('div.field', h('label.field__label', { text: 'After how long' }), thresholdDays, thresholdHint));
    form.appendChild(h('h3.card__subtitle', 'What it raises'));
    form.appendChild(h('div.field', h('label.field__label', { text: 'Wording' }), taskTitle));
    form.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'Priority' }), taskPriority),
      h('div.field', h('label.field__label', { text: 'Due in (days)' }), taskDueDays),
      h('div.field', h('label.field__label', { text: 'Who' }), assignee)));
    form.appendChild(h('label.check', active, h('span', 'Switched on')));

    var previewSlot = h('div');
    form.appendChild(previewSlot);

    function payload() {
      return {
        name: name.value.trim(),
        description: description.value.trim(),
        trigger: trigger.value,
        action: action.value,
        thresholdDays: Number(thresholdDays.value) || 0,
        taskTitle: taskTitle.value.trim(),
        taskPriority: taskPriority.value,
        taskDueDays: taskDueDays.value === '' ? null : Number(taskDueDays.value),
        assigneeId: assignee.value || undefined,
        active: active.checked,
      };
    }

    /* Nobody should have to switch on something that acts by itself to find
       out what it will do. */
    var preview = h('button.btn.btn--sm', { type: 'button' }, 'What would this catch right now?');
    preview.addEventListener('click', function () {
      preview.disabled = true;
      var body = payload();
      if (!body.name) body.name = 'Preview';
      api.post('/api/admin/automation/rules/preview', body)
        .then(function (res) {
          ui.clear(previewSlot);
          if (!res.data.found) {
            previewSlot.appendChild(ui.notice('info', res.data.note));
            return;
          }
          previewSlot.appendChild(h('p.card__hint',
            res.data.found + ' would be caught right now:'));
          var list = h('ul');
          res.data.matches.forEach(function (m) { list.appendChild(h('li', { text: m.label })); });
          previewSlot.appendChild(list);
        })
        .catch(function (err) { ui.toast(err.message, 'error'); })
        .then(function () { preview.disabled = false; });
    });

    var save = h('button.btn.btn--accent', { type: 'button' }, isNew ? 'Create the rule' : 'Save changes');
    save.addEventListener('click', function () {
      if (!name.value.trim()) { ui.toast('Give the rule a name.', 'error'); return; }
      save.disabled = true;
      (isNew ? api.post('/api/admin/automation/rules', payload())
             : api.put('/api/admin/automation/rules/' + existing.id, payload()))
        .then(function () { ui.toast(isNew ? 'Rule created' : 'Saved', 'ok'); location.hash = '#/automation'; })
        .catch(function (err) { ui.toast(err.message, 'error'); save.disabled = false; });
    });

    form.appendChild(h('div.card__foot', save, preview, h('a.btn.btn--sm', { href: '#/automation' }, 'Cancel')));
    mount.appendChild(form);

    api.get('/api/admin/automation/triggers').then(function (res) {
      triggers = res.data.triggers;
      triggers.forEach(function (t) {
        trigger.appendChild(h('option', {
          value: t.value, selected: existing && existing.trigger === t.value,
        }, t.title));
      });
      refreshTrigger();
    }).catch(function () {});

    api.get('/api/admin/users').then(function (res) {
      res.data.forEach(function (u) {
        assignee.appendChild(h('option', {
          value: u.id, selected: existing && existing.assigneeId === u.id,
        }, u.name));
      });
    }).catch(function () {});
  }

  Admin.route('/automation/new', {
    title: 'New rule',
    subtitle: 'Something to watch for',
    render: function (mount) { ui.clear(mount); ruleBuilder(mount, null); },
  });

  Admin.route('/automation/:id/edit', {
    title: 'Edit rule',
    subtitle: 'What it watches for and what it does',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));
      return api.get('/api/admin/automation/rules/' + encodeURIComponent(params.id)).then(function (res) {
        ui.clear(mount);
        ruleBuilder(mount, res.data);
        mount.appendChild(historyCard(res.data));
      });
    },
  });

  function historyCard(rule) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'Recent checks'));
    card.appendChild(h('p.card__hint',
      'Every time this rule was checked and what came of it — the answer to "why did it not fire".'));

    if (!rule.runs || !rule.runs.length) {
      card.appendChild(h('p.muted', { text: 'It has not been checked yet.' }));
      return card;
    }

    var table = h('table.table');
    table.appendChild(h('thead', h('tr',
      h('th', 'When'), h('th', 'Matched'), h('th', 'Raised'), h('th', 'Already in hand'), h('th', 'Took'))));
    var body = h('tbody');
    rule.runs.forEach(function (r) {
      body.appendChild(h('tr',
        h('td', ui.dateTime(r.createdAt)),
        h('td', r.error ? h('strong', { text: 'failed' }) : String(r.matched)),
        h('td', r.error ? h('span.muted', { text: r.error }) : String(r.acted)),
        h('td', r.error ? '—' : String(r.skipped)),
        h('td', r.ms + 'ms')));
    });
    table.appendChild(body);
    card.appendChild(table);
    return card;
  }
})();
