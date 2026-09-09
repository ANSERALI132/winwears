/* ==========================================================================
   Admin — RFQ command centre
   Every quote request, who has it, and what happens next.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  var STATUSES = ['NEW', 'CONTACTED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED'];
  var PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
  var STAGES = ['NEW', 'QUALIFIED', 'CONTACTED', 'DISCOVERY', 'RFQ', 'QUOTATION', 'NEGOTIATION', 'SAMPLE', 'WON', 'LOST'];

  function label(v) {
    if (!v) return '—';
    return String(v).charAt(0) + String(v).slice(1).toLowerCase().replace(/_/g, ' ');
  }

  function overdue(rfq) {
    return rfq.followUpAt && new Date(rfq.followUpAt) < new Date()
      && rfq.status !== 'COMPLETED' && rfq.status !== 'ARCHIVED';
  }

  Admin.route('/rfq', {
    title: 'Quote requests',
    subtitle: 'Who is dealing with what, and what is waiting',
    render: function (mount) {
      var state = { q: '', status: '', priority: '', stage: '', unassigned: '', overdue: '', sort: 'newest', page: 1, perPage: 25 };
      var assignees = [];

      var summarySlot = h('div');
      var card = h('section.card');
      var toolbar = h('div.toolbar');
      var slot = h('div');

      mount.appendChild(summarySlot);
      mount.appendChild(card);

      toolbar.appendChild(h('input', {
        type: 'search', placeholder: 'Reference, name, email, company, country…', 'aria-label': 'Search requests',
        oninput: ui.debounce(function (e) { state.q = e.target.value.trim(); state.page = 1; load(); }, 300),
      }));

      function select(aria, values, key, allLabel) {
        return h('select', {
          'aria-label': aria,
          onchange: function (e) { state[key] = e.target.value; state.page = 1; load(); },
        }, h('option', { value: '' }, allLabel),
          values.map(function (v) { return h('option', { value: v }, label(v)); }));
      }

      toolbar.appendChild(select('Filter by status', STATUSES, 'status', 'All statuses'));
      toolbar.appendChild(select('Filter by priority', PRIORITIES, 'priority', 'Any priority'));
      toolbar.appendChild(select('Filter by pipeline stage', STAGES, 'stage', 'Any stage'));

      toolbar.appendChild(h('select', {
        'aria-label': 'Sort',
        onchange: function (e) { state.sort = e.target.value; state.page = 1; load(); },
      },
        h('option', { value: 'newest' }, 'Newest first'),
        h('option', { value: 'oldest' }, 'Oldest first'),
        h('option', { value: 'priority' }, 'Most urgent first'),
        h('option', { value: 'followup' }, 'Follow-up soonest')));

      card.appendChild(toolbar);
      card.appendChild(slot);

      api.get('/api/admin/rfq/meta/assignees')
        .then(function (res) { assignees = res.data; })
        .catch(function () { /* assignment is still possible without the list */ });

      function summaryTiles(s) {
        var grid = h('div.grid.grid--stats');
        [
          ['Not yet actioned', s.unactioned, function () { state.status = 'NEW'; state.page = 1; load(); }],
          ['Nobody assigned', s.unassigned, function () { state.unassigned = 'yes'; state.page = 1; load(); }],
          ['Follow-up overdue', s.overdue, function () { state.overdue = 'yes'; state.page = 1; load(); }],
          ['High or urgent', s.highPriority, function () { state.priority = 'URGENT'; state.page = 1; load(); }]
        ].forEach(function (row) {
          var tile = h('button.card.stat.stat--button', { type: 'button', onclick: row[2] });
          tile.appendChild(h('div.stat__value', String(row[1])));
          tile.appendChild(h('div.stat__label', row[0]));
          grid.appendChild(tile);
        });
        return grid;
      }

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(5));
        return api.get('/api/admin/rfq' + api.qs(state))
          .then(function (res) {
            ui.clear(summarySlot);
            summarySlot.appendChild(summaryTiles(res.meta.summary));

            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty(
                'No requests match',
                'Quote requests arrive from the website form and from the assistant. They file themselves against a customer and open an opportunity automatically.'));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', 'Reference'), h('th', 'Customer'), h('th', 'Product'), h('th', 'Qty'),
              h('th', 'Stage'), h('th', 'Priority'), h('th', 'Owner'), h('th', 'Follow-up'), h('th', 'Received'))));

            var body = h('tbody');
            res.data.forEach(function (r) {
              var tr = h('tr');
              if (overdue(r)) tr.classList.add('row--overdue');

              var refCell = h('td');
              var link = h('a', { href: '#/rfq/' + r.id }, r.reference || r.id.slice(-8).toUpperCase());
              refCell.appendChild(link);
              if (r.source === 'AI_AGENT') refCell.appendChild(h('div.muted.tiny', 'via assistant'));
              tr.appendChild(refCell);

              var who = h('td');
              if (r.companyAccount) {
                who.appendChild(h('a', { href: '#/crm/companies/' + r.companyAccount.id }, r.companyAccount.name));
              } else {
                who.appendChild(h('span', r.company || r.name));
                who.appendChild(h('div.muted.tiny', 'not filed'));
              }
              if (r.country) who.appendChild(h('div.muted.tiny', r.country));
              tr.appendChild(who);

              tr.appendChild(h('td', r.product ? r.product.productName : (r.category || '—')));
              tr.appendChild(h('td', r.quantity ? String(r.quantity) : '—'));
              tr.appendChild(h('td', r.lead ? ui.statusPill(r.lead.stage) : h('span.muted', '—')));
              tr.appendChild(h('td', h('span.score.score--' + r.priority.toLowerCase(), label(r.priority))));
              tr.appendChild(h('td', r.assignedTo ? r.assignedTo.name : h('span.muted', 'Nobody')));
              tr.appendChild(h('td', r.followUpAt ? ui.date(r.followUpAt) : '—'));
              tr.appendChild(h('td', ui.date(r.createdAt)));
              body.appendChild(tr);
            });
            table.appendChild(body);
            slot.appendChild(table);

            if (res.meta.totalPages > 1) {
              var pg = h('div.pager');
              pg.appendChild(h('button.btn.btn--sm', {
                type: 'button', disabled: res.meta.page <= 1,
                onclick: function () { state.page = res.meta.page - 1; load(); },
              }, 'Previous'));
              pg.appendChild(h('span.pager__label',
                'Page ' + res.meta.page + ' of ' + res.meta.totalPages + ' — ' + res.meta.total + ' total'));
              pg.appendChild(h('button.btn.btn--sm', {
                type: 'button', disabled: res.meta.page >= res.meta.totalPages,
                onclick: function () { state.page = res.meta.page + 1; load(); },
              }, 'Next'));
              slot.appendChild(pg);
            }
          })
          .catch(function (err) { ui.clear(slot).appendChild(ui.errorState(err, load)); });
      }

      Admin.rfqAssignees = function () { return assignees; };
      return load();
    },
  });

  /* -------------------------------------------------------------- one --- */

  Admin.route('/rfq/:id', {
    title: 'Quote request',
    subtitle: 'The request, the customer, and what happens next',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));

      return Promise.all([
        api.get('/api/admin/rfq/' + encodeURIComponent(params.id)),
        api.get('/api/admin/rfq/meta/assignees').catch(function () { return { data: [] }; }),
      ]).then(function (results) {
        var r = results[0].data;
        var people = results[1].data;
        ui.clear(mount);
        mount.appendChild(h('a.btn.btn--sm', { href: '#/rfq' }, '← All requests'));

        var layout = h('div.split');

        /* --- what they asked for --- */
        var left = h('section.card');
        left.appendChild(h('h2.card__title', r.reference || 'Quote request'));
        if (r.source === 'AI_AGENT') {
          left.appendChild(h('p.card__hint', 'Collected by the assistant during a conversation.'));
        }

        var dl = h('dl.detail');
        [['Name', r.name], ['Email', r.email], ['WhatsApp', r.whatsapp],
         ['Company as typed', r.company], ['Country', r.country],
         ['Product', r.product && r.product.productName], ['Category', r.category],
         ['Quantity', r.quantity], ['Size', r.size],
         ['Customization', r.customizationRequired ? 'Yes' : 'No'],
         ['Received', ui.dateTime(r.createdAt)]]
          .forEach(function (p) {
            if (p[1] === null || p[1] === undefined || p[1] === '') return;
            dl.appendChild(h('dt', p[0]));
            dl.appendChild(h('dd', String(p[1])));
          });
        left.appendChild(dl);

        if (r.message) {
          left.appendChild(h('h3.card__subtitle', 'What they said'));
          left.appendChild(h('p.detail__note', r.message));
        }

        if (r.logoFile || r.designFile) {
          left.appendChild(h('h3.card__subtitle', 'Attachments'));
          var files = h('div.chip-row');
          if (r.logoFile) { var a1 = h('a.btn.btn--sm', 'Logo'); a1.href = r.logoFile; a1.target = '_blank'; a1.rel = 'noopener'; files.appendChild(a1); }
          if (r.designFile) { var a2 = h('a.btn.btn--sm', 'Design'); a2.href = r.designFile; a2.target = '_blank'; a2.rel = 'noopener'; files.appendChild(a2); }
          left.appendChild(files);
        }
        layout.appendChild(left);

        /* --- handling --- */
        var right = h('section.card');
        right.appendChild(h('h2.card__title', 'Handling'));

        var status = h('select', {}, STATUSES.map(function (s) {
          return h('option', { value: s, selected: r.status === s }, label(s));
        }));
        var priority = h('select', {}, PRIORITIES.map(function (p) {
          return h('option', { value: p, selected: r.priority === p }, label(p));
        }));
        var owner = h('select', {}, [h('option', { value: '' }, 'Nobody')].concat(
          people.map(function (u) {
            return h('option', { value: u.id, selected: r.assignedToId === u.id }, u.name);
          })));
        var followUp = h('input', {
          type: 'date',
          value: r.followUpAt ? new Date(r.followUpAt).toISOString().slice(0, 10) : '',
        });
        var notes = h('textarea', { rows: 5, value: r.internalNotes || '' });

        right.appendChild(h('div.field', h('label.field__label', { text: 'Status' }), status));
        right.appendChild(h('div.field', h('label.field__label', { text: 'Priority' }), priority,
          h('p.field__hint', { text: 'What you decided. Separate from the lead score, which is computed from what the customer told us.' })));
        right.appendChild(h('div.field', h('label.field__label', { text: 'Assigned to' }), owner));
        right.appendChild(h('div.field', h('label.field__label', { text: 'Follow up on' }), followUp));
        right.appendChild(h('div.field', h('label.field__label', { text: 'Internal notes' }), notes,
          h('p.field__hint', { text: 'Never shown to the customer.' })));

        var save = h('button.btn.btn--accent', { type: 'button' }, 'Save');
        save.addEventListener('click', function () {
          save.disabled = true;
          api.patch('/api/admin/rfq/' + r.id, {
            status: status.value,
            priority: priority.value,
            assignedToId: owner.value || null,
            followUpAt: followUp.value || null,
            internalNotes: notes.value.trim() || null,
          })
            .then(function () { ui.toast('Saved', 'ok'); })
            .catch(function (err) { ui.toast(err.message, 'error'); })
            .then(function () { save.disabled = false; });
        });
        right.appendChild(save);

        /* --- where it sits --- */
        right.appendChild(h('h3.card__subtitle', 'Where this sits'));
        var links = h('div.chip-row');
        if (r.companyAccount) {
          links.appendChild(h('a.btn.btn--sm', { href: '#/crm/companies/' + r.companyAccount.id }, 'Customer: ' + r.companyAccount.name));
        }
        if (r.lead) {
          links.appendChild(h('a.btn.btn--sm', { href: '#/crm/leads/' + r.lead.id }, 'Lead: ' + label(r.lead.stage)));
        }
        if (r.aiConversation) {
          links.appendChild(h('a.btn.btn--sm', { href: '#/ai/conversations/' + r.aiConversation.id }, 'Conversation'));
        }
        if (!links.childNodes.length) {
          right.appendChild(h('p.card__hint', 'This request is not filed against a customer yet.'));
        } else {
          right.appendChild(links);
        }

        layout.appendChild(right);
        mount.appendChild(layout);
      });
    },
  });
})();
