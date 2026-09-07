/* ==========================================================================
   Admin — Overview
   Every number here is a live count from the database. Nothing is estimated.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;

  function stat(label, value, note, alert) {
    return h(
      'div.card.stat',
      { class: alert ? 'stat--alert' : '' },
      h('div.stat__label', { text: label }),
      h('div.stat__value', { text: String(value) }),
      note ? h('div.stat__note', { text: note }) : null,
    );
  }

  Admin.route('/', {
    title: 'Overview',
    subtitle: 'Live figures from the catalogue and inbox',
    render: function (mount) {
      return Admin.api.get('/api/admin/stats').then(function (res) {
        var d = res.data;
        ui.clear(mount);

        mount.appendChild(
          h(
            'div.grid.grid--stats',
            stat('Total products', d.products.total, 'Excluding archived'),
            stat('Published', d.products.published, 'Live on the website'),
            stat('Drafts', d.products.drafts, 'Not yet visible'),
            stat('Categories', d.categories.total, d.categories.active + ' active'),
            stat('Quote requests', d.quotes.total, d.quotes.new + ' new', d.quotes.new > 0),
            stat('Messages', d.messages.total, d.messages.new + ' unread', d.messages.new > 0),
          ),
        );

        /* The one thing worth interrupting for: a published product with no
           photograph renders as an empty card on the public site. */
        if (d.products.withoutImages > 0) {
          mount.appendChild(
            h(
              'div',
              { style: 'margin-top:14px' },
              ui.notice(
                'warn',
                d.products.withoutImages +
                  ' published product' +
                  (d.products.withoutImages === 1 ? ' has' : 's have') +
                  ' no image yet. They will show as blank cards on the website.',
              ),
            ),
          );
        }

        var panels = h('div.grid.grid--2', { style: 'margin-top:14px' });

        /* --- recent quotes --- */
        var quoteBody = d.recentQuotes.length
          ? h(
              'div.table-wrap',
              h(
                'table',
                h('thead', h('tr', h('th', 'Customer'), h('th', 'Country'), h('th', 'Status'), h('th', 'Received'))),
                h(
                  'tbody',
                  d.recentQuotes.map(function (q) {
                    return h(
                      'tr',
                      {
                        style: 'cursor:pointer',
                        onclick: function () { Admin.go('/quotes/' + q.id); },
                      },
                      h('td', h('strong', { text: q.name }), q.company ? h('div.muted', { text: q.company }) : null),
                      h('td', { text: q.country || '—' }),
                      h('td', ui.statusPill(q.status)),
                      h('td.muted', { text: ui.date(q.createdAt) }),
                    );
                  }),
                ),
              ),
            )
          : ui.empty('No quote requests yet', 'Submissions from the website will appear here.');

        panels.appendChild(
          h(
            'section.card',
            h(
              'div.card__head',
              h('h2', { text: 'Latest quote requests' }),
              h('a.btn.btn--sm', { href: '#/quotes' }, 'View all'),
            ),
            quoteBody,
          ),
        );

        /* --- recent activity --- */
        var activityBody = d.recentActivity.length
          ? h(
              'div.card__body',
              d.recentActivity.map(function (a) {
                return h(
                  'div',
                  { style: 'display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)' },
                  h('div', { style: 'flex:1;min-width:0' },
                    h('div', { text: (a.admin ? a.admin.name : 'System') + ' ' + a.action + ' ' + a.entity }),
                    a.summary ? h('div.muted.truncate', { text: a.summary }) : null),
                  h('div.muted', { style: 'white-space:nowrap;font-size:12px', text: ui.date(a.createdAt) }),
                );
              }),
            )
          : ui.empty('Nothing yet', 'Changes made in this dashboard will be listed here.');

        panels.appendChild(
          h(
            'section.card',
            h(
              'div.card__head',
              h('h2', { text: 'Recent activity' }),
              h('a.btn.btn--sm', { href: '#/activity' }, 'View all'),
            ),
            activityBody,
          ),
        );

        mount.appendChild(panels);

        mount.appendChild(
          h(
            'div.card',
            { style: 'margin-top:14px' },
            h('div.card__head', h('h2', { text: 'Quick actions' })),
            h(
              'div.card__body',
              { style: 'display:flex;gap:8px;flex-wrap:wrap' },
              h('a.btn.btn--accent', { href: '#/products/new' }, 'Add product'),
              h('a.btn', { href: '#/categories' }, 'Manage categories'),
              h('a.btn', { href: '#/settings' }, 'Site settings'),
              h('a.btn', { href: '/', target: '_blank', rel: 'noopener' }, 'View website'),
            ),
          ),
        );
      });
    },
  });
})();
