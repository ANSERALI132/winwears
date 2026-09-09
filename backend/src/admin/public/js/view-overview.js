/* ==========================================================================
   Admin — Command centre
   The first screen. Answers "what needs my attention" and very little else.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  /** The greeting is worked out in the browser, not on the server: it should
   *  match the clock of the person reading it, not the machine's. */
  function greeting() {
    var hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function relative(value) {
    var then = new Date(value).getTime();
    var mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hours = Math.round(mins / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.round(hours / 24);
    return days + 'd ago';
  }

  Admin.route('/', {
    title: 'Command centre',
    subtitle: 'What needs attention today',
    render: function (mount) {
      var head = h('section.hero');
      var name = (Admin.state.user && Admin.state.user.name) || 'WIN WEARS';
      head.appendChild(h('h1.hero__greeting', greeting() + ', ' + name));
      var headline = h('p.hero__line', 'Checking what needs you…');
      head.appendChild(headline);
      mount.appendChild(head);

      var prioritySlot = h('div');
      var statsSlot = h('div');
      var pulseSlot = h('section.card');
      mount.appendChild(prioritySlot);
      mount.appendChild(statsSlot);
      mount.appendChild(pulseSlot);

      function loadPulse() {
        ui.clear(pulseSlot);
        pulseSlot.appendChild(h('div.card__head', h('h2', { text: 'Live activity' })));
        var body = h('div.card__body');
        body.appendChild(ui.skeleton(4));
        pulseSlot.appendChild(body);

        return api.get('/api/admin/dashboard/pulse')
          .then(function (res) {
            ui.clear(body);
            if (!res.data.length) {
              body.appendChild(ui.empty('Nothing has happened yet',
                'Quote requests, messages, assistant conversations and pipeline moves appear here as they happen.'));
              return;
            }
            var list = h('div.pulse');
            res.data.forEach(function (e) {
              var row = h('div.pulse__row.pulse__row--' + e.kind);
              row.appendChild(h('div.pulse__when', relative(e.at)));
              var bodyEl = h('div.pulse__body');
              if (e.href) {
                var a = h('a.pulse__title', e.title);
                a.href = e.href;
                bodyEl.appendChild(a);
              } else {
                bodyEl.appendChild(h('div.pulse__title', e.title));
              }
              if (e.detail) bodyEl.appendChild(h('div.pulse__detail', e.detail));
              row.appendChild(bodyEl);
              list.appendChild(row);
            });
            body.appendChild(list);
          })
          .catch(function (err) { ui.clear(body).appendChild(ui.errorState(err, loadPulse)); });
      }

      function load() {
        ui.clear(prioritySlot).appendChild(ui.skeleton(3));

        return api.get('/api/admin/dashboard')
          .then(function (res) {
            var d = res.data;
            ui.clear(prioritySlot);
            ui.clear(statsSlot);

            /* --- what needs attention --- */
            var urgent = d.priorities.filter(function (p) { return p.severity === 'urgent'; });
            var total = d.priorities.reduce(function (sum, p) { return sum + p.count; }, 0);

            headline.textContent = !d.priorities.length
              ? 'Nothing is waiting on you. The catalogue is live and no enquiry is unanswered.'
              : urgent.length
                ? urgent.reduce(function (s, p) { return s + p.count; }, 0) + ' thing(s) need you now, ' + total + ' in total.'
                : total + ' thing(s) could use a look. Nothing is urgent.';

            if (d.priorities.length) {
              var list = h('div.priorities');
              d.priorities.forEach(function (p) {
                var row = h('a.priority.priority--' + p.severity);
                row.href = p.href;
                row.appendChild(h('span.priority__count', String(p.count)));
                var textCol = h('span.priority__text');
                textCol.appendChild(h('span.priority__title', p.title));
                textCol.appendChild(h('span.priority__detail', p.detail));
                row.appendChild(textCol);
                row.appendChild(h('span.priority__go', '→'));
                list.appendChild(row);
              });
              prioritySlot.appendChild(list);
            }

            /* --- the week, and what the system is not tracking --- */
            var grid = h('div.grid.grid--stats');
            [
              ['New leads this week', d.week.newLeads, '#/crm/leads'],
              ['New customers this week', d.week.newCustomers, '#/crm'],
              ['Quote requests this week', d.week.newQuoteRequests, '#/quotes'],
              ['Open opportunities', d.pipeline.open, '#/crm/leads'],
              ['Customers on record', d.pipeline.customers, '#/crm'],
              ['Footballs published', d.catalogue.published, '#/products'],
              /* A true zero, not a missing module. The factory figures only
                 appear once orders exist, so an empty factory does not fill
                 this row with zeroes that read as a broken system. */
              ['Orders open', d.factory ? d.factory.openOrders : 0, '#/orders']
            ].forEach(function (row) {
              var card = h('a.card.stat');
              card.href = row[2];
              card.appendChild(h('div.stat__value', String(row[1])));
              card.appendChild(h('div.stat__label', row[0]));
              grid.appendChild(card);
            });
            statsSlot.appendChild(grid);

            /* Saying what is *not* here matters as much as what is: an owner
               who expects production figures should learn they were never
               switched on, rather than assume the system is broken. */
            if (d.notConfigured && d.notConfigured.length) {
              statsSlot.appendChild(h('p.card__hint',
                'Not tracked yet: ' + d.notConfigured.join(', ') +
                '. Those modules are not switched on, so nothing about them is shown here rather than showing zeroes.'));
            }
          })
          .catch(function (err) {
            headline.textContent = 'Could not load the dashboard.';
            ui.clear(prioritySlot).appendChild(ui.errorState(err, load));
          });
      }

      return Promise.all([load(), loadPulse()]);
    },
  });
})();
