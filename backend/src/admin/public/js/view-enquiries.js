/* ==========================================================================
   Admin — Quote requests and contact messages
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  var QUOTE_STATUSES = ['NEW', 'CONTACTED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED'];
  var MESSAGE_STATUSES = ['NEW', 'READ', 'REPLIED', 'ARCHIVED'];

  function label(status) {
    return status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ');
  }

  /** Shared list scaffolding for both inboxes. */
  function listView(config) {
    return function (mount, _params, ctx) {
      var state = { q: '', status: '', page: 1, perPage: 25, sort: 'newest' };
      var slot = h('div');
      var card = h('section.card');
      var toolbar = h('div.toolbar');

      toolbar.appendChild(h('input', {
        type: 'search',
        placeholder: config.searchPlaceholder,
        'aria-label': 'Search',
        oninput: ui.debounce(function (e) { state.q = e.target.value.trim(); state.page = 1; load(); }, 300),
      }));

      toolbar.appendChild(h('select', {
        'aria-label': 'Filter by status',
        onchange: function (e) { state.status = e.target.value; state.page = 1; load(); },
      }, h('option', { value: '' }, 'All statuses'),
        config.statuses.map(function (s) { return h('option', { value: s }, label(s)); })));

      card.appendChild(toolbar);
      card.appendChild(slot);
      ui.clear(mount).appendChild(card);

      return load();

      function load() {
        ui.clear(slot).appendChild(h('div', { style: 'padding:16px' }, ui.skeleton(6)));
        return api
          .get(config.endpoint + api.qs(state))
          .then(function (res) { draw(res.data, res.meta); })
          .catch(function (err) { ui.clear(slot).appendChild(ui.errorState(err, load)); });
      }

      function draw(rows, meta) {
        ui.clear(slot);

        if (!rows.length) {
          slot.appendChild(ui.empty(config.emptyTitle, config.emptyBody));
          return;
        }

        slot.appendChild(h('div.table-wrap',
          h('table', h('thead', h('tr', config.columns.map(function (c) { return h('th', c); }))),
            h('tbody', rows.map(function (r) { return config.row(r, load, ctx); })))));

        var from = (meta.page - 1) * meta.perPage + 1;
        var to = Math.min(meta.total, meta.page * meta.perPage);
        slot.appendChild(h('div.pager',
          h('span.pager__info', { text: 'Showing ' + from + '–' + to + ' of ' + meta.total }),
          h('button.btn.btn--sm', { type: 'button', disabled: meta.page <= 1,
            onclick: function () { state.page -= 1; load(); } }, 'Previous'),
          h('span.muted', { text: 'Page ' + meta.page + ' of ' + meta.totalPages }),
          h('button.btn.btn--sm', { type: 'button', disabled: meta.page >= meta.totalPages,
            onclick: function () { state.page += 1; load(); } }, 'Next')));
      }
    };
  }

  function statusSelect(statuses, current, onChange) {
    return h('select', {
      'aria-label': 'Status',
      style: 'min-height:30px;padding:2px 6px;font-size:12.5px',
      onchange: function (e) { onChange(e.target.value, e.target); },
    }, statuses.map(function (s) { return h('option', { value: s, selected: s === current }, label(s)); }));
  }

  /* ---------------------------------------------------------- quotes ---- */

  Admin.route('/quotes', {
    title: 'Quote Requests',
    subtitle: 'Enquiries submitted from the website',
    render: listView({
      endpoint: '/api/admin/quotes',
      statuses: QUOTE_STATUSES,
      searchPlaceholder: 'Search name, company, email…',
      emptyTitle: 'No quote requests',
      emptyBody: 'Submissions from the request-a-quote form will appear here.',
      columns: ['Customer', 'Company', 'Product', 'Quantity', 'Country', 'Contact', 'Received', 'Status', ''],
      row: function (q, reload) {
        return h('tr',
          h('td', h('strong', { text: q.name })),
          h('td', { text: q.company || '—' }),
          h('td', { text: q.product ? q.product.productName : q.category || '—' }),
          h('td', { text: q.quantity != null ? String(q.quantity) : '—' }),
          h('td', { text: q.country || '—' }),
          h('td', h('div', h('a', { href: 'mailto:' + q.email, text: q.email })),
            q.whatsapp ? h('div', h('a', {
              href: 'https://wa.me/' + q.whatsapp.replace(/[^\d]/g, ''),
              target: '_blank', rel: 'noopener noreferrer', text: q.whatsapp,
            })) : null),
          h('td.muted', { style: 'white-space:nowrap', text: ui.date(q.createdAt) }),
          h('td', statusSelect(QUOTE_STATUSES, q.status, function (next, el) {
            api.put('/api/admin/quotes/' + q.id, { status: next })
              .then(function () { ui.toast('Status updated', 'ok'); Admin.refreshCounts(); })
              .catch(function (err) { el.value = q.status; ui.toast(err.message, 'error'); });
          })),
          h('td', h('div.cell-actions',
            h('button.btn.btn--sm', { type: 'button', onclick: function () { openQuote(q, reload); } }, 'Open'))));
      },
    }),
  });

  /** Deep link from the overview panel. */
  Admin.route('/quotes/:id', {
    title: 'Quote Request',
    subtitle: '',
    render: function (mount, params, ctx) {
      return api.get('/api/admin/quotes/' + params.id).then(function (res) {
        ctx.setSubtitle(res.data.name);
        ctx.actions.appendChild(h('a.btn', { href: '#/quotes' }, 'Back to quotes'));
        ui.clear(mount).appendChild(h('section.card', h('div.card__body', quoteDetail(res.data))));
      });
    },
  });

  function detailRow(label_, value) {
    return h('div', { style: 'display:flex;gap:12px;padding:7px 0;border-bottom:1px solid var(--line)' },
      h('div.muted', { style: 'width:170px;flex:none', text: label_ }),
      h('div', { style: 'flex:1;min-width:0' }, value));
  }

  function quoteDetail(q) {
    var notes = h('textarea', { rows: 4, value: q.internalNotes || '', placeholder: 'Notes for your team. Never shown to the customer.' });

    return h('div',
      detailRow('Name', h('strong', { text: q.name })),
      detailRow('Company', q.company || '—'),
      detailRow('Country', q.country || '—'),
      detailRow('Email', h('a', { href: 'mailto:' + q.email, text: q.email })),
      detailRow('WhatsApp', q.whatsapp
        ? h('a', { href: 'https://wa.me/' + q.whatsapp.replace(/[^\d]/g, ''), target: '_blank', rel: 'noopener noreferrer', text: q.whatsapp })
        : '—'),
      detailRow('Product', q.product ? q.product.productName + ' (' + q.product.sku + ')' : q.category || '—'),
      detailRow('Quantity', q.quantity != null ? String(q.quantity) : '—'),
      detailRow('Size', q.size || '—'),
      detailRow('Customisation', q.customizationRequired ? 'Yes' : 'No'),
      detailRow('Message', h('div', { style: 'white-space:pre-wrap', text: q.message || '—' })),
      detailRow('Logo file', q.logoFile
        ? h('a', { href: q.logoFile, target: '_blank', rel: 'noopener noreferrer' }, 'Open file')
        : '—'),
      detailRow('Design file', q.designFile
        ? h('a', { href: q.designFile, target: '_blank', rel: 'noopener noreferrer' }, 'Open file')
        : '—'),
      detailRow('Received', ui.dateTime(q.createdAt)),
      detailRow('Status', statusSelect(QUOTE_STATUSES, q.status, function (next, el) {
        api.put('/api/admin/quotes/' + q.id, { status: next })
          .then(function () { ui.toast('Status updated', 'ok'); Admin.refreshCounts(); })
          .catch(function (err) { el.value = q.status; ui.toast(err.message, 'error'); });
      })),
      h('div', { style: 'margin-top:16px' },
        h('label.field__label', { text: 'Internal notes' }),
        notes,
        h('div', { style: 'margin-top:8px' },
          h('button.btn.btn--sm.btn--primary', {
            type: 'button',
            onclick: function () {
              api.put('/api/admin/quotes/' + q.id, { internalNotes: notes.value })
                .then(function () { ui.toast('Notes saved', 'ok'); })
                .catch(function (err) { ui.toast(err.message, 'error'); });
            },
          }, 'Save notes'))));
  }

  function openQuote(q, reload) {
    api.get('/api/admin/quotes/' + q.id).then(function (res) {
      ui.modal({ title: 'Quote request', confirmLabel: 'Close', cancelLabel: 'Cancel', body: quoteDetail(res.data) })
        .then(function () { reload(); });
    });
  }

  /* -------------------------------------------------------- messages ---- */

  Admin.route('/messages', {
    title: 'Contact Messages',
    subtitle: 'Messages from the contact form',
    render: listView({
      endpoint: '/api/admin/messages',
      statuses: MESSAGE_STATUSES,
      searchPlaceholder: 'Search name, email, subject…',
      emptyTitle: 'No messages',
      emptyBody: 'Submissions from the contact form will appear here.',
      columns: ['From', 'Company', 'Subject', 'Received', 'Status', ''],
      row: function (m, reload) {
        return h('tr',
          h('td', h('strong', { text: m.name }), h('div', h('a', { href: 'mailto:' + m.email, text: m.email }))),
          h('td', { text: m.company || '—' }),
          h('td.truncate', { text: m.subject || '—' }),
          h('td.muted', { style: 'white-space:nowrap', text: ui.date(m.createdAt) }),
          h('td', statusSelect(MESSAGE_STATUSES, m.status, function (next, el) {
            api.put('/api/admin/messages/' + m.id, { status: next })
              .then(function () { ui.toast('Status updated', 'ok'); Admin.refreshCounts(); })
              .catch(function (err) { el.value = m.status; ui.toast(err.message, 'error'); });
          })),
          h('td', h('div.cell-actions',
            h('button.btn.btn--sm', {
              type: 'button',
              onclick: function () {
                api.get('/api/admin/messages/' + m.id).then(function (res) {
                  var d = res.data;
                  ui.modal({
                    title: d.subject || 'Message',
                    confirmLabel: 'Close',
                    cancelLabel: 'Cancel',
                    body: h('div',
                      detailRow('From', h('strong', { text: d.name })),
                      detailRow('Email', h('a', { href: 'mailto:' + d.email, text: d.email })),
                      detailRow('Company', d.company || '—'),
                      detailRow('WhatsApp', d.whatsapp || '—'),
                      detailRow('Received', ui.dateTime(d.createdAt)),
                      h('div', { style: 'margin-top:12px;white-space:pre-wrap', text: d.message })),
                  }).then(function () { Admin.refreshCounts(); reload(); });
                });
              },
            }, 'Read'))));
      },
    }),
  });
})();
