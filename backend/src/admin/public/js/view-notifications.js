/* ==========================================================================
   Admin — Notifications
   The bell in the topbar, the list behind it, and what each person wants to
   hear about.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  /** A notification's link is written by the server, which already refuses
   *  anything that is not an admin route. Checked again here because this is
   *  the line that turns it into an href. */
  function safeHref(href) {
    if (typeof href !== 'string' || !href) return null;
    return /^#\/[A-Za-z0-9/_\-?=&.]*$/.test(href) ? href : null;
  }

  function when(value) {
    var then = new Date(value);
    var mins = Math.round((Date.now() - then.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
    var hours = Math.round(mins / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    return ui.date(value);
  }

  /* ----------------------------------------------------------- the bell -- */

  /**
   * Builds the topbar bell.
   *
   * Called by the shell once, after sign-in. It polls the count rather than
   * the list — the badge is the only thing on screen until somebody opens it,
   * and fetching a page of rows every minute to render a number would be
   * waste.
   */
  Admin.notificationBell = function () {
    var count = h('span.bell__count', { hidden: true });
    var button = h('button.bell', { type: 'button', 'aria-label': 'Notifications' },
      h('span', { html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>' }),
      count);

    var panel = h('div.bell__panel', { hidden: true });
    var wrap = h('div.bell__wrap', button, panel);

    function refreshCount() {
      return api.get('/api/admin/notifications/unread-count')
        .then(function (res) {
          var n = res.data.unread || 0;
          count.textContent = n > 99 ? '99+' : String(n);
          count.hidden = n === 0;
        })
        .catch(function () { /* the badge is a nicety; never block on it */ });
    }

    function close() {
      panel.hidden = true;
      document.removeEventListener('click', onOutside, true);
    }

    function onOutside(e) {
      if (!wrap.contains(e.target)) close();
    }

    function open() {
      panel.hidden = false;
      document.addEventListener('click', onOutside, true);
      ui.clear(panel).appendChild(ui.skeleton(3));

      api.get('/api/admin/notifications?perPage=8')
        .then(function (res) {
          ui.clear(panel);

          var head = h('div.bell__head',
            h('strong', { text: 'Notifications' }),
            h('button.btn.btn--sm', {
              type: 'button',
              onclick: function () {
                api.post('/api/admin/notifications/read-all', {})
                  .then(function () { refreshCount(); open(); })
                  .catch(function (err) { ui.toast(err.message, 'error'); });
              },
            }, 'Mark all read'));
          panel.appendChild(head);

          if (!res.data.length) {
            panel.appendChild(h('p.bell__empty', { text: 'Nothing to report.' }));
          } else {
            res.data.forEach(function (n) {
              panel.appendChild(row(n, function () { refreshCount(); }));
            });
          }

          panel.appendChild(h('div.bell__foot',
            h('a.btn.btn--sm', { href: '#/notifications', onclick: close }, 'See them all')));
        })
        .catch(function (err) { ui.clear(panel).appendChild(ui.errorState(err, open)); });
    }

    button.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel.hidden) open();
      else close();
    });

    refreshCount();
    /* Same cadence as the unread badges on the nav. */
    setInterval(refreshCount, 60000);

    return wrap;
  };

  /** One line, in the panel or on the page. Clicking it marks it read and
   *  goes where it points. */
  function row(n, onRead) {
    var href = safeHref(n.href);
    var item = h(href ? 'a.notice-row' : 'div.notice-row');
    if (href) item.href = href;
    if (!n.readAt) item.classList.add('notice-row--unread');

    item.appendChild(h('div.notice-row__title', { text: n.title }));
    if (n.body) item.appendChild(h('div.notice-row__body', { text: n.body }));
    item.appendChild(h('div.notice-row__when', { text: when(n.createdAt) }));

    item.addEventListener('click', function () {
      if (n.readAt) return;
      api.patch('/api/admin/notifications/' + n.id + '/read', {})
        .then(function () {
          n.readAt = new Date().toISOString();
          item.classList.remove('notice-row--unread');
          if (onRead) onRead();
        })
        .catch(function () { /* going where it points matters more */ });
    });

    return item;
  }

  /* ----------------------------------------------------------- the page -- */

  Admin.route('/notifications', {
    title: 'Notifications',
    subtitle: 'What has happened while you were elsewhere',
    render: function (mount) {
      var state = { unreadOnly: '', page: 1, perPage: 50 };
      var card = h('section.card');
      var toolbar = h('div.toolbar');
      var slot = h('div');

      var unreadOnly = h('input', { type: 'checkbox' });
      unreadOnly.addEventListener('change', function () {
        state.unreadOnly = unreadOnly.checked ? '1' : '';
        load();
      });

      toolbar.appendChild(h('label.check', unreadOnly, h('span', 'Unread only')));
      toolbar.appendChild(h('button.btn.btn--sm', {
        type: 'button',
        onclick: function () {
          api.post('/api/admin/notifications/read-all', {})
            .then(function (res) { ui.toast(res.data.marked + ' marked read', 'ok'); load(); })
            .catch(function (err) { ui.toast(err.message, 'error'); });
        },
      }, 'Mark all read'));
      toolbar.appendChild(h('button.btn.btn--sm', {
        type: 'button',
        onclick: function () {
          ui.modal({
            title: 'Clear the ones you have read?',
            confirmLabel: 'Clear them',
            message: 'Unread notifications stay. Nothing else is affected — a notification is a note that something happened, not the record of it.',
          }).then(function (ok) {
            if (!ok) return;
            api.del('/api/admin/notifications/read')
              .then(function (res) { ui.toast(res.data.cleared + ' cleared', 'ok'); load(); })
              .catch(function (err) { ui.toast(err.message, 'error'); });
          });
        },
      }, 'Clear read'));
      toolbar.appendChild(h('a.btn.btn--sm', { href: '#/notifications/settings' }, 'What I hear about'));

      card.appendChild(toolbar);
      card.appendChild(slot);
      ui.clear(mount).appendChild(card);

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(4));
        return api.get('/api/admin/notifications' + api.qs(state))
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty(
                state.unreadOnly ? 'Nothing unread' : 'Nothing yet',
                state.unreadOnly
                  ? 'You are up to date.'
                  : 'Notifications appear here when an enquiry arrives, the assistant asks for a person, an inspection fails, or somebody puts a task on your list.'));
              return;
            }
            res.data.forEach(function (n) { slot.appendChild(row(n)); });
          })
          .catch(function (err) { ui.clear(slot).appendChild(ui.errorState(err, load)); });
      }

      return load();
    },
  });

  /* ------------------------------------------------------- preferences -- */

  Admin.route('/notifications/settings', {
    title: 'What I hear about',
    subtitle: 'Yours only — this does not change what anybody else sees',
    render: function (mount) {
      var card = h('section.card');
      card.appendChild(h('h2.card__title', 'Tell me when'));
      card.appendChild(h('p.card__hint',
        'Turning something off here stops it reaching you. Your colleagues carry on seeing it.'));
      var slot = h('div');
      card.appendChild(slot);
      card.appendChild(h('div.card__foot', h('a.btn.btn--sm', { href: '#/notifications' }, '← Back')));
      ui.clear(mount).appendChild(card);

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(3));
        return api.get('/api/admin/notifications/preferences')
          .then(function (res) {
            ui.clear(slot);
            res.data.forEach(function (pref) {
              var box = h('input', { type: 'checkbox', checked: pref.enabled });
              box.addEventListener('change', function () {
                box.disabled = true;
                api.put('/api/admin/notifications/preferences', {
                  kind: pref.kind, enabled: box.checked,
                })
                  .then(function () { ui.toast('Saved', 'ok'); box.disabled = false; })
                  .catch(function (err) {
                    ui.toast(err.message, 'error');
                    box.checked = !box.checked;
                    box.disabled = false;
                  });
              });
              slot.appendChild(h('label.check', box,
                h('span', h('span', { text: pref.label }), h('div.muted.tiny', { text: pref.detail }))));
            });
          })
          .catch(function (err) { ui.clear(slot).appendChild(ui.errorState(err, load)); });
      }

      return load();
    },
  });
})();
