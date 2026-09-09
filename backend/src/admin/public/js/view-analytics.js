/* ==========================================================================
   Admin — Reports
   Charts drawn by hand as SVG. No charting library: this project has no
   bundler and adds no CDN tags, and a bar chart is thirty lines of maths.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  var label = Admin.doc.label;
  var money = Admin.doc.money;

  var SVG = 'http://www.w3.org/2000/svg';

  function svgEl(name, attrs) {
    var el = document.createElementNS(SVG, name);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, String(attrs[k])); });
    return el;
  }

  /** A percentage, or an honest dash. Null means it could not be measured,
   *  which is a different statement from zero. */
  function pct(value) {
    return value === null || value === undefined ? '—' : value + '%';
  }

  /**
   * A bar chart.
   *
   * Renders nothing but a sentence when every value is zero: an axis with no
   * bars on it looks like a chart that failed to load, and the point of this
   * screen is that a quiet month is visible as a quiet month, not as a bug.
   */
  function barChart(labels, values, options) {
    var opts = options || {};
    var max = Math.max.apply(null, values.concat([0]));
    if (max <= 0) {
      return h('p.muted', { text: opts.empty || 'Nothing recorded in this period.' });
    }

    var width = 720;
    var height = 200;
    var padLeft = 46;
    var padBottom = 26;
    var padTop = 10;
    var plotW = width - padLeft - 10;
    var plotH = height - padBottom - padTop;
    var slot = plotW / values.length;
    var barW = Math.max(3, Math.min(38, slot * 0.62));

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      class: 'chart',
      role: 'img',
      'aria-label': opts.title || 'Chart',
    });

    /* Three gridlines and their values, so a bar can be read as a number
       rather than only compared with its neighbours. */
    [0, 0.5, 1].forEach(function (fraction) {
      var y = padTop + plotH - plotH * fraction;
      svg.appendChild(svgEl('line', {
        x1: padLeft, y1: y, x2: width - 10, y2: y, class: 'chart__grid',
      }));
      var tick = svgEl('text', { x: padLeft - 6, y: y + 3, class: 'chart__tick', 'text-anchor': 'end' });
      tick.textContent = opts.format ? opts.format(max * fraction) : String(Math.round(max * fraction));
      svg.appendChild(tick);
    });

    values.forEach(function (value, i) {
      var barH = Math.max(0, (value / max) * plotH);
      var x = padLeft + slot * i + (slot - barW) / 2;
      var rect = svgEl('rect', {
        x: x, y: padTop + plotH - barH, width: barW, height: barH,
        rx: 2, class: 'chart__bar' + (opts.warn ? ' chart__bar--warn' : ''),
      });
      var title = svgEl('title');
      title.textContent = labels[i] + ': ' + (opts.format ? opts.format(value) : value);
      rect.appendChild(title);
      svg.appendChild(rect);

      /* Every other label when they would otherwise collide. */
      if (values.length <= 14 || i % 2 === 0) {
        var text = svgEl('text', {
          x: padLeft + slot * i + slot / 2, y: height - 8,
          class: 'chart__label', 'text-anchor': 'middle',
        });
        text.textContent = labels[i];
        svg.appendChild(text);
      }
    });

    return svg;
  }

  /** Label, value, and a note underneath when there is something the figure
   *  does not cover. */
  function stat(name, value, note) {
    var box = h('div.card.stat');
    box.appendChild(h('div.stat__value', { text: String(value) }));
    box.appendChild(h('div.stat__label', { text: name }));
    if (note) box.appendChild(h('div.stat__note', { text: note }));
    return box;
  }

  function windowPicker(current, onChange) {
    var select = h('select', { 'aria-label': 'Period' },
      [3, 6, 12, 24].map(function (m) {
        return h('option', { value: String(m), selected: m === current }, 'Last ' + m + ' months');
      }));
    select.addEventListener('change', function () { onChange(Number(select.value)); });
    return select;
  }

  function exportButton(report, months, text) {
    /* A plain link, not a fetch: the browser's own download handling is what
       makes the file land in Downloads with its filename intact. */
    return h('a.btn.btn--sm', {
      href: '/api/admin/analytics/export?report=' + report + '&months=' + months,
      download: '',
    }, text);
  }

  /* ------------------------------------------------------------- sales -- */

  Admin.route('/reports', {
    title: 'Reports',
    subtitle: 'Sales, counted from real orders',
    render: function (mount) {
      var months = 12;
      var host = h('div');
      ui.clear(mount).appendChild(host);

      function load() {
        ui.clear(host).appendChild(ui.skeleton(5));
        return api.get('/api/admin/analytics/sales?months=' + months)
          .then(function (res) {
            var d = res.data;
            ui.clear(host);
            host.appendChild(tabs('sales'));

            var head = h('section.card');
            head.appendChild(h('div.toolbar',
              windowPicker(months, function (m) { months = m; load(); }),
              exportButton('orders', months, 'Export the orders')));
            host.appendChild(head);

            /* Sales, one chart per currency. Adding them would produce a
               number that is not money. */
            if (!d.sales.series.length) {
              var empty = h('section.card');
              empty.appendChild(h('h2.card__title', 'Order value'));
              empty.appendChild(ui.empty('No orders in this period',
                'This is a real zero, not a missing report. Confirm an order and it appears here.'));
              host.appendChild(empty);
            } else {
              d.sales.series.forEach(function (s) {
                var card = h('section.card');
                card.appendChild(h('h2.card__title', 'Order value — ' + s.currency));
                card.appendChild(h('p.card__hint', {
                  text: s.count + ' orders, ' + money(s.total, s.currency) + ' in total. '
                    + 'Currencies are reported separately and are never added together.',
                }));
                card.appendChild(barChart(
                  d.sales.months.map(function (m) { return m.label; }),
                  s.value,
                  { title: 'Order value in ' + s.currency, format: function (v) { return money(v, s.currency); } },
                ));
                host.appendChild(card);
              });
            }

            var funnel = h('section.card');
            funnel.appendChild(h('h2.card__title', 'From enquiry to order'));
            var grid = h('div.grid.grid--stats');
            grid.appendChild(stat('Quote requests', d.funnel.requests));
            grid.appendChild(stat('Quotations sent', d.funnel.quotationsSent));
            grid.appendChild(stat('Accepted', d.funnel.accepted));
            grid.appendChild(stat('Win rate', pct(d.funnel.winRatePercent),
              d.funnel.decided ? 'of ' + d.funnel.decided + ' decided' : 'nothing decided yet'));
            funnel.appendChild(grid);
            funnel.appendChild(h('p.card__hint', { text: d.funnel.note }));
            host.appendChild(funnel);

            var customers = h('section.card');
            customers.appendChild(h('h2.card__title', 'Biggest customers'));
            customers.appendChild(h('p.card__hint',
              'Ranked within each currency. Ranking across them would sort by exchange rate rather than by value.'));
            if (!d.customers.length) {
              customers.appendChild(h('p.muted', { text: 'No orders against a customer account in this period.' }));
            } else {
              var table = h('table.table');
              table.appendChild(h('thead', h('tr',
                h('th', 'Customer'), h('th', 'Country'), h('th', 'Orders'),
                h('th', 'Value'), h('th', 'Outstanding'))));
              var body = h('tbody');
              d.customers.forEach(function (c) {
                body.appendChild(h('tr',
                  h('td', h('a', { href: '#/crm/' + c.id }, c.name)),
                  h('td', c.country || '—'),
                  h('td', String(c.orders)),
                  h('td', money(c.value, c.currency)),
                  h('td', money(c.outstanding, c.currency))));
              });
              table.appendChild(body);
              customers.appendChild(table);
            }
            host.appendChild(customers);
          })
          .catch(function (err) { ui.clear(host).appendChild(ui.errorState(err, load)); });
      }

      return load();
    },
  });

  /* ---------------------------------------------------------- pipeline -- */

  Admin.route('/reports/pipeline', {
    title: 'Pipeline report',
    subtitle: 'Where opportunities are, and where they went',
    render: function (mount) {
      var months = 12;
      var host = h('div');
      ui.clear(mount).appendChild(host);

      function load() {
        ui.clear(host).appendChild(ui.skeleton(4));
        return api.get('/api/admin/analytics/pipeline?months=' + months)
          .then(function (res) {
            var p = res.data.pipeline;
            ui.clear(host);
            host.appendChild(tabs('pipeline'));

            var head = h('section.card');
            head.appendChild(h('div.toolbar', windowPicker(months, function (m) { months = m; load(); })));
            host.appendChild(head);

            var open = h('section.card');
            open.appendChild(h('h2.card__title', 'Open opportunities by stage'));
            var stages = Object.keys(p.openByStage);
            if (!stages.length) {
              open.appendChild(h('p.muted', { text: 'Nothing open. A real zero, not a missing report.' }));
            } else {
              open.appendChild(barChart(
                stages.map(label),
                stages.map(function (s) { return p.openByStage[s]; }),
                { title: 'Open opportunities by stage' },
              ));
            }
            host.appendChild(open);

            var outcome = h('section.card');
            outcome.appendChild(h('h2.card__title', 'Won and lost'));
            var grid = h('div.grid.grid--stats');
            grid.appendChild(stat('Won', p.wonInPeriod));
            grid.appendChild(stat('Lost', p.lostInPeriod));
            grid.appendChild(stat('Win rate', pct(p.winRatePercent),
              p.wonInPeriod + p.lostInPeriod ? 'of those settled' : 'nothing settled yet'));
            grid.appendChild(stat('With no owner', p.unowned, 'open right now'));
            outcome.appendChild(grid);
            outcome.appendChild(h('p.card__hint', { text: p.note }));
            host.appendChild(outcome);

            var sources = h('section.card');
            sources.appendChild(h('h2.card__title', 'Where the won ones came from'));
            if (!p.bySource.length) {
              sources.appendChild(h('p.muted', { text: 'Nothing has closed in this period.' }));
            } else {
              var table = h('table.table');
              table.appendChild(h('thead', h('tr', h('th', 'Source'), h('th', 'Closed'), h('th', 'Won'), h('th', 'Win rate'))));
              var body = h('tbody');
              p.bySource.forEach(function (s) {
                body.appendChild(h('tr',
                  h('td', label(s.source)),
                  h('td', String(s.total)),
                  h('td', String(s.won)),
                  h('td', s.total ? Math.round((s.won / s.total) * 1000) / 10 + '%' : '—')));
              });
              table.appendChild(body);
              sources.appendChild(table);
            }
            host.appendChild(sources);
          })
          .catch(function (err) { ui.clear(host).appendChild(ui.errorState(err, load)); });
      }

      return load();
    },
  });

  /* ----------------------------------------------------------- factory -- */

  Admin.route('/reports/factory', {
    title: 'Factory report',
    subtitle: 'Output, quality and whether it went out on time',
    render: function (mount) {
      var months = 12;
      var host = h('div');
      ui.clear(mount).appendChild(host);

      function load() {
        ui.clear(host).appendChild(ui.skeleton(5));
        return api.get('/api/admin/analytics/factory?months=' + months)
          .then(function (res) {
            var d = res.data;
            ui.clear(host);
            host.appendChild(tabs('factory'));

            var head = h('section.card');
            head.appendChild(h('div.toolbar',
              windowPicker(months, function (m) { months = m; load(); }),
              exportButton('production', months, 'Export the output'),
              exportButton('quality', months, 'Export the inspections')));
            host.appendChild(head);

            var output = h('section.card');
            output.appendChild(h('h2.card__title', 'Units passed'));
            /* The note explains where the figures come from; when there are
               none the chart says so itself, and saying it twice reads as a
               fault rather than as a quiet period. */
            if (d.production.totalGood + d.production.totalRejected > 0) {
              output.appendChild(h('p.card__hint', { text: d.production.note }));
            }
            output.appendChild(barChart(
              d.production.months.map(function (m) { return m.label; }),
              d.production.good,
              { title: 'Units passed by month', empty: 'No production output has been recorded in this period.' },
            ));
            host.appendChild(output);

            var rejects = h('section.card');
            rejects.appendChild(h('h2.card__title', 'Reject rate'));
            rejects.appendChild(h('p.card__hint',
              'Rejected units as a share of everything made. Counted apart from good units, so a run that made its number twice over does not read as a good month.'));
            rejects.appendChild(barChart(
              d.production.months.map(function (m) { return m.label; }),
              d.production.rejectRate,
              {
                title: 'Reject rate by month', warn: true,
                format: function (v) { return (Math.round(v * 10) / 10) + '%'; },
                empty: 'Nothing has been made in this period, so there is no reject rate.',
              },
            ));
            var rejectStats = h('div.grid.grid--stats');
            rejectStats.appendChild(stat('Passed', d.production.totalGood));
            rejectStats.appendChild(stat('Rejected', d.production.totalRejected));
            rejectStats.appendChild(stat('Reject rate', pct(d.production.overallRejectRate)));
            rejects.appendChild(rejectStats);
            host.appendChild(rejects);

            var quality = h('section.card');
            quality.appendChild(h('h2.card__title', 'Inspections'));
            var qGrid = h('div.grid.grid--stats');
            qGrid.appendChild(stat('Completed', d.quality.completed));
            qGrid.appendChild(stat('Passed', d.quality.passed));
            qGrid.appendChild(stat('Failed', d.quality.failed));
            qGrid.appendChild(stat('Let through', d.quality.concessions, 'on a concession'));
            qGrid.appendChild(stat('Pass rate', pct(d.quality.passRatePercent)));
            quality.appendChild(qGrid);
            quality.appendChild(h('p.card__hint', { text: d.quality.note }));

            if (d.quality.failingCheckpoints.length) {
              quality.appendChild(h('h3.card__subtitle', 'What fails most'));
              var table = h('table.table');
              table.appendChild(h('thead', h('tr',
                h('th', 'Checkpoint'), h('th', 'Failures'), h('th', 'Readings'), h('th', 'Fail rate'))));
              var body = h('tbody');
              d.quality.failingCheckpoints.forEach(function (c) {
                body.appendChild(h('tr',
                  h('td', c.name + (c.critical ? ' (critical)' : '')),
                  h('td', String(c.failures)),
                  h('td', String(c.readings)),
                  h('td', c.failRate + '%')));
              });
              table.appendChild(body);
              quality.appendChild(table);
            }
            host.appendChild(quality);

            var delivery = h('section.card');
            delivery.appendChild(h('h2.card__title', 'On time'));
            var dGrid = h('div.grid.grid--stats');
            dGrid.appendChild(stat('On time', d.delivery.onTime));
            dGrid.appendChild(stat('Late', d.delivery.late));
            dGrid.appendChild(stat('On-time rate', pct(d.delivery.onTimePercent),
              d.delivery.measured ? 'of ' + d.delivery.measured + ' measured' : 'nothing measurable'));
            dGrid.appendChild(stat('Could not judge', d.delivery.noPromisedDate, 'no promised date or dispatch'));
            if (d.delivery.averageDaysLate !== null) {
              dGrid.appendChild(stat('Average days late', d.delivery.averageDaysLate, 'when late'));
            }
            delivery.appendChild(dGrid);
            delivery.appendChild(h('p.card__hint', { text: d.delivery.note }));
            host.appendChild(delivery);
          })
          .catch(function (err) { ui.clear(host).appendChild(ui.errorState(err, load)); });
      }

      return load();
    },
  });

  /* -------------------------------------------------------------- tabs -- */

  function tabs(current) {
    var row = h('div.chip-row');
    [
      ['sales', '#/reports', 'Sales'],
      ['pipeline', '#/reports/pipeline', 'Pipeline'],
      ['factory', '#/reports/factory', 'Factory'],
    ].forEach(function (t) {
      row.appendChild(h('a.btn.btn--sm' + (t[0] === current ? '.btn--accent' : ''), { href: t[1] }, t[2]));
    });
    return row;
  }
})();
