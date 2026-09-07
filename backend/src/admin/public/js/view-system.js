/* ==========================================================================
   Admin — Settings, admin users, activity log
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  var GROUP_TITLES = {
    company: 'Company',
    contact: 'Contact details',
    social: 'Social links',
    footer: 'Footer',
    seo: 'Default SEO',
    homepage: 'Homepage',
  };

  /* -------------------------------------------------------- settings ---- */

  Admin.route('/settings', {
    title: 'Settings',
    subtitle: 'Business details the website reads from the database',
    render: function (mount, _params, ctx) {
      return api.get('/api/admin/settings').then(function (res) {
        var values = res.data.values;
        var definitions = res.data.definitions;
        var inputs = {};
        var errorSlot = h('div');

        var canEdit = Admin.state.user.role === 'ADMIN';

        var groups = {};
        definitions.forEach(function (d) {
          if (!groups[d.group]) groups[d.group] = [];
          groups[d.group].push(d);
        });

        var form = h('form', { novalidate: true, onsubmit: function (e) { e.preventDefault(); save(); } }, errorSlot);

        if (!canEdit) {
          form.appendChild(ui.notice('info', 'Only an administrator can change these. You can read them here.'));
        }

        Object.keys(groups).forEach(function (group) {
          var body = h('div.card__body');
          groups[group].forEach(function (d) {
            var long = d.key === 'seo.defaultDescription' || d.key === 'footer.text';
            var control = long
              ? h('textarea', { rows: 2, value: values[d.key] || '', disabled: !canEdit })
              : h('input', { type: 'text', value: values[d.key] || '', disabled: !canEdit });
            inputs[d.key] = control;
            body.appendChild(h('div.field',
              h('label.field__label', { text: d.label }),
              control,
              h('p.field__hint', { text: d.key })));
          });

          form.appendChild(h('section.card', { style: 'margin-bottom:14px' },
            h('div.card__head', h('h2', { text: GROUP_TITLES[group] || group })), body));
        });

        var saveBtn = h('button.btn.btn--accent', { type: 'submit', disabled: !canEdit }, 'Save settings');
        form.appendChild(h('div', { style: 'display:flex;gap:8px' }, saveBtn));

        function save() {
          ui.clear(errorSlot);
          var payload = {};
          Object.keys(inputs).forEach(function (k) { payload[k] = inputs[k].value.trim(); });

          saveBtn.disabled = true;
          api
            .put('/api/admin/settings', { values: payload })
            .then(function () { ui.toast('Settings saved', 'ok'); })
            .catch(function (err) { errorSlot.appendChild(ui.notice('error', err.message)); })
            .finally(function () { saveBtn.disabled = !canEdit; });
        }

        ui.clear(mount).appendChild(form);
        ctx.actions.appendChild(
          h('button.btn', { type: 'button', onclick: changePassword }, 'Change my password'),
        );
      });
    },
  });

  function changePassword() {
    var current = h('input', { type: 'password', autocomplete: 'current-password' });
    var next = h('input', { type: 'password', autocomplete: 'new-password' });
    var again = h('input', { type: 'password', autocomplete: 'new-password' });
    var errorSlot = h('div');

    ui.modal({
      title: 'Change your password',
      confirmLabel: 'Change password',
      body: h('form', { novalidate: true },
        errorSlot,
        h('div.field', h('label.field__label', { text: 'Current password' }), current),
        h('div.field', h('label.field__label', { text: 'New password' }), next,
          h('p.field__hint', { text: 'At least 12 characters. A passphrase is easier to remember and harder to guess.' })),
        h('div.field', h('label.field__label', { text: 'Repeat new password' }), again)),
    }).then(function (ok) {
      if (!ok) return;
      if (next.value !== again.value) return ui.toast('The two new passwords do not match.', 'error');

      api
        .post('/api/auth/change-password', { currentPassword: current.value, newPassword: next.value })
        .then(function () { ui.toast('Password changed. Other sessions were signed out.', 'ok'); })
        .catch(function (err) { ui.toast(err.message, 'error'); });
    });
  }

  /* ----------------------------------------------------------- users ---- */

  Admin.route('/users', {
    title: 'Admin Users',
    subtitle: 'Who can sign in to this dashboard',
    render: function (mount, _params, ctx) {
      if (Admin.state.user.role !== 'ADMIN') {
        ui.clear(mount).appendChild(
          ui.empty('Administrators only', 'Your account does not have access to this section.'),
        );
        return Promise.resolve();
      }

      ctx.actions.appendChild(
        h('button.btn.btn--accent', { type: 'button', onclick: function () { edit(null); } }, 'Add user'),
      );

      var slot = h('div');
      ui.clear(mount).appendChild(h('section.card', slot));
      return load();

      function load() {
        ui.clear(slot).appendChild(h('div', { style: 'padding:16px' }, ui.skeleton(3)));
        return api
          .get('/api/admin/users')
          .then(function (res) { draw(res.data); })
          .catch(function (err) { ui.clear(slot).appendChild(ui.errorState(err, load)); });
      }

      function draw(rows) {
        ui.clear(slot);
        slot.appendChild(h('div.table-wrap',
          h('table',
            h('thead', h('tr', h('th', 'Name'), h('th', 'Email'), h('th', 'Role'), h('th', 'Active'),
              h('th', 'Last signed in'), h('th.right', 'Actions'))),
            h('tbody', rows.map(function (u) {
              var isMe = u.id === Admin.state.user.id;
              return h('tr',
                h('td', h('strong', { text: u.name }), isMe ? h('span.pill.pill--info', { text: 'You' }) : null),
                h('td', { text: u.email }),
                h('td', h('span.pill', { class: u.role === 'ADMIN' ? 'pill--info' : '', text: u.role })),
                h('td', h('span.pill', { class: u.active ? 'pill--ok' : 'pill--archived', text: u.active ? 'Active' : 'Disabled' })),
                h('td.muted', { text: ui.dateTime(u.lastLoginAt) }),
                h('td', h('div.cell-actions',
                  h('button.btn.btn--sm', { type: 'button', onclick: function () { edit(u); } }, 'Edit'),
                  isMe ? null : h('button.btn.btn--sm.btn--danger', {
                    type: 'button',
                    onclick: function () {
                      ui.confirmDelete(u.name + ' (' + u.email + ')', 'This cannot be undone.').then(function (ok) {
                        if (!ok) return;
                        api.del('/api/admin/users/' + u.id)
                          .then(function () { ui.toast('User removed', 'ok'); return load(); })
                          .catch(function (err) { ui.toast(err.message, 'error'); });
                      });
                    },
                  }, 'Delete'))));
            })))));
      }

      function edit(user) {
        var isNew = !user;
        var u = user || {};

        var name = h('input', { type: 'text', value: u.name || '' });
        var email = h('input', { type: 'email', value: u.email || '', autocomplete: 'off' });
        var password = h('input', { type: 'password', autocomplete: 'new-password' });
        var role = h('select', {},
          h('option', { value: 'EDITOR', selected: u.role === 'EDITOR' }, 'Editor — manage the catalogue'),
          h('option', { value: 'ADMIN', selected: u.role === 'ADMIN' }, 'Admin — full access'));
        var active = h('input', { type: 'checkbox', checked: u.active !== false });

        ui.modal({
          title: isNew ? 'Add admin user' : 'Edit user',
          confirmLabel: isNew ? 'Create' : 'Save',
          body: h('form', { novalidate: true },
            h('div.field.field--req', h('label.field__label', { text: 'Name' }), name),
            h('div.field.field--req', h('label.field__label', { text: 'Email' }), email),
            h('div.field', { class: isNew ? 'field--req' : '' },
              h('label.field__label', { text: isNew ? 'Password' : 'New password' }), password,
              h('p.field__hint', {
                text: isNew
                  ? 'At least 12 characters.'
                  : 'Leave blank to keep the current password. Changing it signs this user out everywhere.',
              })),
            h('div.field', h('label.field__label', { text: 'Role' }), role),
            h('label.check', active, h('span', { text: 'Active — can sign in' }))),
        }).then(function (ok) {
          if (!ok) return;

          var body = {
            name: name.value.trim(),
            email: email.value.trim(),
            role: role.value,
            active: active.checked,
          };
          if (password.value) body.password = password.value;

          var request = isNew
            ? api.post('/api/admin/users', body)
            : api.put('/api/admin/users/' + u.id, body);

          request
            .then(function () { ui.toast(isNew ? 'User created' : 'User saved', 'ok'); return load(); })
            .catch(function (err) { ui.toast(err.message, 'error'); });
        });
      }
    },
  });

  /* -------------------------------------------------------- activity ---- */

  Admin.route('/activity', {
    title: 'Activity Log',
    subtitle: 'Who changed what, and when',
    render: function (mount) {
      var state = { page: 1, perPage: 50, entity: '' };
      var slot = h('div');
      var card = h('section.card');
      var toolbar = h('div.toolbar');

      toolbar.appendChild(h('select', {
        'aria-label': 'Filter by type',
        onchange: function (e) { state.entity = e.target.value; state.page = 1; load(); },
      }, h('option', { value: '' }, 'Everything'),
        ['product', 'category', 'quote', 'message', 'user', 'settings'].map(function (e) {
          return h('option', { value: e }, e.charAt(0).toUpperCase() + e.slice(1));
        })));

      card.appendChild(toolbar);
      card.appendChild(slot);
      ui.clear(mount).appendChild(card);
      return load();

      function load() {
        ui.clear(slot).appendChild(h('div', { style: 'padding:16px' }, ui.skeleton(8)));
        return api
          .get('/api/admin/activity' + api.qs(state))
          .then(function (res) { draw(res.data, res.meta); })
          .catch(function (err) { ui.clear(slot).appendChild(ui.errorState(err, load)); });
      }

      function draw(rows, meta) {
        ui.clear(slot);

        if (!rows.length) {
          slot.appendChild(ui.empty('Nothing recorded yet', 'Changes made in this dashboard will be listed here.'));
          return;
        }

        slot.appendChild(h('div.table-wrap',
          h('table',
            h('thead', h('tr', h('th', 'When'), h('th', 'Who'), h('th', 'Action'), h('th', 'Type'), h('th', 'Detail'))),
            h('tbody', rows.map(function (a) {
              return h('tr',
                h('td.muted', { style: 'white-space:nowrap', text: ui.dateTime(a.createdAt) }),
                h('td', { text: a.admin ? a.admin.name : 'System' }),
                h('td', h('span.pill', { text: a.action.replace('_', ' ') })),
                h('td.mono', { text: a.entity }),
                h('td.truncate', { text: a.summary || '—' }));
            })))));

        slot.appendChild(h('div.pager',
          h('span.pager__info', { text: meta.total + ' entries' }),
          h('button.btn.btn--sm', { type: 'button', disabled: meta.page <= 1,
            onclick: function () { state.page -= 1; load(); } }, 'Previous'),
          h('span.muted', { text: 'Page ' + meta.page + ' of ' + meta.totalPages }),
          h('button.btn.btn--sm', { type: 'button', disabled: meta.page >= meta.totalPages,
            onclick: function () { state.page += 1; load(); } }, 'Next')));
      }
    },
  });
})();
