/* ==========================================================================
   Admin — System health
   What is working, and what is quietly wrong.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  var WORDS = {
    ok: 'Working',
    warn: 'Needs a look',
    fail: 'Broken',
    off: 'Switched off',
  };

  function row(check) {
    var item = h('div.health');
    item.appendChild(h('span.health__dot.health__dot--' + check.level, { 'aria-hidden': 'true' }));

    var body = h('div.health__body');
    var title = h('div.health__title');
    title.appendChild(h('span', { text: check.label }));
    title.appendChild(h('span.health__state.health__state--' + check.level, { text: WORDS[check.level] || check.level }));
    body.appendChild(title);
    body.appendChild(h('div.health__detail', { text: check.detail }));

    if (check.href) {
      /* Only in-dashboard routes reach here, and they are written by the
         server — checked anyway, because this is where it becomes an href. */
      if (/^#\/[A-Za-z0-9/_\-?=&.]*$/.test(check.href)) {
        body.appendChild(h('a.health__go', { href: check.href }, 'Go and look →'));
      }
    }

    item.appendChild(body);
    return item;
  }

  Admin.route('/health', {
    title: 'System health',
    subtitle: 'What is working, and what is quietly wrong',
    render: function (mount) {
      var host = h('div');
      ui.clear(mount).appendChild(host);

      function load() {
        ui.clear(host).appendChild(ui.skeleton(5));
        return api.get('/api/admin/stats/health')
          .then(function (res) {
            var d = res.data;
            ui.clear(host);

            var head = h('section.card');
            head.appendChild(h('h2.card__title',
              d.level === 'ok' ? 'Everything is working'
                : d.level === 'warn' ? 'Working, but some things need a look'
                : 'Something is broken'));
            head.appendChild(h('p.card__hint', {
              text: 'Checked ' + ui.dateTime(d.checkedAt)
                + '. Nothing here is cached — a health report from a minute ago is not a health report.',
            }));
            head.appendChild(h('div.card__foot',
              h('button.btn.btn--sm', { type: 'button', onclick: load }, 'Check again')));
            host.appendChild(head);

            var services = h('section.card');
            services.appendChild(h('h2.card__title', 'Services'));
            services.appendChild(h('p.card__hint',
              '“Switched off” is a choice, not a fault — a module nobody has configured is not a problem.'));
            d.services.forEach(function (c) { services.appendChild(row(c)); });
            host.appendChild(services);

            var integrity = h('section.card');
            integrity.appendChild(h('h2.card__title', 'The data itself'));
            integrity.appendChild(h('p.card__hint',
              'Not outages — the quiet inconsistencies a system this size collects. Nothing else in the admin goes looking for these.'));
            d.integrity.forEach(function (c) { integrity.appendChild(row(c)); });
            host.appendChild(integrity);

            var env = h('section.card');
            env.appendChild(h('h2.card__title', 'This installation'));
            var grid = h('div.grid.grid--2');
            [
              ['Node', d.environment.node],
              ['Mode', d.environment.mode],
              ['Up for', d.environment.uptimeMinutes + ' minutes'],
              ['File storage', d.environment.storageProvider],
            ].forEach(function (pair) {
              grid.appendChild(h('div.field',
                h('div.field__label', { text: pair[0] }),
                h('div', { text: String(pair[1]) })));
            });
            env.appendChild(grid);
            env.appendChild(h('p.card__hint',
              'There is also an unauthenticated check at /api/health for an uptime monitor. It answers 200 or 503 and says nothing else about this installation.'));
            host.appendChild(env);
          })
          .catch(function (err) { ui.clear(host).appendChild(ui.errorState(err, load)); });
      }

      return load();
    },
  });
})();
