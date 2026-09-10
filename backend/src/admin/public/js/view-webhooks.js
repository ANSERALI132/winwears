/* ==========================================================================
   Admin — Integrations
   Webhooks: tell somewhere else when something happens here.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  function statusText(hook) {
    if (!hook.lastAttemptAt) return 'Never called';
    if (hook.lastStatus && hook.lastStatus >= 200 && hook.lastStatus < 300) return 'Working';
    return 'Failing' + (hook.failures > 1 ? ' (' + hook.failures + ' in a row)' : '');
  }

  Admin.route('/integrations', {
    title: 'Integrations',
    subtitle: 'Tell another system when something happens here',
    render: function (mount) {
      var host = h('div');
      ui.clear(mount).appendChild(host);

      function load() {
        ui.clear(host).appendChild(ui.skeleton(4));
        return Promise.all([
          api.get('/api/admin/webhooks'),
          api.get('/api/admin/webhooks/events'),
        ])
          .then(function (results) {
            var hooks = results[0].data;
            var events = results[1].data.events;
            ui.clear(host);

            var intro = h('section.card');
            intro.appendChild(h('h2.card__title', 'Webhooks'));
            intro.appendChild(h('p.card__hint',
              'When something happens here — an order confirmed, an inspection failed — a webhook POSTs it as JSON to an address you choose. That works with Zapier, n8n, a spreadsheet script or your own system, without any of them needing an account here.'));
            intro.appendChild(h('p.card__hint',
              'Every call carries a signature made from the webhook’s secret, so the receiver can tell a real delivery from anybody who learned the URL.'));
            host.appendChild(intro);

            var list = h('section.card');
            list.appendChild(h('h2.card__title', 'Your webhooks'));
            if (!hooks.length) {
              list.appendChild(ui.empty('None set up',
                'Nothing is sent anywhere until you add one.'));
            } else {
              var table = h('table.table');
              table.appendChild(h('thead', h('tr',
                h('th', 'Name'), h('th', 'Where'), h('th', 'Events'),
                h('th', 'State'), h('th', 'Last called'), h('th'))));
              var body = h('tbody');
              hooks.forEach(function (hook) { body.appendChild(hookRow(hook, load)); });
              table.appendChild(body);
              list.appendChild(table);
            }
            list.appendChild(h('div.card__foot',
              h('a.btn.btn--accent', { href: '#/integrations/new' }, 'Add a webhook'),
              h('a.btn.btn--sm', { href: '#/integrations/deliveries' }, 'Delivery log')));
            host.appendChild(list);

            var ref = h('section.card');
            ref.appendChild(h('h2.card__title', 'What can be sent'));
            var ul = h('ul');
            events.forEach(function (e) { ul.appendChild(h('li', h('code', { text: e }))); });
            ref.appendChild(ul);
            ref.appendChild(h('p.card__hint',
              'Payloads carry references and figures, never a customer’s email address or phone number. A webhook sends business data to an outside address, and the customer did not agree to that.'));
            host.appendChild(ref);
          })
          .catch(function (err) { ui.clear(host).appendChild(ui.errorState(err, load)); });
      }

      return load();
    },
  });

  function hookRow(hook, reload) {
    var tr = h('tr');
    tr.appendChild(h('td', h('a', { href: '#/integrations/' + hook.id }, hook.name)));
    tr.appendChild(h('td', h('span.muted.tiny', { text: hook.url })));
    tr.appendChild(h('td', hook.events.length ? String(hook.events.length) : 'All'));
    tr.appendChild(h('td', hook.active ? statusText(hook) : 'Paused'));
    tr.appendChild(h('td', hook.lastAttemptAt ? ui.dateTime(hook.lastAttemptAt) : '—'));

    var cell = h('td.cell-actions');
    cell.appendChild(h('button.btn.btn--sm', {
      type: 'button',
      onclick: function () {
        api.post('/api/admin/webhooks/' + hook.id + '/test', {})
          .then(function (res) {
            ui.toast(res.data.ok
              ? 'The receiver accepted it (' + res.data.status + ').'
              : 'It failed: ' + (res.data.error || res.data.status), res.data.ok ? 'ok' : 'error');
            reload();
          })
          .catch(function (err) { ui.toast(err.message, 'error'); });
      },
    }, 'Send a test'));
    cell.appendChild(h('button.btn.btn--sm', {
      type: 'button',
      onclick: function () {
        api.put('/api/admin/webhooks/' + hook.id, { active: !hook.active })
          .then(function () { ui.toast(hook.active ? 'Paused' : 'Switched on', 'ok'); reload(); })
          .catch(function (err) { ui.toast(err.message, 'error'); });
      },
    }, hook.active ? 'Pause' : 'Switch on'));
    tr.appendChild(cell);

    return tr;
  }

  /* ------------------------------------------------------------ builder -- */

  function builder(mount, existing) {
    var isNew = !existing;
    var chosen = {};
    (existing ? existing.events : []).forEach(function (e) { chosen[e] = true; });

    var form = h('section.card');
    form.appendChild(h('h2.card__title', isNew ? 'Add a webhook' : 'Edit ' + existing.name));

    var name = h('input', { type: 'text', value: (existing && existing.name) || '', placeholder: 'Zapier — new orders' });
    var url = h('input', { type: 'url', value: (existing && existing.url) || '', placeholder: 'https://…' });
    var eventsHost = h('div');

    form.appendChild(h('div.field', h('label.field__label', { text: 'Name' }), name));
    form.appendChild(h('div.field', h('label.field__label', { text: 'POST to' }), url,
      h('p.field__hint', { text: 'https only, and it has to be reachable on the public internet — an address inside a private network is refused.' })));
    form.appendChild(h('h3.card__subtitle', 'Which events'));
    form.appendChild(h('p.card__hint', { text: 'Tick none to receive all of them, including any added later.' }));
    form.appendChild(eventsHost);

    var save = h('button.btn.btn--accent', { type: 'button' }, isNew ? 'Add it' : 'Save changes');
    save.addEventListener('click', function () {
      if (!name.value.trim()) { ui.toast('Give it a name.', 'error'); return; }
      if (!url.value.trim()) { ui.toast('Where should it POST to?', 'error'); return; }

      var events = Object.keys(chosen).filter(function (k) { return chosen[k]; });
      save.disabled = true;
      (isNew
        ? api.post('/api/admin/webhooks', { name: name.value.trim(), url: url.value.trim(), events: events })
        : api.put('/api/admin/webhooks/' + existing.id, { name: name.value.trim(), url: url.value.trim(), events: events }))
        .then(function (res) {
          ui.toast(isNew ? 'Webhook added' : 'Saved', 'ok');
          location.hash = '#/integrations/' + res.data.id;
        })
        .catch(function (err) { ui.toast(err.message, 'error'); save.disabled = false; });
    });

    form.appendChild(h('div.card__foot', save, h('a.btn.btn--sm', { href: '#/integrations' }, 'Cancel')));
    mount.appendChild(form);

    api.get('/api/admin/webhooks/events').then(function (res) {
      res.data.events.forEach(function (e) {
        var box = h('input', { type: 'checkbox', checked: Boolean(chosen[e]) });
        box.addEventListener('change', function () { chosen[e] = box.checked; });
        eventsHost.appendChild(h('label.check', box, h('span', h('code', { text: e }))));
      });
    }).catch(function () {});
  }

  Admin.route('/integrations/new', {
    title: 'Add a webhook',
    subtitle: 'Somewhere to send events',
    render: function (mount) { ui.clear(mount); builder(mount, null); },
  });

  /* ------------------------------------------------------------ one hook -- */

  Admin.route('/integrations/:id', {
    title: 'Webhook',
    subtitle: 'Where it sends, and what happened',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));
      return api.get('/api/admin/webhooks/' + encodeURIComponent(params.id))
        .then(function (res) {
          var hook = res.data;
          ui.clear(mount);
          mount.appendChild(h('a.btn.btn--sm', { href: '#/integrations' }, '← All webhooks'));

          builder(mount, hook);
          mount.appendChild(secretCard(hook));
          mount.appendChild(deliveriesCard(hook));

          mount.appendChild(h('section.card',
            h('h2.card__title', 'Remove it'),
            h('p.card__hint', 'Its delivery history goes with it. Nothing else is affected.'),
            h('div.card__foot', h('button.btn.btn--sm.btn--danger', {
              type: 'button',
              onclick: function () {
                ui.modal({
                  title: 'Delete ' + hook.name + '?',
                  danger: true,
                  confirmLabel: 'Delete',
                  message: 'Nothing will be sent to this address again.',
                }).then(function (ok) {
                  if (!ok) return;
                  api.del('/api/admin/webhooks/' + hook.id)
                    .then(function () { ui.toast('Deleted', 'ok'); location.hash = '#/integrations'; })
                    .catch(function (err) { ui.toast(err.message, 'error'); });
                });
              },
            }, 'Delete this webhook'))));
        });
    },
  });

  function secretCard(hook) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'Signing secret'));
    card.appendChild(h('p.card__hint',
      'Every call carries X-WinWears-Signature: sha256=… — an HMAC of the timestamp and the body, made with this secret. Check it on your side before acting on a delivery, or anybody who learns the URL can send you anything.'));

    var value = h('code.secret', { text: '••••••••••••••••••••' });
    var shown = false;
    var reveal = h('button.btn.btn--sm', { type: 'button' }, 'Show');
    reveal.addEventListener('click', function () {
      shown = !shown;
      value.textContent = shown ? hook.secret : '••••••••••••••••••••';
      reveal.textContent = shown ? 'Hide' : 'Show';
    });

    var rotate = h('button.btn.btn--sm.btn--danger', { type: 'button' }, 'Replace it');
    rotate.addEventListener('click', function () {
      ui.modal({
        title: 'Replace the secret?',
        danger: true,
        confirmLabel: 'Replace it',
        message: 'Anything checking signatures with the old secret will start rejecting deliveries until you update it there too.',
      }).then(function (ok) {
        if (!ok) return;
        api.post('/api/admin/webhooks/' + hook.id + '/rotate', {})
          .then(function (res) {
            hook.secret = res.data.secret;
            shown = true;
            value.textContent = hook.secret;
            reveal.textContent = 'Hide';
            ui.toast('New secret. Copy it to the other side.', 'ok');
          })
          .catch(function (err) { ui.toast(err.message, 'error'); });
      });
    });

    card.appendChild(h('div.chip-row', value, reveal, rotate));
    return card;
  }

  function deliveriesCard(hook) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', 'Recent deliveries'));
    card.appendChild(h('p.card__hint',
      'Every attempt, kept — because "why did my integration not fire" is the only question ever asked about a webhook. A failure is retried a few times over the next hour, and can be sent again by hand.'));

    if (!hook.deliveries.length) {
      card.appendChild(h('p.muted', { text: 'Nothing sent yet.' }));
      return card;
    }

    var table = h('table.table');
    table.appendChild(h('thead', h('tr',
      h('th', 'When'), h('th', 'Event'), h('th', 'Result'), h('th', 'Tries'), h('th'))));
    var body = h('tbody');
    hook.deliveries.forEach(function (d) {
      var ok = d.status && d.status >= 200 && d.status < 300;
      var tr = h('tr');
      tr.appendChild(h('td', ui.dateTime(d.createdAt)));
      tr.appendChild(h('td', h('code', { text: d.event })));
      tr.appendChild(h('td', ok
        ? String(d.status)
        : h('span', h('strong', { text: d.status ? String(d.status) : 'failed' }),
            d.error ? h('div.muted.tiny', { text: d.error }) : null)));
      tr.appendChild(h('td', String(d.attempts)));
      tr.appendChild(h('td.cell-actions', ok ? h('span') : h('button.btn.btn--sm', {
        type: 'button',
        onclick: function () {
          api.post('/api/admin/webhooks/deliveries/' + d.id + '/resend', {})
            .then(function (res) {
              ui.toast(res.data.ok ? 'Sent' : 'Still failing: ' + (res.data.error || res.data.status),
                res.data.ok ? 'ok' : 'error');
              Admin.refresh();
            })
            .catch(function (err) { ui.toast(err.message, 'error'); });
        },
      }, 'Send again')));
      body.appendChild(tr);
    });
    table.appendChild(body);
    card.appendChild(table);
    return card;
  }

  /* --------------------------------------------------------- everything -- */

  Admin.route('/integrations/deliveries', {
    title: 'Deliveries',
    subtitle: 'Everything sent, and what came back',
    render: function (mount) {
      var state = { failedOnly: '', page: 1, perPage: 50 };
      var card = h('section.card');
      var slot = h('div');

      var failed = h('input', { type: 'checkbox' });
      failed.addEventListener('change', function () {
        state.failedOnly = failed.checked ? '1' : '';
        state.page = 1;
        load();
      });

      card.appendChild(h('div.toolbar',
        h('label.check', failed, h('span', 'Failures only')),
        h('a.btn.btn--sm', { href: '#/integrations' }, '← Webhooks')));
      card.appendChild(slot);
      ui.clear(mount).appendChild(card);

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(4));
        return api.get('/api/admin/webhooks/deliveries/all' + api.qs(state))
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty(
                state.failedOnly ? 'Nothing has failed' : 'Nothing sent yet',
                state.failedOnly
                  ? 'Every delivery has been accepted.'
                  : 'Deliveries appear here once a webhook is set up and an event happens.'));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', 'When'), h('th', 'Webhook'), h('th', 'Event'), h('th', 'Result'), h('th', 'Tries'))));
            var body = h('tbody');
            res.data.forEach(function (d) {
              var ok = d.status && d.status >= 200 && d.status < 300;
              body.appendChild(h('tr',
                h('td', ui.dateTime(d.createdAt)),
                h('td', d.webhook ? h('a', { href: '#/integrations/' + d.webhook.id }, d.webhook.name) : '—'),
                h('td', h('code', { text: d.event })),
                h('td', ok ? String(d.status) : h('strong', { text: d.status ? String(d.status) : 'failed' })),
                h('td', String(d.attempts))));
            });
            table.appendChild(body);
            slot.appendChild(table);
          })
          .catch(function (err) { ui.clear(slot).appendChild(ui.errorState(err, load)); });
      }

      return load();
    },
  });
})();
